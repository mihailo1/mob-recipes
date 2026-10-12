"use client";

import { useMemo, useState } from "react";
import {
  parseIngredientLine,
  formatIngredient,
  findIngredientMentions,
} from "../lib/ingredients.mjs";
import { useKitchen } from "../lib/store";
import { useSaveToggle } from "./folders/useSaveToggle";
import { openAddToFolder } from "./folders/AddToFolderSheet";
import { NO_FOLDERS, useFoldersFor } from "./folders/folderData";
import { FolderIcon } from "./folders/icons";
import ShareRecipeButton from "./share/ShareRecipeButton";
import { haptic } from "../lib/haptics";
import CookMode from "./cook/CookMode";
import StepText, { stepIngredients } from "./cook/StepText";

export default function RecipeBody({ recipe }) {
  const { pool, favorites, folders = NO_FOLDERS, togglePool } = useKitchen();
  const toggleSave = useSaveToggle();
  const myFolders = useFoldersFor(folders, favorites, recipe.slug);
  const [cooking, setCooking] = useState(false);
  const inPool = pool.has(recipe.slug);
  const isFav = favorites.has(recipe.slug);

  const baseYield =
    typeof recipe.yield === "number"
      ? recipe.yield
      : Number(recipe.yield) || null;
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
    [recipe.ingredients, factor],
  );

  const stepSegments = useMemo(
    () =>
      recipe.instructions.map((step) =>
        findIngredientMentions(step, scaledIngredients),
      ),
    [recipe.instructions, scaledIngredients],
  );

  return (
    <>
      <div className="action-row">
        <button
          type="button"
          className={`pill-btn ${isFav ? "is-active" : ""}`}
          onClick={() => toggleSave(recipe)}
        >
          {isFav ? "♥ Saved" : "♡ Save"}
        </button>
        <button
          type="button"
          className={`pill-btn fd-pill ${myFolders.length ? "is-active" : ""}`}
          data-focus-slug={recipe.slug}
          aria-label={
            myFolders.length
              ? `In ${myFolders.length === 1 ? `folder ${myFolders[0].name}` : `${myFolders.length} folders`}. Change folders`
              : "Add to folder"
          }
          onClick={() => openAddToFolder(recipe)}
        >
          {myFolders.length === 1 ? (
            <>
              <span className="fd-pill-emoji" aria-hidden="true">
                {myFolders[0].emoji}
              </span>
              <span className="fd-pill-text">{myFolders[0].name}</span>
            </>
          ) : (
            <>
              <FolderIcon size={17} filled={myFolders.length > 1} />
              <span className="fd-pill-text">
                {myFolders.length ? `${myFolders.length} folders` : "Add to folder"}
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          className={`pill-btn ${inPool ? "is-active" : ""}`}
          onClick={() => {
            haptic();
            togglePool(recipe.slug);
          }}
        >
          {inPool ? "✓ In your kitchen" : "+ Add to shopping list"}
        </button>
        <ShareRecipeButton recipe={recipe} />
        <button
          type="button"
          className="pill-btn cook-toggle"
          aria-haspopup="dialog"
          onClick={() => setCooking(true)}
        >
          Start cooking ↗
        </button>
      </div>

      {cooking ? (
        <CookMode
          recipe={recipe}
          ingredients={scaledIngredients}
          steps={stepSegments}
          servings={servings}
          onClose={() => setCooking(false)}
        />
      ) : null}

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
                <span>
                  {servings} serving{servings === 1 ? "" : "s"}
                </span>
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
              <li key={i}>
                <label>
                  <input type="checkbox" onChange={haptic} />
                  <span>{formatIngredient(ing)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="section-title">Method</h2>
          <p className="cook-progress">
            {stepSegments.length} steps · Ingredients below each step show
            recipe totals for {servings} serving{servings === 1 ? "" : "s"}.
          </p>
          <ol className="step-list">
            {stepSegments.map((segments, i) => (
              <li key={i}>
                <span>
                  <StepText segments={segments} />
                  <span className="step-ingredients">
                    {stepIngredients(segments).map((t) => (
                      <small key={t}>{t}</small>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}
