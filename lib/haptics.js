"use client";

/*
 * A short vibration on a tap, where the Vibration API exists (Android).
 * Call it inside a tap handler.
 *
 * iPhone has no Vibration API. Its haptic tick comes from components/
 * Haptic.jsx, a label over the tapped element: since iOS 26.5 Safari only
 * ticks for a real finger tap, so there is nothing to do from script here.
 */
export function haptic() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch {
    // no haptics here
  }
}
