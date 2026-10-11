"use client";

import { useEffect, useState } from "react";
import { acceptUpdate, postponeUpdate, useNotices } from "../lib/notices";
import { shortVersion } from "../lib/version";

const UPDATE_TIMEOUT_MS = 6000;

// Small non-blocking banner shown while a new service worker is waiting.
// Nothing happens until the user taps "Update"; "Later" hides it until the
// next app open. Favorites, kitchen and the current recipe live in
// localStorage and are not touched by an update.
export default function UpdatePrompt() {
  const { update } = useNotices();
  const [busy, setBusy] = useState(false);
  const [stalled, setStalled] = useState(false);

  // If the new worker never takes over (no controllerchange), stop spinning
  // and let the user try again.
  useEffect(() => {
    if (!busy) return undefined;
    const t = setTimeout(() => {
      setBusy(false);
      setStalled(true);
    }, UPDATE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [busy]);

  if (!update) return null;

  const label = update.version
    ? `New version ${shortVersion(update.version)} available`
    : "A new version is available";

  return (
    <div className="upd" role="status" aria-live="polite">
      <p className="upd-text">{label}</p>
      <div className="upd-actions">
        <button type="button" className="upd-btn" onClick={postponeUpdate} disabled={busy}>
          Later
        </button>
        <button
          type="button"
          className="upd-btn upd-btn-primary"
          disabled={busy}
          onClick={() => {
            if (acceptUpdate()) {
              setStalled(false);
              setBusy(true);
            }
          }}
        >
          {busy ? "Updating…" : stalled ? "Try again" : "Update"}
        </button>
      </div>
    </div>
  );
}
