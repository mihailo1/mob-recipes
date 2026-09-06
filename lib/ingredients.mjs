// Shared, best-effort ingredient parsing. Mob's ingredient strings have no
// structured quantity/unit fields — they're free text like "200g Kale" or
// "4Breast Chicken Breast" or just "Salt" — so everything here is a
// heuristic, not an exact parser. Used both at build time (build-index.mjs)
// and in the app (pool aggregation, serving scaler, step highlighting).

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
  /^([\d¼½¾⅓⅔⅕⅛⅜⅝⅞]+(?:[.,]\d+)?)([a-zA-Z]*)\s*(.*)$/;

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
 */
export function parseIngredientLine(raw) {
  const m = String(raw).trim().match(LEADING_QTY_RE);
  if (!m) return { raw, quantity: null, unit: null, name: raw.trim() };

  const [, qtyTok, unitTok, rest] = m;
  const quantity = tokenToNumber(qtyTok);
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
