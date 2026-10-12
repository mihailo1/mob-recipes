"use client";

import { useLayoutEffect, useRef } from "react";
import FolderCover from "./FolderCover";
import { MoreIcon, PlusIcon } from "./icons";
import { recipesLabel } from "./folderData";

/*
 * Horizontal "Folders" scroller at the top of Saved:
 *   [All saved] [folder] [folder] ... [New folder]
 * Tiles are real links (/favorites?folder=id) but switch in place through
 * onSelect, which pushes a history entry so Back returns to the previous one.
 */

const isPlainClick = (e) =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

function Tile({ href, active, onSelect, cover, name, sub }) {
  return (
    <a
      href={href}
      className={`fd-tile ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        onSelect();
      }}
    >
      {cover}
      <span className="fd-tile-name">{name}</span>
      <span className="fd-tile-sub">{sub}</span>
    </a>
  );
}

export default function FolderStrip({
  folders,
  summaries,
  activeId,
  hrefFor,
  onSelect,
  onNewFolder,
  onMore,
  moreRef,
}) {
  const scrollerRef = useRef(null);

  // Keep the active tile in view (deep link to folder 25, or a new folder).
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const tile = scroller?.querySelector(".fd-tile.is-active");
    if (!scroller || !tile) return;
    const pad = parseFloat(getComputedStyle(scroller).paddingLeft) || 0;
    const box = scroller.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    // Fully visible inside the padded area: leave the scroll alone.
    if (t.left >= box.left + pad - 1 && t.right <= box.right - pad + 1) return;
    // Otherwise align it to the snap start.
    scroller.scrollLeft += t.left - box.left - pad;
  }, [activeId, folders.length]);

  return (
    <section className="fd-strip" aria-labelledby="fd-strip-title">
      <div className="fd-strip-head">
        <h2 id="fd-strip-title">Folders</h2>
        {folders.length ? <span>{folders.length}</span> : null}
        {onMore ? (
          <button
            ref={moreRef}
            type="button"
            className="fd-strip-more"
            aria-label="Share or open shared recipes"
            aria-haspopup="dialog"
            onClick={onMore}
          >
            <MoreIcon size={18} />
          </button>
        ) : null}
      </div>
      <div className="fd-scroller" ref={scrollerRef}>
        <Tile
          href={hrefFor(null)}
          active={!activeId}
          onSelect={() => onSelect(null)}
          cover={<FolderCover images={summaries.all.images} all variant="tile" />}
          name="All saved"
          sub={recipesLabel(summaries.all.count)}
        />
        {folders.map((f) => {
          const s = summaries.byId.get(f.id);
          return (
            <Tile
              key={f.id}
              href={hrefFor(f.id)}
              active={activeId === f.id}
              onSelect={() => onSelect(f.id)}
              cover={
                <FolderCover
                  images={s?.images || []}
                  emoji={f.emoji}
                  color={f.color}
                  variant="tile"
                />
              }
              name={f.name}
              sub={recipesLabel(s?.count || 0)}
            />
          );
        })}
        <button type="button" className="fd-tile fd-tile-new" onClick={onNewFolder}>
          <span className="fd-cover fd-cover-tile fd-cover-new" aria-hidden="true">
            <span className="fd-new-plus">
              <PlusIcon size={22} />
            </span>
          </span>
          <span className="fd-tile-name">New folder</span>
          <span className="fd-tile-sub">&nbsp;</span>
        </button>
      </div>
      {folders.length === 0 ? (
        <p className="fd-strip-hint">
          Make folders for weeknights, baking or anything else you like.
        </p>
      ) : null}
    </section>
  );
}
