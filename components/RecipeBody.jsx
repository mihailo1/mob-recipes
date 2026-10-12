"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function RecipeBody({ recipe }) {
  const { pool, favorites, folders = NO_FOLDERS, togglePool } = useKitchen();
  const toggleSave = useSaveToggle();
  const myFolders = useFoldersFor(folders, favorites, recipe.slug);
  const [cooking, setCooking] = useState(false);
  useEffect(() => {
    if (!cooking || !navigator.wakeLock) return;
    let lock;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) await next.release();
        else lock = next;
      } catch {}
    };
    const visible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      lock?.release();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [cooking]);
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
          onClick={() => togglePool(recipe.slug)}
        >
          {inPool ? "✓ In your kitchen" : "+ Add to shopping list"}
        </button>
        <ShareRecipeButton recipe={recipe} />
        <button
          className="pill-btn cook-toggle"
          aria-pressed={cooking}
          onClick={() => setCooking(!cooking)}
        >
          {cooking ? "Exit cooking view" : "Start cooking ↗"}
        </button>
      </div>

      <div className={`recipe-layout ${cooking ? "cooking" : ""}`}>
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
                  <input type="checkbox" />
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
                  {segments.map((seg, j) =>
                    seg.match ? (
                      <mark
                        key={j}
                        title={seg.tooltip || undefined}
                        className="ingredient-mark"
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={j}>{seg.text}</span>
                    ),
                  )}
                  <span className="step-ingredients">
                    {[
                      ...new Set(
                        segments
                          .filter((s) => s.match && s.tooltip)
                          .map((s) => `${s.tooltip} ${s.text}`),
                      ),
                    ].map((t) => (
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
