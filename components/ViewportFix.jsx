"use client";

import { useEffect, useState } from "react";
import { checkStuck, nextStep, shouldHide } from "../lib/viewport.mjs";

const EDITABLE = "input, textarea, select, [contenteditable]";
const SETTLE_MS = 400; // keyboard close animation is ~250ms
const NUDGE_WAIT_MS = 200;
const HARD_CAP_MS = 1500; // after a blur the bars are back by now, whatever else happens
const WATCHDOG_MS = 500;
const TAPS_TO_OPEN = 5;
const TAP_WINDOW_MS = 2500;

// What the last run did, shown in the readout.
const trace = { phase: "idle", nudges: 0, last: "-", reason: "", gap: 0, baseline: 0 };

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

function measure() {
  const vv = window.visualViewport;
  return {
    standalone: isStandalone(),
    editing: isEditing(),
    vvHeight: vv ? vv.height : undefined,
    vvOffsetTop: vv ? vv.offsetTop : undefined,
    vvScale: vv ? vv.scale : undefined,
    clientHeight: document.documentElement.clientHeight,
  };
}

function snapshot() {
  const vv = window.visualViewport;
  const bar = document.querySelector(".nb-tabbar");
  const box = bar ? bar.getBoundingClientRect() : null;
  return [
    `standalone  ${isStandalone()}`,
    `layout h    ${document.documentElement.clientHeight}`,
    `inner h     ${window.innerHeight}`,
    `max inner   ${trace.baseline}`,
    `visual h    ${vv ? Math.round(vv.height) : "n/a"}`,
    `visual top  ${vv ? Math.round(vv.offsetTop) : "n/a"}`,
    `visual bot  ${vv ? Math.round(vv.offsetTop + vv.height) : "n/a"}`,
    `scale       ${vv ? vv.scale.toFixed(2) : "n/a"}`,
    `scrollY     ${Math.round(window.scrollY)}`,
    `bar bottom  ${box ? Math.round(box.bottom) : "n/a"}`,
    `bar pad     ${bar ? getComputedStyle(bar).paddingBottom : "n/a"}`,
    `editing     ${isEditing()}`,
    `bars hidden ${document.documentElement.hasAttribute("data-vp-hide")}`,
    `phase       ${trace.phase}`,
    `stuck       ${trace.reason || "no"} (gap ${trace.gap})`,
    `nudges      ${trace.nudges}`,
    `last        ${trace.last}`,
  ].join("\n");
}

/*
 * iOS home-screen apps can leave WebKit's viewport state stale after the
 * on-screen keyboard closes (typing a folder name, searching): fixed bars then
 * float above the real bottom edge until WebKit catches up. There is no known
 * CSS or JS fix, and measuring and compensating proved unsafe (a correction
 * changes what the next measurement sees, and the bar ended up cut off). So
 * the bars always sit at plain bottom: 0 and we only try to avoid the state:
 *  - while a field is being edited (standalone only) and for a moment after
 *    it loses focus, the bars are hidden (data-vp-hide, no layout shift), so
 *    nobody sees them jump while WebKit settles;
 *  - once the keyboard is gone we check once whether the state is stuck and,
 *    if so, nudge the scroll position by 1px and back (at most twice) to make
 *    WebKit re-sync;
 *  - then the bars come back. A hard timer guarantees that even when we
 *    understand nothing, they are visible again 1.5s after the blur.
 * Nothing runs while scrolling and nothing moves a bar. Elsewhere (regular
 * browser tabs) the browser manages its own toolbars and this does nothing.
 *
 * Tap the "Mob Recipes v…" line 5 times to show a live readout of the
 * viewport numbers and of what this code did (handy for reporting this bug
 * from a phone).
 */
