"use client";

import { useEffect, useState } from "react";

const EDITABLE = "input, textarea, select, [contenteditable]";
const SETTLE_MS = 120;
const MIN_LIFT = 40; // px; smaller gaps are rubber-band overscroll, not the stuck viewport
const MAX_LIFT = 450; // px; a keyboard with the suggestion bar is ~340 on current iPhones
const TAPS_TO_OPEN = 5;
const TAP_WINDOW_MS = 2500;

function isEditing() {
  const el = document.activeElement;
  return !!el && el !== document.body && el.matches(EDITABLE);
}

function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function currentLift() {
  return parseFloat(document.documentElement.style.getPropertyValue("--nb-lift")) || 0;
}

// How far the visible area extends below where the fixed bottom bar really
// sits, in px. We measure the bar itself (minus the lift already applied)
// instead of trusting clientHeight: on some iPhones the box that fixed
// elements are anchored to is shorter than clientHeight after the keyboard.
function measureGap() {
  const vv = window.visualViewport;
  if (!vv || vv.scale > 1.01) return 0;
  const bar = document.querySelector(".nb-tabbar");
  const box = bar ? bar.getBoundingClientRect() : null;
  const base =
    box && box.height > 0
      ? box.bottom - currentLift()
      : document.documentElement.clientHeight;
  const gap = Math.round(vv.offsetTop + vv.height - base);
  return gap >= MIN_LIFT && gap <= MAX_LIFT ? gap : 0;
}

function snapshot() {
  const vv = window.visualViewport;
  const bar = document.querySelector(".nb-tabbar");
  const box = bar ? bar.getBoundingClientRect() : null;
  return [
    `standalone  ${isStandalone()}`,
    `layout h    ${document.documentElement.clientHeight}`,
    `inner h     ${window.innerHeight}`,
    `visual h    ${vv ? Math.round(vv.height) : "n/a"}`,
    `visual top  ${vv ? Math.round(vv.offsetTop) : "n/a"}`,
    `visual bot  ${vv ? Math.round(vv.offsetTop + vv.height) : "n/a"}`,
    `scale       ${vv ? vv.scale.toFixed(2) : "n/a"}`,
    `scrollY     ${Math.round(window.scrollY)}`,
    `bar bottom  ${box ? Math.round(box.bottom) : "n/a"}`,
    `bar pad     ${bar ? getComputedStyle(bar).paddingBottom : "n/a"}`,
    `lift        ${document.documentElement.style.getPropertyValue("--nb-lift") || "0px"}`,
    `editing     ${isEditing()}`,
  ].join("\n");
}

/*
 * iOS home-screen apps can leave the layout viewport stale after the on-screen
 * keyboard closes (typing a folder name, searching): fixed bars then float
 * above the real bottom edge until the next scroll. We measure the gap and
 * push the bottom bars down by it through --nb-lift (see the nb-*, toast and
 * sheet rules in globals.css). Only active in standalone mode; elsewhere the
 * browser manages its own toolbars.
 *
 * Tap the "Mob Recipes v…" line 5 times to show a live readout of the
 * viewport numbers (handy for reporting this bug from a phone).
 */
export default function ViewportFix() {
  const [debug, setDebug] = useState(null);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let timer = 0;
    let nudged = false;

    const apply = () => {
      if (isEditing()) return; // keyboard is up, nothing to fix yet
      const lift = isStandalone() ? measureGap() : 0;
      const value = `${lift}px`;
      if (root.style.getPropertyValue("--nb-lift") !== value) {
        root.style.setProperty("--nb-lift", value);
      }
      if (lift && !nudged) {
        // Ask WebKit to re-sync its viewport; the scroll event re-runs apply().
        nudged = true;
        window.scrollTo(window.scrollX, window.scrollY);
      } else if (!lift) {
        nudged = false;
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, SETTLE_MS);
    };
    // Scrolling is where the bar jumps, so react on the next frame instead of
    // waiting for the settle delay. One cheap rect read per frame at most.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };

    const targets = [
      [document, "focusout", schedule, true],
      [document, "visibilitychange", onVisible],
      [window, "resize", schedule],
      [window, "orientationchange", schedule],
      [window, "pageshow", schedule],
      [window, "scroll", onScroll, { passive: true }],
    ];
    targets.forEach(([t, n, f, c]) => t.addEventListener(n, f, c));
    if (vv) {
      vv.addEventListener("resize", schedule);
      vv.addEventListener("scroll", schedule);
    }
    schedule();

    let taps = 0;
    let first = 0;
    const onTap = (e) => {
      if (!(e.target instanceof Element) || !e.target.closest(".upd-version")) return;
      const now = Date.now();
      if (!taps || now - first > TAP_WINDOW_MS) {
        taps = 0;
        first = now;
      }
      taps += 1;
      if (taps >= TAPS_TO_OPEN) {
        taps = 0;
        setDebug((cur) => (cur === null ? snapshot() : null));
      }
    };
    document.addEventListener("click", onTap);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      targets.forEach(([t, n, f, c]) => t.removeEventListener(n, f, c));
      if (vv) {
        vv.removeEventListener("resize", schedule);
        vv.removeEventListener("scroll", schedule);
      }
      document.removeEventListener("click", onTap);
      root.style.removeProperty("--nb-lift");
    };
  }, []);

  useEffect(() => {
    if (debug === null) return undefined;
    const id = window.setInterval(() => setDebug(snapshot()), 400);
    return () => window.clearInterval(id);
  }, [debug === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (debug === null) return null;
  return (
    <pre className="vp-debug" onClick={() => setDebug(null)}>
      {debug}
    </pre>
  );
}
