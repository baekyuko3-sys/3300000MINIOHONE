import type { OfflineEvent } from '../types';
import { syncOfflineEventToWorld } from './worldRuntime';
import { addRecentMemorySummary } from './characterMemory';
import { reportPersistenceIssue } from './usePersistentState';

const STORAGE_KEY = 'phone:offline-events';

let offlineEventsWriteBlocked = false;

function read(): OfflineEvent[] {
  offlineEventsWriteBlocked = false;
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('OFFLINE_EVENTS_SCHEMA_INVALID');
    return parsed as OfflineEvent[];
  } catch (error) {
    offlineEventsWriteBlocked = true;
    reportPersistenceIssue('read:' + STORAGE_KEY, '线下剧情数据损坏或格式不符；已停止写入以保留原始数据', error);
    return [];
  }
}

function write(events: OfflineEvent[]): boolean {
  if (typeof window === 'undefined' || offlineEventsWriteBlocked) return false;
  try {
    const serialized = JSON.stringify(events);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    if (window.localStorage.getItem(STORAGE_KEY) !== serialized) throw new Error('OFFLINE_EVENTS_WRITE_VERIFY_FAILED');
    return true;
  } catch (error) {
    reportPersistenceIssue('write:' + STORAGE_KEY, '线下剧情数据写入失败；原始数据已保留', error);
    return false;
  }
}

export function upsertOfflineEvent(event: OfflineEvent): OfflineEvent {
  const events = read();
  const index = events.findIndex(item => item.id === event.id);
  const next = index >= 0
    ? events.map(item => item.id === event.id ? { ...item, ...event } : item)
    : [event, ...events];
  if (!write(next)) throw new Error('OFFLINE_EVENT_PERSIST_FAILED');
  if (index < 0 || events[index]?.status !== event.status) syncOfflineEventToWorld(event);
  return event;
}

export function updateOfflineEvent(
  id: string,
  patch: Partial<OfflineEvent>,
): OfflineEvent | null {
  const events = read();
  const current = events.find(item => item.id === id);
  if (!current) return null;
  const nextEvent = { ...current, ...patch };
  if (!write(events.map(item => item.id === id ? nextEvent : item))) return null;
  if (current.status !== nextEvent.status) syncOfflineEventToWorld(nextEvent);
  if (nextEvent.status === 'completed' && current.status !== 'completed') {
    const summary = [
      nextEvent.title,
      nextEvent.location ? '地点：' + nextEvent.location : '',
      nextEvent.time ? '时间：' + nextEvent.time : '',
      nextEvent.theme ? '主题：' + nextEvent.theme : '',
      nextEvent.letter ? '邀约内容：' + nextEvent.letter.slice(0, 280) : '',
    ].filter(Boolean).join(' · ');
    if (summary) {
      addRecentMemorySummary(
        nextEvent.characterId,
        nextEvent.characterName,
        '线下剧情完成：' + summary,
        { source: 'offline', importance: 85, personaId: nextEvent.personaId },
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sane333:memory-updated', {
          detail: { characterId: nextEvent.characterId, personaId: nextEvent.personaId, source: 'offline-story' },
        }));
      }
    }
  }
  return nextEvent;
}

export function deleteOfflineEvent(id: string): boolean {
  return write(read().filter(item => item.id !== id));
}

export function getOfflineEvents(): OfflineEvent[] {
  return read();
}

export function removeCharacterOfflineEvents(characterId: string): boolean {
  if (!characterId) return false;
  return write(read().filter(event => event.characterId !== characterId));
}
