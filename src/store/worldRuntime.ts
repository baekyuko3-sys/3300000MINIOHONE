import type { ImportedCharacter } from '../data/characterImport';
import type { OfflineEvent } from '../types';

const STORAGE_KEY = 'phone:world-runtime-v1';
const MAX_EVENTS = 80;

export type WorldEventType =
  | 'character.message'
  | 'character.moment'
  | 'offline.invite'
  | 'offline.accepted'
  | 'offline.started'
  | 'offline.message'
  | 'offline.completed'
  | 'relationship.changed';

export interface CharacterRuntimeState {
  characterId: string;
  name: string;
  location: string;
  activity: string;
  mood: string;
  lastSeenAt: string;
  lastInteractionAt: string | null;
  unread: number;
  currentScheduleId?: string | null;
  currentScheduleTitle?: string;
  nextActionAt?: string | null;
  nextActionTitle?: string;
  lastAction?: string;
  lastThinkingSummary?: string;
  lastStatusRaw?: string;
}

export interface WorldRuntimeState {
  version: 1;
  updatedAt: string;
  currentScene: string | null;
  characters: Record<string, CharacterRuntimeState>;
  events: Array<{
    id: string;
    type: WorldEventType;
    characterId?: string;
    characterName?: string;
    payload?: Record<string, unknown>;
    createdAt: string;
  }>;
}

function readState(): WorldRuntimeState {
  if (typeof window === 'undefined') return {
    version: 1,
    updatedAt: new Date().toISOString(),
    currentScene: null,
    characters: {},
    events: [],
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WorldRuntimeState;
  } catch {
    // Recover with a clean runtime.
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    currentScene: null,
    characters: {},
    events: [],
  };
}

function writeState(state: WorldRuntimeState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Runtime state is best-effort; existing app data remains authoritative.
  }
}

function ensureCharacter(state: WorldRuntimeState, character: ImportedCharacter | { id: string; name: string }) {
  const existing = state.characters[character.id];
  if (existing) return existing;
  state.characters[character.id] = {
    characterId: character.id,
    name: character.name,
    location: '未知',
    activity: '空闲',
    mood: '平静',
    lastSeenAt: new Date().toISOString(),
    lastInteractionAt: null,
    unread: 0,
    currentScheduleId: null,
    currentScheduleTitle: '',
    nextActionAt: null,
    nextActionTitle: '',
  };
  return state.characters[character.id];
}

export function syncWorldCharacters(characters: ImportedCharacter[]) {
  const state = readState();
  characters.forEach(character => ensureCharacter(state, character));
  state.updatedAt = new Date().toISOString();
  writeState(state);
  return state;
}

export function getWorldRuntime(): WorldRuntimeState {
  return readState();
}

export function removeCharacterRuntime(characterId: string) {
  if (typeof window === 'undefined' || !characterId) return;
  const state = readState();
  delete state.characters[characterId];
  state.events = state.events.filter(event => event.characterId !== characterId);
  state.updatedAt = new Date().toISOString();
  writeState(state);
  window.dispatchEvent(new CustomEvent('sane333:world-state-changed', { detail: state }));
}

export function getWorldUnreadCount(): number {
  return Object.values(readState().characters).reduce((sum, character) => sum + character.unread, 0);
}

export function markCharacterRead(characterId: string) {
  if (typeof window === 'undefined') return;
  const state = readState();
  const character = state.characters[characterId];
  if (!character) return;
  character.unread = 0;
  state.updatedAt = new Date().toISOString();
  writeState(state);
  window.dispatchEvent(new CustomEvent('sane333:world-state-changed', { detail: state }));
}

export function emitWorldEvent(
  type: WorldEventType,
  payload: {
    characterId?: string;
    characterName?: string;
    data?: Record<string, unknown>;
  } = {},
) {
  if (typeof window === 'undefined') return;
  const state = readState();
  const now = new Date().toISOString();
  const id = 'world-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

  if (payload.characterId) {
    const character = ensureCharacter(state, {
      id: payload.characterId,
      name: payload.characterName || payload.characterId,
    });
    character.lastSeenAt = now;
    if (type !== 'relationship.changed') character.lastInteractionAt = now;

    if (type === 'character.message') {
      character.unread += 1;
      character.activity = '刚刚给你发消息';
      character.mood = '想起了你';
    }
    if (type === 'offline.invite') {
      character.activity = '正在准备与你见面';
      character.mood = '期待';
    }
    if (type === 'offline.accepted') {
      character.activity = '已经约好与你见面';
      character.mood = '期待';
    }
    if (type === 'offline.started') {
      character.activity = '正在与你见面';
      character.mood = '专注';
      character.unread = Math.max(0, character.unread - 1);
    }
    if (type === 'offline.message') {
      character.activity = '正在和你保持联系';
      character.mood = '在意';
    }
    if (type === 'offline.completed') {
      character.activity = '刚结束一次见面';
      character.mood = '满足';
    }
  }

  state.events = [
    ...state.events,
    {
      id,
      type,
      characterId: payload.characterId,
      characterName: payload.characterName,
      payload: payload.data,
      createdAt: now,
    },
  ].slice(-MAX_EVENTS);
  state.updatedAt = now;
  writeState(state);

  window.dispatchEvent(new CustomEvent('sane333:world-event', {
    detail: { id, type, characterId: payload.characterId, characterName: payload.characterName, data: payload.data },
  }));

  return id;
}

