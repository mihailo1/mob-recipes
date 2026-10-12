/*
 * Names and types for page transitions (React <ViewTransition>, which drives
 * the browser View Transitions API; app/globals.css has the animations).
 *
 * - A recipe photo carries the same view transition name on a card and on the
 *   recipe page, so the browser morphs one into the other.
 * - Links tag navigations with a type: "tab-forward"/"tab-back" slide between
 *   the tabs, "nav-forward" opens something, "nav-back" goes back to a list.
 *   components/PageTransition.jsx maps the types to animations.
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

// The recipe page seen last in this tab. Its card on a list must be drawn
// even when far off screen (content-visibility skips those), or the photo
// cannot morph back into it.
let lastOpened = null;
export const noteOpenedRecipe = (slug) => {
  lastOpened = slug;
};
export const isLastOpenedRecipe = (slug) => slug === lastOpened;

export const OPEN = ["nav-forward"];
export const BACK = ["nav-back"];
