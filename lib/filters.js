import Fuse from "fuse.js";
import {
  buildVocabulary,
  compileIngredientMatcher,
  normalizeIngredient,
} from "./ingredients.mjs";

/*
 * Recipe filter model, URL (de)serialization and the pure filter function.
 * No React here, so it can be reused by any page (Discover, Saved, ...).
 *
 * Filter model:
 *   { q, category, cuisine, ingredients[], minTime, maxTime, sort }
 *
 * minTime / maxTime are cook-time bounds in minutes (null = no bound). They
 * live on the TIME_STEPS grid; maxTime >= TIME_CAP is stored as null ("180+").
 * The old `quick=1` URL param is still read and means maxTime = 30.
 *
 * Every field is described once in FILTER_FIELDS (URL param name, default,
 * parse, serialize). To add a field add an entry there and a predicate in
 * buildPredicates() below. Nothing else needs to know about it: the hook,
 * URL sync and "is anything active" check all read FILTER_FIELDS.
 */

const MAX_QUERY_LENGTH = 100;
const MAX_INGREDIENTS = 12;

// --- Cook-time range -------------------------------------------------------

/** Upper end of the slider; "180+" means no upper bound. */
export const TIME_CAP = 180;
/** What the "30 minutes or less" shortcut sets. */
export const QUICK_MINUTES = 30;

/** Slider stops: every 5 min up to 60, then every 15 min up to `max`. */
export function buildTimeSteps(max = TIME_CAP) {
  const top = Math.min(TIME_CAP, Math.max(15, max));
  const steps = [];
  for (let m = 0; m <= Math.min(60, top); m += 5) steps.push(m);
  for (let m = 75; m < top; m += 15) steps.push(m);
  if (top > 60) steps.push(Math.ceil(top / 15) * 15);
  return steps;
}

/** Nearest stop on the full (0..TIME_CAP) grid. */
function snapMinutes(n) {
  const v = Math.min(TIME_CAP, Math.max(0, n));
  return v <= 60 ? Math.round(v / 5) * 5 : Math.round(v / 15) * 15;
}

const parseMinutes = (v) => {
  if (!/^\d{1,4}$/.test(String(v).trim())) return undefined;
  return snapMinutes(Number(v));
};

/** Top stop of the slider for this data set (cached per recipes array). */
const timeMaxCache = new WeakMap();
export function getTimeMax(recipes) {
  if (!recipes) return TIME_CAP;
  let hit = timeMaxCache.get(recipes);
  if (hit == null) {
    let max = 0;
    for (const r of recipes) if (r.totalTimeMinutes > max) max = r.totalTimeMinutes;
    hit = Math.min(TIME_CAP, Math.ceil((max || TIME_CAP) / 15) * 15);
    timeMaxCache.set(recipes, hit);
  }
  return hit;
}

/** "Any time", "Up to 45 min", "10–45 min", "From 60 min", "180+ min". */
export function formatTimeRange(minTime, maxTime, topStep = TIME_CAP) {
  const lo = minTime ?? 0;
  const top = `${topStep}+`;
  if (minTime == null && maxTime == null) return "Any time";
  if (minTime == null) return `Up to ${maxTime} min`;
  if (maxTime == null) return lo >= topStep ? `${top} min` : `From ${lo} min`;
  return `${lo}–${maxTime} min`;
}

const text = (v) =>
  typeof v === "string" ? v.trim().slice(0, MAX_QUERY_LENGTH) : "";

/** Canonical, deduped ingredient terms. Accepts an array or a "a,b" string. */
export function normalizeIngredientTerms(input) {
  const list = Array.isArray(input) ? input : String(input || "").split(",");
  const out = [];
  for (const raw of list) {
    const t = normalizeIngredient(String(raw)).replace(/,/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_INGREDIENTS) break;
  }
  return out;
}

/*
 * Field spec. Order here is the order of params in the URL.
 *  param:     query string key
 *  default:   value when absent/invalid
 *  parse:     (string, ctx) => value | undefined (undefined = invalid → default)
 *  serialize: (value, ctx) => string | null (null = omit from URL)
 */
