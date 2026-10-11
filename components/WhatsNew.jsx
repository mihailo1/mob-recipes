"use client";

import { useEffect, useState } from "react";
import { useKitchen } from "../lib/store";
import { setNotice } from "../lib/notices";
import { CHANGELOG } from "../lib/changelog";
import { APP_VERSION, compareVersions, shortVersion } from "../lib/version";

const SEEN_KEY = "mob-recipes:last-seen-version";
const DELAY_MS = 1200; // let the update check run first (it has priority)

function readSeen() {
  try {
    return { ok: true, value: window.localStorage.getItem(SEEN_KEY) };
  } catch {
    return { ok: false, value: null };
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    // ignore
  }
}

/*
 * "What's new" card, once per version.
 * - Brand new install (no saved data, no last-seen version): record silently.
 * - Old-app users (they have favorites/kitchen data but no last-seen
 *   version): show the current release.
 * - Otherwise show every release newer than the last seen one.
 * Recorded as seen when dismissed.
 */
export default function WhatsNew({ blocked }) {
  const { ready, favorites, pool, lastRecipe } = useKitchen();
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    if (!ready) return undefined;
    const seen = readSeen();
    if (!seen.ok) return undefined; // no storage: never nag
    let list = [];
    if (seen.value === null) {
      const hasData = favorites.size > 0 || pool.size > 0 || !!lastRecipe;
      if (!hasData) {
        markSeen();
        return undefined;
      }
      list = CHANGELOG.filter((e) => e.version === APP_VERSION).slice(0, 1);
    } else if (compareVersions(seen.value, APP_VERSION) < 0) {
      list = CHANGELOG.filter(
        (e) =>
          compareVersions(e.version, seen.value) > 0 &&
          compareVersions(e.version, APP_VERSION) <= 0,
      );
    }
    if (!list.length) {
      if (seen.value !== APP_VERSION) markSeen();
      return undefined;
    }
    const t = setTimeout(() => setEntries(list), DELAY_MS);
    return () => clearTimeout(t);
    // Decide once, when the store becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const visible = !!entries && !blocked;
  useEffect(() => {
    setNotice({ whatsNew: !!entries });
    return () => setNotice({ whatsNew: false });
  }, [entries]);

  if (!visible) return null;

  const dismiss = () => {
    markSeen();
    setEntries(null);
  };
  const [latest] = entries;

  return (
    <section className="wn" aria-labelledby="wn-title">
      <div className="wn-head">
        <div>
          <p className="wn-kicker">What&apos;s new in {shortVersion(latest.version)}</p>
          <h2 id="wn-title" className="wn-title">
            {latest.title}
          </h2>
        </div>
        <button type="button" className="wn-x" aria-label="Dismiss what's new" onClick={dismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ul className="wn-list">
        {entries.flatMap((e) => e.items.map((item) => <li key={`${e.version}:${item}`}>{item}</li>))}
      </ul>
      <button type="button" className="wn-ok" onClick={dismiss}>
        Got it
      </button>
    </section>
  );
}
