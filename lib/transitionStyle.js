"use client";

import { useSyncExternalStore } from "react";

/*
 * How pages change, picked on this device (a trial: the card in My kitchen
 * lets you try each one; the winner stays, the rest go).
 *
 * - "native": like iPhone apps. Tabs switch at once, a recipe slides in from
 *   the right over the list and slides back out to the right.
 * - "photo": the page changes at once and only the photo flies from the card
 *   into the recipe and back.
 * - "fade": the new page quickly fades in over the old one.
 *
 * The choice sits on <html data-vt="...">; app/globals.css has the animations
 * for each. components/PhotoMorph.jsx names photos only in "photo".
 */

export const TRANSITION_STYLES = [
  { id: "native", label: "Slide", hint: "Like iPhone apps: a recipe slides in from the right, tabs switch at once." },
  { id: "photo", label: "Photo", hint: "Only the photo flies from the card into the recipe and back." },
  { id: "fade", label: "Fade", hint: "The new page quickly fades in over the old one." },
];
const DEFAULT_STYLE = "native";
const KEY = "mob-recipes:transitions";
const isStyle = (v) => TRANSITION_STYLES.some((s) => s.id === v);

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return isStyle(v) ? v : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

let current = typeof window === "undefined" ? DEFAULT_STYLE : read();
const listeners = new Set();

function apply() {
  document.documentElement.dataset.vt = current;
}
if (typeof document !== "undefined") apply();

export function setTransitionStyle(style) {
  if (!isStyle(style) || style === current) return;
  current = style;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // private mode: the choice lasts until the app closes
  }
  apply();
  listeners.forEach((l) => l());
}

export function useTransitionStyle() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULT_STYLE,
  );
}
