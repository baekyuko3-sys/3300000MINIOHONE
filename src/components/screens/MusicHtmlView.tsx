import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ScreenType } from '../../types';
import type { ImportedCharacter } from '../../data/characterImport';
import { generateCharacterReply, generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import { getCharacterProfile } from '../../data/characterProfiles';
import { getCharacterMemory } from '../../store/characterMemory';
import { readPersistentState, usePersistentState } from '../../store/usePersistentState';
import type { WorldBook } from '../../types';
import {
  addTrackToCharacterPlaylist,
  getCharacterPlaylists,
  getLikedTracks,
  readMusicApiSettings,
  readMusicCookie,
  readMusicCurrent,
  readMusicTheme,
  readStrangerSession,
  resolveTrackUrl,
  saveMusicApiSettings,
  saveMusicCookie,
  saveMusicCurrent,
  saveMusicTheme,
  saveStrangerSession,
  searchMusic,
  fetchUserPlaylists,
  fetchPlaylistDetail,
  readCachedCloudPlaylists,
  saveCachedCloudPlaylists,
  clearCachedCloudPlaylists,
  getCharacterMusicId,
  setCharacterMusicId,
  normalizeMusicId,
  strangerDisplayName,
  sessionAllowsCharRandom,
  sessionCharRandomPace,
  charRandomDelayMs,
  type CharRandomPace,
  type MusicCookie,
  type MusicStrangerSession,
  type MusicTheme,
  type MusicTrack,
  type CloudPlaylist,
} from '../../store/music';
import {
  createMusicProfile,
  getActiveMusicProfile,
  getActiveMusicProfileId,
  getMusicProfiles,
  persistActiveProfileLikes,
  switchMusicProfile,
  syncActiveProfileLikesToGlobal,
  updateMusicProfile,
  type MusicProfile,
} from '../../store/musicProfiles';
import {
  appendMusicListenRecord,
  formatListenGroupLabel,
  formatListenTimeLabel,
  getMusicListenHistory,
  listenSongKey,
  pickHue,
  pickTrackColors,
  safeAlbumCover,
  toggleMusicListenKeep,
  updateMusicListenRecord,
  type MusicListenRecord,
} from '../../store/musicListenHistory';
import {
  CHAR_PLAYLIST_MAX_BATCHES,
  canNotifyCharPlaylistListen,
  clearCharArchives,
  clearCharSummary,
  collectCharacterPlaylist,
  createUserPlaylist,
  deleteCharBatch,
  getCharPlaylistArchives,
  getCharPlaylistNotifyEnabled,
  getCharTogetherAutoCollectEnabled,
  getCollectedKeys,
  markCharPlaylistListenNotified,
  getUserPlaylists,
  paletteColor,
  setCharPlaylistNotifyEnabled,
  setCharTogetherAutoCollectEnabled,
  songToTrack,
  trackToSong,
  uncollectCharacterPlaylist,
  upsertCharBatch,
  type CharPlaylistBatch,
  type CharPlaylistCard,
} from '../../store/musicPlaylists';
import { createTogetherMusicSession } from '../../store/togetherMusic';
import { appendLineRuntimeMessage } from '../../store/lineMessageRuntime';
import meHtml from '../../music/music-me.html?raw';
import favHtml from '../../music/favourite-music.html?raw';
import historyHtml from '../../music/listen-history.html?raw';
import myPlHtml from '../../music/my-playlists.html?raw';
import charPlHtml from '../../music/character-playlists.html?raw';

interface MusicHtmlViewProps {
  themeMode?: unknown;
  /** 当前是否在音乐屏；常挂载时用来在切回来时重读 LINE 人设头像 */
  active?: boolean;
  onNavigate: (screen: ScreenType) => void;
}

type LineUserPersona = { id: string; name?: string; avatar?: string; av?: string; isDefault?: boolean; [key: string]: unknown };
type Overlay = '' | 'fav' | 'history' | 'myPl' | 'charPl';
type PlayMode = 'shuffle' | 'one' | 'list';

const SHELL = 'sane333-music-shell';
const PLAY_MODE_KEY = 'phone:music-play-mode';

function readPlayMode(): PlayMode {
  try {
    const raw = String(window.localStorage.getItem(PLAY_MODE_KEY) || 'shuffle');
    if (raw === 'shuffle' || raw === 'one' || raw === 'list') return raw;
  } catch {
    /* ignore */
  }
  return 'shuffle';
}

function savePlayMode(mode: PlayMode) {
  try {
    window.localStorage.setItem(PLAY_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function personaAvatarValue(persona?: LineUserPersona | null): string {
  if (!persona) return '';
  return String(persona.avatar || persona.av || '');
}

/** 音乐页常挂载，不能依赖 usePersistentState 快照；每次从 localStorage 读最新人设。 */
function readLinePersonas(): LineUserPersona[] {
  const raw = readPersistentState<unknown>('line:user-personas', []);
  return Array.isArray(raw) ? (raw as LineUserPersona[]) : [];
}

function readLineActivePersonaId(): string | null {
  const id = readPersistentState<string | null>('line:active-persona', null);
  return id ? String(id) : null;
}

function readLineCurrentUserAvatar(): string {
  const user = readPersistentState<{ avatar?: string; av?: string } | null>('line:current-user', null);
  return String(user?.avatar || user?.av || '');
}

function trackPayload(track: MusicTrack) {
  const colors = pickTrackColors(track.id || track.name);
  return {
    id: track.id,
    name: track.name,
    n: track.name,
    artist: track.artist,
    a: track.artist,
    album: track.album,
    al: track.album,
    duration: track.duration,
    d: track.duration,
    cover: track.cover,
    img: track.cover,
    playUrl: track.playUrl,
    liked: true,
    c: colors,
    s: 1,
  };
}

/** 音乐一起听：组装与 LINE 同级的角色人设上下文（记忆 / 用户人设 / 世界书） */
function resolveMusicPersonaContext(character: ImportedCharacter) {
  const memory = getCharacterMemory(character.id, character.name);
  const personas = readPersistentState<Array<Record<string, any>>>('line:user-personas', []);
  const activePersonaId = readPersistentState<string | null>('line:active-persona', null);
  const persona =
    (memory.personaId && personas.find((item) => item.id === memory.personaId))
    || personas.find((item) => Array.isArray(item.boundCharacterIds) && item.boundCharacterIds.includes(character.id))
    || personas.find((item) => item.boundCharacterId === character.id)
    || (activePersonaId && personas.find((item) => item.id === activePersonaId))
    || personas.find((item) => item.isDefault)
    || personas[0]
    || null;
  const storedWorldbooks = readPersistentState<WorldBook[]>('phone:worldbooks', []);
  const embedded =
    character.embeddedWorldBooks
    || (character.embeddedWorldBook ? [character.embeddedWorldBook] : []);
  const seen = new Set<string>();
  const worldbooks = [...embedded, ...(Array.isArray(storedWorldbooks) ? storedWorldbooks : [])].filter((book) => {
    const key = book.id || `book:${book.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const profile = getCharacterProfile(character.name, character.id);
  const characterProfile = {
    nickname: profile.nickname || character.name,
    relationship: profile.relationship || '刚认识',
    callMe: profile.callMe || '',
    bio: profile.bio || character.description || '',
    canCharacterSelfJudge: profile.canCharacterSelfJudge !== false,
  };
  return {
    memory,
    persona: persona
      ? {
          name: persona.name,
          identity: persona.identity,
          gender: persona.gender,
          traits: persona.traits,
          background: persona.background || persona.setting || '',
          region: persona.region,
          timezone: persona.timezone,
          birthday: persona.birthday,
          profession: persona.profession,
          age: persona.age,
          ageMode: persona.ageMode,
          weather: persona.weather,
        }
      : null,
    worldbooks,
    characterProfile,
  };
}

function musicSessionAuthorNote(nextSession: MusicStrangerSession, character: ImportedCharacter) {
  const isStranger = nextSession.mode === 'stranger';
  const displayAs = strangerDisplayName(nextSession);
  const anon = Boolean(nextSession.anonymous);
  return [
    '【场景】你们正在音乐 App 里一起听同一首歌，边听边聊。',
    isStranger
      ? (anon
        ? `【匿名一起听】对外只是音乐 ID「${displayAs}」/匿名听众。绝对禁止说出角色真名「${character.name}」、作品名、身份线索或任何可认出你的信息。内在人格仍严格按角色卡与记忆行动。`
        : `【陌生人一起听】对外身份是音乐 ID「${displayAs}」。禁止透露角色真名「${character.name}」或可认出你的信息。内在人格仍严格按角色卡与记忆行动。`)
      : `你就是${character.name}，正在和熟人一起听歌。`,
    '回复要像真人短讯：短、自然、有情绪；可轻轻提到正在听的歌。',
    '不要解释自己是 AI。不要只回「嗯」「哦」「好」。',
  ].join('\n');
}

function sessionPayload(session: MusicStrangerSession | null, characters: ImportedCharacter[]) {
  if (!session || session.status === 'ended') return null;
  const character = characters.find((item) => item.id === session.characterId);
  const displayName = strangerDisplayName(session);
  const msgs: Array<{ k: string; x: string }> = [
    {
      k: 'sy',
      x:
        session.mode === 'stranger'
          ? '相逢即是缘 · TA 也在听这首歌呢' // 固定开场，勿改
          : `你邀请了 ${session.characterName} 一起听《${session.track.name}》`,
    },
  ];
  for (const item of session.reactionLog || []) {
    let k = 'ta';
    let x = item.text;
    if (x.startsWith('我说：')) {
      k = 'me';
      x = x.slice(3);
    } else if (/^TA 切到了《/.test(x) || /^TA 切到了/.test(x)) {
      // 切歌：和开场一样用居中系统灰字，并写明 TA 切了什么
      k = 'sy';
      x = x.replace(/^TA 切到了/, 'TA 切到了');
    }
    msgs.push({ k, x });
  }
  return {
    m: session.mode === 'stranger' ? 's' : 'd',
    cid: session.characterId,
    name: displayName,
    variant: session.mode === 'stranger' ? '音乐 ID' : (session.variantLabel || '默认版本'),
    hue: pickHue(session.characterId || session.characterName),
    startedAt: session.createdAt,
    unread: 0,
    load: false,
    allowRand: sessionAllowsCharRandom(session),
    charRandomPace: sessionCharRandomPace(session),
    anonymous: Boolean(session.anonymous),
    msgs,
    // 匿名房：绝不下发角色头像；普通陌生人也只用音乐 ID，不用角色脸
    avatar: session.mode === 'stranger' ? '' : (character?.avatar || ''),
  };
}

function buildCompanions(records: MusicListenRecord[], characters: ImportedCharacter[]) {
  const map = new Map<
    string,
    {
      name: string;
      characterId: string;
      avatar: string;
      sessions: Set<string>;
      f: number;
      kind: string;
      variants: Set<string>;
      note: string;
    }
  >();
  for (const record of records) {
    const key = record.characterId || record.musicId || record.name;
    const hideFace = record.kind === 's' || record.anonymous;
    const existing = map.get(key) || {
      name: record.musicId || record.name,
      characterId: record.characterId || '',
      avatar: hideFace
        ? ''
        : (characters.find((item) => item.id === record.characterId)?.avatar || ''),
      sessions: new Set<string>(),
      f: 0,
      kind: record.kind,
      variants: new Set<string>(),
      note: record.anonymous ? '匿名一起听' : '一起听歌',
    };
    existing.sessions.add(String(record.sessionId || record.id));
    if (record.kind === 'f') existing.f = 1;
    existing.kind = record.kind;
    if (record.anonymous) existing.note = '匿名一起听';
    // 始终保留角色 id（即使界面匿名）
    if (record.characterId) existing.characterId = record.characterId;
    if (record.variant) existing.variants.add(record.variant);
    map.set(key, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.sessions.size - a.sessions.size)
    .map((item) => ({
      name: item.name,
      characterId: item.characterId,
      avatar: item.avatar,
      count: item.sessions.size,
      f: item.f,
      kind: item.kind,
      variants: Array.from(item.variants),
      note: item.note,
    }));
}

function characterPayload(characters: ImportedCharacter[]) {
  return characters.map((item) => ({
    id: item.id,
    n: item.name,
    v: item.variantLabel || item.characterVersion || '默认版本',
    h: pickHue(item.id || item.name),
    avatar: item.avatar || '',
  }));
}

function resolveLinePersonaAvatar(profilePersonaId?: string): string {
  const personas = readLinePersonas();
  const activePersonaId = readLineActivePersonaId();
  const byId = (id?: string | null) =>
    id ? personaAvatarValue(personas.find((item) => item.id === id)) : '';
  // 与 LINE 一致：人设头像 → 当前人设 → 默认人设 → 资料页头像
  return (
    byId(profilePersonaId)
    || byId(activePersonaId)
    || personaAvatarValue(personas.find((item) => item.isDefault))
    || personaAvatarValue(personas[0])
    || readLineCurrentUserAvatar()
    || ''
  );
}

/**
 * Shell for the Music HTML screens.
 * Layout lives in HTML; all songs / IDs / history come from app stores.
 * (force vite retransform)
 */
export function MusicHtmlView({ active = true, onNavigate }: MusicHtmlViewProps) {
  const meRef = useRef<HTMLIFrameElement>(null);
  const favRef = useRef<HTMLIFrameElement>(null);
  const historyRef = useRef<HTMLIFrameElement>(null);
  const myPlRef = useRef<HTMLIFrameElement>(null);
  const charPlRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<number | null>(null);
  const historyFilterWho = useRef('');

  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);

  const [overlay, setOverlay] = useState<Overlay>('');
  const overlayRef = useRef<Overlay>('');
  const favWasOpen = useRef(false);
  /** 角色歌单从哪打开：Favourite 耳机 / 我的歌单里的链接 */
  const charPlReturnTo = useRef<'fav' | 'myPl'>('fav');
  const [profiles, setProfiles] = useState<MusicProfile[]>(() => getMusicProfiles());
  const [activeId, setActiveId] = useState(() => getActiveMusicProfileId());
  const [liked, setLiked] = useState<MusicTrack[]>(() => {
    syncActiveProfileLikesToGlobal();
    return getLikedTracks();
  });
  const likedRef = useRef(liked);
  const [records, setRecords] = useState<MusicListenRecord[]>(() =>
    getMusicListenHistory(getActiveMusicProfileId()),
  );
  const recordsRef = useRef(records);
  const [theme, setTheme] = useState<MusicTheme>(() => readMusicTheme());
  const [current, setCurrent] = useState<MusicTrack | null>(() => readMusicCurrent());
  const currentRef = useRef(current);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const searchResultsRef = useRef(searchResults);
  const [searching, setSearching] = useState(false);
  const [session, setSession] = useState<MusicStrangerSession | null>(() => readStrangerSession());
  const sessionRef = useRef(session);
  const [apiBase, setApiBase] = useState(() => readMusicApiSettings().baseUrl);
  const [musicCookie, setMusicCookie] = useState<MusicCookie | null>(() => readMusicCookie());
  const [cloudPlaylists, setCloudPlaylists] = useState<CloudPlaylist[]>(
    () => readCachedCloudPlaylists()?.playlists || [],
  );
  const [cloudSyncedAt, setCloudSyncedAt] = useState(
    () => readCachedCloudPlaylists()?.syncedAt || 0,
  );
  const [cloudLoading, setCloudLoading] = useState(false);
  const [bubble, setBubble] = useState('');
  const [openNowPlaying, setOpenNowPlaying] = useState(false);
  const [toast, setToast] = useState('');
  const [playMode, setPlayMode] = useState<PlayMode>(() => readPlayMode());
  const playModeRef = useRef<PlayMode>(playMode);
  const charactersRef = useRef(characters);

  useEffect(() => { overlayRef.current = overlay; }, [overlay]);
  useEffect(() => { likedRef.current = liked; }, [liked]);
  useEffect(() => { recordsRef.current = records; }, [records]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { searchResultsRef.current = searchResults; }, [searchResults]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { charactersRef.current = characters; }, [characters]);
  useEffect(() => {
    playModeRef.current = playMode;
    const audio = audioRef.current;
    if (audio) audio.loop = playMode === 'one';
  }, [playMode]);

  const openFav = () => {
    favWasOpen.current = true;
    setOverlay('fav');
  };
  const openHistory = (who = '') => {
    historyFilterWho.current = who;
    setOverlay('history');
  };
  const openMyPlaylists = () => {
    favWasOpen.current = true;
    setOverlay('myPl');
  };
  const openCharPlaylists = (from: 'fav' | 'myPl' = 'fav') => {
    favWasOpen.current = true;
    charPlReturnTo.current = from;
    setOverlay('charPl');
  };

  /** 确保有和该角色的 LINE 私聊会话，返回 conversationId */
  const ensureLineConversationForCharacter = (character: ImportedCharacter) => {
    if (typeof window === 'undefined') return '';
    const activePersonaId = readPersistentState<string | null>('line:active-persona', null);
    try {
      const raw = window.localStorage.getItem('line:chat-items');
      const chats = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(chats) ? chats : [];
      const existing = list.find((item: any) =>
        item
        && !item.isGroup
        && (
          String(item.characterId || '') === String(character.id)
          || String(item.name || '') === String(character.name)
        )
        && (!activePersonaId || !item.personaId || item.personaId === activePersonaId)
      );
      if (existing?.id) return String(existing.id);
      const conversationId = `c_${Date.now().toString(36)}`;
      const created = {
        id: conversationId,
        name: character.name,
        characterId: character.id,
        personaId: activePersonaId || undefined,
        variantLabel: character.variantLabel || character.characterVersion || '默认版本',
        chatLabel: '私聊',
        time: '刚刚',
        preview: '',
        unread: 0,
        isPinned: false,
        isMuted: false,
        draft: '',
        isGroup: false,
      };
      window.localStorage.setItem('line:chat-items', JSON.stringify([created, ...list]));
      return conversationId;
    } catch {
      return character.id || '';
    }
  };

  /** 听角色歌单 → 可选：角色在 LINE 私聊发一句（冷却防刷） */
  const maybeNotifyCharPlaylistListen = async (input: {
    playlistKey: string;
    characterId: string;
    playlistName: string;
    track: MusicTrack;
  }) => {
    if (!canNotifyCharPlaylistListen(input.playlistKey)) return;
    const character = charactersRef.current.find((item) => item.id === input.characterId);
    if (!character) return;
    const conversationId = ensureLineConversationForCharacter(character);
    if (!conversationId) return;
    markCharPlaylistListenNotified(input.playlistKey);
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const ctx = resolveMusicPersonaContext(character);
      const result = await generateCharacterReply({
        settings,
        character,
        characterProfile: ctx.characterProfile,
        persona: ctx.persona,
        worldbooks: ctx.worldbooks,
        memory: ctx.memory,
        messages: [],
        userMessage: [
          '系统提示（用户不会看到）：对方刚才在音乐 App 里听了你的歌单。',
          `歌单名：${input.playlistName}`,
          `正在听：《${input.track.name}》 - ${input.track.artist}`,
          '请发一条很短的私聊，像真人发现对方在听自己歌单时会说的话（1～2 句）。',
          '可以惊讶、开心、调侃或害羞，必须符合人设；不要解释系统，不要提 AI。',
        ].join('\n'),
        authorNote: [
          '这是音乐 App「听了角色歌单」触发的主动私聊。',
          '只发一条短讯，自然口语。',
        ].join('\n'),
        cotTarget: 'line',
        temperature: Math.min(1, (settings.temperature || 0.85) + 0.05),
      });
      const text = String(result.text || '').trim();
      if (!text) return;
      appendLineRuntimeMessage(conversationId, {
        id: 'charpl-listen-' + Date.now().toString(36),
        sender: 'other',
        senderName: character.name,
        type: 'ai-reply',
        text,
        time: '刚刚',
        status: 'sent',
        isRead: false,
        metadata: {
          source: 'char-playlist-listen',
          playlistKey: input.playlistKey,
          trackId: input.track.id,
        },
      });
      showToast(`${character.name} 好像发现你在听 TA 的歌单`);
    } catch {
      /* 通知失败静默，不影响播放 */
    }
  };
  const maybeNotifyCharPlaylistListenRef = useRef(maybeNotifyCharPlaylistListen);
  maybeNotifyCharPlaylistListenRef.current = maybeNotifyCharPlaylistListen;

  /** 一起听时：角色按人设决定要不要收藏当前歌（每首歌每场最多一次） */
  const collectedTogetherKeysRef = useRef<Set<string>>(new Set());
  const autoCollectTimerRef = useRef<number | null>(null);
  const maybeCharCollectTogetherSong = async (
    nextSession: MusicStrangerSession,
    track: MusicTrack,
  ) => {
    if (!getCharTogetherAutoCollectEnabled()) return;
    if (!nextSession || nextSession.status === 'ended' || !track?.id) return;
    const character = charactersRef.current.find((item) => item.id === nextSession.characterId);
    if (!character) return;
    const key = `${nextSession.id}|${track.id}`;
    if (collectedTogetherKeysRef.current.has(key)) return;
    // 先占位，避免并发重复判断
    collectedTogetherKeysRef.current.add(key);
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const ctx = resolveMusicPersonaContext(character);
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          '你正在和用户一起听歌。根据角色人设判断：要不要把「当前这首歌」收藏进自己的歌单。',
          '只输出 JSON，不要 markdown：{"collect":true或false,"line":"若收藏则一句短反应，否则空字符串"}',
          '不要每首都收藏；只有真的合口味、想留下时才 collect=true。',
          nextSession.mode === 'stranger'
            ? `对外是音乐 ID「${strangerDisplayName(nextSession)}」，line 里不要暴露角色真名。`
            : `你就是${character.name}。`,
          '',
          '【角色系统提示】',
          String(character.systemPrompt || '').slice(0, 600) || '未填写',
          '【性格】',
          String(character.personality || '').slice(0, 400),
          '【描述】',
          String(character.description || '').slice(0, 300),
          ctx.memory.summary ? `【记忆】\n${String(ctx.memory.summary).slice(0, 200)}` : '',
        ].filter(Boolean).join('\n'),
        userPrompt: [
          `当前一起听：《${track.name}》 - ${track.artist}`,
          '要不要收藏？只输出 JSON。',
        ].join('\n'),
        temperature: Math.min(1, (settings.temperature || 0.85) + 0.05),
      });
      const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text) as {
        collect?: boolean;
        line?: string;
      };
      if (!parsed?.collect) return;
      addTrackToCharacterPlaylist(
        {
          id: character.id,
          name: character.name,
          variantLabel: character.variantLabel || character.characterVersion,
        },
        track,
        '一起听收藏',
      );
      const line = String(parsed.line || '').trim().slice(0, 60);
      const still = sessionRef.current;
      if (still && still.id === nextSession.id && still.status !== 'ended') {
        const note = line || `收藏了《${track.name}》`;
        const withLog = {
          ...still,
          reactionLog: [
            ...still.reactionLog,
            { trackId: track.id, text: note, createdAt: new Date().toISOString() },
          ],
          updatedAt: new Date().toISOString(),
        };
        sessionRef.current = withLog;
        setSession(withLog);
        saveStrangerSession(withLog);
        if (line) setBubble(line);
      }
      showToast(
        nextSession.mode === 'stranger'
          ? `${strangerDisplayName(nextSession)} 收藏了这首`
          : `${character.name} 收藏了这首`,
      );
      pushFavState();
    } catch {
      // 判断失败则允许稍后同歌再试
      collectedTogetherKeysRef.current.delete(key);
    }
  };
  const maybeCharCollectTogetherSongRef = useRef(maybeCharCollectTogetherSong);
  maybeCharCollectTogetherSongRef.current = maybeCharCollectTogetherSong;

  const scheduleCharAutoCollect = (nextSession: MusicStrangerSession | null, track: MusicTrack | null) => {
    if (autoCollectTimerRef.current) {
      window.clearTimeout(autoCollectTimerRef.current);
      autoCollectTimerRef.current = null;
    }
    if (!nextSession || !track || nextSession.status === 'ended') return;
    if (!getCharTogetherAutoCollectEnabled()) return;
    const key = `${nextSession.id}|${track.id}`;
    if (collectedTogetherKeysRef.current.has(key)) return;
    // 听一会儿再决定，别一开口就收藏
    const delay = 35_000 + Math.floor(Math.random() * 25_000);
    autoCollectTimerRef.current = window.setTimeout(() => {
      autoCollectTimerRef.current = null;
      const live = sessionRef.current;
      const cur = currentRef.current;
      if (!live || live.id !== nextSession.id || live.status === 'ended') return;
      if (!cur || cur.id !== track.id) return;
      void maybeCharCollectTogetherSongRef.current(live, cur);
    }, delay);
  };

  const post = (frame: HTMLIFrameElement | null, payload: Record<string, unknown>) => {
    frame?.contentWindow?.postMessage({ source: SHELL, ...payload }, '*');
  };

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 50);
  };

  const refreshProfiles = () => {
    setProfiles(getMusicProfiles());
    setActiveId(getActiveMusicProfileId());
    setLiked(getLikedTracks());
    setRecords(getMusicListenHistory(getActiveMusicProfileId()));
  };

  const pushMeState = (extra?: { toast?: string }) => {
    const activeProfileId = getActiveMusicProfileId();
    const nextProfiles = getMusicProfiles();
    const nextLiked = getLikedTracks();
    const nextRecords = getMusicListenHistory(activeProfileId);
    const companions = buildCompanions(nextRecords, characters);
    const linePersonas = readLinePersonas();
    const lineActivePersonaId = readLineActivePersonaId();
    post(meRef.current, {
      type: 'me-state',
      profiles: nextProfiles.map((profile) => ({
        ...profile,
        personaAvatar: resolveLinePersonaAvatar(profile.personaId),
      })),
      activeId: activeProfileId,
      liked: nextLiked.map(trackPayload),
      records: nextRecords.map((record) => ({
        ...record,
        timeLabel: record.timeLabel || formatListenTimeLabel(new Date(record.at)),
      })),
      companions,
      characters: characterPayload(characters),
      personas: linePersonas.map((item) => ({
        id: item.id,
        name: item.name || '未命名',
        avatar: personaAvatarValue(item),
        isDefault: Boolean(item.isDefault),
      })),
      activePersonaId: lineActivePersonaId || '',
      meAvatar: resolveLinePersonaAvatar(getActiveMusicProfile()?.personaId),
      theme,
      toast: extra?.toast || '',
    });
  };

  // 获取云音乐歌单（拉完写入本地缓存，下次打开直接用，不必每次刷新）
  const loadCloudPlaylists = async () => {
    if (!musicCookie) {
      showToast('请先登录网易云账号');
      return;
    }
    if (cloudLoading) return;
    setCloudLoading(true);
    try {
      const playlists = await fetchUserPlaylists();
      const cache = saveCachedCloudPlaylists(playlists);
      setCloudPlaylists(playlists);
      setCloudSyncedAt(cache?.syncedAt || Date.now());
      showToast(`已缓存 ${playlists.length} 个歌单`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '获取歌单失败');
    } finally {
      setCloudLoading(false);
    }
  };

  const pushFavState = (extra?: {
    toast?: string;
    openNowPlaying?: boolean;
    bubble?: string;
    searchResults?: MusicTrack[];
    searching?: boolean;
  }) => {
    post(favRef.current, {
      type: 'music-state',
      liked: liked.map(trackPayload),
      searchResults: (extra?.searchResults ?? searchResults).map((track) => ({
        ...trackPayload(track),
        liked: liked.some((item) => item.id === track.id),
      })),
      characters: characterPayload(characters),
      meAvatar: resolveLinePersonaAvatar(getActiveMusicProfile()?.personaId),
      playlists: getCharacterPlaylists().map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks.map(trackPayload),
      })),
      myPlaylists: profiles.map(p => ({
        id: p.id,
        name: p.name || '未命名',
        tracks: p.likedTrackIds.map(id => {
          const track = liked.find(t => t.id === id);
          return track ? trackPayload(track) : null;
        }).filter(Boolean),
      })),
      cloudPlaylists: cloudPlaylists.map(pl => ({
        id: pl.id,
        name: pl.name,
        cover: pl.coverImgUrl,
        trackCount: pl.trackCount,
      })),
      cloudSyncedAt,
      current: current ? trackPayload(current) : null,
      pos,
      dur: dur || current?.duration || 0,
      on: playing,
      session: sessionPayload(session, characters),
      meMusicId: getActiveMusicProfile()?.name || '我',
      playMode,
      searching: extra?.searching ?? searching,
      apiBase,
      musicCookie: musicCookie
        ? { musicU: musicCookie.musicU, loggedAt: musicCookie.loggedAt, nickname: musicCookie.nickname }
        : null,
      theme,
      charAutoCollect: getCharTogetherAutoCollectEnabled(),
      charPlNotify: getCharPlaylistNotifyEnabled(),
      toast: extra?.toast || toast || '',
      openNowPlaying: extra?.openNowPlaying ?? openNowPlaying,
      bubble: extra?.bubble || bubble || '',
    });
    if (extra?.openNowPlaying) setOpenNowPlaying(false);
    if (extra?.bubble) setBubble('');
    if (toast) setToast('');
  };

  const pushHistoryState = () => {
    const activeProfileId = getActiveMusicProfileId();
    let list = getMusicListenHistory(activeProfileId);
    const who = historyFilterWho.current;
    if (who) list = list.filter((item) => item.name === who || item.musicId === who);
    post(historyRef.current, {
      type: 'history-state',
      records: list.map((record) => {
        // 匿名/陌生人记录：界面不露角色真脸；characterId 仍保留在数据里
        const hideFace = record.kind === 's' || record.anonymous;
        return {
          ...record,
          characterId: record.characterId || '',
          musicId: record.musicId || (record.kind === 's' ? record.name : ''),
          anonymous: Boolean(record.anonymous),
          avatar: hideFace
            ? ''
            : (
              charactersRef.current.find((item) => item.id === record.characterId)?.avatar
              || charactersRef.current.find((item) => item.name === record.name)?.avatar
              || ''
            ),
        };
      }),
    });
  };

  const pushMyPlState = () => {
    const profileId = getActiveMusicProfileId();
    const playlists = getUserPlaylists(profileId).map((item) => ({
      id: item.id,
      n: item.name,
      d: item.description,
      k: item.kind,
      f: item.fromCharacter || '',
      c: item.colors,
      tracks: item.tracks.map((track) => ({
        id: track.id,
        n: track.name,
        name: track.name,
        a: track.artist,
        artist: track.artist,
        c: pickTrackColors(track.id || track.name),
      })),
    }));
    post(myPlRef.current, {
      type: 'mypl-state',
      playlists,
      liked: likedRef.current.map((track) => ({
        id: track.id,
        n: track.name,
        name: track.name,
        a: track.artist,
        artist: track.artist,
        c: pickTrackColors(track.id || track.name),
      })),
      cloudPlaylists: cloudPlaylists.map((pl) => ({
        id: pl.id,
        name: pl.name,
        cover: pl.coverImgUrl,
        trackCount: pl.trackCount,
      })),
      cloudSyncedAt,
      loggedIn: Boolean(musicCookie),
      cloudLoading,
    });
  };

  const pushCharPlState = (busy = '') => {
    const archives = getCharPlaylistArchives();
    post(charPlRef.current, {
      type: 'charpl-state',
      characters: charactersRef.current.map((item) => ({
        id: item.id,
        n: item.name,
        h: pickHue(item.id || item.name),
        avatar: item.avatar || '',
      })),
      archives,
      likedIds: likedRef.current.map((track) => track.id),
      collected: getCollectedKeys(),
      busy,
      max: CHAR_PLAYLIST_MAX_BATCHES,
    });
  };

  const normalizeSongText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/[\s\u3000]+/g, '')
      .replace(/[《》〈〉「」『』【】\[\]()（）"'`·・.\-_—–|/\\]/g, '');

  const parseSongQuery = (raw: unknown): { title: string; artist: string; query: string } => {
    let text = '';
    if (raw && typeof raw === 'object') {
      const obj = raw as { name?: string; title?: string; artist?: string; singer?: string };
      text = [obj.name || obj.title || '', obj.artist || obj.singer || ''].filter(Boolean).join(' - ');
    } else {
      text = String(raw || '').trim();
    }
    text = text
      .replace(/^[-*•\d.、)\s]+/, '')
      .replace(/^歌曲[:：]\s*/i, '')
      .replace(/^['"「」《》]+|['"「」《》]+$/g, '')
      .trim();
    const wrapped = text.match(/^《([^》]+)》\s*[-—–|/·]\s*(.+)$/);
    if (wrapped) {
      return { title: wrapped[1].trim(), artist: wrapped[2].trim(), query: `${wrapped[1].trim()} ${wrapped[2].trim()}` };
    }
    const plain = text.match(/^(.+?)\s*[-—–|/·]\s*(.+)$/);
    if (plain) {
      return { title: plain[1].replace(/[《》]/g, '').trim(), artist: plain[2].trim(), query: `${plain[1].replace(/[《》]/g, '').trim()} ${plain[2].trim()}` };
    }
    const onlyTitle = text.replace(/[《》]/g, '').trim();
    return { title: onlyTitle, artist: '', query: onlyTitle };
  };

  const scoreTrackMatch = (track: MusicTrack, title: string, artist: string) => {
    const tName = normalizeSongText(track.name);
    const tArtist = normalizeSongText(track.artist);
    const qTitle = normalizeSongText(title);
    const qArtist = normalizeSongText(artist);
    if (!tName || !qTitle) return 0;
    let score = 0;
    if (tName === qTitle) score += 80;
    else if (tName.includes(qTitle) || qTitle.includes(tName)) score += 48;
    else return 0;
    if (qArtist) {
      if (tArtist === qArtist) score += 40;
      else if (tArtist.includes(qArtist) || qArtist.includes(tArtist)) score += 22;
      else score -= 12;
    }
    return score;
  };

  /** 把 AI 给的「歌名 - 歌手」解析后搜真实曲库，优先命中匹配项，而不是盲目取第一条 */
  const resolveOneSong = async (raw: unknown, seen: Set<string>): Promise<MusicTrack | null> => {
    const { title, artist, query } = parseSongQuery(raw);
    if (!query) return null;
    const candidates = [
      query,
      title && artist ? `${title} ${artist}` : '',
      title && artist ? `${title}-${artist}` : '',
      title,
    ].filter(Boolean);
    let best: { track: MusicTrack; score: number } | null = null;
    for (const q of candidates) {
      try {
        const hits = await searchMusic(q);
        for (const hit of hits.slice(0, 12)) {
          if (seen.has(hit.id)) continue;
          const score = scoreTrackMatch(hit, title, artist);
          // 没写歌手时，标题足够像也可以收
          const accept = artist ? score >= 70 : score >= 48;
          if (!accept) continue;
          if (!best || score > best.score) best = { track: hit, score };
          if (score >= 110) break;
        }
        if (best && best.score >= 90) break;
      } catch {
        /* try next query shape */
      }
    }
    if (!best) return null;
    seen.add(best.track.id);
    return best.track;
  };

  const resolveSongs = async (queries: unknown[], limit = 5): Promise<MusicTrack[]> => {
    const out: MusicTrack[] = [];
    const seen = new Set<string>();
    for (const raw of queries || []) {
      const track = await resolveOneSong(raw, seen);
      if (track) out.push(track);
      if (out.length >= limit) break;
    }
    return out;
  };

  /** 按人设要几组搜索词，再从曲库捞真歌（AI 失败时的正确兜底，绝不能直接塞用户喜欢） */
  const resolvePersonaSeedTracks = async (character: ImportedCharacter, need = 8): Promise<MusicTrack[]> => {
    const settings = readStoredAiSettings(character.id, character.name);
    const ctx = resolveMusicPersonaContext(character);
    let seeds: string[] = [];
    try {
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          '你要根据角色人设给出音乐搜索词，用于在曲库里找 TA 会听的歌。',
          '只输出 JSON 数组，不要 markdown，不要解释。',
          '格式：["搜索词1","搜索词2"]，4～6 个。',
          '可以是真实歌手名、曲风、或「歌名 歌手」；必须可搜索；不要角色真名。',
        ].join('\n'),
        userPrompt: [
          `角色：${character.name}`,
          '【角色系统提示】',
          String(character.systemPrompt || '').slice(0, 500) || '未填写',
          '【性格】',
          String(character.personality || '').slice(0, 500),
          '【场景】',
          String(character.scenario || '').slice(0, 300),
          '【描述】',
          String(character.description || '').slice(0, 400),
          ctx.memory.summary ? `【记忆】\n${String(ctx.memory.summary).slice(0, 300)}` : '',
        ].filter(Boolean).join('\n'),
        temperature: Math.min(1, (settings.temperature || 0.85) + 0.1),
      });
      const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      const parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
      if (Array.isArray(parsed)) {
        seeds = parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
      }
    } catch {
      seeds = [];
    }
    if (!seeds.length) {
      const blob = [character.personality, character.scenario, character.description].join(' ');
      const guess = Array.from(blob.match(/[\u4e00-\u9fff]{2,6}/g) || []).slice(0, 4);
      seeds = guess.length ? guess : ['流行', '轻音乐', '民谣', '治愈'];
    }
    const out: MusicTrack[] = [];
    const seen = new Set<string>();
    for (const seed of seeds) {
      try {
        const hits = await searchMusic(seed);
        for (const hit of hits.slice(0, 3)) {
          if (seen.has(hit.id)) continue;
          seen.add(hit.id);
          out.push(hit);
          if (out.length >= need) return out;
        }
      } catch {
        /* next seed */
      }
    }
    return out;
  };

  const buildBatchFromTracks = (
    character: ImportedCharacter,
    tracks: MusicTrack[],
    sig: string,
  ): CharPlaylistBatch => {
    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
    const pick = shuffle(tracks).slice(0, 10);
    const a = pick.slice(0, Math.min(5, Math.max(3, Math.ceil(pick.length * 0.55))));
    const b = pick.slice(a.length, a.length + 5);
    const cards: CharPlaylistCard[] = [
      {
        name: `${character.name.slice(0, 6)}最近在听`.slice(0, 18),
        blurb: '按 TA 的品味从曲库挑的。',
        colors: paletteColor(pickHue(character.id)),
        tracks: a.map(trackToSong),
      },
      {
        name: '循环备选',
        blurb: '想多听几遍的。',
        colors: paletteColor(pickHue(character.name) + 3),
        tracks: b.map(trackToSong),
      },
    ].filter((card) => card.tracks.length);
    cards.push({
      name: '不给别人看的',
      blurb: '',
      locked: true,
      colors: paletteColor(5),
      tracks: [],
    });
    return {
      at: Date.now(),
      sig: sig.slice(0, 60),
      playlists: cards,
    };
  };

  const fallbackBatchForCharacter = async (character: ImportedCharacter): Promise<CharPlaylistBatch> => {
    const personaTracks = await resolvePersonaSeedTracks(character, 8);
    if (personaTracks.length) {
      return buildBatchFromTracks(character, personaTracks, '最近耳机里换了几首，按自己的心情挑的。');
    }
    // 实在搜不到：可少量参考用户喜欢，但文案标明，且不能冒充「整份角色歌单=你的喜欢」
    const liked = likedRef.current.slice(0, 4);
    if (liked.length) {
      return buildBatchFromTracks(
        character,
        liked,
        '曲库这会儿不太给力，先拿你喜欢的几首垫着，下次再按人设重生成。',
      );
    }
    return {
      at: Date.now(),
      sig: '想听的歌还没捞到，过会儿再生成一次。',
      playlists: [
        {
          name: '先空着',
          blurb: '检查音乐 API，或稍后再生成。',
          colors: paletteColor(0),
          tracks: [],
        },
        {
          name: '不给别人看的',
          blurb: '',
          locked: true,
          colors: paletteColor(5),
          tracks: [],
        },
      ],
    };
  };

  const generateBatchForCharacter = async (character: ImportedCharacter): Promise<CharPlaylistBatch> => {
    const likedSample = likedRef.current
      .slice(0, 10)
      .map((track) => `《${track.name}》-${track.artist}`)
      .join('\n');
    const ctx = resolveMusicPersonaContext(character);
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          '你在为角色生成「最近在听的歌单」。必须严格按角色人设与记忆选歌，不能套用用户口味当主角。',
          '用户喜欢列表只是可选参考（可有 0～2 首呼应），主体必须是角色自己会听的歌。',
          '只输出 JSON，不要 markdown，不要解释。',
          '格式：{"sig":"一句近况","playlists":[{"name":"歌单名","blurb":"一句说明","songs":["歌名 - 歌手","歌名 - 歌手"]}]}',
          '要求：playlists 正好 2 个开放歌单；每个 songs 4～5 首；必须是真实存在、可在网易云搜到的歌；格式固定「歌名 - 歌手」。',
          '禁止编造不存在的歌名；禁止把角色真名写进歌单名以外的歌曲字段。',
        ].join('\n'),
        userPrompt: [
          `角色：${character.name}`,
          character.variantLabel || character.characterVersion || '',
          '【角色系统提示】',
          String(character.systemPrompt || '').slice(0, 800) || '未填写',
          '【描述】',
          String(character.description || '').slice(0, 600),
          '【性格】',
          String(character.personality || '').slice(0, 600),
          '【场景】',
          String(character.scenario || '').slice(0, 400),
          ctx.memory.summary ? `【长期记忆】\n${String(ctx.memory.summary).slice(0, 400)}` : '',
          likedSample
            ? `【用户最近喜欢·仅供少量呼应】\n${likedSample}`
            : '用户还没有喜欢列表。请纯按角色人设选歌。',
          '请生成这份角色歌单 JSON。',
        ].filter(Boolean).join('\n'),
        temperature: Math.min(0.92, (settings.temperature || 0.8) + 0.05),
      });
      const jsonText = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      const parsed = JSON.parse(start >= 0 ? jsonText.slice(start, end + 1) : jsonText) as {
        sig?: string;
        playlists?: Array<{ name?: string; blurb?: string; songs?: unknown[] }>;
      };
      const playlists: CharPlaylistCard[] = [];
      for (const [index, item] of (parsed.playlists || []).slice(0, 3).entries()) {
        const songList = Array.isArray(item.songs) ? item.songs : [];
        const tracks = await resolveSongs(songList, 5);
        if (tracks.length < 2) continue; // 搜不到的空壳歌单直接丢掉
        playlists.push({
          name: String(item.name || `${character.name}的歌单`).slice(0, 18),
          blurb: String(item.blurb || '').slice(0, 40),
          colors: paletteColor(index + pickHue(character.id)),
          tracks: tracks.map(trackToSong),
        });
      }
      // AI 给的歌大多搜不到 → 用人设搜索词兜底，而不是塞用户喜欢
      if (!playlists.length) return await fallbackBatchForCharacter(character);
      playlists.push({
        name: '不给别人看的',
        blurb: '',
        locked: true,
        colors: paletteColor(5),
        tracks: [],
      });
      return {
        at: Date.now(),
        sig: String(parsed.sig || '最近耳机里一直有歌。').slice(0, 60),
        playlists,
      };
    } catch {
      return await fallbackBatchForCharacter(character);
    }
  };

  const runCharPlaylistGenerate = async (characterIds: string[], mode?: 'sum' | 'del') => {
    const list = characterIds
      .map((id) => charactersRef.current.find((item) => item.id === id))
      .filter(Boolean) as ImportedCharacter[];
    if (!list.length) {
      showToast('还没有可选角色');
      return;
    }
    let done = 0;
    pushCharPlState(`0/${list.length}`);
    for (const character of list) {
      const batch = await generateBatchForCharacter(character);
      upsertCharBatch(character.id, character.name, batch, mode);
      // 同步到旧的 character playlist store，方便别处读取
      for (const card of batch.playlists) {
        if (card.locked || !card.tracks.length) continue;
        for (const song of card.tracks) {
          addTrackToCharacterPlaylist(
            {
              id: character.id,
              name: character.name,
              variantLabel: character.variantLabel || character.characterVersion,
            },
            songToTrack(song),
            card.name,
          );
        }
      }
      done += 1;
      pushCharPlState(`${done}/${list.length}`);
    }
    pushCharPlState('');
    showToast(list.length > 1 ? '所有角色的新歌单都好了' : `${list[0].name} 的新歌单好了`);
  };

  const playTrack = async (track: MusicTrack, autoplay = true) => {
    try {
      const resolved = await resolveTrackUrl(track);
      if (!resolved.playUrl) throw new Error('这首歌暂不可播放，换一首试试');
      setCurrent(resolved);
      saveMusicCurrent(resolved);
      setPos(0);
      setDur(Number(resolved.duration) || 0);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = resolved.playUrl;
        audio.load();
        if (autoplay) {
          await audio.play();
          setPlaying(true);
        } else {
          setPlaying(false);
        }
      } else {
        setPlaying(autoplay);
      }
      const sessionNow = sessionRef.current;
      if (sessionNow && sessionNow.status !== 'ended') {
        const next = { ...sessionNow, track: resolved, updatedAt: new Date().toISOString() };
        sessionRef.current = next;
        setSession(next);
        // save 会触发 stranger-changed → ensureTogetherRecord（同 session 多首各写一条）
        saveStrangerSession(next);
        scheduleCharAutoCollect(next, resolved);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '播放失败');
    }
  };

  const CHAR_RANDOM_FALLBACK = ['民谣', '古风', '轻音乐', '流行', '日系', '摇滚'];
  const charRandBusyRef = useRef(false);
  const charRandTimerRef = useRef<number | null>(null);

  /** 按完整角色人设让 AI 给出搜索词，再搜可播曲目 */
  const askPersonaSongQuery = async (nextSession: MusicStrangerSession, track: MusicTrack) => {
    const character = charactersRef.current.find((item) => item.id === nextSession.characterId);
    if (!character) return '';
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const ctx = resolveMusicPersonaContext(character);
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          musicSessionAuthorNote(nextSession, character),
          '你要根据角色人设与记忆品味挑选下一首想听的歌。',
          '只输出一行搜索词：可以是歌名、歌手，或「歌名 歌手」，2～12 个字。',
          '不要解释、不要引号、不要标点堆砌、不要输出多行。',
          '',
          '【角色系统提示】',
          character.systemPrompt || '未填写',
          '【角色卡】',
          character.description,
          character.personality,
          character.scenario,
          ctx.memory.summary ? `【长期记忆摘要】\n${ctx.memory.summary}` : '',
        ].filter(Boolean).join('\n'),
        userPrompt: [
          `当前在听：《${track.name}》 ${track.artist}`,
          '请给出下一首你想切过去的搜索词（只要一行）。',
        ].join('\n'),
        temperature: Math.min(1, (settings.temperature || 0.85) + 0.1),
      });
      const line = String(raw || '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean) || '';
      return line
        .replace(/^['"「」《》]+|['"「」《》]+$/g, '')
        .replace(/^(搜索词|下一首|我想听)[:：\s]*/i, '')
        .slice(0, 24)
        .trim();
    } catch {
      return '';
    }
  };

  /** 角色按人设自行起一个对外音乐 ID */
  const askCharacterPickMusicId = async (character: ImportedCharacter) => {
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const ctx = resolveMusicPersonaContext(character);
      const raw = await generateCreativeText({
        settings,
        systemPrompt: [
          '你正在音乐 App 的陌生人/匿名一起听里给自己起一个对外「音乐 ID」。',
          '必须贴合角色内在性格与品味，但不能暴露角色真名、作品名或可认出身份的线索。',
          '只输出一个 ID：2～8 个汉字或字母数字，不要空格、不要解释、不要引号、不要多行。',
          '',
          '【角色系统提示】',
          character.systemPrompt || '未填写',
          '【角色卡】',
          character.description,
          character.personality,
          character.scenario,
          ctx.memory.summary ? `【长期记忆摘要】\n${ctx.memory.summary}` : '',
        ].filter(Boolean).join('\n'),
        userPrompt: `角色真名（仅供内在参考，禁止出现在 ID 里）：${character.name}\n请起一个你现在想用的音乐 ID。`,
        temperature: Math.min(1, (settings.temperature || 0.85) + 0.15),
      });
      const line = String(raw || '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean) || '';
      const picked = normalizeMusicId(
        line.replace(/^(音乐\s*ID|我的ID|ID)[:：\s]*/i, ''),
        '',
      );
      if (!picked || picked === '听众') return '';
      // 避免直接用真名当 ID
      if (picked === character.name || character.name.includes(picked)) return '';
      return setCharacterMusicId(character.id, picked, character.name);
    } catch {
      return '';
    }
  };

  /** 一起听：按人设搜歌切歌（受切歌节奏设定约束） */
  const runCharRandomSong = async (opts?: { quiet?: boolean }) => {
    const sessionNow = sessionRef.current;
    if (!sessionNow || sessionNow.status === 'ended' || !sessionAllowsCharRandom(sessionNow)) return false;
    if (charRandBusyRef.current) return false;
    charRandBusyRef.current = true;
    const currentTrack = currentRef.current || sessionNow.track;
    if (!opts?.quiet) showToast('TA 正在按品味选歌…');
    try {
      let seed = currentTrack ? await askPersonaSongQuery(sessionNow, currentTrack) : '';
      if (!seed) {
        seed = CHAR_RANDOM_FALLBACK[Math.floor(Math.random() * CHAR_RANDOM_FALLBACK.length)];
      }
      const tracks = await searchMusic(seed);
      const order = [...tracks].sort(() => Math.random() - 0.5).slice(0, 12);
      let pick: MusicTrack | null = null;
      for (const candidate of order) {
        if (currentTrack && candidate.id === currentTrack.id) continue;
        try {
          const resolved = await resolveTrackUrl(candidate);
          if (resolved.playUrl) {
            pick = resolved;
            break;
          }
        } catch {
          /* try next */
        }
      }
      const still = sessionRef.current;
      if (!pick || !still || still.status === 'ended' || still.id !== sessionNow.id || !sessionAllowsCharRandom(still)) {
        if (!pick && !opts?.quiet) showToast('这会儿没搜到合 TA 品味的歌');
        return false;
      }
      await playTrack(pick);
      const who = strangerDisplayName(still);
      const next = {
        ...still,
        track: pick,
        reactionLog: [
          ...still.reactionLog,
          { trackId: pick.id, text: `TA 切到了《${pick.name}》`, createdAt: new Date().toISOString() },
        ],
        updatedAt: new Date().toISOString(),
      };
      sessionRef.current = next;
      setSession(next);
      saveStrangerSession(next);
      ensureTogetherRecord(next, '一起听中 · TA 切的歌');
      setBubble(`${who} 切到了《${pick.name}》`);
      if (!opts?.quiet) showToast(`${who} 切到了《${pick.name}》`);
      return true;
    } catch (error) {
      if (!opts?.quiet) {
        showToast(error instanceof Error ? error.message : '选歌失败，检查一下音乐 API');
      }
      return false;
    } finally {
      charRandBusyRef.current = false;
    }
  };
  const runCharRandomSongRef = useRef(runCharRandomSong);
  runCharRandomSongRef.current = runCharRandomSong;

  /** 一起听写入听歌记录：同场同曲只占一行，再听只加 plays */
  const ensureTogetherRecord = (nextSession: MusicStrangerSession, note: string) => {
    if (!nextSession?.id || nextSession.status === 'ended') return;
    if (!nextSession.characterId) return;
    const track = nextSession.track;
    if (!track?.name) return;
    const trackId = String(track.id || '');
    const songKey = listenSongKey({ trackId, song: track.name, artist: track.artist });
    const profileId = getActiveMusicProfileId();
    const musicId =
      nextSession.mode === 'stranger'
        ? (nextSession.musicId || getCharacterMusicId(nextSession.characterId, nextSession.characterName))
        : undefined;
    const sessionRows = getMusicListenHistory().filter(
      (item) =>
        String(item.sessionId || '') === String(nextSession.id)
        && (!item.profileId || item.profileId === profileId),
    );
    const related = sessionRows.find((item) => listenSongKey(item) === songKey);
    if (related) {
      const latest = [...sessionRows].sort(
        (a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''),
      )[0];
      // 切走过又切回来：次数 +1；同曲重复 sync 不涨次数
      const switchedBack = Boolean(latest && listenSongKey(latest) !== songKey);
      const at = new Date();
      updateMusicListenRecord(related.id, {
        characterId: related.characterId || nextSession.characterId,
        musicId: related.musicId || musicId,
        anonymous: nextSession.mode === 'stranger' ? Boolean(nextSession.anonymous) : false,
        cover: safeAlbumCover(related.cover) || safeAlbumCover(track.cover),
        song: related.song || track.name,
        artist: related.artist || track.artist,
        trackId: related.trackId || trackId || undefined,
        plays: switchedBack ? Math.max(1, related.plays || 1) + 1 : Math.max(1, related.plays || 1),
        ...(switchedBack
          ? {
              at: at.toISOString(),
              timeLabel: formatListenTimeLabel(at),
              groupLabel: formatListenGroupLabel(at),
              note,
            }
          : {}),
      });
      setRecords(getMusicListenHistory(getActiveMusicProfileId()));
      return;
    }
    const at = new Date();
    const started = Date.parse(nextSession.createdAt);
    const elapsedMin = Number.isFinite(started)
      ? Math.max(1, Math.round((Date.now() - started) / 60000))
      : Math.max(1, Math.round((Number(track.duration) || 180) / 60));
    const anonymous = nextSession.mode === 'stranger' && Boolean(nextSession.anonymous);
    const record: MusicListenRecord = {
      id: 'lr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      at: at.toISOString(),
      groupLabel: formatListenGroupLabel(at),
      timeLabel: formatListenTimeLabel(at),
      kind: nextSession.mode === 'direct' ? 'f' : 's',
      name: nextSession.mode === 'stranger' ? strangerDisplayName(nextSession) : nextSession.characterName,
      variant: nextSession.mode === 'stranger'
        ? (anonymous ? '匿名 · 音乐 ID' : '音乐 ID')
        : (nextSession.variantLabel || '默认版本'),
      hue: pickHue(nextSession.characterId || nextSession.characterName),
      song: track.name,
      artist: track.artist,
      minutes: elapsedMin,
      note,
      keep: nextSession.mode === 'direct',
      colors: pickTrackColors(track.id || track.name),
      cover: safeAlbumCover(track.cover),
      trackId: track.id,
      plays: 1,
      characterId: nextSession.characterId,
      musicId,
      anonymous,
      sessionId: nextSession.id,
      profileId: getActiveMusicProfileId(),
    };
    appendMusicListenRecord(record);
    setRecords(getMusicListenHistory(getActiveMusicProfileId()));
  };

  /** 结束一起听时：没有记录就补一条，有则回写实际时长 */
  const finalizeTogetherRecord = (nextSession: MusicStrangerSession | null) => {
    if (!nextSession?.id) return;
    const started = Date.parse(nextSession.createdAt);
    const minutes = Number.isFinite(started)
      ? Math.max(1, Math.round((Date.now() - started) / 60000))
      : Math.max(1, Math.round((Number(nextSession.track?.duration) || 180) / 60));
    const profileId = getActiveMusicProfileId();
    const musicId =
      nextSession.mode === 'stranger'
        ? (nextSession.musicId || getCharacterMusicId(nextSession.characterId, nextSession.characterName))
        : undefined;
    const anonymous = nextSession.mode === 'stranger' && Boolean(nextSession.anonymous);
    // 收尾前先确保当前曲目已写入（同 session 多首各自一条）
    ensureTogetherRecord(
      { ...nextSession, status: 'listening' },
      nextSession.mode === 'direct'
        ? 'LINE 一起听。'
        : (anonymous ? '匿名随机听歌。' : '第一次遇见。'),
    );
    const rows = getMusicListenHistory().filter(
      (item) =>
        String(item.sessionId || '') === String(nextSession.id)
        && (!item.profileId || item.profileId === profileId),
    );
    for (const item of rows) {
      updateMusicListenRecord(item.id, {
        minutes: Math.max(item.minutes || 1, minutes),
        characterId: item.characterId || nextSession.characterId,
        musicId: item.musicId || musicId,
        anonymous,
        cover: safeAlbumCover(item.cover) || (
          listenSongKey(item) === listenSongKey({
            trackId: nextSession.track?.id,
            song: nextSession.track?.name,
            artist: nextSession.track?.artist,
          })
            ? safeAlbumCover(nextSession.track?.cover)
            : ''
        ),
      });
    }
    setRecords(getMusicListenHistory(profileId));
  };

  const recordTogether = (nextSession: MusicStrangerSession, note: string) => {
    ensureTogetherRecord(nextSession, note);
  };

  const askReaction = async (nextSession: MusicStrangerSession, track: MusicTrack) => {
    const character = charactersRef.current.find((item) => item.id === nextSession.characterId);
    if (!character) return '';
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const ctx = resolveMusicPersonaContext(character);
      const result = await generateCharacterReply({
        settings,
        character,
        characterProfile: ctx.characterProfile,
        persona: ctx.persona,
        worldbooks: ctx.worldbooks,
        memory: ctx.memory,
        messages: [],
        userMessage: [
          nextSession.mode === 'stranger'
            ? (nextSession.anonymous
              ? '你刚在匿名房和一个用户因同一首歌相遇，正在一起听。'
              : '你刚和一个陌生用户因同一首歌相遇，正在一起听。')
            : '对方邀请你一起听这首歌，你们正在一起听。',
          `当前歌曲：《${track.name}》 - ${track.artist}`,
          '请说一句你对这首歌的第一反应（1～2 句短讯）。',
        ].join('\n'),
        authorNote: musicSessionAuthorNote(nextSession, character),
        cotTarget: 'line',
        temperature: settings.temperature,
      });
      return String(result.text || '').trim();
    } catch {
      return '';
    }
  };

  /** 私信：完整角色人设回复，语境是「正在一起听歌」 */
  const askDmReply = async (
    nextSession: MusicStrangerSession,
    track: MusicTrack,
    userText: string,
  ) => {
    const character = charactersRef.current.find((item) => item.id === nextSession.characterId);
    if (!character) return '';
    const isStranger = nextSession.mode === 'stranger';
    const displayAs = strangerDisplayName(nextSession);
    const messages = (nextSession.reactionLog || [])
      .slice(-16)
      .map((item) => {
        if (item.text.startsWith('我说：')) {
          return { sender: 'me' as const, text: item.text.slice(3), createdAt: item.createdAt };
        }
        if (/^TA 切到了《/.test(item.text)) {
          return { sender: 'system' as const, text: item.text, createdAt: item.createdAt };
        }
        return {
          sender: 'other' as const,
          senderName: isStranger ? displayAs : character.name,
          text: item.text,
          createdAt: item.createdAt,
        };
      });
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const ctx = resolveMusicPersonaContext(character);
      const result = await generateCharacterReply({
        settings,
        character,
        characterProfile: ctx.characterProfile,
        persona: ctx.persona,
        worldbooks: ctx.worldbooks,
        memory: ctx.memory,
        messages,
        userMessage: [
          `当前一起听：《${track.name}》 - ${track.artist}`,
          `对方刚刚说：${userText}`,
          '请用 1～3 句短讯回复对方，必须针对这句话。',
        ].join('\n'),
        authorNote: musicSessionAuthorNote(nextSession, character),
        cotTarget: 'line',
        temperature: Math.min(1, (settings.temperature || 0.85) + 0.05),
      });
      return String(result.text || '').trim();
    } catch {
      return '';
    }
  };

  /** 熟人邀请：发 LINE 邀请卡并切回对话，等角色接受/拒绝。 */
  const inviteCharacterViaLine = (character: ImportedCharacter) => {
    const track = currentRef.current;
    if (!track) {
      showToast('先播放一首歌');
      return;
    }
    if (typeof window === 'undefined') return;

    const activePersonaId = readPersistentState<string | null>('line:active-persona', null);
    const personas = readPersistentState<Array<{ id?: string; name?: string; isDefault?: boolean }>>('line:user-personas', []);
    const meName =
      (activePersonaId && personas.find((item) => item.id === activePersonaId)?.name)
      || personas.find((item) => item.isDefault)?.name
      || personas[0]?.name
      || '我';

    let conversationId = '';
    try {
      const raw = window.localStorage.getItem('line:chat-items');
      const chats = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(chats) ? chats : [];
      const existing = list.find((item: any) =>
        item
        && !item.isGroup
        && (
          String(item.characterId || '') === String(character.id)
          || String(item.name || '') === String(character.name)
        )
        && (!activePersonaId || !item.personaId || item.personaId === activePersonaId)
      );
      if (existing?.id) {
        conversationId = String(existing.id);
        const nextChats = list.map((item: any) =>
          item.id === conversationId
            ? {
                ...item,
                time: '刚刚',
                preview: `♪ 邀请一起听《${track.name}》`,
                unread: 0,
              }
            : item
        );
        window.localStorage.setItem('line:chat-items', JSON.stringify(nextChats));
      } else {
        conversationId = `c_${Date.now().toString(36)}`;
        const created = {
          id: conversationId,
          name: character.name,
          characterId: character.id,
          personaId: activePersonaId || undefined,
          variantLabel: character.variantLabel || character.characterVersion || '默认版本',
          chatLabel: '一起听歌',
          time: '刚刚',
          preview: `♪ 邀请一起听《${track.name}》`,
          unread: 0,
          isPinned: false,
          isMuted: false,
          draft: '',
          isGroup: false,
        };
        window.localStorage.setItem('line:chat-items', JSON.stringify([created, ...list]));
      }
    } catch {
      conversationId = character.id || `c_${Date.now().toString(36)}`;
    }

    const durationSec = Math.max(0, Math.round(Number(track.duration) || 0));
    const durationLabel = durationSec
      ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`
      : '—';
    const colors = pickTrackColors(track.id || track.name);
    const baseSession = createTogetherMusicSession({
      conversationId,
      title: track.name,
      artist: track.artist || '未知艺术家',
      url: track.playUrl || '',
      album: track.album || '',
      cover: track.cover || '',
      note: '想和你一起听这首。',
      durationLabel,
      colors,
      startedBy: 'me',
      status: 'invited',
    });
    const musicSession = {
      ...baseSession,
      track,
      characterId: character.id,
      characterName: character.name,
      variantLabel: character.variantLabel || character.characterVersion || '默认版本',
      mode: 'direct' as const,
    };

    const inviteMessage = {
      id: 'music-invite-' + Date.now().toString(36),
      sender: 'me' as const,
      senderName: meName,
      type: 'music-together',
      kind: 'music-together',
      text: `邀请你一起听歌：《${track.name}》`,
      time: '刚刚',
      musicSession,
      metadata: { musicSession },
    };
    appendLineRuntimeMessage(conversationId, inviteMessage);

    try {
      window.sessionStorage.setItem('line:pending-open-chat', conversationId);
      // 会话打开后立刻让角色生成回应（避免仅靠事件、组件尚未挂载时丢触发）
      window.sessionStorage.setItem(
        'line:pending-music-invite-reply',
        JSON.stringify({ conversationId, messageId: inviteMessage.id }),
      );
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('sane333:music-invite-created', {
      detail: {
        conversationId,
        open: true,
        message: inviteMessage,
        session: {
          id: musicSession.id,
          characterId: character.id,
          characterName: character.name,
          variantLabel: musicSession.variantLabel,
          track: { name: track.name },
          mode: 'direct',
        },
      },
    }));
    setOverlay('');
    onNavigate('chat');
    showToast(`已向 ${character.name} 发出一起听邀请`);
  };

  const beginSession = async (
    mode: 'direct' | 'stranger',
    character: ImportedCharacter,
    opts?: {
      anonymous?: boolean;
      /** char = 角色按人设自选；manual = 我们填写；saved = 用已保存 ID */
      musicIdMode?: 'char' | 'manual' | 'saved';
      musicId?: string;
    },
  ) => {
    // 熟人邀请走 LINE 卡片；陌生人仍在音乐里遇见
    if (mode === 'direct') {
      inviteCharacterViaLine(character);
      return;
    }
    const track = currentRef.current;
    if (!track) {
      showToast('先播放一首歌');
      return;
    }
    const anonymous = Boolean(opts?.anonymous);
    const musicIdMode = opts?.musicIdMode || 'saved';
    let musicId = '';
    if (musicIdMode === 'manual') {
      const filled = normalizeMusicId(String(opts?.musicId || ''), '');
      if (!filled) {
        showToast('请先填写对方音乐 ID');
        return;
      }
      musicId = setCharacterMusicId(character.id, filled, character.name);
    } else if (musicIdMode === 'char') {
      showToast('角色正在按人设起音乐 ID…');
      musicId = await askCharacterPickMusicId(character);
      if (!musicId) {
        musicId = getCharacterMusicId(character.id, character.name);
        showToast('角色没想好，先用备用 ID');
      }
    } else {
      musicId = getCharacterMusicId(character.id, character.name);
    }
    const nextSession: MusicStrangerSession = {
      id: 'music-' + mode + '-' + Date.now().toString(36),
      mode,
      characterId: character.id,
      characterName: character.name,
      variantLabel: character.variantLabel || character.characterVersion || '默认版本',
      musicId,
      anonymous,
      allowCharRandomSong: true,
      charRandomPace: 'rare',
      track,
      status: 'listening',
      reactionLog: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSession(nextSession);
    saveStrangerSession(nextSession);
    setOpenNowPlaying(true);
    recordTogether(nextSession, anonymous ? '匿名随机听歌。' : '第一次遇见。');
    const reaction = await askReaction(nextSession, track);
    let liveSession = nextSession;
    if (reaction) {
      liveSession = {
        ...nextSession,
        reactionLog: [{ trackId: track.id, text: reaction, createdAt: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      };
      setSession(liveSession);
      saveStrangerSession(liveSession);
      setBubble(reaction);
    }
    scheduleCharAutoCollect(liveSession, track);
    showToast(anonymous ? `匿名房 · 遇见 ${musicId}` : `你遇见了 ${musicId}`);
  };

  const emitPlayback = (partial?: { playing?: boolean; pos?: number; dur?: number }) => {
    const audio = audioRef.current;
    window.dispatchEvent(
      new CustomEvent('sane333:music-playback', {
        detail: {
          playing: partial?.playing ?? (audio ? !audio.paused : playing),
          pos: partial?.pos ?? (audio?.currentTime || pos || 0),
          dur: partial?.dur ?? (audio?.duration || dur || currentRef.current?.duration || 0),
        },
      }),
    );
  };

  // Keep audio clock in sync with favourite iframe + Dynamic Island.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const nextPos = audio.currentTime || 0;
      const nextDur = audio.duration || dur || current?.duration || 0;
      setPos(nextPos);
      setDur(nextDur);
      post(favRef.current, {
        type: 'music-tick',
        pos: nextPos,
        dur: nextDur,
        on: !audio.paused,
      });
      emitPlayback({ playing: !audio.paused, pos: nextPos, dur: nextDur });
    };
    const onEnded = () => {
      // 仅「只在当前歌放完再切」时，由角色按人设接下一首；很少/偶尔切走定时器
      const sessionNow = sessionRef.current;
      if (
        sessionNow
        && sessionNow.status !== 'ended'
        && sessionAllowsCharRandom(sessionNow)
        && sessionCharRandomPace(sessionNow) === 'songend'
      ) {
        void runCharRandomSongRef.current({ quiet: true }).then((ok) => {
          if (!ok) {
            setPlaying(false);
            emitPlayback({ playing: false });
          }
        });
        return;
      }
      const mode = playModeRef.current;
      const list = liked.length ? liked : current ? [current] : [];
      if (!list.length || !current) {
        setPlaying(false);
        emitPlayback({ playing: false });
        return;
      }
      if (mode === 'one') {
        void playTrack(current, true);
        return;
      }
      if (mode === 'shuffle') {
        if (list.length === 1) {
          void playTrack(list[0], true);
          return;
        }
        let pick = list[Math.floor(Math.random() * list.length)];
        let guard = 0;
        while (pick.id === current.id && guard < 8) {
          pick = list[Math.floor(Math.random() * list.length)];
          guard += 1;
        }
        void playTrack(pick);
        return;
      }
      const index = list.findIndex((item) => item.id === current.id);
      const next = list[(index + 1 + list.length) % list.length];
      void playTrack(next);
    };
    const onPlay = () => {
      setPlaying(true);
      emitPlayback({ playing: true });
    };
    const onPause = () => {
      setPlaying(false);
      emitPlayback({ playing: false });
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [liked, current, dur]);

  // Island / external controls: pp · next · prev
  useEffect(() => {
    const onCommand = (event: Event) => {
      const type = String((event as CustomEvent<{ type?: string }>).detail?.type || '');
      if (type !== 'pp' && type !== 'next' && type !== 'prev') return;
      const audio = audioRef.current;
      const currentNow = currentRef.current;
      const likedNow = likedRef.current;
      if (type === 'pp') {
        if (!currentNow) return;
        // No src yet (cold start from island) → resolve + play.
        if (!audio?.currentSrc) {
          void playTrack(currentNow, true);
          return;
        }
        if (audio.paused) {
          void audio.play().then(() => {
            setPlaying(true);
            emitPlayback({ playing: true });
          }).catch(() => {
            void playTrack(currentNow, true);
          });
        } else {
          audio.pause();
          setPlaying(false);
          emitPlayback({ playing: false });
        }
        return;
      }
      const list = likedNow.length ? likedNow : currentNow ? [currentNow] : [];
      if (!list.length || !currentNow) return;
      if (type === 'next' && playModeRef.current === 'shuffle' && list.length > 1) {
        let pick = list[Math.floor(Math.random() * list.length)];
        let guard = 0;
        while (pick.id === currentNow.id && guard < 8) {
          pick = list[Math.floor(Math.random() * list.length)];
          guard += 1;
        }
        void playTrack(pick);
        return;
      }
      const index = list.findIndex((item) => item.id === currentNow.id);
      const delta = type === 'next' ? 1 : -1;
      const next = list[(index + delta + list.length) % list.length];
      void playTrack(next);
    };
    window.addEventListener('sane333:music-command', onCommand as EventListener);
    return () => window.removeEventListener('sane333:music-command', onCommand as EventListener);
  }, []);

  useEffect(() => {
    const onStore = () => refreshProfiles();
    window.addEventListener('sane333:music-profiles-changed', onStore);
    window.addEventListener('sane333:music-liked-changed', onStore);
    window.addEventListener('sane333:music-history-changed', onStore);
    window.addEventListener('sane333:music-theme-changed', () => setTheme(readMusicTheme()));
    return () => {
      window.removeEventListener('sane333:music-profiles-changed', onStore);
      window.removeEventListener('sane333:music-liked-changed', onStore);
      window.removeEventListener('sane333:music-history-changed', onStore);
    };
  }, []);

  // LINE 一起听写入 localStorage 后，把会话同步进音乐页（否则仍显示单人「正在播放」）
  const playTrackRef = useRef(playTrack);
  const recordTogetherRef = useRef(recordTogether);
  const finalizeTogetherRef = useRef(finalizeTogetherRecord);
  const ensureTogetherRef = useRef(ensureTogetherRecord);
  playTrackRef.current = playTrack;
  recordTogetherRef.current = recordTogether;
  finalizeTogetherRef.current = finalizeTogetherRecord;
  ensureTogetherRef.current = ensureTogetherRecord;

  useEffect(() => {
    const syncSessionFromStore = () => {
      const prev = sessionRef.current;
      const nextSession = readStrangerSession();
      const active = nextSession && nextSession.status !== 'ended' ? nextSession : null;
      // 会话被清掉 / 标成 ended：把听歌记录收尾进音乐 App
      if (prev && (!active || String(prev.id) !== String(active.id))) {
        finalizeTogetherRef.current(prev);
      }
      sessionRef.current = active;
      setSession(active);
      if (active) {
        ensureTogetherRef.current(
          active,
          active.mode === 'direct' ? 'LINE 一起听。' : '第一次遇见。',
        );
      }
      const track = active?.track || readMusicCurrent();
      if (track) {
        currentRef.current = track;
        setCurrent(track);
      } else {
        setCurrent(readMusicCurrent());
      }
      return active;
    };
    const onStranger = () => {
      syncSessionFromStore();
    };
    const onMusic = () => {
      const track = readMusicCurrent();
      if (track) {
        currentRef.current = track;
        setCurrent(track);
      }
    };
    const onOpenTogether = () => {
      const active = syncSessionFromStore();
      if (!active) return;
      favWasOpen.current = true;
      setOverlay('fav');
      setOpenNowPlaying(true);
      ensureTogetherRef.current(
        active,
        active.mode === 'direct' ? 'LINE 一起听。' : '第一次遇见。',
      );
      const playable = active.track || currentRef.current;
      if (playable) void playTrackRef.current(playable, true);
    };
    window.addEventListener('sane333:music-stranger-changed', onStranger);
    window.addEventListener('sane333:music-changed', onMusic);
    window.addEventListener('sane333:open-music-together', onOpenTogether);
    // 冷启动时若已在一起听，也补一条记录
    syncSessionFromStore();
    return () => {
      window.removeEventListener('sane333:music-stranger-changed', onStranger);
      window.removeEventListener('sane333:music-changed', onMusic);
      window.removeEventListener('sane333:open-music-together', onOpenTogether);
    };
  }, []);

  // 熟人一起听：随机切歌自动开启，随时可能切，不卡进度/不限次数
  useEffect(() => {
    const clear = () => {
      if (charRandTimerRef.current != null) {
        window.clearTimeout(charRandTimerRef.current);
        charRandTimerRef.current = null;
      }
    };
    const arm = () => {
      clear();
      const active = sessionRef.current;
      if (!active || active.status === 'ended' || !sessionAllowsCharRandom(active)) return;
      const pace = sessionCharRandomPace(active);
      const delay = charRandomDelayMs(pace);
      // songend：不走定时器，只在歌放完时切
      if (!delay) return;
      charRandTimerRef.current = window.setTimeout(() => {
        void runCharRandomSongRef.current({ quiet: true }).finally(() => arm());
      }, delay);
    };
    if (session && session.status !== 'ended' && sessionAllowsCharRandom(session)) {
      arm();
    } else {
      clear();
    }
    return clear;
  }, [session?.id, session?.mode, session?.status, session?.allowCharRandomSong, session?.charRandomPace]);

  useEffect(() => {
    pushMeState();
  }, [profiles, activeId, liked, records, theme, characters]);

  // 音乐页常挂载：离开时关掉设置层；回来时重读人设头像
  useEffect(() => {
    if (!active) {
      post(favRef.current, { type: 'close-sheets' });
      return;
    }
    pushMeState();
    if (overlayRef.current === 'fav') pushFavState();
  }, [active]);

  // 注意：不要把 pos 放进依赖——timeupdate 会狂刷，整页 music-state 会掐断黑胶动画
  useEffect(() => {
    if (overlay === 'fav') pushFavState();
    if (overlay === 'history') pushHistoryState();
    if (overlay === 'myPl' || (overlay === 'charPl' && charPlReturnTo.current === 'myPl')) pushMyPlState();
    if (overlay === 'charPl') pushCharPlState();
  }, [overlay, liked, current, playing, dur, session, searchResults, searching, theme, apiBase, characters, toast, bubble, openNowPlaying, cloudPlaylists, cloudSyncedAt, cloudLoading, musicCookie, playMode]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const source = data.source as string;
      const type = data.type as string;

      if (source === 'sane333-music-me') {
        if (type === 'me-ready') pushMeState();
        else if (type === 'back') onNavigate('home');
        else if (type === 'switch-profile') {
          switchMusicProfile(String(data.id || ''));
          refreshProfiles();
          showToast('已切换音乐 ID');
        } else if (type === 'create-profile') {
          createMusicProfile(String(data.name || ''), {
            sig: String(data.sig || ''),
            personaId: String(data.personaId || ''),
          });
          refreshProfiles();
          showToast('已创建并切换');
        } else if (type === 'rename-profile') {
          const id = getActiveMusicProfileId();
          const patch: Partial<{ name: string; sig: string; personaId: string }> = {};
          if ('name' in data) patch.name = String(data.name || '').slice(0, 8);
          if ('sig' in data) patch.sig = String(data.sig || '').slice(0, 40);
          if ('personaId' in data) patch.personaId = String(data.personaId || '');
          updateMusicProfile(id, patch);
          refreshProfiles();
          showToast('已保存');
        } else if (type === 'avatar-palette') {
          updateMusicProfile(getActiveMusicProfileId(), { t: Number(data.t) || 0, img: '' });
          refreshProfiles();
        } else if (type === 'avatar-clear') {
          updateMusicProfile(getActiveMusicProfileId(), { img: '' });
          refreshProfiles();
        } else if (type === 'avatar-image') {
          updateMusicProfile(getActiveMusicProfileId(), { img: String(data.img || '') });
          refreshProfiles();
        }         else if (type === 'open-fav') {
          openFav();
          if (data.trackId) {
            const track = likedRef.current.find((item) => item.id === data.trackId);
            if (track) void playTrack(track);
          }
        } else if (type === 'open-history') {
          openHistory(String(data.who || ''));
        } else if (type === 'invite-character') {
          const list = charactersRef.current;
          const character = list.find((item) => item.id === data.characterId)
            || list.find((item) => item.name === data.name);
          if (!character) {
            showToast('找不到这个角色');
            return;
          }
          inviteCharacterViaLine(character);
        }
        return;
      }

      if (source === 'sane333-music-fav') {
        if (type === 'music-ready') pushFavState();
        else if (type === 'back') {
          favWasOpen.current = false;
          setOverlay('');
        } else if (type === 'open-history') {
          openHistory('');
        } else if (type === 'open-my-playlists') {
          openMyPlaylists();
        } else if (type === 'open-char-playlists') {
          openCharPlaylists('fav');
        } else if (type === 'char-listen-settings-save') {
          setCharTogetherAutoCollectEnabled(Boolean(data.autoCollect));
          setCharPlaylistNotifyEnabled(Boolean(data.notify));
          pushFavState();
          showToast('角色听歌设定已保存');
        } else if (type === 'theme' && data.theme) {
          const next = data.theme as MusicTheme;
          setTheme(next);
          saveMusicTheme(next);
        } else if (type === 'search') {
          const query = String(data.query || '').trim();
          if (searchTimer.current) window.clearTimeout(searchTimer.current);
          if (!query) {
            setSearchResults([]);
            setSearching(false);
            return;
          }
          setSearching(true);
          searchTimer.current = window.setTimeout(async () => {
            try {
              const tracks = await searchMusic(query);
              setSearchResults(tracks);
              if (!tracks.length) showToast('没有找到相关歌曲');
            } catch (error) {
              showToast(error instanceof Error ? error.message : '搜索失败');
              setSearchResults([]);
            } finally {
              setSearching(false);
            }
          }, 320);
        } else if (type === 'play') {
          const id = String(data.id || '');
          const likedNow = likedRef.current;
          const searchNow = searchResultsRef.current;
          const currentNow = currentRef.current;
          const track =
            likedNow.find((item) => item.id === id)
            || searchNow.find((item) => item.id === id)
            || (currentNow?.id === id ? currentNow : null);
          if (track) {
            setOpenNowPlaying(true);
            await playTrack(track);
          }
        } else if (type === 'pp') {
          const audio = audioRef.current;
          const currentNow = currentRef.current;
          if (!audio || !currentNow) return;
          if (audio.paused) {
            try {
              await audio.play();
              setPlaying(true);
            } catch {
              showToast('播放失败');
            }
          } else {
            audio.pause();
            setPlaying(false);
          }
        } else if (type === 'next' || type === 'prev') {
          const likedNow = likedRef.current;
          const currentNow = currentRef.current;
          const list = likedNow.length ? likedNow : currentNow ? [currentNow] : [];
          if (!list.length || !currentNow) return;
          if (type === 'next' && playModeRef.current === 'shuffle' && list.length > 1) {
            let pick = list[Math.floor(Math.random() * list.length)];
            let guard = 0;
            while (pick.id === currentNow.id && guard < 8) {
              pick = list[Math.floor(Math.random() * list.length)];
              guard += 1;
            }
            await playTrack(pick);
            return;
          }
          const index = list.findIndex((item) => item.id === currentNow.id);
          const delta = type === 'next' ? 1 : -1;
          const next = list[(index + delta + list.length) % list.length];
          await playTrack(next);
        } else if (type === 'seek') {
          const audio = audioRef.current;
          const currentNow = currentRef.current;
          if (!audio || !currentNow) return;
          const total = audio.duration || currentNow.duration || 1;
          audio.currentTime = total * Math.min(1, Math.max(0, Number(data.ratio) || 0));
          setPos(audio.currentTime);
        } else if (type === 'toggle-like') {
          const id = String(data.id || '');
          const likedNow = likedRef.current;
          const searchNow = searchResultsRef.current;
          const currentNow = currentRef.current;
          const track =
            likedNow.find((item) => item.id === id)
            || searchNow.find((item) => item.id === id)
            || (currentNow?.id === id ? currentNow : null);
          if (!track) return;
          const exists = likedNow.some((item) => item.id === id);
          const next = exists
            ? likedNow.filter((item) => item.id !== id)
            : [track, ...likedNow.filter((item) => item.id !== id)];
          persistActiveProfileLikes(next);
          setLiked(next);
          showToast(exists ? '已取消喜欢' : '已加入 Favourite');
        } else if (type === 'play-mode') {
          const mode = String(data.mode || '') as PlayMode;
          if (mode !== 'shuffle' && mode !== 'one' && mode !== 'list') return;
          setPlayMode(mode);
          playModeRef.current = mode;
          savePlayMode(mode);
          const audio = audioRef.current;
          if (audio) audio.loop = mode === 'one';
        } else if (type === 'meet') {
          const list = charactersRef.current;
          if (!list.length) {
            showToast('还没有导入角色卡');
            return;
          }
          if (!currentRef.current) {
            showToast('先播放一首歌');
            return;
          }
          const pick = list[Math.floor(Math.random() * list.length)];
          const modeRaw = String(data.musicIdMode || 'saved');
          const musicIdMode =
            modeRaw === 'char' || modeRaw === 'manual' || modeRaw === 'saved'
              ? modeRaw
              : 'saved';
          await beginSession('stranger', pick, {
            anonymous: Boolean(data.anonymous),
            musicIdMode,
            musicId: String(data.musicId || ''),
          });
        } else if (type === 'invite') {
          const character = charactersRef.current.find((item) => item.id === data.characterId);
          if (!character) {
            showToast('找不到这个角色');
            return;
          }
          await beginSession('direct', character);
        } else if (type === 'end-session') {
          if (autoCollectTimerRef.current) {
            window.clearTimeout(autoCollectTimerRef.current);
            autoCollectTimerRef.current = null;
          }
          const sessionNow = sessionRef.current;
          if (sessionNow) {
            finalizeTogetherRef.current(sessionNow);
            setSession({ ...sessionNow, status: 'ended', updatedAt: new Date().toISOString() });
            sessionRef.current = null;
            saveStrangerSession(null);
            showToast('已写入听歌记录');
          } else {
            setSession(null);
          }
        } else if (type === 'react') {
          const sessionNow = sessionRef.current;
          const currentNow = currentRef.current;
          if (!sessionNow || !currentNow) return;
          const reaction = await askReaction(sessionNow, currentNow);
          if (!reaction) {
            showToast('TA 这会儿没说话');
            return;
          }
          const next = {
            ...sessionNow,
            reactionLog: [
              ...sessionNow.reactionLog,
              { trackId: currentNow.id, text: reaction, createdAt: new Date().toISOString() },
            ],
            updatedAt: new Date().toISOString(),
          };
          setSession(next);
          saveStrangerSession(next);
          setBubble(reaction);
        } else if (type === 'dm-send') {
          const text = String(data.text || '').trim();
          const sessionNow = sessionRef.current;
          const currentNow = currentRef.current;
          if (!text || !sessionNow || !currentNow) return;
          const withMine: MusicStrangerSession = {
            ...sessionNow,
            reactionLog: [
              ...sessionNow.reactionLog,
              { trackId: currentNow.id, text: `我说：${text}`, createdAt: new Date().toISOString() },
            ],
            updatedAt: new Date().toISOString(),
          };
          sessionRef.current = withMine;
          setSession(withMine);
          saveStrangerSession(withMine);
          const reply = await askDmReply(withMine, currentNow, text);
          const latest = sessionRef.current;
          if (!latest || latest.id !== withMine.id) return;
          if (!reply) {
            showToast('TA 这会儿没回上，再发一句试试');
            return;
          }
          const withReply: MusicStrangerSession = {
            ...latest,
            reactionLog: [
              ...latest.reactionLog,
              { trackId: currentNow.id, text: reply, createdAt: new Date().toISOString() },
            ],
            updatedAt: new Date().toISOString(),
          };
          sessionRef.current = withReply;
          setSession(withReply);
          saveStrangerSession(withReply);
        } else if (type === 'together-settings') {
          const sessionNow = sessionRef.current;
          if (!sessionNow || sessionNow.status === 'ended') return;
          const paceRaw = String(data.charRandomPace || sessionNow.charRandomPace || 'rare');
          const pace: CharRandomPace =
            paceRaw === 'occasional' || paceRaw === 'songend' || paceRaw === 'rare'
              ? paceRaw
              : 'rare';
          let musicId =
            sessionNow.musicId
            || getCharacterMusicId(sessionNow.characterId, sessionNow.characterName);
          if (sessionNow.mode === 'stranger' && data.musicId != null && String(data.musicId).trim()) {
            musicId = setCharacterMusicId(
              sessionNow.characterId,
              String(data.musicId),
              sessionNow.characterName,
            );
          }
          const next: MusicStrangerSession = {
            ...sessionNow,
            allowCharRandomSong: Boolean(data.allowRand),
            charRandomPace: pace,
            anonymous:
              sessionNow.mode === 'stranger' ? Boolean(data.anonymous) : false,
            musicId,
            updatedAt: new Date().toISOString(),
          };
          sessionRef.current = next;
          setSession(next);
          saveStrangerSession(next);
          // 设定变更时同步听歌记录里的匿名/音乐 ID（characterId 保持）
          const profileId = getActiveMusicProfileId();
          for (const item of getMusicListenHistory().filter(
            (row) =>
              String(row.sessionId || '') === String(next.id)
              && (!row.profileId || row.profileId === profileId),
          )) {
            updateMusicListenRecord(item.id, {
              characterId: next.characterId,
              musicId: next.musicId,
              anonymous: Boolean(next.anonymous),
              name: strangerDisplayName(next),
              variant: next.anonymous ? '匿名 · 音乐 ID' : '音乐 ID',
            });
          }
          setRecords(getMusicListenHistory(profileId));
          const paceLabel =
            pace === 'songend' ? '歌放完再切' : pace === 'occasional' ? '偶尔切' : '很少切';
          const bits: string[] = [];
          bits.push(next.allowCharRandomSong ? `自由切歌·${paceLabel}` : '自由切歌关');
          if (sessionNow.mode === 'stranger') {
            bits.push(next.anonymous ? '匿名房' : `ID ${next.musicId}`);
          }
          showToast(bits.join(' · '));
        } else if (type === 'pick') {
          const sessionNow = sessionRef.current;
          const pool = likedRef.current.length ? likedRef.current : searchResultsRef.current;
          if (!pool.length || !sessionNow) return;
          const pick = pool[Math.floor(Math.random() * pool.length)];
          await playTrack(pick);
          const next = {
            ...sessionNow,
            track: pick,
            reactionLog: [
              ...sessionNow.reactionLog,
              { trackId: pick.id, text: `TA 切到了《${pick.name}》`, createdAt: new Date().toISOString() },
            ],
            updatedAt: new Date().toISOString(),
          };
          sessionRef.current = next;
          setSession(next);
          saveStrangerSession(next);
          ensureTogetherRef.current(next, '一起听中 · 切到的歌');
        } else if (type === 'char-random-song') {
          await runCharRandomSongRef.current();
        } else if (type === 'add-playlist') {
          const sessionNow = sessionRef.current;
          const currentNow = currentRef.current;
          if (!sessionNow || !currentNow) return;
          const character = charactersRef.current.find((item) => item.id === sessionNow.characterId);
          if (!character) return;
          addTrackToCharacterPlaylist(
            {
              id: character.id,
              name: character.name,
              variantLabel: character.variantLabel || character.characterVersion,
            },
            currentNow,
          );
          showToast(`已加入 ${character.name} 的歌单`);
        } else if (type === 'save-api' || type === 'test-api') {
          const baseUrl = String(data.baseUrl || '').trim();
          if (!baseUrl) {
            showToast('请先填写 API 地址');
            return;
          }
          if (type === 'save-api') {
            saveMusicApiSettings({ baseUrl });
            setApiBase(baseUrl);
            showToast('音乐 API 地址已保存');
            return;
          }
          try {
            const tracks = await searchMusic('周杰伦', { ...readMusicApiSettings(), baseUrl });
            saveMusicApiSettings({ baseUrl });
            setApiBase(baseUrl);
            showToast(tracks.length ? `接口正常，找到 ${tracks.length} 首` : '接口有响应，但没解析到歌曲');
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'API 测试失败');
          }
        } else if (type === 'cookie-login') {
          const raw = String(data.cookie || '').trim();
          if (!raw) {
            showToast('请先粘贴 MUSIC_U Cookie');
            return;
          }
          // 提取 MUSIC_U 值
          const musicU = (raw.includes('MUSIC_U=') ? raw : `MUSIC_U=${raw}`)
            .match(/(?:^|;\s*)MUSIC_U=([^;]+)/)?.[1]?.trim() || raw.trim();
          if (!musicU || musicU.length < 10) {
            showToast('MUSIC_U 格式不对，请检查粘贴内容');
            return;
          }
          const cookie: MusicCookie = {
            raw: raw.includes('MUSIC_U=') ? raw : `MUSIC_U=${musicU}`,
            musicU,
            loggedAt: Date.now(),
          };
          saveMusicCookie(cookie);
          setMusicCookie(cookie);
          showToast('Cookie 保存成功！灰色歌曲大概率能播了');
        } else if (type === 'logout-music') {
          saveMusicCookie(null);
          setMusicCookie(null);
          setCloudPlaylists([]);
          setCloudSyncedAt(0);
          showToast('已退出网易云登录');
        } else if (type === 'load-cloud-playlists') {
          void loadCloudPlaylists();
        } else if (type === 'play-cloud-playlist') {
          const playlistId = String(data.playlistId || '');
          if (!playlistId) {
            showToast('歌单 ID 不正确');
            return;
          }
          if (!musicCookie) {
            showToast('请先登录网易云账号');
            return;
          }
          void (async () => {
            try {
              const detail = await fetchPlaylistDetail(playlistId);
              if (!detail.tracks.length) {
                showToast('歌单是空的');
                return;
              }
              // 播放第一首
              const firstTrack = detail.tracks[0];
              showToast(`正在加载「${detail.name}」…`);
              await playTrack(firstTrack);
              // 可以选择添加到 liked
              for (const track of detail.tracks) {
                if (!likedRef.current.some(t => t.id === track.id)) {
                  persistActiveProfileLikes([track, ...likedRef.current]);
                }
              }
              setLiked(getLikedTracks());
              showToast(`「${detail.name}」已加载 ${detail.tracks.length} 首到收藏`);
            } catch (error) {
              showToast(error instanceof Error ? error.message : '加载歌单失败');
            }
          })();
        }
        return;
      }

      if (source === 'sane333-music-history') {
        if (type === 'history-ready') pushHistoryState();
        else if (type === 'history-back') {
          historyFilterWho.current = '';
          setOverlay(favWasOpen.current ? 'fav' : '');
        } else if (type === 'history-keep') {
          const sessionId = String(data.sessionId || '');
          if (sessionId) {
            const related = getMusicListenHistory().filter(
              (item) => String(item.sessionId || '') === sessionId,
            );
            const nextKeep = !related.some((item) => item.keep);
            for (const item of related) {
              updateMusicListenRecord(item.id, { keep: nextKeep });
            }
          } else {
            toggleMusicListenKeep(String(data.id || ''));
          }
          setRecords(getMusicListenHistory(getActiveMusicProfileId()));
          pushHistoryState();
        } else if (type === 'history-play') {
          const record = recordsRef.current.find((item) => item.id === data.id);
          if (!record?.trackId) {
            showToast(record ? `播放《${record.song}》` : '找不到这首歌');
            return;
          }
          const track = likedRef.current.find((item) => item.id === record.trackId);
          if (track) {
            openFav();
            setOpenNowPlaying(true);
            await playTrack(track);
          } else {
            showToast(`《${record.song}》不在喜欢列表里`);
          }
        }
        return;
      }

      if (source === 'sane333-music-mypl') {
        if (type === 'mypl-ready') pushMyPlState();
        else if (type === 'back') {
          setOverlay(favWasOpen.current ? 'fav' : '');
        } else if (type === 'open-char') {
          openCharPlaylists('myPl');
        } else if (type === 'create-playlist') {
          const name = String(data.name || '').trim();
          if (!name) {
            showToast('先给歌单起个名字');
            return;
          }
          createUserPlaylist({ name, profileId: getActiveMusicProfileId() });
          pushMyPlState();
          showToast(`已创建「${name}」`);
        } else if (type === 'play-playlist') {
          const playlistId = String(data.playlistId || '');
          const likedNow = likedRef.current;
          const tracks =
            playlistId === '__liked__'
              ? likedNow
              : getUserPlaylists(getActiveMusicProfileId()).find((item) => item.id === playlistId)?.tracks || [];
          if (!tracks.length) {
            showToast('歌单还是空的');
            return;
          }
          openFav();
          setOpenNowPlaying(true);
          await playTrack(tracks[0]);
        } else if (type === 'play-track') {
          const id = String(data.id || '');
          const track =
            likedRef.current.find((item) => item.id === id)
            || getUserPlaylists(getActiveMusicProfileId())
              .flatMap((item) => item.tracks)
              .find((item) => item.id === id);
          if (!track) {
            showToast('找不到这首歌');
            return;
          }
          openFav();
          setOpenNowPlaying(true);
          await playTrack(track);
        } else if (type === 'load-cloud') {
          await loadCloudPlaylists();
          pushMyPlState();
        } else if (type === 'play-cloud-playlist') {
          const playlistId = String(data.playlistId || '');
          if (!playlistId) {
            showToast('歌单 ID 不正确');
            return;
          }
          if (!musicCookie) {
            showToast('请先登录网易云账号');
            return;
          }
          try {
            const detail = await fetchPlaylistDetail(playlistId);
            if (!detail.tracks.length) {
              showToast('歌单是空的');
              return;
            }
            showToast(`正在加载「${detail.name}」…`);
            openFav();
            setOpenNowPlaying(true);
            await playTrack(detail.tracks[0]);
            for (const track of detail.tracks) {
              if (!likedRef.current.some((item) => item.id === track.id)) {
                persistActiveProfileLikes([track, ...likedRef.current]);
              }
            }
            setLiked(getLikedTracks());
            showToast(`「${detail.name}」已加载 ${detail.tracks.length} 首到收藏`);
          } catch (error) {
            showToast(error instanceof Error ? error.message : '加载歌单失败');
          }
        }
        return;
      }

      if (source === 'sane333-music-charpl') {
        if (type === 'charpl-ready') pushCharPlState();
        else if (type === 'back') {
          setOverlay(charPlReturnTo.current === 'myPl' ? 'myPl' : 'fav');
        } else if (type === 'generate') {
          const ids = Array.isArray(data.characterIds)
            ? data.characterIds.map(String)
            : [];
          const mode = data.mode === 'sum' || data.mode === 'del' ? data.mode : undefined;
          void runCharPlaylistGenerate(ids, mode);
        } else if (type === 'play-track' || type === 'play-playlist') {
          const key = String(data.key || '');
          const [characterId, atRaw, indexRaw] = key.split('|');
          const archive = getCharPlaylistArchives()[characterId];
          const batch = archive?.batches.find((item) => String(item.at) === atRaw);
          const card = batch?.playlists[Number(indexRaw)];
          if (!archive || !batch || !card || card.locked) {
            showToast('这首单还不能播放');
            return;
          }
          const tracks = (card.tracks || []).map(songToTrack);
          if (!tracks.length) {
            showToast('歌单还是空的');
            return;
          }
          let pick = tracks[0];
          if (type === 'play-track') {
            const trackId = String(data.trackId || '');
            pick = tracks.find((item) => item.id === trackId) || tracks[0];
          }
          // 只存元数据，播放时再解析 URL，不额外占内存
          openFav();
          setOpenNowPlaying(true);
          await playTrack(pick);
          void maybeNotifyCharPlaylistListenRef.current({
            playlistKey: key,
            characterId,
            playlistName: card.name,
            track: pick,
          });
        } else if (type === 'toggle-collect') {
          const key = String(data.key || '');
          const [characterId, atRaw, indexRaw] = key.split('|');
          const archive = getCharPlaylistArchives()[characterId];
          const batch = archive?.batches.find((item) => String(item.at) === atRaw);
          const card = batch?.playlists[Number(indexRaw)];
          if (!archive || !batch || !card || card.locked) {
            showToast('这首单还不能收藏');
            return;
          }
          const collected = new Set(getCollectedKeys());
          if (collected.has(key)) {
            uncollectCharacterPlaylist(key, characterId, card.name);
            pushCharPlState();
            pushMyPlState();
            showToast(`已取消收藏「${card.name}」`);
          } else {
            collectCharacterPlaylist({
              name: card.name,
              description: card.blurb || `收藏自 ${archive.characterName}`,
              characterName: archive.characterName,
              characterId,
              tracks: card.tracks.map(songToTrack),
              profileId: getActiveMusicProfileId(),
              collectKey: key,
            });
            pushCharPlState();
            pushMyPlState();
            showToast(`已收藏「${card.name}」到我的歌单`);
          }
        } else if (type === 'delete-batch') {
          deleteCharBatch(String(data.characterId || ''), Number(data.index) || 0);
          pushCharPlState();
          showToast('已删除这一次记录');
        } else if (type === 'clear-summary') {
          clearCharSummary(String(data.characterId || ''));
          pushCharPlState();
        } else if (type === 'clear-all') {
          clearCharArchives();
          pushCharPlState();
          pushMyPlState();
          showToast('记录已清空');
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onNavigate, theme, apiBase]);

  useEffect(() => {
    if (!toast) return;
    if (overlay === 'fav') post(favRef.current, { type: 'toast', text: toast });
    else if (overlay === 'history') post(historyRef.current, { type: 'toast', text: toast });
    else if (overlay === 'myPl') post(myPlRef.current, { type: 'toast', text: toast });
    else if (overlay === 'charPl') post(charPlRef.current, { type: 'toast', text: toast });
    else post(meRef.current, { type: 'toast', text: toast });
  }, [toast, overlay]);

  const favOpen = overlay === 'fav' || overlay === 'history' || overlay === 'myPl' || overlay === 'charPl';
  const historyOpen = overlay === 'history';
  const myPlOpen = overlay === 'myPl' || (overlay === 'charPl' && charPlReturnTo.current === 'myPl');
  const charPlOpen = overlay === 'charPl';
  const slideStyle = (open: boolean, z: number): CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 52,
    height: 'calc(100% - 52px)',
    width: '100%',
    border: 0,
    zIndex: z,
    background: 'var(--bg, #fff)',
    transform: open ? 'translate3d(0,0,0)' : 'translate3d(100%,0,0)',
    transition: 'transform .4s cubic-bezier(.2,.8,.2,1)',
    pointerEvents: open ? 'auto' : 'none',
    // 关闭时彻底移出可视区，避免 Tailwind translate 失效导致右侧「漏出」Together
    ...(open ? {} : { visibility: 'hidden' as const }),
  });

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#ffffff]">
      <audio ref={audioRef} preload="metadata" referrerPolicy="no-referrer" />
      <iframe
        ref={meRef}
        title="Music Me"
        srcDoc={meHtml}
        className="absolute inset-x-0 bottom-0 border-0"
        style={{ top: 52, height: 'calc(100% - 52px)', width: '100%' }}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
      <iframe
        ref={favRef}
        title="Favourite"
        srcDoc={favHtml}
        style={slideStyle(favOpen, 20)}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
      <iframe
        ref={historyRef}
        title="Listen history"
        srcDoc={historyHtml}
        style={slideStyle(historyOpen, 30)}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
      <iframe
        ref={myPlRef}
        title="My playlists"
        srcDoc={myPlHtml}
        style={slideStyle(myPlOpen, 30)}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
      <iframe
        ref={charPlRef}
        title="Character playlists"
        srcDoc={charPlHtml}
        style={slideStyle(charPlOpen, 40)}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
