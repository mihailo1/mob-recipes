"use client";

import { MoreIcon } from "./icons";
import { recipesLabel } from "./folderData";

/** Folder view header: big emoji tile, name, count and the "⋯" menu. */
export default function FolderHeader({ folder, count, onMore, moreRef }) {
  return (
    <div className="fd-head" style={{ "--fd-c": folder.color }}>
      <span className="fd-head-icon" aria-hidden="true">
        {folder.emoji}
      </span>
      <div className="fd-head-text">
        <span className="fd-head-kicker">Folder</span>
        <h2 className="fd-head-name">{folder.name}</h2>
        <span className="fd-head-count">{recipesLabel(count)}</span>
      </div>
      <button
        ref={moreRef}
        type="button"
        className="fd-more"
        aria-label={`Options for ${folder.name}`}
        aria-haspopup="dialog"
        onClick={onMore}
      >
        <MoreIcon />
      </button>
    </div>
  );
}
