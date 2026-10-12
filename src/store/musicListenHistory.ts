export type ListenHistoryKind = 'f' | 's' | 'n';

export interface MusicListenRecord {
  id: string;
  at: string;
  groupLabel: string;
  timeLabel: string;
  kind: ListenHistoryKind;
  name: string;
  variant: string;
  hue: number;
  song: string;
  artist: string;
  minutes: number;
  note: string;
  keep: boolean;
  colors: [string, string, string];
  /** 专辑封面 URL（勿存 data:，省 localStorage） */
  cover?: string;
  trackId?: string;
  /** 同一场里这首歌听了几次（同曲不重复占行） */
  plays?: number;
  /** 一起听绑定的角色卡 id（匿名模式也必须写，供记忆/档案关联） */
  characterId?: string;
  /** 陌生人/匿名对外展示的音乐 ID */
  musicId?: string;
  /** 是否匿名一起听 */
  anonymous?: boolean;
  sessionId?: string;
  /** music ID / profile that owns this memory */
  profileId?: string;
}

const HISTORY_KEY = 'phone:music-listen-history';

/** 同曲去重键：优先 trackId，否则歌名+歌手 */
export function listenSongKey(record: {
  trackId?: string;
  song?: string;
  artist?: string;
}): string {
  const id = String(record.trackId || '').trim();
  if (id) return `id:${id}`;
  return (
    'name:'
    + String(record.song || '').trim().toLowerCase()
    + '|'
    + String(record.artist || '').trim().toLowerCase()
  );
}

/** 只保留 http(s) 专辑图，拒绝 data: 撑爆存储 */
export function safeAlbumCover(url?: string): string {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^data:/i.test(u)) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('/')) return u;
  return '';
}

function mergeSameSongs(items: MusicListenRecord[]): MusicListenRecord[] {
  const map = new Map<string, MusicListenRecord>();
  const ordered = [...items].sort(
    (a, b) => Date.parse(a.at || '') - Date.parse(b.at || ''),
  );
  for (const item of ordered) {
    const key = listenSongKey(item);
    if (!key || key === 'name:|' ) {
      map.set(`row:${item.id}`, { ...item, plays: Math.max(1, item.plays || 1) });
      continue;
    }
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...item, plays: Math.max(1, item.plays || 1) });
      continue;
    }
    map.set(key, {
      ...prev,
      ...item,
      id: prev.id,
      plays: Math.max(1, prev.plays || 1) + Math.max(1, item.plays || 1),
      keep: Boolean(prev.keep || item.keep),
      cover: safeAlbumCover(item.cover) || safeAlbumCover(prev.cover) || '',
      trackId: item.trackId || prev.trackId,
      characterId: item.characterId || prev.characterId,
      musicId: item.musicId || prev.musicId,
      minutes: Math.max(prev.minutes || 1, item.minutes || 1),
      at: item.at || prev.at,
      timeLabel: item.timeLabel || prev.timeLabel,
      groupLabel: item.groupLabel || prev.groupLabel,
    });
  }
  return Array.from(map.values()).sort(
    (a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''),
  );
}

/** 同一场内同曲合并；清理历史重复行 */
function consolidateRaw(records: MusicListenRecord[]): MusicListenRecord[] {
  const bySession = new Map<string, MusicListenRecord[]>();
  for (const record of records) {
    const key = String(record.sessionId || record.id);
    const list = bySession.get(key);
    if (list) list.push(record);
    else bySession.set(key, [record]);
  }
  const next: MusicListenRecord[] = [];
  for (const items of bySession.values()) {
    next.push(...mergeSameSongs(items));
  }
  return next
    .sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''))
    .slice(0, 200);
}

function readRaw(): MusicListenRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const cleaned = consolidateRaw(parsed as MusicListenRecord[]);
    if (cleaned.length !== parsed.length) {
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(cleaned));
      } catch {
        /* ignore quota */
      }
    }
    return cleaned;
  } catch {
    return [];
  }
}

function writeRaw(records: MusicListenRecord[]) {
  if (typeof window === 'undefined') return;
  const cleaned = consolidateRaw(records).map((item) => ({
    ...item,
    cover: safeAlbumCover(item.cover),
    plays: Math.max(1, item.plays || 1),
  }));
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(cleaned.slice(0, 200)));
  window.dispatchEvent(new CustomEvent('sane333:music-history-changed'));
}

export function getMusicListenHistory(profileId?: string): MusicListenRecord[] {
  const all = readRaw();
  if (!profileId) return all;
  return all.filter((item) => !item.profileId || item.profileId === profileId);
}

export function saveMusicListenHistory(records: MusicListenRecord[]) {
  writeRaw(records);
}

export function appendMusicListenRecord(record: MusicListenRecord) {
  const next = [record, ...readRaw().filter((item) => item.id !== record.id)];
  writeRaw(next);
  return next;
}

export function updateMusicListenRecord(
  id: string,
  patch: Partial<MusicListenRecord>,
): MusicListenRecord[] {
  const next = readRaw().map((item) => (item.id === id ? { ...item, ...patch } : item));
  writeRaw(next);
  return next;
}

export function toggleMusicListenKeep(id: string): MusicListenRecord[] {
  const next = readRaw().map((item) =>
    item.id === id ? { ...item, keep: !item.keep } : item,
  );
  writeRaw(next);
  return next;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function formatListenGroupLabel(date = new Date()): string {
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday =
    date.getFullYear() === y.getFullYear() &&
    date.getMonth() === y.getMonth() &&
    date.getDate() === y.getDate();
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  const wd = WEEKDAYS[date.getDay()];
  if (sameDay) return `${md} · ${wd} · 今天`;
  if (yesterday) return `${md} · ${wd} · 昨天`;
  return `${md} · ${wd}`;
}

export function formatListenTimeLabel(date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const COLOR_SETS: Array<[string, string, string]> = [
  ['#9dbcae', '#dcb3ae', '#eee8df'],
  ['#e8b7b0', '#a9c2ae', '#f4e9dc'],
  ['#9fb8d4', '#e3bfd6', '#efe7e1'],
  ['#c1a283', '#8f9f8a', '#f0e8df'],
  ['#a592dc', '#e8b7b0', '#efe7e1'],
  ['#a6d8bb', '#f7d3b8', '#f6f0e6'],
  ['#f0c48f', '#cfb0d4', '#f6eddf'],
  ['#cdb5da', '#a6cdd0', '#f3ecea'],
];

export function pickTrackColors(seed: string): [string, string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COLOR_SETS[hash % COLOR_SETS.length];
}

export function pickHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** 同一场一起听（同 sessionId）合并成一条；场内同曲已去重 */
export interface MusicListenSessionGroup {
  key: string;
  primary: MusicListenRecord;
  items: MusicListenRecord[];
  /** 不重复曲目数 */
  count: number;
  keep: boolean;
}

export function groupListenHistoryBySession(
  records: MusicListenRecord[],
): MusicListenSessionGroup[] {
  const map = new Map<string, MusicListenRecord[]>();
  for (const record of records) {
    const key = String(record.sessionId || record.id);
    const list = map.get(key);
    if (list) list.push(record);
    else map.set(key, [record]);
  }
  return Array.from(map.entries())
    .map(([key, items]) => {
      const sorted = mergeSameSongs(items);
      return {
        key,
        primary: sorted[0],
        items: sorted,
        count: sorted.length,
        keep: sorted.some((item) => item.keep),
      };
    })
    .sort((a, b) => Date.parse(b.primary.at || '') - Date.parse(a.primary.at || ''));
}
