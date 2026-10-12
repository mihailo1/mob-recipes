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
  FOLDERS_KEY,
  LAST_RECIPE_KEY,
  POOL_KEY,
  SCHEMA_KEY,
  normalizeFavorites,
  normalizeFolders,
  rescueUnreadable,
  runMigrations,
} from "./storage-migrations.mjs";
import * as F from "./folders.mjs";
import { importShare } from "./share.mjs";

export { FOLDER_COLORS, FOLDER_EMOJIS } from "./folders.mjs";

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

const NO_FOLDERS = Object.freeze([]);

const SERVER_STATE = Object.freeze({
  pool: new Set(),
  // Map slug -> addedAt (ms since epoch)
  favorites: new Map(),
  folders: NO_FOLDERS,
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

/*
 * Folders live under their own key as { v: 1, folders: [...] } (see
 * normalizeFolders). The parsed result is cached by raw string so unchanged
 * storage keeps the same array reference between reads (stable renders).
 * Loading never writes: only a user action saves folders, and a raw copy is
 * kept under ":unreadable" first whenever normalization would change data.
 */
let foldersCache = { raw: undefined, folders: NO_FOLDERS };

function loadFolders() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(FOLDERS_KEY);
  } catch {
    return foldersCache.folders;
  }
  if (raw === foldersCache.raw) return foldersCache.folders;
  let folders = NO_FOLDERS;
  if (raw !== null) {
    try {
      const norm = normalizeFolders(JSON.parse(raw), Date.now());
      if (norm && norm.folders.length) folders = F.foldersFromDoc(norm.folders);
    } catch {
      // unparsable: start empty, raw copy was rescued by migrateOnce
    }
  }
  foldersCache = { raw, folders };
  return folders;
}

function saveFolders(folders) {
  const doc = F.foldersToDoc(folders);
  writeJSON(FOLDERS_KEY, doc);
  try {
    foldersCache = { raw: window.localStorage.getItem(FOLDERS_KEY), folders };
  } catch {
    foldersCache = { raw: undefined, folders };
  }
}

