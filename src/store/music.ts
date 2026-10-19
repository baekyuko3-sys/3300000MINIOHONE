export interface MusicLyricLine {
  time: number; // seconds
  text: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  playUrl: string;
  source: 'netease' | 'custom';
  raw?: unknown;
  /** 时间轴歌词，结构由 parseLrc 解析。 */
  lyrics?: MusicLyricLine[];
}

/** 解析 LRC 文本 → [{ time, text }] 数组，按时间升序。 */
export function parseLrc(input: string | null | undefined): MusicLyricLine[] {
  if (!input) return [];
  const out: MusicLyricLine[] = [];
  const lines = String(input).split(/\r?\n/);
  // 支持一句多时间标签：[00:01.20][00:30.20]歌词
  const tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lines) {
    const matches = [...line.matchAll(tagRe)];
    if (!matches.length) continue;
    // 跳过 [ti:…] [ar:…] [al:…] 等元信息
    if (/\[(ti|ar|al|by|offset|length):/i.test(line)) continue;
    const text = line.replace(tagRe, '').trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10) || 0;
      const sec = parseInt(m[2], 10) || 0;
      const raw = m[3] ?? '0';
      const frac = parseInt(raw.padEnd(3, '0').slice(0, 3), 10) || 0;
      const time = min * 60 + sec + frac / 1000;
      if (text) out.push({ time, text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export interface MusicApiSettings {
  enabled: boolean;
  provider: 'netease' | 'custom';
  baseUrl: string;
  searchPath: string;
  songPath: string;
  playlistPath: string;
  urlPath: string;
  lyricPath: string;
  checkPath: string;
  searchParam: 'keyword' | 'keywords';
}

export interface CharacterPlaylist {
  characterId: string;
  characterName: string;
  variantLabel?: string;
  name: string;
  description: string;
  tracks: MusicTrack[];
  updatedAt: string;
}

export interface MusicStrangerSession {
  id: string;
  mode: 'direct' | 'stranger';
  characterId: string;
  characterName: string;
  variantLabel?: string;
  /** 陌生人模式对外展示的音乐 ID（不是角色真名） */
  musicId?: string;
  /** 陌生人匿名听歌：界面只显示「匿名」 */
  anonymous?: boolean;
  /** 允许角色从可搜索曲库自由切歌 */
  allowCharRandomSong?: boolean;
  /**
   * 切歌节奏（开启自由切歌时生效）
   * rare: 约 10～20 分钟 · occasional: 约 5～10 分钟 · songend: 只在当前歌放完再切
   */
  charRandomPace?: 'rare' | 'occasional' | 'songend';
  track: MusicTrack;
  status: 'listening' | 'paused' | 'ended';
  reactionLog: Array<{ trackId: string; text: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

const CHAR_MUSIC_ID_KEY = 'phone:music-character-ids';
const MUSIC_ID_POOL = [
  '雾弦', '夜听', '潮声', '星轨', '青瓷', '南巷', '北岛', '月痕',
  '听风', '默片', '浅唱', '晚星', '白噪音', '灰鸽', '薄暮', '栖音',
  '冷感', '回声', '纸飞机', '蓝调', '橘盏', '山海', '软刺', '未命名',
];

function readCharacterMusicIdMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHAR_MUSIC_ID_KEY) || '{}');
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {
    /* ignore */
  }
  return {};
}

function writeCharacterMusicIdMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAR_MUSIC_ID_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** 规范化音乐 ID：去掉空白，最长 8 字 */
export function normalizeMusicId(value: string, fallback = '听众'): string {
  const cleaned = String(value || '')
    .replace(/[\r\n\t]/g, '')
    .replace(/\s+/g, '')
    .replace(/^['"「」《》]+|['"「」《》]+$/g, '')
    .slice(0, 8)
    .trim();
  return cleaned || fallback.slice(0, 8);
}

/** 手动或角色自选后写入稳定音乐 ID（按角色卡 id 持久化） */
export function setCharacterMusicId(characterId: string, musicId: string, fallbackName = ''): string {
  const id = String(characterId || '').trim();
  const next = normalizeMusicId(musicId, fallbackName || '听众');
  if (!id || typeof window === 'undefined') return next;
  const map = readCharacterMusicIdMap();
  map[id] = next;
  writeCharacterMusicIdMap(map);
  return next;
}

/** 角色在陌生人听歌里的稳定音乐 ID（非真名） */
export function getCharacterMusicId(characterId: string, fallbackName = ''): string {
  const id = String(characterId || '').trim();
  if (typeof window === 'undefined') return normalizeMusicId(fallbackName || '听众');
  const map = readCharacterMusicIdMap();
  if (id && map[id]) return normalizeMusicId(String(map[id]), fallbackName || '听众');
  let hash = 0;
  const seed = id || fallbackName || 'x';
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  const generated = MUSIC_ID_POOL[hash % MUSIC_ID_POOL.length];
  if (id) {
    map[id] = generated;
    writeCharacterMusicIdMap(map);
  }
  return generated;
}

/** 陌生人模式对外显示名：永远是音乐 ID（不是角色真名） */
export function strangerDisplayName(session: MusicStrangerSession | null | undefined): string {
  if (!session) return 'TA';
  if (session.mode !== 'stranger') return session.characterName || 'TA';
  return session.musicId || getCharacterMusicId(session.characterId, session.characterName) || '听众';
}

export function sessionAllowsCharRandom(session: MusicStrangerSession | null | undefined): boolean {
  if (!session || session.status === 'ended') return false;
  if (typeof session.allowCharRandomSong === 'boolean') return session.allowCharRandomSong;
  // 兼容旧会话：熟人 / 陌生人都默认允许自由切歌
  return true;
}

export type CharRandomPace = 'rare' | 'occasional' | 'songend';

export function sessionCharRandomPace(session: MusicStrangerSession | null | undefined): CharRandomPace {
  const pace = session?.charRandomPace;
  if (pace === 'rare' || pace === 'occasional' || pace === 'songend') return pace;
  return 'rare';
}

/** 定时切歌间隔；songend 返回 0 表示不走定时器 */
export function charRandomDelayMs(pace: CharRandomPace): number {
  if (pace === 'songend') return 0;
  if (pace === 'occasional') return 5 * 60_000 + Math.floor(Math.random() * 5 * 60_000);
  // rare：10～20 分钟，避免刚开场就连切
  return 10 * 60_000 + Math.floor(Math.random() * 10 * 60_000);
}

/** 默认配置：适配 https://api-enhanced-nine-mu.vercel.app/ 网易云 Enhanced API。
 *  该接口的搜索结果是「简化结构」（artists / album / duration），
 *  而 /song/detail 是「完整结构」（ar / al / dt）。代码内部需兼容两种。
 */
export const DEFAULT_MUSIC_API_SETTINGS: MusicApiSettings = {
  enabled: true,
  provider: 'netease',
  baseUrl: 'https://api-enhanced-nine-mu.vercel.app',
  searchPath: '/search',
  songPath: '/song/detail', // 详情接口（包含完整 ar/al/dt + picUrl）
  playlistPath: '/playlist/detail',
  urlPath: '/song/url',
  lyricPath: '/lyric',
  checkPath: '/check/music',
  searchParam: 'keywords',
};

const MUSIC_SETTINGS_KEY = 'phone:music-api-settings';
const MUSIC_CURRENT_KEY = 'phone:music-current';
const MUSIC_COOKIE_KEY = 'phone:music-cookie';
const MUSIC_CHARACTER_PLAYLISTS_KEY = 'phone:music-character-playlists';
const MUSIC_STRANGER_KEY = 'phone:music-stranger-session';
const MUSIC_LIKED_TRACKS_KEY = 'phone:music-liked-tracks';
const MUSIC_THEME_KEY = 'phone:music-theme';

/** 网易云登录凭证。只需要 MUSIC_U 这一项就能调用大部分需要登录的接口。 */
export interface MusicCookie {
  /** 通常是 "MUSIC_U=xxxxx"；也可能是多个字段连拼 */
  raw: string;
  /** 仅 MUSIC_U 的值，方便显示/部分接口直接用 */
  musicU: string;
  /** 登录返回的昵称（可选） */
  nickname?: string;
  /** 登录返回的 uid（可选） */
  uid?: number;
  /** 登录时间（毫秒） */
  loggedAt: number;
}

export function readMusicCookie(): MusicCookie | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_COOKIE_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && parsed.raw) return parsed as MusicCookie;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveMusicCookie(cookie: MusicCookie | null): void {
  if (typeof window === 'undefined') return;
  if (cookie) {
    window.localStorage.setItem(MUSIC_COOKIE_KEY, JSON.stringify(cookie));
  } else {
    window.localStorage.removeItem(MUSIC_COOKIE_KEY);
    clearCachedCloudPlaylists();
  }
  window.dispatchEvent(new CustomEvent('sane333:music-cookie-changed'));
}

/** 从 cookie 字符串里提取 MUSIC_U 的值（兼容 "MUSIC_U=abc; foo=bar" 这种连拼形式） */
export function extractMusicU(cookie: string): string {
  const m = /(?:^|;\s*)MUSIC_U=([^;]+)/.exec(cookie);
  return m ? m[1].trim() : '';
}

export type MusicTheme = { bg: string; acc: string };

export function readMusicTheme(): MusicTheme {
  if (typeof window === 'undefined') return { bg: '#ffffff', acc: '#c4989a' };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_THEME_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && parsed.bg && parsed.acc) {
      return { bg: String(parsed.bg), acc: String(parsed.acc) };
    }
  } catch {
    /* ignore */
  }
  // Migrate old MusicScreenView appearance keys.
  const legacyBg = window.localStorage.getItem('phone:music-background-v1');
  const legacyAcc = window.localStorage.getItem('phone:music-accent-v1');
  if (legacyBg || legacyAcc) {
    const migrated = {
      bg: legacyBg || '#ffffff',
      acc: legacyAcc || '#c4989a',
    };
    saveMusicTheme(migrated);
    return migrated;
  }
  return { bg: '#ffffff', acc: '#c4989a' };
}

export function saveMusicTheme(theme: MusicTheme): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUSIC_THEME_KEY, JSON.stringify(theme));
  window.dispatchEvent(new CustomEvent('sane333:music-theme-changed'));
}

