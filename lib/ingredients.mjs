// Shared, best-effort ingredient parsing. Mob's ingredient strings have no
// structured quantity/unit fields — they're free text like "200g Kale" or
// "4Breast Chicken Breast" or just "Salt" — so everything here is a
// heuristic, not an exact parser. Used both at build time (build-index.mjs)
// and in the app (pool aggregation, serving scaler, step highlighting).

import {
  KEEP_PLURAL,
  IRREGULAR,
  WORD_SYNONYMS,
  PHRASE_SYNONYMS,
  MINCE_MEATS,
  STRIP_PHRASES,
  STRIP_WORDS,
  CUT_WORDS,
  DERIVED_HEAD_RE,
  COMPOUND_BLOCKS,
} from "./ingredient-synonyms.mjs";

const FRACTIONS = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 0.2,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const UNIT_ALIASES = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  litre: "l",
  litres: "l",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  pound: "lb",
  pounds: "lb",
};

function tokenToNumber(tok) {
  if (!tok) return null;
  if (FRACTIONS[tok] !== undefined) return FRACTIONS[tok];
  const lastChar = tok.slice(-1);
  if (FRACTIONS[lastChar] !== undefined) {
    const whole = parseFloat(tok.slice(0, -1) || "0");
    return whole + FRACTIONS[lastChar];
  }
  const n = parseFloat(tok.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

const LEADING_QTY_RE =
  /^([\d¼½¾⅓⅔⅕⅛⅜⅝⅞]+(?:[.,]\d+)?|[.,]\d+)([a-zA-Z]*)\s*(.*)$/;

const PREP_WORDS = [
  "fresh",
  "dried",
  "ground",
  "chopped",
  "finely chopped",
  "sliced",
  "crushed",
  "grated",
  "cooked",
  "raw",
  "peeled",
  "diced",
  "minced",
  "large",
  "small",
  "medium",
  "ripe",
];

/**
 * Parse one ingredient line into { raw, quantity, unit, name }.
 * quantity/unit are null when the line has none (e.g. "Salt").
 *
 * Mob sometimes prefixes a pack count before the real quantity, e.g.
 * "1x 400g Can Chopped Tomatoes" or "2x 400g Can...". That "Nx" is a
 * multiplier on whatever quantity/unit follows it, not a unit itself, so
 * it's unwrapped rather than treated as the ingredient's own unit.
 */
export function parseIngredientLine(raw, _depth = 0) {
  const m = String(raw).trim().match(LEADING_QTY_RE);
  if (!m) return { raw, quantity: null, unit: null, name: raw.trim() };

  const [, qtyTok, unitTok, rest] = m;
  const quantity = tokenToNumber(qtyTok);

  if (unitTok && unitTok.toLowerCase() === "x" && rest && _depth < 2) {
    const inner = parseIngredientLine(rest, _depth + 1);
    return {
      raw,
      quantity:
        quantity != null && inner.quantity != null ? quantity * inner.quantity : inner.quantity,
      unit: inner.unit,
      name: inner.name,
    };
  }

  const unit = unitTok ? UNIT_ALIASES[unitTok.toLowerCase()] || unitTok : null;
  const name = (rest || "").trim() || raw.trim();

  return { raw, quantity, unit, name };
}

/** Strip common prep-word prefixes so "Fresh Dill" and "Dill" line up better. */
export function normalizeIngredientName(raw) {
  const { name } = parseIngredientLine(raw);
  let n = name.toLowerCase().trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of PREP_WORDS) {
      if (n.startsWith(w + " ")) {
        n = n.slice(w.length + 1);
        changed = true;
      }
    }
  }
  return n.trim();
}

