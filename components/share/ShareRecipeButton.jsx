"use client";

import { useState } from "react";
import BottomSheet from "../BottomSheet";
import LinkActions from "./LinkActions";
import { ShareIcon } from "./icons";

/** "Share" pill on a recipe page: a sheet with a QR code, Share and Copy. */
export default function ShareRecipeButton({ recipe }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  return (
    <>
      <button
        type="button"
        className="pill-btn share-pill"
        onClick={() => {
          setUrl(`${window.location.origin}/recipes/${recipe.slug}`);
          setOpen(true);
        }}
      >
        <ShareIcon size={17} />
        <span>Share</span>
      </button>
      {url ? (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title={recipe.name}
          className="fd-sheet"
        >
          <div className="sh-panel">
            <LinkActions url={url} title={recipe.name} onDone={() => setOpen(false)} />
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}
