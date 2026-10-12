"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useKitchen } from "../../lib/store";
import { useRecipes } from "../../lib/queries";
import { aggregateIngredients } from "../../lib/ingredients.mjs";
import RecipeImage from "../../components/RecipeImage";
import PushToggle from "../../components/PushToggle";

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
    window.localStorage.setItem(
      "mob-recipes:pool-checked",
      JSON.stringify([...set]),
    );
  } catch {
    // ignore
  }
}

export default function PoolPage() {
  const { pool, togglePool, clearPool, ready } = useKitchen();
  const [view, setView] = useState("all");
  const [copyStatus, setCopyStatus] = useState("");
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    // Read localStorage after mount so SSR and first client render match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecked(loadChecked());
  }, []);

  // Cached per slug, so toggling the pool or coming back is instant.
  const poolSlugs = useMemo(() => [...pool], [pool]);
  const { recipes, isPending: loading } = useRecipes(poolSlugs);

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
        <h1>My kitchen</h1>
        <p>
          Add recipes here to combine their ingredients into a single shopping
          list — quantities are summed automatically where the units match.
        </p>
      </header>

      {!ready || loading ? (
        <p className="meta-row">Loading…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          Dinner starts here. Your kitchen is empty. Head to{" "}
          <Link href="/" className="back-link" style={{ display: "inline" }}>
            search
          </Link>{" "}
          and hit the + button on any recipe.
        </div>
      ) : (
        <>
          <div className="pool-tabs">
            {[
              ["all", "Overview"],
              ["recipes", "Recipes"],
              ["shopping", "Shopping list"],
            ].map(([id, label]) => (
              <button
                className="pill-btn"
                aria-pressed={view === id}
                key={id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pool-layout" data-view={view}>
            <div>
              <div className="section-title-row">
                <h2 className="section-title">Recipes ({recipes.length})</h2>
                <button className="text-btn" onClick={clearPool}>
                  Clear recipes
                </button>
              </div>
              <div className="pool-recipe-list">
                {recipes.map((r) => (
                  <div className="pool-recipe-item" key={r.slug}>
                    <RecipeImage
                      className="pool-thumb"
                      src={r.image}
                      alt={r.name}
                    />
                    <Link
                      href={`/recipes/${r.slug}`}
                      className="pool-recipe-name"
                    >
                      {r.name}
                    </Link>
                    <button
                      className="icon-btn"
                      aria-label="Remove from shopping list"
                      onClick={() => togglePool(r.slug)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="section-title">
                Shopping list ({shoppingList.length})
              </h2>
              <p className="meta-row">
                {
                  shoppingList.filter((i) =>
                    checked.has(`${i.name}::${i.unit || ""}`),
                  ).length
                }{" "}
                of {shoppingList.length} items in your basket
              </p>
              <progress
                className="progress-bar"
                aria-label="Shopping progress"
                value={
                  shoppingList.filter((i) =>
                    checked.has(`${i.name}::${i.unit || ""}`),
                  ).length
                }
                max={shoppingList.length || 1}
              />
              <button
                className="pill-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      shoppingList
                        .filter(
                          (i) => !checked.has(`${i.name}::${i.unit || ""}`),
                        )
                        .map((i) => i.label)
                        .join("\n"),
                    );
                    setCopyStatus("Copied!");
                  } catch {
                    setCopyStatus(
                      "Couldn’t copy. Please select the list text.",
                    );
                  }
                }}
              >
                Copy remaining items
              </button>
              <p role="status" className="meta-row">
                {copyStatus}
              </p>
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
            Quantities are combined by matching ingredient name + unit exactly —
            differently-worded duplicates (e.g. &quot;Fresh Dill&quot; vs
            &quot;Dill&quot;) may still show as separate lines.
          </p>
        </>
      )}
      <PushToggle />
    </div>
  );
}
