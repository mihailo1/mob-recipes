"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import Link from "next/link";
import RecipeImage from "./RecipeImage";
import RecipeCard from "./RecipeCard";

const PAGE_SIZE = 40;

export default function SearchApp() {
  const [recipes, setRecipes] = useState(null);
  const [quick, setQuick] = useState(false);
  const [sort, setSort] = useState("default");
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [ingredientInput, setIngredientInput] = useState("");
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const ingredientBoxRef = useRef(null);

  useEffect(() => {
    fetch("/search-index.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setRecipes)
      .catch(() => {
        setError(true);
        setRecipes([]);
      });
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (
        ingredientBoxRef.current &&
        !ingredientBoxRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const fuse = useMemo(() => {
    if (!recipes) return null;
    return new Fuse(recipes, {
      keys: ["name", "keywords", "cuisine", "category"],
      threshold: 0.32,
      ignoreLocation: true,
    });
  }, [recipes]);

  const { categories, cuisines, allIngredients } = useMemo(() => {
    if (!recipes) return { categories: [], cuisines: [], allIngredients: [] };
    const cats = new Set();
    const cuis = new Set();
    const ings = new Set();
    for (const r of recipes) {
      (r.category || []).forEach((c) => cats.add(c));
      if (r.cuisine)
        r.cuisine
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
          .forEach((c) => cuis.add(c));
      (r.ingredientNames || []).forEach((i) => ings.add(i));
    }
    return {
      categories: [...cats].sort(),
      cuisines: [...cuis].sort(),
      allIngredients: [...ings].sort(),
    };
  }, [recipes]);

  const ingredientSuggestions = useMemo(() => {
    const q = ingredientInput.trim().toLowerCase();
    if (!q) return [];
    return allIngredients
      .filter((i) => i.includes(q) && !selectedIngredients.includes(i))
      .sort(
        (a, b) =>
          (a === q ? 0 : a.startsWith(q) ? 1 : 2) -
            (b === q ? 0 : b.startsWith(q) ? 1 : 2) ||
          a.length - b.length ||
          a.localeCompare(b),
      )
      .slice(0, 8);
  }, [ingredientInput, allIngredients, selectedIngredients]);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    let base = recipes;
    if (query.trim() && fuse) {
      base = fuse.search(query.trim()).map((r) => r.item);
    }
    return base
      .filter((r) => {
        if (quick && (!r.totalTimeMinutes || r.totalTimeMinutes > 30))
          return false;
        if (category && !(r.category || []).includes(category)) return false;
        if (
          cuisine &&
          !(r.cuisine || "")
            .split(",")
            .map((c) => c.trim())
            .includes(cuisine)
        )
          return false;
        if (selectedIngredients.length) {
          const have = new Set(r.ingredientNames || []);
          if (!selectedIngredients.every((ing) => have.has(ing))) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sort === "time"
          ? (a.totalTimeMinutes || Infinity) - (b.totalTimeMinutes || Infinity)
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : 0,
      );
  }, [
    recipes,
    query,
    fuse,
    category,
    cuisine,
    selectedIngredients,
    quick,
    sort,
  ]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, category, cuisine, selectedIngredients, quick, sort]);

  function addIngredient(ing) {
    setSelectedIngredients((prev) =>
      prev.includes(ing) ? prev : [...prev, ing],
    );
    setIngredientInput("");
    setShowSuggestions(false);
  }

  function removeIngredient(ing) {
    setSelectedIngredients((prev) => prev.filter((x) => x !== ing));
  }

  if (!recipes) {
    return (
      <div className="grid skeleton-grid" aria-label="Loading recipes">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton-card img-frame" />
        ))}
      </div>
    );
  }

  if (error)
    return (
      <div className="empty">
        <h2>Recipes couldn’t load</h2>
        <button className="pill-btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  const active =
    query || category || cuisine || quick || selectedIngredients.length > 0;
  const featured = recipes.find(
    (r) => r.image && r.totalTimeMinutes > 0 && r.totalTimeMinutes <= 30,
  );
  function reset() {
    setQuery("");
    setCategory("");
    setCuisine("");
    setQuick(false);
    setSelectedIngredients([]);
    setIngredientInput("");
  }
  const shown = filtered.slice(0, visible);

  return (
    <>
      <header className="discovery-heading">
        <span className="eyebrow">
          A LITTLE INSPIRATION. A LOT OF GOOD FOOD.
        </span>
        <h1>What sounds good?</h1>
        <p>Find your next favourite. Make dinner feel easy.</p>
      </header>
      {!active && featured && (
        <section className="discovery-hero">
          <div className="hero-copy">
            <span className="eyebrow">THE WEEKNIGHT EDIT</span>
            <h2>
              Big flavour.
              <br />
              Little effort.
            </h2>
            <p>Your next great dinner is only 30 minutes away.</p>
            <button
              className="primary-btn"
              onClick={() => {
                setQuick(true);
                setCategory("Dinner");
              }}
            >
              Find a quick dinner <span>↗</span>
            </button>
          </div>
          <Link className="hero-photo" href={`/recipes/${featured.slug}`}>
            <RecipeImage
              src={featured.image}
              alt={featured.name}
              priority
              className="hero-image"
            />
            <div className="hero-caption">
              <span>
                {featured.totalTimeMinutes} MIN · TONIGHT’S INSPIRATION
              </span>
              <h3>{featured.name} ↗</h3>
            </div>
          </Link>
        </section>
      )}
      <section className="search-panel" aria-label="Find recipes">
        <div className="section-title-row">
          <h2 className="section-title">Find your next cook</h2>
          <span className="meta-row">
            {recipes.length.toLocaleString()} recipes to explore
          </span>
        </div>
        <div className="controls">
          <input
            className="search-input"
            aria-label="Search recipes"
            type="search"
            placeholder={`Search ${recipes.length.toLocaleString()} recipes…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Cuisine"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
          >
            <option value="">All cuisines</option>
            {cuisines.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="ingredient-filter" ref={ingredientBoxRef}>
          <div className="ingredient-filter-input-row">
            <input
              className="search-input"
              aria-label="Filter by ingredients"
              onKeyDown={(e) => {
                if (e.key === "Enter" && ingredientSuggestions[0]) {
                  e.preventDefault();
                  addIngredient(ingredientSuggestions[0]);
                }
                if (e.key === "Escape") setShowSuggestions(false);
              }}
              type="text"
              placeholder="Filter by ingredients you want (e.g. chicken, lemon)…"
              value={ingredientInput}
              onChange={(e) => {
                setIngredientInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />
          </div>
          {showSuggestions && ingredientSuggestions.length > 0 ? (
            <div className="suggestion-list">
              {ingredientSuggestions.map((ing) => (
                <button
                  key={ing}
                  type="button"
                  className="suggestion-item"
                  onClick={() => addIngredient(ing)}
                >
                  {ing}
                </button>
              ))}
            </div>
          ) : null}
          {selectedIngredients.length > 0 ? (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {selectedIngredients.map((ing) => (
                <button
                  key={ing}
                  type="button"
                  className="chip chip-removable"
                  onClick={() => removeIngredient(ing)}
                  title="Remove"
                >
                  {ing} ✕
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <p className="filter-help">
          Use what you have: add multiple ingredients to find recipes containing
          all of them.
        </p>
        <div className="quick-filters">
          <button
            className={`pill-btn ${quick ? "is-active" : ""}`}
            aria-pressed={quick}
            onClick={() => setQuick(!quick)}
          >
            ◷ 30 minutes or less
          </button>
          {["Vegan", "Veggie", "High-Protein", "One Pot Recipes", "Meal-Prep"]
            .filter((c) => categories.includes(c))
            .map((c) => (
              <button
                key={c}
                className={`pill-btn ${category === c ? "is-active" : ""}`}
                aria-pressed={category === c}
                onClick={() => setCategory(category === c ? "" : c)}
              >
                {c}
              </button>
            ))}
          {active && (
            <button className="text-btn" onClick={reset}>
              Clear filters ×
            </button>
          )}
        </div>
      </section>
      <div className="results-heading">
        <h2>
          {active ? "Your matches" : "A world of good food"}
          <span>{filtered.length.toLocaleString()} recipes</span>
        </h2>
        <select
          aria-label="Sort recipes"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="default">Default order</option>
          <option value="time">Quickest first</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <h2>No matches just yet.</h2>
          <p>Try fewer ingredients or broaden your filters.</p>
          <button className="primary-btn" onClick={reset}>
            Explore all recipes
          </button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <RecipeCard key={r.slug} recipe={r} />
          ))}
        </div>
      )}

      {visible < filtered.length ? (
        <button
          className="load-more"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          Show more
        </button>
      ) : null}
    </>
  );
}
