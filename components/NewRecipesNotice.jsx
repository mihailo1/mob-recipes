"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRecipeIndex } from "../lib/queries";

const KNOWN_KEY = "mob-recipes:known-recipes";
const SHOWN_KEY = "mob-recipes:new-recipes-shown-at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DELAY_MS = 2000; // after the update prompt and What's new had a chance
const MAX_LINKS = 5;

/*
 * The known recipe set is stored compactly as sorted 32-bit FNV-1a hashes of
 * the slugs, base64 encoded (~22KB for 4100 recipes instead of ~100KB of
 * slugs). A collision would only hide one new recipe from the notice.
 */
function hashSlug(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function encodeKnown(slugs) {
  const arr = Uint32Array.from(new Set(slugs.map(hashSlug))).sort();
  const bytes = new Uint8Array(arr.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return JSON.stringify({ v: 1, n: arr.length, h: btoa(bin) });
}

function decodeKnown(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.h !== "string") return null;
    const bin = atob(data.h);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Set(new Uint32Array(bytes.buffer, 0, bytes.length >> 2));
  } catch {
    return null;
  }
}

function get(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined; // storage unavailable
  }
}

function set(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/*
 * "N new recipes since your last visit".
 * - First visit ever: silently remember the current recipes.
 * - Later: if the index has recipes we have not seen and the last notice was
 *   7+ days ago (or never), show it once and remember the new set. While in
 *   the cooldown nothing is recorded, so new recipes add up for next time.
 */
export default function NewRecipesNotice({ blocked }) {
  const { data: index } = useRecipeIndex();
  const [fresh, setFresh] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (blocked || fresh || !Array.isArray(index) || !index.length) return undefined;
    const raw = get(KNOWN_KEY);
    if (raw === undefined) return undefined;
    const slugs = index.map((r) => r.slug).filter((s) => typeof s === "string");
    const known = raw ? decodeKnown(raw) : null;
    if (!known) {
      set(KNOWN_KEY, encodeKnown(slugs));
      return undefined;
    }
    const shownAt = Number(get(SHOWN_KEY)) || 0;
    if (Date.now() - shownAt < COOLDOWN_MS) return undefined;
    const added = index.filter((r) => typeof r.slug === "string" && !known.has(hashSlug(r.slug)));
    if (!added.length) return undefined;
    const t = setTimeout(() => {
      set(KNOWN_KEY, encodeKnown(slugs));
      set(SHOWN_KEY, String(Date.now()));
      setFresh({ count: added.length, items: added.slice(0, MAX_LINKS) });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [index, blocked, fresh]);

  if (!fresh || blocked) return null;

  const dismiss = () => setFresh(null);
  const { count, items } = fresh;

  return (
    <section className="nr" aria-label="New recipes">
      <div className="nr-head">
        <p className="nr-text">
          {count === 1 ? "1 new recipe" : `${count} new recipes`} since your last visit
        </p>
        {!open ? (
          <button type="button" className="nr-btn" onClick={() => setOpen(true)}>
            Show
          </button>
        ) : null}
        <button type="button" className="nr-x" aria-label="Dismiss new recipes" onClick={dismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {open ? (
        <ul className="nr-list">
          {items.map((r) => (
            <li key={r.slug}>
              <Link href={`/recipes/${r.slug}`} className="nr-link" onClick={dismiss}>
                {r.name || r.slug}
              </Link>
            </li>
          ))}
          {count > items.length ? (
            <li className="nr-more">and {count - items.length} more</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
