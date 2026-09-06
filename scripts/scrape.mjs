#!/usr/bin/env node
/**
 * Scrapes recipe data from mob.co.uk using the Recipe JSON-LD structured
 * data that the site already embeds in every recipe page (the same data
 * search engines read). No private API, no auth bypass, no login wall
 * circumvention — just parsing public HTML.
 *
 * Usage:
 *   node scripts/scrape.mjs
 *
 * Env vars (all optional):
 *   SCRAPE_CONCURRENCY   parallel requests (default 6)
 *   SCRAPE_DELAY_MS      delay before each request, per worker (default 120)
 *   SCRAPE_LIMIT         cap on number of recipes, for a quick test run
 *   SCRAPE_OUT           output path (default data/recipes.json)
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://www.mob.co.uk";
const UA =
  "Mozilla/5.0 (compatible; mob-recipes-personal-archive/1.0; +https://github.com/mihailo1/mob-recipes)";
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 6);
const DELAY_MS = Number(process.env.SCRAPE_DELAY_MS || 120);
const LIMIT = process.env.SCRAPE_LIMIT ? Number(process.env.SCRAPE_LIMIT) : Infinity;
const OUT = process.env.SCRAPE_OUT || "data/recipes.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(500 * attempt);
    return fetchText(url, attempt + 1);
  }
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

function isoDurationToMinutes(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const hours = Number(m[1] || 0);
  const mins = Number(m[2] || 0);
  return hours * 60 + mins;
}

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function slugFromUrl(url) {
  return url.replace(/\/$/, "").split("/").pop();
}

function extractRecipeJsonLd(html) {
  const scripts = [
    ...html.matchAll(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
    ),
  ].map((m) => m[1]);

  for (const raw of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (c && c["@type"] === "Recipe") return c;
      if (c && Array.isArray(c["@graph"])) {
        const found = c["@graph"].find((g) => g["@type"] === "Recipe");
        if (found) return found;
      }
    }
  }
  return null;
}

function normalizeRecipe(ld, url) {
  const ingredients = toArray(ld.recipeIngredient);
  const instructions = toArray(ld.recipeInstructions).map((step, i) =>
    typeof step === "string" ? step : step.text || `${i + 1}`
  );

  return {
    id: ld.identifier || slugFromUrl(url),
    slug: slugFromUrl(url),
    url,
    name: ld.name || null,
    description: ld.description || null,
    image:
      typeof ld.image === "string"
        ? ld.image
        : ld.image?.url || ld.thumbnailUrl || null,
    category: toArray(ld.recipeCategory).flatMap((c) =>
      String(c)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    ),
    cuisine: ld.recipeCuisine || null,
    keywords: ld.keywords
      ? String(ld.keywords)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    yield: ld.recipeYield || null,
    prepTimeMinutes: isoDurationToMinutes(ld.prepTime),
    cookTimeMinutes: isoDurationToMinutes(ld.cookTime),
    totalTimeMinutes: isoDurationToMinutes(ld.totalTime),
    ingredients,
    instructions,
    isAccessibleForFree: ld.isAccessibleForFree !== false,
    dateModified: ld.dateModified || null,
    datePublished: ld.datePublished || null,
  };
}

async function getRecipeUrls() {
  console.log("Fetching sitemap index...");
  const indexXml = await fetchText(`${BASE}/sitemap.xml`);
  const sitemapUrls = extractLocs(indexXml).filter((u) =>
    /section-recipes-\d+-sitemap/.test(u)
  );
  console.log(`Found ${sitemapUrls.length} recipe sitemap page(s).`);

  const urls = new Set();
  for (const sm of sitemapUrls) {
    const xml = await fetchText(sm);
    for (const loc of extractLocs(xml)) {
      if (/\/recipes\/[^/]+$/.test(loc)) urls.add(loc);
    }
    await sleep(DELAY_MS);
  }
  return [...urls];
}

async function scrapeAll(urls) {
  const results = [];
  const errors = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < urls.length) {
      const idx = cursor++;
      const url = urls[idx];
      await sleep(DELAY_MS);
      try {
        const html = await fetchText(url);
        const ld = extractRecipeJsonLd(html);
        if (ld) {
          results.push(normalizeRecipe(ld, url));
        } else {
          errors.push({ url, reason: "no Recipe JSON-LD found" });
        }
      } catch (err) {
        errors.push({ url, reason: String(err) });
      }
      done++;
      if (done % 50 === 0 || done === urls.length) {
        console.log(`  ${done}/${urls.length} pages processed`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker)
  );
  return { results, errors };
}

async function main() {
  let urls = await getRecipeUrls();
  console.log(`Total unique recipe URLs: ${urls.length}`);
  if (LIMIT < urls.length) {
    urls = urls.slice(0, LIMIT);
    console.log(`SCRAPE_LIMIT set — only scraping first ${urls.length}.`);
  }

  console.log(
    `Scraping with concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms...`
  );
  const { results, errors } = await scrapeAll(urls);

  results.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(results, null, 2));

  console.log(`\nDone. ${results.length} recipes written to ${OUT}.`);
  if (errors.length) {
    console.log(`${errors.length} URL(s) failed:`);
    for (const e of errors.slice(0, 20)) console.log(`  - ${e.url}: ${e.reason}`);
    await mkdir("data", { recursive: true });
    await writeFile("data/scrape-errors.json", JSON.stringify(errors, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
