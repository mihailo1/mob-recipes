"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/*
 * One toast at a time, shown above the tab bar (and above the resume chip
 * while it is visible). A new toast replaces the current one.
 *
 *   showToast({ message, action: { label, onClick }, icon, duration })
 *
 * State lives in a tiny module store so any component (or a plain callback)
 * can show a toast without a provider. <ToastHost /> renders it.
 */

const LEAVE_MS = 220;

let current = null; // { id, message, action, icon, duration, leaving }
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => current;
const getServerSnapshot = () => null;

/** Show a toast; returns its id. icon: "heart" | "heart-off" | "folder" | "check". */
export function showToast({ message, action = null, icon = null, duration = 4000 }) {
  seq += 1;
  current = { id: seq, message, action, icon, duration, leaving: false };
  emit();
  return seq;
}

/** Hide the toast (only if it is still the one with `id`, when given). */
export function dismissToast(id) {
  if (!current || current.leaving || (id != null && current.id !== id)) return;
  const leavingId = current.id;
  current = { ...current, leaving: true };
  emit();
  setTimeout(() => {
    if (current && current.id === leavingId) {
      current = null;
      emit();
    }
  }, LEAVE_MS);
}

const ICON = {
  heart: (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
      />
    </svg>
  ),
  "heart-off": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
};

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const timer = useRef(0);
  const id = toast?.id;
  const leaving = !!toast?.leaving;
  const duration = toast?.duration;

  useEffect(() => {
    if (id == null || leaving) return undefined;
    timer.current = setTimeout(() => dismissToast(id), duration);
    return () => clearTimeout(timer.current);
  }, [id, leaving, duration]);

  // Hovering with a mouse keeps it on screen.
  const pause = (e) => {
    if (e.pointerType === "mouse") clearTimeout(timer.current);
  };
  const resume = (e) => {
    if (e.pointerType !== "mouse" || id == null || leaving) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismissToast(id), 1600);
  };

  return (
    <div className="toast-host" role="status" aria-live="polite" aria-atomic="true">
      {toast ? (
        <div
          key={toast.id}
          className={`toast ${toast.leaving ? "is-leaving" : ""}`}
          onPointerEnter={pause}
          onPointerLeave={resume}
        >
          {toast.icon ? (
            <span className={`toast-icon toast-icon-${toast.icon}`}>{ICON[toast.icon]}</span>
          ) : null}
          <span className="toast-msg">{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                dismissToast(toast.id);
                toast.action.onClick();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
