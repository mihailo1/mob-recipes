"use client";

import { showToast } from "../Toast";

/*
 * Sharing helpers. shareOrCopy opens the system share sheet (on iPhone:
 * AirDrop, Messages, Telegram...) where there is one, and copies the link
 * everywhere else. It must run inside a tap: iOS refuses to open the sheet
 * after an await.
 */

export async function shareOrCopy({ title, url }) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // NotAllowedError etc: fall back to copying
    }
  }
  return copyLink(url);
}

// Older path for browsers that block the async clipboard (no permission,
// page not focused). Must run inside the tap as well.
function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export async function copyLink(url) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch {
    ok = legacyCopy(url);
  }
  if (ok) showToast({ message: "Link copied", icon: "check", duration: 2500 });
  else showToast({ message: "Couldn't copy the link", duration: 3000 });
  return ok ? "copied" : "failed";
}

export const canShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const SHARE_ERRORS = {
  429: "You've made a lot of links. Try again in an hour.",
  503: "Sharing isn't available right now. Try again later.",
};

// One link per distinct content for a while, so opening Share twice (or
// React's dev double effects) does not make two links.
const made = new Map(); // doc json -> { at, promise }
const REUSE_MS = 30 * 60 * 1000;

/** Stores a shared folder doc (lib/share.mjs) and resolves to its link. */
export function createShareLink(doc) {
  const key = JSON.stringify(doc);
  const hit = made.get(key);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.promise;
  const promise = (async () => {
    let res;
    try {
      res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
        cache: "no-store",
      });
    } catch {
      throw new Error("Couldn't reach the server. Check your connection and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.id !== "string") {
      throw new Error(SHARE_ERRORS[res.status] || "Couldn't make a link. Try again.");
    }
    return `${window.location.origin}/s/${data.id}`;
  })();
  made.set(key, { at: Date.now(), promise });
  promise.catch(() => made.delete(key));
  return promise;
}

/** Safari on iPhone or iPad, not the app opened from the Home Screen. */
export function isIOSBrowserTab() {
  try {
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone =
      navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone;
  } catch {
    return false;
  }
}
