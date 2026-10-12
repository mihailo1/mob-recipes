"use client";

import { useEffect } from "react";
import { useKitchen } from "../lib/store";
import { setCurrentRecipe } from "../lib/nearby-client";

// Renders nothing; records the viewed recipe so the resume chip can offer it,
// and tells NearbySync which recipe is open on this device.
export default function TrackRecentRecipe({ slug, name, image }) {
  const { setLastRecipe } = useKitchen();

  useEffect(() => {
    setLastRecipe({ slug, name, image });
  }, [setLastRecipe, slug, name, image]);

  useEffect(() => {
    setCurrentRecipe(slug);
    return () => setCurrentRecipe(null);
  }, [slug]);

  return null;
}
