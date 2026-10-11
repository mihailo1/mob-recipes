"use client";

import { useState } from "react";
import { acceptUpdate, postponeUpdate, useNotices } from "../lib/notices";
import { shortVersion } from "../lib/version";

// Small non-blocking banner shown while a new service worker is waiting.
// Nothing happens until the user taps "Update"; "Later" hides it until the
// next app open. Favorites, kitchen and the current recipe live in
// localStorage and are not touched by an update.
export default function UpdatePrompt() {
  const { update } = useNotices();
  const [busy, setBusy] = useState(false);
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
            if (acceptUpdate()) setBusy(true);
          }}
        >
          {busy ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}
