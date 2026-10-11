"use client";

import { ToastHost } from "./Toast";
import { AddToFolderHost } from "./folders/AddToFolderSheet";

// App-wide overlays that any screen can trigger: toasts and the
// "Save to folder" sheet. Mounted once in app/layout.jsx.
export default function GlobalOverlays() {
  return (
    <>
      <ToastHost />
      <AddToFolderHost />
    </>
  );
}
