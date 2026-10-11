"use client";

import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";

/*
 * Data hooks for the static search index and single recipes.
 *
 * Everything goes through the shared QueryClient (components/Providers.jsx),
 * so data survives client navigation: coming back to Discover renders from
 * cache with no loading state. The service worker still sits underneath and
 * serves /search-index.json stale-while-revalidate, which also makes this work
 * offline (queries run with networkMode "offlineFirst").
 */

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status} ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const recipeIndexQuery = queryOptions({
  queryKey: ["recipe-index"],
  queryFn: () => fetchJSON("/search-index.json"),
  staleTime: 10 * 60 * 1000,
  gcTime: Infinity,
});

export function recipeQuery(slug) {
  return queryOptions({
    queryKey: ["recipe", slug],
    queryFn: async () => {
      try {
        return await fetchJSON(`/api/recipe/${encodeURIComponent(slug)}`);
      } catch (err) {
        // A recipe that no longer exists is "no data", not an error to retry.
        if (err.status === 404) return null;
        throw err;
      }
    },
    staleTime: 60 * 60 * 1000,
  });
}

/** The full search index: [{ slug, name, image, category[], cuisine, ... }]. */
export function useRecipeIndex() {
  return useQuery(recipeIndexQuery);
}

/** One full recipe from /api/recipe/<slug>. Data is null when it 404s. */
export function useRecipe(slug) {
  return useQuery({ ...recipeQuery(slug), enabled: !!slug });
}

/**
 * Several full recipes at once, in the order of `slugs`.
 * Returns { recipes, isPending } where recipes skips missing/failed ones.
 */
export function useRecipes(slugs) {
  return useQueries({
    queries: slugs.map((slug) => recipeQuery(slug)),
    combine: combineRecipes,
  });
}

// Module-level so useQueries can memoize the combined result.
function combineRecipes(results) {
  return {
    recipes: results.map((r) => r.data).filter(Boolean),
    isPending: results.some((r) => r.isPending),
  };
}
