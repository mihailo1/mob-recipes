"use client";

import { useState } from "react";

export default function RecipeImage({
  src,
  alt,
  className = "",
  priority = false,
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`img-frame ${loaded ? "is-loaded" : ""} ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || ""}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      ) : null}
    </div>
  );
}
