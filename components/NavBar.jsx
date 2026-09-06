"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useKitchen } from "../lib/store";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { pool, favorites } = useKitchen();
  const [rolling, setRolling] = useState(false);

  const link = (href, label, count) => (
    <Link key={href} href={href} className={`nav-link ${pathname === href ? "active" : ""}`}>
      {label}
      {count > 0 ? <span className="nav-badge">{count}</span> : null}
    </Link>
  );

  async function surpriseMe() {
    setRolling(true);
    try {
      const res = await fetch("/search-index.json");
      const list = await res.json();
      const pick = list[Math.floor(Math.random() * list.length)];
      if (pick) router.push(`/recipes/${pick.slug}`);
    } finally {
      setRolling(false);
    }
  }

  return (
    <nav className="nav-row">
      <div className="container nav-inner">
        <div className="nav-links">
          {link("/", "Search")}
          {link("/pool", "Pool", pool.size)}
          {link("/favorites", "Favorites", favorites.size)}
        </div>
        <button type="button" className="text-btn" onClick={surpriseMe} disabled={rolling}>
          🎲 Surprise me
        </button>
      </div>
    </nav>
  );
}
