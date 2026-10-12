// Pure decisions for components/ViewportFix.jsx. No DOM access here, so node
// can test them (scripts/test-viewport.mjs). Every function answers "do
// nothing" when its inputs are missing or odd.

export const KEYBOARD_MIN_PX = 120; // px; a shrink smaller than this is not a keyboard
export const FOCUS_GRACE_MS = 1500; // hide right after focus, before the keyboard has resized anything
export const MIN_GAP_PX = 40; // px; smaller gaps are rubber-band overscroll
export const MAX_GAP_PX = 450; // px; a keyboard with the suggestion bar is ~340 on current iPhones
export const MIN_OFFSET_PX = 2; // px; visualViewport.offsetTop that should be 0 once the page is at rest
export const MAX_NUDGES = 2;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Should the bottom bars be hidden right now? True only in a standalone app
// while a field is being edited and the keyboard is (or is about to be) up.
// A focused field without a keyboard (hardware keyboard, stale focus) stops
// hiding the bars after FOCUS_GRACE_MS.
export function shouldHide({
  standalone,
  editing,
  msSinceFocus,
  vvHeight,
  baselineHeight,
}) {
  if (!standalone || !editing) return false;
  const h = num(vvHeight);
  const base = num(baselineHeight);
  if (h !== null && base !== null && base - h >= KEYBOARD_MIN_PX) return true;
  const since = num(msSinceFocus);
  return since === null || since < FOCUS_GRACE_MS;
}

// Is WebKit's stale viewport state present? Used only to decide whether to
// ask WebKit to re-sync; it never moves anything. Returns { stuck, reason, gap }.
export function checkStuck({
  standalone,
  editing,
  vvHeight,
  vvOffsetTop,
  vvScale,
  clientHeight,
}) {
  const none = { stuck: false, reason: "", gap: 0 };
  if (!standalone || editing) return none;
  const h = num(vvHeight);
  const top = num(vvOffsetTop);
  const ch = num(clientHeight);
  const scale = num(vvScale);
  if (h === null || top === null || ch === null || scale === null) return none;
  if (scale > 1.01) return none; // pinch zoom shifts every number
  const gap = Math.round(top + h - ch);
  if (gap >= MIN_GAP_PX && gap <= MAX_GAP_PX) return { stuck: true, reason: "gap", gap };
  if (top >= MIN_OFFSET_PX && top <= MAX_GAP_PX) return { stuck: true, reason: "offset", gap };
  return { ...none, gap };
}

// After the settle delay: ask WebKit to re-sync once or twice, then give up
// and show the bars at bottom: 0. Giving up is always the safe answer.
export function nextStep({ stuck, nudges }) {
  return stuck && nudges < MAX_NUDGES ? "nudge" : "show";
}
