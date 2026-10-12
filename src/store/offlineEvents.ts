import type { OfflineEvent } from '../types';
import { syncOfflineEventToWorld } from './worldRuntime';
import { addRecentMemorySummary } from './characterMemory';

const STORAGE_KEY = 'phone:offline-events';

function read(): OfflineEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineEvent[]) : [];
  } catch {
    return [];
  }
}

function write(events: OfflineEvent[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Keep the UI usable when storage is unavailable.
  }
}

export function upsertOfflineEvent(event: OfflineEvent): OfflineEvent {
  const events = read();
  const index = events.findIndex(item => item.id === event.id);
  const next = index >= 0
    ? events.map(item => item.id === event.id ? { ...item, ...event } : item)
    : [event, ...events];
  write(next);
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
  write(events.map(item => item.id === id ? nextEvent : item));
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
        { source: 'offline', importance: 85 },
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sane333:memory-updated', {
          detail: { characterId: nextEvent.characterId, source: 'offline-story' },
        }));
      }
    }
  }
  return nextEvent;
}

export function deleteOfflineEvent(id: string) {
  write(read().filter(item => item.id !== id));
}

export function getOfflineEvents(): OfflineEvent[] {
  return read();
}

export function removeCharacterOfflineEvents(characterId: string) {
  if (!characterId) return;
  write(read().filter(event => event.characterId !== characterId));
}
