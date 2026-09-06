"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Fuse from "fuse.js";

const PAGE_SIZE = 40;

export default function SearchApp() {
  const [recipes, setRecipes] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch("/search-index.json")
      .then((r) => r.json())
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, []);

  const fuse = useMemo(() => {
    if (!recipes) return null;
    return new Fuse(recipes, {
      keys: ["name", "keywords", "cuisine", "category"],
      threshold: 0.32,
      ignoreLocation: true,
    });
  }, [recipes]);

  const { categories, cuisines } = useMemo(() => {
    if (!recipes) return { categories: [], cuisines: [] };
    const cats = new Set();
    const cuis = new Set();
    for (const r of recipes) {
      (r.category || []).forEach((c) => cats.add(c));
      if (r.cuisine) cuis.add(r.cuisine);
    }
    return {
      categories: [...cats].sort(),
      cuisines: [...cuis].sort(),
    };
  }, [recipes]);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    let base = recipes;
    if (query.trim() && fuse) {
      base = fuse.search(query.trim()).map((r) => r.item);
    }
    return base.filter((r) => {
      if (category && !(r.category || []).includes(category)) return false;
      if (cuisine && r.cuisine !== cuisine) return false;
      return true;
    });
  }, [recipes, query, fuse, category, cuisine]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, category, cuisine]);

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

      <p className="meta-row">{filtered.length.toLocaleString()} recipes</p>

      {filtered.length === 0 ? (
        <div className="empty">No recipes match that search.</div>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <Link key={r.slug} href={`/recipes/${r.slug}`} className="card">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="card-image" src={r.image} alt={r.name} loading="lazy" />
              ) : (
                <div className="card-image" />
              )}
              <div className="card-body">
                <div className="card-title">{r.name}</div>
                <div className="chip-row">
                  {r.totalTimeMinutes ? (
                    <span className="chip time">{r.totalTimeMinutes} min</span>
                  ) : null}
                  {(r.category || []).slice(0, 2).map((c) => (
                    <span className="chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
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