/** Format a scaled quantity back into a short display string. */
export function formatQuantity(n) {
  if (n == null || Number.isNaN(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  // snap close-to-common fractions for nicer display
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const NICE = [
    [0.25, "¼"],
    [0.33, "⅓"],
    [0.5, "½"],
    [0.67, "⅔"],
    [0.75, "¾"],
  ];
  for (const [val, glyph] of NICE) {
    if (Math.abs(frac - val) < 0.04) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  return rounded % 1 === 0 ? String(rounded) : String(Math.round(rounded * 100) / 100);
}

export function formatIngredient({ quantity, unit, name }) {
  if (quantity == null) return name;
  const q = formatQuantity(quantity);
  return unit ? `${q}${unit} ${name}` : `${q} ${name}`;
}

/**
 * Aggregate ingredient lines from multiple recipes into one shopping list.
 * Groups by normalized name + unit; sums quantities when both are numeric.
 * Returns entries sorted alphabetically by name.
 */
/**
 * Find mentions of the given ingredients inside a step's text, for
 * highlighting. `ingredients` is [{ name, quantity, unit }] (already
 * scaled to the current serving size). Returns an array of segments:
 * { text, match, tooltip? } to render in order.
 */
export function findIngredientMentions(stepText, ingredients) {
  const items = (ingredients || [])
    .filter((i) => i.name && i.name.trim().length > 2)
    .map((i) => ({ ...i, lower: i.name.trim().toLowerCase() }))
    .sort((a, b) => b.lower.length - a.lower.length);

  const matches = [];
  for (const item of items) {
    const escaped = item.lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let m;
    while ((m = re.exec(stepText))) {
      const start = m.index;
      const end = start + m[0].length;
      if (matches.some((x) => start < x.end && end > x.start)) continue;
      matches.push({ start, end, item });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      segments.push({ text: stepText.slice(cursor, m.start), match: false });
    }
    const tooltip =
      m.item.quantity != null
        ? `${formatQuantity(m.item.quantity)}${m.item.unit || ""}`.trim()
        : null;
    segments.push({ text: stepText.slice(m.start, m.end), match: true, tooltip });
    cursor = m.end;
  }
  if (cursor < stepText.length) {
    segments.push({ text: stepText.slice(cursor), match: false });
  }
  return segments;
}

export function aggregateIngredients(recipes) {
  const groups = new Map(); // key -> { name, unit, quantity, raws:Set, sources:Set }

  for (const recipe of recipes) {
    for (const raw of recipe.ingredients || []) {
      const parsed = parseIngredientLine(raw);
      const normName = normalizeIngredientName(raw);
      const key = `${normName}::${parsed.unit || ""}`;
      if (!groups.has(key)) {
        groups.set(key, {
          name: parsed.name,
          unit: parsed.unit,
          quantity: 0,
          hasQuantity: false,
          sources: new Set(),
        });
      }
      const g = groups.get(key);
      if (parsed.quantity != null) {
        g.quantity += parsed.quantity;
        g.hasQuantity = true;
      }
      g.sources.add(recipe.name || recipe.slug);
    }
  }

  return [...groups.values()]
    .map((g) => ({
      label: g.hasQuantity ? formatIngredient(g) : g.name,
      name: g.name,
      unit: g.unit,
      quantity: g.hasQuantity ? g.quantity : null,
      sources: [...g.sources],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Ingredient search / matching
//
// Pipeline: every ingredient line is reduced to a CANONICAL name (lowercase,
// singular, UK spelling, no quantity/unit/prep words, synonyms collapsed), e.g.
//   "2x 400g Chopped Tomatoes"      -> "tomato"
//   "1 Large Zucchini (to serve)"   -> "courgette"
//   "4 Skin-On Chicken Thighs"      -> "chicken thigh"
// Recipes store those canonical names (index field `ingredientNames`). User
// queries go through the same normalization, so synonyms and plurals resolve
// both ways. A term matches a canonical name when they are equal or when the
// name contains the term as whole words ("onion" matches "red onion" but
// "egg" never matches "eggplant").
// ---------------------------------------------------------------------------

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PHRASE_RULES = PHRASE_SYNONYMS.slice()
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, to]) => [new RegExp(`(^| )${escapeRe(from)}(?= |$)`, "g"), `$1${to}`]);
const STRIP_PHRASE_RE = new RegExp(
  `(^| )(?:${STRIP_PHRASES.map(escapeRe).join("|")})(?= |$)`,
  "g",
);
const MEAT_ALT = MINCE_MEATS.join("|");
const MINCE_RE_1 = new RegExp(`(^| )(?:ground|minced|mince) (${MEAT_ALT})(?= |$)`, "g");
const MINCE_RE_2 = new RegExp(`(^| )(${MEAT_ALT}) (?:ground|minced|mince)(?= |$)`, "g");

/** "tomatoes" -> "tomato", "berries" -> "berry"; leaves singular words alone. */
function singularize(w) {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3 || KEEP_PLURAL.has(w) || !w.endsWith("s")) return w;
  if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is")) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ches|shes|xes|zzes|oes)$/.test(w)) return w.slice(0, -2);
  return w.slice(0, -1);
}

function computeCanonical(input) {
  let s = parseIngredientLine(input).name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  s = s
    .replace(/\([^)]*\)?/g, " ") // "(to serve)", "(optional)"
    .replace(/,.*$/, "") // ", finely chopped"
    .replace(/['\u2019`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!s) return "";

  // singularize + single-word synonyms
  let tokens = s
    .split(" ")
    .map((w) => {
      const sg = singularize(w);
      return WORD_SYNONYMS[sg] || sg;
    })
    .join(" ")
    .split(" ");
  // "tuna in spring water" -> "tuna"
  for (let i = 1; i < tokens.length; i++) {
    if (CUT_WORDS.has(tokens[i])) {
      tokens = tokens.slice(0, i);
      break;
    }
  }
  s = tokens.join(" ");
  s = s.replace(STRIP_PHRASE_RE, "$1").replace(/ +/g, " ").trim();
  for (const [re, to] of PHRASE_RULES) s = s.replace(re, to);
  s = s.replace(MINCE_RE_1, "$1$2 mince").replace(MINCE_RE_2, "$1$2 mince");

  const all = s.split(" ").filter(Boolean);
  const kept = all.filter((w) => !STRIP_WORDS.has(w));
  let out = kept.length ? kept : all.filter((w) => !STRIP_WORDS.has(w) || w.length > 2);
  while (out.length > 1 && (out[0] === "of" || /^\d+$/.test(out[0]))) out = out.slice(1);
  if (out.length === 1 && /^\d+$/.test(out[0])) return "";
  return out.join(" ");
}

const canonCache = new Map();

/**
 * Reduce an ingredient line OR a user query to its canonical name.
 * Idempotent: normalizeIngredient(normalizeIngredient(x)) === normalizeIngredient(x).
 * Returns "" when nothing meaningful is left.
 */
export function normalizeIngredient(input) {
  if (typeof input !== "string") return "";
  const hit = canonCache.get(input);
  if (hit !== undefined) return hit;
  if (canonCache.size > 50000) canonCache.clear();
  const out = computeCanonical(input);
  canonCache.set(input, out);
  return out;
}

const COMPOUNDS_BY_TERM = new Map();
for (const [phrase, blocked] of Object.entries(COMPOUND_BLOCKS)) {
  for (const term of blocked) {
    if (!COMPOUNDS_BY_TERM.has(term)) COMPOUNDS_BY_TERM.set(term, []);
    COMPOUNDS_BY_TERM.get(term).push(phrase);
  }
}

const hasWords = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);

/**
 * Does canonical ingredient name `name` satisfy canonical term `term`?
 * Equal, or `term` appears in `name` as whole words, except where the name is
 * a derived product ("chicken stock", "olive oil") or a compound that changes
 * meaning ("peanut butter" for "butter", "egg noodle" for "egg").
 */
export function ingredientMatchesTerm(name, term) {
  if (!term) return true;
  if (name === term) return true;
  if (!hasWords(name, term)) return false;
  const head = name.match(DERIVED_HEAD_RE);
  if (head && !term.split(" ").includes(head[1])) return false;
  const comps = COMPOUNDS_BY_TERM.get(term);
  if (comps) {
    let rest = ` ${name} `;
    for (const c of comps) rest = rest.split(` ${c} `).join(" _ ");
    if (!rest.includes(` ${term} `)) return false;
  }
  return true;
}

/**
 * Build a predicate for "recipe contains ALL these ingredient terms".
 * Terms may be raw user text or canonical names. Reuse it across a list of
 * recipes so terms are normalized once.
 */
export function compileIngredientMatcher(terms) {
  const ts = [...new Set((terms || []).map(normalizeIngredient).filter(Boolean))];
  if (!ts.length) return () => true;
  return (recipe) => {
    const names = Array.isArray(recipe) ? recipe : recipe?.ingredientNames || [];
    return ts.every((t) => names.some((n) => ingredientMatchesTerm(n, t)));
  };
}

/** True when `recipe` (index entry with `ingredientNames`) has every term. */
export function recipeMatchesIngredients(recipe, terms) {
  return compileIngredientMatcher(terms)(recipe);
}

/**
 * Build the suggestion vocabulary from index entries (needs `ingredientNames`).
 * Returns [{ name, count }] sorted by count desc, where `count` is the number
 * of recipes that MATCH the term (so "onion" counts recipes with red onion too).
 * Candidates are every distinct canonical name plus head nouns shared by 2+
 * names (so "mushroom" is offered even if only "chestnut mushroom" exists).
 */
export function buildVocabulary(recipes) {
  const candidates = new Set();
  const headPhrases = new Map();
  for (const r of recipes) {
    for (const n of r.ingredientNames || []) {
      if (!n) continue;
      candidates.add(n);
      const parts = n.split(" ");
      if (parts.length > 1) {
        const h = parts[parts.length - 1];
        if (h.length > 2) {
          if (!headPhrases.has(h)) headPhrases.set(h, new Set());
          headPhrases.get(h).add(n);
        }
      }
    }
  }
  for (const [h, set] of headPhrases) if (set.size >= 2) candidates.add(h);

  const counts = new Map();
  for (const r of recipes) {
    const seen = new Set();
    for (const n of r.ingredientNames || []) {
      const parts = n.split(" ");
      for (let i = 0; i < parts.length; i++) {
        let g = "";
        for (let j = i; j < parts.length; j++) {
          g = j === i ? parts[j] : g + " " + parts[j];
          if (candidates.has(g) && !seen.has(g) && ingredientMatchesTerm(n, g)) seen.add(g);
        }
      }
    }
    for (const g of seen) counts.set(g, (counts.get(g) || 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const ALIASES = [
  ...Object.entries(WORD_SYNONYMS),
  ...PHRASE_SYNONYMS.filter(([f, t]) => f !== t),
].filter(([from]) => from.length >= 4);

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Autocomplete. `vocabulary` is the result of buildVocabulary(). Returns up to
 * `limit` entries [{ name, count, match }] deduped by canonical name, ranked:
 *   exact > whole-word (prefix or contains) > word-start (partial typing) > fuzzy,
 * then by recipe count. `match` is "exact" | "word" | "prefix" | "fuzzy".
 * Names in `exclude` (e.g. already selected chips) are skipped.
 * Synonyms work: "cilantro" suggests "coriander", "shrimp" suggests "prawn".
 */
export function suggestIngredients(query, vocabulary, limit = 8, exclude = []) {
  const q = normalizeIngredient(query || "");
  if (!q) return [];
  const skip = new Set(exclude.map((e) => normalizeIngredient(e)));

  // typed prefix of a synonym ("cilan" -> cilantro -> coriander)
  const queries = [q];
  const raw = String(query).trim().toLowerCase();
  const aliasQueries = [];
  if (raw.length >= 4) {
    for (const [alias, canon] of ALIASES) {
      if (alias.startsWith(raw)) aliasQueries.push(normalizeIngredient(canon));
    }
  }

  const hits = new Map(); // name -> { entry, rank }
  const add = (entry, rank, match) => {
    const prev = hits.get(entry.name);
    if (!prev || rank < prev.rank) hits.set(entry.name, { entry, rank, match });
  };
  for (const v of vocabulary) {
    if (skip.has(v.name)) continue;
    for (const t of aliasQueries) {
      if (v.name === t || hasWords(v.name, t)) add(v, 3, "word");
    }
    for (const t of queries) {
      if (v.name === t) add(v, 0, "exact");
      else if (v.name.startsWith(t + " ")) add(v, 1, "prefix");
      else if (hasWords(v.name, t)) add(v, 1, "word");
      else if (v.name.startsWith(t)) add(v, 2, "prefix");
      else if (` ${v.name}`.includes(` ${t}`)) add(v, 3, "word");
    }
  }

  if (hits.size < Math.min(limit, 3) && q.length >= 4) {
    const max = q.length >= 10 ? 2 : 1;
    const multi = q.includes(" ");
    for (const v of vocabulary) {
      if (hits.has(v.name) || skip.has(v.name)) continue;
      let d = max + 1;
      if (multi) d = editDistance(q, v.name, max);
      else for (const w of v.name.split(" ")) d = Math.min(d, editDistance(q, w, max));
      if (d <= max) add(v, 4 + d, "fuzzy");
    }
  }

  const derived = (n) => (DERIVED_HEAD_RE.test(n) ? 1 : 0);
  return [...hits.values()]
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        derived(a.entry.name) - derived(b.entry.name) ||
        b.entry.count - a.entry.count ||
        a.entry.name.length - b.entry.name.length ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, limit)
    .map(({ entry, match }) => ({ name: entry.name, count: entry.count, match }));
}
