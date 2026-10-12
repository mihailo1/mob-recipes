"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import BottomSheet from "../BottomSheet";
import ShareLinkPanel from "./ShareLinkPanel";
import { LinkIcon, ShareIcon } from "./icons";
import { extractShareId } from "../../lib/share.mjs";
import { recipesLabel } from "../folders/folderData";

/*
 * "⋯" sheet next to Folders on Saved:
 *  - Share all saved: one link with every folder and the unfiled recipes
 *  - Open a shared link: paste a link someone sent. Needed on iPhone, where
 *    links open in Safari, not in the app on the Home Screen.
 * Render with a fresh `key` per opening so it starts on the menu.
 */
export default function SavedMenuSheet({ open, onClose, getShareDoc, savedCount }) {
  const router = useRouter();
  const [mode, setMode] = useState("menu"); // menu | share | open
  const [shareDoc, setShareDoc] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const canPaste =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  function openLink(value) {
    const id = extractShareId(value);
    if (!id) {
      setError("That doesn't look like a link to shared recipes.");
      return;
    }
    onClose();
    router.push(`/s/${id}`);
  }

  async function paste() {
    setError("");
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      if (extractShareId(value)) openLink(value);
      else setError("The copied text isn't a link to shared recipes.");
    } catch {
      setError("Couldn't read the clipboard. Paste the link into the field instead.");
    }
  }

  let title = "Saved";
  let body;
  if (mode === "share" && shareDoc) {
    const folderCount = shareDoc.folders.length;
    title = "Share all saved";
    body = (
      <ShareLinkPanel
        doc={shareDoc}
        title="My saved recipes"
        summary={`${recipesLabel(savedCount)}${
          folderCount ? ` in ${folderCount === 1 ? "1 folder" : `${folderCount} folders`} and more` : ""
        }. Whoever opens the link can save their own copy.`}
        onDone={onClose}
      />
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
          Got recipes from someone? Copy their link, then paste it here.
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
        {savedCount > 0 ? (
          <li>
            <button
              type="button"
              className="fd-menu-item"
              onClick={() => {
                setShareDoc(getShareDoc());
                setMode("share");
              }}
            >
              <ShareIcon size={20} />
              Share all saved
            </button>
          </li>
        ) : null}
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
