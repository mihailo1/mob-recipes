"use client";

import { useEffect, useRef, useState } from "react";

// Every width and quality used here must be allowed in next.config.mjs
// (images.imageSizes / deviceSizes / qualities), or the optimizer returns 400.
const WIDTHS = [256, 384, 640, 828, 1200];
const QUALITY = 70;
const PREVIEW_WIDTH = 16;
const PREVIEW_QUALITY = 30;

// Mirrors the .grid CSS in app/globals.css (container padding + column gaps):
//   >= 1240px  4 columns, content capped at 1176px   -> ~279px per card
//   951-1239   4 columns, gap 20, padding 32         -> (100vw - 124px) / 4
//   721-950    3 columns, gap 20, padding 32         -> (100vw - 104px) / 3
//   <= 720     2 columns, gap 14, padding 16 (14 <= 480) -> (100vw - 46px) / 2
const CARD_SIZES =
  "(min-width: 1240px) 280px, (min-width: 951px) 24vw, (min-width: 721px) 31vw, calc(50vw - 23px)";
const HERO_SIZES = "(min-width: 1240px) 1176px, 100vw";
const THUMB_SIZES = "76px";

export const optimized = (src, w, q) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;

/**
 * URLs the browser loads for a photo on this screen: as a card, as the recipe
 * page hero and as a small My kitchen thumbnail. Mirrors CARD_SIZES,
 * HERO_SIZES and THUMB_SIZES (a browser takes the first width that covers
 * the drawn size times the pixel ratio). Used to keep photos for offline.
 */
export function photoUrls(src, { width, dpr }) {
  const card =
    width >= 1240 ? 280 : width >= 951 ? width * 0.24 : width >= 721 ? width * 0.31 : width / 2 - 23;
  const hero = Math.min(width, 1176);
  const pick = (css) => WIDTHS.find((w) => w >= css * dpr) ?? WIDTHS[WIDTHS.length - 1];
  return {
    card: optimized(src, pick(card), QUALITY),
    hero: optimized(src, pick(hero), QUALITY),
    thumb: optimized(src, pick(76), QUALITY),
  };
}

// Photos already loaded in this tab, by recipe image: the URL that loaded
// (largest width wins). A frame for the same photo at another size shows that
// one at once instead of the blurred preview. This matters most for the
// recipe page photo that morphs out of a card: the morph stays smooth because
// nothing has to be blurred or decoded while it runs.
const loadedPhotos = new Map(); // src -> { url, w }
const MAX_LOADED = 300;

function rememberLoaded(src, img) {
  const w = img?.naturalWidth || 0;
  if (!src || !w) return;
  const prev = loadedPhotos.get(src);
  if (prev && prev.w >= w) return;
  loadedPhotos.delete(src);
  loadedPhotos.set(src, { url: img.currentSrc || img.src, w });
  if (loadedPhotos.size > MAX_LOADED) loadedPhotos.delete(loadedPhotos.keys().next().value);
}

function defaultSizes(className) {
  if (/\b(recipe-hero|hero-image)\b/.test(className)) return HERO_SIZES;
  if (/\bpool-thumb\b/.test(className)) return THUMB_SIZES;
  return CARD_SIZES;
}

// stage: "opt" (optimizer srcSet) -> "orig" (original CDN url) -> "failed"
function Frame({ src, alt, className, priority, sizes }) {
  const [stage, setStage] = useState(src ? "opt" : "failed");
  // Read once: the frame keeps its placeholder for its whole life.
  const [placeholder] = useState(() => loadedPhotos.get(src)?.url || null);
  const [loaded, setLoaded] = useState(false);
  const [instant, setInstant] = useState(false);
  const [previewState, setPreviewState] = useState("pending");
  const imgRef = useRef(null);

  // Already in the browser cache (or finished before hydration): skip the fade.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete) {
      if (img.naturalWidth > 0) {
        rememberLoaded(src, img);
        setInstant(true);
        setLoaded(true);
      } else {
        setStage((s) => (s === "opt" ? "orig" : "failed"));
      }
    }
  }, [src]); // the frame is keyed by src, so this runs once

  const onError = () => setStage((s) => (s === "opt" ? "orig" : "failed"));

  const classes = [
    "img-frame",
    loaded || stage === "failed" ? "is-loaded" : "",
    instant ? "img-instant" : "",
    placeholder ? "has-placeholder" : "",
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
    onLoad: (e) => {
      rememberLoaded(src, e.currentTarget);
      setLoaded(true);
    },
    onError,
  };

  return (
    <div className={classes}>
      {placeholder ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="img-placeholder" src={placeholder} alt="" aria-hidden="true" />
      ) : stage === "opt" && previewState !== "error" ? (
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
