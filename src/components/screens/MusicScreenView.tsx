import { useEffect, useMemo, useRef, useState } from 'react';
import { readAndCompressImage } from '../../store/imageCompress';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, Heart, Search, Settings2,
  UsersRound, Shuffle, Music2, UserRound, ChevronRight, Volume2, X, Plus, Pencil, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { ScreenType } from '../../types';
import type { ImportedCharacter } from '../../data/characterImport';
import { usePersistentState } from '../../store/usePersistentState';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import {
  addTrackToCharacterPlaylist,
  fetchLyric,
  getCharacterPlaylists,
  getLikedTracks,
  loginWithQr,
  logoutMusic,
  readMusicApiSettings,
  readMusicCookie,
  readMusicCurrent,
  readStrangerSession,
  resolveTrackUrl,
  saveLikedTracks,
  saveMusicApiSettings,
  saveMusicCurrent,
  saveStrangerSession,
  searchMusic,
  type CharacterPlaylist,
  type MusicStrangerSession,
  type MusicTrack,
} from '../../store/music';

interface MusicScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

type MusicTab = 'identity' | 'player' | 'search' | 'characters' | 'history' | 'appearance';
type MusicTogetherRecord = { characterId: string; characterName: string; variantLabel: string; trackId: string; trackName: string; playedAt: string; mode: 'direct' | 'stranger' };
type MusicIdentity = { id: string; name: string; note: string; avatar?: string; personaId?: string; currentTrack?: MusicTrack | null; likedTracks: MusicTrack[]; history: MusicTrack[]; togetherRecords: MusicTogetherRecord[] };
type LineUserPersona = { id: string; name?: string; avatar?: string; [key: string]: unknown };

