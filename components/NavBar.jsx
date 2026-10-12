"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useKitchen } from "../lib/store";
import { recipeIndexQuery } from "../lib/queries";
import ResumeChip from "./ResumeChip";
import { openScanner } from "./share/QrScanner";
import { OPEN, tabTypes } from "../lib/transitions";
// Sets <html data-vt> for the page animations as soon as the app starts.
import "../lib/transitionStyle";

const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

// Discover: compass
const DiscoverIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
);

// My kitchen: cooking pot
const KitchenIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
    <path d="M2.5 10h19M9 6.5c0-1 1-1 1-2M14 6.5c0-1 1-1 1-2" />
  </svg>
);

// Saved: bookmark
const SavedIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
  </svg>
);

// Surprise me: dice
const DiceIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
  </svg>
);

// Scan: QR code frame
const ScanIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M8 12h8" />
  </svg>
);

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { pool, favorites } = useKitchen();
  const queryClient = useQueryClient();
  const [rolling, setRolling] = useState(false);

  const tabs = [
    { href: "/", label: "Discover", Icon: DiscoverIcon, count: 0 },
    { href: "/pool", label: "My kitchen", Icon: KitchenIcon, count: pool.size },
    { href: "/favorites", label: "Saved", Icon: SavedIcon, count: favorites.size },
  ];

  async function surpriseMe() {
    setRolling(true);
    try {
      const list = await queryClient.ensureQueryData(recipeIndexQuery);
      const pick = list[Math.floor(Math.random() * list.length)];
      if (pick) router.push(`/recipes/${pick.slug}`, { transitionTypes: OPEN });
    } catch {
      // index unavailable (offline, not cached yet): do nothing
    } finally {
      setRolling(false);
    }
  }

  return (
    <>
      <header className="nb-top">
        <div className="container nb-top-inner">
          <Link href="/" scroll={false} transitionTypes={tabTypes(pathname, "/")} className="nb-brand">
            mob<span> / my kitchen</span>
          </Link>

          <nav className="nb-links" aria-label="Main">
            {tabs.map(({ href, label, count }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  scroll={href === "/" ? false : undefined}
                  transitionTypes={tabTypes(pathname, href)}
                  aria-current={active ? "page" : undefined}
                  className={`nb-link ${active ? "active" : ""}`}
                >
                  {label}
                  {count > 0 ? <span className="nb-badge">{count}</span> : null}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            className="nb-surprise nb-scan"
            onClick={openScanner}
            aria-label="Scan a QR code from another phone"
          >
            <ScanIcon />
          </button>
          <button
            type="button"
            className="nb-surprise"
            onClick={surpriseMe}
            disabled={rolling}
            aria-label="Surprise me with a random recipe"
          >
            <DiceIcon />
            <span className="nb-surprise-label">Surprise me</span>
          </button>
        </div>
      </header>

      <nav className="nb-tabbar" aria-label="Tabs">
        {tabs.map(({ href, label, Icon, count }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              scroll={href === "/" ? false : undefined}
              transitionTypes={tabTypes(pathname, href)}
              aria-current={active ? "page" : undefined}
              className={`nb-tab ${active ? "active" : ""}`}
            >
              <span className="nb-tab-icon">
                <Icon />
                {count > 0 ? (
                  <span className="nb-badge nb-tab-badge" aria-label={`${count} items`}>
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              <span className="nb-tab-label">{label}</span>
            </Link>
          );
        })}
      </nav>

      <ResumeChip />
    </>
  );
}
