import { readFileSync } from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import PhotoViewer from "../../../components/PhotoViewer";
import RecipeBody from "../../../components/RecipeBody";
import TrackRecentRecipe from "../../../components/TrackRecentRecipe";
import PageTransition from "../../../components/PageTransition";
import { BACK, recipePhotoName } from "../../../lib/transitions";

let _cache = null;
function getRecipeMap() {
  if (_cache) return _cache;
  let recipes = [];
  try {
    recipes = JSON.parse(readFileSync("data/recipes.json", "utf8"));
  } catch {
    recipes = [];
  }
  _cache = new Map(recipes.map((r) => [r.slug, r]));
  return _cache;
}

export async function generateStaticParams() {
  const map = getRecipeMap();
  return [...map.keys()].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const recipe = getRecipeMap().get(slug);
  if (!recipe) return {};
  return {
    title: `${recipe.name} — Mob Recipes Archive`,
    description: recipe.description || undefined,
    // Link previews in Messages, Telegram etc. when a recipe is shared.
    openGraph: {
      title: recipe.name,
      description: recipe.description || undefined,
      images: recipe.image ? [recipe.image] : undefined,
    },
  };
}

export default async function RecipePage({ params }) {
  const { slug } = await params;
  const recipe = getRecipeMap().get(slug);
  if (!recipe) notFound();

  return (
    <PageTransition>
      <div className="container recipe-page">
        <span className="read-progress" aria-hidden="true" />
        <TrackRecentRecipe
          slug={recipe.slug}
          name={recipe.name}
          image={recipe.image || ""}
        />
        <Link href="/" scroll={false} transitionTypes={BACK} className="back-link">
          ← Back to search
        </Link>

        <PhotoViewer
          src={recipe.image}
          alt={recipe.name}
          transitionName={recipePhotoName(recipe.slug)}
        />

        <h1 className="recipe-title">{recipe.name}</h1>
        {recipe.description ? (
          <p className="recipe-desc">{recipe.description}</p>
        ) : null}

        <div className="stat-row">
          {recipe.prepTimeMinutes ? (
            <div className="stat">
              <strong>{recipe.prepTimeMinutes} min</strong>
              prep
            </div>
          ) : null}
          {recipe.cookTimeMinutes ? (
            <div className="stat">
              <strong>{recipe.cookTimeMinutes} min</strong>
              cook
            </div>
          ) : null}
          {recipe.totalTimeMinutes ? (
            <div className="stat">
              <strong>{recipe.totalTimeMinutes} min</strong>
              total
            </div>
          ) : null}
        </div>

        <div className="chip-row" style={{ margin: "6px 0 0" }}>
          {[...new Set(recipe.category || [])].map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
          {recipe.cuisine ? <span className="chip">{recipe.cuisine}</span> : null}
        </div>

        <RecipeBody recipe={recipe} />

        <p className="footer-note">
          Source:{" "}
          <a href={recipe.url} target="_blank" rel="noreferrer">
            {recipe.url}
          </a>
        </p>
      </div>
    </PageTransition>
  );
}
