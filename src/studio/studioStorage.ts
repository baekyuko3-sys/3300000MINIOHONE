import { reportPersistenceIssue } from '../store/usePersistentState';
import type { StudioOperationLog, StudioSession, StudioTask } from './studioTypes';

const key = (name: string) => 'studio:' + name;

const blockedKeys = new Set<string>();

function read<T>(name: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const storageKey = key(name);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) { blockedKeys.delete(storageKey); return fallback; }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(fallback) ? !Array.isArray(parsed) : (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error('STUDIO_STORAGE_SCHEMA_INVALID');
    }
    blockedKeys.delete(storageKey);
    return parsed as T;
  } catch (error) {
    blockedKeys.add(storageKey);
    reportPersistenceIssue('read:' + storageKey, '创作工作区数据损坏或格式不符；已锁定写入以保留原始内容', error);
    return fallback;
  }
}

function write<T>(name: string, value: T): boolean {
  if (typeof window === 'undefined') return false;
  const storageKey = key(name);
  if (blockedKeys.has(storageKey)) return false;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(value) ? !Array.isArray(parsed) : (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
        throw new Error('STUDIO_STORAGE_SCHEMA_INVALID');
      }
    }
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(storageKey, serialized);
    if (window.localStorage.getItem(storageKey) !== serialized) throw new Error('STUDIO_STORAGE_WRITE_VERIFY_FAILED');
    return true;
  } catch (error) {
    blockedKeys.add(storageKey);
    reportPersistenceIssue('write:' + storageKey, '创作工作区数据写入失败；原始记录已保留', error);
    return false;
  }
}

export const studioStorage = {
  sessions: () => read<StudioSession[]>('sessions', []),
  saveSessions: (value: StudioSession[]) => write('sessions', value.slice(0, 30)),
  tasks: () => read<StudioTask[]>('tasks', []),
  saveTasks: (value: StudioTask[]) => write('tasks', value.slice(0, 50)),
  logs: () => read<StudioOperationLog[]>('logs', []),
  addLog: (value: StudioOperationLog) => write('logs', [value, ...read<StudioOperationLog[]>('logs', [])].slice(0, 200)),
};
