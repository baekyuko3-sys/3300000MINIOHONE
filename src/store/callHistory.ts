import { reportPersistenceIssue } from './usePersistentState';
/**
 * 通话记录 store
 * 每次通话结束自动保存，含字幕 transcript，可回放查看
 */

export interface CallTranscriptLine {
  role: 'ai' | 'me' | 'action';
  text: string;
  time?: string;
}

export interface CallRecord {
  id: string;
  type: 'voice' | 'video';
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  duration: number; // 秒
  timestamp: string; // ISO
  transcript: CallTranscriptLine[];
}

const KEY = 'line:call-history';

let callHistoryWriteBlocked = false;

function readAll(): CallRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) { callHistoryWriteBlocked = false; return []; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('CALL_HISTORY_SCHEMA_INVALID');
    callHistoryWriteBlocked = false;
    return parsed;
  } catch (error) {
    callHistoryWriteBlocked = true;
    reportPersistenceIssue('read:' + KEY, '通话记录损坏或格式不符；已锁定写入以保留原始通话记录', error);
    return [];
  }
}

function writeAll(records: CallRecord[]): boolean {
  if (typeof window === 'undefined' || callHistoryWriteBlocked) return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null && !Array.isArray(JSON.parse(raw))) throw new Error('CALL_HISTORY_SCHEMA_INVALID');
    const serialized = JSON.stringify(records.slice(0, 100));
    window.localStorage.setItem(KEY, serialized);
    if (window.localStorage.getItem(KEY) !== serialized) throw new Error('CALL_HISTORY_WRITE_VERIFY_FAILED');
    return true;
  } catch (error) {
    callHistoryWriteBlocked = true;
    reportPersistenceIssue('write:' + KEY, '通话记录保存失败；原始记录已保留', error);
    return false;
  }
}

export function saveCallRecord(input: Omit<CallRecord, 'id' | 'timestamp'> & { timestamp?: string }): CallRecord {
  const record: CallRecord = {
    id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: input.timestamp || new Date().toISOString(),
    ...input,
  };
  const all = readAll();
  all.unshift(record);
  writeAll(all);
  window.dispatchEvent(new Event('sane333:call-history-changed'));
  return record;
}

export function getCallHistory(): CallRecord[] {
  return readAll();
}

export function getCallHistoryFor(characterId: string): CallRecord[] {
  return readAll().filter(r => r.characterId === characterId);
}

export function deleteCallRecord(id: string) {
  writeAll(readAll().filter(r => r.id !== id));
  window.dispatchEvent(new Event('sane333:call-history-changed'));
}

export function clearCallHistory() {
  // Explicit user-requested clearing is allowed even when the stored history is corrupt.
  callHistoryWriteBlocked = false;
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('sane333:call-history-changed'));
}

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `00:${s.toString().padStart(2, '0')}`;
}