export const FILTER_FIELDS = {
  q: {
    param: "q",
    default: "",
    parse: (v) => text(v) || undefined,
    serialize: (v) => text(v) || null,
  },
  category: {
    param: "cat",
    default: "",
    parse: (v) => text(v) || undefined,
    serialize: (v) => v || null,
  },
  cuisine: {
    param: "cuisine",
    default: "",
    parse: (v) => text(v) || undefined,
    serialize: (v) => v || null,
  },
  ingredients: {
    param: "ing",
    default: [],
    parse: (v) => {
      const terms = normalizeIngredientTerms(v);
      return terms.length ? terms : undefined;
    },
    serialize: (v) => (v && v.length ? v.join(",") : null),
  },
  minTime: {
    param: "tmin",
    default: null,
    parse: (v) => {
      const n = parseMinutes(v);
      return n ? n : undefined; // 0 = no lower bound
    },
    serialize: (v) => (v ? String(v) : null),
  },
  maxTime: {
    param: "tmax",
    default: null,
    parse: (v) => {
      const n = parseMinutes(v);
      return n && n < TIME_CAP ? n : undefined; // cap = no upper bound
    },
    serialize: (v) => (v && v < TIME_CAP ? String(v) : null),
  },
  sort: {
    param: "sort",
    default: null, // resolved per page: ctx.defaultSort
    parse: (v, ctx) => (ctx.sortIds.includes(v) ? v : undefined),
    serialize: (v, ctx) => (v && v !== ctx.defaultSort ? v : null),
  },
};

/** Fields that count as "a filter is applied" (sort is just ordering). */
const ACTIVE_FIELDS = Object.keys(FILTER_FIELDS).filter((k) => k !== "sort");

// --- Sorting ---------------------------------------------------------------

const byTime = (a, b) =>
  (a.totalTimeMinutes || Infinity) - (b.totalTimeMinutes || Infinity);
const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * Sort options are per page. `compare` is a normal comparator; omit it to
 * keep the incoming order (index order, or Fuse relevance when searching).
 * The first option is the default and is omitted from the URL.
 */
export const DISCOVER_SORT_OPTIONS = [
  { id: "default", label: "Default order" },
  { id: "time", label: "Quickest first", compare: byTime },
  { id: "name", label: "A–Z", compare: byName },
];

/** Saved page: recipes must carry `savedAt` (ms), see app/favorites. */
export const SAVED_SORT_OPTIONS = [
  { id: "recent", label: "Recently saved", compare: (a, b) => b.savedAt - a.savedAt },
  { id: "oldest", label: "Oldest saved", compare: (a, b) => a.savedAt - b.savedAt },
  { id: "time", label: "Quickest first", compare: byTime },
  { id: "name", label: "A–Z", compare: byName },
];

export function sortContext(sortOptions = DISCOVER_SORT_OPTIONS) {
  return {
    sortIds: sortOptions.map((o) => o.id),
    defaultSort: sortOptions[0]?.id ?? "default",
  };
}

// --- Model helpers ---------------------------------------------------------

export function defaultFilters(ctx = sortContext()) {
  const out = {};
  for (const [key, f] of Object.entries(FILTER_FIELDS)) {
    out[key] = Array.isArray(f.default) ? [] : f.default;
  }
  out.sort = ctx.defaultSort;
  return out;
}

/** URLSearchParams | string | plain object → filter model. Invalid → default. */
export function parseFilters(input, ctx = sortContext()) {
  const params =
    input instanceof URLSearchParams
      ? input
      : new URLSearchParams(
          typeof input === "string" ? input.replace(/^\?/, "") : input || "",
        );
  const out = defaultFilters(ctx);
  for (const [key, f] of Object.entries(FILTER_FIELDS)) {
    const raw = params.get(f.param);
    if (raw == null) continue;
    const v = f.parse(raw, ctx);
    if (v !== undefined) out[key] = v;
  }
  // Legacy "30 minutes or less" links: quick=1 → tmax=30.
  const legacy = params.get("quick");
  if ((legacy === "1" || legacy === "true") && out.maxTime == null) {
    out.maxTime = QUICK_MINUTES;
  }
  return out;
}

/** Filter model → canonical query string without "?" ("" when all default). */
export function serializeFilters(filters, ctx = sortContext()) {
  const parts = [];
  for (const [key, f] of Object.entries(FILTER_FIELDS)) {
    const v = f.serialize(filters[key], ctx);
    if (v == null || v === "") continue;
    // Readable URLs: ing=onion,garlic and q=green+curry.
    parts.push(
      `${f.param}=${encodeURIComponent(v).replace(/%2C/g, ",").replace(/%20/g, "+")}`,
    );
  }
  return parts.join("&");
}

