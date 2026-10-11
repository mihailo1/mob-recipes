#!/usr/bin/env node
// Compares the OLD SearchApp ingredient behaviour (substring suggestions over
// ingredientNames, exact-set matching) with the new API in lib/ingredients.mjs.
// Usage: node scripts/test-ingredients.mjs [path/to/old-index.json]
import { readFile } from "node:fs/promises";
import {
  suggestIngredients,
  recipeMatchesIngredients,
  buildVocabulary,
} from "../lib/ingredients.mjs";

const QUERIES = [
  "onion", "garlic", "chicken", "tomato", "coriander", "cilantro", "aubergine",
  "eggplant", "chilli", "chili", "prawn", "shrimp", "egg", "lime", "cheese",
  "yogurt", "scallion", "zucchini", "arugula", "mince", "garbanzo", "chick",
  "tomatoe", "parmesan", "potatoes",
];

// ---- OLD behaviour, copied from components/SearchApp.jsx ----
function oldSuggest(allIngredients, input) {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  return allIngredients
    .filter((i) => i.includes(q))
    .sort(
      (a, b) =>
        (a === q ? 0 : a.startsWith(q) ? 1 : 2) - (b === q ? 0 : b.startsWith(q) ? 1 : 2) ||
        a.length - b.length ||
        a.localeCompare(b),
    )
    .slice(0, 8);
}
function oldCount(recipes, ing) {
  return recipes.filter((r) => new Set(r.ingredientNames || []).has(ing)).length;
}

const oldPath = process.argv[2];
let old = null;
if (oldPath) old = JSON.parse(await readFile(oldPath, "utf8"));
const cur = JSON.parse(await readFile("public/search-index.json", "utf8"));

if (old) {
  const all = [...new Set(old.flatMap((r) => r.ingredientNames || []))].sort();
  console.log(`OLD vocabulary: ${all.length} names`);
  for (const q of QUERIES) {
    const sug = oldSuggest(all, q);
    const n = sug[0] ? oldCount(old, sug[0]) : 0;
    console.log(`OLD ${q.padEnd(10)} top1 count=${String(n).padStart(4)} :: ${sug.join(" | ")}`);
  }
}

const vocab = buildVocabulary(cur);
console.log(`\nNEW vocabulary: ${vocab.length} canonical names`);
for (const q of QUERIES) {
  const sug = suggestIngredients(q, vocab, 8);
  const top = sug[0];
  const n = top ? cur.filter((r) => recipeMatchesIngredients(r, [top.name])).length : 0;
  console.log(
    `NEW ${q.padEnd(10)} top1 count=${String(n).padStart(4)} :: ` +
      sug.map((s) => `${s.name}(${s.count})`).join(" | "),
  );
}

// Equivalence / negative checks
function count(term) {
  return cur.filter((r) => recipeMatchesIngredients(r, [term])).length;
}
const checks = [];
function eq(a, b) {
  const x = count(a), y = count(b);
  checks.push([`${a} == ${b}`, x === y && x > 0, `${x} vs ${y}`]);
}
eq("coriander", "cilantro"); eq("aubergine", "eggplant"); eq("courgette", "zucchini");
eq("spring onion", "scallion"); eq("spring onion", "green onion"); eq("prawn", "shrimp");
eq("chickpea", "garbanzo"); eq("rocket", "arugula"); eq("chilli", "chili"); eq("chilli", "chile");
eq("yoghurt", "yogurt"); eq("onion", "onions"); eq("potato", "potatoes"); eq("tomato", "tomatoes");
const eggRecipes = cur.filter((r) => recipeMatchesIngredients(r, ["egg"]));
const eggplantOnly = cur.filter(
  (r) => recipeMatchesIngredients(r, ["aubergine"]) && !recipeMatchesIngredients(r, ["egg"]),
).length;
checks.push(["egg excludes eggplant-only recipes", eggplantOnly > 0, `${eggplantOnly} aubergine recipes w/o egg`]);
checks.push(["onion >= red onion", count("onion") >= count("red onion"), `${count("onion")} vs ${count("red onion")}`]);
checks.push(["chicken >= chicken thigh", count("chicken") >= count("chicken thigh"), `${count("chicken")} vs ${count("chicken thigh")}`]);
checks.push(["multi-term AND", cur.filter((r) => recipeMatchesIngredients(r, ["chicken", "lemon"])).length > 0, ""]);
console.log("\nChecks");
let bad = 0;
for (const [name, ok, info] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${info}`);
}
console.log(`egg matches ${eggRecipes.length} recipes`);
process.exit(bad ? 1 : 0);
