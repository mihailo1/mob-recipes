"use client";

import { shareOrCopy } from "./shareActions";
import { ShareIcon } from "./icons";

/** "Share" pill on a recipe page: the system share sheet with the recipe link. */
export default function ShareRecipeButton({ recipe }) {
  return (
    <button
      type="button"
      className="pill-btn share-pill"
      onClick={() =>
        shareOrCopy({
          title: recipe.name,
          url: `${window.location.origin}/recipes/${recipe.slug}`,
        })
      }
    >
      <ShareIcon size={17} />
      <span>Share</span>
    </button>
  );
}
