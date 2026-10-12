"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatIngredient } from "../../lib/ingredients.mjs";
import { haptic } from "../../lib/haptics";
import { useWakeLock } from "../../lib/useWakeLock";
import { lockScroll, unlockScroll } from "../BottomSheet";
import StepText, { stepIngredients } from "./StepText";
import Haptic from "../Haptic";

/*
 * Full screen cooking view: one step per screen, swiped sideways (CSS scroll
 * snap) or moved with the buttons and arrow keys. The first screen lists the
 * ingredients to get ready, the last one says enjoy. The screen stays on
 * (Wake Lock) and the open step is remembered for this recipe until the tab
 * closes, so leaving and coming back lands on the same step.
 */

const stepKey = (slug) => `mob-recipes:cook-step:${slug}`;

function readStep(slug) {
  try {
    const n = Number(window.sessionStorage.getItem(stepKey(slug)));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveStep(slug, n) {
  try {
    window.sessionStorage.setItem(stepKey(slug), String(n));
  } catch {
    // storage unavailable
  }
}

const smooth = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

export default function CookMode({ recipe, ingredients, steps, servings, onClose }) {
  const total = steps.length + 2; // ingredients, steps, done
  const [index, setIndex] = useState(() => Math.min(readStep(recipe.slug), total - 1));
  const [have, setHave] = useState(() => new Set());
  const [closing, setClosing] = useState(false);
  const trackRef = useRef(null);
  const closeRef = useRef(null);
  const indexRef = useRef(index);

  useWakeLock(true);

  useLayoutEffect(() => {
    const track = trackRef.current;
    // Start on the remembered step without an animation.
    track.scrollLeft = indexRef.current * track.clientWidth;
    const back = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    lockScroll();
    return () => {
      unlockScroll();
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  // Follow the swipe: the slide closest to the left edge is the current one.
  useEffect(() => {
    const track = trackRef.current;
    let raf = 0;
    const read = () => {
      raf = 0;
      const n = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      const next = Math.min(total - 1, Math.max(0, n));
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
        saveStep(recipe.slug, next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    // Rotating the phone changes the slide width: stay on the same slide.
    const onResize = () => {
      track.scrollLeft = indexRef.current * track.clientWidth;
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [recipe.slug, total]);

  function go(n) {
    const track = trackRef.current;
    const next = Math.min(total - 1, Math.max(0, n));
    haptic();
    track.scrollTo({ left: next * track.clientWidth, behavior: smooth() });
  }

  function close() {
    if (closing) return;
    setClosing(true);
    // Matches the .ck.is-closing animation in globals.css.
    window.setTimeout(onClose, 180);
  }

  const latest = useRef({ go, close });
  useEffect(() => {
    latest.current = { go, close };
  });
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") latest.current.close();
      else if (e.key === "ArrowRight") latest.current.go(indexRef.current + 1);
      else if (e.key === "ArrowLeft") latest.current.go(indexRef.current - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleHave(i) {
    haptic();
    setHave((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  }

  const stepNo = index - 1; // 0 based step, -1 on the ingredients screen
  const label =
    index === 0 ? "Get ready" : index === total - 1 ? "Done" : `Step ${stepNo + 1} of ${steps.length}`;

  return createPortal(
    <div
      className={`ck ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Cooking ${recipe.name}`}
      style={{ "--ck-progress": index / (total - 1) }}
    >
      <header className="ck-top">
        <button ref={closeRef} type="button" className="ck-close" onClick={close} aria-label="Close cooking view">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="ck-heading">
          <span className="ck-label" aria-live="polite">
            {label}
          </span>
          <span className="ck-name">{recipe.name}</span>
        </div>
      </header>
      <div className="ck-bar" aria-hidden="true">
        <span className="ck-bar-fill" />
      </div>

      <div className="ck-track" ref={trackRef}>
        <section className="ck-slide" aria-label="Ingredients">
          <div className="ck-body">
            <p className="ck-kicker">Before you start</p>
            <h2 className="ck-title">Get everything ready</h2>
            <p className="ck-note">
              For {servings} serving{servings === 1 ? "" : "s"}. Tick things off as you go.
            </p>
            <ul className="ck-have">
              {ingredients.map((ing, i) => (
                <li key={i}>
                  <label className={have.has(i) ? "is-on" : ""}>
                    <input type="checkbox" checked={have.has(i)} onChange={() => toggleHave(i)} />
                    <span>{formatIngredient(ing)}</span>
                  </label>
                  <Haptic clickInput />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {steps.map((segments, i) => {
          const items = stepIngredients(segments);
          return (
            <section
              key={i}
              className="ck-slide"
              aria-label={`Step ${i + 1} of ${steps.length}`}
            >
              <div className="ck-body">
                <p className="ck-kicker">Step {i + 1}</p>
                {items.length ? (
                  <ul className="ck-chips" aria-label="You need">
                    {items.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="ck-text">
                  <StepText segments={segments} />
                </p>
              </div>
            </section>
          );
        })}

        <section className="ck-slide ck-done" aria-label="Done">
          <div className="ck-body">
            <span className="ck-done-emoji" aria-hidden="true">
              🍽️
            </span>
            <h2 className="ck-title">Enjoy your meal</h2>
            <p className="ck-note">That was the last step.</p>
            <button type="button" className="primary-btn" onClick={close}>
              Back to the recipe
            </button>
          </div>
        </section>
      </div>

      <nav className="ck-nav" aria-label="Steps">
        <button type="button" className="pill-btn" onClick={() => go(index - 1)} disabled={index === 0}>
          ← Back
          <Haptic />
        </button>
        <button
          type="button"
          className="primary-btn ck-next"
          onClick={() => (index === total - 1 ? close() : go(index + 1))}
        >
          {index === 0 ? "Start" : index === total - 1 ? "Close" : index === total - 2 ? "Finish" : "Next →"}
          <Haptic />
        </button>
      </nav>
    </div>,
    document.body,
  );
}
