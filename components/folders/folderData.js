"use client";

import { useMemo } from "react";

/*
 * Small derived-data helpers shared by the folder UI.
 *
 * Folder items are not pruned against favorites by the store (an older build
 * could un-favorite a slug that stays in a folder), so everything here only
 * counts and shows items that are currently saved.
 */

export const NO_FOLDERS = Object.freeze([]);
const EMPTY_MAP = new Map();
const COVER_MAX = 4;

/** slug -> recipe for the search index (cached per index array). */
const mapCache = new WeakMap();
export function useRecipeMap(index) {
  return useMemo(() => {
    if (!index) return EMPTY_MAP;
    let hit = mapCache.get(index);
    if (!hit) {
      hit = new Map(index.map((r) => [r.slug, r]));
      mapCache.set(index, hit);
    }
    return hit;
  }, [index]);
}

/**
 * Items of `folder` that are saved and known to the index (newest first).
 * While the index is still loading, only the favorites check applies.
 */
export function liveItems(folder, favorites, recipeMap) {
  const known = recipeMap && recipeMap.size > 0;
  return folder.items.filter(
    (it) => favorites.has(it.slug) && (!known || recipeMap.has(it.slug)),
  );
}

/** Up to 4 image urls for a mosaic, from slugs newest first. */
export function coverImages(slugs, recipeMap, max = COVER_MAX) {
  const out = [];
  for (const slug of slugs) {
    const img = recipeMap.get(slug)?.image;
    if (img) out.push(img);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * id -> { count, images } for every folder, plus the "All saved" summary.
 * Recomputed only when folders, favorites or the index change.
 */
export function useFolderSummaries(folders, favorites, recipeMap) {
  return useMemo(() => {
    const byId = new Map();
    for (const f of folders) {
      const items = liveItems(f, favorites, recipeMap);
      byId.set(f.id, {
        count: items.length,
        images: coverImages(
          items.map((it) => it.slug),
          recipeMap,
        ),
      });
    }
    // All saved: newest favorites first.
    const known = recipeMap.size > 0;
    const allSlugs = [...favorites]
      .filter(([slug]) => !known || recipeMap.has(slug))
      .sort((a, b) => b[1] - a[1])
      .map(([slug]) => slug);
    const all = { count: allSlugs.length, images: coverImages(allSlugs, recipeMap) };
    return { byId, all };
  }, [folders, favorites, recipeMap]);
}

/** Folders (in display order) that contain this saved recipe. */
export function useFoldersFor(folders, favorites, slug) {
  return useMemo(() => {
    if (!slug || !favorites.has(slug)) return NO_FOLDERS;
    return folders.filter((f) => f.items.some((it) => it.slug === slug));
  }, [folders, favorites, slug]);
}

export const recipesLabel = (n) =>
  `${n.toLocaleString()} ${n === 1 ? "recipe" : "recipes"}`;

/** Light tap feedback (lib/haptics.js), also on iPhone. */
export { haptic as tick } from "../../lib/haptics";
