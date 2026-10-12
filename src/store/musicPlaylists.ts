import type { MusicTrack } from './music';
import { pickTrackColors } from './musicListenHistory';

/** 我创建的 / 从角色收藏来的歌单 */
export interface UserPlaylist {
  id: string;
  name: string;
  description: string;
  /** m = 我创建的，c = 收藏角色的 */
  kind: 'm' | 'c';
  fromCharacter?: string;
  characterId?: string;
  tracks: MusicTrack[];
  colors: [string, string, string];
  updatedAt: string;
  profileId?: string;
}

export interface CharPlaylistSong {
  id: string;
  name: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
  colors: [string, string, string];
}

export interface CharPlaylistCard {
  name: string;
  blurb: string;
  locked?: boolean;
  colors: [string, string, string];
  tracks: CharPlaylistSong[];
}

/** 角色一次「生成」的结果 */
export interface CharPlaylistBatch {
  at: number;
  sig: string;
  playlists: CharPlaylistCard[];
}

export interface CharPlaylistArchive {
  characterId: string;
  characterName: string;
  batches: CharPlaylistBatch[];
  summary: string;
}

const USER_KEY = 'phone:music-user-playlists';
const CHAR_GEN_KEY = 'phone:music-char-playlist-gens';
const COLLECTED_KEY = 'phone:music-char-playlist-collected';
/** 听角色歌单时是否让角色在 LINE 私聊里知道 */
const CHAR_NOTIFY_KEY = 'phone:music-char-playlist-notify';
/** 每个歌单最近一次已通知时间，防刷屏 */
const CHAR_NOTIFIED_AT_KEY = 'phone:music-char-playlist-notified-at';
/** 一起听时角色是否可按人设自主收藏当前歌 */
const CHAR_AUTO_COLLECT_KEY = 'phone:music-char-together-auto-collect';
const MAX_BATCHES = 3;
/** 同一张角色歌单多久内最多提醒一次 */
const NOTIFY_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const FALLBACK_COLORS: Array<[string, string, string]> = [
  ['#9dbcae', '#dcb3ae', '#eee8df'],
  ['#9fb8d4', '#e3bfd6', '#efe7e1'],
  ['#8ea3c0', '#efd5ae', '#dde3ea'],
  ['#f0c48f', '#cfb0d4', '#f6eddf'],
  ['#cdb5da', '#a6cdd0', '#f3ecea'],
  ['#e8b7b0', '#a9c2ae', '#f4e9dc'],
  ['#a6d8bb', '#f7d3b8', '#f6f0e6'],
  ['#dda7a1', '#ebddc6', '#f1eae1'],
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown, event: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(event));
}

export function getUserPlaylists(profileId?: string): UserPlaylist[] {
  const all = readJson<UserPlaylist[]>(USER_KEY, []);
  if (!Array.isArray(all)) return [];
  if (!profileId) return all;
  return all.filter((item) => !item.profileId || item.profileId === profileId);
}

export function saveUserPlaylists(list: UserPlaylist[]) {
  writeJson(USER_KEY, list.slice(0, 80), 'sane333:music-user-playlists-changed');
}

export function createUserPlaylist(input: {
  name: string;
  description?: string;
  profileId?: string;
  tracks?: MusicTrack[];
}): UserPlaylist {
  const colors = FALLBACK_COLORS[Math.floor(Math.random() * FALLBACK_COLORS.length)];
  const playlist: UserPlaylist = {
    id: 'upl-' + Date.now().toString(36),
    name: input.name.slice(0, 24),
    description: (input.description || '刚刚创建').slice(0, 60),
    kind: 'm',
    tracks: input.tracks || [],
    colors,
    updatedAt: new Date().toISOString(),
    profileId: input.profileId,
  };
  saveUserPlaylists([playlist, ...getUserPlaylists()]);
  return playlist;
}

export function collectCharacterPlaylist(input: {
  name: string;
  description: string;
  characterName: string;
  characterId: string;
  tracks: MusicTrack[];
  profileId?: string;
  collectKey: string;
}): UserPlaylist {
  const existing = getUserPlaylists().find(
    (item) => item.kind === 'c' && item.characterId === input.characterId && item.name === input.name,
  );
  if (existing) {
    markCollected(input.collectKey, true);
    return existing;
  }
  const colors =
    input.tracks[0] ? pickTrackColors(input.tracks[0].id || input.tracks[0].name) : FALLBACK_COLORS[0];
  const playlist: UserPlaylist = {
    id: 'upl-c-' + Date.now().toString(36),
    name: input.name.slice(0, 24),
    description: input.description.slice(0, 60) || `收藏自 ${input.characterName}`,
    kind: 'c',
    fromCharacter: input.characterName,
    characterId: input.characterId,
    tracks: input.tracks,
    colors,
    updatedAt: new Date().toISOString(),
    profileId: input.profileId,
  };
  saveUserPlaylists([playlist, ...getUserPlaylists()]);
  markCollected(input.collectKey, true);
  return playlist;
}

export function uncollectCharacterPlaylist(collectKey: string, characterId: string, name: string) {
  const next = getUserPlaylists().filter(
    (item) => !(item.kind === 'c' && item.characterId === characterId && item.name === name),
  );
  saveUserPlaylists(next);
  markCollected(collectKey, false);
}

export function getCollectedKeys(): string[] {
  const map = readJson<Record<string, 1>>(COLLECTED_KEY, {});
  return Object.keys(map || {});
}

