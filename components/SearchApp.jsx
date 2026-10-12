"use client";

import { useMemo } from "react";
import Link from "next/link";
import RecipeImage from "./RecipeImage";
import RecipeCard from "./RecipeCard";
import SearchFilters, { SortSelect } from "./filters/SearchFilters";
import { useRecipeIndex } from "../lib/queries";
import {
  useFilteredRecipes,
  useIngredientVocabulary,
  useRecipeFacets,
  useRecipeFilters,
} from "../lib/useRecipeFilters";
import { useListRestoration } from "../lib/useListRestoration";
import { DISCOVER_SORT_OPTIONS, QUICK_MINUTES } from "../lib/filters";
import TimeRange from "./filters/TimeRange";
import { OPEN } from "../lib/transitions";

const PAGE_SIZE = 40;

/** Loading state; also the first load fallback in app/page.jsx. */
export function SearchAppSkeleton() {
  return (
    <div className="grid skeleton-grid" aria-label="Loading recipes">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton-card img-frame" />
      ))}
    </div>
  );
}

// Must render under <FirstLoadSuspense> (useSearchParams via useRecipeFilters).
export default function SearchApp() {
  const { data, isError, refetch } = useRecipeIndex();
  const recipes = data ?? null;

  const facets = useRecipeFacets(recipes);
  const vocabulary = useIngredientVocabulary(recipes);
  const filterState = useRecipeFilters({
    persistKey: "discover",
    sortOptions: DISCOVER_SORT_OPTIONS,
    facets: recipes ? facets : undefined,
  });
  const filtered = useFilteredRecipes(recipes, filterState.deferredFilters, {
    sortOptions: DISCOVER_SORT_OPTIONS,
  });

  const { visible, showMore } = useListRestoration({
    key: `/?${filterState.search}`,
    ready: !!recipes,
    pageSize: PAGE_SIZE,
  });

  const featured = useMemo(
    () =>
      recipes?.find(
        (r) => r.image && r.totalTimeMinutes > 0 && r.totalTimeMinutes <= 30,
      ),
    [recipes],
  );

  if (!recipes) {
    if (isError) {
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

  const active = filterState.isActive;
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
              onClick={() =>
                filterState.setFilters({ minTime: null, maxTime: QUICK_MINUTES, category: "Dinner" })
              }
            >
              Find a quick dinner <span>↗</span>
            </button>
          </div>
          <Link className="hero-photo" href={`/recipes/${featured.slug}`} transitionTypes={OPEN}>
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
        <SearchFilters
          filterState={filterState}
          categories={facets.categories}
          cuisines={facets.cuisines}
          vocabulary={vocabulary}
          recipeCount={recipes.length}
        >
          <TimeRange filterState={filterState} recipes={recipes} />
        </SearchFilters>
      </section>
      <div className="results-heading">
        <h2>
          {active ? "Your matches" : "A world of good food"}
          <span>{filtered.length.toLocaleString()} recipes</span>
        </h2>
        <SortSelect filterState={filterState} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <h2>No matches just yet.</h2>
          <p>Try fewer ingredients or broaden your filters.</p>
          <button className="primary-btn" onClick={filterState.reset}>
            Explore all recipes
          </button>
        </div>
      ) : (
        <div className="grid">
          {/* The hero above morphs the featured photo; one name per page. */}
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
