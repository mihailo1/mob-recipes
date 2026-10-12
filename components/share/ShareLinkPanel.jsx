"use client";

import { useEffect, useState } from "react";
import { createShareLink } from "./shareActions";
import LinkActions from "./LinkActions";

/*
 * Sheet body that makes a link for a shared folder doc (lib/share.mjs) and
 * then shows it as a QR code with Share and Copy. Making the link needs the
 * server, so it is a separate step: iOS only opens the share sheet straight
 * from a tap.
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
          <LinkActions url={url} title={title} onDone={onDone} />
          <p className="sh-note">
            Anyone with the link can see these recipes and save a copy. Later
            changes to your folders are not sent.
          </p>
        </>
      )}
    </div>
  );
}
