"use client";

import { useEffect, useRef, useState, ViewTransition } from "react";
import { createPortal } from "react-dom";
import RecipeImage from "./RecipeImage";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 320;
const DISMISS_DISTANCE = 90;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Must stay within images.deviceSizes / qualities in next.config.mjs.
const placeholderUrl = (src) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=70`;

// The photo morphs from the card the user tapped (lib/transitions.js).
function Morph({ name, children }) {
  if (!name) return children;
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

// Trigger (the hero photo) + fullscreen viewer.
export default function PhotoViewer({ src, alt, className = "recipe-hero", transitionName }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  if (!src) {
    return (
      <Morph name={transitionName}>
        <RecipeImage className={className} src={src} alt={alt} priority />
      </Morph>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="hero-trigger"
        aria-label={`Open photo of ${alt}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Morph name={transitionName}>
          <RecipeImage className={className} src={src} alt="" priority />
        </Morph>
        <span className="hero-zoom-hint" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
          </svg>
        </span>
      </button>
      {open
        ? createPortal(
            <Viewer
              src={src}
              alt={alt}
              onClose={() => setOpen(false)}
              returnFocusTo={triggerRef}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function Viewer({ src, alt, onClose, returnFocusTo }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const lowRef = useRef(null);
  const fullRef = useRef(null);

  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const [dragY, setDragY] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [fullReady, setFullReady] = useState(false);

  const viewRef = useRef(view);
  const dragRef = useRef(0);
  const natural = useRef(null); // { w, h } of the photo, for pan bounds
  const pointers = useRef(new Map()); // id -> { x, y } relative to stage center
  const base = useRef(null); // gesture baseline, rebuilt whenever pointer count changes
  const hadPinch = useRef(false);
  const moved = useRef(false);
  const tapStart = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const stageRect = () => stageRef.current.getBoundingClientRect();

  // Max pan distance per axis at a given scale, from the fitted image size.
  const bounds = (s) => {
    const r = stageRect();
    let w = r.width;
    let h = r.height;
    const n = natural.current;
    if (n) {
      const fit = Math.min(r.width / n.w, r.height / n.h);
      w = n.w * fit;
      h = n.h * fit;
    }
    return {
      mx: Math.max(0, (w * s - r.width) / 2),
      my: Math.max(0, (h * s - r.height) / 2),
    };
  };

  const commit = (v) => {
    const s = clamp(v.s, MIN_SCALE, MAX_SCALE);
    const { mx, my } = bounds(s);
    const next =
      s <= MIN_SCALE + 0.001
        ? { s: MIN_SCALE, x: 0, y: 0 }
        : { s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
    viewRef.current = next;
    setView(next);
  };

  const local = (e) => {
    const r = stageRect();
    return {
      x: e.clientX - r.left - r.width / 2,
      y: e.clientY - r.top - r.height / 2,
    };
  };

  // View after zooming to scale `s` keeping the content point under `m` fixed.
  const zoomAround = (from, s, m) => ({
    s,
    x: m.x - ((m.x - from.x) / from.s) * s,
    y: m.y - ((m.y - from.y) / from.s) * s,
  });

  const rebase = () => {
    const pts = [...pointers.current.values()];
    const v = viewRef.current;
    if (pts.length === 0) {
      base.current = null;
    } else if (pts.length === 1) {
      let mode = v.s > MIN_SCALE + 0.001 ? "pan" : "dismiss";
      if (hadPinch.current && mode === "dismiss") mode = "idle";
      base.current = { mode, ...v, mid: { ...pts[0] }, dist: 0 };
    } else {
      const [a, b] = pts;
      base.current = {
        mode: "pinch",
        ...v,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      };
      dragRef.current = 0;
      setDragY(0);
    }
  };

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stageRef.current.setPointerCapture?.(e.pointerId);
    setAnimate(false);
    if (pointers.current.size === 0) {
      moved.current = false;
      hadPinch.current = false;
      tapStart.current = { x: e.clientX, y: e.clientY };
    } else {
      hadPinch.current = true;
    }
    pointers.current.set(e.pointerId, local(e));
    rebase();
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const t = tapStart.current;
    if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) moved.current = true;
    const b = base.current;
    if (!b) return;

    if (b.mode === "pinch") {
      const [p1, p2] = [...pointers.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const s = clamp((b.s * dist) / b.dist, MIN_SCALE, MAX_SCALE);
      // Content point under the starting midpoint follows the current midpoint.
      commit({
        s,
        x: mid.x - ((b.mid.x - b.x) / b.s) * s,
        y: mid.y - ((b.mid.y - b.y) / b.s) * s,
      });
    } else if (b.mode === "pan") {
      commit({ s: b.s, x: b.x + (p.x - b.mid.x), y: b.y + (p.y - b.mid.y) });
    } else if (b.mode === "dismiss") {
      const dy = Math.max(0, p.y - b.mid.y);
      dragRef.current = dy;
      setDragY(dy);
    }
  };

  const finish = (e, cancelled) => {
    if (!pointers.current.has(e.pointerId)) return;
    const wasDismiss = base.current?.mode === "dismiss";
    pointers.current.delete(e.pointerId);

    if (pointers.current.size === 0) {
      if (!cancelled && wasDismiss && dragRef.current > DISMISS_DISTANCE) {
        onCloseRef.current();
        return;
      }
      if (dragRef.current !== 0) {
        setAnimate(true);
        dragRef.current = 0;
        setDragY(0);
      }
      if (!cancelled && !moved.current && !hadPinch.current) handleTap(e);
      hadPinch.current = false;
    }
    rebase();
  };

  const handleTap = (e) => {
    const now = performance.now();
    const last = lastTap.current;
    const close =
      now - last.t < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40;
    if (!close) {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      return;
    }
    lastTap.current = { t: 0, x: 0, y: 0 };
    const v = viewRef.current;
    setAnimate(true);
    if (v.s > MIN_SCALE + 0.001) commit({ s: MIN_SCALE, x: 0, y: 0 });
    else commit(zoomAround(v, DOUBLE_TAP_SCALE, local(e)));
  };

  // Lock page scroll, focus the close button, handle Escape and Tab.
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    closeRef.current?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        // Only one focusable control in the dialog: keep focus on it.
        e.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);

    // Safari page-zoom gestures: the viewer handles zoom itself.
    const root = rootRef.current;
    const stop = (e) => e.preventDefault();
    const gestures = ["gesturestart", "gesturechange", "gestureend"];
    gestures.forEach((n) => root.addEventListener(n, stop, { passive: false }));

    const onResize = () => commit(viewRef.current);
    window.addEventListener("resize", onResize);

    const trigger = returnFocusTo?.current;
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.removeEventListener("keydown", onKey);
      gestures.forEach((n) => root.removeEventListener(n, stop));
      window.removeEventListener("resize", onResize);
      trigger?.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel / trackpad pinch (ctrl+wheel). React's onWheel is passive, so the
  // browser would also zoom the page; a native non-passive listener can cancel.
  useEffect(() => {
    const root = rootRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit;
      const v = viewRef.current;
      const s = clamp(v.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), MIN_SCALE, MAX_SCALE);
      setAnimate(false);
      commit(zoomAround(v, s, local(e)));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Images that finished loading before React attached onLoad (cache hits).
  useEffect(() => {
    const low = lowRef.current;
    const full = fullRef.current;
    if (low?.complete && low.naturalWidth) {
      natural.current = { w: low.naturalWidth, h: low.naturalHeight };
    }
    if (full?.complete && full.naturalWidth) {
      natural.current = { w: full.naturalWidth, h: full.naturalHeight };
      setFullReady(true);
    }
  }, []);

  const fade = clamp(dragY / 320, 0, 1);

  return (
    <div
      ref={rootRef}
      className="pv"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${alt}`}
      data-allow-zoom
      style={{ background: `rgba(0, 0, 0, ${0.94 - fade * 0.6})` }}
    >
      <div
        ref={stageRef}
        className="pv-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      >
        <div
          className={`pv-content ${animate ? "is-animating" : ""}`}
          style={{
            transform: `translate3d(${view.x}px, ${view.y + dragY}px, 0) scale(${view.s})`,
          }}
          onTransitionEnd={() => setAnimate(false)}
        >
          {/* Optimized image shows instantly (usually cached); the original replaces it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={lowRef}
            className="pv-img"
            src={placeholderUrl(src)}
            alt={alt}
            draggable={false}
            onLoad={(e) => {
              if (!fullReady) {
                natural.current = {
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                };
              }
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={fullRef}
            className={`pv-img pv-full ${fullReady ? "is-ready" : ""}`}
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            onLoad={(e) => {
              natural.current = {
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              };
              setFullReady(true);
            }}
          />
        </div>
      </div>
      <button
        ref={closeRef}
        type="button"
        className="pv-close"
        aria-label="Close photo"
        onClick={onClose}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
