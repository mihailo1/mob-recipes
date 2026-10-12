"use client";

import { useSyncExternalStore } from "react";
import { parseDoc } from "./sync.mjs";
import { FAVORITES_KEY, FOLDERS_KEY, POOL_KEY } from "./storage-migrations.mjs";

// Client side of device sync: which space this device is linked to, the doc
// of its last sync, and a small store the UI reads. The loop that talks to
// the server lives in components/SyncEngine.jsx; components/SyncCard.jsx is
// the UI.

const LINK_KEY = "mob-recipes:sync"; // { space, rev, dirty }
const DOC_KEY = "mob-recipes:sync-doc"; // the doc of the last sync
const BACKUP_SUFFIX = ":backup-sync";

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** { space, rev, dirty } or null when this device is not linked. */
export function readLink() {
  const v = read(LINK_KEY);
  return v && typeof v.space === "string" ? { rev: "0", dirty: false, ...v } : null;
}

export function saveLink(link) {
  write(LINK_KEY, link);
}

/** The doc of the last sync for `space`, or null. */
export function readShadow(space) {
  const v = read(DOC_KEY);
  if (!v || v.space !== space) return null;
  return parseDoc(v.doc);
}

export function saveShadow(space, doc) {
  return write(DOC_KEY, { space, doc });
}

// UI state: { linked, status, lastSync, error }
//   status: idle | syncing | error | offline | gone | off
let state = { linked: false, status: "idle", lastSync: null };
let loaded = false;
const listeners = new Set();
const SERVER_STATE = Object.freeze({ linked: false, status: "idle", lastSync: null });

function load() {
  if (loaded) return;
  loaded = true;
  state = { ...state, linked: !!readLink() };
}

export const syncStore = {
  get() {
    load();
    return state;
  },
  set(patch) {
    load();
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get, () => SERVER_STATE);
}

/**
 * Links this device to `space`. A raw copy of the current kitchen is kept
 * under "<key>:backup-sync" first. The first sync then merges this device's
 * data with the space's: nothing is lost on either side.
 */
export function linkSpace(space) {
  const cur = readLink();
  if (cur?.space === space) return;
  try {
    const ls = window.localStorage;
    for (const key of [POOL_KEY, FAVORITES_KEY, FOLDERS_KEY]) {
      const raw = ls.getItem(key);
      if (raw !== null) ls.setItem(key + BACKUP_SUFFIX, raw);
    }
  } catch {
    // storage unavailable: nothing to back up
  }
  write(DOC_KEY, null);
  saveLink({ space, rev: "0", dirty: false });
  syncStore.set({ linked: true, status: "idle", lastSync: null });
  requestSync();
}

const kicks = new Set();

/** Asks components/SyncEngine.jsx to sync now. */
export function requestSync() {
  kicks.forEach((k) => k());
}

export function onSyncRequest(fn) {
  kicks.add(fn);
  return () => kicks.delete(fn);
}

/** Stops syncing on this device. Its data stays as it is. */
export function unlink(status = "idle") {
  write(LINK_KEY, null);
  write(DOC_KEY, null);
  syncStore.set({ linked: false, status, lastSync: null });
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** Pairing calls (see app/api/sync/pair/route.js). */
export const pairApi = {
  create: (space) => post("/api/sync/pair", space ? { op: "create", space } : { op: "create" }),
  join: (code) => post("/api/sync/pair", { op: "join", code }),
  status: (code, space) => post("/api/sync/pair", { op: "status", code, space }),
  cancel: (code, space) => post("/api/sync/pair", { op: "cancel", code, space }),
};

export function syncRequest(body) {
  return post("/api/sync", body);
}

const JOIN_ERRORS = {
  404: "That code didn't work. Check the digits, or show a new code on the other device.",
  429: "Too many tries. Wait a few minutes and try again.",
  503: "Sync isn't available right now. Try again later.",
};

/** Joins the space behind a 6 digit code. Resolves to { ok } or { error }. */
export async function joinWithCode(code) {
  try {
    const { status, data } = await pairApi.join(code);
    if (status === 200 && data.space) {
      linkSpace(data.space);
      return { ok: true };
    }
    return {
      error: JOIN_ERRORS[status] || "Couldn't reach the server. Check your connection and try again.",
    };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}
