"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_DEVICES, VAPID_PUBLIC_KEY } from "../lib/push/config";

/*
 * "Update alerts" card (My kitchen). Opt-in Web Push: the server sends at most
 * one notification a day when a new version is ready.
 *
 * The real state is always read from the browser (Notification.permission and
 * pushManager.getSubscription()), never from localStorage. The card renders
 * nothing while loading, when the server has no keys configured, in dev (no
 * service worker), or if anything unexpected throws.
 *
 * When the server sets SUBSCRIBE_CODE, the owner types the access code once
 * per device. It is kept in localStorage so turning off and the daily re-sync
 * (which heals a wiped or pruned server list) can send it again.
 */

const CODE_KEY = "mob-recipes:push-code";
const SYNCED_KEY = "mob-recipes:push-synced";
const SYNC_EVERY_MS = 24 * 60 * 60 * 1000;

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the feature still works for this session.
  }
}

function codeHeaders(code) {
  const headers = { "Content-Type": "application/json" };
  if (code) headers["x-push-code"] = code;
  return headers;
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOS() {
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  try {
    return (
      navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}

function canPush() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// The worker only exists in production builds. Never hang waiting for it.
// Pending timers are tracked in `timers` so an unmount can clear them.
async function getRegistration(timers) {
  if (process.env.NODE_ENV !== "production") return null;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 5000);
    timers.add(timer);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
    timers.delete(timer);
  }
}

async function readStatus() {
  const res = await fetch("/api/push/status", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return { configured: data?.configured === true, codeRequired: data?.codeRequired === true };
}

// Posts an existing subscription again, at most once a day, so a server list
// that was wiped or pruned heals by itself. Failures are ignored.
async function resync(sub) {
  const last = Number(readLocal(SYNCED_KEY));
  if (Number.isFinite(last) && last > 0 && Date.now() - last < SYNC_EVERY_MS) return;
  writeLocal(SYNCED_KEY, String(Date.now()));
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: codeHeaders(readLocal(CODE_KEY)),
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (res.status === 401) writeLocal(CODE_KEY, null);
  } catch {
    // ignore
  }
}

const ERRORS = {
  401: "That code isn't right.",
  409: `The ${MAX_DEVICES} device limit is reached.`,
  429: "Too many changes today, try again tomorrow.",
};
const GENERIC_ERROR = "Couldn't turn on alerts. Try again later.";

export default function PushToggle() {
  // view: "loading" | "hidden" | "ios-install" | "unsupported" | "denied" | "off" | "on"
  const [view, setView] = useState("loading");
  const [codeRequired, setCodeRequired] = useState(false);
  const [code, setCode] = useState("");
  const [codeMissing, setCodeMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const busyRef = useRef(false);
  const timers = useRef(new Set());

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const status = await readStatus();
      if (!alive.current || busyRef.current) return;
      if (!status || !status.configured) {
        setView("hidden");
        return;
      }
      setCodeRequired(status.codeRequired);

      if (!canPush()) {
        setView(isIOS() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      const reg = await getRegistration(timers.current);
      if (!alive.current || busyRef.current) return;
      if (!reg) {
        setView("hidden");
        return;
      }
      if (Notification.permission === "denied") {
        setView("denied");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!alive.current || busyRef.current) return;
      // A leftover subscription without permission is not usable.
      const on = !!sub && Notification.permission === "granted";
      setView(on ? "on" : "off");
      if (on) resync(sub);
    } catch {
      if (alive.current && !busyRef.current) setView("hidden");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const pending = timers.current;
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, [refresh]);

  function setWorking(value) {
    busyRef.current = value;
    setBusy(value);
  }

  async function turnOn() {
    const typed = codeRequired ? code.trim() : "";
    if (codeRequired && !typed) {
      setCodeMissing(true);
      setMessage("Enter the access code first.");
      return;
    }
    setCodeMissing(false);
    // Must be the first await so iOS still sees the tap as a user gesture.
    let asked;
    try {
      asked = Notification.requestPermission();
    } catch {
      setMessage(GENERIC_ERROR);
      return;
    }
    setWorking(true);
    setMessage("");
    let sub = null;
    try {
      const permission = await asked;
      if (permission !== "granted") {
        if (permission === "denied") setView("denied");
        else setMessage("Alerts stay off until you allow notifications.");
        return;
      }
      const reg = await getRegistration(timers.current);
      if (!reg) throw new Error("no-service-worker");
      sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      let status = 0;
      try {
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: codeHeaders(typed),
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        status = res.status;
        if (res.ok) {
          writeLocal(CODE_KEY, typed || null);
          writeLocal(SYNCED_KEY, String(Date.now()));
          setCode("");
          setView("on");
          return;
        }
      } catch {
        // Network failure: handled below like any other server error.
      }
      // No half-registered state: drop the local subscription again.
      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }
      sub = null;
      if (status === 401) {
        writeLocal(CODE_KEY, null);
        setCodeMissing(true);
      }
      setMessage(ERRORS[status] || GENERIC_ERROR);
      setView("off");
    } catch {
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // ignore
        }
      }
      setMessage(GENERIC_ERROR);
    } finally {
      if (alive.current) setWorking(false);
    }
  }

  async function turnOff() {
    setWorking(true);
    setMessage("");
    try {
      const reg = await getRegistration(timers.current);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        try {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: codeHeaders(readLocal(CODE_KEY)),
            body: JSON.stringify({ endpoint }),
          });
        } catch {
          // The server also drops dead endpoints on its own.
        }
        writeLocal(SYNCED_KEY, null);
      }
      setView("off");
    } catch {
      setMessage("Couldn't turn off alerts. Try again later.");
    } finally {
      if (alive.current) setWorking(false);
    }
  }

  if (view === "loading" || view === "hidden") return null;

  let body;
  if (view === "ios-install") {
    body = (
      <p className="pt-note">
        To get alerts, add this app to your Home Screen first, then open it from
        there.
      </p>
    );
  } else if (view === "unsupported") {
    body = <p className="pt-note">This browser can&apos;t receive push notifications.</p>;
  } else if (view === "denied") {
    body = (
      <p className="pt-note">
        Notifications are blocked. You can allow them in Settings &gt;
        Notifications.
      </p>
    );
  } else if (view === "on") {
    body = (
      <div className="pt-row">
        <span className="pt-state">On for this device</span>
        <button
          type="button"
          className="pt-link"
          onClick={turnOff}
          disabled={busy}
        >
          {busy ? "Turning off…" : "Turn off"}
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {codeRequired ? (
          <div className="pt-field">
            <label className="pt-label" htmlFor="pt-code">
              Access code
            </label>
            <input
              id="pt-code"
              className="pt-input"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeMissing) setCodeMissing(false);
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              enterKeyHint="done"
              maxLength={200}
              aria-invalid={codeMissing || undefined}
              disabled={busy}
            />
          </div>
        ) : null}
        <button
          type="button"
          className="pt-btn"
          onClick={turnOn}
          disabled={busy}
        >
          {busy ? "Turning on…" : "Notify me about updates"}
        </button>
      </>
    );
  }

  return (
    <section className="pt-card" aria-labelledby="pt-title">
      <h2 className="pt-title" id="pt-title">
        Update alerts
      </h2>
      <p className="pt-text">
        Get a notification on this device when a new version is ready. At most
        one a day.
      </p>
      {body}
      <p className="pt-note pt-live" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
