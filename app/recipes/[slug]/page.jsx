import { readFile } from "node:fs/promises";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getRecipes() {
  try {
    const raw = await readFile("data/recipes.json", "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  const recipes = await getRecipes();
  return recipes.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }) {
  const recipes = await getRecipes();
  const recipe = recipes.find((r) => r.slug === params.slug);
  if (!recipe) return {};
  return {
    title: `${recipe.name} — Mob Recipes Archive`,
    description: recipe.description || undefined,
  };
}

export default async function RecipePage({ params }) {
  const recipes = await getRecipes();
  const recipe = recipes.find((r) => r.slug === params.slug);
  if (!recipe) notFound();

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ← Back to search
      </Link>

      {recipe.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="recipe-hero" src={recipe.image} alt={recipe.name} />
      ) : null}

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
        {recipe.yield ? (
          <div className="stat">
            <strong>{recipe.yield}</strong>
            serves
          </div>
        ) : null}
      </div>

      <div className="chip-row" style={{ margin: "6px 0 0" }}>
        {(recipe.category || []).map((c) => (
          <span className="chip" key={c}>
            {c}
          </span>
        ))}
        {recipe.cuisine ? <span className="chip">{recipe.cuisine}</span> : null}
      </div>

      <div className="recipe-layout">
        <div>
          <h2 className="section-title">Ingredients</h2>
          <ul className="ingredient-list">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="section-title">Method</h2>
          <ol className="step-list">
            {recipe.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      <p className="footer-note">
        Source:{" "}
        <a href={recipe.url} target="_blank" rel="noreferrer">
          {recipe.url}
        </a>
      </p>
    </div>
  );
}
