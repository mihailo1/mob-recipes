"use client";

import { useKitchen } from "../../lib/store";
import { showToast } from "../Toast";
import { openAddToFolder } from "./AddToFolderSheet";

/**
 * Heart button behaviour shared by cards and the recipe page:
 *  save   -> toast "Saved" with "Add to folder" (4s)
 *  unsave -> toast "Removed from Saved" with "Undo" (5s), which restores the
 *            favorite and its folder memberships.
 * Returns toggle(recipe) where recipe = { slug, name, image }.
 */
export function useSaveToggle() {
  const { favorites, toggleFavorite, restoreFavorite } = useKitchen();
  return (recipe) => {
    const wasSaved = favorites.has(recipe.slug);
    const snapshot = toggleFavorite(recipe.slug);
    if (wasSaved) {
      showToast({
        message: "Removed from Saved",
        icon: "heart-off",
        duration: 5000,
        action: snapshot
          ? { label: "Undo", onClick: () => restoreFavorite(snapshot) }
          : null,
      });
    } else {
      showToast({
        message: "Saved",
        icon: "heart",
        duration: 4000,
        action: { label: "Add to folder", onClick: () => openAddToFolder(recipe) },
      });
    }
  };
}
