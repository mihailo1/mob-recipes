"use client";

import { useRef, useState } from "react";
import BottomSheet from "../BottomSheet";
import FolderForm, { suggestedLook } from "./FolderForm";
import { FOLDER_LIMIT_MESSAGE } from "./AddToFolderSheet";
import { PaletteIcon, PencilIcon, TrashIcon } from "./icons";

/*
 * New folder / Edit folder sheet.
 *  mode "create": onCreated(id) after creating
 *  mode "edit":   updates `folder`; focusName opens with the name focused
 *                 (Rename), otherwise no keyboard (Edit icon & color)
 * Render it with a fresh `key` per opening so the form resets.
 */
export function FolderEditSheet({
  open,
  mode,
  folder,
  folders = [],
  focusName = false,
  onClose,
  onCreate,
  onUpdate,
  returnFocusRef,
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const creating = mode === "create";
  const initial = creating
    ? { name: "", ...suggestedLook(folders) }
    : { name: folder?.name || "", emoji: folder?.emoji, color: folder?.color };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={creating ? "New folder" : focusName ? "Rename folder" : "Edit folder"}
      initialFocusRef={creating || focusName ? inputRef : undefined}
      returnFocusRef={returnFocusRef}
      className="fd-sheet"
    >
      <div className="fd-edit">
        <FolderForm
          initial={initial}
          inputRef={inputRef}
          submitLabel={creating ? "Create folder" : "Save"}
          error={error}
          onCancel={onClose}
          onSubmit={(look) => {
            if (creating) {
              const id = onCreate(look);
              if (!id) setError(FOLDER_LIMIT_MESSAGE);
            } else {
              onUpdate(look);
            }
          }}
        />
      </div>
    </BottomSheet>
  );
}

/** "⋯" action sheet: Rename, Edit icon & color, Delete (with confirm). */
export function FolderActionsSheet({ open, folder, onClose, onRename, onEditLook, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  if (!folder) return null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        <span className="fd-actions-title" style={{ "--fd-c": folder.color }}>
          <span className="fd-actions-emoji" aria-hidden="true">
            {folder.emoji}
          </span>
          <span className="fd-actions-name">{folder.name}</span>
        </span>
      }
      className="fd-sheet"
    >
      {confirming ? (
        <div className="fd-confirm">
          <span className="fd-confirm-icon" aria-hidden="true">
            <TrashIcon size={24} />
          </span>
          <p className="fd-confirm-title">Delete this folder?</p>
          <p className="fd-confirm-text">Recipes stay in Saved.</p>
          <button type="button" className="fd-btn fd-btn-danger" onClick={onDelete}>
            Delete folder
          </button>
          <button type="button" className="fd-btn fd-btn-ghost" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <ul className="fd-menu">
          <li>
            <button type="button" className="fd-menu-item" onClick={onRename}>
              <PencilIcon />
              Rename
            </button>
          </li>
          <li>
            <button type="button" className="fd-menu-item" onClick={onEditLook}>
              <PaletteIcon />
              Edit icon &amp; color
            </button>
          </li>
          <li>
            <button
              type="button"
              className="fd-menu-item is-danger"
              onClick={() => setConfirming(true)}
            >
              <TrashIcon />
              Delete folder
            </button>
          </li>
        </ul>
      )}
    </BottomSheet>
  );
}
