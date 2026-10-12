"use client";

import { useKitchen } from "../../lib/store";
import { showToast } from "../Toast";
import { openAddToFolder } from "./AddToFolderSheet";
import { haptic } from "../../lib/haptics";

/**
 * Heart button behaviour shared by cards and the recipe page:
 *  save   -> toast "Saved" with "Add to folder" (4s)
 *  unsave -> toast "Removed from Saved" with "Undo" (5s), which restores the
 *            favorite and its folder memberships.
 * Returns toggle(recipe) where recipe = { slug, name, image }.
 */

// Last un-favorite snapshot per slug. Saving the same recipe again soon after
// (even after the Undo toast was replaced) restores its folders too.
const SNAPSHOT_TTL_MS = 15000;
const snapshots = new Map(); // slug -> { snapshot, expires }

function takeSnapshot(slug) {
  const hit = snapshots.get(slug);
  snapshots.delete(slug);
  return hit && hit.expires > Date.now() ? hit.snapshot : null;
}

export function useSaveToggle() {
  const { favorites, toggleFavorite, restoreFavorite } = useKitchen();
  return (recipe) => {
    const { slug } = recipe;
    haptic();
    // Re-saving a recently removed recipe: bring its folders back.
    if (!favorites.has(slug)) {
      const earlier = takeSnapshot(slug);
      if (earlier) {
        restoreFavorite(earlier);
        showSaved(recipe);
        return;
      }
    }
    const snapshot = toggleFavorite(slug); // snapshot = it was saved and got removed
    if (snapshot) {
      snapshots.set(slug, { snapshot, expires: Date.now() + SNAPSHOT_TTL_MS });
      showToast({
        message: "Removed from Saved",
        icon: "heart-off",
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            takeSnapshot(slug);
            restoreFavorite(snapshot);
          },
        },
      });
    } else {
      snapshots.delete(slug);
      showSaved(recipe);
    }
  };
}

function showSaved(recipe) {
  showToast({
    message: "Saved",
    icon: "heart",
    duration: 4000,
    action: { label: "Add to folder", onClick: () => openAddToFolder(recipe) },
  });
}
