"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useKitchen } from "../lib/store";
import { useRecipeIndex } from "../lib/queries";
import { photoUrls } from "./RecipeImage";

/*
 * Keeps every recipe in Saved and My kitchen ready for offline use (in a shop
 * with no signal, on a plane). A few seconds after the lists change, the app
 * sends the service worker the pages, recipe JSON and photos to keep, and the
 * worker downloads what it does not have yet (public/sw.js, KEEP_OFFLINE).
 *
 * It also asks the browser to keep this app's storage (Storage API
 * persist()), so Saved, folders and the kept recipes are not cleared when the
 * device runs low on space. Browsers decide on their own; an installed app
 * usually gets it.
 */

const DELAY_MS = 4000;

// Latest worker report: { pages, photos, wanted } or null.
let status = null;
const listeners = new Set();
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** How many saved recipes are ready offline: { ready, total } or null. */
export function useOfflineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => null,
  );
}

async function persistStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // not supported
  }
}

export default function OfflineKeeper() {
  const { pool, favorites, ready } = useKitchen();
  const { data: index } = useRecipeIndex();

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return undefined;
    const onMessage = (e) => {
      if (e.data?.type !== "OFFLINE_STATUS") return;
      // Each recipe is a page and its JSON.
      status = { ready: Math.floor(e.data.pages / 2), total: Math.floor(e.data.wanted / 2) };
      listeners.forEach((l) => l());
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || !index) return undefined;
    const slugs = new Set([...favorites.keys(), ...pool]);
    const timer = window.setTimeout(() => {
      if (slugs.size) persistStorage();
      const worker = navigator.serviceWorker?.controller;
      if (!worker || !navigator.onLine) return;
      const bySlug = new Map(index.map((r) => [r.slug, r]));
      const screen = { width: window.innerWidth, dpr: window.devicePixelRatio || 1 };
      const pages = [];
      const photos = [];
      for (const slug of slugs) {
        const recipe = bySlug.get(slug);
        if (!recipe) continue;
        const enc = encodeURIComponent(slug);
        pages.push(`/recipes/${enc}`, `/api/recipe/${enc}`);
        if (recipe.image) {
          const urls = photoUrls(recipe.image, screen);
          photos.push(urls.card, urls.hero);
          if (pool.has(slug)) photos.push(urls.thumb);
        }
      }
      worker.postMessage({ type: "KEEP_OFFLINE", pages, photos: [...new Set(photos)] });
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, index, favorites, pool]);

  return null;
}

/** One line under Saved: how many recipes open without a connection. */
export function OfflineNote() {
  const s = useOfflineStatus();
  if (!s?.total) return null;
  return (
    <p className="offline-note" role="status">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
      {s.ready >= s.total
        ? `${s.total === 1 ? "Your recipe opens" : `All ${s.total} recipes open`} without internet too.`
        : `Keeping recipes for offline: ${s.ready} of ${s.total}…`}
    </p>
  );
}
