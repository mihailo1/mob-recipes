"use client";

import IngredientFilter from "./IngredientFilter";

const DEFAULT_QUICK_CATEGORIES = [
  "Vegan",
  "Veggie",
  "High-Protein",
  "One Pot Recipes",
  "Meal-Prep",
];

/** "Clear filters ×". Renders nothing unless a filter is active. */
export function ClearFiltersButton({ filterState }) {
  if (!filterState.isActive) return null;
  return (
    <button className="text-btn" onClick={filterState.reset}>
      Clear filters ×
    </button>
  );
}

/** Sort dropdown for the page's sort options. */
export function SortSelect({ filterState }) {
  const { filters, sortOptions, setFilter } = filterState;
  return (
    <select
      aria-label="Sort recipes"
      value={filters.sort}
      onChange={(e) => setFilter("sort", e.target.value)}
    >
      {sortOptions.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * The filter controls: text search, category, cuisine, ingredient chips,
 * quick pills and "Clear filters".
 *
 * Props:
 *  filterState      return value of useRecipeFilters()
 *  categories       string[] (useRecipeFacets)
 *  cuisines         string[] (useRecipeFacets)
 *  vocabulary       useIngredientVocabulary(recipes)
 *  recipeCount      number, for the search placeholder
 *  quickCategories  category pills shown next to "30 minutes or less"
 *  children         extra controls, rendered between the ingredient help text
 *                   and the quick pills (e.g. a cook-time range slider)
 */
export default function SearchFilters({
  filterState,
  categories,
  cuisines,
  vocabulary,
  recipeCount,
  quickCategories = DEFAULT_QUICK_CATEGORIES,
  children,
}) {
  const {
    filters,
    setQuery,
    flushQuery,
    setFilter,
    addIngredient,
    removeIngredient,
  } = filterState;

  return (
    <>
      <div className="controls">
        <input
          className="search-input"
          aria-label="Search recipes"
          type="search"
          placeholder={`Search ${recipeCount.toLocaleString()} recipes…`}
          value={filters.q}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={flushQuery}
        />
        <select
          aria-label="Category"
          value={filters.category}
          onChange={(e) => setFilter("category", e.target.value)}
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
          value={filters.cuisine}
          onChange={(e) => setFilter("cuisine", e.target.value)}
        >
          <option value="">All cuisines</option>
          {cuisines.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <IngredientFilter
        selected={filters.ingredients}
        vocabulary={vocabulary}
        onAdd={addIngredient}
        onRemove={removeIngredient}
      />

      <p className="filter-help">
        Use what you have: add multiple ingredients to find recipes containing
        all of them.
      </p>

      {/* Cook-time range slider goes here (passed as children): read
          filterState.filters.minTime/maxTime, write with
          filterState.setFilters({ minTime, maxTime }). */}
      {children}

      <div className="quick-filters">
        <button
          className={`pill-btn ${filters.quick ? "is-active" : ""}`}
          aria-pressed={filters.quick}
          onClick={() => setFilter("quick", !filters.quick)}
        >
          ◷ 30 minutes or less
        </button>
        {quickCategories
          .filter((c) => categories.includes(c))
          .map((c) => (
            <button
              key={c}
              className={`pill-btn ${filters.category === c ? "is-active" : ""}`}
              aria-pressed={filters.category === c}
              onClick={() =>
                setFilter("category", filters.category === c ? "" : c)
              }
            >
              {c}
            </button>
          ))}
        <ClearFiltersButton filterState={filterState} />
      </div>
    </>
  );
}