export function getLikedTracks(): MusicTrack[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_LIKED_TRACKS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id) : [];
  } catch {
    return [];
  }
}

export function saveLikedTracks(tracks: MusicTrack[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUSIC_LIKED_TRACKS_KEY, JSON.stringify(tracks.slice(0, 300)));
  window.dispatchEvent(new CustomEvent('sane333:music-liked-changed'));
}

export function isTrackLiked(trackId: string): boolean {
  return getLikedTracks().some((track) => track.id === trackId);
}

export function toggleLikedTrack(track: MusicTrack): MusicTrack[] {
  const current = getLikedTracks();
  const exists = current.some((item) => item.id === track.id);
  const next = exists
    ? current.filter((item) => item.id !== track.id)
    : [track, ...current.filter((item) => item.id !== track.id)];
  saveLikedTracks(next);
  return next;
}

function mergeSettings(raw: unknown): MusicApiSettings {
  return { ...DEFAULT_MUSIC_API_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export function readMusicApiSettings(): MusicApiSettings {
  if (typeof window === 'undefined') return DEFAULT_MUSIC_API_SETTINGS;
  try {
    return mergeSettings(JSON.parse(window.localStorage.getItem(MUSIC_SETTINGS_KEY) || '{}'));
  } catch {
    return DEFAULT_MUSIC_API_SETTINGS;
  }
}

export function saveMusicApiSettings(patch: Partial<MusicApiSettings>): MusicApiSettings {
  const next = { ...readMusicApiSettings(), ...patch };
  if (typeof window !== 'undefined') window.localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function readMusicCurrent(): MusicTrack | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_CURRENT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed as MusicTrack : null;
  } catch {
    return null;
  }
}

export function saveMusicCurrent(track: MusicTrack | null): void {
  if (typeof window === 'undefined') return;
  if (track) window.localStorage.setItem(MUSIC_CURRENT_KEY, JSON.stringify(track));
  else window.localStorage.removeItem(MUSIC_CURRENT_KEY);
  window.dispatchEvent(new CustomEvent('sane333:music-changed'));
}

export function getCharacterPlaylists(): CharacterPlaylist[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_CHARACTER_PLAYLISTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCharacterPlaylist(playlist: CharacterPlaylist): void {
  if (typeof window === 'undefined') return;
  const current = getCharacterPlaylists();
  const next = current.some(item => item.characterId === playlist.characterId && item.name === playlist.name)
    ? current.map(item => item.characterId === playlist.characterId && item.name === playlist.name ? playlist : item)
    : [playlist, ...current];
  window.localStorage.setItem(MUSIC_CHARACTER_PLAYLISTS_KEY, JSON.stringify(next));
}

export function addTrackToCharacterPlaylist(character: { id: string; name: string; variantLabel?: string }, track: MusicTrack, playlistName = '喜欢的歌'): void {
  const current = getCharacterPlaylists();
  const existing = current.find(item => item.characterId === character.id && item.name === playlistName);
  const playlist: CharacterPlaylist = existing
    ? { ...existing, tracks: existing.tracks.some(item => item.id === track.id) ? existing.tracks : [track, ...existing.tracks], updatedAt: new Date().toISOString() }
    : {
        characterId: character.id,
        characterName: character.name,
        variantLabel: character.variantLabel,
        name: playlistName,
        description: '角色在一起听歌中收藏的歌曲。',
        tracks: [track],
        updatedAt: new Date().toISOString(),
      };
  saveCharacterPlaylist(playlist);
}

export function readStrangerSession(): MusicStrangerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_STRANGER_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed as MusicStrangerSession : null;
  } catch {
    return null;
  }
}

