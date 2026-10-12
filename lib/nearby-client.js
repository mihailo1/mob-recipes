"use client";

import { useSyncExternalStore } from "react";

// Client state for the "open the recipe from your other device" chip.
// components/NearbySync.jsx talks to /api/nearby and writes here; the recipe
// page reports what is open; components/ResumeChip.jsx reads the suggestion.

const DEVICE_KEY = "mob-recipes:device-id";

let state = { current: null, suggestion: null, dismissed: null };
const listeners = new Set();

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const nearbyStore = {
  get: () => state,
  subscribe,
  set,
};

/** The recipe page calls this on mount (slug) and unmount (null). */
export function setCurrentRecipe(slug) {
  if (state.current !== slug) set({ current: slug });
}

/** Hides the offered recipe until another device opens a different one. */
export function dismissSuggestion() {
  if (state.suggestion) set({ dismissed: state.suggestion, suggestion: null });
}

/** Slug of a recipe open on another device nearby, or null. */
export function useNearbySuggestion() {
  return useSyncExternalStore(
    subscribe,
    () => state.suggestion,
    () => null,
  );
}

let memoryId = null;
function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A random id for this device, kept in localStorage. */
export function deviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) {
      id = randomId();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    memoryId = memoryId || randomId();
    return memoryId;
  }
}
