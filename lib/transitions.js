/*
 * Names and types for page transitions (React <ViewTransition>, which drives
 * the browser View Transitions API; app/globals.css has the animations).
 *
 * - Links tag navigations with a type: "tab-forward"/"tab-back" switch tabs
 *   (at once, like iPhone apps), "nav-forward" slides a page in from the
 *   right, "nav-back" slides it back out, "nav-resume" (the Continue cooking
 *   chip) fades the recipe in. components/PageTransition.jsx maps the types
 *   to animations.
 * - On "nav-resume" the chip's photo and the recipe page photo share a view
 *   transition name, so the browser flies one into the other
 *   (components/PhotoMorph.jsx).
 * Browsers without the API just navigate as before.
 */

/** View transition name of a recipe's photo. Must be unique on a page. */
export const recipePhotoName = (slug) =>
  `photo-${String(slug).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export const TAB_PATHS = ["/", "/pool", "/favorites"];

/** Transition types for a tab bar link from the current path. */
export function tabTypes(fromPath, toPath) {
  const from = TAB_PATHS.indexOf(fromPath);
  const to = TAB_PATHS.indexOf(toPath);
  if (from === to) return undefined;
  if (from < 0) return ["nav-back"];
  return [to > from ? "tab-forward" : "tab-back"];
}

export const OPEN = ["nav-forward"];
// From the Continue cooking chip: its photo flies into the recipe.
export const RESUME = ["nav-resume"];
export const BACK = ["nav-back"];
