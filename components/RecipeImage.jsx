"use client";

import { useEffect, useRef, useState } from "react";

// Every width and quality used here must be allowed in next.config.mjs
// (images.imageSizes / deviceSizes / qualities), or the optimizer returns 400.
const WIDTHS = [256, 384, 640, 828, 1200];
const QUALITY = 70;
const PREVIEW_WIDTH = 16;
const PREVIEW_QUALITY = 30;

const CARD_SIZES = "(min-width: 900px) 360px, (min-width: 560px) 45vw, 100vw";
const HERO_SIZES = "(min-width: 1240px) 1176px, 100vw";
const THUMB_SIZES = "76px";

const optimized = (src, w, q) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;

function defaultSizes(className) {
  if (/\b(recipe-hero|hero-image)\b/.test(className)) return HERO_SIZES;
  if (/\bpool-thumb\b/.test(className)) return THUMB_SIZES;
  return CARD_SIZES;
}

// stage: "opt" (optimizer srcSet) -> "orig" (original CDN url) -> "failed"
function Frame({ src, alt, className, priority, sizes }) {
  const [stage, setStage] = useState(src ? "opt" : "failed");
  const [loaded, setLoaded] = useState(false);
  const [instant, setInstant] = useState(false);
  const [previewState, setPreviewState] = useState("pending");
  const imgRef = useRef(null);

  // Already in the browser cache (or finished before hydration): skip the fade.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        setInstant(true);
        setLoaded(true);
      } else {
        setStage((s) => (s === "opt" ? "orig" : "failed"));
      }
    }
  }, []);

  const onError = () => setStage((s) => (s === "opt" ? "orig" : "failed"));

  const classes = [
    "img-frame",
    loaded || stage === "failed" ? "is-loaded" : "",
    instant ? "img-instant" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (stage === "failed") {
    return (
      <div className={classes}>
        <span className="image-fallback">Photo unavailable</span>
      </div>
    );
  }

  const common = {
    loading: priority ? "eager" : "lazy",
    fetchPriority: priority ? "high" : "auto",
    decoding: "async",
    onLoad: () => setLoaded(true),
    onError,
  };

  return (
    <div className={classes}>
      {stage === "opt" && previewState !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`img-preview ${previewState === "ready" ? "is-ready" : ""}`}
          src={optimized(src, PREVIEW_WIDTH, PREVIEW_QUALITY)}
          alt=""
          aria-hidden="true"
          decoding="async"
          onLoad={() => setPreviewState("ready")}
          onError={() => setPreviewState("error")}
        />
      ) : null}
      {stage === "opt" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key="opt"
          ref={imgRef}
          className="img-main"
          src={optimized(src, 640, QUALITY)}
          srcSet={WIDTHS.map((w) => `${optimized(src, w, QUALITY)} ${w}w`).join(", ")}
          sizes={sizes}
          alt={alt || ""}
          {...common}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key="orig"
          className="img-main"
          src={src}
          crossOrigin="anonymous"
          alt={alt || ""}
          {...common}
        />
      )}
    </div>
  );
}

export default function RecipeImage({
  src,
  alt,
  className = "",
  priority = false,
  sizes,
}) {
  return (
    <Frame
      key={src || ""}
      src={src}
      alt={alt}
      className={className}
      priority={priority}
      sizes={sizes || defaultSizes(className)}
    />
  );
}
