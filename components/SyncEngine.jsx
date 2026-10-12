"use client";

import { useEffect } from "react";
import { kitchenStore } from "../lib/store";
import {
  SYNC_DEBOUNCE_MS,
  SYNC_EVERY_MS,
  SYNC_RETRY_MS,
  emptyDoc,
  materialize,
  merge,
  parseDoc,
  prune,
  stamp,
} from "../lib/sync.mjs";
import {
  onSyncRequest,
  readLink,
  readShadow,
  saveLink,
  saveShadow,
  syncRequest,
  syncStore,
  unlink,
} from "../lib/sync-client";

const KEEPALIVE_MAX = 60 * 1024; // browsers cap keepalive bodies at 64 KB
const sameData = (a, b) =>
  a.pool === b.pool && a.favorites === b.favorites && a.folders === b.folders;

/*
 * Renders nothing. While this device is linked (lib/sync-client.js) and the
 * app is on screen, it keeps My kitchen and Saved in sync with the other
 * devices: right after a change here, when the app comes back, and every
 * 20 seconds. See lib/sync.mjs for how changes are merged.
 */
export default function SyncEngine() {
  useEffect(() => {
    let timer = 0;
    let running = false;
    let again = false;
    let applying = false;
    let stopped = false;

    const schedule = (ms) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, ms);
    };

    async function run() {
      window.clearTimeout(timer);
      if (stopped) return;
      const link = readLink();
      if (!link || document.visibilityState !== "visible") return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      again = false;
      const local = kitchenStore.get();
      const now = Date.now();
      const base = prune(readShadow(link.space) || emptyDoc(), now);
      const { doc: mine, changed } = stamp(local, base, now);
      // Also send when the server lacked something of ours last time.
      const send = changed || link.dirty;
      let next = SYNC_EVERY_MS;
      syncStore.set({ status: "syncing" });
      try {
        const { status, data } = await syncRequest(
          send
            ? { space: link.space, rev: link.rev, doc: mine }
            : { space: link.space, rev: link.rev },
        );
        // Unlinked or linked elsewhere while the request was out.
        if (readLink()?.space !== link.space) return;
        if (status === 404 && data.error === "unknown-space") {
          unlink("gone");
          return;
        }
        if (status === 503 && data.error === "not-configured") {
          stopped = true;
          syncStore.set({ status: "off" });
          return;
        }
        if (status !== 200 || typeof data.rev !== "string") throw new Error(String(status));
        if (data.doc === undefined) {
          if (send) throw new Error("missing doc");
          saveLink({ ...link, rev: data.rev });
        } else {
          const server = data.doc ? parseDoc(data.doc) : emptyDoc();
          if (!server) throw new Error("bad doc");
          // Changes made here while the request was out stay on top.
          const cur = kitchenStore.get();
          const late = sameData(cur, local) ? mine : stamp(cur, mine, Date.now()).doc;
          const m = merge(server, late);
          if (!saveShadow(link.space, m.doc)) throw new Error("storage full");
          saveLink({ space: link.space, rev: data.rev, dirty: m.changed });
          applying = true;
          try {
            kitchenStore.replaceData(materialize(m.doc));
          } finally {
            applying = false;
          }
          if (m.changed) next = SYNC_DEBOUNCE_MS;
        }
        syncStore.set({ status: "idle", lastSync: Date.now() });
      } catch {
        syncStore.set({ status: navigator.onLine === false ? "offline" : "error" });
        next = SYNC_RETRY_MS;
      } finally {
        running = false;
        if (!stopped) schedule(again ? 0 : next);
      }
    }

    // Leaving the app right after a change: send it on the way out. The doc
    // is kept as the last synced one with "dirty" set, so if this send is
    // lost the next sync repeats it with the same times (never newer ones
    // that could undo a later change from another device).
    function flush() {
      window.clearTimeout(timer);
      const link = readLink();
      if (!link || running || stopped) return;
      const now = Date.now();
      const base = prune(readShadow(link.space) || emptyDoc(), now);
      const { doc, changed } = stamp(kitchenStore.get(), base, now);
      if (!changed) return;
      if (!saveShadow(link.space, doc)) return;
      saveLink({ ...link, dirty: true });
      const body = JSON.stringify({ space: link.space, rev: link.rev, doc });
      if (body.length > KEEPALIVE_MAX) return;
      try {
        fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {
        // the next sync sends it
      }
    }

    const onKitchen = () => {
      if (!applying && !stopped && readLink()) schedule(SYNC_DEBOUNCE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
      else flush();
    };
    const onOnline = () => run();

    const offKitchen = kitchenStore.subscribe(onKitchen);
    const offKick = onSyncRequest(() => {
      stopped = false;
      run();
    });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", onOnline);
    run();

    return () => {
      offKitchen();
      offKick();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", onOnline);
      window.clearTimeout(timer);
      stopped = true;
    };
  }, []);

  return null;
}
