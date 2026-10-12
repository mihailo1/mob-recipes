import { get, put } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyState, parseState } from "./state.mjs";

// One small JSON document holds everything. Writes are the scarce resource on
// Vercel Hobby (2,000 advanced ops per month), so callers write only when
// something actually changed.
//
// Read-modify-write is not atomic. Two requests landing in the same instant
// could overwrite each other. At this volume (a handful of devices, a few
// writes per day) that is acceptable, so there is no locking.

const BLOB_PATHNAME = "push/state.json";
const DEV_FILE = path.join(process.cwd(), ".push-dev-state.json");

export class StoreUnavailableError extends Error {}

/**
 * "blob", "file" (local testing only) or null when no storage is usable.
 * The file store is used in dev, or in a local production build when
 * PUSH_ALLOW_FILE_STORE=1 is set. It is never enabled on Vercel.
 */
export function storageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.NODE_ENV !== "production") return "file";
  if (process.env.PUSH_ALLOW_FILE_STORE === "1") return "file";
  return null;
}

/** Storage is usable and the VAPID private key is present. */
export function isConfigured() {
  return storageMode() !== null && !!process.env.VAPID_PRIVATE_KEY;
}

async function readRaw() {
  if (storageMode() === "blob") {
    const res = await get(BLOB_PATHNAME, { access: "private", useCache: false });
    if (!res) return null;
    if (res.statusCode !== 200 || !res.stream) throw new StoreUnavailableError("blob-read");
    return new Response(res.stream).json();
  }
  try {
    return JSON.parse(await fs.readFile(DEV_FILE, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/** Missing document is an empty state. A malformed one throws, so it is never overwritten blindly. */
export async function readState() {
  let raw;
  try {
    raw = await readRaw();
  } catch (err) {
    if (err instanceof StoreUnavailableError) throw err;
    throw new StoreUnavailableError("read-failed");
  }
  if (raw === null) return emptyState();
  const state = parseState(raw);
  if (!state) throw new StoreUnavailableError("malformed");
  return state;
}

export async function writeState(state) {
  const body = JSON.stringify(state);
  try {
    if (storageMode() === "blob") {
      await put(BLOB_PATHNAME, body, {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
      });
    } else {
      await fs.writeFile(DEV_FILE, body, "utf8");
    }
  } catch {
    throw new StoreUnavailableError("write-failed");
  }
}
