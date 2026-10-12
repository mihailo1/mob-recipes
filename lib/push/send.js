import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "./config.js";

const SUBJECT = "https://mob-recipes.vercel.app";
// Default urgency: "low" lets some push services hold the message for a long time.
const SEND_OPTIONS = { TTL: 86400, timeout: 10000 };

/**
 * Returns a send(sub, payload) function for executeNotify, or null when the
 * VAPID details are unusable. The function never throws and never logs the
 * subscription (endpoints and keys are credentials).
 */
export function createSender() {
  try {
    webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } catch {
    return null;
  }
  return async function send(sub, payload) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        JSON.stringify(payload),
        SEND_OPTIONS,
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, statusCode: typeof err?.statusCode === "number" ? err.statusCode : undefined };
    }
  };
}
