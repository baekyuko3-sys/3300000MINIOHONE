import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentState, useSyncedPersistentState } from '../../store/usePersistentState';
import { readAndCompressImage, readFileAsDataUrl } from '../../store/imageCompress';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import { getNpcs } from '../../store/npcs';
import { getMedia, putMedia } from '../../store/mediaVault';
import type { ImportedCharacter } from '../../data/characterImport';
import { ScreenType } from '../../types';
import {
  Heart, MessageCircle, Repeat2, Search, Bell, User, Home,
  Plus, ChevronLeft, MoreHorizontal, Check, X, AtSign, Hash, Image as ImageIcon,
} from 'lucide-react';

interface ThreadsScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
}

/* ---------- 数据类型 ---------- */
interface ThreadReply {
  by: string;
  t: string;
}
interface ThreadComment {
  by: string;
  t: string;
  l: number;
  liked?: boolean;
  rep: ThreadReply[];
}
interface ThreadPost {
  id: number;
  by: string; // 'me' | `char:${id}` | `npc:${id}`
  tx: string;
  im: number[];
  mediaList?: string[]; // 'media:xxx' 真实图片/视频引用
  l: number;
  liked?: boolean;
  rp: number;
  rd: string;
  time: string;
  rt?: number;
  del?: boolean;
  cm: ThreadComment[];
}
interface HotTopic {
  t: string;
  n: string;
  g?: string;
}

type View = 'home' | 'topic' | 'search' | 'cm' | 'compose' | 'msg' | 'me';
type HomeTab = 'fol' | 'rec' | 'hot';
type MsgTab = 'at' | 'cm' | 'lk';
type MeTab = 'p' | 'r';

const MESH_COLORS: [string, string, string][] = [
  ['#9dbcae', '#dcb3ae', '#eee8df'],
  ['#9fb8d4', '#e3bfd6', '#efe7e1'],
  ['#f0c48f', '#cfb0d4', '#f6eddf'],
  ['#e8b7b0', '#a9c2ae', '#f4e9dc'],
  ['#a6d8bb', '#f7d3b8', '#f6f0e6'],
  ['#cdb5da', '#a6cdd0', '#f3ecea'],
];

const HOT_TOPICS: HotTopic[] = [
  { t: '今日穿搭', n: '128.4万', g: '热' },
  { t: '深夜食堂', n: '96.2万', g: '新' },
  { t: '城市漫步', n: '71.5万' },
  { t: '咖啡日常', n: '43.0万' },
  { t: '周末计划', n: '20.8万', g: '热' },
  { t: '新歌推荐', n: '9.6万' },
];

const ROSE = '#b4838a';

function ThreadMedia({ media, className = '' }: { media: string; className?: string }) {
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
  if (!resolved) return <div className={className + ' bg-neutral-100 animate-pulse'} />;
  return isVideo
    ? <video src={resolved} className={className} controls playsInline preload="metadata" />
    : <img src={resolved} className={className + ' object-cover'} alt="" />;
}

function MeshImage({ g, className = '', style = {} as React.CSSProperties }: { g: number; className?: string; style?: React.CSSProperties }) {
  const [a, b, c] = MESH_COLORS[g % MESH_COLORS.length];
  return (
    <div
      className={className}
      style={{
        background: `radial-gradient(at 18% 12%, ${a} 0, transparent 58%), radial-gradient(at 88% 28%, ${b} 0, transparent 55%), ${c}`,
        ...style,
      }}
    />
  );
}

function Avatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover flex-none border border-neutral-200" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center flex-none text-neutral-400"
    >
      <User style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  );
}

