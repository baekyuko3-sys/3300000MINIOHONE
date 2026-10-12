import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type InitialValue<T> = T | (() => T);

/**
 * Small local-first persistence primitive.
 * - Safe in browser and during prerender.
 * - Reads once on mount, then writes whenever the value changes.
 * - Keeps storage failures non-fatal so the phone UI still works.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: InitialValue<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return typeof initialValue === 'function'
        ? (initialValue as () => T)()
        : initialValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        return JSON.parse(raw) as T;
      }
    } catch {
      // Corrupt/inaccessible storage should never break the app.
    }

    return typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage quota/private mode/etc. should degrade gracefully.
    }
  }, [key, value]);

  return [value, setValue];
}

export function readPersistentState<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
