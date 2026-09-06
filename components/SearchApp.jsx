"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import RecipeCard from "./RecipeCard";

const PAGE_SIZE = 40;

export default function SearchApp() {
  const [recipes, setRecipes] = useState(null);
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
      .then((r) => r.json())
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ingredientBoxRef.current && !ingredientBoxRef.current.contains(e.target)) {
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
      if (r.cuisine) cuis.add(r.cuisine);
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
      .slice(0, 8);
  }, [ingredientInput, allIngredients, selectedIngredients]);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    let base = recipes;
    if (query.trim() && fuse) {
      base = fuse.search(query.trim()).map((r) => r.item);
    }
    return base.filter((r) => {
      if (category && !(r.category || []).includes(category)) return false;
      if (cuisine && r.cuisine !== cuisine) return false;
      if (selectedIngredients.length) {
        const have = new Set(r.ingredientNames || []);
        if (!selectedIngredients.every((ing) => have.has(ing))) return false;
      }
      return true;
    });
  }, [recipes, query, fuse, category, cuisine, selectedIngredients]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, category, cuisine, selectedIngredients]);

  function addIngredient(ing) {
    setSelectedIngredients((prev) => (prev.includes(ing) ? prev : [...prev, ing]));
    setIngredientInput("");
    setShowSuggestions(false);
  }

  function removeIngredient(ing) {
    setSelectedIngredients((prev) => prev.filter((x) => x !== ing));
  }

  if (!recipes) {
    return <p className="meta-row">Loading recipes…</p>;
  }

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="controls">
        <input
          className="search-input"
          type="search"
          placeholder={`Search ${recipes.length.toLocaleString()} recipes…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
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

      <p className="meta-row">{filtered.length.toLocaleString()} recipes</p>

      {filtered.length === 0 ? (
        <div className="empty">No recipes match that search.</div>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <RecipeCard key={r.slug} recipe={r} />
          ))}
        </div>
      )}

      {visible < filtered.length ? (
        <button className="load-more" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          Show more
        </button>
      ) : null}
    </>
  );
}
