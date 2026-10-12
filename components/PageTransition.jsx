import { ViewTransition } from "react";

// Enter and exit animation per transition type (lib/transitions.js). Every
// page wraps its content in this, not the layout: layouts stay mounted, so
// they never enter or exit. Untyped updates (browser back, refresh, data
// loading) do not animate the page; a shared recipe photo still morphs.
const BY_TYPE = {
  "tab-forward": "tab-forward",
  "tab-back": "tab-back",
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
};

export default function PageTransition({ children }) {
  return (
    <ViewTransition enter={BY_TYPE} exit={BY_TYPE} default="none">
      {children}
    </ViewTransition>
  );
}
