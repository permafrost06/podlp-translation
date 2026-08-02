import { useEffect, useState } from "react";

/**
 * useState variant that persists its value to localStorage under `key`.
 * Values are JSON-serialised, so any serialisable type works.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* ignore malformed / unavailable storage */
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / unavailable storage */
    }
  }, [key, value]);

  return [value, setValue];
}

const PREFIX = "podlp-";

export const persistKey = (name: string) => `${PREFIX}${name}`;

/**
 * Persist a value to localStorage without owning the React state. Useful when
 * the state already lives elsewhere (e.g. a Set kept in component state) but
 * you still want the last value restored on the next visit.
 */
export function readPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}
