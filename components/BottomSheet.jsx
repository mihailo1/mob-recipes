"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/*
 * iOS style bottom sheet, rendered in a portal above the tab bar, the resume
 * chip and the top notices.
 *
 * - Slides up with a spring-like curve, backdrop fades in. Closing plays the
 *   reverse before unmounting (instant with prefers-reduced-motion).
 * - Drag the handle/header down to dismiss (past 100px, or a fast flick).
 * - Escape closes, Tab is trapped inside, focus returns to the opener.
 * - Page scroll is locked while any sheet is open.
 * - Follows the iOS keyboard via visualViewport so inputs stay visible.
 *
 * Props:
 *  open, onClose        controlled visibility
 *  title                header title (also the dialog label)
 *  headerEnd            node on the right of the header (e.g. "Done")
 *  initialFocusRef      element to focus on open (default: the sheet itself)
 *  footer               node pinned under the scrolling body
 *  className            extra class on the sheet panel
 *  returnFocusRef       focus target on close when the opener is gone
 *                       (e.g. it lived in another sheet)
 *
 * To open the iOS keyboard on open, the opener must mount the sheet with
 * flushSync inside the tap handler; focus then happens synchronously here.
 */

const EXIT_MS = 340;
const DISMISS_PX = 100;
const FLICK_PX_PER_MS = 0.6;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lockCount = 0;
let lockSaved = null;

function lockScroll() {
  lockCount += 1;
  if (lockCount > 1) return;
  const html = document.documentElement;
  const body = document.body;
  const gap = window.innerWidth - html.clientWidth;
  lockSaved = { overflow: html.style.overflow, paddingRight: body.style.paddingRight };
  html.style.overflow = "hidden";
  if (gap > 0) body.style.paddingRight = `${gap}px`;
  html.setAttribute("data-sheet", "");
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !lockSaved) return;
  const html = document.documentElement;
  html.style.overflow = lockSaved.overflow;
  document.body.style.paddingRight = lockSaved.paddingRight;
  html.removeAttribute("data-sheet");
  lockSaved = null;
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Only the most recently opened sheet reacts to keys.
function isTopmost(node) {
  const roots = document.querySelectorAll('.bs-root[data-state="open"], .bs-root[data-state="enter"]');
  const top = roots[roots.length - 1];
  return !!top && top.contains(node);
}

export default function BottomSheet({
  open,
  onClose,
  title,
  headerEnd = null,
  initialFocusRef,
  footer = null,
  className = "",
  returnFocusRef,
  children,
}) {
  // closed -> enter (offscreen, mounted) -> open -> exit -> closed
  const [phase, setPhase] = useState(open ? "enter" : "closed");
  if (open && phase === "closed") setPhase("enter");
  else if (open && phase === "exit") setPhase("open");
  else if (!open && (phase === "enter" || phase === "open")) setPhase("exit");

  const mounted = phase !== "closed";
  const titleId = useId();
  const rootRef = useRef(null);
  const sheetRef = useRef(null);
  const backdropRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (phase === "enter") {
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setPhase((p) => (p === "enter" ? "open" : p)));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    if (phase === "exit") {
      const t = setTimeout(
        () => setPhase((p) => (p === "exit" ? "closed" : p)),
        reducedMotion() ? 0 : EXIT_MS,
      );
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  // Scroll lock + initial focus + focus restore. Layout effect so a mount
  // done with flushSync in a tap handler can focus an input synchronously
  // (iOS only opens the keyboard for focus inside the gesture).
  useLayoutEffect(() => {
    if (!mounted) return undefined;
    const node = sheetRef.current;
    const opener = document.activeElement;
    lockScroll();
    const target = initialFocusRef?.current || node;
    target?.focus({ preventScroll: true });
    return () => {
      unlockScroll();
      const active = document.activeElement;
      const focusLost = !active || active === document.body || (node && node.contains(active));
      if (!focusLost) return;
      const back =
        opener && opener.isConnected && typeof opener.focus === "function"
          ? opener
          : // Latest value on purpose: the target may have re-rendered meanwhile.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            returnFocusRef?.current;
      back?.focus({ preventScroll: true });
    };
  }, [mounted, initialFocusRef, returnFocusRef]);

  // Escape + focus trap.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const node = sheetRef.current;
      if (!node || !isTopmost(node)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Keep the sheet above the on-screen keyboard (iOS overlays it).
  useEffect(() => {
    if (!mounted) return undefined;
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return undefined;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--bs-kb", `${Math.round(kb)}px`);
      root.style.setProperty("--bs-vh", `${Math.round(vv.height)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [mounted]);

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("button, a, input, select, textarea")) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    drag.current = {
      id: e.pointerId,
      y0: e.clientY,
      last: e.clientY,
      t: performance.now(),
      v: 0,
      dy: 0,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    sheet.style.transition = "none";
    if (backdropRef.current) backdropRef.current.style.transition = "none";
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const sheet = sheetRef.current;
    const now = performance.now();
    const raw = e.clientY - d.y0;
    // Rubber band when pulled up.
    const dy = raw >= 0 ? raw : Math.max(raw / 5, -16);
    d.v = (e.clientY - d.last) / Math.max(1, now - d.t);
    d.last = e.clientY;
    d.t = now;
    d.dy = dy;
    sheet.style.transform = `translate3d(0, ${dy}px, 0)`;
    if (backdropRef.current) {
      const h = sheet.offsetHeight || 400;
      backdropRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / h));
    }
  }

  function endDrag(e, cancelled) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const sheet = sheetRef.current;
    // Clearing inline styles lets the CSS transition run from where the
    // finger left the sheet (back up, or out together with data-state=exit).
    if (sheet) {
      sheet.style.transition = "";
      sheet.style.transform = "";
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = "";
      backdropRef.current.style.opacity = "";
    }
    if (!cancelled && (d.dy > DISMISS_PX || (d.v > FLICK_PX_PER_MS && d.dy > 12))) {
      onClose();
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="bs-root" data-state={phase} ref={rootRef}>
      <div
        className="bs-backdrop"
        ref={backdropRef}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={`bs-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div
          className="bs-drag"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, false)}
          onPointerCancel={(e) => endDrag(e, true)}
        >
          <div className="bs-handle" aria-hidden="true" />
          {title || headerEnd ? (
            <div className="bs-header">
              {title ? (
                <h2 className="bs-title" id={titleId}>
                  {title}
                </h2>
              ) : (
                <span />
              )}
              {headerEnd}
            </div>
          ) : null}
        </div>
        <div className="bs-body">{children}</div>
        {footer ? <div className="bs-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
