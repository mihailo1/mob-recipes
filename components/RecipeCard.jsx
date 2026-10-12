"use client";

import Link from "next/link";
import RecipeImage from "./RecipeImage";
import { haptic } from "../lib/haptics";
import Haptic from "./Haptic";
import { OPEN, isLastOpenedRecipe, recipePhotoName } from "../lib/transitions";
import PhotoMorph from "./PhotoMorph";
import { useKitchen } from "../lib/store";
import { useSaveToggle } from "./folders/useSaveToggle";
import { FolderIcon } from "./folders/icons";

/**
 * Optional (Saved page only):
 *  onFolder   shows a folder button that calls it (opens "Save to folder")
 *  inFolder   folder button looks active (recipe is in at least one folder)
 * morph=false: the photo does not morph into the recipe page, for a page that
 * already shows this recipe's photo elsewhere (names must be unique).
 */
export default function RecipeCard({ recipe, onFolder, inFolder = false, morph = true }) {
  const { pool, favorites, togglePool } = useKitchen();
  const toggleSave = useSaveToggle();
  const inPool = pool.has(recipe.slug);
  const isFav = favorites.has(recipe.slug);

  return (
    <div className={`card ${isLastOpenedRecipe(recipe.slug) ? "is-last-opened" : ""}`}>
      <Link href={`/recipes/${recipe.slug}`} transitionTypes={OPEN} className="card-media">
        {morph ? (
          <PhotoMorph name={recipePhotoName(recipe.slug)}>
            <RecipeImage className="card-image" src={recipe.image} alt={recipe.name} />
          </PhotoMorph>
        ) : (
          <RecipeImage className="card-image" src={recipe.image} alt={recipe.name} />
        )}
      </Link>
      <div className="card-actions">
        <button
          type="button"
          aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
          className={`icon-btn ${isFav ? "is-active" : ""}`}
          data-focus-slug={onFolder ? undefined : recipe.slug}
          onClick={() => toggleSave(recipe)}
        >
          {isFav ? "♥" : "♡"}
          <Haptic />
        </button>
        {onFolder ? (
          <button
            type="button"
            aria-label={inFolder ? "Change folders" : "Add to folder"}
            className={`icon-btn fd-card-btn ${inFolder ? "is-active" : ""}`}
            data-focus-slug={recipe.slug}
            onClick={onFolder}
          >
            <FolderIcon size={17} filled={inFolder} />
            <Haptic />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={inPool ? "Remove from shopping list" : "Add to shopping list"}
          className={`icon-btn ${inPool ? "is-active" : ""}`}
          onClick={() => {
            haptic();
            togglePool(recipe.slug);
          }}
        >
          {inPool ? "✓" : "+"}
          <Haptic />
        </button>
      </div>
      <Link href={`/recipes/${recipe.slug}`} transitionTypes={OPEN} className="card-body">
        <div className="card-title">{recipe.name}</div>
        <div className="chip-row">
          {recipe.totalTimeMinutes ? (
            <span className="chip time">{recipe.totalTimeMinutes} min</span>
          ) : null}
          {[...new Set(recipe.category || [])].slice(0, 2).map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
        </div>
      </Link>
    </div>
  );
}
