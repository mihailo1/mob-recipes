"use client";

import { ToastHost } from "./Toast";
import { AddToFolderHost } from "./folders/AddToFolderSheet";
import { QrScannerHost } from "./share/QrScanner";

// App-wide overlays that any screen can trigger: toasts, the "Save to
// folder" sheet and the QR scanner. Mounted once in app/layout.jsx.
export default function GlobalOverlays() {
  return (
    <>
      <ToastHost />
      <AddToFolderHost />
      <QrScannerHost />
    </>
  );
}
