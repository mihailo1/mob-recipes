"use client";

import { useState } from "react";

export default function RecipeImage({
  src,
  alt,
  className = "",
  priority = false,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`img-frame ${loaded || failed || !src ? "is-loaded" : ""} ${className}`}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt || ""}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="image-fallback">Photo unavailable</span>
      )}
    </div>
  );
}
