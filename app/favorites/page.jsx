"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useKitchen } from "../../lib/store";
import { useRecipeIndex } from "../../lib/queries";
import RecipeCard from "../../components/RecipeCard";
import { SearchAppSkeleton } from "../../components/SearchApp";
import SearchFilters, {
  SortSelect,
} from "../../components/filters/SearchFilters";
import TimeRange from "../../components/filters/TimeRange";
import {
  useFilteredRecipes,
  useIngredientVocabulary,
  useRecipeFacets,
  useRecipeFilters,
} from "../../lib/useRecipeFilters";
import { useListRestoration } from "../../lib/useListRestoration";
import { SAVED_SORT_OPTIONS } from "../../lib/filters";
import FolderStrip from "../../components/folders/FolderStrip";
import FolderHeader from "../../components/folders/FolderHeader";
import {
  FolderActionsSheet,
  FolderEditSheet,
} from "../../components/folders/FolderSheets";
import { openAddToFolder } from "../../components/folders/AddToFolderSheet";
import { showToast } from "../../components/Toast";
import {
  NO_FOLDERS,
  liveItems,
  useFolderSummaries,
  useRecipeMap,
} from "../../components/folders/folderData";

const PAGE_SIZE = 40;
const FOLDER_PARAM = "folder";
const KEEP_PARAMS = [FOLDER_PARAM];

// Same ids as SAVED_SORT_OPTIONS (so the sort survives switching folders);
// inside a folder `savedAt` is the time the recipe was added to the folder.
const FOLDER_SORT_OPTIONS = SAVED_SORT_OPTIONS.map((o) =>
  o.id === "recent"
    ? { ...o, label: "Recently added" }
    : o.id === "oldest"
      ? { ...o, label: "Oldest added" }
      : o,
);

const folderHref = (id) =>
  id ? `/favorites?${FOLDER_PARAM}=${encodeURIComponent(id)}` : "/favorites";

