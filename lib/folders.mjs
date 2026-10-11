/*
 * Pure folder logic (no React, no window, no storage) so it can be unit tested
 * in plain Node by scripts/test-store-migration.mjs. lib/store.jsx wraps these
 * with persistence.
 *
 * Runtime folder shape:
 *   { id, name, emoji, color, createdAt, updatedAt, items: [{ slug, addedAt }] }
 * `folders` is an array in display order. Items are newest first, no duplicate
 * slugs. All reducers are immutable and return the SAME reference when nothing
 * changed, so React consumers keep stable references.
 *
 * `favorites` is a Map slug -> addedAt, as in the store.
 */

import {
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_EMOJI,
  DEFAULT_FOLDER_NAME,
  FOLDERS_DOC_VERSION,
  MAX_FOLDERS,
  MAX_FOLDER_ITEMS,
  MAX_FOLDER_NAME,
} from "./storage-migrations.mjs";

// Warm palette for the terracotta / cream UI (accent #d4451f, bg #fafaf6).
export const FOLDER_COLORS = [
  DEFAULT_FOLDER_COLOR, // terracotta
  "#e08a2c", // saffron
  "#c9a227", // mustard
  "#7a9a3a", // olive
  "#3f8f6b", // herb green
  "#3d7f94", // teal
  "#8a5a9e", // plum
  "#b0455f", // beetroot
];

export const FOLDER_EMOJIS = [
  "\u{1F4C1}", // folder
  "\u{1F35D}", // spaghetti
  "\u{1F355}", // pizza
  "\u{1F957}", // salad
  "\u{1F372}", // pot of food
  "\u{1F35C}", // ramen
  "\u{1F32E}", // taco
  "\u{1F354}", // burger
  "\u{1F969}", // steak
  "\u{1F357}", // chicken leg
  "\u{1F41F}", // fish
  "\u{1F364}", // shrimp
  "\u{1F955}", // carrot
  "\u{1F336}️", // chilli
  "\u{1F9C0}", // cheese
  "\u{1F95A}", // egg
  "\u{1F35E}", // bread
  "\u{1F967}", // pie
  "\u{1F370}", // cake
  "\u{1F36A}", // cookie
  "\u{1F34E}", // apple
  "\u{1F34B}", // lemon
  "\u{1F951}", // avocado
  "\u{1F37D}️", // plate
];

export function makeFolderId(existing = new Set()) {
  for (let i = 0; i < 20; i++) {
    let id = "";
    const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (c && c.getRandomValues) {
      const buf = new Uint32Array(2);
      c.getRandomValues(buf);
      id = buf[0].toString(36) + buf[1].toString(36);
    } else {
      id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    id = id.slice(0, 8);
    if (id && !existing.has(id)) return id;
  }
  return "f" + Date.now().toString(36);
}

/** Stored doc ([[slug, ts]] items) -> runtime folders. */
export function foldersFromDoc(docFolders) {
  return docFolders.map((f) => ({
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    color: f.color,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    items: f.items.map(([slug, addedAt]) => ({ slug, addedAt })),
  }));
}

/** Runtime folders -> the JSON document written to localStorage. */
export function foldersToDoc(folders) {
  return {
    v: FOLDERS_DOC_VERSION,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      emoji: f.emoji,
      color: f.color,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      items: f.items.map((i) => [i.slug, i.addedAt]),
    })),
  };
}

function cleanName(name, fallback) {
  if (typeof name !== "string") return fallback;
  const t = name.trim().slice(0, MAX_FOLDER_NAME).trim();
  return t || fallback;
}

function cleanEmoji(emoji, fallback) {
  return typeof emoji === "string" && emoji && emoji.length <= 16 ? emoji : fallback;
}

function cleanColor(color, fallback) {
  return typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}

/**
 * Prepends a new folder (newest first). Returns { folders, id }.
 * `id` is null (folders unchanged) when the 50 folder cap is reached.
 */
