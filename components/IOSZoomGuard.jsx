"use client";

import { useEffect } from "react";

// iOS Safari ignores maximum-scale=1 for pinch, so block the WebKit gesture
// events instead. Anything inside [data-allow-zoom] (photo viewer) keeps them.
export default function IOSZoomGuard() {
  useEffect(() => {
    const block = (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest("[data-allow-zoom]")) return;
      e.preventDefault();
    };
    const opts = { passive: false };
    const events = ["gesturestart", "gesturechange", "gestureend"];
    events.forEach((n) => document.addEventListener(n, block, opts));
    return () => events.forEach((n) => document.removeEventListener(n, block, opts));
  }, []);
  return null;
}
