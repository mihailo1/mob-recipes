"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import Haptic from "../Haptic";
import BottomSheet from "../BottomSheet";
import { optimized } from "../RecipeImage";
import { useKitchen } from "../../lib/store";
import { useRecipeIndex } from "../../lib/queries";
import { showToast } from "../Toast";
import FolderCover from "./FolderCover";
import FolderForm, { suggestedLook } from "./FolderForm";
import { CheckIcon, PlusIcon } from "./icons";
import {
  NO_FOLDERS,
  recipesLabel,
  tick,
  useFolderSummaries,
  useFoldersFor,
  useRecipeMap,
} from "./folderData";

export const FOLDER_LIMIT_MESSAGE =
  "You've reached 50 folders. Delete one to make room for a new one.";

// Keep the session mounted until the BottomSheet exit animation is done.
const UNMOUNT_AFTER_MS = 420;

/*
 * Global "Save to folder" sheet. Any component can call
 * openAddToFolder({ slug, name, image }); <AddToFolderHost /> renders it.
 */

let session = null; // { key, open, recipe }
let sessionSeq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openAddToFolder(recipe) {
  if (!recipe?.slug) return;
  session = {
    key: ++sessionSeq,
    open: true,
    recipe: { slug: recipe.slug, name: recipe.name || "", image: recipe.image || "" },
  };
  emit();
}

export function closeAddToFolder() {
  if (!session?.open) return;
  const closing = session;
  session = { ...closing, open: false };
  emit();
  // Unmount the sheet (and its store subscriptions) once it is fully gone.
  setTimeout(() => {
    if (session && session.key === closing.key && !session.open) {
      session = null;
      emit();
    }
  }, UNMOUNT_AFTER_MS);
}

/**
 * Where focus goes when the sheet closes and the control that opened it is
 * gone (the toast's "Add to folder" button): the recipe's own button on the
 * page if there is one, else the main heading.
 */
function focusTargetFor(slug) {
  if (typeof document === "undefined") return null;
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(slug) : slug;
  const btn = document.querySelector(`[data-focus-slug="${esc}"]`);
  if (btn) return btn;
  const h = document.querySelector("main h1, h1");
  if (h && !h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  return h;
}

export function AddToFolderHost() {
  const s = useSyncExternalStore(
    subscribe,
    () => session,
    () => null,
  );
  if (!s) return null;
  return (
    <AddToFolderSheet
      key={s.key}
      open={s.open}
      recipe={s.recipe}
      onClose={closeAddToFolder}
    />
  );
}

function FolderRow({ folder, summary, checked, onToggle }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`fd-row ${checked ? "is-on" : ""}`}
      onClick={onToggle}
    >
      <FolderCover
        variant="mini"
        images={summary?.images || NO_FOLDERS}
        emoji={folder.emoji}
        color={folder.color}
      />
      <span className="fd-row-text">
        <span className="fd-row-name">{folder.name}</span>
        <span className="fd-row-sub">{recipesLabel(summary?.count || 0)}</span>
      </span>
      <span className="fd-check" aria-hidden="true">
        <CheckIcon size={14} />
      </span>
      <Haptic />
    </button>
  );
}

export default function AddToFolderSheet({ open, recipe, onClose }) {
  const {
    folders = NO_FOLDERS,
    favorites,
    createFolder,
    setRecipeInFolder,
  } = useKitchen();
  const { data: index } = useRecipeIndex();
  const recipeMap = useRecipeMap(index);
  const summaries = useFolderSummaries(folders, favorites, recipeMap);
  const mine = useFoldersFor(folders, favorites, recipe?.slug);
  const mineIds = new Set(mine.map((f) => f.id));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  const slug = recipe?.slug;
  // `current` is read lazily by BottomSheet when it restores focus on close.
  const returnFocusRef = useMemo(
    () => ({
      get current() {
        return focusTargetFor(slug);
      },
    }),
    [slug],
  );
  const saved = !!slug && favorites.has(slug);
  const status = mine.length
    ? `In ${mine.length === 1 ? mine[0].name : `${mine.length} folders`}`
    : saved
      ? "Saved, not in a folder yet"
      : "Not saved yet";

  function startCreating() {
    setError("");
    // Synchronous mount so the input can take focus inside the tap (iOS keyboard).
    flushSync(() => setCreating(true));
  }

  function create(look) {
    const id = createFolder(look);
    if (!id) {
      setError(FOLDER_LIMIT_MESSAGE);
      return;
    }
    if (!setRecipeInFolder(slug, id, true)) {
      showToast({ message: "Couldn’t add to the new folder", icon: "folder" });
    }
    tick();
    setCreating(false);
    listRef.current?.scrollTo?.({ top: 0 });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Save to folder"
      className="fd-sheet"
      returnFocusRef={returnFocusRef}
      headerEnd={
        <button type="button" className="bs-done" onClick={onClose}>
          Done
        </button>
      }
    >
      {recipe ? (
        <div className="fd-recipe">
          {recipe.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="fd-recipe-thumb"
              src={optimized(recipe.image, 256, 70)}
              alt=""
              width={52}
              height={52}
              decoding="async"
            />
          ) : (
            <span className="fd-recipe-thumb" aria-hidden="true" />
          )}
          <span className="fd-recipe-text">
            <span className="fd-recipe-name">{recipe.name}</span>
            <span className="fd-recipe-sub">{status}</span>
          </span>
        </div>
      ) : null}

      <ul className="fd-list" ref={listRef}>
        <li>
          {creating ? (
            <div className="fd-create">
              <FolderForm
                initial={{ name: "", ...suggestedLook(folders) }}
                submitLabel="Create"
                autoFocus
                error={error}
                onSubmit={create}
                onCancel={() => setCreating(false)}
              />
            </div>
          ) : (
            <button type="button" className="fd-row fd-row-new" onClick={startCreating}>
              <span className="fd-new-icon" aria-hidden="true">
                <PlusIcon size={20} />
              </span>
              <span className="fd-row-text">
                <span className="fd-row-name">New folder</span>
              </span>
            </button>
          )}
        </li>
        {folders.map((f) => {
          const on = mineIds.has(f.id);
          return (
            <li key={f.id}>
              <FolderRow
                folder={f}
                summary={summaries.byId.get(f.id)}
                checked={on}
                onToggle={() => {
                  tick();
                  if (!setRecipeInFolder(slug, f.id, !on)) {
                    showToast({ message: "This folder is full", icon: "folder" });
                  }
                }}
              />
            </li>
          );
        })}
      </ul>
      {folders.length === 0 && !creating ? (
        <p className="fd-sheet-hint">
          Folders keep your saved recipes tidy: weeknights, baking, date night.
        </p>
      ) : null}
    </BottomSheet>
  );
}
