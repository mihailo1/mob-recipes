"use client";

import { useEffect } from "react";
import { BEAT_RETRY_MS, BEAT_SLOW_MS, pickSuggestion } from "../lib/nearby.mjs";
import { deviceId, nearbyStore } from "../lib/nearby-client";

const ENDPOINT = "/api/nearby";

/*
 * Renders nothing. While the app is on screen it tells the server every few
 * seconds which recipe is open here, and learns what other devices on the same
 * Wi-Fi have open (see lib/nearby.mjs). When the app goes to the background it
 * says goodbye, so the other device stops offering this one's recipe at once.
 * If the server has no storage for this, it stops asking until the next launch.
 */
export default function NearbySync() {
  useEffect(() => {
    const device = deviceId();
    let timer = 0;
    let inflight = null;
    let off = false;
    let lastSent;

    const schedule = (ms) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(send, ms);
    };

    const apply = (peers) => {
      const { current, dismissed } = nearbyStore.get();
      const offered = pickSuggestion(peers, current, null);
      // A dismissal holds only while that same recipe is the one on offer.
      const keep = dismissed && offered === dismissed ? dismissed : null;
      const suggestion = offered === keep ? null : offered;
      const s = nearbyStore.get();
      if (s.suggestion !== suggestion || s.dismissed !== keep) {
        nearbyStore.set({ suggestion, dismissed: keep });
      }
    };

    async function send() {
      window.clearTimeout(timer);
      if (off || document.visibilityState !== "visible") return;
      inflight?.abort();
      const ctrl = new AbortController();
      inflight = ctrl;
      const slug = nearbyStore.get().current;
      lastSent = slug;
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device, slug }),
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 503 && data.error === "not-configured") {
          off = true;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        apply(Array.isArray(data.peers) ? data.peers : []);
        schedule(Number(data.next) > 0 ? Number(data.next) : BEAT_SLOW_MS);
      } catch (err) {
        if (err?.name === "AbortError") return;
        schedule(BEAT_RETRY_MS);
      } finally {
        if (inflight === ctrl) inflight = null;
      }
    }

    const leave = () => {
      window.clearTimeout(timer);
      inflight?.abort();
      if (nearbyStore.get().suggestion) nearbyStore.set({ suggestion: null });
      if (off) return;
      const body = new Blob([JSON.stringify({ device, leave: true })], { type: "application/json" });
      try {
        navigator.sendBeacon(ENDPOINT, body);
      } catch {
        // best effort: the entry expires on its own anyway
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") send();
      else leave();
    };
    // Opening or closing a recipe is reported right away, not on the next tick.
    const unsubscribe = nearbyStore.subscribe(() => {
      const { current, suggestion } = nearbyStore.get();
      if (current !== lastSent) {
        // The offer may be for the recipe just opened here.
        if (suggestion && suggestion === current) nearbyStore.set({ suggestion: null });
        send();
      }
    });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    send();

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      window.clearTimeout(timer);
      inflight?.abort();
    };
  }, []);

  return null;
}
