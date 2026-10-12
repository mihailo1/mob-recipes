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
 */

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
async function getRegistration() {
  if (process.env.NODE_ENV !== "production") return null;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function readStatus() {
  const res = await fetch("/api/push/status", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return { configured: data?.configured === true, full: data?.full === true };
}

const ERRORS = {
  409: `The ${MAX_DEVICES} device limit is reached.`,
  429: "Too many changes today, try again tomorrow.",
};
const GENERIC_ERROR = "Couldn't turn on alerts. Try again later.";

export default function PushToggle() {
  // view: "loading" | "hidden" | "ios-install" | "unsupported" | "denied" | "off" | "on"
  const [view, setView] = useState("loading");
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const status = await readStatus();
      if (!alive.current || busyRef.current) return;
      if (!status || !status.configured) {
        setView("hidden");
        return;
      }
      setFull(status.full);

      if (!canPush()) {
        setView(isIOS() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      const reg = await getRegistration();
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
      setView(sub && Notification.permission === "granted" ? "on" : "off");
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
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  function setWorking(value) {
    busyRef.current = value;
    setBusy(value);
  }

  async function turnOn() {
    // Must be the first call so iOS still sees the tap as a user gesture.
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
      const reg = await getRegistration();
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        status = res.status;
        if (res.ok) {
          setFull(false);
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
      if (status === 409) setFull(true);
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
      const reg = await getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        try {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        } catch {
          // The server also drops dead endpoints on its own.
        }
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
    const blocked = full;
    body = (
      <>
        <button
          type="button"
          className="pt-btn"
          onClick={turnOn}
          disabled={busy || blocked}
        >
          {busy ? "Turning on…" : "Notify me about updates"}
        </button>
        {blocked ? (
          <p className="pt-note">The device limit ({MAX_DEVICES}) is reached.</p>
        ) : null}
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
