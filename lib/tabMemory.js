"use client";

import { useSyncExternalStore } from "react";
import { TAB_PATHS } from "./transitions";

/*
 * Where each tab was left, so coming back lands on the same screen.
 *
 * - For every tab (Discover, My kitchen, Saved) the last full URL seen on it:
 *   path plus query (Discover filters, the open Saved folder and its filters).
 *   The tab bar links there, so switching tabs keeps each tab's place.
 * - The last tab page seen at all: the recipe page's back link returns there
 *   instead of always to Discover.
 *
 * Written by components/TabMemory.jsx on every URL change. Lives in
 * sessionStorage (this browser tab only), so a fresh start begins at the top.
 * Scroll positions and loaded pages are kept per list by useListRestoration.
 */

const STORAGE_KEY = "mob-recipes:tab-urls";
const listeners = new Set();

function readAll() {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// Only same-tab paths are accepted, so a stored value can never point elsewhere.
function validFor(path, url) {
  return typeof url === "string" && (url === path || url.startsWith(`${path}?`));
}

function tabOf(url) {
  if (typeof url !== "string") return null;
  const path = url.split("?")[0];
  return TAB_PATHS.includes(path) && validFor(path, url) ? path : null;
}

/** Record `pathname` + `search` (no "?") if it is a tab page. */
export function rememberTabUrl(pathname, search) {
  if (!TAB_PATHS.includes(pathname)) return;
  const url = search ? `${pathname}?${search}` : pathname;
  const all = readAll();
  if (all[pathname] === url && all.last === url) return;
  all[pathname] = url;
  all.last = url;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: links fall back to the bare tab paths
  }
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Last URL seen on the tab at `path`, or `path` itself. */
export function useTabHref(path) {
  return useSyncExternalStore(
    subscribe,
    () => {
      const url = readAll()[path];
      return validFor(path, url) ? url : path;
    },
    () => path,
  );
}

/** Last tab page seen (full URL), or "/" (Discover). */
export function useBackHref() {
  return useSyncExternalStore(
    subscribe,
    () => {
      const url = readAll().last;
      return tabOf(url) ? url : "/";
    },
    () => "/",
  );
}

export const BACK_LABELS = {
  "/": "Back to search",
  "/pool": "Back to My kitchen",
  "/favorites": "Back to Saved",
};

export const backLabel = (href) => BACK_LABELS[tabOf(href) || "/"];
