"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  joinWithCode,
  linkSpace,
  pairApi,
  readLink,
  requestSync,
  unlink,
  useSyncState,
} from "../lib/sync-client";
import { pairUrl } from "../lib/qr.mjs";
import QrCode from "./share/QrCode";
import { openScanner } from "./share/QrScanner";

/*
 * "Sync your devices" card (bottom of My kitchen and Saved).
 *
 * Linking: one device taps "Show a code" and gets 6 digits and a QR code for
 * 10 minutes; the other scans the QR in the app or types the digits. The showing device joins the space right
 * away (so its recipes are already there when the other one joins) and
 * leaves it again if the code is cancelled or expires unused.
 */

const POLL_EVERY_S = 2;

const ERRORS = {
  429: "Too many codes. Wait a few minutes and try again.",
  503: "Sync isn't available right now. Try again later.",
};
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

const formatCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;

function left(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function statusText(status) {
  if (status === "syncing") return "Syncing…";
  if (status === "offline") return "Offline. Changes sync when you're back online.";
  if (status === "error") return "Couldn't sync just now. Trying again soon.";
  if (status === "off") return "Sync isn't available right now.";
  return "Up to date.";
}

export default function SyncCard() {
  const { linked, status } = useSyncState();
  const [view, setView] = useState("main"); // main | code | enter | done
  const [pair, setPair] = useState(null); // { code, space, expires, wasLinked }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const inputRef = useRef(null);

  // While a code is on screen: countdown, and notice when it gets used.
  useEffect(() => {
    if (view !== "code" || !pair) return undefined;
    let ticks = 0;
    let alive = true;
    const finish = (state) => {
      if (state === "used") {
        setView("done");
        requestSync();
      } else {
        if (!pair.wasLinked) unlink();
        setView("main");
        setMessage("The code expired. Show a new one to link a device.");
      }
    };
    const id = window.setInterval(async () => {
      const t = Date.now();
      setNow(t);
      if (t >= pair.expires) {
        window.clearInterval(id);
        finish("expired");
        return;
      }
      ticks += 1;
      if (ticks % POLL_EVERY_S || document.visibilityState !== "visible") return;
      try {
        const { data } = await pairApi.status(pair.code, pair.space);
        if (!alive) return;
        if (data.state === "used" || data.state === "expired") {
          window.clearInterval(id);
          finish(data.state);
        }
      } catch {
        // keep showing the code; the next tick asks again
      }
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [view, pair]);

  async function showCode() {
    setBusy(true);
    setMessage("");
    try {
      const link = readLink();
      const { status: st, data } = await pairApi.create(link?.space);
      if (st !== 200 || !data.code) {
        setMessage(ERRORS[st] || OFFLINE);
        return;
      }
      if (!link) linkSpace(data.space);
      const t = Date.now();
      setNow(t);
      setPair({ code: data.code, space: data.space, expires: t + data.ttl * 1000, wasLinked: !!link });
      setView("code");
    } catch {
      setMessage(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  function cancelCode() {
    if (pair) {
      pairApi.cancel(pair.code, pair.space).catch(() => {});
      if (!pair.wasLinked) unlink();
    }
    setPair(null);
    setView("main");
  }

  function openEnter() {
    // Mount and focus inside the tap so iOS opens the keyboard.
    flushSync(() => {
      setMessage("");
      setInput("");
      setView("enter");
    });
    inputRef.current?.focus();
  }

  async function join(e) {
    e.preventDefault();
    const code = input.replace(/\D/g, "");
    if (code.length !== 6) {
      setMessage("The code has 6 digits.");
      return;
    }
    setBusy(true);
    setMessage("");
    const r = await joinWithCode(code);
    setBusy(false);
    if (r.ok) setView("done");
    else setMessage(r.error);
  }

  function turnOff() {
    unlink();
    setView("main");
    setMessage("Sync is off on this device. Your recipes stay here.");
  }

  // Linked by scanning a QR while the code form was open.
  const shown = view === "enter" && linked && !busy ? "done" : view;

  let body;
  if (shown === "code" && pair) {
    body = (
      <>
        <div className="sc-qr">
          <QrCode text={pairUrl(window.location.origin, pair.code)} size={176} label="QR code to link a device" />
        </div>
        <p className="pt-note">
          On your other device, open Mob and tap the scan icon at the top. Or
          type the code there under Sync your devices, Enter a code:
        </p>
        <p className="sc-code" aria-label={`Code ${pair.code.split("").join(" ")}`}>
          {formatCode(pair.code)}
        </p>
        <p className="pt-note">Expires in {left(pair.expires - now)}.</p>
        <div className="sc-actions">
          <button type="button" className="pt-link" onClick={cancelCode}>
            Cancel
          </button>
        </div>
      </>
    );
  } else if (shown === "enter") {
    body = (
      <form className="sc-enter" onSubmit={join}>
        <div className="pt-field">
          <label className="pt-label" htmlFor="sc-code">
            Code from your other device
          </label>
          <input
            ref={inputRef}
            id="sc-code"
            className="pt-input sc-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            placeholder="123 456"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^\d ]/g, ""))}
            enterKeyHint="go"
            disabled={busy}
          />
        </div>
        <div className="sc-actions">
          <button type="submit" className="pt-btn" disabled={busy}>
            {busy ? "Linking…" : "Link"}
          </button>
          <button type="button" className="pt-btn sc-secondary" onClick={openScanner} disabled={busy}>
            Scan QR
          </button>
          <button type="button" className="pt-link" onClick={() => setView("main")} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    );
  } else if (shown === "done") {
    body = (
      <>
        <p className="pt-state sc-done">Linked</p>
        <p className="pt-note">
          My kitchen and Saved now stay the same on your linked devices. It can
          take a few seconds for changes to show up.
        </p>
        <div className="sc-actions">
          <button type="button" className="pt-btn" onClick={() => setView("main")}>
            Done
          </button>
        </div>
      </>
    );
  } else if (linked) {
    body = (
      <>
        <div className="pt-row">
          <span className="pt-state">On for this device</span>
          <button type="button" className="pt-link" onClick={turnOff}>
            Turn off
          </button>
        </div>
        <p className="pt-note">{statusText(status)}</p>
        <div className="sc-actions">
          <button type="button" className="pt-btn sc-secondary" onClick={showCode} disabled={busy}>
            {busy ? "Getting a code…" : "Link another device"}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="sc-actions">
        <button type="button" className="pt-btn" onClick={showCode} disabled={busy}>
          {busy ? "Getting a code…" : "Show a code"}
        </button>
        <button type="button" className="pt-btn sc-secondary" onClick={openEnter} disabled={busy}>
          Enter a code
        </button>
      </div>
    );
  }

  const gone = !linked && status === "gone" && view === "main" && !message;

  return (
    <section className="pt-card sc-card" aria-labelledby="sc-title">
      <h2 className="pt-title" id="sc-title">
        Sync your devices
      </h2>
      <p className="pt-text">
        Keep My kitchen and Saved the same on your phone, tablet and computer.
      </p>
      {body}
      <p className="pt-note pt-live" role="status" aria-live="polite">
        {gone ? "Sync stopped because the link expired. Link your devices again." : message}
      </p>
    </section>
  );
}
