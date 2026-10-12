"use client";

import { useEffect, useRef, useState } from "react";
import { linkSpace, pairApi, readLink, requestSync, unlink } from "../../lib/sync-client";

const POLL_EVERY_S = 2;
const ERRORS = {
  429: "Too many codes. Wait a few minutes and try again.",
  503: "Sync isn't available right now. Try again later.",
};
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

/*
 * Showing a code (and its QR) so another device can link for sync.
 *
 * start() gets a 6 digit code for this device's space (a new space when it
 * is not linked yet) and joins that space right away, so this device's
 * recipes are already there when the other one joins. While the code is on
 * screen it counts down and asks every 2 s whether it was used.
 * If it is cancelled, expires unused, or the component goes away while
 * waiting, a device that was not linked before leaves the space again.
 *
 * phase: idle | making | waiting | used | expired
 */
export function usePairCode() {
  const [pair, setPair] = useState(null); // { code, space, expires, wasLinked }
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const live = useRef(null); // the waiting pair, for cleanup on unmount

  useEffect(() => {
    if (phase !== "waiting" || !pair) return undefined;
    let ticks = 0;
    let alive = true;
    const finish = (state) => {
      window.clearInterval(id);
      live.current = null;
      if (state === "used") {
        requestSync();
      } else if (!pair.wasLinked) {
        unlink();
      }
      setPhase(state);
    };
    const id = window.setInterval(async () => {
      const t = Date.now();
      setNow(t);
      if (t >= pair.expires) {
        finish("expired");
        return;
      }
      ticks += 1;
      if (ticks % POLL_EVERY_S || document.visibilityState !== "visible") return;
      try {
        const { data } = await pairApi.status(pair.code, pair.space);
        if (alive && (data.state === "used" || data.state === "expired")) finish(data.state);
      } catch {
        // keep showing the code; the next tick asks again
      }
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [phase, pair]);

  // Closing the screen while waiting drops the code.
  useEffect(
    () => () => {
      const p = live.current;
      if (!p) return;
      pairApi.cancel(p.code, p.space).catch(() => {});
      if (!p.wasLinked) unlink();
    },
    [],
  );

  async function start() {
    setPhase("making");
    setError("");
    try {
      const link = readLink();
      const { status, data } = await pairApi.create(link?.space);
      if (status !== 200 || !data.code) {
        setError(ERRORS[status] || OFFLINE);
        setPhase("idle");
        return;
      }
      if (!link) linkSpace(data.space);
      const t = Date.now();
      const next = { code: data.code, space: data.space, expires: t + data.ttl * 1000, wasLinked: !!link };
      live.current = next;
      setNow(t);
      setPair(next);
      setPhase("waiting");
    } catch {
      setError(OFFLINE);
      setPhase("idle");
    }
  }

  function cancel() {
    const p = live.current;
    live.current = null;
    if (p) {
      pairApi.cancel(p.code, p.space).catch(() => {});
      if (!p.wasLinked) unlink();
    }
    setPair(null);
    setPhase("idle");
  }

  return { pair, phase, error, now, start, cancel };
}
