"use client";

import { memo } from "react";
import { optimized } from "../RecipeImage";
import { HeartIcon } from "./icons";

/*
 * Square folder cover (Apple Photos album style).
 *   0 images  soft gradient in the folder color with the emoji large
 *   1 image   full bleed
 *   2 images  two halves
 *   3 images  one tall + two stacked
 *   4 images  2x2 mosaic
 * With images, a solid badge and a thin bar in the folder color (the app
 * accent for All saved) keep the identity; photo gutters are 2px of page color.
 *
 * variant "tile" (strip, ~130px), "mini" (sheet rows, 44px; one image max),
 * "all" (the All saved tile: heart instead of an emoji).
 */

function hideBroken(e) {
  e.currentTarget.style.visibility = "hidden";
}

function Img({ src, w }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="fd-cover-img"
      src={optimized(src, w, 70)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={hideBroken}
    />
  );
}

function FolderCoverBase({ images, emoji, color, variant = "tile", all = false }) {
  const mini = variant === "mini";
  const list = mini ? images.slice(0, 1) : images;
  const n = list.length;
  // "All saved" uses the app accent as its color.
  const style = all ? { "--fd-c": "var(--accent)" } : color ? { "--fd-c": color } : undefined;
  const glyph = all ? <HeartIcon size={mini ? 20 : 40} /> : emoji;

  if (n === 0) {
    return (
      <span className={`fd-cover fd-cover-${variant} is-empty ${all ? "is-all" : ""}`} style={style} aria-hidden="true">
        <span className="fd-cover-emoji">{glyph}</span>
      </span>
    );
  }

  return (
    <span className={`fd-cover fd-cover-${variant} fd-cover-n${n} ${all ? "is-all" : ""}`} style={style} aria-hidden="true">
      {list.map((src, i) => (
        <Img key={`${i}:${src}`} src={src} w={n === 1 && !mini ? 384 : 256} />
      ))}
      {!mini ? (
        <span className="fd-cover-badge">{all ? <HeartIcon size={16} /> : emoji}</span>
      ) : null}
    </span>
  );
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const FolderCover = memo(
  FolderCoverBase,
  (a, b) =>
    a.emoji === b.emoji &&
    a.color === b.color &&
    a.variant === b.variant &&
    a.all === b.all &&
    same(a.images, b.images),
);

export default FolderCover;
