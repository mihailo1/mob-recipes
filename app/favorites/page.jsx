"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useKitchen } from "../../lib/store";
import { useRecipeIndex } from "../../lib/queries";
import RecipeCard from "../../components/RecipeCard";
import { SearchAppSkeleton } from "../../components/SearchApp";
import SearchFilters, {
  SortSelect,
} from "../../components/filters/SearchFilters";
import TimeRange from "../../components/filters/TimeRange";
import {
  useFilteredRecipes,
  useIngredientVocabulary,
  useRecipeFacets,
  useRecipeFilters,
} from "../../lib/useRecipeFilters";
import { useListRestoration } from "../../lib/useListRestoration";
import { SAVED_SORT_OPTIONS } from "../../lib/filters";

const PAGE_SIZE = 40;

// Must render under <Suspense> (useSearchParams via useRecipeFilters).
function SavedApp() {
  const { favorites, ready } = useKitchen();
  const { data: index, isError, refetch } = useRecipeIndex();

  // Saved recipes with the time they were saved (for the "recently saved" sort).
  const saved = useMemo(() => {
    if (!index) return null;
    return index
      .filter((r) => favorites.has(r.slug))
      .map((r) => ({ ...r, savedAt: favorites.get(r.slug) ?? 0 }));
  }, [index, favorites]);

  const facets = useRecipeFacets(saved);
  const vocabulary = useIngredientVocabulary(saved);
  const filterState = useRecipeFilters({
    persistKey: "saved",
    sortOptions: SAVED_SORT_OPTIONS,
    facets: saved ? facets : undefined,
  });
  const filtered = useFilteredRecipes(saved, filterState.deferredFilters, {
    sortOptions: SAVED_SORT_OPTIONS,
  });

  const loaded = ready && !!saved;
  const { visible, showMore } = useListRestoration({
    key: `/favorites?${filterState.search}`,
    ready: loaded,
    pageSize: PAGE_SIZE,
  });

  if (!loaded) {
    if (isError && !index) {
      return (
        <div className="empty">
          <h2>Recipes couldn’t load</h2>
          <button className="pill-btn" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      );
    }
    return <SearchAppSkeleton />;
  }

  if (saved.length === 0) {
    return (
      <div className="empty saved-empty">
        <h2>Nothing saved yet.</h2>
        <p>
          Hit the ♡ on any recipe to keep it here. Head to{" "}
          <Link href="/" className="back-link" style={{ display: "inline" }}>
            search
          </Link>{" "}
          to find something good.
        </p>
      </div>
    );
  }

  const active = filterState.isActive;
  const shown = filtered.slice(0, visible);

  return (
    <>
      <section className="search-panel saved-filters" aria-label="Filter saved recipes">
        <SearchFilters
          filterState={filterState}
          categories={facets.categories}
          cuisines={facets.cuisines}
          vocabulary={vocabulary}
          recipeCount={saved.length}
        >
          <TimeRange filterState={filterState} recipes={index} />
        </SearchFilters>
      </section>

      <div className="results-heading">
        <h2>
          {active ? "Your saved matches" : "Your saved recipes"}
          <span>
            {filtered.length.toLocaleString()}
            {active ? ` of ${saved.length.toLocaleString()}` : ""}{" "}
            {saved.length === 1 && !active ? "recipe" : "recipes"}
          </span>
        </h2>
        <SortSelect filterState={filterState} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty saved-empty">
          <h2>No saved matches.</h2>
          <p>Try fewer ingredients or broaden your filters.</p>
          <button className="primary-btn" onClick={filterState.reset}>
            Clear filters
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
        <button className="load-more" onClick={showMore}>
          Show more
        </button>
      ) : null}
    </>
  );
}

export default function FavoritesPage() {
  return (
    <div className="container">
      <header className="header">
        <span className="eyebrow">YOUR PERSONAL COOKBOOK</span>
        <h1>Saved for a good day.</h1>
        <p>Recipes you&apos;ve saved for later.</p>
      </header>
      <Suspense fallback={<SearchAppSkeleton />}>
        <SavedApp />
      </Suspense>
    </div>
  );
}
