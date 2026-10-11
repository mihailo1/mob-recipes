"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/*
 * "Load more" pagination + window scroll position that survive leaving the
 * page and coming back (browser back, in-app back link, tab bar).
 *
 * Both are stored in sessionStorage under `key`, which should identify the
 * exact list, e.g. pathname + "?" + canonical filter query string.
 *
 * Restore order: the visible count is read synchronously on mount (so the
 * first render already has all previously loaded cards), then, once `ready`
 * (data rendered), the scroll position is applied in a layout effect (before
 * paint) and re-applied for a few frames in case the page was still growing.
 *
 * Links that lead back to the list should use scroll={false} so Next does not
 * scroll to the top after this restore. Browser scroll restoration is set to
 * "manual" while the list is mounted so it does not fight either.
 *
 * Changing `key` (new filters) resets pagination to one page.
 */

// All positions live in one sessionStorage entry: { [key]: { visible, y } },
// most recently written last, capped so typing many queries can't grow it.
const STORAGE_KEY = "mob-recipes:list-pos";
const MAX_ENTRIES = 30;
const MAX_VISIBLE = 5000;

function readAll() {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function readPos(key) {
  const v = readAll()[key];
  return v && typeof v === "object" ? v : null;
}

function writePos(key, value) {
  try {
    const all = readAll();
    delete all[key];
    all[key] = value;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
      delete all[k];
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable, ignore
  }
}

function initialCount(key, pageSize) {
  if (typeof window === "undefined") return pageSize;
  const n = Math.floor(Number(readPos(key)?.visible));
  return Number.isFinite(n) && n > pageSize ? Math.min(n, MAX_VISIBLE) : pageSize;
}

/**
 * @param {object}  opts
 * @param {string}  opts.key       identifies the list (pathname + filters)
 * @param {boolean} opts.ready     true once the list has data and is rendered
 * @param {number}  [opts.pageSize=40]
 * @returns {{ visible: number, showMore: () => void }}
 */
export function useListRestoration({ key, ready, pageSize = 40 }) {
  const [page, setPage] = useState(() => ({
    key,
    count: initialCount(key, pageSize),
  }));
  const visible = page.key === key ? page.count : pageSize;

  // Latest values for listeners. Updated before any other layout effect here.
  const latest = useRef({ key, visible });
  useLayoutEffect(() => {
    latest.current = { key, visible };
  });

  const tracking = useRef(false);

  // Keep browser scroll restoration out of the way while mounted.
  useLayoutEffect(() => {
    const h = window.history;
    if (!("scrollRestoration" in h)) return undefined;
    const prev = h.scrollRestoration;
    h.scrollRestoration = "manual";
    return () => {
      h.scrollRestoration = prev;
    };
  }, []);

  // Restore scroll once, as soon as the list is on screen.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current) return undefined;
    if (!ready) {
      // Still loading: start at the top (a scroll={false} link may have kept
      // the previous page's offset).
      window.scrollTo(0, 0);
      return undefined;
    }
    restored.current = true;
    const target = Math.max(0, Number(readPos(key)?.y) || 0);
    let raf = 0;
    let frames = 0;
    let cancelled = false;
    const stop = () => {
      cancelled = true;
    };
    // The user taking over (touch/wheel/keys) ends the restore.
    const opts = { passive: true, once: true };
    window.addEventListener("touchstart", stop, opts);
    window.addEventListener("wheel", stop, opts);
    window.addEventListener("keydown", stop, opts);
    const cleanup = () => {
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", stop);
    };
    const apply = () => {
      if (!cancelled) window.scrollTo(0, target);
      const off = Math.abs(window.scrollY - target) > 2;
      // Always re-apply on the next frame at least once: Next's own
      // scroll-to-top (links without scroll={false}) runs after this effect.
      if (!cancelled && (off || frames < 1) && frames < 15) {
        frames += 1;
        raf = requestAnimationFrame(apply);
      } else {
        cleanup();
        done = true;
        tracking.current = true;
      }
    };
    let done = false;
    apply();
    return () => {
      cancelAnimationFrame(raf);
      cleanup();
      // Interrupted (e.g. StrictMode effect replay): let the next run restore.
      if (!done) restored.current = false;
    };
    // Runs for the key at the moment data became ready; later key changes
    // are filter edits on this page, not navigations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save on scroll (one write per frame), only while this page is current.
  useEffect(() => {
    const path = window.location.pathname;
    let raf = 0;
    const save = () => {
      raf = 0;
      if (!tracking.current || window.location.pathname !== path) return;
      writePos(latest.current.key, {
        visible: latest.current.visible,
        y: Math.round(window.scrollY),
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(save);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Save when the list itself changes (new filters, "show more").
  useEffect(() => {
    if (!tracking.current) return;
    writePos(key, { visible, y: Math.round(window.scrollY) });
  }, [key, visible]);

  return {
    visible,
    showMore: () => setPage({ key, count: visible + pageSize }),
  };
}
