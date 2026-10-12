"use client";

import { ViewTransition } from "react";
import { useTransitionStyle } from "../lib/transitionStyle";

// A recipe photo that flies between the card and the recipe page
// (lib/transitions.js). Only in the "photo" transition style: in the others
// the photo moves with its page.
export default function PhotoMorph({ name, children }) {
  const style = useTransitionStyle();
  if (!name) return children;
  return (
    <ViewTransition name={name} share={style === "photo" ? "morph" : "none"} default="none">
      {children}
    </ViewTransition>
  );
}
