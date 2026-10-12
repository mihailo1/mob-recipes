"use client";

/*
 * iPhone haptic tick on a real tap.
 *
 * iOS has no Vibration API, but Safari ticks when a native switch
 * (<input type="checkbox" switch>, iOS 18+) is toggled by the user. Since iOS
 * 26.5 a switch toggled from script stays silent, so the tap itself has to
 * land on a <label> that wraps a hidden switch: WebKit then forwards the
 * trusted tap to the switch and plays the tick.
 *
 * Put <Haptic /> inside a button (or any element with a click handler): it
 * covers the element, the tap bubbles to the element's own onClick as usual.
 * For a row whose action is not on an ancestor (a checkbox inside its own
 * label), pass clickInput or onTap. The parent must not be position: static
 * (globals.css makes :has(> .hx) relative).
 * Android vibrates through lib/haptics.js instead.
 */
// clickInput: the row's own checkbox (a sibling) gets the tap instead.
export default function Haptic({ onTap, clickInput = false }) {
  return (
    <label
      className="hx"
      aria-hidden="true"
      onClick={(e) => {
        // The click WebKit forwards to the switch bubbles here too: once only.
        if (e.target !== e.currentTarget) return;
        if (clickInput) {
          e.currentTarget.parentElement?.querySelector('input[type="checkbox"]:not(.hx-switch)')?.click();
        }
        onTap?.(e);
      }}
    >
      <input
        type="checkbox"
        switch=""
        tabIndex={-1}
        className="hx-switch"
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  );
}
