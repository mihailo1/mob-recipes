"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildTimeSteps, formatTimeRange, getTimeMax } from "../../lib/filters";

/*
 * Two-thumb cook-time range slider, no dependencies.
 *
 * Two native <input type="range"> are stacked. The inputs themselves ignore
 * pointer events (CSS) and only their thumbs accept them, so each thumb can
 * be grabbed even when they overlap. Native inputs give keyboard support,
 * touch dragging and screen reader adjust gestures for free.
 *
 * The inputs work on stop *indexes* (0..steps.length-1), where the stops are
 * 5 min apart up to 60, then 15 min apart (see buildTimeSteps). The first stop
 * means "no lower bound" and the last one "no upper bound" (shown as 180+).
 *
 * While dragging only local state changes (instant label, no URL writes, no
 * list re-render). The value is committed to the filters on pointer release,
 * key release and blur, and after a short pause for assistive tech that
 * changes values without pointer or key events.
 */

const IDLE_COMMIT_MS = 350;

const nearestIndex = (steps, minutes) => {
  let best = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(steps[i] - minutes) < Math.abs(steps[best] - minutes)) best = i;
  }
  return best;
};

const stepText = (steps, i) =>
  i >= steps.length - 1 ? `${steps[i]}+ minutes` : `${steps[i]} minutes`;

/**
 * Props:
 *  filterState  return value of useRecipeFilters()
 *  recipes      the full recipe list (decides the top stop, capped at 180)
 */
export default function TimeRange({ filterState, recipes }) {
  const { filters, setFilters } = filterState;
  const uid = useId();
  const steps = useMemo(() => buildTimeSteps(getTimeMax(recipes)), [recipes]);
  const last = steps.length - 1;

  const loFromFilters = filters.minTime == null ? 0 : nearestIndex(steps, filters.minTime);
  const hiFromFilters = filters.maxTime == null ? last : nearestIndex(steps, filters.maxTime);

  // Local value while the user is interacting; null = follow the filters.
  const [draft, setDraft] = useState(null);
  const lo = draft ? draft.lo : loFromFilters;
  const hi = draft ? draft.hi : hiFromFilters;

  const draftRef = useRef(null);
  const draggingRef = useRef(false);
  // Set when a drag starts with both thumbs on one value: the grabbed thumb
  // then moves freely either way around that value.
  const anchorRef = useRef(null);
  const timerRef = useRef(null);
  const latest = useRef({ setFilters, steps });
  useEffect(() => {
    latest.current = { setFilters, steps };
  });

  function commit() {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const d = draftRef.current;
    if (!d) return;
    draftRef.current = null;
    const { setFilters: set, steps: s } = latest.current;
    set({
      minTime: d.lo <= 0 ? null : s[d.lo],
      maxTime: d.hi >= s.length - 1 ? null : s[d.hi],
    });
    setDraft(null);
  }

  // Value change from either input. With an anchor (drag started on stacked
  // thumbs) the range spans anchor..value, so dragging left or right both work.
  function onThumbChange(which, raw) {
    const v = Number(raw);
    const a = anchorRef.current;
    if (a != null) update({ lo: Math.min(a, v), hi: Math.max(a, v) });
    else if (which === "lo") update({ lo: Math.min(v, hi), hi });
    else update({ lo, hi: Math.max(v, lo) });
  }

  function update(next) {
    draftRef.current = next;
    setDraft(next);
    clearTimeout(timerRef.current);
    if (!draggingRef.current) timerRef.current = setTimeout(commit, IDLE_COMMIT_MS);
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function onPointerDown() {
    draggingRef.current = true;
    anchorRef.current = lo === hi ? lo : null;
    const end = () => {
      draggingRef.current = false;
      anchorRef.current = null;
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      commit();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // Tap on the bare track: move the nearest thumb there.
  function onTrackPointerDown(e) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.round(frac * last);
    const moveLo = Math.abs(i - lo) < Math.abs(i - hi) || (lo === hi && i < lo);
    update(moveLo ? { lo: i, hi } : { lo, hi: i });
    commit();
  }

  const pct = (i) => (last ? i / last : 0);
  // Thumb centres are inset by half a thumb at both ends.
  const pos = (i) => `calc(var(--tr-thumb) / 2 + (100% - var(--tr-thumb)) * ${pct(i)})`;

  const label = formatTimeRange(
    lo <= 0 ? null : steps[lo],
    hi >= last ? null : steps[hi],
    steps[last],
  );
  const active = lo > 0 || hi < last;

  // When both thumbs sit at the top end, the lower one must stay on top so it
  // can still be pulled down.
  const loOnTop = lo >= last;

  return (
    <div className="tr" role="group" aria-labelledby={`${uid}-label`}>
      <div className="tr-head">
        <span id={`${uid}-label`} className="tr-title">
          Cook time
        </span>
        <output className={`tr-value ${active ? "is-active" : ""}`} aria-live="off">
          {label}
        </output>
      </div>
      <div
        className="tr-track"
        onPointerDown={onTrackPointerDown}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className="tr-fill"
          style={{ left: pos(lo), right: `calc(100% - ${pos(hi)})` }}
        />
        <input
          className="tr-input"
          type="range"
          min={0}
          max={last}
          step={1}
          value={lo}
          aria-label="Minimum cook time"
          aria-valuetext={lo === 0 ? "No minimum" : stepText(steps, lo)}
          style={{ zIndex: loOnTop ? 3 : 2 }}
          onPointerDown={onPointerDown}
          onChange={(e) => onThumbChange("lo", e.target.value)}
          onKeyUp={commit}
          onBlur={commit}
        />
        <input
          className="tr-input"
          type="range"
          min={0}
          max={last}
          step={1}
          value={hi}
          aria-label="Maximum cook time"
          aria-valuetext={hi >= last ? "No maximum" : stepText(steps, hi)}
          style={{ zIndex: 2 }}
          onPointerDown={onPointerDown}
          onChange={(e) => onThumbChange("hi", e.target.value)}
          onKeyUp={commit}
          onBlur={commit}
        />
      </div>
      <div className="tr-ticks" aria-hidden="true">
        {[0, 30, 60, 120, steps[last]]
          .filter((m, i, arr) => steps.includes(m) && arr.indexOf(m) === i)
          .map((m) => (
            <span key={m} style={{ left: pos(steps.indexOf(m)) }}>
              {m === steps[last] ? `${m}+` : m}
            </span>
          ))}
      </div>
    </div>
  );
}
