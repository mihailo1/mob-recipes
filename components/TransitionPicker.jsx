"use client";

import Haptic from "./Haptic";
import { haptic } from "../lib/haptics";
import {
  TRANSITION_STYLES,
  setTransitionStyle,
  useTransitionStyle,
} from "../lib/transitionStyle";

// Trial card in My kitchen: pick how pages change, then open a recipe and
// switch tabs to feel it. Goes away once one style is chosen for good.
export default function TransitionPicker() {
  const style = useTransitionStyle();
  const hint = TRANSITION_STYLES.find((s) => s.id === style)?.hint;

  return (
    <section className="pt-card tp-card" aria-labelledby="tp-title">
      <h2 className="pt-title" id="tp-title">
        Page animation
      </h2>
      <p className="pt-text">Try each one: open a recipe, go back, switch tabs.</p>
      <div className="tp-seg" role="radiogroup" aria-labelledby="tp-title">
        {TRANSITION_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={style === s.id}
            className="tp-opt"
            onClick={() => {
              haptic();
              setTransitionStyle(s.id);
            }}
          >
            {s.label}
            <Haptic />
          </button>
        ))}
      </div>
      <p className="pt-note">{hint}</p>
    </section>
  );
}
