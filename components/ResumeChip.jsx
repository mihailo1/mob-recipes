"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useKitchen } from "../lib/store";
import { recipeIndexQuery } from "../lib/queries";
import { dismissSuggestion, useNearbySuggestion } from "../lib/nearby-client";
import { optimized } from "./RecipeImage";
import { OPEN } from "../lib/transitions";

// Floating "resume current recipe" chip (mini-player style). It is fixed
// positioned above the tab bar, so it never changes the bar's layout or height.
// While visible it flags <html data-resume> so the page gets extra bottom
// padding and content is never hidden behind it.
//
// When another device on the same Wi-Fi has a different recipe open (see
// components/NearbySync.jsx), the chip offers that recipe instead, on every
// screen including a recipe page. Dismissing it brings the resume chip back.
export default function ResumeChip() {
  const pathname = usePathname();
  const { lastRecipe, clearLastRecipe, ready } = useKitchen();
  // Source url that failed to load; compared by value so a new recipe retries.
  const [failedSrc, setFailedSrc] = useState(null);

  const nearbySlug = useNearbySuggestion();
  const { data: index } = useQuery({ ...recipeIndexQuery, enabled: !!nearbySlug });
  const nearby =
    nearbySlug && Array.isArray(index) ? index.find((r) => r.slug === nearbySlug) || null : null;

  const resume = ready && !!lastRecipe && pathname !== `/recipes/${lastRecipe.slug}`;
  const recipe = nearby || (resume ? lastRecipe : null);
  const visible = !!recipe;

  useEffect(() => {
    if (!visible) return undefined;
    const root = document.documentElement;
    root.setAttribute("data-resume", "");
    return () => root.removeAttribute("data-resume");
  }, [visible]);

  if (!recipe) return null;

  return (
    <div
      className={nearby ? "nb-resume nb-resume-nearby" : "nb-resume"}
      key={`${nearby ? "n" : "r"}:${recipe.slug}`}
      role="region"
      aria-label={nearby ? "Recipe open on another device" : "Resume recipe"}
    >
      <Link href={`/recipes/${recipe.slug}`} transitionTypes={OPEN} className="nb-resume-main">
        {recipe.image && failedSrc !== recipe.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="nb-resume-thumb"
            src={optimized(recipe.image, 256, 70)}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(recipe.image)}
          />
        ) : (
          <span className="nb-resume-thumb nb-resume-thumb-empty" aria-hidden="true" />
        )}
        <span className="nb-resume-text">
          <span className="nb-resume-label">
            {nearby ? (
              <>
                <svg
                  className="nb-resume-wifi"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16.5a5 5 0 0 1 6 0" />
                  <circle cx="12" cy="20" r="0.8" fill="currentColor" />
                </svg>
                On your other device
              </>
            ) : (
              "Continue cooking"
            )}
          </span>
          <span className="nb-resume-name">{recipe.name}</span>
        </span>
      </Link>
      <button
        type="button"
        className="nb-resume-x"
        aria-label={nearby ? "Dismiss recipe from other device" : "Dismiss current recipe"}
        onClick={nearby ? dismissSuggestion : clearLastRecipe}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