export function MusicScreenView({ onNavigate }: MusicScreenViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    // 网易云部分音源校验 Referer；用 DOM 属性设置，兼容当前 React 音频类型定义。
    audioRef.current?.setAttribute('referrerpolicy', 'no-referrer');
  }, []);
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [linePersonas] = usePersistentState<LineUserPersona[]>('line:user-personas', []);
  const [lineActivePersonaId] = usePersistentState<string | null>('line:active-persona', null);
  const [legacyLikedTracks] = usePersistentState<MusicTrack[]>('phone:music-liked-tracks', []);
  const [legacyListeningHistory] = usePersistentState<MusicTrack[]>('phone:music-history', []);
  const [identities, setIdentities] = usePersistentState<MusicIdentity[]>('phone:music-identities-v1', []);
  const [activeIdentityId, setActiveIdentityId] = usePersistentState<string>('phone:music-active-identity-v1', '');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [identitySubtab, setIdentitySubtab] = useState<'liked' | 'together'>('liked');
  const [historySubtab, setHistorySubtab] = useState<'tracks' | 'together'>('tracks');
  const [showIdentityPeople, setShowIdentityPeople] = useState(false);
  const [identityEditor, setIdentityEditor] = useState(false);
  const [identityEditing, setIdentityEditing] = useState(false);
  const [identityNameDraft, setIdentityNameDraft] = useState('');
  const [identityNoteDraft, setIdentityNoteDraft] = useState('');
  const [identityPersonaDraft, setIdentityPersonaDraft] = useState('');
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(() => readMusicCurrent());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [musicAccent, setMusicAccent] = usePersistentState<string>('phone:music-accent-v1', '#c4989a');
  const [musicBackground, setMusicBackground] = usePersistentState<string>('phone:music-background-v1', '#ffffff');
  const [tab, setTab] = useState<MusicTab>('identity');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => readMusicApiSettings().baseUrl);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiTestStatus, setApiTestStatus] = useState('');
  // 网易云扫码登录
  const [musicCookie, setMusicCookie] = useState(() => readMusicCookie());
  const [qrLoginOpen, setQrLoginOpen] = useState(false);
  const [qrImg, setQrImg] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<'idle' | 'waiting' | 'scanned' | 'expired' | 'success' | 'error'>('idle');
  const [qrMessage, setQrMessage] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const qrAbortRef = useRef<AbortController | null>(null);
  // 设置面板折叠状态
  const [appearanceCollapsed, setAppearanceCollapsed] = useState(true);
  const [apiCollapsed, setApiCollapsed] = useState(true);
  const [loginCollapsed, setLoginCollapsed] = useState(true);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(() => characters[0]?.id || null);
  const [characterPlaylists, setCharacterPlaylists] = useState<CharacterPlaylist[]>(() => getCharacterPlaylists());
  const [strangerSession, setStrangerSession] = useState<MusicStrangerSession | null>(() => readStrangerSession());
  const [strangerLoading, setStrangerLoading] = useState(false);
  const [strangerReaction, setStrangerReaction] = useState('');
  const [showInviteCharacter, setShowInviteCharacter] = useState(false);

  const activeIdentity = identities.find(item => item.id === activeIdentityId) || identities[0] || null;
  const linkedPersona = activeIdentity?.personaId
    ? linePersonas.find(persona => persona.id === activeIdentity.personaId)
    : linePersonas.find(persona => persona.id === lineActivePersonaId) || linePersonas.find(persona => Boolean(persona.isDefault)) || null;
  const linkedPersonaAvatar = linkedPersona ? String(linkedPersona.avatar || linkedPersona.av || '') : '';
  const identityAvatar = linkedPersonaAvatar || activeIdentity?.avatar || '';
  const likedTracks = activeIdentity?.likedTracks || [];
  const listeningHistory = activeIdentity?.history || [];
  const updateActiveIdentity = (update: (identity: MusicIdentity) => MusicIdentity, identityId = activeIdentity?.id) => {
    if (!identityId) return;
    setIdentities(previous => previous.map(identity => identity.id === identityId ? update(identity) : identity));
  };

  const recordTogetherSession = (session: MusicStrangerSession) => {
    updateActiveIdentity(identity => {
      const record: MusicTogetherRecord = {
        characterId: session.characterId,
        characterName: session.characterName,
        variantLabel: session.variantLabel || '默认版本',
        trackId: session.track.id,
        trackName: session.track.name,
        playedAt: session.createdAt,
        mode: session.mode === 'direct' ? 'direct' : 'stranger',
      };
      return { ...identity, togetherRecords: [record, ...identity.togetherRecords].slice(0, 200) };
    });
  };


  useEffect(() => {
    if (!identities.length && (legacyLikedTracks.length || legacyListeningHistory.length)) {
      const first: MusicIdentity = { id: 'music-id-default', name: '我的音乐 ID', note: '给此刻的心情留一首歌', currentTrack: readMusicCurrent(), likedTracks: legacyLikedTracks, history: legacyListeningHistory, togetherRecords: [] };
      setIdentities([first]);
      setActiveIdentityId(first.id);
    } else if (!identities.length) {
      const first: MusicIdentity = { id: 'music-id-default', name: '我的音乐 ID', note: '给此刻的心情留一首歌', currentTrack: readMusicCurrent(), likedTracks: [], history: [], togetherRecords: [] };
      setIdentities([first]);
      setActiveIdentityId(first.id);
    } else if (!identities.some(item => item.id === activeIdentityId)) setActiveIdentityId(identities[0].id);
  }, [identities, activeIdentityId, legacyLikedTracks, legacyListeningHistory, setIdentities, setActiveIdentityId]);

  const selectedCharacter = useMemo(
    () => characters.find(character => character.id === selectedCharacterId) || null,
    [characters, selectedCharacterId],
  );

  const selectedCharacterPlaylists = useMemo(
    () => characterPlaylists.filter(playlist => playlist.characterId === selectedCharacterId),
    [characterPlaylists, selectedCharacterId],
  );

  useEffect(() => {
    const identity = identities.find(item => item.id === activeIdentityId);
    if (!identity) return;
    const nextTrack = identity.currentTrack || (identity.id === 'music-id-default' ? readMusicCurrent() : null);
    setCurrentTrack(nextTrack);
    setIsPlaying(false);
    setPlaybackTime(0);
    setPlaybackDuration(0);
    if (audioRef.current) audioRef.current.pause();
  }, [activeIdentityId]);

  useEffect(() => {
    const onMusicChanged = () => setCurrentTrack(readMusicCurrent());
    const onStrangerChanged = () => setStrangerSession(readStrangerSession());
    window.addEventListener('sane333:music-changed', onMusicChanged);
    window.addEventListener('sane333:music-stranger-changed', onStrangerChanged);
    return () => {
      window.removeEventListener('sane333:music-changed', onMusicChanged);
      window.removeEventListener('sane333:music-stranger-changed', onStrangerChanged);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--music-accent', musicAccent);
  }, [musicAccent]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.playUrl) return;
    if (audio.src !== currentTrack.playUrl) {
      audio.src = currentTrack.playUrl;
      audio.load();
    }
    if (isPlaying && audio.paused) {
      void audio.play().catch(() => setIsPlaying(false));
    }
  }, [currentTrack, isPlaying]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  };

  const playTrack = async (track: MusicTrack, autoplay = true) => {
    try {
      const resolved = await resolveTrackUrl(track);
      // 即便接口没返回 URL，也先更新 currentTrack，让 UI 立即反映用户点的是哪一首；
      // 同时清掉 audio，避免旧歌继续播放造成「点别的还在放 always online」的错觉。
      if (!resolved.playUrl) {
        setCurrentTrack(resolved);
        saveMusicCurrent(resolved);
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          try { audio.removeAttribute('src'); } catch { /* ignore */ }
          audio.load();
        }
        setIsPlaying(false);
        throw new Error('接口没有返回可播放地址。这首歌可能暂不可用，请换一首测试。');
      }

      // 如果还没歌词则拉一次（后台异步，不阻塞播放）
      let trackWithLyric = resolved;
      if (!resolved.lyrics || resolved.lyrics.length === 0) {
        fetchLyric(resolved).then(lyrics => {
          if (!lyrics.length) return;
          setCurrentTrack(prev => {
            if (!prev || prev.id !== resolved.id) return prev;
            const next = { ...prev, lyrics };
            saveMusicCurrent(next);
            return next;
          });
        });
      }

      setCurrentTrack(trackWithLyric);
      saveMusicCurrent(trackWithLyric);
      updateActiveIdentity(identity => ({ ...identity, currentTrack: trackWithLyric, history: [trackWithLyric, ...identity.history.filter(item => item.id !== trackWithLyric.id)].slice(0, 100) }));

      // Start playback directly after resolving the URL. Relying only on the
      // currentTrack effect can miss autoplay because isPlaying may still be false
      // in that effect's render closure.
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = resolved.playUrl;
        audio.load();
        if (autoplay) {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch {
            setIsPlaying(false);
            throw new Error('已取得歌曲地址，但浏览器播放失败。请换一首歌测试；若都无法播放，需要检查接口返回的音源地址。');
          }
        } else {
          setIsPlaying(false);
        }
      } else if (autoplay) {
        setIsPlaying(true);
      }

      if (strangerSession && strangerSession.status !== 'ended') {
        setStrangerSession(prev => prev ? { ...prev, track: resolved, updatedAt: new Date().toISOString() } : prev);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '歌曲播放失败');
    }
  };

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const tracks = await searchMusic(query.trim());
      setResults(tracks);
      if (!tracks.length) showToast('没有找到相关歌曲');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '音乐搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const testAndSaveMusicApi = async () => {
    const baseUrl = apiBaseUrl.trim();
    if (!baseUrl) {
      setApiTestStatus('请先填写 API 地址。');
      return;
    }
    if (apiTesting) return;
    setApiTesting(true);
    setApiTestStatus('正在测试网易云搜索接口……');
    const settings = { ...readMusicApiSettings(), baseUrl };
    try {
      const tracks = await searchMusic('周杰伦', settings);
      if (!tracks.length) {
        setApiTestStatus('接口有响应，但没有解析到歌曲列表。请确认地址是 API 根地址，并检查接口格式。');
      } else {
        saveMusicApiSettings({ baseUrl });
        setApiTestStatus('搜索接口正常：找到 ' + tracks.length + ' 首歌曲，API 地址已保存。播放能力需点击歌曲另行测试。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApiTestStatus(
        /failed to fetch|networkerror|load failed/i.test(message)
          ? '连接失败：浏览器无法访问此接口。请检查地址、HTTPS 和跨域 CORS 设置。'
          : '连接失败：' + message
      );
    } finally {
      setApiTesting(false);
    }
  };

  // ===== 网易云扫码登录 =====
  const startQrLogin = async () => {
    if (qrLoading) return;
    setQrLoading(true);
    setQrStatus('waiting');
    setQrMessage('正在生成二维码…');
    setQrImg('');
    setQrUrl('');
    qrAbortRef.current = new AbortController();
    try {
      const cookie = await loginWithQr({
        signal: qrAbortRef.current.signal,
        onQrReady: ({ qrimg, qrurl }) => {
          setQrImg(qrimg);
          setQrUrl(qrurl);
        },
        onStatus: (code, message) => {
          if (code === 801) { setQrStatus('waiting'); setQrMessage('请用手机网易云 App 扫码'); }
          else if (code === 802) { setQrStatus('scanned'); setQrMessage('已扫码，请在手机上点「确认登录」'); }
          else if (code === 803) { setQrStatus('success'); setQrMessage('登录成功！正在保存凭证…'); }
          else if (code === 800) { setQrStatus('expired'); setQrMessage('二维码已过期，请重新生成'); }
          else if (typeof message === 'string' && message) setQrMessage(message);
        },
      });
      setMusicCookie(cookie);
      setQrStatus('success');
      setQrMessage('登录成功！MUSIC_U 已保存。');
      showToast('网易云已登录，灰色歌曲大概率能播了');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/取消/i.test(message)) {
        setQrStatus('idle');
        setQrMessage('已取消');
      } else if (/过期/.test(message)) {
        setQrStatus('expired');
        setQrMessage(message);
      } else {
        setQrStatus('error');
        setQrMessage(message);
      }
    } finally {
      setQrLoading(false);
      qrAbortRef.current = null;
    }
  };

  const cancelQrLogin = () => {
    qrAbortRef.current?.abort();
    qrAbortRef.current = null;
    setQrStatus('idle');
    setQrMessage('');
  };

  const doLogout = async () => {
    await logoutMusic();
    setMusicCookie(null);
    showToast('已退出网易云登录');
  };


  const publishMusicInviteToLine = (session: MusicStrangerSession) => {
    if (typeof window === 'undefined') return;
    const chatKey = 'line:conversation:' + session.id;
    const existingRaw = window.localStorage.getItem(chatKey);
    if (!existingRaw) {
      window.localStorage.setItem(chatKey, JSON.stringify([{
        id: Date.now(),
        sender: 'me',
        senderName: '我',
        text: '邀请一起听歌：《' + session.track.name + '》',
        time: '刚刚',
        type: 'music-together',
        musicSession: session,
      }]));
    }
    window.dispatchEvent(new CustomEvent('sane333:music-invite-created', { detail: { session } }));
  };

  const startDirectListening = async (character: ImportedCharacter) => {
    if (!currentTrack) {
      showToast('先播放一首歌，再邀请角色');
      setTab('search');
      return;
    }
    const session: MusicStrangerSession = {
      mode: 'direct',
      id: 'music-direct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      characterId: character.id,
      characterName: character.name,
      variantLabel: character.variantLabel || character.characterVersion || '默认版本',
      track: currentTrack,
      status: 'listening',
      reactionLog: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    recordTogetherSession(session);
    setStrangerSession(session);
    saveStrangerSession(session);
    publishMusicInviteToLine(session);
    setShowInviteCharacter(false);
    setStrangerLoading(true);
    setStrangerReaction('');
    const reaction = await askStrangerReaction(session, currentTrack);
    const next = reaction
      ? { ...session, reactionLog: [{ trackId: currentTrack.id, text: reaction, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }
      : session;
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setSelectedCharacterId(character.id);
    setStrangerLoading(false);
    showToast('已邀请 ' + character.name + ' 一起听歌');
  };

  const askStrangerReaction = async (session: MusicStrangerSession, track: MusicTrack) => {
    const character = characters.find(item => item.id === session.characterId);
    if (!character) return '';
    const isStranger = session.mode === 'stranger';
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      return await generateCreativeText({
        settings,
        systemPrompt: [
          isStranger ? '你正在参加一个“音乐陌生人”体验。' : '你正在和一个熟悉的角色关系对象一起听歌。',
          isStranger ? '你是一个刚刚随机遇见用户的陌生人，不认识用户，不知道用户与其他角色的关系。' : '可以依据你自己的角色设定自然回应，但不要虚构不存在的共同听歌经历。',
          isStranger ? '不要读取、假设或引用既有聊天关系、长期记忆、恋爱关系。' : '当前只是一起听歌，不要强行把聊天写成剧情。',
          '只依据你的角色卡、当前歌曲和这场第一次偶遇来回应。',
          '回复要像真实的人在音乐社交房里说话，短一些，自然，有一点人格。',
          '不要解释自己是 AI。',
          '',
          '【角色卡】',
          character.description,
          character.personality,
          character.scenario,
        ].join('\n'),
        userPrompt: [
          isStranger ? '你刚刚和一个陌生用户随机进入同一间听歌房。' : '你刚刚收到对方发来的这首歌，正在和对方一起听。',
          '当前歌曲：《' + track.name + '》 - ' + track.artist,
          '请说一句你对这首歌的第一反应。可以喜欢、无感、吐槽，也可以问用户为什么选这首。',
        ].join('\n'),
        temperature: settings.temperature,
      });
    } catch {
      return '';
    }
  };

  const startStrangerListening = async () => {
    if (!currentTrack) {
      showToast('先播放一首歌，再随机寻找音乐陌生人');
      setTab('search');
      return;
    }
    if (!characters.length) {
      showToast('先导入至少一个角色卡，才能随机遇见音乐陌生人');
      return;
    }
    const character = characters[Math.floor(Math.random() * characters.length)];
    const session: MusicStrangerSession = {
      mode: 'stranger',
      id: 'music-stranger-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      characterId: character.id,
      characterName: character.name,
      variantLabel: character.variantLabel || character.characterVersion || '默认版本',
      track: currentTrack,
      status: 'listening',
      reactionLog: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    recordTogetherSession(session);
    setStrangerSession(session);
    saveStrangerSession(session);
    publishMusicInviteToLine(session);
    setStrangerLoading(true);
    setStrangerReaction('');
    const reaction = await askStrangerReaction(session, currentTrack);
    const next = reaction
      ? { ...session, reactionLog: [{ trackId: currentTrack.id, text: reaction, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }
      : session;
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setSelectedCharacterId(character.id);
    setStrangerLoading(false);
    showToast('你随机遇见了 ' + character.name + ' · ' + (character.variantLabel || character.characterVersion || '默认版本'));
  };

  const reactToCurrentSong = async () => {
    if (!strangerSession || !currentTrack || strangerLoading) return;
    setStrangerLoading(true);
    const reaction = await askStrangerReaction(strangerSession, currentTrack);
    const now = new Date().toISOString();
    const next = reaction
      ? { ...strangerSession, track: currentTrack, reactionLog: [...strangerSession.reactionLog, { trackId: currentTrack.id, text: reaction, createdAt: now }].slice(-30), updatedAt: now }
      : strangerSession;
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setStrangerLoading(false);
  };

  const letStrangerChoose = async () => {
    if (!strangerSession || strangerLoading) return;
    const character = characters.find(item => item.id === strangerSession.characterId);
    if (!character) return;
    setStrangerLoading(true);
    try {
      const settings = readStoredAiSettings(character.id, character.name);
      const suggestion = await generateCreativeText({
        settings,
        systemPrompt: '你是一个刚认识用户的音乐陌生人。不要引用既有聊天关系。根据角色性格和当前歌曲，提出下一首你想听的歌。只输出“歌名 - 歌手”，不要解释。',
        userPrompt: '当前播放：《' + (currentTrack?.name || '') + '》 - ' + (currentTrack?.artist || '') + '\n请选一首你真的想和这个陌生人继续听的歌。',
        temperature: settings.temperature,
      });
      const clean = suggestion.replace(/^[“"'「]?[\s]*/, '').replace(/[”"'」][\s]*$/, '').trim();
      const tracks = await searchMusic(clean);
      const nextTrack = tracks[0];
      if (!nextTrack) throw new Error('没有搜到 TA 选的歌');
      await playTrack(nextTrack, true);
      addTrackToCharacterPlaylist(character, nextTrack, '喜欢的歌');
      setCharacterPlaylists(getCharacterPlaylists());
      await reactToSongAfterSwitch(strangerSession, nextTrack);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'TA 切歌失败');
      setStrangerLoading(false);
    }
  };

  const reactToSongAfterSwitch = async (session: MusicStrangerSession, track: MusicTrack) => {
    const reaction = await askStrangerReaction({ ...session, track }, track);
    const next = reaction
      ? { ...session, track, reactionLog: [...session.reactionLog, { trackId: track.id, text: reaction, createdAt: new Date().toISOString() }].slice(-30), updatedAt: new Date().toISOString() }
      : { ...session, track };
    setStrangerSession(next);
    saveStrangerSession(next);
    setStrangerReaction(reaction);
    setStrangerLoading(false);
  };

  const saveCurrentToCharacter = () => {
    if (!currentTrack || !selectedCharacter) {
      showToast('请选择一个角色');
      return;
    }
    addTrackToCharacterPlaylist(selectedCharacter, currentTrack, '喜欢的歌');
    setCharacterPlaylists(getCharacterPlaylists());
    showToast('已加入 ' + selectedCharacter.name + ' 的「喜欢的歌」');
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.duration && Number.isFinite(audio.duration)) {
      // React state is intentionally minimal; the browser owns exact progress.
    }
  };

  const toggleLiked = (track: MusicTrack) => {
    const exists = likedTracks.some(item => item.id === track.id);
    updateActiveIdentity(identity => ({ ...identity, likedTracks: exists ? identity.likedTracks.filter(item => item.id !== track.id) : [track, ...identity.likedTracks].slice(0, 200) }));
    // 同步写全局收藏（IG 音乐选择器读的是全局 key），按本次意图显式增删
    const global = getLikedTracks();
    saveLikedTracks(exists ? global.filter(item => item.id !== track.id) : [track, ...global.filter(item => item.id !== track.id)]);
    showToast(exists ? '已从喜欢的歌移除' : '已加入喜欢的歌');
  };


  const createIdentity = () => {
    const name = identityNameDraft.trim();
    if (!name) { showToast('请先填写音乐 ID 名称'); return; }
    const identity: MusicIdentity = {
      id: 'music-id-' + Date.now().toString(36),
      name,
      note: identityNoteDraft.trim() || '给此刻的心情留一首歌',
      personaId: identityPersonaDraft || lineActivePersonaId || undefined,
      avatar: (() => {
        const persona = linePersonas.find(item => item.id === (identityPersonaDraft || lineActivePersonaId));
        const value = persona?.avatar || persona?.av;
        return value ? String(value) : undefined;
      })(),
      likedTracks: [],
      history: [],
      togetherRecords: [],
    };
    setIdentities(previous => [...previous, identity]);
    setActiveIdentityId(identity.id);
    setIdentityEditor(false);
    setIdentityEditing(false);
    setTab('identity');
    setIdentitySubtab('liked');
    showToast('已创建并切换到 ' + name);
  };

  const saveIdentity = () => {
    if (!activeIdentity) return;
    const name = identityNameDraft.trim();
    if (!name) { showToast('音乐 ID 名称不能为空'); return; }
    const persona = linePersonas.find(item => item.id === identityPersonaDraft);
      updateActiveIdentity(identity => ({ ...identity, name, note: identityNoteDraft.trim() || '给此刻的心情留一首歌', personaId: identityPersonaDraft || undefined, avatar: persona ? String(persona.avatar || persona.av || identity.avatar || '') : identity.avatar }));
    setIdentityEditor(false);
    setIdentityEditing(false);
    showToast('音乐 ID 已保存');
  };

  const openIdentityEditor = () => {
    setIdentityNameDraft(activeIdentity?.name || '');
    setIdentityNoteDraft(activeIdentity?.note || '');
    setIdentityPersonaDraft(activeIdentity?.personaId || lineActivePersonaId || '');
    setIdentityEditing(true);
    setIdentityEditor(true);
  };

  const isCurrentLiked = Boolean(currentTrack && likedTracks.some(item => item.id === currentTrack.id));
  const playAdjacentTrack = (direction: -1 | 1) => {
    const queue = likedTracks.length ? likedTracks : listeningHistory;
    if (!queue.length) { showToast('先搜索并播放歌曲'); return; }
    const currentIndex = queue.findIndex(track => track.id === currentTrack?.id);
    if (currentIndex < 0) { void playTrack(queue[0]); return; }
    const nextIndex = (currentIndex + direction + queue.length) % queue.length;
    void playTrack(queue[nextIndex]);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden select-none" style={{ background: musicBackground, color: '#2d2724' }}>
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(ellipse at 10% 0%, #f8eeee 0, transparent 42%), radial-gradient(ellipse at 100% 100%, #f2f6f2 0, transparent 38%)' }} />

      <header className="relative z-10 grid grid-cols-[40px_1fr_40px] items-center px-4 pt-12 pb-3">
        <button onClick={() => onNavigate('home')} aria-label="返回" className="w-10 h-10 rounded-full grid place-items-center text-[#776e68] hover:bg-[#f7f4f1]"><ArrowLeft className="w-4 h-4" /></button>
        <div className="text-center">
          <div className="font-serif italic text-[25px] leading-7 text-[#2d2724]">Me</div>
          <div className="mt-0.5 text-[8px] tracking-[2px] text-[#a59a92]">MUSIC IDENTITY</div>
        </div>
        <button onClick={() => setTab('appearance')} aria-label="外观与音乐 API" className="w-10 h-10 rounded-full grid place-items-center text-[#8e827b] hover:bg-[#f7f4f1]"><Settings2 className="w-4 h-4" /></button>
      </header>

      <div className="relative z-10 flex flex-1 min-h-0 pb-2 gap-0">
        <aside className={'shrink-0 flex flex-col items-center border-r border-[#eee8e3] transition-all duration-200 overflow-hidden ' + (railCollapsed ? 'w-7' : 'w-16')}>
          <button onClick={() => setRailCollapsed(value => !value)} aria-label={railCollapsed ? '展开音乐 ID 栏' : '收起音乐 ID 栏'} className="w-6 h-7 grid place-items-center text-[#a59a92]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="8" r="5"/><path d="M2 21a8 8 0 0 1 16 0"/><path d={railCollapsed ? "M22 12h-7m0 0 3-3m-3 3 3 3" : "M2 12h7m0 0-3-3m3 3-3 3"}/></svg>
            </button>
          <div className={'flex-1 min-h-0 w-full overflow-y-auto no-scrollbar flex flex-col items-center gap-[18px] pt-2 ' + (railCollapsed ? 'opacity-0 pointer-events-none' : '')}>
            {identities.map(identity => (
              <button key={identity.id} onClick={() => { setActiveIdentityId(identity.id); setTab('identity'); }} className={'relative w-14 shrink-0 flex flex-col items-center gap-1.5 text-[11px] ' + (identity.id === activeIdentity?.id ? 'text-[#332b27] font-semibold' : 'text-[#9a8d84]')}>
                <span className={'w-10 h-10 rounded-[15px] overflow-hidden grid place-items-center border ' + (identity.id === activeIdentity?.id ? 'border-[#c4989a] ring-2 ring-[#f4e7e7]' : 'border-[#eee5df] bg-[#f7f2ee]')} style={{ background: identity.avatar ? 'transparent' : 'linear-gradient(145deg,#e8c6c3,#e9eee6)' }}>
                  {identity.avatar ? <img src={identity.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[15px]">{identity.name.slice(0,1)}</span>}
                </span>
                <span className="max-w-full truncate">{identity.name}</span>
                {identity.id === activeIdentity?.id && <span className="absolute -left-[5px] top-2 w-[3px] h-6 rounded-full bg-[#c4989a]" />}
              </button>
            ))}
            {!railCollapsed && <button onClick={() => { setIdentityNameDraft(''); setIdentityNoteDraft(''); setIdentityPersonaDraft(lineActivePersonaId || ''); setIdentityEditing(false); setIdentityEditor(true); }} className="w-14 shrink-0 flex flex-col items-center gap-1.5 text-[11px] text-[#9a8d84]"><span className="w-10 h-10 rounded-[15px] border border-dashed border-[#b9aaa1] grid place-items-center"><Plus className="w-4 h-4" /></span>新 ID</button>}
          </div>
        </aside>
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        {tab !== 'identity' && (
        <div className="relative z-10 px-2 pb-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-[#eee8e3]">
          {([
            ['player', '我的音乐'],
            ['characters', '一起听'],
            ['history', '听歌记录'],
            ['appearance', '外观与音乐 API'],
          ] as Array<[MusicTab, string]>).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={'shrink-0 px-2.5 py-3 text-[11px] border-b-2 transition-colors ' + (tab === key || (key === 'player' && tab === 'search') ? 'border-[#c4989a] text-[#2d2724] font-semibold' : 'border-transparent text-[#968a82]')}>
              {label}
            </button>
          ))}
          </div>
        </div>
        )}

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto no-scrollbar px-[18px] pb-8">

        {tab === 'identity' && activeIdentity && (
          <div className="pt-1 space-y-3">
            <section className="relative flex items-end gap-[18px] mt-3">
              <button onClick={openIdentityEditor} className="relative shrink-0 w-[88px] h-[88px] rounded-[30px] overflow-hidden bg-[#f5ebe7] border border-[#eee4de] grid place-items-center text-[30px] text-[#987e78]">
                {identityAvatar ? <img src={identityAvatar} alt="" className="w-full h-full object-cover" /> : (linkedPersona?.name || activeIdentity.name).slice(0,1)}
                <span className="absolute right-0.5 bottom-0.5 w-5 h-5 rounded-md bg-[#2d2724] text-white grid place-items-center"><Pencil className="w-2.5 h-2.5" /></span>
              </button>
              <div className="min-w-0 flex-1 pb-0.5">
                <div className="text-[11px] tracking-[.4px] text-[#857b73]">音乐 ID</div>
                <button onClick={openIdentityEditor} className="max-w-full flex items-center gap-1 text-left mt-0.5"><span className="font-serif font-semibold text-[23px] leading-tight truncate">{linkedPersona?.name || activeIdentity.name}</span><Pencil className="w-3 h-3 text-[#a59a92] shrink-0" /></button>
                <button onClick={openIdentityEditor} className="mt-1.5 max-w-full text-left text-[12px] leading-snug text-[#857b73] line-clamp-2">
                  {activeIdentity.note?.trim() || '点击添加个性签名'}
                </button>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="rounded-full bg-[#eaf0e9] px-2 py-1 text-[9px] text-[#5c7161]"><b>{likedTracks.length}</b> 喜欢</span>
                  <span className="rounded-full bg-[#f5e9e8] px-2 py-1 text-[9px] text-[#87676a]"><b>{activeIdentity.togetherRecords.length}</b> 一起听</span>
                  <span className="rounded-full bg-[#f3eee5] px-2 py-1 text-[9px] text-[#81735f]"><b>{new Set(activeIdentity.togetherRecords.map(record => record.characterId)).size}</b> 朋友</span>
                </div>
              </div>
            </section>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setTab('player')} className="flex-1 rounded-[15px] bg-[#2d2724] text-white h-[42px] text-[14px] font-bold">进入我的音乐</button>
              <button onClick={() => setTab('history')} className="flex-1 rounded-[15px] bg-[#fcfaf7] text-[#5f5149] h-[42px] text-[14px] font-bold">听歌记录</button>
            </div>
            {activeIdentity.togetherRecords.length > 0 && (
              <section>
                <button onClick={() => setShowIdentityPeople(value => !value)} className="w-full flex items-center gap-2 text-left text-[11px] text-[#75675f] py-1">
                  <Heart className="w-3 h-3 text-[#c4989a]" />
                  <span className="flex-1 truncate">和 {Array.from(new Set(activeIdentity.togetherRecords.map(record => record.characterName))).slice(0,2).join('、')}{new Set(activeIdentity.togetherRecords.map(record => record.characterId)).size > 2 ? ' 等 ' + new Set(activeIdentity.togetherRecords.map(record => record.characterId)).size + ' 位' : ''} 一起听过</span>
                  <ChevronRight className={'w-3 h-3 transition-transform ' + (showIdentityPeople ? 'rotate-90' : '-rotate-90')} />
                </button>
                {showIdentityPeople && <div className="rounded-xl bg-[#f8f6f3] px-2">{Array.from(new Set(activeIdentity.togetherRecords.map(record => record.characterId))).map(characterId => {
                  const records = activeIdentity.togetherRecords.filter(record => record.characterId === characterId);
                  const character = characters.find(item => item.id === characterId);
                  return <button key={characterId} onClick={() => { if (!character) { showToast('这个角色已不在导入列表中'); return; } setSelectedCharacterId(characterId); setTab('characters'); }} className="w-full flex items-center gap-2 py-2 border-b last:border-0 border-[#eae4de] text-left">
                    <span className="w-8 h-8 rounded-lg overflow-hidden bg-white grid place-items-center">{character?.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-3.5 h-3.5 text-[#b6a39a]" />}</span>
                    <span className="flex-1 min-w-0"><span className="block text-[10px] font-semibold truncate">{records[0].characterName}</span><span className="block text-[9px] text-[#9a8d84] truncate">{Array.from(new Set(records.map(record => record.variantLabel))).join(' · ')}</span></span>
                    <span className="text-[9px] text-[#9a8d84]">{records.length} 次</span>
                  </button>;
                })}</div>}
              </section>
            )}
            <div className="flex gap-5 border-b border-[#eee8e3]">
              <button onClick={() => setIdentitySubtab('liked')} className={'py-2 text-[11px] border-b-2 ' + (identitySubtab === 'liked' ? 'border-[#c4989a] text-[#2d2724] font-semibold' : 'border-transparent text-[#9a8d84]')}>喜欢 {likedTracks.length}</button>
              <button onClick={() => setIdentitySubtab('together')} className={'py-2 text-[11px] border-b-2 ' + (identitySubtab === 'together' ? 'border-[#c4989a] text-[#2d2724] font-semibold' : 'border-transparent text-[#9a8d84]')}>一起听 {activeIdentity.togetherRecords.length}</button>
            </div>
            {identitySubtab === 'liked' ? (
              likedTracks.length ? <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 pt-1">{likedTracks.map(track => (
                <div key={track.id} className="min-w-0 flex flex-col items-center">
                  <button onClick={() => void playTrack(track)} className="w-full aspect-square max-w-[96px] rounded-[18px] overflow-hidden bg-[#f7f3f0] shrink-0 grid place-items-center shadow-sm">{track.cover ? <img src={track.cover} alt={track.name} className="w-full h-full object-cover" /> : <Music2 className="w-5 h-5 text-[#b5a49b]" />}</button>
                  <button onClick={() => void playTrack(track)} className="w-full text-center mt-1.5 px-0.5"><div className="text-[10px] font-semibold truncate">{track.name}</div><div className="text-[9px] text-[#9a8d84] truncate mt-0.5">{track.artist}</div></button>
                </div>
              ))}</div> : <div className="mt-3 rounded-[22px] bg-[#f8f6f3] px-4 py-8 text-center">
                <Music2 className="w-6 h-6 text-[#c5b0aa] mx-auto" />
                <div className="mt-3 text-[13px] font-semibold text-[#756760]">还没有喜欢的歌</div>
                <div className="mt-1 text-[11px] text-[#a69a91]">去「我的音乐」搜索，点亮爱心就会出现在这里</div>
                <button onClick={() => setTab('player')} className="mt-4 h-10 px-5 rounded-full bg-[#2d2724] text-white text-[12px] font-semibold">去找歌</button>
              </div>
            ) : (
              activeIdentity.togetherRecords.length ? <div className="space-y-2 pt-1">{activeIdentity.togetherRecords.map((record, index) => {
                const character = characters.find(item => item.id === record.characterId);
                return <div key={record.characterId + '-' + record.playedAt + '-' + index} className="flex items-center gap-2.5 py-1.5">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#f7f3f0] shrink-0 grid place-items-center">{character?.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#b5a49b]" />}</div>
                  <div className="min-w-0 flex-1"><div className="text-[11px] font-semibold truncate">{record.characterName}</div><div className="text-[9px] text-[#9a8d84] truncate">{record.trackName} · {record.variantLabel}</div></div>
                </div>;
              })}</div> : <div className="py-7 text-center"><UsersRound className="w-5 h-5 text-[#c5b0aa] mx-auto" /><div className="mt-2 text-[11px] text-[#756760]">还没有一起听记录</div></div>
            )}
          </div>
        )}

        {tab === 'player' && (
          <div className="relative -mx-[18px] -mt-1 flex min-h-full flex-col bg-white px-5 pb-24 pt-4 text-[#2d2724]">
            <div className="flex h-8 items-center justify-between">
              <button onClick={() => setTab('identity')} aria-label="返回" className="grid h-8 w-8 place-items-center text-[#403832]"><ArrowLeft className="h-[19px] w-[19px]" /></button>
              <div className="flex items-center gap-5">
                <button onClick={() => { if(likedTracks.length) { const next=likedTracks[Math.floor(Math.random()*likedTracks.length)]; void playTrack(next); } else showToast('先收藏几首喜欢的歌吧'); }} aria-label="随机播放" className="grid h-8 w-7 place-items-center"><Shuffle className="h-[19px] w-[19px]" /></button>
                <button onClick={() => setTab('characters')} aria-label="一起听" className="grid h-8 w-7 place-items-center"><Volume2 className="h-[19px] w-[19px]" /></button>
                <button onClick={() => setTab('appearance')} aria-label="外观设置" className="grid h-8 w-7 place-items-center"><Settings2 className="h-[19px] w-[19px]" /></button>
              </div>
            </div>
            <div className="mt-1">
              <h2 className="font-serif text-[42px] font-semibold italic leading-[1.08] tracking-[-1.8px]">Favourite</h2>
              <p className="mt-1 text-[12px] tracking-[.1px] text-[#92867d]">我喜欢的音乐 · {likedTracks.length} 首 · 约 {Math.round(likedTracks.reduce((sum,t)=>sum+(t.duration||0),0)/60)} 分钟</p>
            </div>
            <div className="mt-5 flex h-[55px] items-center gap-3 rounded-full border border-[#e5e0dc] bg-[#f7f5f3] px-3.5 shadow-[0_3px_10px_rgba(50,35,25,.03)]">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eee3e1] text-[#c4989a]"><Search className="h-[17px] w-[17px]" /></div>
              <input value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void search();}} placeholder="搜索歌曲 / 歌手 / 专辑" className="min-w-0 flex-1 bg-transparent text-[14px] text-[#514740] outline-none placeholder:text-[#a59a91]" />
              {query && <button onClick={()=>{setQuery('');setResults([]);}} aria-label="清空搜索" className="text-[#9b8e84]"><X className="h-4 w-4"/></button>}
            </div>
            {results.length>0 ? <div className="mt-4 flex items-center justify-between"><span className="text-[12px] text-[#857b73]">搜索结果 · {results.length}</span><button onClick={()=>setResults([])} className="text-[11px] text-[#a4777b]">返回收藏</button></div> :
            <div className="mt-5 flex h-[43px] items-center justify-between">
              <button onClick={() => { if(likedTracks.length) void playTrack(likedTracks[0]); else if(query.trim()) void search(); else showToast('先搜索并收藏喜欢的歌曲'); }} className="flex h-[42px] items-center gap-2 rounded-full bg-[#2d2724] px-5 text-[13px] font-semibold text-white"><Play className="h-[15px] w-[15px] fill-current" />播放全部</button>
              <span className="pr-1 text-[12px] text-[#857b73]">{likedTracks.length} songs</span>
            </div>}
            <div className="mt-2 flex-1">
              {results.length>0 ? results.map(track=><div key={track.id} className="flex min-h-[68px] items-center gap-3 py-[7px]">
                <button onClick={()=>void playTrack(track)} className="h-[53px] w-[53px] shrink-0 overflow-hidden rounded-[13px] bg-[#f0e7e2]">{track.cover?<img src={track.cover} alt="" className="h-full w-full object-cover"/>:<div className="h-full w-full" style={{background:'linear-gradient(135deg,#e8b7b0,#a9c2ae,#f4e9dc)'}}/>}</button>
                <button onClick={()=>void playTrack(track)} className="min-w-0 flex-1 text-left"><div className="truncate text-[14px] font-medium">{track.name}</div><div className="mt-1 truncate text-[12px] text-[#92867d]">{track.artist}{track.album?' · '+track.album:''}</div></button>
                <button onClick={()=>void toggleLiked(track)} aria-label="收藏歌曲" className="px-1 text-[#c4989a]"><Heart className={'h-4 w-4 '+(likedTracks.some(t=>t.id===track.id)?'fill-current':'')}/></button>
              </div>) : likedTracks.length ? likedTracks.filter(track=>(track.name+' '+track.artist+' '+(track.album||'')).toLowerCase().includes(query.trim().toLowerCase())).map((track,index)=><button key={track.id} onClick={()=>void playTrack(track)} className="flex min-h-[68px] w-full items-center gap-3 py-[7px] text-left">
                <div className="h-[53px] w-[53px] shrink-0 overflow-hidden rounded-[13px] bg-[#f0e7e2]">{track.cover?<img src={track.cover} alt="" className="h-full w-full object-cover"/>:<div className="h-full w-full" style={{background:['linear-gradient(135deg,#e8b7b0,#a9c2ae,#f4e9dc)','linear-gradient(135deg,#9fb8d4,#e3bfd6,#efe7e1)','linear-gradient(135deg,#8ea3c0,#efd5ae,#dde3ea)','linear-gradient(135deg,#a6d8bb,#f7d3b8,#f6f0e6)','linear-gradient(135deg,#f0c48f,#cfb0d4,#f6eddf)','linear-gradient(135deg,#cdb5da,#a6cdd0,#f3ecea)'][index%6]}}/>}</div>
                <span className="min-w-0 flex-1"><span className={'block truncate text-[14px] font-medium '+(currentTrack?.id===track.id?'text-[#c4989a]':'')}>{track.name}</span><span className="mt-1 block truncate text-[12px] text-[#92867d]">{track.artist}{track.album?' · '+track.album:''}</span></span>
                {currentTrack?.id===track.id && isPlaying ? <span className="flex h-5 items-center gap-[3px] pr-1">{[0,1,2,3].map(n=><i key={n} className="w-[2px] rounded-full bg-[#c4989a]" style={{height:[6,13,9,16][n]+'px'}}/>)}</span> : <span className="pr-1 text-[12px] tabular-nums text-[#92867d]">{track.duration ? formatMusicTime(track.duration) : '›'}</span>}
              </button>) : <div className="py-14 text-center text-[13px] text-[#92867d]">{query?'没有找到匹配的收藏歌曲':'还没有喜欢的歌'}<div className="mt-2 text-[11px]">搜索歌曲并收藏后，会显示在这里</div>{query&&<button onClick={()=>void search()} className="mt-3 rounded-full bg-[#2d2724] px-4 py-2 text-white">搜索在线曲库</button>}</div>}
            </div>
            {currentTrack && <div onClick={()=>setNowPlayingOpen(true)} role="button" tabIndex={0} className="absolute bottom-[12px] left-[14px] right-[14px] z-30 flex h-[64px] items-center gap-3 overflow-hidden rounded-[24px] border border-[#e6e0dc] bg-[rgba(250,248,246,.96)] p-2 shadow-[0_10px_28px_rgba(60,40,30,.12)] backdrop-blur-xl">
              <div className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[14px] bg-[#eee3dc]">{currentTrack.cover?<img src={currentTrack.cover} alt="" className="h-full w-full object-cover"/>:<div className="h-full w-full" style={{background:'linear-gradient(135deg,#e8b7b0,#a9c2ae,#f4e9dc)'}}/>}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{currentTrack.name}</div><div className="mt-1 truncate text-[11px] text-[#92867d]">{currentTrack.artist}</div></div>
              <button onClick={event=>{event.stopPropagation();const audio=audioRef.current;if(!audio)return;if(audio.paused)void audio.play().then(()=>setIsPlaying(true)).catch(()=>showToast('浏览器无法播放该音源'));else audio.pause();}} aria-label="播放或暂停" className="grid h-10 w-10 shrink-0 place-items-center"><Play className="h-[21px] w-[21px] fill-current"/></button>
              <button onClick={event=>{event.stopPropagation();playAdjacentTrack(1);}} aria-label="下一首" className="grid h-10 w-10 shrink-0 place-items-center"><SkipForward className="h-[20px] w-[20px] fill-current"/></button>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e8e0da]"><div className="h-full bg-[#c4989a]" style={{width:playbackDuration?Math.min(100,playbackTime/playbackDuration*100)+'%':'0%'}}/></div>
            </div>}
            {nowPlayingOpen && <div className="absolute inset-0 z-[80] flex flex-col bg-white px-6 pb-6 pt-4"><div className="flex items-center justify-between"><button onClick={()=>setNowPlayingOpen(false)} className="grid h-8 w-8 place-items-center"><ArrowLeft className="h-5 w-5"/></button><span className="text-[11px] tracking-[2px] text-[#857b73]">正在播放</span><button onClick={()=>setTab('appearance')} className="grid h-8 w-8 place-items-center"><Settings2 className="h-5 w-5"/></button></div><div className="flex min-h-0 flex-1 flex-col items-center justify-center"><div className="aspect-square w-[min(72vw,300px)] overflow-hidden rounded-[28px] bg-[#eee3dc]">{currentTrack?.cover?<img src={currentTrack.cover} alt={currentTrack.name} className="h-full w-full object-cover"/>:<div className="h-full w-full" style={{background:'linear-gradient(135deg,#e8b7b0,#a9c2ae,#f4e9dc)'}}/>}</div><div className="mt-7 flex w-full items-center gap-3"><div className="min-w-0 flex-1"><div className="truncate font-serif text-[23px] font-semibold">{currentTrack?.name}</div><div className="mt-1 truncate text-[13px] text-[#857b73]">{currentTrack?.artist}</div></div><button onClick={()=>currentTrack&&toggleLiked(currentTrack)} className={isCurrentLiked?'text-[#c4989a]':'text-[#857b73]'}><Heart className={'h-5 w-5 '+(isCurrentLiked?'fill-current':'')}/></button></div><div className="mt-6 w-full"><input aria-label="播放进度" type="range" min={0} max={Math.max(1,playbackDuration||1)} value={Math.min(playbackTime,playbackDuration||playbackTime)} onChange={event=>{const n=Number(event.target.value);setPlaybackTime(n);if(audioRef.current&&Number.isFinite(audioRef.current.duration))audioRef.current.currentTime=n;}} className="w-full accent-[#c4989a]"/><div className="flex justify-between text-[10px] text-[#92867d]"><span>{formatMusicTime(playbackTime)}</span><span>{formatMusicTime(playbackDuration)}</span></div></div><div className="mt-7 flex items-center justify-center gap-10"><button onClick={()=>playAdjacentTrack(-1)}><SkipBack className="h-6 w-6"/></button><button onClick={()=>{const audio=audioRef.current;if(!audio||!currentTrack){setNowPlayingOpen(false);return;}if(audio.paused)void audio.play().then(()=>setIsPlaying(true)).catch(()=>showToast('浏览器无法播放该音源'));else audio.pause();}} className="grid h-16 w-16 place-items-center rounded-full bg-[#2d2724] text-white">{isPlaying?<Pause className="h-6 w-6 fill-current"/>:<Play className="h-6 w-6 fill-current"/>}</button><button onClick={()=>playAdjacentTrack(1)}><SkipForward className="h-6 w-6"/></button></div></div></div>}
          </div>
        )}
        
        {tab === 'search' && (
          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-between"><button onClick={() => setTab('player')} className="flex items-center gap-1 text-[11px] text-[#8f7e76]"><ArrowLeft className="w-3.5 h-3.5" />返回我的音乐</button><div className="font-serif text-[17px]">找歌</div><span className="w-16" /></div>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center bg-[#f8f6f3] border border-[#eee6e0] rounded-2xl px-3"><Search className="w-4 h-4 text-[#b5a49b] mr-2 shrink-0" /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void search(); }} placeholder="搜索歌名、歌手…" className="w-full py-3 bg-transparent outline-none text-[12px]" /></div>
              <button onClick={() => void search()} className="px-4 rounded-2xl bg-[#2d2724] text-white text-[11px]">{searching ? '搜索中…' : '搜索'}</button>
            </div>
            {results.length > 0 ? <div className="rounded-[20px] bg-[#f8f6f3] px-3">{results.map(track => (
              <button key={track.id} onClick={() => void playTrack(track)} className="w-full py-2.5 flex items-center gap-3 border-b last:border-0 border-[#eae4de] text-left">
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-white shrink-0 grid place-items-center">{track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Music2 className="w-4 h-4 text-[#b5a49b]" />}</div>
                <div className="min-w-0 flex-1"><div className="text-[12px] font-semibold truncate">{track.name}</div><div className="text-[10px] text-[#968980] truncate mt-0.5">{track.artist}{track.album ? ' · ' + track.album : ''}</div></div>
                <Play className="w-4 h-4 text-[#a57e80]" />
              </button>
            ))}</div> : <div className="rounded-[22px] bg-[#f8f6f3] py-12 px-5 text-center"><Search className="w-5 h-5 text-[#c3aaa4] mx-auto" /><div className="mt-3 text-[12px] text-[#74665e]">{searching ? '正在寻找歌曲…' : '搜索结果会显示在这里'}</div><div className="mt-1 text-[10px] text-[#a69a91]">只显示 API 实际返回的歌曲，不放示例数据</div></div>}
          </div>
        )}

        {tab === 'characters' && (
          <div className="pt-4 space-y-4">
            <section className="rounded-[24px] p-4 border border-[#eee5df]" style={{ background: 'linear-gradient(140deg,#fbf4f2,#f8f7f3 62%,#eef5ef)' }}>
              <div className="font-serif text-[20px]">一起听</div><div className="mt-1 text-[11px] text-[#8d7c73]">邀请已导入的角色，听同一首歌，也可以随机遇见。</div>
              <button onClick={() => setShowInviteCharacter(true)} disabled={!characters.length} className="mt-4 w-full py-3 rounded-full bg-[#2d2724] text-white text-[11px] disabled:opacity-40">选择角色一起听</button>
            </section>
            {strangerSession && (
              <section className="rounded-[22px] p-4 bg-[#fbf5f5] border border-[#f0e1e3]">
                <div className="text-[9px] tracking-[1.5px] text-[#a18b88]">CURRENT LISTENING ROOM</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white grid place-items-center">{characters.find(c => c.id === strangerSession.characterId)?.avatar ? <img src={characters.find(c => c.id === strangerSession.characterId)?.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#aaa]" />}</div>
                  <div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">{strangerSession.characterName}</div><div className="text-[10px] text-[#9a8d84]">{strangerSession.variantLabel}</div></div>
                  <UsersRound className="w-4 h-4 text-[#bd9094]" />
                </div>
                <div className="mt-3 rounded-xl bg-white/80 p-3 text-[11px] leading-relaxed text-[#655953]">{strangerLoading ? 'TA 正在听……' : strangerReaction || strangerSession.reactionLog[strangerSession.reactionLog.length - 1]?.text || '你们可以从当前歌曲开始聊起。'}</div>
                <div className="grid grid-cols-3 gap-2 mt-3"><button onClick={() => void reactToCurrentSong()} className="rounded-xl bg-white py-2 text-[10px]">听听 TA 怎么说</button><button onClick={() => void letStrangerChoose()} className="rounded-xl bg-white py-2 text-[10px]">让 TA 选歌</button><button onClick={saveCurrentToCharacter} className="rounded-xl bg-white py-2 text-[10px]">加入歌单</button></div>
              </section>
            )}
            {characters.length ? characters.map(character => (
              <section key={character.id} className="rounded-[22px] bg-[#f8f6f3] p-3 border border-[#eee7e1]">
                <button onClick={() => setSelectedCharacterId(character.id)} className="w-full flex items-center gap-3 text-left">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white grid place-items-center">{character.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#b6a39a]" />}</div>
                  <div className="min-w-0 flex-1"><div className="text-[12px] font-semibold truncate">{character.name}</div><div className="text-[10px] text-[#9c8f86] truncate">{character.variantLabel || character.characterVersion || '角色卡'}</div></div>
                  <ChevronRight className="w-4 h-4 text-[#b5a49b]" />
                </button>
                {selectedCharacterId === character.id && (
                  <div className="mt-3 pt-3 border-t border-[#e9e1db]">
                    <div className="flex items-center justify-between"><span className="text-[11px] font-semibold">TA 的歌单</span><button onClick={() => void startDirectListening(character)} className="text-[10px] text-[#a47f82]">邀请一起听</button></div>
                    {selectedCharacterPlaylists.filter(playlist => playlist.characterId === character.id).length ? selectedCharacterPlaylists.filter(playlist => playlist.characterId === character.id).map(playlist => (
                      <div key={playlist.name} className="mt-2 rounded-xl bg-white/80 px-3 py-2"><div className="text-[10px] font-semibold">{playlist.name}</div><div className="mt-1 text-[9px] text-[#9a8d84]">{playlist.tracks.length} 首</div>
                        {playlist.tracks.map(track => <button key={track.id} onClick={() => void playTrack(track)} className="w-full flex items-center gap-2 py-2 text-left"><div className="w-9 h-9 rounded-lg overflow-hidden bg-[#f5efeb] shrink-0">{track.cover && <img src={track.cover} alt="" className="w-full h-full object-cover" />}</div><div className="min-w-0 flex-1"><div className="text-[11px] truncate">{track.name}</div><div className="text-[9px] text-[#a2968e] truncate">{track.artist}</div></div><Play className="w-3 h-3 text-[#ad8a8c]" /></button>)}
                      </div>
                    )) : <div className="py-5 text-center text-[10px] text-[#aa9e95]">TA 的歌单还没有歌曲</div>}
                  </div>
                )}
              </section>
            )) : <div className="rounded-[22px] bg-[#f8f6f3] p-7 text-center"><UsersRound className="w-5 h-5 text-[#c5b0aa] mx-auto" /><div className="mt-3 text-[12px] text-[#756760]">还没有导入角色</div><div className="mt-1 text-[10px] text-[#a69a91]">导入角色卡后，TA 才会出现在这里</div></div>}
          </div>
        )}

        {tab === 'history' && (
          <div className="pt-4 space-y-4">
            <div className="flex items-end justify-between">
              <div><div className="font-serif text-[20px]">听歌记录</div><div className="mt-1 text-[10px] text-[#a0958d]">只记录当前音乐 ID 的音乐行为</div></div>
              <span className="text-[10px] text-[#a0958d]">{historySubtab === 'tracks' ? listeningHistory.length + ' 首' : (activeIdentity?.togetherRecords.length || 0) + ' 条'}</span>
            </div>
            <div className="flex gap-5 border-b border-[#eee8e3]">
              <button onClick={() => setHistorySubtab('tracks')} className={'py-2 text-[11px] border-b-2 ' + (historySubtab === 'tracks' ? 'border-[#c4989a] text-[#2d2724] font-semibold' : 'border-transparent text-[#9a8d84]')}>听过的歌 {listeningHistory.length}</button>
              <button onClick={() => setHistorySubtab('together')} className={'py-2 text-[11px] border-b-2 ' + (historySubtab === 'together' ? 'border-[#c4989a] text-[#2d2724] font-semibold' : 'border-transparent text-[#9a8d84]')}>一起听 {activeIdentity?.togetherRecords.length || 0}</button>
            </div>
            {historySubtab === 'tracks' ? (
              listeningHistory.length ? (
                <div className="rounded-[20px] bg-[#f8f6f3] px-3">
                  {listeningHistory.map((track, index) => (
                    <div key={track.id + '-' + index} className="flex items-center gap-3 py-2.5 border-b last:border-0 border-[#eae4de]">
                      <button onClick={() => void playTrack(track)} className="w-11 h-11 rounded-xl overflow-hidden bg-white shrink-0 grid place-items-center">{track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" /> : <Music2 className="w-4 h-4 text-[#b5a49b]" />}</button>
                      <button onClick={() => void playTrack(track)} className="min-w-0 flex-1 text-left"><div className="text-[12px] font-semibold truncate">{track.name}</div><div className="text-[10px] text-[#9a8d84] truncate mt-0.5">{track.artist}{track.album ? ' · ' + track.album : ''}</div></button>
                      <button onClick={() => toggleLiked(track)} aria-label="喜欢这首歌" className={likedTracks.some(item => item.id === track.id) ? 'text-[#c4989a]' : 'text-[#b5a49b]'}><Heart className={'w-3.5 h-3.5 ' + (likedTracks.some(item => item.id === track.id) ? 'fill-current' : '')} /></button>
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-[22px] bg-[#f8f6f3] py-12 text-center"><Music2 className="w-5 h-5 text-[#c5b0aa] mx-auto" /><div className="mt-3 text-[12px] text-[#756760]">还没有听歌记录</div><div className="mt-1 text-[10px] text-[#a69a91]">播放过的歌曲会自动记录在当前音乐 ID 中</div></div>
            ) : (
              activeIdentity?.togetherRecords.length ? (
                <div className="rounded-[20px] bg-[#f8f6f3] px-3">
                  {activeIdentity.togetherRecords.map((record, index) => {
                    const character = characters.find(item => item.id === record.characterId);
                    return (
                      <div key={record.characterId + '-' + record.playedAt + '-' + index} className="flex items-center gap-3 py-3 border-b last:border-0 border-[#eae4de]">
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-white shrink-0 grid place-items-center">{character?.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#b5a49b]" />}</div>
                        <div className="min-w-0 flex-1"><div className="text-[12px] font-semibold truncate">{record.characterName}</div><div className="text-[10px] text-[#9a8d84] mt-0.5 truncate">{record.trackName} · {record.variantLabel}</div><div className="text-[9px] text-[#aaa098] mt-1">{new Date(record.playedAt).toLocaleString()} · {record.mode === 'direct' ? '邀请一起听' : '随机遇见'}</div></div>
                        <button onClick={() => { const target = characters.find(item => item.id === record.characterId); if (!target) { showToast('这个角色已不在导入列表中'); return; } setSelectedCharacterId(target.id); setTab('characters'); }} className="text-[#a57e80]"><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="rounded-[22px] bg-[#f8f6f3] py-12 text-center"><UsersRound className="w-5 h-5 text-[#c5b0aa] mx-auto" /><div className="mt-3 text-[12px] text-[#756760]">还没有一起听记录</div><div className="mt-1 text-[10px] text-[#a69a91]">邀请角色一起听或随机遇见后，记录会归入当前音乐 ID</div></div>
            )}
            <button onClick={() => setTab('player')} className="w-full py-3 rounded-full border border-[#e8ded8] bg-white text-[#64564e] text-[11px]">返回我的音乐</button>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="pt-4 space-y-3">
            <section className="rounded-[24px] border border-[#eee5df] bg-[#fbf8f5] p-4">
              <div className="font-serif text-[15px]">清除缓存</div>
              <div className="mt-2 text-[10px] text-[#95877f]">如果当前播放歌曲显示异常（如显示林俊杰），可点击清除</div>
              <button onClick={() => { saveMusicCurrent(null); setCurrentTrack(null); showToast('已清除当前歌曲'); }} className="mt-3 w-full py-2.5 rounded-full border border-[#e8ded8] bg-white text-[#64564e] text-[11px]">清除当前播放缓存</button>
            </section>
            {/* 外观设置 - 可折叠 */}
            <section className="rounded-[24px] border border-[#eee5df] bg-[#fbf8f5] overflow-hidden">
              <button onClick={() => setAppearanceCollapsed(v => !v)} className="w-full flex items-center justify-between p-4">
                <div className="font-serif text-[17px]">外观</div>
                <ChevronRight className={'w-4 h-4 text-[#a59a92] transition-transform ' + (appearanceCollapsed ? '' : 'rotate-90')} />
              </button>
              {!appearanceCollapsed && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="text-[11px] font-semibold">强调色</div>
                  <div className="flex gap-2">{['#c4989a','#9dbcae','#d4b58b','#9caec8'].map(color => <button key={color} onClick={() => { setMusicAccent(color); document.documentElement.style.setProperty('--music-accent', color); showToast('强调色已保存'); }} className="w-8 h-8 rounded-full border border-white shadow-sm" style={{ background: color }} aria-label={'选择颜色 ' + color} />)}</div>
                  <div className="text-[11px] font-semibold">页面底色</div>
                  <div className="flex flex-wrap gap-2">{[{name:'纯白',value:'#ffffff'},{name:'雾粉',value:'#fff8f7'},{name:'清浅绿',value:'#f5faf6'},{name:'冷雾蓝',value:'#f5f8fc'}].map(option => <button key={option.value} onClick={() => { setMusicBackground(option.value); showToast('音乐页面底色已保存'); }} className={'px-3 py-2 rounded-full border text-[10px] ' + (musicBackground === option.value ? 'border-[#c4989a] bg-white text-[#5d514b]' : 'border-[#eee5df] bg-white/70 text-[#8f8178]')}><span className="inline-block w-3 h-3 rounded-full border border-black/5 align-middle mr-1.5" style={{background:option.value}} />{option.name}</button>)}</div>
                  <div className="text-[9px] text-[#a0958d]">只影响音乐 App，不改变手机其他应用。</div>
                </div>
              )}
            </section>

            {/* API 设置 - 可折叠 */}
            <section className="rounded-[24px] border border-[#eee5df] bg-white overflow-hidden">
              <button onClick={() => setApiCollapsed(v => !v)} className="w-full flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-[#c4989a]" />
                  <span className="font-serif text-[17px]">网易云 Music API</span>
                </div>
                <ChevronRight className={'w-4 h-4 text-[#a59a92] transition-transform ' + (apiCollapsed ? '' : 'rotate-90')} />
              </button>
              {!apiCollapsed && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="text-[10px] leading-relaxed text-[#95877f]">填写 API 根地址。搜索、歌曲详情和播放地址由这个服务提供；搜索成功不代表一定有可播放音源。</div>
                  <input value={apiBaseUrl} onChange={e => { setApiBaseUrl(e.target.value); setApiTestStatus(''); }} placeholder="https://你的音乐 API 域名" className="w-full p-3 rounded-xl bg-[#f8f6f3] text-[11px] font-mono outline-none border border-[#eee6e0]" />
                  {apiTestStatus && <div className={'text-[10px] leading-relaxed rounded-xl p-3 ' + (apiTestStatus.startsWith('搜索接口正常') ? 'bg-[#edf7ef] text-[#386b47]' : apiTestStatus.startsWith('正在') ? 'bg-[#f7f7f8] text-[#777]' : 'bg-[#fff2f0] text-[#a14f48]')}>{apiTestStatus}</div>}
                  <button disabled={apiTesting} onClick={() => void testAndSaveMusicApi()} className="w-full py-3 rounded-full bg-[#2d2724] text-white text-[11px] disabled:opacity-50">{apiTesting ? '正在测试…' : '测试连接并保存'}</button>
                  <button onClick={() => { saveMusicApiSettings({ baseUrl: apiBaseUrl.trim() }); showToast('音乐 API 地址已保存'); }} className="w-full py-3 rounded-full border border-[#e8ded8] bg-white text-[#64564e] text-[11px]">仅保存地址</button>
                </div>
              )}
            </section>

            {/* 登录网易云 - 可折叠 */}
            <section className="rounded-[24px] border border-[#eee5df] bg-white overflow-hidden">
              <button onClick={() => setLoginCollapsed(v => !v)} className="w-full flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-[17px]">登录网易云账号</span>
                  {musicCookie ? <span className="text-[9px] px-2 py-1 rounded-full bg-[#edf7ef] text-[#386b47]">已登录</span> : <span className="text-[9px] px-2 py-1 rounded-full bg-[#f5f5f5] text-[#888]">未登录</span>}
                </div>
                <ChevronRight className={'w-4 h-4 text-[#a59a92] transition-transform ' + (loginCollapsed ? '' : 'rotate-90')} />
              </button>
              {!loginCollapsed && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="text-[10px] leading-relaxed text-[#95877f]">登录后无版权 / 灰色歌曲大概率可播放；登录凭证只保存在本地浏览器。</div>
                  {musicCookie ? (
                    <div className="space-y-2">
                      <div className="text-[10px] text-[#75675f]">MUSIC_U 长度：{musicCookie.musicU.length} 字符</div>
                      <div className="text-[10px] text-[#a0958d]">登录于：{new Date(musicCookie.loggedAt).toLocaleString()}</div>
                      <button onClick={() => void doLogout()} className="w-full py-3 rounded-full border border-[#e8ded8] bg-white text-[#a14f48] text-[11px]">退出登录</button>
                    </div>
                  ) : (
                    <button onClick={() => { setQrLoginOpen(true); void startQrLogin(); }} className="w-full py-3 rounded-full bg-[#c4453f] text-white text-[11px] font-semibold">扫码登录网易云</button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
        </main>
      </div>

      {identityEditor && (
        <div onClick={() => setIdentityEditor(false)} className="absolute inset-0 z-[70] bg-[#2d2724]/30 flex items-end">
          <div onClick={event => event.stopPropagation()} className="w-full bg-white rounded-t-[28px] p-5 pb-8 space-y-3 shadow-xl">
            <div className="flex items-center justify-between"><div className="font-serif text-[17px]">{identityEditing ? '编辑音乐 ID' : '新建音乐 ID'}</div><button onClick={() => setIdentityEditor(false)}><X className="w-4 h-4 text-[#999]" /></button></div>
            <div className="text-[11px] leading-relaxed text-[#95877f]">每个音乐 ID 都有独立的喜欢列表和听歌记录，切换身份不会混在一起。</div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-[#8e8078]">关联 LINE 的我的人设</label>
              <select value={identityPersonaDraft} onChange={event => setIdentityPersonaDraft(event.target.value)} className="w-full rounded-xl border border-[#e9dfd9] bg-white px-3 py-2.5 text-[11px] text-[#5e514a] outline-none">
                <option value="">跟随 LINE 当前人设{lineActivePersonaId && linePersonas.find(persona => persona.id === lineActivePersonaId)?.name ? '（' + linePersonas.find(persona => persona.id === lineActivePersonaId)?.name + '）' : ''}</option>
                {linePersonas.map(persona => <option key={persona.id} value={persona.id}>{persona.name || '未命名人设'}</option>)}
              </select>
              <p className="text-[9px] leading-relaxed text-[#a69a91]">音乐 ID 关联这里选择的 LINE 人设，不会复制或另建一份人设。</p>
            </div>
            <label className="flex items-center gap-3 rounded-2xl bg-[#f8f6f3] p-3 cursor-pointer">
              <span className="w-11 h-11 rounded-xl overflow-hidden bg-white grid place-items-center">{identityAvatar ? <img src={identityAvatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#b5a49b]" />}</span>
              <span className="flex-1 text-[11px] text-[#64564e]">更换此 ID 的头像<small className="block mt-1 text-[9px] text-[#a1968d]">仅影响当前音乐身份</small></span>
              <input type="file" accept="image/*" className="hidden" onChange={event => {
                const file = event.target.files?.[0];
                if (!file || !activeIdentity) return;
                void (async () => {
                  try {
                    const dataUrl = await readAndCompressImage(file, 512);
                    updateActiveIdentity(identity => ({ ...identity, avatar: dataUrl }));
                  } catch { /* 读取失败忽略 */ }
                })();
                event.target.value = '';
              }} />
            </label>
            <label className="block text-[11px] text-[#75675f]">ID 名称<input value={identityNameDraft} onChange={event => setIdentityNameDraft(event.target.value)} maxLength={20} placeholder="给这个音乐身份起个名字" className="mt-1 w-full p-3 rounded-xl bg-[#f8f6f3] text-[12px] outline-none" /></label>
            <label className="block text-[11px] text-[#75675f]">个人简介<input value={identityNoteDraft} onChange={event => setIdentityNoteDraft(event.target.value)} maxLength={80} placeholder="例如：通勤路上才有空听歌" className="mt-1 w-full p-3 rounded-xl bg-[#f8f6f3] text-[12px] outline-none" /></label>
            <button onClick={() => identityEditing ? saveIdentity() : createIdentity()} className="w-full py-3 rounded-full bg-[#2d2724] text-white text-[11px] font-semibold">{identityEditing ? '保存身份' : '创建并切换'}</button>
          </div>
        </div>
      )}

      {showInviteCharacter && (
        <div onClick={() => setShowInviteCharacter(false)} className="absolute inset-0 z-50 bg-[#2d2724]/30 flex items-end">
          <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[28px] p-4 pb-7 space-y-3 shadow-xl">
            <div className="flex items-center justify-between"><div className="font-serif text-[15px]">选择一起听的人</div><button onClick={() => setShowInviteCharacter(false)}><X className="w-4 h-4 text-[#999]" /></button></div>
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
              {characters.map(character => (
                <button key={character.id} onClick={() => { setShowInviteCharacter(false); void startDirectListening(character); }} className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-[#faf7f4] border border-[#f0e8e2] text-left">
                  <div className="w-10 h-10 rounded-2xl overflow-hidden bg-white grid place-items-center">{character.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-4 h-4 text-[#b6a39a]" />}</div>
                  <div className="min-w-0 flex-1"><div className="text-[11px] font-semibold truncate">{character.name}</div><div className="text-[9px] text-[#9c8f86] truncate">{character.variantLabel || character.characterVersion || '角色卡'}</div></div>
                  <ChevronRight className="w-4 h-4 text-[#b5a49b]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={event => setPlaybackTime(event.currentTarget.currentTime || 0)}
        onLoadedMetadata={event => setPlaybackDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={event => setPlaybackDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          const audio = audioRef.current;
          if (!audio || !currentTrack || currentTrack.source !== 'netease') {
            setIsPlaying(false);
            return;
          }
          const currentUrl = currentTrack.playUrl || '';
          let fallbackUrl = '';
          try {
            if (currentUrl.includes('/song/url/v1/302')) {
              const parsed = new URL(currentUrl);
              if (parsed.searchParams.get('level') === 'standard') {
                parsed.searchParams.set('level', 'exhigh');
                fallbackUrl = parsed.toString();
              }
            } else {
              const parsed = new URL('/song/url/v1/302', readMusicApiSettings().baseUrl);
              parsed.searchParams.set('id', currentTrack.id);
              parsed.searchParams.set('level', 'standard');
              fallbackUrl = parsed.toString();
            }
          } catch {
            fallbackUrl = '';
          }
          if (fallbackUrl && fallbackUrl !== currentUrl) {
            const fallbackTrack = { ...currentTrack, playUrl: fallbackUrl };
            setCurrentTrack(fallbackTrack);
            saveMusicCurrent(fallbackTrack);
            audio.src = fallbackUrl;
            audio.load();
            void audio.play().then(() => setIsPlaying(true)).catch(() => {
              setIsPlaying(false);
              showToast('已经尝试备用音质，但 API 没有提供可播放音源。请换一首歌曲测试。');
            });
            return;
          }
          setIsPlaying(false);
          showToast('API 没有提供可播放音源，请换一首歌曲测试。');
        }}
        className="hidden"
      />
      {toast && <div className="absolute left-1/2 -translate-x-1/2 bottom-5 z-[60] px-4 py-2.5 rounded-full bg-[#2d2724] text-white text-[10px] shadow-lg">{toast}</div>}

      {/* 网易云扫码登录弹窗 */}
      {qrLoginOpen && (
        <div onClick={() => { if (qrStatus === 'success' || qrStatus === 'expired') { setQrLoginOpen(false); setQrStatus('idle'); setQrMessage(''); setQrImg(''); } else { cancelQrLogin(); setQrLoginOpen(false); } }} className="absolute inset-0 z-[75] bg-[#2d2724]/40 flex items-end">
          <div onClick={event => event.stopPropagation()} className="w-full bg-white rounded-t-[28px] p-5 pb-8 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="font-serif text-[17px]">网易云扫码登录</div>
              <button onClick={() => { if (qrStatus === 'success' || qrStatus === 'expired') { setQrLoginOpen(false); setQrStatus('idle'); setQrMessage(''); setQrImg(''); } else { cancelQrLogin(); setQrLoginOpen(false); } }}><X className="w-4 h-4 text-[#999]" /></button>
            </div>
            <div className="text-[10px] leading-relaxed text-[#95877f]">打开手机网易云音乐 App，扫下面的二维码并确认登录。登录后会保存 MUSIC_U 凭证到本地浏览器，所有需要登录态的接口（包括灰色歌曲解锁）都会自动带上。</div>

            {qrStatus === 'success' ? (
              <div className="space-y-3">
                <div className="aspect-square w-full max-w-[260px] mx-auto rounded-2xl bg-[#edf7ef] grid place-items-center">
                  <div className="text-center px-6">
                    <div className="text-3xl">✓</div>
                    <div className="mt-2 text-[12px] text-[#386b47] font-semibold">登录成功</div>
                    <div className="mt-1 text-[9px] text-[#5a8e6c]">MUSIC_U 已保存</div>
                  </div>
                </div>
                <button onClick={() => { setQrLoginOpen(false); setQrStatus('idle'); setQrMessage(''); }} className="w-full py-3 rounded-full bg-[#2d2724] text-white text-[11px]">完成</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="aspect-square w-full max-w-[260px] mx-auto rounded-2xl bg-white border border-[#eee5df] grid place-items-center overflow-hidden relative">
                  {qrLoading && !qrImg ? (
                    <div className="text-[10px] text-[#999]">生成中…</div>
                  ) : qrImg ? (
                    <img src={qrImg} alt="网易云登录二维码" className="w-full h-full object-contain p-3" />
                  ) : (
                    <div className="text-[10px] text-[#999]">{qrMessage || '点击下方按钮开始'}</div>
                  )}
                  {qrStatus === 'expired' && (
                    <div className="absolute inset-0 bg-white/85 grid place-items-center">
                      <div className="text-center">
                        <div className="text-[12px] text-[#a14f48]">二维码已过期</div>
                        <button onClick={() => void startQrLogin()} className="mt-3 px-4 py-2 rounded-full bg-[#2d2724] text-white text-[10px]">重新生成</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-center text-[11px] text-[#75675f] min-h-[20px]">{qrMessage || '点击下方按钮生成二维码'}</div>
                {!qrLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => void startQrLogin()} className="py-3 rounded-full bg-[#c4453f] text-white text-[11px] font-semibold">生成二维码</button>
                    <button onClick={() => { cancelQrLogin(); setQrLoginOpen(false); }} className="py-3 rounded-full border border-[#e8ded8] bg-white text-[#64564e] text-[11px]">取消</button>
                  </div>
                ) : (
                  <button onClick={cancelQrLogin} className="w-full py-3 rounded-full border border-[#e8ded8] bg-white text-[#64564e] text-[11px]">取消登录</button>
                )}
                <div className="text-[9px] text-[#a0958d] leading-relaxed">二维码有效期约 2 分钟；超时或失败可重新生成。登录凭证只会保存在你本地浏览器（localStorage 的 MUSIC_U 字段），不上传到任何服务器。</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMusicTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function DiscIcon() {
  return <div className="w-12 h-12 rounded-full border-2 border-[#8b7560] grid place-items-center text-[#8b7560]"><Volume2 className="w-4 h-4" /></div>;
}
