"use client";

import { useMemo, useState } from "react";
import {
  parseIngredientLine,
  formatIngredient,
  findIngredientMentions,
} from "../lib/ingredients.mjs";
import { useKitchen } from "../lib/store";

export default function RecipeBody({ recipe }) {
  const { pool, favorites, togglePool, toggleFavorite } = useKitchen();
  const inPool = pool.has(recipe.slug);
  const isFav = favorites.has(recipe.slug);

  const baseYield = typeof recipe.yield === "number" ? recipe.yield : Number(recipe.yield) || null;
  const [servings, setServings] = useState(baseYield || 1);

  const factor = baseYield ? servings / baseYield : 1;

  const scaledIngredients = useMemo(
    () =>
      recipe.ingredients.map((raw) => {
        const parsed = parseIngredientLine(raw);
        return {
          ...parsed,
          quantity: parsed.quantity != null ? parsed.quantity * factor : null,
        };
      }),
    [recipe.ingredients, factor]
  );

  const stepSegments = useMemo(
    () => recipe.instructions.map((step) => findIngredientMentions(step, scaledIngredients)),
    [recipe.instructions, scaledIngredients]
  );

  return (
    <>
      <div className="action-row">
        <button
          type="button"
          className={`pill-btn ${isFav ? "is-active" : ""}`}
          onClick={() => toggleFavorite(recipe.slug)}
        >
          {isFav ? "♥ Saved" : "♡ Save"}
        </button>
        <button
          type="button"
          className={`pill-btn ${inPool ? "is-active" : ""}`}
          onClick={() => togglePool(recipe.slug)}
        >
          {inPool ? "✓ In pool" : "+ Add to pool"}
        </button>
      </div>

      <div className="recipe-layout">
        <div>
          <div className="section-title-row">
            <h2 className="section-title">Ingredients</h2>
            {baseYield ? (
              <div className="servings-stepper">
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  aria-label="Fewer servings"
                >
                  −
                </button>
                <span>{servings} serving{servings === 1 ? "" : "s"}</span>
                <button
                  type="button"
                  onClick={() => setServings((s) => s + 1)}
                  aria-label="More servings"
                >
                  +
                </button>
              </div>
            ) : null}
          </div>
          <ul className="ingredient-list">
            {scaledIngredients.map((ing, i) => (
              <li key={i}>{formatIngredient(ing)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="section-title">Method</h2>
          <ol className="step-list">
            {stepSegments.map((segments, i) => (
              <li key={i}>
                <span>
                  {segments.map((seg, j) =>
                    seg.match ? (
                      <mark key={j} title={seg.tooltip || undefined} className="ingredient-mark">
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={j}>{seg.text}</span>
                    )
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}
