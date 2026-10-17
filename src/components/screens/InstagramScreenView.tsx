import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart, MessageCircle, Send, Bookmark, Home, Search, PlusSquare, Film,
  ChevronLeft, MoreHorizontal, X, Check, Menu, LayoutGrid, Trash2, RotateCcw,
} from 'lucide-react';
import { usePersistentState } from '../../store/usePersistentState';
import { ScreenType } from '../../types';
import { getNpcs, updateNpc } from '../../store/npcs';
import { getLikedTracks } from '../../store/music';
import { getMedia, putMedia, deleteMedia } from '../../store/mediaVault';

interface InstagramScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
}

interface IgComment {
  id: string;
  by: string; // 'me' | characterId | npcId
  byName: string;
  text: string;
  isNpc?: boolean;
  liked?: boolean;
}

interface IgPost {
  id: string;
  by: string;
  byName: string;
  byAvatar?: string;
  text: string;
  gradient: number;
  visibility?: 'public' | 'friends' | 'private';
  media?: string; // 'media:xxx' 引用，真实图片/视频
  likes: number;
  liked: boolean;
  saved: boolean;
  comments: IgComment[];
  time: string;
  deleted?: boolean;
  deletedInfo?: string;
  track?: { title: string; artist: string };
}

interface IgPersona {
  id: string;
  name: string;
  avatar?: string;
  title: string;
  job: string;
  bio: string;
  theme: string;
  themeSoft: string;
  currentTrack?: { title: string; artist: string } | null;
}

interface IgPersonaExtras {
  title: string;
  job: string;
  bio: string;
  theme: string;
  themeSoft: string;
}

const DEFAULT_IG_EXTRAS: IgPersonaExtras = {
  title: '', job: '', bio: '', theme: '#e9c4cb', themeSoft: '#fdeef0',
};

const IG_MIGRATION_KEY = 'phone:instagram-persona-migrated-v1';

const GRADIENTS: [string, string, string][] = [
  ['#9dbcae', '#dcb3ae', '#eee8df'],
  ['#9fb8d4', '#e3bfd6', '#efe7e1'],
  ['#f0c48f', '#cfb0d4', '#f6eddf'],
  ['#e8b7b0', '#a9c2ae', '#f4e9dc'],
  ['#a6d8bb', '#f7d3b8', '#f6f0e6'],
  ['#cdb5da', '#a6cdd0', '#f3ecea'],
];

const THEME_COLORS: [string, string][] = [
  ['#e9c4cb', '#fdeef0'],
  ['#a9bcc4', '#e8eff2'],
  ['#c9d6b8', '#f0f4e8'],
  ['#d9c4e4', '#f4eef8'],
  ['#f0cfa8', '#fbf1e4'],
];

function MeshImage({ g, className = '' }: { g: number; className?: string }) {
  const [a, b, c] = GRADIENTS[g % GRADIENTS.length];
  return (
    <div
      className={className}
      style={{ background: `radial-gradient(at 18% 12%, ${a} 0, transparent 58%), radial-gradient(at 88% 28%, ${b} 0, transparent 55%), ${c}` }}
    />
  );
}

function PostMedia({ media, gradient, className = '' }: { media?: string; gradient: number; className?: string }) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setIsVideo(false);
    const value = String(media || '').trim();
    if (!value) return;
    if (value.startsWith('media:')) {
      void getMedia(value.slice(6)).then(url => {
        if (cancelled || !url) return;
        setIsVideo(url.startsWith('data:video/'));
        setResolved(url);
      }).catch(() => {});
    } else {
      setIsVideo(value.startsWith('data:video/'));
      setResolved(value);
    }
    return () => { cancelled = true; };
  }, [media]);
  if (resolved) {
    return isVideo
      ? <video src={resolved} className={className} controls playsInline preload="metadata" />
      : <img src={resolved} className={className + ' object-cover'} alt="" />;
  }
  return <MeshImage g={gradient} className={className} />;
}