export function createFolder(folders, input = {}, now = Date.now(), id) {
  if (folders.length >= MAX_FOLDERS) return { folders, id: null };
  const newId = id || makeFolderId(new Set(folders.map((f) => f.id)));
  const folder = {
    id: newId,
    name: cleanName(input.name, DEFAULT_FOLDER_NAME),
    emoji: cleanEmoji(input.emoji, DEFAULT_FOLDER_EMOJI),
    color: cleanColor(input.color, FOLDER_COLORS[0]),
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  return { folders: [folder, ...folders], id: newId };
}

/** Patch { name?, emoji?, color? }. Invalid values are ignored. */
export function updateFolder(folders, id, patch = {}, now = Date.now()) {
  const idx = folders.findIndex((f) => f.id === id);
  if (idx < 0) return folders;
  const f = folders[idx];
  const next = {
    ...f,
    name: patch.name === undefined ? f.name : cleanName(patch.name, f.name),
    emoji: patch.emoji === undefined ? f.emoji : cleanEmoji(patch.emoji, f.emoji),
    color: patch.color === undefined ? f.color : cleanColor(patch.color, f.color),
  };
  if (next.name === f.name && next.emoji === f.emoji && next.color === f.color) return folders;
  next.updatedAt = now;
  const out = folders.slice();
  out[idx] = next;
  return out;
}

export function deleteFolder(folders, id) {
  return folders.some((f) => f.id === id) ? folders.filter((f) => f.id !== id) : folders;
}

/** Moves a folder to `toIndex` (clamped) in the display order. */
export function moveFolder(folders, id, toIndex) {
  const from = folders.findIndex((f) => f.id === id);
  if (from < 0 || !Number.isFinite(toIndex)) return folders;
  const to = Math.max(0, Math.min(folders.length - 1, Math.trunc(toIndex)));
  if (to === from) return folders;
  const out = folders.slice();
  const [f] = out.splice(from, 1);
  out.splice(to, 0, f);
  return out;
}

/** Folder ids that contain the slug. */
export function foldersForRecipe(folders, slug) {
  return folders.filter((f) => f.items.some((i) => i.slug === slug)).map((f) => f.id);
}

// Inserts keeping items newest first (descending addedAt). On equal
// timestamps the new item goes before the existing ones.
function insertItem(items, item) {
  let i = 0;
  while (i < items.length && items[i].addedAt > item.addedAt) i++;
  const out = items.slice();
  out.splice(i, 0, item);
  return out;
}

// Inserts into favorites keeping ascending addedAt order (the store appends
// new favorites, so a restored one goes back to its original place).
function insertFavorite(favorites, slug, addedAt) {
  const entries = [...favorites];
  let i = entries.length;
  while (i > 0 && entries[i - 1][1] > addedAt) i--;
  entries.splice(i, 0, [slug, addedAt]);
  return new Map(entries);
}

/**
 * Adds/removes `slug` in one folder. Adding also makes sure the slug is a
 * favorite (added with `now` when missing). Removing touches that folder only.
 * Unknown folder: no-op (nothing is favorited either).
 * State in/out: { favorites, folders }.
 */
export function setRecipeInFolder(state, slug, folderId, inFolder, now = Date.now()) {
  const { favorites, folders } = state;
  const idx = folders.findIndex((f) => f.id === folderId);
  if (idx < 0 || typeof slug !== "string" || !slug) return state;
  const folder = folders[idx];
  const has = folder.items.some((i) => i.slug === slug);

  if (!inFolder) {
    if (!has) return state;
    const out = folders.slice();
    out[idx] = {
      ...folder,
      items: folder.items.filter((i) => i.slug !== slug),
      updatedAt: now,
    };
    return { favorites, folders: out };
  }

  if (!has && folder.items.length >= MAX_FOLDER_ITEMS) return state;
  const nextFavorites = favorites.has(slug) ? favorites : insertFavorite(favorites, slug, now);
  if (has) return nextFavorites === favorites ? state : { favorites: nextFavorites, folders };
  const out = folders.slice();
  out[idx] = {
    ...folder,
    items: insertItem(folder.items, { slug, addedAt: now }),
    updatedAt: now,
  };
  return { favorites: nextFavorites, folders: out };
}

/**
 * Un-favorites a slug and removes it from every folder.
 * Returns { favorites, folders, snapshot } where snapshot is
 * { slug, addedAt, folderItems: [[folderId, addedAt], ...] } or null when the
 * slug was not a favorite (state untouched).
 */
export function unfavorite(state, slug, now = Date.now()) {
  const { favorites, folders } = state;
  if (!favorites.has(slug)) return { ...state, snapshot: null };
  const nextFavorites = new Map(favorites);
  nextFavorites.delete(slug);
  const folderItems = [];
  const nextFolders = folders.map((f) => {
    const item = f.items.find((i) => i.slug === slug);
    if (!item) return f;
    folderItems.push([f.id, item.addedAt]);
    return { ...f, items: f.items.filter((i) => i.slug !== slug), updatedAt: now };
  });
  return {
    favorites: nextFavorites,
    folders: folderItems.length ? nextFolders : folders,
    snapshot: { slug, addedAt: favorites.get(slug), folderItems },
  };
}

/** Marks a slug as favorite with `now`. */
export function favorite(state, slug, now = Date.now()) {
  if (state.favorites.has(slug)) return state;
  return { ...state, favorites: insertFavorite(state.favorites, slug, now) };
}

/**
 * Undo for unfavorite(): restores the favorite with its original addedAt and
 * re-inserts into the folders (that still exist) at the position given by the
 * original addedAt. A slug that is already a favorite again keeps its time.
 */
export function restoreFavorite(state, snapshot, now = Date.now()) {
  if (
    !snapshot ||
    typeof snapshot.slug !== "string" ||
    !snapshot.slug ||
    !Number.isFinite(snapshot.addedAt)
  ) {
    return state;
  }
  const { slug } = snapshot;
  const favorites = state.favorites.has(slug)
    ? state.favorites
    : insertFavorite(state.favorites, slug, snapshot.addedAt);
  let folders = state.folders;
  for (const [folderId, addedAt] of Array.isArray(snapshot.folderItems)
    ? snapshot.folderItems
    : []) {
    const idx = folders.findIndex((f) => f.id === folderId);
    if (idx < 0 || !Number.isFinite(addedAt)) continue;
    const f = folders[idx];
    if (f.items.some((i) => i.slug === slug) || f.items.length >= MAX_FOLDER_ITEMS) continue;
    if (folders === state.folders) folders = folders.slice();
    folders[idx] = { ...f, items: insertItem(f.items, { slug, addedAt }), updatedAt: now };
  }
  if (favorites === state.favorites && folders === state.folders) return state;
  return { favorites, folders };
}