export function setCharacterRuntime(
  characterId: string,
  patch: Partial<Omit<CharacterRuntimeState, 'characterId' | 'name'>>,
  name?: string,
) {
  if (typeof window === 'undefined') return;
  const state = readState();
  const character = ensureCharacter(state, { id: characterId, name: name || characterId });
  Object.assign(character, patch);
  state.updatedAt = new Date().toISOString();
  writeState(state);
  window.dispatchEvent(new CustomEvent('sane333:world-state-changed', { detail: state }));
}

export function syncCharacterRoutine(
  character: ImportedCharacter,
  schedule: Array<{ id: string; time: string; title: string }>,
  now = new Date(),
) {
  if (typeof window === 'undefined') return;
  const state = readState();
  const runtime = ensureCharacter(state, character);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string) => {
    const match = value.match(/(\\d{1,2}):(\\d{2})/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    return h <= 23 && m <= 59 ? h * 60 + m : null;
  };
  const ordered = schedule
    .map(item => ({ item, minute: parse(item.time) }))
    .filter((x): x is { item: typeof schedule[number]; minute: number } => x.minute !== null)
    .sort((a, b) => a.minute - b.minute);

  if (!ordered.length) return;
  const due = ordered.filter(x => x.minute <= currentMinutes);
  const current = due.length ? due[due.length - 1] : null;
  const next = ordered.find(x => x.minute > currentMinutes) || ordered[0];

  // Recent interaction and an active offline scene take priority over the routine clock.
  // Otherwise the 60s world clock would erase "正在聊天 / 正在见面" almost immediately.
  const recentInteraction = runtime.lastInteractionAt
    ? now.getTime() - new Date(runtime.lastInteractionAt).getTime() < 10 * 60_000
    : false;
  const inScene = Boolean(state.currentScene);

  if (current) {
    runtime.currentScheduleId = current.item.id;
    runtime.currentScheduleTitle = current.item.title;
    if (!recentInteraction && !inScene) {
      runtime.activity = current.item.title;
      runtime.mood = '平静';
    }
  }
  runtime.nextActionAt = next.item.time;
  runtime.nextActionTitle = next.item.title;
  runtime.lastSeenAt = now.toISOString();
  state.updatedAt = now.toISOString();
  writeState(state);
  window.dispatchEvent(new CustomEvent('sane333:world-state-changed', { detail: state }));
}

function runWorldRoutineClock() {
  if (typeof window === 'undefined') return;
  const tick = () => {
    try {
      const raw = window.localStorage.getItem('phone:characters');
      const characters = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(characters) || !characters.length) return;
      const now = new Date();
      characters.forEach((character: ImportedCharacter) => {
        const scheduleRaw = window.localStorage.getItem(`line:schedule:${character.name}`);
        if (!scheduleRaw) return;
        try {
          const schedule = JSON.parse(scheduleRaw);
          if (Array.isArray(schedule)) syncCharacterRoutine(character, schedule, now);
        } catch {
          // One broken schedule must not stop the world clock.
        }
      });
    } catch {
      // Runtime ticking is best-effort.
    }
  };
  tick();
  window.setInterval(tick, 60_000);
}

if (typeof window !== 'undefined') {
  runWorldRoutineClock();
}

export function setCurrentScene(sceneId: string | null) {
  if (typeof window === 'undefined') return;
  const state = readState();
  state.currentScene = sceneId;
  state.updatedAt = new Date().toISOString();
  writeState(state);
  window.dispatchEvent(new CustomEvent('sane333:world-state-changed', { detail: state }));
}

export function syncOfflineEventToWorld(event: OfflineEvent) {
  if (event.status === 'draft' || event.status === 'declined') return null;

  const type: WorldEventType =
    event.status === 'pending' ? 'offline.invite'
      : event.status === 'accepted' ? 'offline.accepted'
      : event.status === 'in-progress' ? 'offline.started'
      : 'offline.completed';

  return emitWorldEvent(type, {
    characterId: event.characterId,
    characterName: event.characterName,
    data: {
      offlineEventId: event.id,
      title: event.title,
      location: event.location,
      time: event.time,
      theme: event.theme,
      status: event.status,
    },
  });
}