function Avatar({ size = 34, ring = 0, avatarUrl, name, online }: { size?: number; ring?: number; avatarUrl?: string; name?: string; online?: boolean }) {
  const ringBg = ring === 1
    ? 'linear-gradient(135deg,#dcb3ae,#b4838a 50%,#9dbcae)'
    : ring === 2 ? '#b4838a' : '#cfcfcf';
  const inner = avatarUrl ? (
    <img src={avatarUrl} alt={name || ''} className="w-full h-full object-cover rounded-full" />
  ) : (
    <div className="w-full h-full rounded-full bg-[#f3f3f3] border border-[#ececec] grid place-items-center text-[#bdbdbd]">
      <svg viewBox="0 0 24 24" width="55%" height="55%" fill="currentColor">
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M4.5 20c.8-4 4-5.6 7.5-5.6s6.7 1.6 7.5 5.6z" />
      </svg>
    </div>
  );
  const dot = online ? <span className="absolute bottom-0 right-0 rounded-full bg-[#4ade80] border-2 border-white" style={{ width: size * 0.28, height: size * 0.28 }} /> : null;
  if (ring) {
    return (
      <div className="relative" style={{ width: size, height: size, flex: 'none' }}>
        <div style={{ width: size, height: size, borderRadius: '50%', padding: 2.5, background: ringBg }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', padding: 2 }}>{inner}</div>
        </div>
        {dot}
      </div>
    );
  }
  return <div className="relative" style={{ width: size, height: size, flex: 'none' }}>{inner}{dot}</div>;
}

type View = 'home' | 'comments' | 'me' | 'activity' | 'deleted' | 'compose' | 'search' | 'post' | 'dm' | 'chat' | 'edit' | 'story';

export function InstagramScreenView({ onNavigate }: InstagramScreenViewProps) {
  const [posts, setPosts] = usePersistentState<IgPost[]>('phone:instagram', []);
  const [view, setView] = useState<View>('home');
  const [prevView, setPrevView] = useState<View>('home');
  const [follows, setFollows] = usePersistentState<string[]>('phone:instagram-follows', []);
  const [composeVisibility, setComposeVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [activePostId, setActivePostId] = useState<string>('');
  const [commentInput, setCommentInput] = useState('');
  const [composeText, setComposeText] = useState('');
  const [composeGradient, setComposeGradient] = useState(0);
  const [composeMedia, setComposeMedia] = useState('');
  const [composeMediaUploading, setComposeMediaUploading] = useState(false);
  const composeFileRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sheet, setSheet] = useState<null | 'persona' | 'menu' | 'bind' | 'viewers' | { pm: string }>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [seenStories, setSeenStories] = useState<Record<string, boolean>>({});
  const [dmTarget, setDmTarget] = useState('');
  const [dmInput, setDmInput] = useState('');
  const [dms, setDms] = usePersistentState<Record<string, { me?: boolean; text: string }[]>>('phone:instagram-dm', {});
  const [toast, setToast] = useState('');
  const [editingPersona, setEditingPersona] = useState<{ name: string; title: string; job: string; bio: string } | null>(null);
  const [editThemeIdx, setEditThemeIdx] = useState(0);

  // 人设联通 LINE：基础信息（名字/头像）从 line:user-personas 来，IG 特有字段存 sidecar
  const [linePersonas, setLinePersonas] = usePersistentState<any[]>('line:user-personas', []);
  const [lineActivePersonaId, setLineActivePersonaId] = usePersistentState<string | null>('line:active-persona', null);
  const [igExtras, setIgExtras] = usePersistentState<Record<string, IgPersonaExtras>>('phone:instagram-persona-extras', {});

  // 一次性迁移旧 IG 人设
  useEffect(() => {
    try {
      if (localStorage.getItem(IG_MIGRATION_KEY)) return;
      const rawOld = localStorage.getItem('phone:instagram-personas');
      const oldList = rawOld ? JSON.parse(rawOld) : [];
      if (Array.isArray(oldList) && oldList.length > 0) {
        const oldIdx = Math.min(parseInt(localStorage.getItem('phone:instagram-persona-idx') || '0', 10) || 0, oldList.length - 1);
        const old = oldList[oldIdx] || oldList[0];
        const rawLines = localStorage.getItem('line:user-personas');
        let lines: any[] = [];
        try { const parsed = rawLines ? JSON.parse(rawLines) : []; if (Array.isArray(parsed)) lines = parsed; } catch { /* ignore */ }
        let target = lines.find((p: any) => p && p.name === old.name) || lines[0] || null;
        if (!target) {
          target = { id: `p_${Date.now()}`, name: old.name || '我', avatar: '', boundCharacterIds: [] };
          lines = [target];
        }
        const extras: IgPersonaExtras = {
          title: old.title || '', job: old.job || '', bio: old.bio || '',
          theme: old.theme || DEFAULT_IG_EXTRAS.theme, themeSoft: old.themeSoft || DEFAULT_IG_EXTRAS.themeSoft,
        };
        let sidecar: Record<string, IgPersonaExtras> = {};
        try { const parsed = JSON.parse(localStorage.getItem('phone:instagram-persona-extras') || '{}'); if (parsed && typeof parsed === 'object') sidecar = parsed; } catch { /* ignore */ }
        sidecar[target.id] = { ...(sidecar[target.id] || DEFAULT_IG_EXTRAS), ...extras };
        localStorage.setItem('line:user-personas', JSON.stringify(lines));
        localStorage.setItem('phone:instagram-persona-extras', JSON.stringify(sidecar));
        localStorage.setItem('line:active-persona', JSON.stringify(target.id));
        setLinePersonas(lines);
        setIgExtras(sidecar);
        setLineActivePersonaId(target.id);
      }
      localStorage.setItem(IG_MIGRATION_KEY, '1');
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const personas: IgPersona[] = useMemo(() => (Array.isArray(linePersonas) ? linePersonas : []).map((p: any) => {
    const ex = (igExtras && igExtras[p.id]) || DEFAULT_IG_EXTRAS;
    return {
      id: String(p.id),
      name: p.name || '未命名',
      avatar: p.avatar || '',
      title: ex.title || '',
      job: ex.job || '',
      bio: ex.bio || '',
      theme: ex.theme || DEFAULT_IG_EXTRAS.theme,
      themeSoft: ex.themeSoft || DEFAULT_IG_EXTRAS.themeSoft,
      currentTrack: (p.currentTrack as { title: string; artist: string } | null) || null,
    };
  }), [linePersonas, igExtras]);

  const activePersonaId = lineActivePersonaId || personas[0]?.id || null;
  const persona: IgPersona = personas.find(p => p.id === activePersonaId) || personas[0] || {
    id: '', name: '我', avatar: '', ...DEFAULT_IG_EXTRAS,
  };

  // IG 里新建人设 → 写回 line:user-personas
  const createIgPersona = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { showToast('先给人设起个名字'); return; }
    const np = { id: `p_${Date.now()}`, name: trimmed, avatar: '', boundCharacterIds: [] };
    setLinePersonas((prev: any[]) => [...(Array.isArray(prev) ? prev : []), np]);
    setLineActivePersonaId(np.id);
    showToast('已创建并切换为 ' + trimmed);
  };

  // 角色和 NPC
  const [importedCharacters, setImportedCharacters] = usePersistentState<any[]>('phone:characters', []);
  const [npcTick, setNpcTick] = useState(0);
  const npcs = useMemo(() => { try { return getNpcs(); } catch { return []; } }, [npcTick]);
  const [composeTrack, setComposeTrack] = useState<{ title: string; artist: string } | null>(null);
  const [musicTarget, setMusicTarget] = useState<null | 'me' | 'compose' | string>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const people = useMemo(() => [
    ...importedCharacters.map((c: any) => ({ id: `char:${c.id || c.name}`, name: c.name || '未命名', avatar: c.avatar, kind: '角色' as const })),
    ...npcs.map((n: any) => ({ id: `npc:${n.id || n.name}`, name: n.name || '未命名', avatar: n.avatar, kind: 'NPC' as const })),
  ], [importedCharacters, npcs]);

  const toastTimer = useRef<any>(null);
  const showToast = (t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  const go = (v: View) => {
    setPrevView(view === 'comments' || view === 'post' || view === 'compose' ? prevView : view);
    setView(v);
    setSheet(null);
    setMusicTarget(null);
  };
  const back = () => {
    setView(view === 'chat' ? 'dm' : prevView || 'home');
    setSheet(null);
    setMusicTarget(null);
  };

  const resolveName = (by: string) => {
    if (by === 'me') return persona.name;
    const p = people.find(x => x.id === by);
    return p ? p.name : by;
  };
  const resolveAvatar = (by: string) => {
    if (by === 'me') return persona.avatar || undefined;
    return people.find(x => x.id === by)?.avatar;
  };

  // 音乐状态：persona / 角色 / NPC 都支持，存在各自对象上
  const setMyTrack = (track: { title: string; artist: string } | null) => {
    if (!activePersonaId) return;
    setLinePersonas((prev: any[]) => (Array.isArray(prev) ? prev : []).map((p: any) =>
      String(p.id) === String(activePersonaId) ? { ...p, currentTrack: track } : p));
  };
  const setPersonTrack = (personId: string, track: { title: string; artist: string } | null) => {
    if (personId === 'me') { setMyTrack(track); return; }
    if (personId.startsWith('char:')) {
      const key = personId.slice(5);
      setImportedCharacters((prev: any[]) => (Array.isArray(prev) ? prev : []).map((x: any) =>
        String(x.id || x.name) === key ? { ...x, currentTrack: track } : x));
      return;
    }
    if (personId.startsWith('npc:')) {
      const key = personId.slice(4);
      const npc = npcs.find((n: any) => String(n.id) === key || String(n.name) === key);
      if (npc) { updateNpc(npc.id, { currentTrack: track }); setNpcTick(t => t + 1); }
    }
  };
  const getAuthorTrack = (by: string): { title: string; artist: string } | null => {
    if (by === 'me') return persona.currentTrack || null;
    if (by.startsWith('char:')) {
      const ch = importedCharacters.find((x: any) => `char:${x.id || x.name}` === by);
      return (ch?.currentTrack as { title: string; artist: string } | null) || null;
    }
    if (by.startsWith('npc:')) {
      const n = npcs.find((x: any) => `npc:${x.id || x.name}` === by);
      return (n?.currentTrack as { title: string; artist: string } | null) || null;
    }
    return null;
  };
  const likedTracks = useMemo(() => {
    if (!musicTarget) return [];
    try { return getLikedTracks(); } catch { return []; }
  }, [musicTarget]);
  const applyMusicChoice = (track: { title: string; artist: string }) => {
    if (musicTarget === 'compose') setComposeTrack(track);
    else if (musicTarget) setPersonTrack(musicTarget, track);
    setMusicTarget(null); setManualTitle(''); setManualArtist('');
    showToast('已设置 🎵 ' + track.title);
  };
  const clearMusicChoice = () => {
    if (musicTarget === 'compose') setComposeTrack(null);
    else if (musicTarget) setPersonTrack(musicTarget, null);
    setMusicTarget(null);
    showToast('已清除音乐状态');
  };

  const activePost = posts.find(p => p.id === activePostId);
  const visiblePosts = posts.filter(p => {
    if (p.deleted) return false;
    if (p.by === 'me') return true;
    if (p.visibility === 'private') return false;
    if (p.visibility === 'friends' && !follows.includes(p.by)) return false;
    // public 或未设置：只显示关注的人
    return follows.includes(p.by);
  });
  const myPosts = posts.filter(p => p.by === 'me' && !p.deleted);
  const deletedPosts = posts.filter(p => p.deleted);

  const toggleLike = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, liked: !p.liked } : p));
  };
  const toggleSave = (id: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const saved = !p.saved;
      showToast(saved ? '已收藏' : '已取消收藏');
      return { ...p, saved };
    }));
  };
  const openComments = (id: string) => {
    setActivePostId(id);
    setPrevView(view);
    setView('comments');
  };
  const sendComment = () => {
    const v = commentInput.trim();
    if (!v) { showToast('先写点什么'); return; }
    setPosts(prev => prev.map(p => p.id === activePostId
      ? { ...p, comments: [...p.comments, { id: `c${Date.now()}`, by: 'me', byName: persona.name, text: v }] }
      : p));
    setCommentInput('');
  };
  const inviteNpcComment = () => {
    showToast('NPC 正在输入…');
    const id = activePostId;
    setTimeout(() => {
      const npc = npcs[0];
      setPosts(prev => prev.map(p => p.id === id
        ? { ...p, comments: [...p.comments, { id: `c${Date.now()}`, by: npc ? `npc:${npc.id || npc.name}` : 'npc', byName: npc?.name || 'NPC', text: '好好看！', isNpc: true }] }
        : p));
    }, 900);
  };
  const handleComposeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { showToast('只支持图片/视频'); return; }
    if (file.size > 50 * 1024 * 1024) { showToast('文件太大（>50MB）'); return; }
    setComposeMediaUploading(true);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(new Error('读取失败'));
        r.onload = () => res(typeof r.result === 'string' ? r.result : '');
        r.readAsDataURL(file);
      });
      const id = await putMedia(dataUrl);
      setComposeMedia('media:' + id);
      showToast('已上传');
    } catch { showToast('上传失败'); }
    finally { setComposeMediaUploading(false); }
  };
  const publishPost = () => {
    const t = composeText.trim() || '我的帖子';
    setPosts(prev => [{
      id: `p${Date.now()}`, by: 'me', byName: persona.name, text: t,
      gradient: composeGradient % GRADIENTS.length, likes: 0, liked: false, saved: false,
      comments: [], time: '刚刚', visibility: composeVisibility,
      ...(composeTrack ? { track: composeTrack } : {}),
      ...(composeMedia ? { media: composeMedia } : {}),
    }, ...prev]);
    setComposeText('');
    setComposeGradient(0);
    setComposeMedia('');
    setComposeTrack(null);
    setView('home');
    showToast('已发布');
  };
  const deletePost = (id: string) => {
    const post = posts.find(p => p.id === id);
    // 清理关联媒体
    if (post?.media?.startsWith('media:')) {
      void deleteMedia(post.media.slice(6)).catch(() => {});
    }
    setPosts(prev => prev.map(p => p.id === id ? { ...p, deleted: true, deletedInfo: '刚刚删除' } : p));
    setSheet(null);
    showToast('已移到最近删除');
  };

  // 快拍自动播放
  useEffect(() => {
    if (view !== 'story') return;
    const storyKeys = ['me', ...people.filter(p => follows.includes(p.id)).slice(0, 3).map(p => p.id)];
    const timer = setTimeout(() => {
      const key = storyKeys[storyIndex];
      setSeenStories(prev => ({ ...prev, [key]: true }));
      if (storyIndex < storyKeys.length - 1) setStoryIndex(storyIndex + 1);
      else { setView('home'); setStoryIndex(0); }
    }, 4000);
    return () => clearTimeout(timer);
  }, [view, storyIndex, people]);

  const storyKeys = ['me', ...people.filter(p => follows.includes(p.id)).slice(0, 3).map(p => p.id)];
  const storyKey = storyKeys[storyIndex];
  const storyName = storyKey === 'me' ? persona.name : resolveName(storyKey);

  const searchResults = searchQuery.trim()
    ? people.filter(p => p.name.includes(searchQuery.trim()))
    : [];

  const sendDm = () => {
    const v = dmInput.trim();
    if (!v || !dmTarget) return;
    setDms(prev => ({ ...prev, [dmTarget]: [...(prev[dmTarget] || []), { me: true, text: v }] }));
    setDmInput('');
    const targetName = resolveName(dmTarget);
    setTimeout(() => {
      setDms(prev => ({ ...prev, [dmTarget]: [...(prev[dmTarget] || []), { text: `${targetName} 的回复` }] }));
    }, 900);
  };

  const tabs: { id: View; icon: React.ReactNode; activeIcon: React.ReactNode }[] = [
    { id: 'home', icon: <Home size={26} />, activeIcon: <Home size={26} fill="currentColor" /> },
    { id: 'search', icon: <Search size={26} />, activeIcon: <Search size={26} strokeWidth={2.5} /> },
    { id: 'compose', icon: <PlusSquare size={26} />, activeIcon: <PlusSquare size={26} strokeWidth={2.5} /> },
    { id: 'me', icon: <Avatar size={28} ring={view === 'me' ? 1 : 0} />, activeIcon: <Avatar size={28} ring={1} /> },
  ];

  const renderPost = (p: IgPost, inFeed = true) => (
    <article key={p.id} className="pb-1.5">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <Avatar size={34} avatarUrl={resolveAvatar(p.by)} name={p.byName} />
        <b className="flex-1 text-[13.5px]">{p.byName}</b>
        <button onClick={() => setSheet({ pm: p.id })} className="text-[#555]"><MoreHorizontal size={22} /></button>
      </div>
      <div className="w-full aspect-square" onDoubleClick={() => { if (!p.liked) { toggleLike(p.id); showToast('已赞'); } }}>
        <PostMedia media={p.media} gradient={p.gradient} className="w-full h-full" />
      </div>
      <div className="flex items-center gap-4 px-3.5 pt-2.5">
        <button onClick={() => toggleLike(p.id)} style={p.liked ? { color: '#e0556b' } : undefined}>
          <Heart size={25} fill={p.liked ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => openComments(p.id)}><MessageCircle size={25} /></button>
        <button onClick={() => showToast('已转发')}><Send size={25} /></button>
        <button onClick={() => toggleSave(p.id)} className="ml-auto">
          <Bookmark size={25} fill={p.saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p className="px-3.5 pt-1 text-[13px]"><b>{p.likes + (p.liked ? 1 : 0)} 人赞了</b></p>
      <p className="px-3.5 text-[13px] leading-[1.6]"><b>{p.byName}</b> {p.text}</p>
      {(() => {
        const pt = p.track || getAuthorTrack(p.by);
        return pt ? (
          <div className="px-3.5 pt-1.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6b5459] bg-[#fdeef0] rounded-full px-2.5 py-1 max-w-full">
              <span>🎵</span>
              <span className="font-medium truncate">{pt.title}</span>
              <span className="text-[#999] truncate">{pt.artist}</span>
            </span>
          </div>
        ) : null;
      })()}
      {inFeed && (
        <button onClick={() => openComments(p.id)} className="px-3.5 text-[#999] text-[13px]">
          查看全部 {p.comments.length} 条评论
        </button>
      )}
      <p className="px-3.5 text-[#999] text-[10.5px] mt-0.5">{p.time}</p>
    </article>
  );

  const renderTop = (title: string, showBack = true, right?: React.ReactNode) => (
    <div className="flex justify-between items-center px-4 pt-3.5 pb-2 sticky top-0 bg-white z-10">
      <div className="flex items-center gap-2.5">
        {showBack && <button onClick={back}><ChevronLeft size={26} /></button>}
        <b className="text-[17px]">{title}</b>
      </div>
      <div className="flex items-center gap-2.5">{right}</div>
    </div>
  );

  return (
    <div className="w-full h-full bg-white text-[#222] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: "'Noto Sans SC',-apple-system,'PingFang SC',sans-serif", paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {/* 首页 */}
        {view === 'home' && (
          <>
            <div className="flex justify-between items-center px-4 pt-3.5 pb-2">
              <div>
                <div className="text-[26px] font-bold tracking-[-0.3px] leading-none">Instagram</div>
                <div className="text-[#999] text-[11px] tracking-[1.5px] mt-1">今日はゆっくり。</div>
              </div>
              <div className="flex items-center gap-[18px] text-[#555]">
                <button onClick={() => go('activity')}><Heart size={24} /></button>
                <button onClick={() => go('dm')}><Send size={24} /></button>
              </div>
            </div>
            <div className="flex gap-2.5 px-3.5 pb-3 overflow-x-auto border-b border-[#ececec]" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => { setStoryIndex(0); setView('story'); }} className="flex-none w-[66px] text-center">
                <div className="relative">
                  <Avatar size={66} ring={seenStories['me'] ? 0 : 1} />
                  <span className="absolute right-0 bottom-0 w-5 h-5 rounded-full bg-[#b4838a] text-white border-2 border-white grid place-items-center text-[14px] leading-none">+</span>
                </div>
                <small className="block text-[11px] mt-1 text-[#999] truncate">我的快拍</small>
              </button>
              {people.filter(p => follows.includes(p.id)).slice(0, 10).map((p, i) => (
                <button key={p.id} onClick={() => { setStoryIndex(i + 1); setView('story'); }} className="flex-none w-[66px] text-center">
                  <Avatar size={66} ring={seenStories[p.id] ? 0 : 2} avatarUrl={p.avatar} name={p.name} />
                  <small className="block text-[11px] mt-1 text-[#999] truncate">{p.name}</small>
                </button>
              ))}
            </div>
            {visiblePosts.map(p => renderPost(p))}
            {visiblePosts.length === 0 && (
              <div className="text-center text-[#999] text-[13px] py-20">还没有帖子，去发一条吧</div>
            )}
          </>
        )}

        {/* 评论 */}
        {view === 'comments' && activePost && (
          <div className="flex flex-col min-h-full">
            {renderTop('评论')}
            <div className="flex items-start gap-3 px-[18px] py-2.5 border-b border-[#ececec]">
              <Avatar size={34} avatarUrl={resolveAvatar(activePost.by)} name={activePost.byName} />
              <div className="flex-1 text-[13px] leading-[1.5]">
                <b>{activePost.byName}</b> {activePost.text}
                <div className="text-[#999] text-[11px] mt-1">2 小时</div>
              </div>
            </div>
            {activePost.comments.map(c => (
              <div key={c.id} className="flex items-start gap-3 px-[18px] py-2.5">
                <Avatar size={34} avatarUrl={resolveAvatar(c.by)} name={c.byName} />
                <div className="flex-1 text-[13px]">
                  <b>{c.byName}</b>
                  {c.isNpc && <span className="text-[10px] text-[#b4838a] border border-[#b4838a] rounded-lg px-1 ml-1">NPC</span>}
                  <div>{c.text}</div>
                  <div className="text-[#999] text-[11px] mt-1">刚刚 &nbsp; 回复</div>
                </div>
              </div>
            ))}
            <div className="sticky bottom-0 bg-white border-t border-[#ececec] px-3.5 py-2.5 flex gap-2 items-center mt-auto">
              <Avatar size={36} />
              <input
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                placeholder="添加评论…"
                className="flex-1 h-[42px] border border-[#ececec] rounded-full px-4 text-[13px] outline-none"
              />
              <button onClick={sendComment} className="text-[#b4838a] font-bold text-[13px]">发布</button>
              <button onClick={inviteNpcComment} className="h-[42px] px-3 border border-[#b4838a] rounded-full text-[#b4838a] text-[12px]">邀请 NPC</button>
            </div>
          </div>
        )}

        {/* 个人页 */}
        {view === 'me' && (
          <>
            <div className="h-[128px] px-4 py-3.5 flex justify-between items-start" style={{ background: `linear-gradient(180deg, ${persona.theme}, ${persona.themeSoft})` }}>
              <button onClick={() => setSheet('persona')} className="text-[17px] font-bold text-[#222] flex gap-1 items-center">
                {persona.name} <ChevronLeft size={18} className="rotate-[-90deg]" />
              </button>
              <div className="flex gap-4 text-[#222]">
                <button onClick={() => go('compose')}><PlusSquare size={22} /></button>
                <button onClick={() => setSheet('menu')}><Menu size={22} /></button>
              </div>
            </div>
            <div className="flex gap-4 px-[18px] -mt-10 relative z-[2]">
              <div className="rounded-full bg-white p-[3px] shadow-[0_2px_12px_rgba(40,30,25,.16)]">
                <Avatar size={88} ring={1} avatarUrl={persona.avatar} name={persona.name} />
              </div>
              <div className="flex-1 flex justify-around text-center pt-[50px]">
                {[['帖子', myPosts.length], ['粉丝', 0], ['关注', 0]].map(([a, b]) => (
                  <div key={a}><b className="text-[17px]">{b}</b><div className="text-[#999] text-[12px]">{a}</div></div>
                ))}
              </div>
            </div>
            <div className="px-[18px] pt-2.5">
              <div className="flex items-center gap-2">
                <b className="text-[16px]">{persona.name}</b>
                {persona.job && <span className="text-[11px] rounded-[10px] px-2 py-0.5" style={{ background: persona.themeSoft, color: '#6b5459' }}>{persona.job}</span>}
              </div>
              {persona.title && <div className="text-[#999] text-[12px] mt-0.5">{persona.title}</div>}
              {persona.bio && <div className="text-[13px] leading-[1.6] mt-1.5">{persona.bio}</div>}
              <button onClick={() => { setManualTitle(''); setManualArtist(''); setMusicTarget('me'); }} className="mt-2 flex items-center gap-2 w-full text-left">
                <span className="text-[15px]">🎵</span>
                {persona.currentTrack ? (
                  <span className="text-[13px] truncate"><span className="text-[#999]">正在听</span> <b>{persona.currentTrack.title}</b> <span className="text-[#999]">{persona.currentTrack.artist}</span></span>
                ) : (
                  <span className="text-[13px] text-[#999]">设置正在听的音乐</span>
                )}
              </button>
            </div>
            <div className="flex gap-2.5 px-[18px] py-3.5">
              <button onClick={() => { setEditingPersona({ name: persona.name, title: persona.title, job: persona.job, bio: persona.bio }); setEditThemeIdx(0); setView('edit'); }} className="flex-1 h-11 rounded-xl bg-[#f3f3f3] text-[13px] font-medium">编辑人设</button>
              <button onClick={() => setSheet('persona')} className="flex-1 h-11 rounded-xl text-[13px] font-medium" style={{ background: persona.themeSoft, color: '#6b5459' }}>切换身份</button>
            </div>
            <div className="flex border-t border-[#ececec] mt-1 h-[42px] items-center justify-center border-b-[1.5px] border-b-[#222]">
              <LayoutGrid size={22} />
            </div>
            <div className="grid grid-cols-3 gap-[2px]">
              {myPosts.map(p => (
                <button key={p.id} onClick={() => { setActivePostId(p.id); setPrevView('me'); setView('post'); }} className="aspect-square block w-full">
                  <PostMedia media={p.media} gradient={p.gradient} className="w-full h-full" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* 动态 */}
        {view === 'activity' && (
          <>
            {renderTop('活动')}
            <div className="text-[#999] px-[18px] pb-1.5 text-[12px] tracking-[1px]">谁赞了谁，谁在意谁。</div>
            {people.filter(p => follows.includes(p.id)).slice(0, 3).map((p, i) => (
              <button key={p.id} onClick={() => visiblePosts[i] && openComments(visiblePosts[i].id)} className="flex items-center gap-3 px-[18px] py-2.5 w-full text-left text-[13px]">
                <Avatar size={44} avatarUrl={p.avatar} name={p.name} />
                <div className="flex-1 leading-[1.5]">
                  <b>{p.name}</b> 赞了你的帖子 <span className="text-[#999]">{['2分钟', '12分钟', '1小时'][i]}</span>
                </div>
                <div className="flex-none w-11 h-11 rounded-lg overflow-hidden"><MeshImage g={i} className="w-full h-full" /></div>
              </button>
            ))}
          </>
        )}

        {/* 最近删除 */}
        {view === 'deleted' && (
          <>
            {renderTop('最近删除')}
            <div className="text-[#999] px-[18px] pb-2.5 text-[12px]">30 天内可以找回。</div>
            {deletedPosts.length ? deletedPosts.map(p => (
              <div key={p.id} className="flex items-start gap-3 border border-[#ececec] rounded-2xl mx-[18px] mb-3 p-3 w-auto">
                <div className="flex-none w-[84px] h-[84px] rounded-[10px] overflow-hidden">
                  <PostMedia media={p.media} gradient={p.gradient} className="w-full h-full" />
                </div>
                <div className="flex-1">
                  <b className="text-[13px]">{p.byName}</b> 的帖子
                  <div className="text-[#999] text-[11.5px]">{p.deletedInfo}</div>
                  <div className="flex gap-4 mt-1.5 text-[12px]">
                    <button onClick={() => { setPosts(prev => prev.map(x => x.id === p.id ? { ...x, deleted: false } : x)); showToast('已恢复'); }} className="text-[#b4838a]">恢复</button>
                    <button onClick={() => { setPosts(prev => prev.filter(x => x.id !== p.id)); showToast('已永久删除'); }} className="text-[#999]">永久删除</button>
                  </div>
                </div>
              </div>
            )) : <div className="text-[#999] text-center py-20 text-[13px]">这里空了</div>}
          </>
        )}

        {/* 发帖 */}
        {view === 'compose' && (
          <>
            {renderTop('新帖子', true, <button onClick={publishPost} className="text-[#b4838a] font-bold text-[14px]">发布</button>)}
            <div className="px-[18px] py-2">
              <div className="flex items-center gap-2.5 mb-3">
                <Avatar size={36} />
                <b className="text-[13.5px]">{persona.name}</b>
              </div>
              <textarea
                value={composeText}
                onChange={e => setComposeText(e.target.value)}
                placeholder="写点什么…"
                rows={3}
                className="w-full text-[14px] leading-[1.6] resize-none outline-none"
              />
              <div className="flex gap-2 my-3">
                {([['public', '公开'], ['friends', '好友'], ['private', '私密']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setComposeVisibility(v)}
                    className={`px-3.5 py-1.5 rounded-full text-[12px] ${composeVisibility === v ? 'bg-[#222] text-white' : 'bg-[#f3f3f3] text-[#666]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="text-[#999] text-[12px] my-2">选一张配图（或上传真实图片/视频）</div>
              <input
                ref={composeFileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleComposeFile}
              />
              <div className="grid grid-cols-6 gap-2">
                <button
                  onClick={() => composeFileRef.current?.click()}
                  disabled={composeMediaUploading}
                  className="aspect-square rounded-[10px] overflow-hidden flex items-center justify-center bg-[#f3f3f3] text-[#999] disabled:opacity-50"
                  style={{ outline: composeMedia ? '2px solid #b4838a' : 'none' }}
                >
                  {composeMediaUploading ? <span className="text-[11px]">上传中…</span> : <PlusSquare size={22} />}
                </button>
                {GRADIENTS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setComposeGradient(i); setComposeMedia(''); }}
                    className="aspect-square rounded-[10px] overflow-hidden block"
                    style={{ outline: !composeMedia && composeGradient === i ? '2px solid #b4838a' : 'none' }}
                  >
                    <MeshImage g={i} className="w-full h-full" />
                  </button>
                ))}
              </div>
              {composeMedia && (
                <div className="mt-2 relative rounded-[10px] overflow-hidden">
                  <PostMedia media={composeMedia} gradient={composeGradient} className="w-full aspect-square" />
                  <button
                    onClick={() => setComposeMedia('')}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                  ><X size={14} /></button>
                </div>
              )}
              <div
                onClick={() => { setManualTitle(''); setManualArtist(''); setMusicTarget('compose'); }}
                className="mt-3 flex items-center gap-2 w-full border border-[#ececec] rounded-xl px-3 py-2.5 cursor-pointer"
              >
                <span className="text-[15px]">🎵</span>
                {composeTrack ? (
                  <span className="flex-1 text-[13px] truncate"><b>{composeTrack.title}</b> <span className="text-[#999]">{composeTrack.artist}</span></span>
                ) : (
                  <span className="flex-1 text-[13px] text-[#999]">添加音乐</span>
                )}
                {composeTrack && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setComposeTrack(null); }}
                    className="text-[#999] px-1"
                  ><X size={16} /></span>
                )}
              </div>
            </div>
          </>
        )}

        {/* 搜索 */}
        {view === 'search' && (
          <>
            <div className="p-3.5">
              <div className="flex items-center h-[42px] bg-[#f3f3f3] rounded-[14px] px-3.5 text-[#999]">
                <Search size={18} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索"
                  className="flex-1 bg-transparent outline-none text-[13px] ml-2 text-[#222]"
                />
              </div>
            </div>
            {searchResults.map(p => {
              const isFollowing = follows.includes(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 px-[18px] py-2.5">
                  <Avatar size={48} ring={p.kind === 'NPC' ? 1 : 2} avatarUrl={p.avatar} name={p.name} />
                  <div className="flex-1 text-[13px]"><b>{p.name}</b><div className="text-[#999] text-[11.5px]">{p.kind === 'NPC' ? 'NPC' : '角色 · 亲密好友'}</div></div>
                  <button
                    onClick={() => {
                      setFollows(prev => isFollowing ? prev.filter(id => id !== p.id) : [...prev, p.id]);
                      showToast(isFollowing ? `已取关 ${p.name}` : `已关注 ${p.name}`);
                    }}
                    className={`px-4 py-1.5 rounded-full text-[12px] font-medium ${isFollowing ? 'bg-[#f3f3f3] text-[#666]' : 'bg-[#b4838a] text-white'}`}
                  >
                    {isFollowing ? '已关注' : '关注'}
                  </button>
                </div>
              );
            })}
            {searchQuery.trim() && searchResults.length === 0 && (
              <div className="text-[#999] text-center p-[50px] text-[13px]">没有找到</div>
            )}
            {!searchQuery.trim() && (
              <div className="text-[#999] text-center p-[50px] text-[13px]">搜索角色和 NPC</div>
            )}
          </>
        )}

        {/* 单帖 */}
        {view === 'post' && activePost && (
          <>{renderTop('帖子')}{renderPost(activePost, false)}</>
        )}

        {/* 私信列表 */}
        {view === 'dm' && (
          <>
            {renderTop('私信')}
            {people.map(p => {
              const last = (dms[p.id] || []).slice(-1)[0];
              return (
                <button key={p.id} onClick={() => { setDmTarget(p.id); setView('chat'); }} className="flex items-center gap-3 px-[18px] py-2.5 w-full text-left">
                  <Avatar size={52} avatarUrl={p.avatar} name={p.name} />
                  <div className="flex-1 text-[13px]">
                    <b>{p.name}</b>
                    <div className="text-[#999] text-[12px] truncate">{last ? (last.me ? '你：' : '') + last.text : '发消息给 TA'}</div>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {/* 私信聊天 */}
        {view === 'chat' && dmTarget && (
          <div className="flex flex-col min-h-full">
            {renderTop(resolveName(dmTarget), true, (
              <button onClick={() => { setManualTitle(''); setManualArtist(''); setMusicTarget(dmTarget); }} className="text-[16px]" title="设置 TA 正在听的音乐">🎵</button>
            ))}
            <div className="px-4 py-2.5 flex flex-col gap-2.5 flex-1">
              {(dms[dmTarget] || []).map((m, i) => (
                <div
                  key={i}
                  className="max-w-[75%] px-3.5 py-2.5 rounded-[18px] text-[13.5px] leading-[1.5]"
                  style={m.me
                    ? { alignSelf: 'flex-end', background: persona.theme, color: '#222' }
                    : { alignSelf: 'flex-start', background: '#f3f3f3' }}
                >
                  {m.text}
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[#ececec] px-3.5 py-2.5 flex gap-2 items-center">
              <input
                value={dmInput}
                onChange={e => setDmInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendDm()}
                placeholder="发消息…"
                className="flex-1 h-[42px] border border-[#ececec] rounded-full px-4 text-[13px] outline-none"
              />
              <button onClick={sendDm} className="text-[#b4838a] font-bold text-[13px] px-1.5">发送</button>
            </div>
          </div>
        )}

        {/* 编辑人设 */}
        {view === 'edit' && editingPersona && (
          <>
            {renderTop('编辑人设', true, <button onClick={() => {
              if (!editingPersona.name.trim()) { showToast('先给人设起个名字'); return; }
              const pid = persona.id;
              if (pid) {
                setLinePersonas((prev: any[]) => (Array.isArray(prev) ? prev : []).map((p: any) =>
                  String(p.id) === String(pid) ? { ...p, name: editingPersona.name.trim() } : p));
                setIgExtras((prev) => ({
                  ...prev,
                  [pid]: {
                    title: editingPersona.title, job: editingPersona.job, bio: editingPersona.bio,
                    theme: THEME_COLORS[editThemeIdx][0], themeSoft: THEME_COLORS[editThemeIdx][1],
                  },
                }));
              }
              setView('me');
              showToast('已保存（已同步到 LINE 人设）');
            }} className="text-[#b4838a] font-bold text-[14px]">保存</button>)}
            <div className="grid place-items-center py-2">
              <Avatar size={88} ring={1} />
            </div>
            {([['name', '名字', '人设名', false], ['title', '称号', '称号', false], ['job', '年龄 · 职业', '比如 24 · 记者', false], ['bio', '自我介绍', '人设的设定', true]] as const).map(([k, label, ph, rows]) => (
              <div key={k} className="px-[18px] py-2">
                <div className="text-[#999] text-[12px] mb-1">{label}</div>
                {rows ? (
                  <textarea value={editingPersona[k]} onChange={e => setEditingPersona({ ...editingPersona, [k]: e.target.value })} rows={3} placeholder={ph} className="w-full border border-[#ececec] rounded-xl p-2.5 text-[14px] resize-none outline-none" />
                ) : (
                  <input value={editingPersona[k]} onChange={e => setEditingPersona({ ...editingPersona, [k]: e.target.value })} placeholder={ph} className="w-full h-11 border border-[#ececec] rounded-xl px-3 text-[14px] outline-none" />
                )}
              </div>
            ))}
            <div className="px-[18px] py-2 pb-8">
              <div className="text-[#999] text-[12px] mb-2">主题色</div>
              <div className="flex gap-3">
                {THEME_COLORS.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setEditThemeIdx(i)}
                    className="w-10 h-10 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})`, outline: editThemeIdx === i ? '2px solid #b4838a' : '1px solid #ececec', outlineOffset: 2 }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* 快拍 */}
        {view === 'story' && (
          <div className="fixed inset-0 bg-black z-[25]">
            <MeshImage g={storyIndex % GRADIENTS.length} className="absolute inset-0" />
            <div className="absolute left-3 right-3 top-3.5 h-[3px] rounded bg-white/50 overflow-hidden z-[2]">
              <div className="h-full bg-white story-progress" />
            </div>
            <div className="absolute left-3.5 top-[30px] z-[2] flex items-center gap-2 text-[#222]">
              <Avatar size={34} avatarUrl={storyKey === 'me' ? (persona.avatar || undefined) : resolveAvatar(storyKey)} name={storyName} />
              <b className="text-[13px]">{storyName}</b>
            </div>
            <button onClick={() => setView('home')} className="absolute right-3.5 top-[30px] z-[3] text-[#222]"><X size={26} /></button>
            <button onClick={() => storyIndex > 0 && setStoryIndex(storyIndex - 1)} className="absolute left-0 top-20 bottom-20 w-[35%]" />
            <button onClick={() => {
              setSeenStories(prev => ({ ...prev, [storyKey]: true }));
              if (storyIndex < storyKeys.length - 1) setStoryIndex(storyIndex + 1);
              else setView('home');
            }} className="absolute right-0 top-20 bottom-20 w-[65%]" />
            {storyKey === 'me' && (
              <button onClick={() => setSheet('viewers')} className="absolute left-0 right-0 bottom-6 mx-auto h-[42px] px-5 rounded-full bg-white/75 text-[#222] text-[13px] z-[3] w-[140px]">
                观看者 3
              </button>
            )}
            <style>{`.story-progress{animation:sp 4s linear forwards}@keyframes sp{from{width:0}to{width:100%}}`}</style>
          </div>
        )}
      </div>

      {/* 底部导航 */}
      {['home', 'search', 'me', 'activity', 'deleted'].includes(view) && (
        <nav className="flex justify-around items-center h-[60px] border-t border-[#ececec] flex-none text-[#999]">
          {tabs.map(t => (
            <button key={t.id} onClick={() => go(t.id)} className={view === t.id || (view === 'activity' && t.id === 'me') ? 'text-[#222]' : ''} style={t.id === 'me' && view !== 'me' ? { opacity: 0.55 } : undefined}>
              {view === t.id ? t.activeIcon : t.icon}
            </button>
          ))}
          <button onClick={() => showToast('视频暂未开放')} className="text-[#999]"><Film size={26} /></button>
        </nav>
      )}

      {/* 底部弹窗 */}
      {(sheet || musicTarget) && (
        <div className="absolute inset-0 z-20 bg-[rgba(30,24,20,.4)] flex items-end" onClick={() => { setSheet(null); setMusicTarget(null); }}>
          <div className="w-full bg-white rounded-t-[22px] pt-3 pb-7 max-h-[80%] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <i className="block w-9 h-1 rounded bg-[#ececec] mx-auto mb-3" />
            {musicTarget && (
              <>
                <div className="px-[18px] pb-1.5">
                  <b className="text-[16px]">🎵 {musicTarget === 'compose' ? '给帖子添加音乐' : '正在听的音乐'}</b>
                  {typeof musicTarget === 'string' && musicTarget !== 'me' && musicTarget !== 'compose' && (
                    <div className="text-[#999] text-[12px] mt-0.5">为 {resolveName(musicTarget)} 设置</div>
                  )}
                </div>
                {(() => {
                  const cur = musicTarget === 'compose' ? composeTrack : musicTarget === 'me' ? (persona.currentTrack || null) : getAuthorTrack(musicTarget);
                  return cur ? (
                    <div className="mx-[18px] mb-2 flex items-center gap-2 bg-[#fdeef0] rounded-xl px-3 py-2.5">
                      <span className="text-[15px]">🎵</span>
                      <div className="flex-1 text-[13px] truncate"><b>{cur.title}</b><div className="text-[#999] text-[11.5px] truncate">{cur.artist}</div></div>
                      <button onClick={clearMusicChoice} className="text-[#999] text-[12px] px-1">清除</button>
                    </div>
                  ) : null;
                })()}
                {likedTracks.length > 0 && (
                  <>
                    <div className="px-[18px] pt-1 pb-1 text-[#999] text-[12px]">从我的音乐里选</div>
                    <div className="max-h-[220px] overflow-y-auto">
                      {likedTracks.slice(0, 30).map(t => (
                        <button key={t.id} onClick={() => applyMusicChoice({ title: t.name, artist: t.artist || '未知歌手' })} className="flex items-center gap-3 px-[18px] py-2 w-full text-left">
                          <span className="text-[15px]">🎵</span>
                          <div className="flex-1 text-[13px] truncate"><b>{t.name}</b><div className="text-[#999] text-[11.5px] truncate">{t.artist}</div></div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="px-[18px] pt-2">
                  <div className="text-[#999] text-[12px] mb-1.5">手动输入</div>
                  <input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="歌名" className="w-full h-11 border border-[#ececec] rounded-xl px-3 text-[14px] outline-none mb-2" />
                  <input value={manualArtist} onChange={e => setManualArtist(e.target.value)} placeholder="歌手" className="w-full h-11 border border-[#ececec] rounded-xl px-3 text-[14px] outline-none mb-2" />
                  <button onClick={() => {
                    const title = manualTitle.trim();
                    if (!title) { showToast('先写歌名'); return; }
                    applyMusicChoice({ title, artist: manualArtist.trim() || '未知歌手' });
                  }} className="w-full h-11 rounded-xl bg-[#222] text-white text-[13px] font-medium mb-1">确定</button>
                </div>
              </>
            )}
            {sheet === 'persona' && (
              <>
                <div className="px-[18px] pb-1.5"><b className="text-[16px]">我的人设</b><div className="text-[#999] text-[12px] mt-0.5">与 LINE 人设联通，切换会同步到 LINE</div></div>
                {personas.length === 0 && (
                  <div className="px-[18px] py-4 text-[13px] text-[#999]">还没有人设，先新建一个吧</div>
                )}
                {personas.map((p, i) => (
                  <button key={p.id} onClick={() => { setLineActivePersonaId(p.id); setSheet(null); showToast('已切换为 ' + p.name); }} className="flex items-center gap-3 px-[18px] py-2.5 w-full text-left">
                    <Avatar size={56} ring={1} avatarUrl={p.avatar} name={p.name} />
                    <div className="flex-1 text-[13px]"><b>{p.name} · {i ? '小号' : '主号'}</b><div className="text-[#999] text-[11.5px]">{p.job}</div></div>
                    {activePersonaId === p.id && <span className="text-[#b4838a]"><Check size={22} /></span>}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const name = window.prompt('新人设名字：', '');
                    if (name && name.trim()) { createIgPersona(name.trim()); setSheet(null); }
                  }}
                  className="mx-[18px] mt-2 mb-1 w-[calc(100%-36px)] h-11 rounded-xl bg-[#f3f3f3] text-[13px] font-medium"
                >＋ 新建人设</button>
              </>
            )}
            {sheet === 'menu' && (
              <>
                {[['活动', 'activity'], ['最近删除', 'deleted'], ['切换人设', 'persona']].map(([t, k]) => (
                  <button key={k} onClick={() => { if (k === 'persona') setSheet('persona'); else { go(k as View); } }} className="px-[18px] w-full text-left text-[14px] h-[50px]">{t}</button>
                ))}
              </>
            )}
            {sheet === 'viewers' && (
              <>
                <div className="flex justify-between px-[18px] pb-1.5"><b className="text-[15px]">观看者 3</b><span className="text-[#999] text-[12px]">23 小时后消失</span></div>
                {people.filter(p => follows.includes(p.id)).slice(0, 3).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 px-[18px] py-2.5">
                    <Avatar size={44} avatarUrl={p.avatar} name={p.name} />
                    <div className="flex-1 text-[13px]"><b>{p.name}</b><div className="text-[11.5px] text-[#999]">{['看了 2 次', '23:41', '20:15'][i]}</div></div>
                  </div>
                ))}
              </>
            )}
            {!!sheet && typeof sheet === 'object' && sheet.pm && (() => {
              const p = posts.find(x => x.id === sheet.pm);
              if (!p) return null;
              const own = p.by === 'me';
              return (
                <>
                  {own ? (
                    <button onClick={() => deletePost(p.id)} className="px-[18px] w-full text-left h-[50px] text-[#d4455a] text-[14px] flex items-center gap-2"><Trash2 size={18} />删除</button>
                  ) : (
                    <>
                      <button onClick={() => { setSheet(null); showToast('已减少此类推荐'); }} className="px-[18px] w-full text-left h-[50px] text-[14px]">不感兴趣</button>
                      <button onClick={() => { setSheet(null); showToast('已举报'); }} className="px-[18px] w-full text-left h-[50px] text-[#d4455a] text-[14px]">举报</button>
                    </>
                  )}
                  <button onClick={() => setSheet(null)} className="px-[18px] w-full text-left h-[50px] text-[14px]">取消</button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute left-1/2 top-[60px] -translate-x-1/2 bg-[#222] text-white px-4 py-2 rounded-full text-[13px] z-40 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* 返回手机主页 */}
      <button onClick={() => onNavigate('home' as ScreenType)} className="absolute top-2 right-2 z-30 text-[#999] opacity-0">
        <X size={16} />
      </button>
    </div>
  );
}
