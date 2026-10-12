"use client";

/*
 * A short tap of haptic feedback. Call it inside a tap handler.
 *
 * Android and other browsers with the Vibration API get vibrate(). iPhone has
 * no Vibration API, but since iOS 18 Safari plays the system haptic when a
 * native switch (<input type="checkbox" switch>) is toggled, also from a
 * click() on its label during a user gesture. So we toggle a hidden one.
 * Elsewhere this does nothing.
 */

let label = null;

function hiddenSwitch() {
  if (label?.isConnected) return label;
  label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  // Keep these synthetic clicks away from app wide click listeners.
  label.addEventListener("click", (e) => e.stopPropagation());
  document.head.appendChild(label);
  return label;
}

export function haptic() {
  if (typeof window === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    hiddenSwitch().click();
  } catch {
    // no haptics here
  }
}
