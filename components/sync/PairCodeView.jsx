"use client";

import QrCode from "../share/QrCode";
import { canShare, copyLink, shareOrCopy } from "../share/shareActions";
import { CopyIcon, ShareIcon } from "../share/icons";
import { pairUrl } from "../../lib/qr.mjs";

const formatCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;

function left(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/*
 * A device linking code on screen: QR for the in-app scanner, the 6 digits
 * to type, the countdown and, with `sendable`, Share and Copy for sending
 * the link in a message (the other person pastes it in the app).
 */
export default function PairCodeView({ pair, now, sendable = false }) {
  const url = pairUrl(window.location.origin, pair.code);
  return (
    <div className="pair-view">
      <div className="qr-box">
        <QrCode text={url} size={176} label="QR code to link a device" />
        <p className="qr-hint">
          On the other phone, open Mob and tap the scan icon at the top. Or type
          this code there in Sync your devices, Enter a code:
        </p>
        <p className="sc-code" aria-label={`Code ${pair.code.split("").join(" ")}`}>
          {formatCode(pair.code)}
        </p>
        <p className="qr-hint">Expires in {left(pair.expires - now)}.</p>
      </div>
      {sendable ? (
        <>
          <div className="sh-actions">
            {canShare() ? (
              <button
                type="button"
                className="fd-btn fd-btn-ghost sh-btn"
                onClick={() => shareOrCopy({ title: "Sync my Mob recipes", url })}
              >
                <ShareIcon />
                Share link…
              </button>
            ) : null}
            <button type="button" className="fd-btn fd-btn-ghost sh-btn" onClick={() => copyLink(url)}>
              <CopyIcon />
              Copy link
            </button>
          </div>
          <p className="sh-note">
            Sending it in a message? The other person copies the link and pastes
            it in Mob: Saved, ⋯, Open a shared link.
          </p>
        </>
      ) : null}
    </div>
  );
}
