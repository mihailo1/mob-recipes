"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DISCOVER_SORT_OPTIONS,
  applyRecipeFilters,
  defaultFilters,
  getIngredientVocabulary,
  getRecipeFacets,
  getRecipeFuse,
  isFiltersActive,
  normalizeIngredientTerms,
  parseFilters,
  sanitizeFilters,
  serializeFilters,
  sortContext,
} from "./filters";
import { compileIngredientMatcher } from "./ingredients.mjs";

/*
 * Filter state for a recipe list, mirrored to the URL query string and to
 * sessionStorage ("last used filters" for this list).
 *
 * - Source of truth is local state, so inputs stay instant. Every change is
 *   written to the URL with history.replaceState (no new history entry, no
 *   scroll jump, no RSC request; Next syncs useSearchParams from it). The text
 *   query is written after `debounceMs`; everything else immediately.
 * - On mount: URL params win. A bare URL (e.g. the Discover tab, which links
 *   to plain "/") restores the last filters from sessionStorage and puts them
 *   back in the URL.
 * - If the URL changes from outside while mounted (back/forward to another
 *   entry with different params), the URL is adopted. A bare URL never clears
 *   the filters; use reset() for that.
 *
 * Callers must render under <Suspense> (useSearchParams on a static page).
 */

const LAST_PREFIX = "mob-recipes:filters:";

function readLast(persistKey) {
  if (!persistKey || typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(LAST_PREFIX + persistKey) || "";
  } catch {
    return "";
  }
}

function writeLast(persistKey, search) {
  if (!persistKey) return;
  try {
    window.sessionStorage.setItem(LAST_PREFIX + persistKey, search);
  } catch {
    // storage unavailable, ignore
  }
}

/**
 * @param {object}   [opts]
 * @param {string}   [opts.persistKey="discover"] sessionStorage namespace; null disables "last filters"
 * @param {Array}    [opts.sortOptions=DISCOVER_SORT_OPTIONS] [{ id, label, compare? }], first = default
 * @param {object}   [opts.facets] { categories, cuisines } to drop unknown values
 * @param {boolean}  [opts.syncUrl=true] mirror state to the query string
 * @param {number}   [opts.debounceMs=250] delay for writing `q` to the URL
 */
export function useRecipeFilters({
  persistKey = "discover",
  sortOptions = DISCOVER_SORT_OPTIONS,
  facets,
  syncUrl = true,
  debounceMs = 250,
} = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ctx = sortContext(sortOptions);
  const urlSearch = syncUrl
    ? serializeFilters(parseFilters(searchParams, ctx), ctx)
    : "";

  const [state, setState] = useState(() => {
    const initial = urlSearch || readLast(persistKey);
    return {
      filters: parseFilters(initial, ctx),
      seenUrl: urlSearch,
      // Query strings this hook produced; a URL matching one of them is our
      // own (possibly delayed) write, not an outside navigation.
      trail: [initial],
    };
  });

  // Adopt outside URL changes (adjusting state during render, no effect).
  if (syncUrl && urlSearch !== state.seenUrl) {
    if (urlSearch === "" || state.trail.includes(urlSearch)) {
      setState({ ...state, seenUrl: urlSearch });
    } else {
      const parsed = parseFilters(urlSearch, ctx);
      // Keep the exact text being typed if it is the same query.
      if (state.filters.q.trim() === parsed.q) parsed.q = state.filters.q;
      setState({ filters: parsed, seenUrl: urlSearch, trail: [urlSearch] });
    }
  }

  const filters = useMemo(
    () => sanitizeFilters(state.filters, facets),
    [state.filters, facets],
  );
  const search = serializeFilters(filters, ctx);
  const deferredFilters = useDeferredValue(filters);

  const timerRef = useRef(null);

  function writeUrl(nextSearch) {
    if (!syncUrl) return;
    const loc = window.location;
    if (loc.pathname !== pathname) return; // navigated away meanwhile
    const next = `${pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    if (next === loc.pathname + loc.search) return;
    // null state: Next copies its own history state in and syncs the router.
    window.history.replaceState(null, "", next + loc.hash);
  }

  function commit(next, { debounce = false } = {}) {
    const nextSearch = serializeFilters(sanitizeFilters(next, facets), ctx);
    setState((s) => ({
      ...s,
      filters: next,
      trail: [...s.trail.slice(-19), nextSearch],
    }));
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (debounce) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        writeUrl(nextSearch);
      }, debounceMs);
    } else {
      writeUrl(nextSearch);
    }
  }

  // Remember the last filters for this list (Discover tab restores them).
  useEffect(() => {
    writeLast(persistKey, search);
  }, [persistKey, search]);

  // Bare URL with filters in state (restored on mount, or the Discover tab
  // tapped while already on Discover): put the filters back in the URL.
  useEffect(() => {
    if (!syncUrl || timerRef.current) return;
    if (urlSearch === "" && search !== "") writeUrl(search);
    // writeUrl only reads pathname/syncUrl, both covered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUrl, urlSearch, search, pathname]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const current = state.filters;
  return {
    /** Sanitized filter model; `q` is the live input text. */
    filters,
    /** Same, but lags behind fast typing. Use it for the expensive filtering. */
    deferredFilters,
    /** Canonical query string (no "?") of `filters`; "" when nothing is set. */
    search,
    isActive: isFiltersActive(filters),
    sortOptions,
    /** Text query: updates instantly, URL write is debounced. */
    setQuery: (q) => commit({ ...current, q }, { debounce: true }),
    /** Write a pending debounced query to the URL now (call on blur). */
    flushQuery: () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      writeUrl(search);
    },
    setFilter: (key, value) => commit({ ...current, [key]: value }),
    /** Merge several fields at once, e.g. setFilters({ minTime, maxTime }). */
    setFilters: (patch) => commit({ ...current, ...patch }),
    addIngredient: (term) =>
      commit({
        ...current,
        ingredients: normalizeIngredientTerms([...current.ingredients, term]),
      }),
    removeIngredient: (term) =>
      commit({
        ...current,
        ingredients: current.ingredients.filter((t) => t !== term),
      }),
    /** Clear every filter (and sort) back to defaults. */
    reset: () => commit(defaultFilters(ctx)),
  };
}

/** { categories, cuisines } for the selects (cached per recipes array). */
export function useRecipeFacets(recipes) {
  return useMemo(() => getRecipeFacets(recipes), [recipes]);
}

/** Ingredient autocomplete vocabulary (cached per recipes array). */
export function useIngredientVocabulary(recipes) {
  return useMemo(() => getIngredientVocabulary(recipes), [recipes]);
}

/**
 * Memoized applyRecipeFilters. Pass `filterState.deferredFilters` so typing
 * stays smooth. `sortOptions` must match the ones given to useRecipeFilters.
 */
export function useFilteredRecipes(
  recipes,
  filters,
  { sortOptions = DISCOVER_SORT_OPTIONS } = {},
) {
  const fuse = useMemo(() => getRecipeFuse(recipes), [recipes]);
  const ingKey = filters.ingredients.join(",");
  const matcher = useMemo(
    () => compileIngredientMatcher(ingKey ? ingKey.split(",") : []),
    [ingKey],
  );
  return useMemo(
    () => applyRecipeFilters(recipes, filters, { fuse, matcher, sortOptions }),
    [recipes, filters, fuse, matcher, sortOptions],
  );
}
