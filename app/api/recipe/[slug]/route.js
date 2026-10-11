import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";

let cache = null;
function getMap() {
  if (cache) return cache;
  let recipes = [];
  try {
    recipes = JSON.parse(readFileSync("data/recipes.json", "utf8"));
  } catch {
    recipes = [];
  }
  cache = new Map(recipes.map((r) => [r.slug, r]));
  return cache;
}

export async function GET(_req, { params }) {
  const { slug } = await params;
  const recipe = getMap().get(slug);
  if (!recipe) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(recipe);
}
