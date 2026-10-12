import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyState, isConfiguredEnv, parseState, storageModeFromEnv } from "./state.mjs";

// One small JSON document holds everything. Writes are the scarce resource on
// Vercel Hobby (2,000 advanced ops per month), so callers write only when
// something actually changed.
//
// Blob writes are conditional: a write carries the ETag of the version it was
// based on (ifMatch), so two requests can never silently overwrite each other.
// On a conflict the change is applied again to a fresh read, once. The local
// file store (testing only) has no such protection.

const BLOB_PATHNAME = "push/state.json";
const DEV_FILE = path.join(process.cwd(), ".push-dev-state.json");

export class StoreUnavailableError extends Error {}
class ConflictError extends Error {}

/** "blob", "file" (local testing only, never on Vercel) or null. */
export function storageMode() {
  return storageModeFromEnv(process.env);
}

/** Storage is usable and VAPID_PRIVATE_KEY and NOTIFY_SECRET are present. */
export function isConfigured() {
  return isConfiguredEnv(process.env);
}

/** Returns { raw, etag, exists }. raw is null when there is no document yet. */
async function readRaw() {
  if (storageMode() === "blob") {
    const res = await get(BLOB_PATHNAME, { access: "private", useCache: false });
    if (!res) return { raw: null, etag: null, exists: false };
    if (res.statusCode !== 200 || !res.stream) throw new StoreUnavailableError("blob-read");
    return { raw: await new Response(res.stream).json(), etag: res.blob?.etag || null, exists: true };
  }
  try {
    return { raw: JSON.parse(await fs.readFile(DEV_FILE, "utf8")), etag: null, exists: true };
  } catch (err) {
    if (err && err.code === "ENOENT") return { raw: null, etag: null, exists: false };
    throw err;
  }
}

/**
 * Returns { state, etag, exists }. A missing document is an empty state. A
 * malformed one throws, so it is never overwritten blindly.
 */
export async function readSnapshot() {
  let snap;
  try {
    snap = await readRaw();
  } catch (err) {
    if (err instanceof StoreUnavailableError) throw err;
    throw new StoreUnavailableError("read-failed");
  }
  if (snap.raw === null) return { state: emptyState(), etag: null, exists: false };
  const state = parseState(snap.raw);
  if (!state) throw new StoreUnavailableError("malformed");
  return { state, etag: snap.etag, exists: true };
}

async function writeSnapshot(state, snap) {
  const body = JSON.stringify(state);
  if (storageMode() !== "blob") {
    try {
      await fs.writeFile(DEV_FILE, body, "utf8");
      return;
    } catch {
      throw new StoreUnavailableError("write-failed");
    }
  }
  const options = { access: "private", addRandomSuffix: false, contentType: "application/json" };
  // Update: only if nobody wrote since our read. Create (no document yet):
  // no ifMatch, and only if the document still does not exist.
  if (snap.exists && snap.etag) options.ifMatch = snap.etag;
  else options.allowOverwrite = snap.exists;
  try {
    await put(BLOB_PATHNAME, body, options);
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) throw new ConflictError();
    // A failed create may mean another request created it first. The fresh
    // read on retry tells the two cases apart.
    if (!snap.exists) throw new ConflictError();
    throw new StoreUnavailableError("write-failed");
  }
}

/**
 * Read, change, conditional write. `transition(state)` must be pure and
 * return { next, ...info }; next is the new state, or null for "no write".
 * On a write conflict the transition runs once more on a fresh read; a second
 * conflict gives up with StoreUnavailableError. Returns the info of the run
 * that was applied. Pass `snapshot` to reuse a read already done.
 */
export async function mutateState(transition, snapshot) {
  let snap = snapshot || (await readSnapshot());
  for (let attempt = 0; ; attempt++) {
    const out = transition(snap.state);
    if (!out.next) return out;
    try {
      await writeSnapshot(out.next, snap);
      return out;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      if (attempt >= 1) throw new StoreUnavailableError("conflict");
    }
    snap = await readSnapshot();
  }
}
