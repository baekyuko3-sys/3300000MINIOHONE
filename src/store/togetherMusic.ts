import {
  readMusicCurrent,
  readStrangerSession,
  saveMusicCurrent,
  saveStrangerSession,
  type MusicStrangerSession,
  type MusicTrack,
} from './music';

export interface TogetherMusicSession {
  id: string;
  conversationId: string;
  title: string;
  artist: string;
  url: string;
  album?: string;
  note?: string;
  cover?: string;
  /** 展示用时长，如 3:27 */
  durationLabel?: string;
  /** 封面渐变三色 */
  colors?: [string, string, string];
  startedBy: 'me' | 'character';
  status: 'invited' | 'listening' | 'paused' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export function createTogetherMusicSession(input: Omit<TogetherMusicSession, 'id' | 'createdAt' | 'updatedAt'>): TogetherMusicSession {
  const now = new Date().toISOString();
  return {
    ...input,
    id: 'together-music-' + Date.now().toString(36),
    createdAt: now,
    updatedAt: now,
  };
}

function parseDurationSeconds(label?: string): number {
  const text = String(label || '').trim();
  const m = text.match(/^(\d+):(\d{1,2})$/);
  if (!m) return 0;
  return Math.max(0, Number(m[1]) * 60 + Number(m[2]));
}

/**
 * LINE 一起听邀请被接受后：同步到灵动岛「共听」态。
 * 灵动岛只认 phone:music-stranger-session，不认 line:together-music。
 */
export function activateLineTogetherIsland(input: {
  sessionId?: string;
  characterId?: string;
  characterName: string;
  variantLabel?: string;
  title: string;
  artist: string;
  url?: string;
  cover?: string;
  album?: string;
  durationLabel?: string;
  track?: Partial<MusicTrack> | null;
  createdAt?: string;
}): void {
  const now = new Date().toISOString();
  const fromInvite = input.track && typeof input.track === 'object' ? input.track : null;
  const current = readMusicCurrent();
  const track: MusicTrack = {
    id: String(fromInvite?.id || input.sessionId || 'together-' + Date.now().toString(36)),
    name: String(fromInvite?.name || input.title || '一起听'),
    artist: String(fromInvite?.artist || input.artist || '未知艺术家'),
    album: String(fromInvite?.album || input.album || ''),
    duration: Number(fromInvite?.duration || current?.duration || parseDurationSeconds(input.durationLabel) || 0) || 0,
    cover: String(fromInvite?.cover || input.cover || current?.cover || ''),
    playUrl: String(fromInvite?.playUrl || input.url || current?.playUrl || ''),
    source: (fromInvite?.source as MusicTrack['source']) || current?.source || 'custom',
    raw: fromInvite?.raw ?? current?.raw,
    lyrics: Array.isArray(fromInvite?.lyrics) ? fromInvite?.lyrics : current?.lyrics,
  };

  // 保证灵动岛有可展开曲目；优先用邀请曲
  saveMusicCurrent(track);

  const session: MusicStrangerSession = {
    id: String(input.sessionId || 'together-line-' + Date.now().toString(36)),
    mode: 'direct',
    characterId: String(input.characterId || ''),
    characterName: String(input.characterName || 'TA'),
    variantLabel: input.variantLabel,
    allowCharRandomSong: true,
    charRandomPace: 'rare',
    track,
    status: 'listening',
    reactionLog: [],
    createdAt: String(input.createdAt || now),
    updatedAt: now,
  };
  saveStrangerSession(session);

  // 音乐页只认 React 里的 session；派事件让它同步并打开一起听播放页
  window.dispatchEvent(
    new CustomEvent('sane333:open-music-together', {
      detail: { sessionId: session.id, openPlayer: true },
    }),
  );
}

/** 结束 LINE 一起听时收起灵动岛共听态（仅匹配到的会话） */
export function clearLineTogetherIsland(match?: { sessionId?: string; characterId?: string }): void {
  const session = readStrangerSession();
  if (!session || session.status === 'ended') return;
  const now = new Date().toISOString();
  if (match?.sessionId && String(session.id) === String(match.sessionId)) {
    saveStrangerSession({ ...session, status: 'ended', updatedAt: now });
    return;
  }
  if (
    match?.characterId
    && session.mode === 'direct'
    && String(session.characterId || '') === String(match.characterId)
  ) {
    saveStrangerSession({ ...session, status: 'ended', updatedAt: now });
  }
}
