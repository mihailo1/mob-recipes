"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { joinWithCode, unlink, useSyncState } from "../lib/sync-client";
import { openScanner } from "./share/QrScanner";
import { usePairCode } from "./sync/usePairCode";
import PairCodeView from "./sync/PairCodeView";

/*
 * "Sync your devices" card (bottom of My kitchen and Saved).
 *
 * Linking: one device taps "Show a code" and gets 6 digits and a QR code for
 * 10 minutes (components/sync/usePairCode.js); the other scans the QR in the
 * app or types the digits. Saved, ⋯, "Share everything" starts the same.
 */

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
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);
  const code = usePairCode();

  function showCode() {
    setMessage("");
    setView("code");
    code.start();
  }

  function cancelCode() {
    code.cancel();
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

  // The code screen follows the code: used means linked, failed or expired
  // goes back with a note. Linked by scanning a QR while the code form was
  // open counts as done too.
  let shown = view;
  let note = message;
  if (view === "code") {
    if (code.phase === "used") shown = "done";
    else if (code.phase === "expired") {
      shown = "main";
      note = "The code expired. Show a new one to link a device.";
    } else if (code.phase === "idle" && code.error) {
      shown = "main";
      note = code.error;
    }
  }
  if (view === "enter" && linked && !busy) shown = "done";

  let body;
  if (shown === "code") {
    body = (
      <>
        {code.pair && code.phase === "waiting" ? (
          <PairCodeView pair={code.pair} now={code.now} />
        ) : (
          <p className="pt-note">Getting a code…</p>
        )}
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
          <button type="button" className="pt-btn sc-secondary" onClick={showCode}>
            Link another device
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className="sc-actions">
        <button type="button" className="pt-btn" onClick={showCode}>
          Show a code
        </button>
        <button type="button" className="pt-btn sc-secondary" onClick={openEnter} disabled={busy}>
          Enter a code
        </button>
      </div>
    );
  }

  const gone = !linked && status === "gone" && shown === "main" && !note;

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
        {gone ? "Sync stopped because the link expired. Link your devices again." : note}
      </p>
    </section>
  );
}
