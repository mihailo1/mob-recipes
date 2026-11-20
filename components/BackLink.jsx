"use client";

import Link from "next/link";
import { BACK } from "../lib/transitions";
import { backLabel, useBackHref } from "../lib/tabMemory";

// Recipe page back link: returns to the tab the recipe was opened from, with
// its filters, folder and (via useListRestoration) scroll position.
export default function BackLink() {
  const href = useBackHref();
  return (
    <Link href={href} scroll={false} transitionTypes={BACK} className="back-link">
      ← {backLabel(href)}
    </Link>
  );
}
