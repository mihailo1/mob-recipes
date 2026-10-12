"use client";

import { useEffect, useState } from "react";
import { canShare, copyLink, createShareLink, shareOrCopy } from "./shareActions";
import { CopyIcon, ShareIcon } from "./icons";

/*
 * Sheet body that makes a link for a shared folder doc (lib/share.mjs) and
 * then offers Share and Copy. Making the link needs the server, so it is a
 * separate step: iOS only opens the share sheet straight from a tap.
 */
export default function ShareLinkPanel({ doc, title, summary, onDone }) {
  const [result, setResult] = useState({ url: "", error: "" });
  const [attempt, setAttempt] = useState(0);
  // By content, so a parent re-render with an equal doc does not refetch.
  const docKey = JSON.stringify(doc);

  useEffect(() => {
    let alive = true;
    createShareLink(JSON.parse(docKey)).then(
      (url) => alive && setResult({ url, error: "" }),
      (err) => alive && setResult({ url: "", error: err.message }),
    );
    return () => {
      alive = false;
    };
  }, [docKey, attempt]);

  const { url, error } = result;

  return (
    <div className="sh-panel">
      <p className="sh-summary">{summary}</p>
      {error ? (
        <>
          <p className="sh-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="fd-btn fd-btn-ghost"
            onClick={() => {
              setResult({ url: "", error: "" });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </>
      ) : !url ? (
        <p className="sh-making" role="status">
          Making a link…
        </p>
      ) : (
        <>
          <input
            className="sh-url"
            type="text"
            readOnly
            value={url}
            aria-label="Link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="sh-note">
            Anyone with the link can see these recipes and save a copy. Later
            changes to your folders are not sent.
          </p>
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
                Share…
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
      )}
    </div>
  );
}
