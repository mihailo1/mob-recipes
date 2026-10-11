"use client";

import { useEffect } from "react";
import { useKitchen } from "../lib/store";

// Renders nothing; records the viewed recipe so the resume chip can offer it.
export default function TrackRecentRecipe({ slug, name, image }) {
  const { setLastRecipe } = useKitchen();

  useEffect(() => {
    setLastRecipe({ slug, name, image });
  }, [setLastRecipe, slug, name, image]);

  return null;
}