export default function ViewportFix() {
  const [debug, setDebug] = useState(null);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let settleTimer = 0;
    let capTimer = 0;
    let watchdog = 0;
    let focusAt = 0;
    let quiet = false;
    let baseline = 0;

    const setHidden = (on) => {
      if (on === root.hasAttribute("data-vp-hide")) return;
      if (on) root.setAttribute("data-vp-hide", "");
      else root.removeAttribute("data-vp-hide");
    };
    const learnBaseline = () => {
      if (isEditing()) return; // the keyboard shrinks innerHeight
      baseline = Math.max(baseline, window.innerHeight, vv ? vv.height : 0);
      trace.baseline = Math.round(baseline);
    };
    const clearTimers = () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(capTimer);
      window.clearInterval(watchdog);
      watchdog = 0;
    };
    const finish = (why) => {
      clearTimers();
      setHidden(false);
      trace.phase = "idle";
      trace.last = why;
    };

    // Ask WebKit to re-sync its viewport: move the scroll position by 1px and
    // straight back. Instant, whatever scroll-behavior says.
    const nudge = () => {
      const x = window.scrollX;
      const y = window.scrollY;
      window.scrollTo({ left: x, top: y > 0 ? y - 1 : y + 1, behavior: "instant" });
      window.requestAnimationFrame(() =>
        window.scrollTo({ left: x, top: y, behavior: "instant" }),
      );
    };

    const settle = () => {
      if (isEditing()) return; // focus moved to another field, its handler owns the bars
      const m = measure();
      const res = checkStuck(m);
      trace.reason = res.reason;
      trace.gap = res.gap;
      if (nextStep({ stuck: res.stuck, nudges: trace.nudges }) === "nudge") {
        if (quiet) setHidden(true); // a resume check stays invisible unless it finds something
        trace.nudges += 1;
        trace.phase = "nudging";
        trace.last = `nudge ${trace.nudges}`;
        nudge();
        settleTimer = window.setTimeout(settle, NUDGE_WAIT_MS);
      } else {
        finish(res.stuck ? "gave up, bars shown" : "ok, bars shown");
      }
    };
    const startSettle = (hiddenNow) => {
      clearTimers();
      quiet = !hiddenNow;
      trace.nudges = 0;
      trace.phase = "settling";
      if (hiddenNow) setHidden(true);
      settleTimer = window.setTimeout(settle, SETTLE_MS);
      capTimer = window.setTimeout(() => finish("cap, bars shown"), HARD_CAP_MS);
    };

    const refreshHide = () => {
      if (!isEditing()) return;
      setHidden(
        shouldHide({
          standalone: isStandalone(),
          editing: true,
          msSinceFocus: Date.now() - focusAt,
          vvHeight: vv ? vv.height : undefined,
          baselineHeight: baseline,
        }),
      );
    };
    const onFocusIn = () => {
      if (!isStandalone() || !isEditing()) return;
      clearTimers();
      focusAt = Date.now();
      trace.phase = "editing";
      refreshHide();
      // A field that vanishes while focused never fires focusout: poll.
      watchdog = window.setInterval(() => {
        if (!isEditing()) startSettle(true);
        else refreshHide();
      }, WATCHDOG_MS);
    };
    const onFocusOut = () => {
      if (trace.phase !== "editing") return;
      startSettle(true);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      learnBaseline();
      if (trace.phase === "idle" && isStandalone() && !isEditing()) startSettle(false);
    };
    const onVvResize = () => {
      learnBaseline();
      refreshHide();
    };

    learnBaseline();
    const targets = [
      [document, "focusin", onFocusIn, true],
      [document, "focusout", onFocusOut, true],
      [document, "visibilitychange", onVisible],
      [window, "pageshow", onVisible],
    ];
    targets.forEach(([t, n, f, c]) => t.addEventListener(n, f, c));
    if (vv) vv.addEventListener("resize", onVvResize);

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
      clearTimers();
      targets.forEach(([t, n, f, c]) => t.removeEventListener(n, f, c));
      if (vv) vv.removeEventListener("resize", onVvResize);
      document.removeEventListener("click", onTap);
      root.removeAttribute("data-vp-hide");
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
