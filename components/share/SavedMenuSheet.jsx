"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import BottomSheet from "../BottomSheet";
import { LinkIcon, ScanIcon, ShareIcon } from "./icons";
import { parseScan } from "../../lib/qr.mjs";
import { joinWithCode } from "../../lib/sync-client";
import { openScanner } from "./QrScanner";
import { showToast } from "../Toast";
import { usePairCode } from "../sync/usePairCode";
import PairCodeView from "../sync/PairCodeView";

/*
 * "⋯" sheet next to Folders on Saved:
 *  - Share everything: links the other phone for sync (a code and its QR),
 *    so both keep the same Saved and kitchen from then on. A single folder
 *    or recipe is shared as a copy instead (folder ⋯, recipe Share).
 *  - Scan a QR code: the scanner, also on the scan icon at the top
 *  - Open a shared link: paste a link someone sent. Needed on iPhone, where
 *    links open in Safari, not in the app on the Home Screen.
 * Render with a fresh `key` per opening so it starts on the menu.
 */
export default function SavedMenuSheet({ open, onClose }) {
  const router = useRouter();
  const [mode, setMode] = useState("menu"); // menu | sync | open
  const code = usePairCode();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const canPaste =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  async function openLink(value) {
    const target = parseScan(value);
    if (!target) {
      setError("That doesn't look like a link from Mob Recipes.");
      return;
    }
    if (target.type === "pair") {
      const r = await joinWithCode(target.code);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      showToast({ message: "Devices linked. Your kitchen and Saved now sync", icon: "check", duration: 4000 });
      return;
    }
    onClose();
    router.push(target.path);
  }

  async function paste() {
    setError("");
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      if (parseScan(value)) openLink(value);
      else setError("The copied text isn't a link from Mob Recipes.");
    } catch {
      setError("Couldn't read the clipboard. Paste the link into the field instead.");
    }
  }

  let title = "Saved";
  let body;
  if (mode === "sync") {
    title = "Share everything";
    body = (
      <div className="sh-panel">
        {code.phase === "used" ? (
          <>
            <p className="sh-summary sh-linked">Linked</p>
            <p className="sh-summary">
              Both phones now have the same Saved and My kitchen, and keep them
              in sync. It can take a few seconds for changes to show up.
            </p>
            <button type="button" className="fd-btn fd-btn-primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : code.phase === "waiting" && code.pair ? (
          <>
            <p className="sh-summary">
              The other phone gets all your saved recipes, folders and My
              kitchen, and from then on both stay in sync. Recipes saved on
              that phone are added here too.
            </p>
            <PairCodeView pair={code.pair} now={code.now} sendable />
          </>
        ) : code.phase === "expired" || code.error ? (
          <>
            <p className="sh-error" role="alert">
              {code.error || "The code expired."}
            </p>
            <button type="button" className="fd-btn fd-btn-ghost" onClick={code.start}>
              Show a new code
            </button>
          </>
        ) : (
          <p className="sh-making" role="status">
            Getting a code…
          </p>
        )}
      </div>
    );
  } else if (mode === "open") {
    title = "Open a shared link";
    body = (
      <form
        className="sh-open"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          openLink(text);
        }}
      >
        <p className="sh-summary">
          Got a link from someone: a recipe, a folder or a sync link? Copy it, then paste it here.
        </p>
        <input
          ref={inputRef}
          className="sh-url sh-input"
          type="text"
          inputMode="url"
          placeholder="https://…/s/…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="Shared link"
          aria-invalid={error ? true : undefined}
        />
        {error ? (
          <p className="sh-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sh-actions">
          {canPaste ? (
            <button type="button" className="fd-btn fd-btn-ghost sh-btn" onClick={paste}>
              Paste
            </button>
          ) : null}
          <button type="submit" className="fd-btn fd-btn-primary sh-btn" disabled={!text.trim()}>
            Open
          </button>
        </div>
      </form>
    );
  } else {
    body = (
      <ul className="fd-menu">
        <li>
          <button
            type="button"
            className="fd-menu-item"
            onClick={() => {
              setMode("sync");
              code.start();
            }}
          >
            <ShareIcon size={20} />
            <span className="fd-menu-text">
              Share everything
              <span className="fd-menu-sub">Stays in sync with the other phone</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="fd-menu-item"
            onClick={() => {
              onClose();
              openScanner();
            }}
          >
            <ScanIcon />
            Scan a QR code
          </button>
        </li>
        <li>
          <button
            type="button"
            className="fd-menu-item"
            onClick={() => {
              // Mount and focus inside the tap so iOS opens the keyboard.
              flushSync(() => setMode("open"));
              inputRef.current?.focus();
            }}
          >
            <LinkIcon />
            Open a shared link
          </button>
        </li>
      </ul>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} className="fd-sheet">
      {body}
    </BottomSheet>
  );
}
