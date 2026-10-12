"use client";

import { useId } from "react";

/*
 * One method step with its ingredient mentions highlighted (segments from
 * findIngredientMentions). Tapping a highlighted ingredient shows its amount
 * in a small bubble: the Popover API opens and closes it (tap outside or Esc
 * closes it), CSS Anchor Positioning places it above the word (iOS 26+;
 * older browsers show it at the bottom of the screen, see globals.css).
 */
export default function StepText({ segments }) {
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  return segments.map((seg, j) => {
    if (!seg.match) return <span key={j}>{seg.text}</span>;
    if (!seg.tooltip) {
      return (
        <mark key={j} className="ingredient-mark">
          {seg.text}
        </mark>
      );
    }
    const id = `ing-${base}-${j}`;
    const anchor = `--${id}`;
    return (
      <span key={j} className="ing-wrap">
        <button
          type="button"
          className="ingredient-mark"
          popoverTarget={id}
          style={{ anchorName: anchor }}
        >
          {seg.text}
        </button>
        <span id={id} popover="auto" className="ing-pop" style={{ positionAnchor: anchor }}>
          {seg.tooltip} {seg.text}
        </span>
      </span>
    );
  });
}

/** "200g chickpeas" style lines for the ingredients a step mentions. */
export function stepIngredients(segments) {
  return [
    ...new Set(segments.filter((s) => s.match && s.tooltip).map((s) => `${s.tooltip} ${s.text}`)),
  ];
}
