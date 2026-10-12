"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKitchen } from "../../lib/store";
import { useRecipeIndex } from "../../lib/queries";
import { shareSlugs } from "../../lib/share.mjs";
import RecipeCard from "../RecipeCard";
import FolderCover from "../folders/FolderCover";
import { coverImages, recipesLabel, useRecipeMap } from "../folders/folderData";
import { showToast } from "../Toast";
import { copyLink, isIOSBrowserTab } from "./shareActions";

const PAGE_SIZE = 40;
const noSubscribe = () => () => {};

/*
 * Page for a shared folder link (/s/<id>): what is in it, and a button that
 * saves a copy into this device's Saved (lib/share.mjs importShare).
 * doc null: the link exists but could not be loaded right now.
 */
export default function SharedView({ id, doc }) {
  const router = useRouter();
  const { importShared, ready } = useKitchen();
  const { data: index } = useRecipeIndex();
  const recipeMap = useRecipeMap(index);
  const [shown, setShown] = useState(PAGE_SIZE);
  const inSafari = useSyncExternalStore(noSubscribe, isIOSBrowserTab, () => false);

  const slugs = useMemo(() => {
    if (!doc) return [];
    const all = shareSlugs(doc);
    return recipeMap.size ? all.filter((s) => recipeMap.has(s)) : all;
  }, [doc, recipeMap]);

  if (!doc) {
    return (
      <div className="empty">
        <h2>Couldn&apos;t load these recipes</h2>
        <p>Check your connection and try again.</p>
        <button type="button" className="pill-btn" onClick={() => router.refresh()}>
          Try again
        </button>
      </div>
    );
  }

  const isFolder = doc.kind === "folder";
  const head = isFolder ? doc.folders[0] : null;
  const recipes = slugs.map((s) => recipeMap.get(s)).filter(Boolean);

  function save() {
    const { folderIds, newRecipes } = importShared(doc);
    const target = folderIds.find(Boolean);
    showToast({
      message: newRecipes
        ? `Saved ${recipesLabel(newRecipes)}`
        : "Already in your Saved",
      icon: "heart",
      duration: 3000,
    });
    router.push(isFolder && target ? `/favorites?folder=${encodeURIComponent(target)}` : "/favorites");
  }

  return (
    <>
      <header className="sh-head" style={head ? { "--fd-c": head.color } : undefined}>
        <span className="sh-kicker">Shared with you</span>
        <div className="sh-title-row">
          {head ? (
            <span className="fd-head-icon sh-icon" aria-hidden="true">
              {head.emoji}
            </span>
          ) : null}
          <div>
            <h1 className="sh-title">{head ? head.name : "Saved recipes"}</h1>
            <p className="sh-count">
              {recipesLabel(slugs.length)}
              {!isFolder && doc.folders.length
                ? ` · ${doc.folders.length === 1 ? "1 folder" : `${doc.folders.length} folders`}`
                : ""}
            </p>
          </div>
        </div>
        <button type="button" className="primary-btn sh-save" onClick={save} disabled={!ready}>
          Save to my recipes
        </button>
        {inSafari ? (
          <div className="sh-safari">
            <p>
              Using Mob Recipes from your Home Screen? This page opened in
              Safari, which keeps its own Saved. Copy the link, then in the app
              open Saved, tap ⋯ next to Folders and choose Open a shared link.
            </p>
            <button
              type="button"
              className="pill-btn"
              onClick={() => copyLink(`${window.location.origin}/s/${id}`)}
            >
              Copy link
            </button>
          </div>
        ) : null}
      </header>

      {!isFolder && doc.folders.length ? (
        <section className="sh-folders" aria-label="Folders">
          {doc.folders.map((f, i) => {
            const items = recipeMap.size ? f.items.filter((s) => recipeMap.has(s)) : f.items;
            return (
              <div className="sh-folder" key={`${f.name}-${i}`}>
                <FolderCover
                  images={coverImages(items, recipeMap)}
                  emoji={f.emoji}
                  color={f.color}
                  variant="mini"
                />
                <span className="sh-folder-name">{f.name}</span>
                <span className="sh-folder-count">{recipesLabel(items.length)}</span>
              </div>
            );
          })}
        </section>
      ) : null}

      {!index ? (
        <p className="meta-row">Loading…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <h2>These recipes are no longer here</h2>
          <p>
            <Link href="/" className="back-link" style={{ display: "inline" }}>
              Find something else
            </Link>
          </p>
        </div>
      ) : (
        <>
          <div className="grid sh-grid">
            {recipes.slice(0, shown).map((r) => (
              <RecipeCard key={r.slug} recipe={r} />
            ))}
          </div>
          {shown < recipes.length ? (
            <button className="load-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              Show more
            </button>
          ) : null}
        </>
      )}
    </>
  );
}
