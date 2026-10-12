import { notFound } from "next/navigation";
import SharedView from "../../../components/share/SharedView";
import PageTransition from "../../../components/PageTransition";
import { isValidShareId, shareSlugs, validateShare } from "../../../lib/share.mjs";
import { getShare, storeMode } from "../../../lib/sync/store.js";

export const dynamic = "force-dynamic";

async function loadShare(id) {
  if (!isValidShareId(id) || !storeMode()) return null;
  try {
    const raw = await getShare(id);
    if (!raw) return null;
    const v = validateShare(JSON.parse(raw));
    return v.ok ? v.doc : null;
  } catch {
    return undefined; // storage trouble, not a missing link
  }
}

function describe(doc) {
  const n = shareSlugs(doc).length;
  const count = `${n} ${n === 1 ? "recipe" : "recipes"}`;
  if (doc.kind === "folder") {
    const f = doc.folders[0];
    return { title: `${f.emoji} ${f.name}`, count };
  }
  return { title: "Saved recipes", count };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const doc = await loadShare(id);
  if (!doc) return { title: "Shared recipes — Mob Recipes Archive" };
  const { title, count } = describe(doc);
  return {
    title: `${title} · ${count} — Mob Recipes`,
    description: `${count} shared with you. Open to save your own copy.`,
    openGraph: { title: `${title} · ${count}`, description: "Shared from Mob Recipes" },
  };
}

export default async function SharedPage({ params }) {
  const { id } = await params;
  const doc = await loadShare(id);
  if (doc === null) notFound();
  return (
    <PageTransition>
      <div className="container">
        <SharedView id={id} doc={doc || null} />
      </div>
    </PageTransition>
  );
}
