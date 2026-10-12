"use client";

import QrCode from "./QrCode";
import { canShare, copyLink, shareOrCopy } from "./shareActions";
import { CopyIcon, ShareIcon } from "./icons";

/*
 * A ready link: a QR code to scan with the other phone's app (the scan icon
 * at the top), plus Share and Copy for sending it in a message.
 */
export default function LinkActions({ url, title, onDone }) {
  return (
    <>
      <div className="qr-box">
        <QrCode text={url} label={`QR code for ${title}`} />
        <p className="qr-hint">
          On the other phone, open Mob and tap the scan icon at the top.
        </p>
      </div>
      <div className="sh-actions">
        {canShare() ? (
          <button
            type="button"
            className="fd-btn fd-btn-primary sh-btn"
            onClick={async () => {
              const r = await shareOrCopy({ title, url });
              if (r === "shared" || r === "copied") onDone?.();
            }}
          >
            <ShareIcon />
            Share link…
          </button>
        ) : null}
        <button
          type="button"
          className={`fd-btn ${canShare() ? "fd-btn-ghost" : "fd-btn-primary"} sh-btn`}
          onClick={async () => {
            if ((await copyLink(url)) === "copied") onDone?.();
          }}
        >
          <CopyIcon />
          Copy link
        </button>
      </div>
    </>
  );
}
