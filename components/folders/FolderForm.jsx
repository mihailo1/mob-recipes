"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { FOLDER_COLORS, FOLDER_EMOJIS } from "../../lib/folders.mjs";
import { CheckIcon } from "./icons";

export const MAX_NAME = 40;

/** Defaults for a new folder, varied by how many folders exist already. */
export function suggestedLook(count = 0) {
  return {
    emoji: FOLDER_EMOJIS[(count + 1) % FOLDER_EMOJIS.length],
    color: FOLDER_COLORS[count % FOLDER_COLORS.length],
  };
}

/*
 * Name + icon + color form, used inline in the "Save to folder" sheet and in
 * the New / Edit folder sheet.
 *
 * autoFocus focuses the name input in a layout effect, so mounting the form
 * with flushSync from a tap opens the iOS keyboard.
 */
export default function FolderForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
  inputRef,
  error = "",
}) {
  const [name, setName] = useState(initial.name || "");
  const [emoji, setEmoji] = useState(initial.emoji);
  const [color, setColor] = useState(initial.color);
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const trimmed = name.trim();
  const uid = useId();

  const emojiRowRef = useRef(null);

  useLayoutEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
    // Bring the current icon into view (it may be far along the row).
    const row = emojiRowRef.current;
    const on = row?.querySelector(".is-on");
    if (row && on) {
      const box = row.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      if (r.right > box.right - 20) row.scrollLeft += r.left - box.left - box.width / 2 + r.width / 2;
    }
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      className="fd-form"
      style={{ "--fd-c": color }}
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit({ name: trimmed, emoji, color });
      }}
    >
      <div className="fd-form-top">
        <span className="fd-form-preview" aria-hidden="true">
          {emoji}
        </span>
        <input
          ref={ref}
          className="fd-input"
          type="text"
          value={name}
          maxLength={MAX_NAME}
          placeholder="Folder name"
          aria-label="Folder name"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <p className="fd-form-label" id={`${uid}-icon`}>
        Icon
      </p>
      <div className="fd-emojis" ref={emojiRowRef} role="radiogroup" aria-labelledby={`${uid}-icon`}>
        {FOLDER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={e === emoji}
            aria-label={`Icon ${e}`}
            className={`fd-emoji ${e === emoji ? "is-on" : ""}`}
            onClick={() => setEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>

      <p className="fd-form-label" id={`${uid}-color`}>
        Color
      </p>
      <div className="fd-colors" role="radiogroup" aria-labelledby={`${uid}-color`}>
        {FOLDER_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={`Color ${i + 1}`}
            className={`fd-color ${c === color ? "is-on" : ""}`}
            style={{ "--fd-dot": c }}
            onClick={() => setColor(c)}
          >
            {c === color ? <CheckIcon size={14} /> : null}
          </button>
        ))}
      </div>

      {error ? (
        <p className="fd-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="fd-form-actions">
        {onCancel ? (
          <button type="button" className="fd-btn fd-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="fd-btn fd-btn-primary" disabled={!trimmed}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
