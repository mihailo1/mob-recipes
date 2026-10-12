import { ViewTransition } from "react";

// Animation class per transition type (lib/transitions.js), one for the page
// coming in and one for the page going out, so the CSS can tell them apart
// (a recipe sliding back out has to stay on top of the list it reveals).
// Every page wraps its content in this, not the layout: layouts stay mounted,
// so they never enter or exit. Untyped updates (browser back, refresh, data
// loading) do not animate the page. app/globals.css animates each class per
// transition style (lib/transitionStyle.js).
const ENTER = {
  "tab-forward": "tab-in",
  "tab-back": "tab-in",
  "nav-forward": "open-in",
  "nav-back": "back-in",
  default: "none",
};
const EXIT = {
  "tab-forward": "tab-out",
  "tab-back": "tab-out",
  "nav-forward": "open-out",
  "nav-back": "back-out",
  default: "none",
};

export default function PageTransition({ children }) {
  return (
    <ViewTransition enter={ENTER} exit={EXIT} default="none">
      {children}
    </ViewTransition>
  );
}
