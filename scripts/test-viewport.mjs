#!/usr/bin/env node
// Exercises lib/viewport.mjs (pure viewport decisions). No DOM.
// Usage: node scripts/test-viewport.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import {
  FOCUS_GRACE_MS,
  MAX_NUDGES,
  checkStuck,
  nextStep,
  shouldHide,
} from "../lib/viewport.mjs";

const hide = (o) =>
  shouldHide({
    standalone: true,
    editing: true,
    msSinceFocus: 5000,
    vvHeight: 844,
    baselineHeight: 844,
    ...o,
  });

// shouldHide: never outside standalone or when not editing
assert.equal(hide({ standalone: false, vvHeight: 500 }), false);
assert.equal(hide({ editing: false, vvHeight: 500 }), false);
// keyboard up (viewport shrunk) hides, however long ago the focus was
assert.equal(hide({ vvHeight: 500 }), true);
// just focused, keyboard not resized yet: hide
assert.equal(hide({ msSinceFocus: 100 }), true);
// focused for a long time with no keyboard: do not hide
assert.equal(hide({ msSinceFocus: FOCUS_GRACE_MS + 1 }), false);
// small shrink (toolbar) is not a keyboard
assert.equal(hide({ vvHeight: 800 }), false);
// missing numbers: only the grace window applies
assert.equal(hide({ vvHeight: undefined, msSinceFocus: 10 }), true);
assert.equal(hide({ vvHeight: NaN, msSinceFocus: 9999 }), false);
assert.equal(hide({ msSinceFocus: undefined }), true);

const stuck = (o) =>
  checkStuck({
    standalone: true,
    editing: false,
    vvHeight: 844,
    vvOffsetTop: 0,
    vvScale: 1,
    clientHeight: 844,
    ...o,
  });

// healthy page
assert.deepEqual(stuck({}), { stuck: false, reason: "", gap: 0 });
// visible area extends below the layout viewport by a keyboard sized gap
assert.deepEqual(stuck({ clientHeight: 500 }), { stuck: true, reason: "gap", gap: 344 });
// offsetTop that did not reset
assert.equal(stuck({ vvOffsetTop: 30, vvHeight: 814 }).reason, "offset");
// rubber band sized wobble is ignored
assert.equal(stuck({ vvOffsetTop: 1 }).stuck, false);
assert.equal(stuck({ clientHeight: 820 }).stuck, false);
// absurd gap is not this bug
assert.equal(stuck({ clientHeight: 100 }).stuck, false);
// guards
assert.equal(stuck({ standalone: false, clientHeight: 500 }).stuck, false);
assert.equal(stuck({ editing: true, clientHeight: 500 }).stuck, false);
assert.equal(stuck({ vvScale: 2, clientHeight: 500 }).stuck, false);
assert.equal(stuck({ vvHeight: undefined }).stuck, false);
assert.equal(stuck({ vvOffsetTop: null, clientHeight: 500 }).stuck, false);

// nextStep: hard cap, always ends in "show"
assert.equal(nextStep({ stuck: false, nudges: 0 }), "show");
assert.equal(nextStep({ stuck: true, nudges: 0 }), "nudge");
assert.equal(nextStep({ stuck: true, nudges: MAX_NUDGES - 1 }), "nudge");
assert.equal(nextStep({ stuck: true, nudges: MAX_NUDGES }), "show");
let n = 0;
while (nextStep({ stuck: true, nudges: n }) === "nudge") n += 1;
assert.equal(n, MAX_NUDGES);

console.log("viewport: all assertions passed");
