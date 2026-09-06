"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useKitchen } from "../../lib/store";
import RecipeCard from "../../components/RecipeCard";

export default function FavoritesPage() {
  const { favorites, ready } = useKitchen();
  const [index, setIndex] = useState(null);

  useEffect(() => {
    fetch("/search-index.json")
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex([]));
  }, []);

  const recipes = useMemo(() => {
    if (!index) return [];
    return index.filter((r) => favorites.has(r.slug));
  }, [index, favorites]);

  return (
    <div className="container">
      <header className="header">
        <h1>Favorites</h1>
        <p>Recipes you&apos;ve saved for later.</p>
      </header>

      {!ready || !index ? (
        <p className="meta-row">Loading…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          Nothing saved yet. Hit the ♡ on any recipe to keep it here — head to{" "}
          <Link href="/" className="back-link" style={{ display: "inline" }}>
            search
          </Link>
          .
        </div>
      ) : (
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard key={r.slug} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}