// Must render under <Suspense> (useSearchParams via useRecipeFilters).
function SavedApp() {
  const {
    favorites,
    folders = NO_FOLDERS,
    ready,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useKitchen();
  const { data: index, isError, refetch } = useRecipeIndex();
  const recipeMap = useRecipeMap(index);
  const searchParams = useSearchParams();
  const folderParam = searchParams.get(FOLDER_PARAM) || "";
  const folder = folderParam
    ? folders.find((f) => f.id === folderParam) || null
    : null;

  // Saved recipes with the time they were saved (for the "recently saved" sort).
  const saved = useMemo(() => {
    if (!index) return null;
    return index
      .filter((r) => favorites.has(r.slug))
      .map((r) => ({ ...r, savedAt: favorites.get(r.slug) ?? 0 }));
  }, [index, favorites]);

  // Inside a folder: its saved recipes, `savedAt` = added to the folder.
  const inFolder = useMemo(() => {
    if (!index || !folder) return null;
    return liveItems(folder, favorites, recipeMap).map((it) => ({
      ...recipeMap.get(it.slug),
      savedAt: it.addedAt,
    }));
  }, [index, folder, favorites, recipeMap]);

  const list = folder ? inFolder : saved;
  const sortOptions = folder ? FOLDER_SORT_OPTIONS : SAVED_SORT_OPTIONS;

  const summaries = useFolderSummaries(folders, favorites, recipeMap);
  const filedSlugs = useMemo(() => {
    const s = new Set();
    for (const f of folders) for (const it of f.items) s.add(it.slug);
    return s;
  }, [folders]);

  const facets = useRecipeFacets(list);
  const vocabulary = useIngredientVocabulary(list);
  const filterState = useRecipeFilters({
    persistKey: "saved",
    sortOptions,
    facets: list ? facets : undefined,
    keepParams: KEEP_PARAMS,
  });
  const filtered = useFilteredRecipes(list, filterState.deferredFilters, {
    sortOptions,
  });

  const loaded = ready && !!saved;
  const { visible, showMore } = useListRestoration({
    key: `/favorites?${folder ? `${FOLDER_PARAM}=${folder.id}&` : ""}${filterState.search}`,
    ready: loaded,
    pageSize: PAGE_SIZE,
  });

  // Unknown or deleted folder id: quietly show All saved and clean the URL.
  useEffect(() => {
    if (!ready || !folderParam || folder) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(FOLDER_PARAM)) return;
    params.delete(FOLDER_PARAM);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, [ready, folderParam, folder]);

  // Sheets. Each opening gets a new key so its form starts fresh.
  const [edit, setEdit] = useState({ open: false, key: 0 });
  const [actions, setActions] = useState({ open: false, key: 0, folder: null });
  const moreRef = useRef(null);

  // Folder switch in place: new history entry (Back returns), no scroll jump.
  // Filters stay; useRecipeFilters writes them back next to the folder param.
  function selectFolder(id) {
    const url = folderHref(id);
    const loc = window.location;
    if (url === loc.pathname + loc.search) return;
    window.history.pushState(null, "", url);
  }

  function openCreate() {
    // flushSync: the sheet mounts and focuses its input inside the tap (iOS keyboard).
    flushSync(() => setEdit((e) => ({ open: true, key: e.key + 1, mode: "create" })));
  }

  function openEdit(focusName) {
    const target = actions.folder;
    flushSync(() => {
      setActions((a) => ({ ...a, open: false }));
      setEdit((e) => ({ open: true, key: e.key + 1, mode: "edit", folder: target, focusName }));
    });
  }

  const closeEdit = () => setEdit((e) => ({ ...e, open: false }));
  const closeActions = () => setActions((a) => ({ ...a, open: false }));

  const sheets = (
    <>
      <FolderEditSheet
        key={`edit-${edit.key}`}
        open={edit.open}
        mode={edit.mode}
        folder={edit.folder}
        focusName={edit.focusName}
        folders={folders}
        onClose={closeEdit}
        returnFocusRef={edit.mode === "edit" ? moreRef : undefined}
        onCreate={(look) => {
          const id = createFolder(look);
          if (id) {
            closeEdit();
            selectFolder(id);
          }
          return id;
        }}
        onUpdate={(look) => {
          if (edit.folder) updateFolder(edit.folder.id, look);
          closeEdit();
        }}
      />
      <FolderActionsSheet
        key={`actions-${actions.key}`}
        open={actions.open}
        folder={actions.folder}
        onClose={closeActions}
        onRename={() => openEdit(true)}
        onEditLook={() => openEdit(false)}
        onDelete={() => {
          const target = actions.folder;
          closeActions();
          if (!target) return;
          deleteFolder(target.id);
          showToast({ message: `Deleted “${target.name}”`, icon: "check", duration: 3000 });
        }}
      />
    </>
  );

  if (!loaded) {
    if (isError && !index) {
      return (
        <div className="empty">
          <h2>Recipes couldn’t load</h2>
          <button className="pill-btn" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      );
    }
    return <SearchAppSkeleton />;
  }

  const showStrip = saved.length > 0 || folders.length > 0;
  const strip = showStrip ? (
    <FolderStrip
      folders={folders}
      summaries={summaries}
      activeId={folder?.id || null}
      hrefFor={folderHref}
      onSelect={selectFolder}
      onNewFolder={openCreate}
    />
  ) : null;

  const head = folder ? (
    <FolderHeader
      folder={folder}
      count={inFolder.length}
      moreRef={moreRef}
      onMore={() =>
        setActions((a) => ({ open: true, key: a.key + 1, folder }))
      }
    />
  ) : null;

  if (list.length === 0) {
    return (
      <>
        {strip}
        {head}
        {folder ? (
          <div className="fd-empty" style={{ "--fd-c": folder.color }}>
            <span className="fd-empty-icon" aria-hidden="true">
              {folder.emoji}
            </span>
            <h2>Nothing in here yet</h2>
            <p>Add recipes with the folder button on any recipe.</p>
            {saved.length ? (
              <button className="pill-btn" onClick={() => selectFolder(null)}>
                Browse all saved
              </button>
            ) : null}
          </div>
        ) : (
          <div className="empty saved-empty">
            <h2>Nothing saved yet.</h2>
            <p>
              Hit the ♡ on any recipe to keep it here. Head to{" "}
              <Link href="/" className="back-link" style={{ display: "inline" }}>
                search
              </Link>{" "}
              to find something good.
            </p>
          </div>
        )}
        {sheets}
      </>
    );
  }

  const active = filterState.isActive;
  const shown = filtered.slice(0, visible);
  const total = list.length;

  return (
    <>
      {strip}
      {head}

      <section className="search-panel saved-filters" aria-label="Filter saved recipes">
        <SearchFilters
          filterState={filterState}
          categories={facets.categories}
          cuisines={facets.cuisines}
          vocabulary={vocabulary}
          recipeCount={total}
        >
          <TimeRange filterState={filterState} recipes={index} />
        </SearchFilters>
      </section>

      <div className="results-heading">
        <h2>
          {folder
            ? active
              ? "Matches in this folder"
              : "In this folder"
            : active
              ? "Your saved matches"
              : "Your saved recipes"}
          <span>
            {filtered.length.toLocaleString()}
            {active ? ` of ${total.toLocaleString()}` : ""}{" "}
            {total === 1 && !active ? "recipe" : "recipes"}
          </span>
        </h2>
        <SortSelect filterState={filterState} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty saved-empty">
          <h2>No saved matches.</h2>
          <p>Try fewer ingredients or broaden your filters.</p>
          <button className="primary-btn" onClick={filterState.reset}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <RecipeCard
              key={r.slug}
              recipe={r}
              onFolder={() => openAddToFolder(r)}
              inFolder={filedSlugs.has(r.slug)}
            />
          ))}
        </div>
      )}

      {visible < filtered.length ? (
        <button className="load-more" onClick={showMore}>
          Show more
        </button>
      ) : null}

      {sheets}
    </>
  );
}

export default function FavoritesPage() {
  return (
    <div className="container">
      <header className="header">
        <span className="eyebrow">YOUR PERSONAL COOKBOOK</span>
        <h1>Saved for a good day.</h1>
        <p>Recipes you&apos;ve saved for later.</p>
      </header>
      <Suspense fallback={<SearchAppSkeleton />}>
        <SavedApp />
      </Suspense>
    </div>
  );
}
