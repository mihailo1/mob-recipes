"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberTabUrl } from "../lib/tabMemory";

// Records the URL of each tab page as it changes (filters and folders are
// written with replaceState/pushState; Next keeps useSearchParams in sync).
function Recorder() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    rememberTabUrl(pathname, search);
  }, [pathname, search]);
  return null;
}

// useSearchParams on static pages needs a boundary; this renders nothing.
export default function TabMemory() {
  return (
    <Suspense fallback={null}>
      <Recorder />
    </Suspense>
  );
}
