// Web Push settings shared by the client and the API routes.
// The public VAPID key is safe to commit. The matching private key lives only
// in the VAPID_PRIVATE_KEY environment variable on Vercel.
export const VAPID_PUBLIC_KEY = "BK5hRsJeiXpRZG00UeLdkDFGSQDDFsuufz8A8DfLU5iH3xxTzecdmiHzIgrwLZ7SOpNdopdAVfTr5mdZj9tjlJ8";

export const MAX_DEVICES = 5;
export const PUSH_GAP_MS = 24 * 60 * 60 * 1000; // at most one push per 24h
export const MAX_WRITES_PER_DAY = 20; // caps Blob writes if the endpoint is spammed

// Limits in the shape lib/push/state.mjs expects.
export const PUSH_LIMITS = { maxDevices: MAX_DEVICES, gapMs: PUSH_GAP_MS, maxWrites: MAX_WRITES_PER_DAY };
