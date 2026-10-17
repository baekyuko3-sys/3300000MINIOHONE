import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type InitialValue<T> = T | (() => T);
const DIAGNOSTICS_KEY = 'sane333:storage-diagnostics';
const MAX_DIAGNOSTICS = 100;

export interface PersistenceDiagnostic {
  id: string;
  time: string;
  area: string;
  message: string;
  detail: string;
}

export function reportPersistenceIssue(area: string, message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.message : error == null ? '' : String(error);
  const entry: PersistenceDiagnostic = {
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    time: new Date().toISOString(),
    area,
    message,
    detail,
  };
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(DIAGNOSTICS_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(existing) ? existing : [];
    list.push(entry);
    if (typeof window !== 'undefined') window.localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(list.slice(-MAX_DIAGNOSTICS)));
  } catch {
    // Diagnostics must never prevent the app from rendering; console remains the fallback.
  }
  if (typeof console !== 'undefined') console.error('[SANE333 persistence]', entry);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sane333:persistence-diagnostic', { detail: entry }));
}

export function readPersistenceDiagnostics(): PersistenceDiagnostic[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DIAGNOSTICS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as PersistenceDiagnostic[] : [];
  } catch (error) {
    console.error('[SANE333 persistence] Could not read diagnostics', error);
    return [];
  }
}

/**
 * Small local-first persistence primitive.
 * Storage failures remain non-fatal, but are recorded so users can diagnose them.
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
      if (raw !== null) return JSON.parse(raw) as T;
    } catch (error) {
      reportPersistenceIssue('read:' + key, '本地数据读取或 JSON 解析失败，已使用初始值', error);
    }

    return typeof initialValue === 'function'
      ? (initialValue as () => T)()
      : initialValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 300ms 防抖：输入框连续输入、大聊天记录频繁更新时不卡顿
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        // 广播：同页其他组件可同步（storage 事件只跨 tab，不跨同页组件）
        window.dispatchEvent(new CustomEvent('sane333:storage-changed', { detail: { key } }));
      } catch (error) {
        reportPersistenceIssue('write:' + key, '本地数据写入失败；当前更改可能尚未保存', error);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [key, value]);

  return [value, setValue];
}

/**
 * 跨组件同步版 usePersistentState。
 * 同页其他组件改了同一个 key，本组件自动跟进（用 JSON 深比较防循环）。
 */
export function useSyncedPersistentState<T>(
  key: string,
  initialValue: InitialValue<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = usePersistentState<T>(key, initialValue);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (!detail || detail.key !== key) return;
      let fresh: T;
      try {
        const raw = window.localStorage.getItem(key);
        fresh = raw === null
          ? (typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue)
          : JSON.parse(raw) as T;
      } catch { return; }
      setValue((prev) => {
        try {
          return JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh;
        } catch {
          return fresh;
        }
      });
    };
    window.addEventListener('sane333:storage-changed', onChange);
    return () => window.removeEventListener('sane333:storage-changed', onChange);
  }, [key]);

  return [value, setValue];
}

export function readPersistentState<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch (error) {
    reportPersistenceIssue('read:' + key, '本地数据读取或 JSON 解析失败，已使用备用值', error);
    return fallback;
  }
}
