# Mob Recipes Archive

A searchable personal archive of recipes from [mob.co.uk](https://www.mob.co.uk),
built from the `Recipe` JSON-LD structured data the site already embeds in
every recipe page (the same data Google reads for rich search results).
There's no official Mob API/dump, so this project scrapes public HTML rather
than any private endpoint — no login, no paywall bypass.

## How it works

- `scripts/scrape.mjs` reads Mob's own sitemap (`/sitemap.xml` →
  `*-section-recipes-*-sitemap-pN.xml`) to enumerate every recipe URL, then
  fetches each page and pulls out its `Recipe` JSON-LD block (name,
  ingredients, steps, times, category, cuisine, image, etc). It's polite by
  default — limited concurrency and a delay between requests.
- `.github/workflows/scrape.yml` runs that script on GitHub's own runners
  (manually via **Actions → Scrape Mob recipes → Run workflow**, or weekly
  on a schedule) and commits the refreshed `data/recipes.json` back to the
  repo. Vercel is connected to this repo's `main` branch, so every commit
  triggers a new deployment automatically.
- The Next.js app builds a small search index (`public/search-index.json`)
  from `data/recipes.json` at build time and does fuzzy search + category/
  cuisine filtering client-side (via [Fuse.js](https://www.fusejs.io/)).
  Full ingredients/instructions are only rendered on each recipe's own
  statically-generated detail page, so the homepage stays light even with
  thousands of recipes.

## Running it yourself

```bash
npm install
npm run scrape          # full scrape — can take a while, be patient
# or, for a quick smoke test:
SCRAPE_LIMIT=20 npm run scrape

npm run dev              # http://localhost:3000
npm run build && npm start
```

## A note on `isAccessibleForFree`

Some recipes are flagged `isAccessibleForFree: false` in their own
structured data (Mob's premium/app-exclusive content), even though the full
ingredients and method are present in the same public JSON-LD block used
for SEO. The scraper records that flag on every recipe (`isAccessibleForFree`
field) but doesn't filter on it — that's a judgment call left to whoever
runs this for their own use.

## Disclaimer

This is an unofficial, personal project for search/reference. All recipe
content belongs to Mob (mob.co.uk); this repo is not affiliated with them.
