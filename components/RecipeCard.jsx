"use client";

import Link from "next/link";
import RecipeImage from "./RecipeImage";
import { useKitchen } from "../lib/store";

export default function RecipeCard({ recipe }) {
  const { pool, favorites, togglePool, toggleFavorite } = useKitchen();
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
          onClick={() => toggleFavorite(recipe.slug)}
        >
          {isFav ? "♥" : "♡"}
        </button>
        <button
          type="button"
          aria-label={inPool ? "Remove from pool" : "Add to pool"}
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
