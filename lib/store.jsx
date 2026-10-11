"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

/*
 * Client-side kitchen store (pool, favorites, last viewed recipe).
 *
 * State lives in a module-level external store backed by localStorage and is
 * read with useSyncExternalStore. During SSR and hydration React uses the
 * server snapshot (empty, ready: false), then switches to the real snapshot,
 * so there is no hydration mismatch and no setState-in-effect.
 */

const POOL_KEY = "mob-recipes:pool";
const FAVORITES_KEY = "mob-recipes:favorites";
const LAST_RECIPE_KEY = "mob-recipes:last-recipe";

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
 * Favorites are stored as [[slug, addedAt], ...] in insertion order.
 * Legacy format was a plain array of slugs (oldest first). Legacy entries get
 * synthetic, strictly increasing timestamps ending just before the migration
 * time, so their relative order is preserved when sorting by addedAt.
 */
function loadFavorites() {
  const data = readJSON(FAVORITES_KEY);
  const map = new Map();
  if (!Array.isArray(data)) return { map, migrated: false };
  const migratedAt = Date.now();
  let migrated = false;
  data.forEach((entry, i) => {
    if (typeof entry === "string") {
      migrated = true;
      map.set(entry, migratedAt - (data.length - i));
    } else if (
      Array.isArray(entry) &&
      typeof entry[0] === "string" &&
      Number.isFinite(entry[1])
    ) {
      map.set(entry[0], entry[1]);
    }
  });
  return { map, migrated };
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

function readAll() {
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

export function KitchenProvider({ children }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
