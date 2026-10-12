"use client";

import { ViewTransition } from "react";

// A recipe photo that flies from the Continue cooking chip into the recipe
// page (lib/transitions.js, RESUME). Only on that navigation: anywhere else
// the photo moves with its page, and no name is set, so the same recipe on a
// list and in the chip never clash.
const SHARE = { "nav-resume": "morph", default: "none" };

export default function PhotoMorph({ name, children }) {
  if (!name) return children;
  return (
    <ViewTransition name={name} share={SHARE} default="none">
      {children}
    </ViewTransition>
  );
}
