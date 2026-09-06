"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const KitchenContext = createContext(null);

function loadSet(key) {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // storage unavailable (private mode etc) — fail silently
  }
}

export function KitchenProvider({ children }) {
  const [pool, setPool] = useState(() => new Set());
  const [favorites, setFavorites] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPool(loadSet("mob-recipes:pool"));
    setFavorites(loadSet("mob-recipes:favorites"));
    setReady(true);
  }, []);

  const togglePool = useCallback((slug) => {
    setPool((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      saveSet("mob-recipes:pool", next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((slug) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      saveSet("mob-recipes:favorites", next);
      return next;
    });
  }, []);

  const clearPool = useCallback(() => {
    setPool(() => {
      const next = new Set();
      saveSet("mob-recipes:pool", next);
      return next;
    });
  }, []);

  return (
    <KitchenContext.Provider
      value={{ pool, favorites, togglePool, toggleFavorite, clearPool, ready }}
    >
      {children}
    </KitchenContext.Provider>
  );
}

export function useKitchen() {
  const ctx = useContext(KitchenContext);
  if (!ctx) throw new Error("useKitchen must be used inside KitchenProvider");
  return ctx;
}