// A folders value the app cannot take over 1:1 (bad JSON, newer doc version,
// or content normalization would drop) is copied to ":unreadable" first.
function foldersFullyReadable(value) {
  const norm = normalizeFolders(value, 0);
  return !!norm && !norm.changed;
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
    rescueUnreadable(storage, FOLDERS_KEY, foldersFullyReadable);
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
    folders: loadFolders(),
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
      e.key === FOLDERS_KEY ||
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

/*
 * Commits a { favorites, folders } result of a pure reducer. Writes only the
 * keys that changed. Order guards against partial writes: when adding to a
 * folder the favorite is saved first (a folder never references a missing
 * favorite); when un-favoriting the folders are saved first.
 */
function commit(next, { foldersFirst = false } = {}) {
  const cur = getSnapshot();
  const favChanged = next.favorites !== cur.favorites;
  const foldersChanged = next.folders !== cur.folders;
  if (!favChanged && !foldersChanged) return;
  if (foldersFirst && foldersChanged) saveFolders(next.folders);
  if (favChanged) saveFavorites(next.favorites);
  if (!foldersFirst && foldersChanged) saveFolders(next.folders);
  state = { ...cur, favorites: next.favorites, folders: next.folders };
  emit();
}

function currentData() {
  const { favorites, folders } = getSnapshot();
  return { favorites, folders };
}

/*
 * Favoriting returns null. Un-favoriting also removes the slug from every
 * folder and returns an undo snapshot for restoreFavorite():
 * { slug, addedAt, folderItems: [[folderId, addedAt], ...] }.
 */
function toggleFavorite(slug) {
  const data = currentData();
  if (data.favorites.has(slug)) {
    const { snapshot, ...next } = F.unfavorite(data, slug);
    commit(next, { foldersFirst: true });
    return snapshot;
  }
  commit(F.favorite(data, slug));
  return null;
}

function restoreFavorite(snapshot) {
  commit(F.restoreFavorite(currentData(), snapshot));
}

// Returns the new folder id, or null when the 50 folder cap is reached.
function createFolder(input) {
  const data = currentData();
  const { folders, id } = F.createFolder(data.folders, input);
  commit({ favorites: data.favorites, folders });
  return id;
}

function updateFolder(id, patch) {
  const data = currentData();
  commit({ favorites: data.favorites, folders: F.updateFolder(data.folders, id, patch) });
}

// Recipes stay in favorites.
function deleteFolder(id) {
  const data = currentData();
  commit({ favorites: data.favorites, folders: F.deleteFolder(data.folders, id) });
}

function moveFolder(id, toIndex) {
  const data = currentData();
  commit({ favorites: data.favorites, folders: F.moveFolder(data.folders, id, toIndex) });
}

// Adding also favorites the recipe when needed; removing touches that folder only.
// Returns false when an add was refused (unknown folder, or folder is full).
function setRecipeInFolder(slug, folderId, inFolder) {
  const next = F.setRecipeInFolder(currentData(), slug, folderId, !!inFolder);
  commit(next);
  if (!inFolder) return true;
  return !!next.folders.find((f) => f.id === folderId)?.items.some((i) => i.slug === slug);
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

/*
 * Adds a shared folder link's doc (see lib/share.mjs) to Saved. Returns
 * { folderIds, newRecipes }.
 */
function importShared(doc) {
  const { folderIds, newRecipes, ...next } = importShare(currentData(), doc);
  commit(next);
  return { folderIds, newRecipes };
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const sameMap = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
// Folder content and order; updatedAt is bookkeeping and does not count.
const sameFolders = (a, b) =>
  a.length === b.length &&
  a.every((f, i) => {
    const g = b[i];
    return (
      f.id === g.id &&
      f.name === g.name &&
      f.emoji === g.emoji &&
      f.color === g.color &&
      f.items.length === g.items.length &&
      f.items.every((it, j) => it.slug === g.items[j].slug && it.addedAt === g.items[j].addedAt)
    );
  });

/*
 * Replaces pool, favorites and folders with what device sync merged (see
 * components/SyncEngine.jsx). Only parts that really differ are written, so
 * unchanged parts keep their references and nothing re-renders for nothing.
 */
function replaceData(next) {
  const cur = getSnapshot();
  const patch = {};
  if (!sameSet(cur.pool, next.pool)) {
    writeJSON(POOL_KEY, [...next.pool]);
    patch.pool = next.pool;
  }
  if (!sameMap(cur.favorites, next.favorites)) {
    saveFavorites(next.favorites);
    patch.favorites = next.favorites;
  }
  if (!sameFolders(cur.folders, next.folders)) {
    saveFolders(next.folders);
    patch.folders = next.folders.length ? next.folders : NO_FOLDERS;
  }
  if (!Object.keys(patch).length) return false;
  state = { ...cur, ...patch };
  emit();
  return true;
}

/** Raw access for device sync, outside React. */
export const kitchenStore = {
  get: getSnapshot,
  subscribe,
  replaceData,
};

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

  const foldersForRecipe = useCallback(
    (slug) => F.foldersForRecipe(snap.folders, slug),
    [snap.folders],
  );

  const value = useMemo(
    () => ({
      pool: snap.pool,
      favorites: snap.favorites,
      folders: snap.folders,
      favoriteAddedAt,
      foldersForRecipe,
      lastRecipe: snap.lastRecipe,
      ready: snap.ready,
      togglePool,
      toggleFavorite,
      restoreFavorite,
      createFolder,
      updateFolder,
      deleteFolder,
      moveFolder,
      setRecipeInFolder,
      importShared,
      clearPool,
      setLastRecipe,
      clearLastRecipe,
    }),
    [snap, favoriteAddedAt, foldersForRecipe],
  );

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>;
}

export function useKitchen() {
  const ctx = useContext(KitchenContext);
  if (!ctx) throw new Error("useKitchen must be used inside KitchenProvider");
  return ctx;
}