export function isFiltersActive(filters) {
  return ACTIVE_FIELDS.some((key) => {
    const v = filters[key];
    const d = FILTER_FIELDS[key].default;
    return Array.isArray(v) ? v.length > 0 : v !== d && v !== "" && v != null;
  });
}

/**
 * Drop values that don't exist in this data set (e.g. a stale ?cat= from an
 * old link). `facets` = { categories, cuisines }; missing lists are skipped.
 */
export function sanitizeFilters(filters, facets) {
  if (!facets) return filters;
  let out = filters;
  if (
    filters.category &&
    facets.categories &&
    !facets.categories.includes(filters.category)
  ) {
    out = { ...out, category: "" };
  }
  if (
    filters.cuisine &&
    facets.cuisines &&
    !facets.cuisines.includes(filters.cuisine)
  ) {
    out = { ...out, cuisine: "" };
  }
  return out;
}

// --- Derived data (cached per recipes array) -------------------------------

const splitCuisine = (c) =>
  (c || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// React Query returns the same array reference until the data changes, so
// these caches make remounts (e.g. coming back to Discover) free.
const facetCache = new WeakMap();
const fuseCache = new WeakMap();
const vocabCache = new WeakMap();

/** { categories, cuisines } sorted, for the selects. */
export function getRecipeFacets(recipes) {
  if (!recipes) return { categories: [], cuisines: [] };
  let hit = facetCache.get(recipes);
  if (!hit) {
    const cats = new Set();
    const cuis = new Set();
    for (const r of recipes) {
      (r.category || []).forEach((c) => cats.add(c));
      splitCuisine(r.cuisine).forEach((c) => cuis.add(c));
    }
    hit = { categories: [...cats].sort(), cuisines: [...cuis].sort() };
    facetCache.set(recipes, hit);
  }
  return hit;
}

export function getRecipeFuse(recipes) {
  if (!recipes) return null;
  let hit = fuseCache.get(recipes);
  if (!hit) {
    hit = new Fuse(recipes, {
      keys: ["name", "keywords", "cuisine", "category"],
      threshold: 0.32,
      ignoreLocation: true,
    });
    fuseCache.set(recipes, hit);
  }
  return hit;
}

/** Ingredient autocomplete vocabulary ([{ name, count }]) for these recipes. */
export function getIngredientVocabulary(recipes) {
  if (!recipes) return [];
  let hit = vocabCache.get(recipes);
  if (!hit) {
    hit = buildVocabulary(recipes);
    vocabCache.set(recipes, hit);
  }
  return hit;
}

// --- Filtering -------------------------------------------------------------

function buildPredicates(filters, matcher) {
  const preds = [];
  if (filters.category) {
    const c = filters.category;
    preds.push((r) => (r.category || []).includes(c));
  }
  if (filters.cuisine) {
    const c = filters.cuisine;
    preds.push((r) => splitCuisine(r.cuisine).includes(c));
  }
  if (filters.ingredients && filters.ingredients.length) {
    preds.push(matcher || compileIngredientMatcher(filters.ingredients));
  }
  // Narrowing the range drops recipes without a time; the full range keeps them.
  const { minTime, maxTime } = filters;
  if (minTime != null || maxTime != null) {
    const lo = minTime ?? 0;
    const hi = maxTime ?? Infinity;
    preds.push((r) => r.totalTimeMinutes > 0 && r.totalTimeMinutes >= lo && r.totalTimeMinutes <= hi);
  }
  return preds;
}

/**
 * Pure: recipes + filter model → filtered, sorted array.
 *  options.fuse        Fuse instance over `recipes` (optional; falls back to
 *                      a plain name match)
 *  options.matcher     compileIngredientMatcher(filters.ingredients) (optional)
 *  options.sortOptions the page's sort options (default DISCOVER_SORT_OPTIONS)
 */
export function applyRecipeFilters(recipes, filters, options = {}) {
  if (!recipes) return [];
  const { fuse, matcher, sortOptions = DISCOVER_SORT_OPTIONS } = options;
  let base = recipes;
  const q = text(filters.q);
  if (q) {
    if (fuse) base = fuse.search(q).map((r) => r.item);
    else {
      const lq = q.toLowerCase();
      base = recipes.filter((r) => r.name.toLowerCase().includes(lq));
    }
  }
  const preds = buildPredicates(filters, matcher);
  const out = preds.length
    ? base.filter((r) => preds.every((p) => p(r)))
    : base.slice();
  const compare = sortOptions.find((o) => o.id === filters.sort)?.compare;
  return compare ? out.sort(compare) : out;
}
