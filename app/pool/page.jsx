"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useKitchen } from "../../lib/store";
import { useRecipes } from "../../lib/queries";
import { aggregateIngredients } from "../../lib/ingredients.mjs";
import RecipeImage from "../../components/RecipeImage";
import PushToggle from "../../components/PushToggle";
import SyncCard from "../../components/SyncCard";
import PageTransition from "../../components/PageTransition";
import { shareTextOrCopy } from "../../components/share/shareActions";
import { showToast } from "../../components/Toast";
import { groupByAisle, shoppingListText } from "../../lib/aisles.mjs";
import { haptic } from "../../lib/haptics";
import Haptic from "../../components/Haptic";
import { OPEN, recipePhotoName } from "../../lib/transitions";
import PhotoMorph from "../../components/PhotoMorph";
import TransitionPicker from "../../components/TransitionPicker";

function loadChecked() {
  try {
    const raw = window.localStorage.getItem("mob-recipes:pool-checked");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

const itemKey = (i) => `${i.name}::${i.unit || ""}`;

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
  const aisles = useMemo(() => groupByAisle(shoppingList), [shoppingList]);
  const inBasket = shoppingList.filter((i) => checked.has(itemKey(i))).length;

  function toggleChecked(key) {
    haptic();
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      saveChecked(next);
      return next;
    });
  }

  // Must stay synchronous up to the share sheet: iOS only opens it in a tap.
  function sendList() {
    const left = groupByAisle(shoppingList.filter((i) => !checked.has(itemKey(i))));
    if (!left.length) {
      showToast({ message: "Everything is already in your basket", icon: "check", duration: 2500 });
      return;
    }
    shareTextOrCopy({ title: "Shopping list", text: `Shopping list\n\n${shoppingListText(left)}` });
  }

  return (
    <PageTransition>
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
                      <PhotoMorph name={recipePhotoName(r.slug)}>
                        <RecipeImage className="pool-thumb" src={r.image} alt={r.name} />
                      </PhotoMorph>
                      <Link
                        href={`/recipes/${r.slug}`}
                        transitionTypes={OPEN}
                        className="pool-recipe-name"
                      >
                        {r.name}
                      </Link>
                      <button
                        className="icon-btn"
                        aria-label="Remove from shopping list"
                        onClick={() => {
                          haptic();
                          togglePool(r.slug);
                        }}
                      >
                        ✕
                        <Haptic />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-title-row">
                  <h2 className="section-title">Shopping list ({shoppingList.length})</h2>
                  <button type="button" className="pill-btn shop-send" onClick={sendList}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                    </svg>
                    Send list
                  </button>
                </div>
                <p className="meta-row">
                  {inBasket} of {shoppingList.length} items in your basket
                </p>
                <progress
                  className="progress-bar"
                  aria-label="Shopping progress"
                  value={inBasket}
                  max={shoppingList.length || 1}
                />
                {aisles.map((aisle) => {
                  const left = aisle.items.filter((i) => !checked.has(itemKey(i))).length;
                  return (
                    <section className="shop-aisle" key={aisle.id} aria-label={aisle.label}>
                      <h3 className={`shop-aisle-title ${left ? "" : "is-done"}`}>
                        <span aria-hidden="true">{aisle.emoji}</span>
                        {aisle.label}
                        <span className="shop-aisle-count">
                          {left ? `${left} left` : "done"}
                        </span>
                      </h3>
                      <ul className="shopping-list">
                        {aisle.items.map((item) => {
                          const key = itemKey(item);
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
                              <Haptic clickInput />
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </div>
            <p className="footer-note">
              Quantities are combined by matching ingredient name + unit exactly —
              differently-worded duplicates (e.g. &quot;Fresh Dill&quot; vs
              &quot;Dill&quot;) may still show as separate lines.
            </p>
          </>
        )}
        <SyncCard />
        <PushToggle />
        <TransitionPicker />
      </div>
    </PageTransition>
  );
}
