import type { StudioOperationLog, StudioSession, StudioTask } from './studioTypes';

const key = (name: string) => 'studio:' + name;

function read<T>(name: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(name: string, value: T) {
  if (typeof window !== 'undefined') localStorage.setItem(key(name), JSON.stringify(value));
}

export const studioStorage = {
  sessions: () => read<StudioSession[]>('sessions', []),
  saveSessions: (value: StudioSession[]) => write('sessions', value.slice(0, 30)),
  tasks: () => read<StudioTask[]>('tasks', []),
  saveTasks: (value: StudioTask[]) => write('tasks', value.slice(0, 50)),
  logs: () => read<StudioOperationLog[]>('logs', []),
  addLog: (value: StudioOperationLog) => write('logs', [value, ...read<StudioOperationLog[]>('logs', [])].slice(0, 200)),
};