/** 解析 #话题# 和 @提及 */
function renderRichText(text: string, onTopic: (t: string) => void) {
  const parts = text.split(/(#[^#\s]+#)/g);
  return parts.map((part, i) => {
    const m = part.match(/^#([^#\s]+)#$/);
    if (m) {
      return (
        <button key={i} onClick={(e) => { e.stopPropagation(); onTopic(m[1]); }} style={{ color: ROSE }} className="inline">
          #{m[1]}#
        </button>
      );
    }
    // @提及高亮
    const atParts = part.split(/(@[^\s@：:]+)/g);
    return atParts.map((ap, j) =>
      /^@[^\s@：:]+$/.test(ap)
        ? <span key={`${i}-${j}`} style={{ color: ROSE }}>{ap}</span>
        : <span key={`${i}-${j}`}>{ap}</span>
    );
  });
}

export function ThreadsScreenView({ onNavigate }: ThreadsScreenViewProps) {
  const [posts, setPosts] = usePersistentState<ThreadPost[]>('phone:threads-v2', []);
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  // "我" 联通 LINE 人设：名字/头像从 line:user-personas 来，ID/简介存 Threads sidecar
  const [linePersonas, setLinePersonas] = useSyncedPersistentState<any[]>('line:user-personas', []);
  const [lineActivePersonaId] = useSyncedPersistentState<string | null>('line:active-persona', null);
  const [threadsExtras, setThreadsExtras] = usePersistentState<Record<string, { handle: string; desc: string }>>('phone:threads-profile-extras', {});
  const activePersona = (Array.isArray(linePersonas) ? linePersonas : []).find((p: any) => p.id === lineActivePersonaId) || linePersonas[0] || null;
  const myExtras = (activePersona && threadsExtras[activePersona.id]) || { handle: '', desc: '' };

  // 一次性迁移旧 line:current-user
  useEffect(() => {
    try {
      if (localStorage.getItem('phone:threads-profile-migrated-v1')) return;
      const raw = localStorage.getItem('line:current-user');
      if (raw) {
        const old = JSON.parse(raw);
        if (old && (old.name || old.id || old.desc)) {
          const rawLines = localStorage.getItem('line:user-personas');
          let lines: any[] = [];
          try { const parsed = rawLines ? JSON.parse(rawLines) : []; if (Array.isArray(parsed)) lines = parsed; } catch { /* ignore */ }
          let target = lines.find((p: any) => p && old.name && p.name === old.name) || lines[0] || null;
          if (!target) {
            target = { id: `p_${Date.now()}`, name: old.name || '我', avatar: '', boundCharacterIds: [] };
            lines = [target];
            localStorage.setItem('line:user-personas', JSON.stringify(lines));
          }
          let sidecar: Record<string, { handle: string; desc: string }> = {};
          try { const parsed = JSON.parse(localStorage.getItem('phone:threads-profile-extras') || '{}'); if (parsed && typeof parsed === 'object') sidecar = parsed; } catch { /* ignore */ }
          sidecar[target.id] = { handle: old.id || '', desc: old.desc || '' };
          localStorage.setItem('phone:threads-profile-extras', JSON.stringify(sidecar));
          if (!localStorage.getItem('line:active-persona')) {
            localStorage.setItem('line:active-persona', JSON.stringify(target.id));
          }
          setLinePersonas(lines);
          setThreadsExtras(sidecar);
        }
      }
      localStorage.setItem('phone:threads-profile-migrated-v1', '1');
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentUser = {
    name: activePersona?.name || '我',
    avatar: activePersona?.avatar || '',
    id: myExtras.handle || '',
    desc: myExtras.desc || '',
    personaId: activePersona?.id || '',
  };
  const [follows, setFollows] = usePersistentState<Record<string, boolean>>('phone:threads-follows', {});
  const [topicFollows, setTopicFollows] = usePersistentState<Record<string, boolean>>('phone:threads-topic-follows', {});

  const [view, setView] = useState<View>('home');
  const [prevView, setPrevView] = useState<View>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>('rec');
  const [msgTab, setMsgTab] = useState<MsgTab>('at');
  const [meTab, setMeTab] = useState<MeTab>('p');
  const [currentPostId, setCurrentPostId] = useState<number>(0);
  const [currentTopic, setCurrentTopic] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [commentSort, setCommentSort] = useState<'hot' | 'time'>('hot');
  const [composeText, setComposeText] = useState('');
  const [composeImages, setComposeImages] = useState<number[]>([]);
  const [composeMedia, setComposeMedia] = useState<string[]>([]);
  const [composeMediaUploading, setComposeMediaUploading] = useState(false);
  const composeFileRef = useRef<HTMLInputElement>(null);
  const [composeRt, setComposeRt] = useState<number>(0);
  const [composeAs, setComposeAs] = useState<string>('me');
  const [sheet, setSheet] = useState<null | { kind: 'repost'; id: number } | { kind: 'postmenu'; id: number } | { kind: 'mention' } | { kind: 'edit' }>(null);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [toast, setToast] = useState('');

  const npcs = useMemo(() => { try { return getNpcs(); } catch { return []; } }, []);

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 2200);
  };

  const go = (v: View) => {
    if (['cm', 'topic', 'compose'].includes(view)) { /* keep prev */ } else {
      setPrevView(view);
    }
    setView(v);
    setSheet(null);
  };

  const goBack = () => {
    if (['cm', 'topic'].includes(view)) setView(prevView);
    else if (view === 'compose') setView(prevView);
    else setView('home');
    setSheet(null);
  };

  /** 解析作者 */
  const resolveAuthor = (by: string): { name: string; handle: string; avatar?: string; verified?: boolean } => {
    if (by === 'me') {
      return {
        name: currentUser.name.trim() || '我',
        handle: currentUser.id.trim() ? '@' + currentUser.id.replace(/^@/, '') : '@me',
        avatar: currentUser.avatar || undefined,
      };
    }
    if (by.startsWith('char:')) {
      const ch = (characters || []).find(c => String(c.id) === by.slice(5));
      if (ch) return { name: ch.name || '未命名', handle: '@' + (ch.name || 'char'), avatar: ch.avatar, verified: true };
    }
    if (by.startsWith('npc:')) {
      const n = npcs.find(x => String(x.id) === by.slice(4));
      if (n) return { name: n.name || '未命名', handle: '@' + (n.name || 'npc'), avatar: n.avatar };
    }
    return { name: '未知', handle: '@unknown' };
  };

  const allAuthors = useMemo(() => {
    const list: { key: string; name: string; avatar?: string; kind: string }[] = [
      { key: 'me', name: currentUser.name.trim() || '我', avatar: currentUser.avatar || undefined, kind: '我' },
    ];
    (characters || []).forEach(c => list.push({ key: `char:${c.id}`, name: c.name || '未命名', avatar: c.avatar, kind: '角色' }));
    npcs.forEach(n => list.push({ key: `npc:${n.id}`, name: n.name || '未命名', avatar: n.avatar, kind: 'NPC' }));
    return list;
  }, [characters, npcs, currentUser.name]);

  const findPost = (id: number) => posts.find(p => p.id === id);

  const toggleLike = (id: number) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, liked: !p.liked, l: p.liked ? Math.max(0, p.l - 1) : p.l + 1 } : p));
  };

  const toggleFollow = (key: string) => {
    const name = resolveAuthor(key).name;
    setFollows(prev => ({ ...prev, [key]: !prev[key] }));
    if (!follows[key]) showToast('已关注 ' + name);
  };

  const openPost = (id: number) => {
    setCurrentPostId(id);
    setCommentInput('');
    if (view !== 'cm') setPrevView(view);
    setView('cm');
  };

  const openTopic = (t: string) => {
    setCurrentTopic(t);
    if (view !== 'topic') setPrevView(view);
    setView('topic');
  };

  const handleComposeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (e.target) e.target.value = '';
    if (!files?.length) return;
    const remain = 3 - composeMedia.length;
    if (remain <= 0) { showToast('最多 3 张'); return; }
    setComposeMediaUploading(true);
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, remain)) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
        if (file.size > 50 * 1024 * 1024) { showToast('单个文件太大（>50MB）'); continue; }
        // 图片自动压缩，视频保持原样
        const dataUrl = file.type.startsWith('image/')
          ? await readAndCompressImage(file, 1024)
          : await readFileAsDataUrl(file);
        const id = await putMedia(dataUrl);
        added.push('media:' + id);
      }
      if (added.length) setComposeMedia(prev => [...prev, ...added].slice(0, 3));
    } catch { showToast('上传失败'); }
    finally { setComposeMediaUploading(false); }
  };
  const handlePublish = () => {
    const t = composeText.trim();
    if (!t && composeImages.length === 0 && composeMedia.length === 0 && !composeRt) { showToast('先写点什么'); return; }
    if (composeRt) {
      setPosts(prev => prev.map(p => p.id === composeRt ? { ...p, rp: p.rp + 1 } : p));
    }
    const newPost: ThreadPost = {
      id: Date.now(),
      by: composeAs,
      tx: t || (composeRt ? '转发' : ''),
      im: composeImages.slice(),
      ...(composeMedia.length ? { mediaList: composeMedia.slice() } : {}),
      l: 0, rp: 0, rd: '0', time: '刚刚',
      rt: composeRt || undefined,
      cm: [],
    };
    setPosts(prev => [newPost, ...prev]);
    setComposeText(''); setComposeImages([]); setComposeMedia([]); setComposeRt(0); setComposeAs('me');
    setHomeTab('rec');
    setView(prevView === 'topic' ? 'topic' : 'home');
    showToast('已发布');
  };

  const handleComment = () => {
    const v = commentInput.trim();
    if (!v) { showToast('先写点什么'); return; }
    setPosts(prev => prev.map(p => p.id === currentPostId ? { ...p, cm: [...p.cm, { by: 'me', t: v, l: 0, rep: [] }] } : p));
    setCommentInput('');
  };

  const inviteNpcComment = () => {
    const id = currentPostId;
    const post = posts.find(p => p.id === id);
    if (!post) return;
    showToast('路人正在输入…');
    void (async () => {
      let text = '路过帮顶！';
      try {
        const settings = readStoredAiSettings();
        if (settings.apiKey?.trim()) {
          const gen = await generateCreativeText({
            settings,
            systemPrompt: '你是一个在 Circle（类 Threads 社交 App）上闲逛的路人，刷到一条帖子。用路人的口吻写一条简短随意的评论（1句话，20字以内），可以幽默、捧场或吐槽，像真人随手评论。不要输出多余解释。',
            userPrompt: `帖子作者：${resolveAuthor(post.by).name}
帖子内容：${post.tx}

请写评论：`,
          });
          if (gen.trim()) text = gen.trim();
        }
      } catch { /* 失败就用默认 */ }
      setPosts(prev => prev.map(p => p.id === id ? { ...p, cm: [...p.cm, { by: 'npc:passerby', t: text, l: 0, rep: [] }] } : p));
    })();
  };

  /* ---------- 帖子卡片 ---------- */
  const PostCard = ({ p, full = false }: { p: ThreadPost; full?: boolean }) => {
    const author = resolveAuthor(p.by);
    const quoted = p.rt ? findPost(p.rt) : undefined;
    const preview = !full && p.cm.length > 0 ? p.cm[0] : null;
    const canFollow = p.by !== 'me' && !follows[p.by];
    return (
      <article
        className={`grid gap-2.5 px-4 pt-3.5 border-b border-neutral-100 ${full ? '' : 'cursor-pointer'}`}
        style={{ gridTemplateColumns: '42px 1fr' }}
        onClick={full ? undefined : () => openPost(p.id)}
      >
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar src={author.avatar} name={author.name} size={40} />
            {canFollow && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleFollow(p.by); }}
                className="absolute -right-1 -bottom-1 w-[17px] h-[17px] rounded-full text-white border-2 border-white text-[13px] leading-none grid place-items-center"
                style={{ background: ROSE }}
              >+</button>
            )}
          </div>
          {preview && <div className="flex-1 w-[2px] bg-neutral-100 rounded my-1.5" />}
        </div>
        <div className="min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1">
                <b className="text-[14.5px]">{author.name}</b>
                {author.verified && (
                  <span className="inline-grid place-items-center w-[15px] h-[15px] rounded-full text-white" style={{ background: ROSE }}>
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <div className="text-neutral-400 text-xs mt-0.5">{full ? `${author.handle} · ` : ''}{p.time} · 来自 小手机</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSheet({ kind: 'postmenu', id: p.id }); }}
              className="text-neutral-400 p-1"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="text-[14.5px] leading-[1.65] mt-1.5 break-words">{renderRichText(p.tx, openTopic)}</div>
          {quoted && (
            <div
              className="bg-neutral-100 rounded-xl p-2.5 mt-2 text-[13.5px] leading-relaxed cursor-pointer"
              onClick={(e) => { e.stopPropagation(); openPost(quoted.id); }}
            >
              <span style={{ color: ROSE }}>@{resolveAuthor(quoted.by).name}</span>：{renderRichText(quoted.tx, openTopic)}
              {((quoted.mediaList?.length || 0) > 0 || quoted.im.length > 0) && (
                <div className="flex gap-1 mt-1.5">
                  {(quoted.mediaList || []).slice(0, 3).map((m, idx) => <ThreadMedia key={'m' + idx} media={m} className="w-11 h-11 rounded-md" />)}
                  {quoted.im.slice(0, Math.max(0, 3 - (quoted.mediaList?.length || 0))).map(g => <MeshImage key={'g' + g} g={g} className="w-11 h-11 rounded-md" />)}
                </div>
              )}
            </div>
          )}
          {((p.mediaList?.length || 0) > 0 || p.im.length > 0) && (
            <div
              className="grid gap-1 mt-2"
              style={(() => {
                const n = (p.mediaList?.length || 0) + p.im.length;
                return {
                  gridTemplateColumns: `repeat(${n === 1 ? 1 : n === 2 || n === 4 ? 2 : 3}, 1fr)`,
                  width: n === 1 ? '52%' : n === 2 || n === 4 ? '68%' : '100%',
                };
              })()}
            >
              {(p.mediaList || []).map((m, idx) => <ThreadMedia key={'m' + idx} media={m} className="rounded-lg aspect-square" />)}
              {p.im.map(g => <MeshImage key={'g' + g} g={g} className="rounded-lg aspect-square" />)}
            </div>
          )}
          <div className="text-neutral-400 text-xs mt-2">阅读 {p.rd}</div>
          <div className="grid grid-cols-3 -ml-2 mt-1.5">
            {[
              { icon: <Repeat2 className="w-[19px] h-[19px]" />, label: p.rp || '转发', onClick: () => setSheet({ kind: 'repost', id: p.id }) },
              { icon: <MessageCircle className="w-[19px] h-[19px]" />, label: p.cm.length || '评论', onClick: () => openPost(p.id) },
              {
                icon: <Heart className="w-[19px] h-[19px]" fill={p.liked ? 'currentColor' : 'none'} />,
                label: (p.l + (p.liked ? 1 : 0)) || '赞',
                onClick: () => toggleLike(p.id),
                active: p.liked,
              },
            ].map((a, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); a.onClick(); }}
                className="flex items-center gap-1.5 h-10 px-2 text-[13px] text-neutral-400 justify-self-start"
                style={a.active ? { color: '#e0556b' } : undefined}
              >
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        </div>
        {preview && (
          <div className="col-span-2 grid gap-2.5 px-4 pb-2.5 -mt-1 border-b border-neutral-100" style={{ gridTemplateColumns: '42px 1fr' }}>
            <div className="flex justify-center pt-0.5"><Avatar name={resolveAuthor(preview.by).name} size={22} /></div>
            <div className="text-[13px] leading-relaxed pt-px">
              <b>{resolveAuthor(preview.by).name}</b>{' '}
              <span className="text-neutral-500">{preview.t}</span>
              <div className="text-neutral-400 text-xs mt-1">共 {p.cm.length} 条回复 · {preview.l} 赞</div>
            </div>
          </div>
        )}
      </article>
    );
  };

  /* ---------- 各视图 ---------- */
  const HomeView = () => {
    const visible = posts.filter(p => !p.del && (homeTab === 'rec' || p.by === 'me' || follows[p.by]));
    return (
      <div>
        <div className="flex justify-center gap-[26px] pt-3.5 border-b border-neutral-100">
          {([['fol', '关注'], ['rec', '推荐'], ['hot', '热搜']] as [HomeTab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setHomeTab(k)}
              className={`pb-2.5 text-[15px] border-b-2 ${homeTab === k ? 'font-bold border-transparent' : 'text-neutral-400 border-transparent'}`}
              style={homeTab === k ? { borderColor: ROSE } : undefined}
            >{label}</button>
          ))}
        </div>
        {homeTab === 'hot' ? (
          <div>
            <div className="flex justify-between items-center px-[18px] pt-3.5 pb-1.5">
              <b className="text-base">热搜榜</b>
              <span className="text-neutral-400 text-xs">实时更新</span>
            </div>
            {HOT_TOPICS.map((h, i) => (
              <button key={h.t} onClick={() => openTopic(h.t)} className="flex items-center gap-3 w-full px-[18px] py-[11px] text-left">
                <span className="w-5 font-bold" style={{ color: i < 3 ? ROSE : '#999' }}>{i + 1}</span>
                <div className="flex-1 text-[14.5px]">{h.t}<div className="text-neutral-400 text-xs">{h.n} 讨论</div></div>
                {h.g && (
                  <span className="text-[10px] text-white rounded px-[5px] py-px" style={{ background: h.g === '热' ? ROSE : '#8aa898' }}>{h.g}</span>
                )}
              </button>
            ))}
          </div>
        ) : visible.length ? (
          visible.map(p => <PostCard key={p.id} p={p} />)
        ) : (
          <div className="text-neutral-400 text-center py-[70px] text-[13px]">这里还没有内容</div>
        )}
      </div>
    );
  };

  const TopicView = () => {
    const h = HOT_TOPICS.find(x => x.t === currentTopic);
    const list = posts.filter(p => !p.del && p.tx.includes('#' + currentTopic + '#'));
    const followed = !!topicFollows[currentTopic];
    return (
      <div>
        <div className="flex justify-between items-center px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <button onClick={goBack} className="text-neutral-800"><ChevronLeft className="w-[26px] h-[26px]" /></button>
            <b className="text-[17px]">#{currentTopic}#</b>
          </div>
        </div>
        <div className="flex justify-between items-center px-[18px] pb-3.5 border-b border-neutral-100">
          <div className="text-neutral-400 text-xs">{h ? h.n : '0'} 讨论 · {list.length} 条帖子</div>
          <button
            onClick={() => {
              setTopicFollows(prev => ({ ...prev, [currentTopic]: !prev[currentTopic] }));
              showToast(followed ? '已取消关注' : '已关注话题');
            }}
            className="h-8 px-4 rounded-full text-[13px]"
            style={followed ? { background: '#f5f5f5', color: '#999' } : { background: ROSE, color: '#fff' }}
          >{followed ? '已关注' : '关注话题'}</button>
        </div>
        {list.length ? list.map(p => <PostCard key={p.id} p={p} />) : (
          <div className="text-neutral-400 text-center py-[70px] text-[13px]">还没有相关帖子</div>
        )}
        <div className="p-4">
          <button
            onClick={() => { setComposeText('#' + currentTopic + '# '); setComposeImages([]); setComposeRt(0); setPrevView('topic'); setView('compose'); }}
            className="w-full h-11 rounded-full text-[13px]"
            style={{ border: `1px solid ${ROSE}`, color: ROSE }}
          >参与 #{currentTopic}# 讨论</button>
        </div>
      </div>
    );
  };

  const SearchView = () => {
    const list = searchQ ? posts.filter(p => !p.del && p.tx.includes(searchQ)) : [];
    return (
      <div>
        <div className="p-3.5 px-4">
          <div className="flex items-center gap-2 h-[42px] bg-neutral-100 rounded-[14px] px-3.5 text-neutral-400">
            <Search className="w-[18px] h-[18px]" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜索帖子和话题"
              className="flex-1 bg-transparent outline-none text-sm text-neutral-800"
            />
          </div>
        </div>
        {searchQ ? (
          list.length ? list.map(p => <PostCard key={p.id} p={p} />) : (
            <div className="text-neutral-400 text-center py-[70px] text-[13px]">没有找到相关内容</div>
          )
        ) : (
          <div>
            <div className="text-neutral-400 text-xs px-[18px] pb-2 tracking-widest">大家都在搜</div>
            <div className="flex flex-wrap gap-2 px-[18px]">
              {HOT_TOPICS.map(h => (
                <button key={h.t} onClick={() => openTopic(h.t)} className="h-[34px] px-3.5 rounded-full bg-neutral-100 text-[13px]">{h.t}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const CommentView = () => {
    const p = findPost(currentPostId);
    if (!p) return <div className="text-neutral-400 text-center py-20 text-[13px]">帖子不存在</div>;
    const comments = [...p.cm].sort((a, b) => commentSort === 'hot' ? b.l - a.l : 0);
    return (
      <div className="flex flex-col min-h-full">
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          <button onClick={goBack} className="text-neutral-800"><ChevronLeft className="w-[26px] h-[26px]" /></button>
          <b className="text-[17px]">帖子</b>
        </div>
        <PostCard p={p} full />
        <div className="flex justify-between items-center px-[18px] py-2 border-y border-neutral-100">
          <span className="text-xs">转发 {p.rp} &nbsp; <b>评论 {p.cm.length}</b> &nbsp; 赞 {p.l + (p.liked ? 1 : 0)}</span>
          <button onClick={() => setCommentSort(s => s === 'hot' ? 'time' : 'hot')} className="text-xs" style={{ color: ROSE }}>
            按{commentSort === 'hot' ? '热度' : '时间'} ⇅
          </button>
        </div>
        {comments.length ? comments.map((c, ci) => (
          <div key={ci} className="grid gap-2.5 px-4 py-2.5 border-b border-neutral-100" style={{ gridTemplateColumns: '34px 1fr' }}>
            <Avatar src={resolveAuthor(c.by).avatar} name={resolveAuthor(c.by).name} size={34} />
            <div className="min-w-0 text-[13.5px] leading-relaxed">
              <b>{resolveAuthor(c.by).name}</b>
              <div className="mt-0.5">{renderRichText(c.t, openTopic)}</div>
              {c.rep.map((r, ri) => (
                <div key={ri} className="flex gap-2 mt-2 items-start">
                  <Avatar src={resolveAuthor(r.by).avatar} name={resolveAuthor(r.by).name} size={22} />
                  <div><b>{resolveAuthor(r.by).name}</b> {renderRichText(r.t, openTopic)}</div>
                </div>
              ))}
              <div className="flex gap-[18px] mt-1.5 text-neutral-400 text-xs">
                <button
                  onClick={() => setPosts(prev => prev.map(pp => pp.id === p.id ? {
                    ...pp, cm: pp.cm.map((cc, j) => j === p.cm.indexOf(c) ? { ...cc, liked: !cc.liked, l: cc.liked ? Math.max(0, cc.l - 1) : cc.l + 1 } : cc),
                  } : pp))}
                  className="flex items-center gap-1"
                  style={c.liked ? { color: '#e0556b' } : undefined}
                >
                  <Heart className="w-[15px] h-[15px]" fill={c.liked ? 'currentColor' : 'none'} />{c.l + (c.liked ? 1 : 0)}
                </button>
                <button onClick={() => { setCommentInput(`回复 ${resolveAuthor(c.by).name}：`); }}>回复</button>
              </div>
            </div>
          </div>
        )) : (
          <div className="text-neutral-400 text-center py-10 text-[13px]">还没有评论，来抢沙发</div>
        )}
        <div className="sticky bottom-0 bg-white border-t border-neutral-100 p-2.5 px-3.5 flex gap-2 items-center mt-auto">
          <Avatar src={currentUser.avatar || undefined} name={currentUser.name || '我'} size={36} />
          <input
            value={commentInput}
            onChange={e => setCommentInput(e.target.value)}
            placeholder="发表评论…"
            className="flex-1 h-[42px] border border-neutral-200 rounded-full px-4 text-[13px] outline-none"
          />
          <button onClick={handleComment} className="font-bold text-[13px]" style={{ color: ROSE }}>发布</button>
          <button
            onClick={inviteNpcComment}
            className="h-[42px] px-3 rounded-full text-xs"
            style={{ border: `1px solid ${ROSE}`, color: ROSE }}
          >邀请路人</button>
        </div>
      </div>
    );
  };

  const ComposeView = () => {
    const quoted = composeRt ? findPost(composeRt) : undefined;
    return (
      <div>
        <div className="flex justify-between items-center px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <button onClick={goBack} className="text-neutral-800"><ChevronLeft className="w-[26px] h-[26px]" /></button>
            <b className="text-[17px]">{quoted ? '转发帖子' : '发布'}</b>
          </div>
          <button
            onClick={handlePublish}
            className="text-white h-8 px-4 rounded-full text-[13px] font-bold"
            style={{ background: ROSE }}
          >发布</button>
        </div>
        <div className="px-[18px] py-2">
          {/* 以谁的身份发 */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
            <span className="text-xs text-neutral-400 flex-none">以</span>
            {allAuthors.map(a => (
              <button
                key={a.key}
                onClick={() => setComposeAs(a.key)}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs flex-none border"
                style={composeAs === a.key ? { borderColor: ROSE, color: ROSE } : { borderColor: '#eee', color: '#666' }}
              >
                <Avatar src={a.avatar} name={a.name} size={20} />
                {a.name}
              </button>
            ))}
            <span className="text-xs text-neutral-400 flex-none">的身份发布</span>
          </div>
          <div className="flex gap-2.5 mb-2.5">
            <Avatar src={resolveAuthor(composeAs).avatar} name={resolveAuthor(composeAs).name} size={36} />
            <div>
              <b className="text-sm">{resolveAuthor(composeAs).name}</b>
              <div className="text-neutral-400 text-xs">{resolveAuthor(composeAs).handle}</div>
            </div>
          </div>
          <textarea
            value={composeText}
            onChange={e => setComposeText(e.target.value)}
            rows={5}
            placeholder={quoted ? '说说你的转发理由…' : '有什么新鲜事？'}
            className="w-full text-[15px] leading-relaxed outline-none resize-none"
          />
          {quoted && (
            <div className="bg-neutral-100 rounded-xl p-2.5 text-[13.5px]">
              <span style={{ color: ROSE }}>@{resolveAuthor(quoted.by).name}</span>：{quoted.tx}
            </div>
          )}
          <div className="flex gap-2 my-3">
            <button
              onClick={() => setComposeText(t => t + '#话题# ')}
              className="h-[34px] px-3.5 rounded-full bg-neutral-100 text-[13px]"
            ><span style={{ color: ROSE }}># 话题</span></button>
            <button
              onClick={() => setSheet({ kind: 'mention' })}
              className="h-[34px] px-3.5 rounded-full bg-neutral-100 text-[13px]"
            ><span style={{ color: ROSE }}>@ 提及</span></button>
          </div>
          <div className="text-neutral-400 text-xs my-1.5">配图（最多 3 张，可上传真实图片/视频）</div>
          <input
            ref={composeFileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleComposeFile}
          />
          <div className="grid grid-cols-6 gap-2">
            <button
              onClick={() => composeFileRef.current?.click()}
              disabled={composeMediaUploading || composeMedia.length >= 3}
              className="aspect-square rounded-[10px] overflow-hidden flex items-center justify-center bg-neutral-100 text-neutral-400 disabled:opacity-50"
            >
              {composeMediaUploading ? <span className="text-[10px]">上传中…</span> : <ImageIcon size={20} />}
            </button>
            {MESH_COLORS.map((_, i) => (
              <button
                key={i}
                onClick={() => setComposeImages(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 3 ? [...prev, i] : prev)}
                className="aspect-square rounded-[10px] overflow-hidden block"
                style={{ outline: composeImages.includes(i) ? `2px solid ${ROSE}` : 'none' }}
              >
                <MeshImage g={i} className="w-full h-full" />
              </button>
            ))}
          </div>
          {composeMedia.length > 0 && (
            <div className="flex gap-2 mt-2">
              {composeMedia.map((m, idx) => (
                <div key={idx} className="relative w-[72px] h-[72px] rounded-[10px] overflow-hidden">
                  <ThreadMedia media={m} className="w-full h-full" />
                  <button
                    onClick={() => setComposeMedia(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                  ><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const MsgView = () => (
    <div>
      <div className="flex justify-center gap-[26px] pt-3.5 border-b border-neutral-100">
        {([['at', '@我'], ['cm', '评论'], ['lk', '赞']] as [MsgTab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMsgTab(k)}
            className={`pb-2.5 text-[15px] border-b-2 ${msgTab === k ? 'font-bold' : 'text-neutral-400'}`}
            style={{ borderColor: msgTab === k ? ROSE : 'transparent' }}
          >{label}</button>
        ))}
      </div>
      <div className="text-neutral-400 text-center py-[70px] text-[13px]">暂无新消息</div>
    </div>
  );

  const MeView = () => {
    const myPosts = posts.filter(p => !p.del && p.by === 'me' && (meTab === 'p' ? !p.rt : !!p.rt));
    const followCount = Object.values(follows).filter(Boolean).length;
    return (
      <div>
        <div className="flex justify-between items-start px-[18px] pt-[22px]">
          <div>
            <div className="text-[22px] font-bold">{currentUser.name || '我'}</div>
            <div className="text-neutral-400 text-xs mt-[3px]">{currentUser.id ? '@' + currentUser.id.replace(/^@/, '') : '@me'}</div>
            {currentUser.desc && <div className="text-[13.5px] leading-relaxed mt-2.5">{currentUser.desc}</div>}
          </div>
          <Avatar src={currentUser.avatar || undefined} name={currentUser.name || '我'} size={68} />
        </div>
        <div className="text-neutral-400 text-xs px-[18px] py-2.5">0 粉丝 · {followCount} 关注</div>
        <div className="flex gap-2 px-[18px] pb-3.5">
          <button
            onClick={() => { setEditName(currentUser.name); setEditId(currentUser.id); setEditDesc(currentUser.desc); setSheet({ kind: 'edit' }); }}
            className="flex-1 h-[42px] rounded-xl border border-neutral-200 text-[13px] font-medium"
          >编辑资料</button>
          <button
            onClick={() => showToast('已复制主页链接')}
            className="flex-1 h-[42px] rounded-xl border border-neutral-200 text-[13px] font-medium"
          >分享主页</button>
        </div>
        <div className="flex border-b border-neutral-100">
          {([['p', '帖子'], ['r', '转发']] as [MeTab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMeTab(k)}
              className={`flex-1 text-center py-2.5 text-[15px] border-b-2 ${meTab === k ? 'font-bold' : 'text-neutral-400'}`}
              style={{ borderColor: meTab === k ? ROSE : 'transparent' }}
            >{label}</button>
          ))}
        </div>
        {myPosts.length ? myPosts.map(p => <PostCard key={p.id} p={p} />) : (
          <div className="text-neutral-400 text-center py-[70px] text-[13px]">还没有内容</div>
        )}
      </div>
    );
  };

  /* ---------- 底部导航 ---------- */
  const showNav = ['home', 'search', 'msg', 'me'].includes(view);

  /* ---------- 弹窗 ---------- */
  const renderSheet = () => {
    if (!sheet) return null;
    const close = () => setSheet(null);
    const wrap = (content: React.ReactNode) => (
      <div className="absolute inset-0 z-20 bg-black/40 flex items-end" onClick={close}>
        <div className="w-full bg-white rounded-t-[22px] pt-3 pb-7 max-h-[80%] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="w-9 h-1 rounded bg-neutral-200 mx-auto mb-3" />
          {content}
        </div>
      </div>
    );

    if (sheet.kind === 'mention') {
      return wrap(
        <div>
          <div className="px-[18px] pb-1.5"><b className="text-base">提及谁？</b></div>
          {allAuthors.filter(a => a.key !== 'me').map(a => (
            <button
              key={a.key}
              onClick={() => { setComposeText(t => t + `@${a.name} `); close(); }}
              className="flex items-center gap-3 w-full px-[18px] py-3 text-left"
            >
              <Avatar src={a.avatar} name={a.name} size={44} />
              <div><b>{a.name}</b><div className="text-neutral-400 text-xs">{a.kind}</div></div>
            </button>
          ))}
        </div>
      );
    }

    if (sheet.kind === 'edit') {
      return wrap(
        <div className="px-[18px]">
          <b className="text-base">编辑资料</b>
          {([
            ['昵称', editName, setEditName],
            ['ID', editId, setEditId],
            ['简介', editDesc, setEditDesc],
          ] as [string, string, React.Dispatch<React.SetStateAction<string>>][]).map(([label, v, set]) => (
            <div key={label}>
              <div className="text-neutral-400 text-xs mt-3 mb-1">{label}</div>
              <input
                value={v}
                onChange={e => set(e.target.value)}
                className="w-full h-11 border border-neutral-200 rounded-xl px-3 text-sm outline-none"
              />
            </div>
          ))}
          <button
            onClick={() => {
              if (!editName.trim()) { showToast('昵称不能为空'); return; }
              const pid = currentUser.personaId;
              if (pid) {
                setLinePersonas((prev: any[]) => (Array.isArray(prev) ? prev : []).map((p: any) =>
                  String(p.id) === String(pid) ? { ...p, name: editName.trim() } : p));
                setThreadsExtras((prev) => ({
                  ...prev,
                  [pid]: { handle: editId.trim(), desc: editDesc.trim() },
                }));
              }
              close();
              showToast('已保存（已同步到 LINE 人设）');
            }}
            className="w-full h-11 rounded-full text-white font-bold text-sm mt-4"
            style={{ background: ROSE }}
          >保存</button>
        </div>
      );
    }

    if (sheet.kind === 'repost') {
      const p = findPost(sheet.id);
      if (!p) return null;
      return wrap(
        <div>
          <button
            onClick={() => {
              setPosts(prev => prev.map(pp => pp.id === p.id ? { ...pp, rp: pp.rp + 1 } : pp));
              setPosts(prev => [{ id: Date.now(), by: 'me', tx: '转发', im: [], l: 0, rp: 0, rd: '0', time: '刚刚', rt: p.id, cm: [] }, ...prev]);
              close();
              showToast('已转发');
            }}
            className="flex items-center gap-3 w-full px-[18px] h-[52px] text-sm"
          >
            <Repeat2 className="w-5 h-5" /><span>转发</span>
          </button>
          <button
            onClick={() => {
              setComposeRt(p.id); setComposeText(''); setComposeImages([]);
              setPrevView(view); setView('compose'); close();
            }}
            className="flex items-center gap-3 w-full px-[18px] h-[52px] text-sm"
          >
            <MessageCircle className="w-5 h-5" /><span>转发并评论</span>
          </button>
          <button onClick={close} className="w-full h-[52px] text-sm text-neutral-400">取消</button>
        </div>
      );
    }

    if (sheet.kind === 'postmenu') {
      const p = findPost(sheet.id);
      if (!p) return null;
      const own = p.by === 'me';
      return wrap(
        <div>
          {own ? (
            <button
              onClick={() => {
                setPosts(prev => prev.map(pp => pp.id === p.id ? { ...pp, del: true } : pp));
                close();
                showToast('已删除');
              }}
              className="w-full h-[52px] text-sm text-left px-[18px] text-[#d4455a]"
            >删除</button>
          ) : (
            <>
              <button onClick={() => { close(); showToast('已减少此类内容'); }} className="w-full h-[52px] text-sm text-left px-[18px]">不感兴趣</button>
              <button onClick={() => { close(); showToast('已举报（演示）'); }} className="w-full h-[52px] text-sm text-left px-[18px] text-[#d4455a]">举报</button>
            </>
          )}
          <button onClick={close} className="w-full h-[52px] text-sm text-neutral-400">取消</button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-white text-[#222] select-none overflow-hidden">
      {/* 顶栏 */}
      <div className="flex items-center px-4 pt-12 pb-2">
        <button onClick={() => onNavigate('home')} className="w-8 h-8 grid place-items-center text-neutral-800 -ml-2">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <b className="text-[17px] ml-1">Circle</b>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {view === 'home' && <HomeView />}
        {view === 'topic' && <TopicView />}
        {view === 'search' && <SearchView />}
        {view === 'cm' && <CommentView />}
        {view === 'compose' && <ComposeView />}
        {view === 'msg' && <MsgView />}
        {view === 'me' && <MeView />}
      </div>

      {/* 底部导航 */}
      {showNav && (
        <nav className="flex justify-around items-center h-[60px] border-t border-neutral-100 flex-none text-neutral-400">
          {([
            ['home', <Home key="h" className="w-[26px] h-[26px]" fill={view === 'home' ? 'currentColor' : 'none'} />],
            ['search', <Search key="s" className="w-[26px] h-[26px]" />],
            ['compose', <Plus key="p" className="w-[26px] h-[26px]" />],
            ['msg', <Bell key="b" className="w-[26px] h-[26px]" />],
            ['me', <User key="u" className="w-[26px] h-[26px]" />],
          ] as [View, React.ReactNode][]).map(([k, icon]) => (
            <button
              key={k}
              onClick={() => {
                if (k === 'compose') { setComposeRt(0); setComposeText(''); setComposeImages([]); setPrevView(view); }
                go(k);
              }}
              className={view === k ? 'text-neutral-800' : ''}
            >{icon}</button>
          ))}
        </nav>
      )}

      {renderSheet()}

      {toast && (
        <div className="absolute left-1/2 top-[60px] -translate-x-1/2 bg-neutral-800 text-white px-4 py-2 rounded-full text-[13px] z-40 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
