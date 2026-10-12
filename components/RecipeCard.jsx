"use client";

import Link from "next/link";
import RecipeImage from "./RecipeImage";
import { useKitchen } from "../lib/store";
import { useSaveToggle } from "./folders/useSaveToggle";
import { FolderIcon } from "./folders/icons";

/**
 * Optional (Saved page only):
 *  onFolder   shows a folder button that calls it (opens "Save to folder")
 *  inFolder   folder button looks active (recipe is in at least one folder)
 */
export default function RecipeCard({ recipe, onFolder, inFolder = false }) {
  const { pool, favorites, togglePool } = useKitchen();
  const toggleSave = useSaveToggle();
  const inPool = pool.has(recipe.slug);
  const isFav = favorites.has(recipe.slug);

  return (
    <div className="card">
      <Link href={`/recipes/${recipe.slug}`} className="card-media">
        <RecipeImage className="card-image" src={recipe.image} alt={recipe.name} />
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
          </button>
        ) : null}
        <button
          type="button"
          aria-label={inPool ? "Remove from shopping list" : "Add to shopping list"}
          className={`icon-btn ${inPool ? "is-active" : ""}`}
          onClick={() => togglePool(recipe.slug)}
        >
          {inPool ? "✓" : "+"}
        </button>
      </div>
      <Link href={`/recipes/${recipe.slug}`} className="card-body">
        <div className="card-title">{recipe.name}</div>
        <div className="chip-row">
          {recipe.totalTimeMinutes ? (
            <span className="chip time">{recipe.totalTimeMinutes} min</span>
          ) : null}
          {(recipe.category || []).slice(0, 2).map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
        </div>
      </Link>
    </div>
  );
}
