"use client";

import { useSyncExternalStore } from "react";

/*
 * Tiny shared store for in-app notices, so at most one is on screen.
 * Priority: update prompt > what's new > new recipes.
 *
 * - update: { worker, version } while a new service worker waits and the
 *   user has not chosen "Later" this session. Set by components/SWRegister.
 * - whatsNew: true while the What's new card is showing.
 */

const SERVER = Object.freeze({ update: null, whatsNew: false });
let state = SERVER;
const listeners = new Set();

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setNotice(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useNotices() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}

let updateAccepted = false;
const LATER_KEY = "mob-recipes:update-later";

/** True once the user tapped "Update" in this page (guards the reload). */
export function isUpdateAccepted() {
  return updateAccepted;
}

/** User tapped "Update": let the waiting worker take over. */
export function acceptUpdate() {
  const worker = state.update?.worker;
  if (!worker) return false;
  updateAccepted = true;
  worker.postMessage({ type: "SKIP_WAITING" });
  return true;
}

/** User tapped "Later": hide until the next app open (new session). */
export function postponeUpdate() {
  try {
    window.sessionStorage.setItem(LATER_KEY, state.update?.version || "?");
  } catch {
    // ignore
  }
  setNotice({ update: null });
}

export function wasPostponed(version) {
  try {
    return window.sessionStorage.getItem(LATER_KEY) === (version || "?");
  } catch {
    return false;
  }
}
