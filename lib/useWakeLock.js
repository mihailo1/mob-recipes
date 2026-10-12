"use client";

import { useEffect } from "react";

/** Keeps the screen on while `on` (Screen Wake Lock API, iOS 16.4+). */
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return undefined;
    let lock;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) await next.release();
        else lock = next;
      } catch {}
    };
    // The browser drops the lock when the page is hidden; take it again.
    const visible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      lock?.release();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [on]);
}
