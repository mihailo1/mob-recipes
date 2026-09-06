"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useKitchen } from "../../lib/store";
import { aggregateIngredients } from "../../lib/ingredients.mjs";
import RecipeImage from "../../components/RecipeImage";

function loadChecked() {
  try {
    const raw = window.localStorage.getItem("mob-recipes:pool-checked");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveChecked(set) {
  try {
    window.localStorage.setItem("mob-recipes:pool-checked", JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export default function PoolPage() {
  const { pool, togglePool, clearPool, ready } = useKitchen();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    setChecked(loadChecked());
  }, []);

  useEffect(() => {
    if (!ready) return;
    const slugs = [...pool];
    if (slugs.length === 0) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      slugs.map((slug) =>
        fetch(`/api/recipe/${slug}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ).then((results) => {
      setRecipes(results.filter(Boolean));
      setLoading(false);
    });
  }, [pool, ready]);

  const shoppingList = useMemo(() => aggregateIngredients(recipes), [recipes]);

  function toggleChecked(key) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveChecked(next);
      return next;
    });
  }

  return (
    <div className="container">
      <header className="header">
        <h1>My Pool</h1>
        <p>
          Add recipes here to combine their ingredients into a single shopping
          list — quantities are summed automatically where the units match.
        </p>
      </header>

      {!ready || loading ? (
        <p className="meta-row">Loading…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          Your pool is empty. Head to{" "}
          <Link href="/" className="back-link" style={{ display: "inline" }}>
            search
          </Link>{" "}
          and hit the + button on any recipe.
        </div>
      ) : (
        <>
          <div className="pool-layout">
            <div>
              <div className="section-title-row">
                <h2 className="section-title">Recipes ({recipes.length})</h2>
                <button className="text-btn" onClick={clearPool}>
                  Clear pool
                </button>
              </div>
              <div className="pool-recipe-list">
                {recipes.map((r) => (
                  <div className="pool-recipe-item" key={r.slug}>
                    <RecipeImage className="pool-thumb" src={r.image} alt={r.name} />
                    <Link href={`/recipes/${r.slug}`} className="pool-recipe-name">
                      {r.name}
                    </Link>
                    <button
                      className="icon-btn"
                      aria-label="Remove from pool"
                      onClick={() => togglePool(r.slug)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="section-title">Shopping list ({shoppingList.length})</h2>
              <ul className="shopping-list">
                {shoppingList.map((item) => {
                  const key = `${item.name}::${item.unit || ""}`;
                  const isChecked = checked.has(key);
                  return (
                    <li key={key} className={isChecked ? "is-checked" : ""}>
                      <label>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecked(key)}
                        />
                        <span>{item.label}</span>
                      </label>
                      {item.sources.length > 1 ? (
                        <span className="ingredient-sources">
                          {item.sources.length} recipes
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <p className="footer-note">
            Quantities are combined by matching ingredient name + unit exactly
            — differently-worded duplicates (e.g. &quot;Fresh Dill&quot; vs
            &quot;Dill&quot;) may still show as separate lines.
          </p>
        </>
      )}
    </div>
  );
}
