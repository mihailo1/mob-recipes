"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useKitchen } from "../lib/store";

// Floating "resume current recipe" chip (mini-player style). It is fixed
// positioned above the tab bar, so it never changes the bar's layout or height.
// While visible it flags <html data-resume> so the page gets extra bottom
// padding and content is never hidden behind it.
export default function ResumeChip() {
  const pathname = usePathname();
  const { lastRecipe, clearLastRecipe, ready } = useKitchen();

  const visible =
    ready && !!lastRecipe && pathname !== `/recipes/${lastRecipe.slug}`;

  useEffect(() => {
    if (!visible) return undefined;
    const root = document.documentElement;
    root.setAttribute("data-resume", "");
    return () => root.removeAttribute("data-resume");
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="nb-resume" key={lastRecipe.slug} role="region" aria-label="Resume recipe">
      <Link href={`/recipes/${lastRecipe.slug}`} className="nb-resume-main">
        {lastRecipe.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="nb-resume-thumb"
            src={lastRecipe.image}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="nb-resume-thumb nb-resume-thumb-empty" aria-hidden="true" />
        )}
        <span className="nb-resume-text">
          <span className="nb-resume-label">Continue cooking</span>
          <span className="nb-resume-name">{lastRecipe.name}</span>
        </span>
      </Link>
      <button
        type="button"
        className="nb-resume-x"
        aria-label="Dismiss current recipe"
        onClick={clearLastRecipe}
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
