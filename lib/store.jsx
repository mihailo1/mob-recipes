"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  FAVORITES_KEY,
  LAST_RECIPE_KEY,
  POOL_KEY,
  SCHEMA_KEY,
  normalizeFavorites,
  rescueUnreadable,
  runMigrations,
} from "./storage-migrations.mjs";

/*
 * Client-side kitchen store (pool, favorites, last viewed recipe).
 *
 * State lives in a module-level external store backed by localStorage and is
 * read with useSyncExternalStore. During SSR and hydration React uses the
 * server snapshot (empty, ready: false), then switches to the real snapshot,
 * so there is no hydration mismatch and no setState-in-effect.
 *
 * Before the first read, storage is brought to the current schema by
 * lib/storage-migrations.mjs (backup first, never drops unparsable data).
 */

const KitchenContext = createContext(null);

const SERVER_STATE = Object.freeze({
  pool: new Set(),
  // Map slug -> addedAt (ms since epoch)
  favorites: new Map(),
  lastRecipe: null,
  ready: false,
});

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode etc), fail silently
  }
}

function loadPool() {
  const data = readJSON(POOL_KEY);
  return new Set(Array.isArray(data) ? data.filter((s) => typeof s === "string") : []);
}

/*
 * Favorites are stored as [[slug, addedAt], ...] in insertion order. The
 * legacy plain slug array is converted by the schema migration; normalizing
 * here as well keeps the store safe if another tab of an old build writes the
 * legacy shape again.
 */
function loadFavorites() {
  const data = readJSON(FAVORITES_KEY);
  const norm = normalizeFavorites(data, Date.now());
  if (!norm) return { map: new Map(), migrated: false };
  return { map: new Map(norm.entries), migrated: norm.changed };
}

function loadLastRecipe() {
  const data = readJSON(LAST_RECIPE_KEY);
  if (data && typeof data.slug === "string" && typeof data.name === "string") {
    return {
      slug: data.slug,
      name: data.name,
      image: typeof data.image === "string" ? data.image : "",
    };
  }
  return null;
}

let state = null;
const listeners = new Set();

function saveFavorites(map) {
  writeJSON(FAVORITES_KEY, [...map]);
}

let migrationsDone = false;
function migrateOnce() {
  if (migrationsDone) return;
  migrationsDone = true;
  try {
    const storage = window.localStorage;
    runMigrations(storage);
    // Anything the app cannot read gets a raw copy before it can be overwritten.
    rescueUnreadable(storage, FAVORITES_KEY, Array.isArray);
    rescueUnreadable(storage, POOL_KEY, Array.isArray);
    rescueUnreadable(storage, LAST_RECIPE_KEY, (v) => typeof v === "object");
  } catch {
    // storage unavailable: nothing to migrate
  }
}

function readAll() {
  migrateOnce();
  const { map, migrated } = loadFavorites();
  if (migrated) saveFavorites(map);
  return {
    pool: loadPool(),
    favorites: map,
    lastRecipe: loadLastRecipe(),
    ready: true,
  };
}

function getSnapshot() {
  if (!state) state = readAll();
  return state;
}

function getServerSnapshot() {
  return SERVER_STATE;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (e) => {
    if (
      e.key === null ||
      e.key === SCHEMA_KEY ||
      e.key === POOL_KEY ||
      e.key === FAVORITES_KEY ||
      e.key === LAST_RECIPE_KEY
    ) {
      state = readAll();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function togglePool(slug) {
  const next = new Set(getSnapshot().pool);
  next.has(slug) ? next.delete(slug) : next.add(slug);
  writeJSON(POOL_KEY, [...next]);
  state = { ...getSnapshot(), pool: next };
  emit();
}

function clearPool() {
  writeJSON(POOL_KEY, []);
  state = { ...getSnapshot(), pool: new Set() };
  emit();
}

function toggleFavorite(slug) {
  const next = new Map(getSnapshot().favorites);
  if (next.has(slug)) next.delete(slug);
  else next.set(slug, Date.now());
  saveFavorites(next);
  state = { ...getSnapshot(), favorites: next };
  emit();
}

function setLastRecipe(recipe) {
  const prev = getSnapshot().lastRecipe;
  const next = recipe
    ? { slug: recipe.slug, name: recipe.name, image: recipe.image || "" }
    : null;
  if (
    prev === next ||
    (prev &&
      next &&
      prev.slug === next.slug &&
      prev.name === next.name &&
      prev.image === next.image)
  ) {
    return;
  }
  writeJSON(LAST_RECIPE_KEY, next);
  state = { ...getSnapshot(), lastRecipe: next };
  emit();
}

function clearLastRecipe() {
  setLastRecipe(null);
}

let persistAsked = false;
// Best effort: ask the browser not to evict our storage under pressure.
// Skipped on Firefox, where persist() shows a permission prompt.
function requestPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    const storage = navigator.storage;
    if (!storage?.persist || /firefox/i.test(navigator.userAgent)) return;
    Promise.resolve(storage.persisted?.())
      .then((already) => (already ? true : storage.persist()))
      .catch(() => {});
  } catch {
    // ignore
  }
}

export function KitchenProvider({ children }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(requestPersistentStorage, []);

  const favoriteAddedAt = useCallback(
    (slug) => snap.favorites.get(slug) ?? null,
    [snap.favorites],
  );

  const value = useMemo(
    () => ({
      pool: snap.pool,
      favorites: snap.favorites,
      favoriteAddedAt,
      lastRecipe: snap.lastRecipe,
      ready: snap.ready,
      togglePool,
      toggleFavorite,
      clearPool,
      setLastRecipe,
      clearLastRecipe,
    }),
    [snap, favoriteAddedAt],
  );

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const ctx = useContext(KitchenContext);
  if (!ctx) throw new Error("useKitchen must be used inside KitchenProvider");
  return ctx;
}
