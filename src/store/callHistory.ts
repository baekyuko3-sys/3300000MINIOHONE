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

function readAll(): CallRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(records: CallRecord[]) {
  try {
    // 只保留最近 100 条
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, 100)));
  } catch {}
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
  writeAll([]);
  window.dispatchEvent(new Event('sane333:call-history-changed'));
}

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `00:${s.toString().padStart(2, '0')}`;
}