function markCollected(key: string, on: boolean) {
  const map = readJson<Record<string, 1>>(COLLECTED_KEY, {});
  if (on) map[key] = 1;
  else delete map[key];
  writeJson(COLLECTED_KEY, map, 'sane333:music-user-playlists-changed');
}

export function getCharPlaylistArchives(): Record<string, CharPlaylistArchive> {
  const raw = readJson<Record<string, CharPlaylistArchive>>(CHAR_GEN_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

export function saveCharPlaylistArchives(map: Record<string, CharPlaylistArchive>) {
  writeJson(CHAR_GEN_KEY, map, 'sane333:music-char-playlists-changed');
}

export function getCharArchive(characterId: string): CharPlaylistArchive | null {
  return getCharPlaylistArchives()[characterId] || null;
}

export function upsertCharBatch(
  characterId: string,
  characterName: string,
  batch: CharPlaylistBatch,
  mode?: 'sum' | 'del',
): CharPlaylistArchive {
  const all = getCharPlaylistArchives();
  const prev = all[characterId] || {
    characterId,
    characterName,
    batches: [],
    summary: '',
  };
  let batches = [...prev.batches];
  let summary = prev.summary || '';
  if (batches.length >= MAX_BATCHES) {
    const oldest = batches[batches.length - 1];
    if (mode === 'sum' && oldest) {
      const names = oldest.playlists
        .filter((p) => !p.locked)
        .slice(0, 3)
        .map((p) => p.name)
        .join('」「');
      const line = `${formatBatchTime(oldest.at)}：歌单有「${names}」`;
      summary = [summary, line].filter(Boolean).join('\n').split('\n').slice(-3).join('\n');
    }
    batches = batches.slice(0, MAX_BATCHES - 1);
  }
  const next: CharPlaylistArchive = {
    characterId,
    characterName,
    batches: [batch, ...batches].slice(0, MAX_BATCHES),
    summary,
  };
  all[characterId] = next;
  saveCharPlaylistArchives(all);
  return next;
}

export function deleteCharBatch(characterId: string, index: number) {
  const all = getCharPlaylistArchives();
  const prev = all[characterId];
  if (!prev) return;
  const batches = prev.batches.filter((_, i) => i !== index);
  all[characterId] = { ...prev, batches };
  saveCharPlaylistArchives(all);
}

export function clearCharArchives() {
  saveCharPlaylistArchives({});
  writeJson(COLLECTED_KEY, {}, 'sane333:music-user-playlists-changed');
}

export function clearCharSummary(characterId: string) {
  const all = getCharPlaylistArchives();
  if (!all[characterId]) return;
  all[characterId] = { ...all[characterId], summary: '' };
  saveCharPlaylistArchives(all);
}

export function formatBatchTime(at: number): string {
  const d = new Date(at);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function trackToSong(track: MusicTrack): CharPlaylistSong {
  return {
    id: track.id,
    name: track.name,
    artist: track.artist,
    album: track.album,
    cover: track.cover,
    duration: track.duration,
    colors: pickTrackColors(track.id || track.name),
  };
}

export function songToTrack(song: CharPlaylistSong): MusicTrack {
  return {
    id: song.id,
    name: song.name,
    artist: song.artist,
    album: song.album || '',
    cover: song.cover || '',
    duration: song.duration || 0,
    playUrl: '',
    source: 'netease',
  };
}

export function paletteColor(index: number): [string, string, string] {
  return FALLBACK_COLORS[Math.abs(index) % FALLBACK_COLORS.length];
}

export const CHAR_PLAYLIST_MAX_BATCHES = MAX_BATCHES;

/** 默认关闭：听角色歌单时不主动私聊 */
export function getCharPlaylistNotifyEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CHAR_NOTIFY_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCharPlaylistNotifyEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAR_NOTIFY_KEY, on ? '1' : '0');
    window.dispatchEvent(new CustomEvent('sane333:music-charpl-settings-changed'));
  } catch {
    /* ignore */
  }
}

/** 这张歌单现在能不能再提醒一次（冷却内返回 false） */
export function canNotifyCharPlaylistListen(playlistKey: string): boolean {
  const key = String(playlistKey || '').trim();
  if (!key || !getCharPlaylistNotifyEnabled()) return false;
  const map = readJson<Record<string, number>>(CHAR_NOTIFIED_AT_KEY, {});
  const last = Number(map[key] || 0);
  if (last && Date.now() - last < NOTIFY_COOLDOWN_MS) return false;
  return true;
}

export function markCharPlaylistListenNotified(playlistKey: string): void {
  const key = String(playlistKey || '').trim();
  if (!key || typeof window === 'undefined') return;
  const map = readJson<Record<string, number>>(CHAR_NOTIFIED_AT_KEY, {});
  map[key] = Date.now();
  // 只留最近 40 条，避免无限涨
  const entries = Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 40);
  writeJson(CHAR_NOTIFIED_AT_KEY, Object.fromEntries(entries), 'sane333:music-charpl-settings-changed');
}

/** 默认关闭：一起听时角色不会自己收藏 */
export function getCharTogetherAutoCollectEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CHAR_AUTO_COLLECT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCharTogetherAutoCollectEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAR_AUTO_COLLECT_KEY, on ? '1' : '0');
    window.dispatchEvent(new CustomEvent('sane333:music-charpl-settings-changed'));
  } catch {
    /* ignore */
  }
}
