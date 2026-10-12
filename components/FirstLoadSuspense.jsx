"use client";

import { Suspense, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/*
 * A <Suspense> boundary for the first page load only.
 *
 * A static page that reads the URL (useSearchParams) needs a boundary for the
 * server render. But on a later in-app navigation a new boundary shows its
 * fallback for a moment (the page's code is wired up asynchronously), and the
 * page transition then captures the skeleton instead of the list: the list
 * blinks and a recipe photo has no card to fly back into. Without a boundary
 * on those mounts, the navigation simply waits for the page to be ready.
 */
export default function FirstLoadSuspense({ fallback, children }) {
  // True on the server and while hydrating, false for client-only mounts.
  const hydrating = useSyncExternalStore(noop, () => false, () => true);
  // Fixed for this mount: switching later would remount the children.
  const [wrap] = useState(hydrating);
  return wrap ? <Suspense fallback={fallback}>{children}</Suspense> : children;
}