/** 从 stranger session 中提取一起听歌信息（用于灵动岛） */
export function getTogetherSessionInfo(session: MusicStrangerSession | null): {
  characterName: string;
  characterInitial: string;
  userInitial: string;
  hue: number;
} | null {
  if (!session || session.status === 'ended') return null;
  return {
    characterName: session.characterName,
    characterInitial: session.characterName.charAt(0),
    userInitial: '我',
    hue: 350, // 默认色调，可根据角色调整
  };
}

export function saveStrangerSession(session: MusicStrangerSession | null): void {
  if (typeof window === 'undefined') return;
  if (session) window.localStorage.setItem(MUSIC_STRANGER_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(MUSIC_STRANGER_KEY);
  window.dispatchEvent(new CustomEvent('sane333:music-stranger-changed'));
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const next = path.startsWith('/') ? path : '/' + path;
  return base + next;
}

async function fetchJson(url: string): Promise<any> {
  // 自动注入 cookie（如果已登录），让所有需要登录态的接口（比如 song/url 解锁版权）
  // 都能用上 MUSIC_U。
  let finalUrl = url;
  const cookie = readMusicCookie();
  if (cookie?.raw) {
    const sep = finalUrl.includes('?') ? '&' : '?';
    finalUrl = `${finalUrl}${sep}cookie=${encodeURIComponent(cookie.raw)}`;
  }
  const response = await fetchWithTimeout(finalUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('MUSIC_API_' + response.status);
  return response.json();
}

/** 带超时的 fetch（音乐 API 统一用它，避免请求卡死无反馈） */
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('MUSIC_TIMEOUT: 音乐接口超过 ' + Math.round(timeoutMs / 1000) + ' 秒没有响应，请检查网络或稍后重试');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

// ===== 网易云扫码登录（3 步） =====
export type QrStatus = 800 | 801 | 802 | 803 | number;

export interface QrKeyResult { unikey: string; code: number; }
export interface QrCreateResult { qrimg: string; qrurl: string; code: number; }
export interface QrCheckResult { code: QrStatus; message: string; cookie?: string; }

/** 第 1 步：生成一个 unikey（扫码登录时还没登录，不能用自动注入cookie的fetchJson） */
export async function loginQrKey(settings = readMusicApiSettings()): Promise<string> {
  const url = new URL(joinUrl(settings.baseUrl, '/login/qr/key'), window.location.origin);
  // 加时间戳避免缓存命中未登录态
  url.searchParams.set('timestamp', String(Date.now()));
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('生成二维码 key 失败：网络错误 ' + response.status);
  const payload = await response.json();
  const key = payload?.data?.unikey ?? payload?.unikey;
  if (!key) throw new Error('生成二维码 key 失败：' + JSON.stringify(payload).slice(0, 200));
  return String(key);
}

/** 第 2 步：用 unikey 生成二维码图片（base64）和扫码内容 */
export async function loginQrCreate(unikey: string, settings = readMusicApiSettings()): Promise<QrCreateResult> {
  const url = new URL(joinUrl(settings.baseUrl, '/login/qr/create'), window.location.origin);
  url.searchParams.set('key', unikey);
  url.searchParams.set('qrimg', 'true');
  url.searchParams.set('timestamp', String(Date.now()));
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('生成二维码失败：网络错误 ' + response.status);
  const payload = await response.json();
  return {
    qrimg: String(payload?.data?.qrimg ?? payload?.qrimg ?? ''),
    qrurl: String(payload?.data?.qrurl ?? payload?.qrurl ?? ''),
    code: Number(payload?.code ?? 0),
  };
}

/** 第 3 步：轮询扫码状态。code: 800=过期 801=等待扫码 802=待确认 803=登录成功（带 cookie） */
export async function loginQrCheck(unikey: string, settings = readMusicApiSettings()): Promise<QrCheckResult> {
  const url = new URL(joinUrl(settings.baseUrl, '/login/qr/check'), window.location.origin);
  url.searchParams.set('key', unikey);
  url.searchParams.set('timestamp', String(Date.now()));
  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('扫码状态查询失败：网络错误 ' + response.status);
  const payload = await response.json();
  return {
    code: Number(payload?.code ?? 0) as QrStatus,
    message: String(payload?.message ?? ''),
    cookie: payload?.cookie ? String(payload.cookie) : undefined,
  };
}

/** 一键扫码登录：返回 { unikey, qrImg(qrcode base64), qrurl }，并启动轮询；
 *  拿到 cookie 后自动写入 localStorage 并触发 sane333:music-cookie-changed 事件。
 *  轮询通过 options.onStatus 回调实时返回状态码。 */
export interface QrLoginOptions {
  settings?: MusicApiSettings;
  onStatus?: (code: QrStatus, message: string) => void;
  /** 二维码生成后立刻回调，传入 base64 图片和扫码内容 */
  onQrReady?: (info: { qrimg: string; qrurl: string; unikey: string }) => void;
  pollIntervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

export async function loginWithQr(options: QrLoginOptions = {}): Promise<MusicCookie> {
  const settings = options.settings ?? readMusicApiSettings();
  const interval = options.pollIntervalMs ?? 1500;
  const maxAttempts = options.maxAttempts ?? 80; // ≈ 2 分钟
  const unikey = await loginQrKey(settings);
  const { qrimg, qrurl } = await loginQrCreate(unikey, settings);
  options.onQrReady?.({ qrimg, qrurl, unikey });
  options.onStatus?.(801, '等待扫码');
  return new Promise<MusicCookie>((resolve, reject) => {
    let attempts = 0;
    let stopped = false;
    const cleanup = () => {
      stopped = true;
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('已取消扫码登录'));
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort);
    }
    const tick = async () => {
      if (stopped) return;
      attempts += 1;
      try {
        const result = await loginQrCheck(unikey, settings);
        options.onStatus?.(result.code, result.message);
        if (result.code === 803 && result.cookie) {
          const musicU = extractMusicU(result.cookie);
          if (!musicU) {
            cleanup();
            reject(new Error('登录成功但未拿到 MUSIC_U：' + result.cookie.slice(0, 120)));
            return;
          }
          const cookie: MusicCookie = {
            raw: result.cookie,
            musicU,
            loggedAt: Date.now(),
          };
          saveMusicCookie(cookie);
          cleanup();
          resolve(cookie);
          return;
        }
        if (result.code === 800) {
          cleanup();
          reject(new Error('二维码已过期，请重新扫码'));
          return;
        }
      } catch (error) {
        // 单次轮询失败不退出（网络抖动等）
        // eslint-disable-next-line no-console
        console.warn('[loginWithQr] poll failed', error);
      }
      if (attempts >= maxAttempts) {
        cleanup();
        reject(new Error('扫码超时（2 分钟），请重试'));
        return;
      }
      window.setTimeout(tick, interval);
    };
    window.setTimeout(tick, interval);
    // 让二维码和 qrurl 也能用上
    (loginWithQr as any)._lastQr = { qrimg, qrurl, unikey };
  });
}

/** 退出登录（清掉本地 cookie；也可选调用 /logout） */
export async function logoutMusic(settings = readMusicApiSettings()): Promise<void> {
  try {
    const url = new URL(joinUrl(settings.baseUrl, '/logout'), window.location.origin);
    url.searchParams.set('timestamp', String(Date.now()));
    await fetchJson(url.toString());
  } catch {
    // 即使服务端 logout 失败也清本地
  }
  saveMusicCookie(null);
}

// ===== 获取用户歌单 =====
export interface CloudPlaylist {
  id: string;
  name: string;
  coverImgUrl: string;
  trackCount: number;
  creatorNickname: string;
}

const CLOUD_PLAYLISTS_CACHE_KEY = 'phone:music-cloud-playlists-cache';

export interface CloudPlaylistsCache {
  playlists: CloudPlaylist[];
  /** 对应登录账号的 MUSIC_U 前缀，换号时丢弃旧缓存 */
  musicUPrefix: string;
  syncedAt: number;
}

/** 云歌单列表很小（只有名称/封面/数量），缓存几乎不占内存；点播详情仍按需拉取 */
export function readCachedCloudPlaylists(): CloudPlaylistsCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLOUD_PLAYLISTS_CACHE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.playlists)) return null;
    const cookie = readMusicCookie();
    const prefix = String(cookie?.musicU || '').slice(0, 12);
    if (!prefix || String(parsed.musicUPrefix || '') !== prefix) return null;
    return {
      playlists: parsed.playlists as CloudPlaylist[],
      musicUPrefix: prefix,
      syncedAt: Number(parsed.syncedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function saveCachedCloudPlaylists(playlists: CloudPlaylist[]): CloudPlaylistsCache | null {
  if (typeof window === 'undefined') return null;
  const cookie = readMusicCookie();
  const prefix = String(cookie?.musicU || '').slice(0, 12);
  if (!prefix) return null;
  const cache: CloudPlaylistsCache = {
    playlists: playlists.slice(0, 200),
    musicUPrefix: prefix,
    syncedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(CLOUD_PLAYLISTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
  return cache;
}

export function clearCachedCloudPlaylists(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLOUD_PLAYLISTS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** 获取用户的云音乐歌单列表 */
export async function fetchUserPlaylists(settings = readMusicApiSettings()): Promise<CloudPlaylist[]> {
  const cookie = readMusicCookie();
  if (!cookie) throw new Error('请先登录网易云账号');

  // 先获取用户 UID
  const accountUrl = new URL(joinUrl(settings.baseUrl, '/user/account'), window.location.origin);
  accountUrl.searchParams.set('cookie', cookie.raw);
  const accountRes = await fetchWithTimeout(accountUrl.toString(), { headers: { Accept: 'application/json' } });
  const accountData = await accountRes.json();
  const uid = accountData?.account?.innerData?.uid || accountData?.profile?.userId || accountData?.account?.id;
  if (!uid) throw new Error('无法获取用户信息');

  // 获取用户歌单
  const url = new URL(joinUrl(settings.baseUrl, '/user/playlist'), window.location.origin);
  url.searchParams.set('cookie', cookie.raw);
  url.searchParams.set('uid', String(uid));
  url.searchParams.set('timestamp', String(Date.now()));

  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('获取歌单失败：' + response.status);

  const payload = await response.json();
  const rawPlaylists = Array.isArray(payload) ? payload : payload?.playlist || [];

  return rawPlaylists.map((pl: any) => ({
    id: String(pl.id || ''),
    name: String(pl.name || '未命名'),
    coverImgUrl: String(pl.coverImgUrl || pl.coverUrl || ''),
    trackCount: Number(pl.trackCount || pl.track_count || 0),
    creatorNickname: String(pl.creator?.nickname || '我'),
  }));
}

/** 获取歌单详情（包含歌曲列表） */
export interface CloudPlaylistDetail {
  id: string;
  name: string;
  coverImgUrl: string;
  tracks: MusicTrack[];
}

export async function fetchPlaylistDetail(playlistId: string, settings = readMusicApiSettings()): Promise<CloudPlaylistDetail> {
  const cookie = readMusicCookie();
  if (!cookie) throw new Error('请先登录网易云账号');

  const url = new URL(joinUrl(settings.baseUrl, '/playlist/detail'), window.location.origin);
  url.searchParams.set('cookie', cookie.raw);
  url.searchParams.set('id', playlistId);
  url.searchParams.set('timestamp', String(Date.now()));

  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('获取歌单详情失败：' + response.status);

  const payload = await response.json();
  const pl = payload?.playlist || payload?.data?.playlist || {};
  const rawTracks = Array.isArray(pl.tracks) ? pl.tracks : [];

  return {
    id: String(pl.id || playlistId),
    name: String(pl.name || '未命名'),
    coverImgUrl: String(pl.coverImgUrl || pl.coverUrl || ''),
    tracks: rawTracks.map(normalizeTrack),
  };
}

function extractItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  // /search → { result: { songs: [...] } } 或 { songs: [...] } 或 { result: { songs: [...] } }
  if (Array.isArray(payload?.result?.songs)) return payload.result.songs;
  if (Array.isArray(payload?.songs)) return payload.songs;
  // /song/detail → { songs: [...] }
  if (Array.isArray(payload?.data?.songs)) return payload.data.songs;
  // /playlist/detail → { playlist: { tracks: [...] } }
  if (Array.isArray(payload?.playlist?.tracks)) return payload.playlist.tracks;
  if (Array.isArray(payload?.data?.playlist?.tracks)) return payload.data.playlist.tracks;
  return [];
}

/** 从歌手数组字段里取出名字。兼容 `artists`（search 简化结构）和 `ar`（detail 完整结构）。 */
function pickArtists(raw: any): string {
  const list = Array.isArray(raw?.artists)
    ? raw.artists
    : Array.isArray(raw?.ar)
      ? raw.ar
      : [];
  return list.map((a: any) => a?.name).filter(Boolean).join('/');
}

/** 从专辑里取出封面。优先 picUrl，否则根据 picId 拼接网易云官方链接。 */
function pickCoverUrl(raw: any): string {
  const al = raw?.album || raw?.al;
  if (typeof al?.picUrl === 'string' && al.picUrl) return al.picUrl;
  // picId 是数值时，网易云 URL 规则：https://p3.music.126.net/{picId}/{pic_str|hex(picId)}.jpg
  const picId = Number(al?.picId ?? al?.pic ?? raw?.picId ?? 0);
  if (picId > 0) {
    const picStr = String(al?.pic_str || picId);
    return `https://p3.music.126.net/${picId}/${picStr}.jpg`;
  }
  return '';
}

/** 取专辑名。兼容 `album.name` 与 `al.name`。 */
function pickAlbum(raw: any): string {
  return String(raw?.album?.name ?? raw?.al?.name ?? raw?.album ?? '');
}

/** 取时长（秒）。兼容 search 简化结构里直接给 `duration`（秒）和 detail 完整结构的 `dt`（毫秒）。 */
function pickDuration(raw: any): number {
  const direct = Number(raw?.duration ?? raw?.dt ?? 0);
  if (!direct) return 0;
  return direct > 10000 ? direct / 1000 : direct;
}

function normalizeTrack(raw: any, settings: MusicApiSettings): MusicTrack {
  const id = String(raw?.id ?? raw?.songId ?? '');
  const cover = pickCoverUrl(raw);
  const url = raw?.url || raw?.playUrl || raw?.audio || '';
  let lyrics: MusicLyricLine[] | undefined;
  const rawLrc = raw?.lyric ?? raw?.lrc ?? raw?.lyrics ?? raw?.lrcText;
  if (typeof rawLrc === 'string') {
    const parsed = parseLrc(rawLrc);
    if (parsed.length) lyrics = parsed;
  } else if (Array.isArray(rawLrc) && rawLrc.length) {
    lyrics = rawLrc
      .map((l: any) => ({ time: Number(l?.time ?? l?.t ?? 0), text: String(l?.text ?? l?.c ?? '') }))
      .filter((l: MusicLyricLine) => l.text)
      .sort((a: MusicLyricLine, b: MusicLyricLine) => a.time - b.time);
  } else if (rawLrc && typeof rawLrc === 'object') {
    const lrcText = rawLrc?.lyric ?? rawLrc?.lrc;
    if (typeof lrcText === 'string') {
      const parsed = parseLrc(lrcText);
      if (parsed.length) lyrics = parsed;
    }
  }
  return {
    id,
    name: String(raw?.name || raw?.title || '未知歌曲'),
    artist: String(raw?.artist || raw?.singer || pickArtists(raw) || '未知歌手'),
    album: pickAlbum(raw) || '未知专辑',
    duration: pickDuration(raw),
    cover,
    playUrl: String(url),
    source: settings.provider === 'netease' ? 'netease' : 'custom',
    raw,
    lyrics,
  };
}

export async function searchMusic(keyword: string, settings = readMusicApiSettings()): Promise<MusicTrack[]> {
  if (!settings.baseUrl.trim()) throw new Error('请先填写网易云 Music API Base URL');
  const url = new URL(joinUrl(settings.baseUrl, settings.searchPath), window.location.origin);
  url.searchParams.set(settings.searchParam, keyword);
  url.searchParams.set('limit', '30');
  const payload = await fetchJson(url.toString());
  const items = extractItems(payload);
  const normalized = items.map(item => normalizeTrack(item, settings)).filter(track => track.id);
  // search 接口只返回简版（只有 picId，没有 picUrl），图 URL 用 picId 拼会 404。
  // 这里并发调 /song/detail 拿真实 picUrl，补全封面。
  if (normalized.length) {
    try {
      const detailUrl = new URL(joinUrl(settings.baseUrl, '/song/detail'), window.location.origin);
      detailUrl.searchParams.set('ids', normalized.map(t => t.id).slice(0, 50).join(','));
      const detailPayload = await fetchJson(detailUrl.toString());
      const detailItems: any[] = detailPayload?.songs || detailPayload?.data?.songs || [];
      const byId = new Map<string, any>();
      detailItems.forEach(d => byId.set(String(d?.id), d));
      normalized.forEach(track => {
        const d = byId.get(track.id);
        if (!d) return;
        const al = d?.album || d?.al;
        const realPic = al?.picUrl || '';
        if (realPic) (track as any).cover = realPic;
      });
    } catch {
      // 详情拉不到也没关系，至少有名字
    }
  }
  return normalized;
}

export async function resolveTrackUrl(track: MusicTrack, settings = readMusicApiSettings()): Promise<MusicTrack> {
  if (track.playUrl) return track;
  // 优先尝试 /song/url/v1/302 + unblock=true（API 专门为解锁灰色歌曲设计，
  // 已登录后会从 QQ/咪咕/百度等音源找替代链接，大幅提升可播率）
  try {
    const url302 = new URL(joinUrl(settings.baseUrl, '/song/url/v1/302'), window.location.origin);
    url302.searchParams.set('id', track.id);
    url302.searchParams.set('level', 'exhigh');
    url302.searchParams.set('unblock', 'true');
    // 解决在 vercel 等海外节点上调用网易云时 460「cheating」的问题：
    // 让 API 用一个中国 IP 伪装请求来源。
    url302.searchParams.set('randomCNIP', 'true');
    const response = await fetchWithTimeout(url302.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'application/json' },
    });
    // 302 走完之后会得到一段 JSON
    if (response.ok) {
      const payload = await response.json().catch(() => null);
      // { data: [{ url }] } 或 { data: { url } }
      const list = Array.isArray(payload?.data) ? payload.data : null;
      const firstUrl = list?.[0]?.url ?? payload?.data?.url ?? payload?.url ?? '';
      if (firstUrl) {
        return { ...track, playUrl: String(firstUrl) };
      }
    }
  } catch {
    // 忽略 fallback 到原始接口
  }
  // 兜底：用配置的 urlPath
  const url = new URL(joinUrl(settings.baseUrl, settings.urlPath), window.location.origin);
  url.searchParams.set('id', track.id);
  // 提高音质成功率：让 API 优先返回可播放的 mp3
  url.searchParams.set('br', '320000');
  url.searchParams.set('randomCNIP', 'true');
  const payload = await fetchJson(url.toString());
  // 接口结构 { data: [{ url, ... }] } 或 { data: { url } } 或 { url }
  const list = Array.isArray(payload?.data) ? payload.data : null;
  const first = list?.[0];
  const dataUrl = first?.url ?? payload?.data?.url ?? payload?.url ?? '';
  return { ...track, playUrl: String(dataUrl || '') };
}

/** 拉取歌词（LRC 文本）。track 已有歌词就跳过。 */
export async function fetchLyric(track: MusicTrack, settings = readMusicApiSettings()): Promise<MusicLyricLine[]> {
  if (Array.isArray(track.lyrics) && track.lyrics.length) return track.lyrics;
  if (!settings.lyricPath) return [];
  try {
    const url = new URL(joinUrl(settings.baseUrl, settings.lyricPath), window.location.origin);
    url.searchParams.set('id', track.id);
    const payload = await fetchJson(url.toString());
    // 接口结构 { lrc: { lyric } } 或 { lyric } 或 { data: { lrc: { lyric } } }
    const lrcText: string =
      payload?.lrc?.lyric ??
      payload?.lyric ??
      payload?.data?.lrc?.lyric ??
      payload?.data?.lyric ??
      '';
    return parseLrc(lrcText);
  } catch {
    return [];
  }
}

export async function getMusicPlaylist(playlistId: string, settings = readMusicApiSettings()): Promise<MusicTrack[]> {
  const url = new URL(joinUrl(settings.baseUrl, settings.playlistPath), window.location.origin);
  url.searchParams.set('id', playlistId);
  const payload = await fetchJson(url.toString());
  return extractItems(payload).map(item => normalizeTrack(item, settings)).filter(track => track.id);
}

/** 检测歌曲是否有版权（网易云 check/music）。有版权返回 true。失败时按 true 处理（乐观默认）。 */
export async function checkMusicAvailable(trackId: string, settings = readMusicApiSettings()): Promise<boolean> {
  if (!settings.checkPath) return true;
  try {
    const url = new URL(joinUrl(settings.baseUrl, settings.checkPath), window.location.origin);
    url.searchParams.set('id', trackId);
    const payload = await fetchJson(url.toString());
    return payload?.success !== false;
  } catch {
    return true;
  }
}
