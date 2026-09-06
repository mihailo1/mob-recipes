#!/usr/bin/env node
// Builds a lightweight search index from data/recipes.json for the client
// bundle, so the browser never has to download every ingredient/instruction
// for all recipes just to let someone search by name/category/cuisine.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { normalizeIngredientName } from "../lib/ingredients.mjs";

async function main() {
  let recipes = [];
  try {
    recipes = JSON.parse(await readFile("data/recipes.json", "utf8"));
  } catch {
    console.warn("data/recipes.json not found or empty — writing empty index.");
  }

  const index = recipes.map((r) => ({
    slug: r.slug,
    name: r.name,
    image: r.image,
    category: r.category,
    cuisine: r.cuisine,
    totalTimeMinutes: r.totalTimeMinutes,
    keywords: (r.keywords || []).slice(0, 6).join(" "),
    isAccessibleForFree: r.isAccessibleForFree,
    ingredientNames: [
      ...new Set((r.ingredients || []).map(normalizeIngredientName).filter(Boolean)),
    ],
  }));

  await mkdir("public", { recursive: true });
  await writeFile("public/search-index.json", JSON.stringify(index));
  console.log(`Wrote ${index.length} entries to public/search-index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
