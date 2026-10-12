"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import BottomSheet from "../BottomSheet";
import { showToast } from "../Toast";
import { parseScan } from "../../lib/qr.mjs";
import { joinWithCode } from "../../lib/sync-client";
import { OPEN } from "../../lib/transitions";

/*
 * Global QR scanner sheet. Any component calls openScanner();
 * <QrScannerHost /> (in GlobalOverlays) renders it.
 *
 * Scanning happens inside the app on purpose: the iPhone Camera app would
 * open the link in Safari, which keeps its own Saved and kitchen. Recipe and
 * folder codes open in the app; a device linking code links right away.
 * The QR decoder (jsQR) loads only when the scanner opens.
 */

const SCAN_EVERY_MS = 150;
const MAX_SIDE = 640; // decode a downscaled frame, plenty for a phone screen

let session = null; // { key, open }
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openScanner() {
  session = { key: ++seq, open: true };
  emit();
}

function closeScanner() {
  if (!session?.open) return;
  session = { ...session, open: false };
  emit();
}

const CAMERA_ERRORS = {
  NotAllowedError:
    "Camera access is off. Allow it for this app in Settings, or paste the link in Saved instead.",
  NotFoundError: "No camera found on this device.",
  NotReadableError: "The camera is busy in another app. Close it and try again.",
};

function Scanner({ open }) {
  const router = useRouter();
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let stream = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    async function handle(text) {
      const target = parseScan(text);
      if (!target) {
        setError("This QR code isn't from Mob Recipes.");
        return false;
      }
      stop();
      if (target.type === "open") {
        closeScanner();
        router.push(target.path, { transitionTypes: OPEN });
        return true;
      }
      setWorking(true);
      const r = await joinWithCode(target.code);
      setWorking(false);
      if (r.ok) {
        closeScanner();
        showToast({
          message: "Devices linked. Your kitchen and Saved now sync",
          icon: "check",
          duration: 4000,
        });
      } else {
        setError(r.error);
      }
      return true;
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use the camera. Paste the link in Saved instead.");
        return;
      }
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          }),
        ]);
        stream = media;
        if (stopped) {
          stop();
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        let lastBad = "";
        const tick = async () => {
          if (stopped) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            const k = Math.min(1, MAX_SIDE / Math.max(w, h));
            canvas.width = Math.round(w * k);
            canvas.height = Math.round(h * k);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            // The same unknown code again: keep looking without repeating work.
            if (hit?.data && hit.data !== lastBad) {
              if (await handle(hit.data)) return;
              lastBad = hit.data;
            }
          }
          timer = window.setTimeout(tick, SCAN_EVERY_MS);
        };
        tick();
      } catch (err) {
        if (!stopped) setError(CAMERA_ERRORS[err?.name] || "Couldn't start the camera.");
      }
    })();

    return stop;
  }, [open, router]);

  return (
    <BottomSheet open={open} onClose={closeScanner} title="Scan a QR code" className="fd-sheet">
      <div className="qr-scan">
        <div className="qr-view">
          <video ref={videoRef} className="qr-video" playsInline muted autoPlay />
          <span className="qr-frame" aria-hidden="true" />
        </div>
        <p className="qr-hint" role="status" aria-live="polite">
          {working
            ? "Linking…"
            : error || "Point at a QR code from Mob on the other phone: a recipe, a folder or a device link."}
        </p>
      </div>
    </BottomSheet>
  );
}

const getSnapshot = () => session;
const getServerSnapshot = () => null;

export function QrScannerHost() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!s) return null;
  return <Scanner key={s.key} open={s.open} />;
}
