import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart, MessageCircle, Send, Bookmark, Home, Search, PlusSquare, Film,
  ChevronLeft, MoreHorizontal, X, Check, Menu, LayoutGrid, Trash2, RotateCcw,
} from 'lucide-react';
import { usePersistentState } from '../../store/usePersistentState';
import { ScreenType } from '../../types';
import { getNpcs } from '../../store/npcs';

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
  likes: number;
  liked: boolean;
  saved: boolean;
  comments: IgComment[];
  time: string;
  deleted?: boolean;
  deletedInfo?: string;
}

interface IgPersona {
  name: string;
  title: string;
  job: string;
  bio: string;
  theme: string;
  themeSoft: string;
}

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

function Avatar({ size = 34, ring = 0, avatarUrl, name }: { size?: number; ring?: number; avatarUrl?: string; name?: string }) {
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
  if (ring) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', padding: 2.5, background: ringBg, flex: 'none' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', padding: 2 }}>{inner}</div>
      </div>
    );
  }
  return <div style={{ width: size, height: size, flex: 'none' }}>{inner}</div>;
}

type View = 'home' | 'comments' | 'me' | 'activity' | 'deleted' | 'compose' | 'search' | 'post' | 'dm' | 'chat' | 'edit' | 'story';

export function InstagramScreenView({ onNavigate }: InstagramScreenViewProps) {
  const [posts, setPosts] = usePersistentState<IgPost[]>('phone:instagram', []);
  const [view, setView] = useState<View>('home');
  const [prevView, setPrevView] = useState<View>('home');
  const [activePostId, setActivePostId] = useState<string>('');
  const [commentInput, setCommentInput] = useState('');
  const [composeText, setComposeText] = useState('');
  const [composeGradient, setComposeGradient] = useState(0);
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

  const [personas, setPersonas] = usePersistentState<IgPersona[]>('phone:instagram-personas', [
    { name: '我', title: '', job: '', bio: '', theme: '#e9c4cb', themeSoft: '#fdeef0' },
  ]);
  const [activePersonaIdx, setActivePersonaIdx] = usePersistentState<number>('phone:instagram-persona-idx', 0);
  const persona = personas[activePersonaIdx] || personas[0];

  // 角色和 NPC
  const [importedCharacters] = usePersistentState<any[]>('phone:characters', []);
  const npcs = useMemo(() => { try { return getNpcs(); } catch { return []; } }, []);
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
  };
  const back = () => {
    setView(view === 'chat' ? 'dm' : prevView || 'home');
    setSheet(null);
  };

  const resolveName = (by: string) => {
    if (by === 'me') return persona.name;
    const p = people.find(x => x.id === by);
    return p ? p.name : by;
  };
  const resolveAvatar = (by: string) => {
    if (by === 'me') return undefined;
    return people.find(x => x.id === by)?.avatar;
  };

  const activePost = posts.find(p => p.id === activePostId);
  const visiblePosts = posts.filter(p => !p.deleted);
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
  const publishPost = () => {
    const t = composeText.trim() || '我的帖子';
    setPosts(prev => [{
      id: `p${Date.now()}`, by: 'me', byName: persona.name, text: t,
      gradient: composeGradient % GRADIENTS.length, likes: 0, liked: false, saved: false,
      comments: [], time: '刚刚',
    }, ...prev]);
    setComposeText('');
    setComposeGradient(0);
    setView('home');
    showToast('已发布');
  };
  const deletePost = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, deleted: true, deletedInfo: '刚刚删除' } : p));
    setSheet(null);
    showToast('已移到最近删除');
  };

  // 快拍自动播放
  useEffect(() => {
    if (view !== 'story') return;
    const storyKeys = ['me', ...people.slice(0, 3).map(p => p.id)];
    const timer = setTimeout(() => {
      const key = storyKeys[storyIndex];
      setSeenStories(prev => ({ ...prev, [key]: true }));
      if (storyIndex < storyKeys.length - 1) setStoryIndex(storyIndex + 1);
      else { setView('home'); setStoryIndex(0); }
    }, 4000);
    return () => clearTimeout(timer);
  }, [view, storyIndex, people]);

  const storyKeys = ['me', ...people.slice(0, 3).map(p => p.id)];
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
        <MeshImage g={p.gradient} className="w-full h-full" />
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
    <div className="w-full h-full bg-white text-[#222] flex flex-col relative overflow-hidden select-none" style={{ fontFamily: "'Noto Sans SC',-apple-system,'PingFang SC',sans-serif" }}>
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
              {people.slice(0, 3).map((p, i) => (
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
                <Avatar size={88} ring={1} />
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
                  <MeshImage g={p.gradient} className="w-full h-full" />
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
            {people.slice(0, 3).map((p, i) => (
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
                  <MeshImage g={p.gradient} className="w-full h-full" />
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
              <div className="text-[#999] text-[12px] my-2">选一张配图</div>
              <div className="grid grid-cols-6 gap-2">
                {GRADIENTS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setComposeGradient(i)}
                    className="aspect-square rounded-[10px] overflow-hidden block"
                    style={{ outline: composeGradient === i ? '2px solid #b4838a' : 'none' }}
                  >
                    <MeshImage g={i} className="w-full h-full" />
                  </button>
                ))}
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
            {searchResults.map(p => (
              <button key={p.id} onClick={() => showToast(`${p.name} 的主页`)} className="flex items-center gap-3 px-[18px] py-2.5 w-full text-left">
                <Avatar size={48} ring={p.kind === 'NPC' ? 1 : 2} avatarUrl={p.avatar} name={p.name} />
                <div className="flex-1 text-[13px]"><b>{p.name}</b><div className="text-[#999] text-[11.5px]">{p.kind === 'NPC' ? 'NPC' : '角色 · 亲密好友'}</div></div>
              </button>
            ))}
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
            {renderTop(resolveName(dmTarget))}
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
              setPersonas(prev => prev.map((p, i) => i === activePersonaIdx
                ? { ...p, ...editingPersona, theme: THEME_COLORS[editThemeIdx][0], themeSoft: THEME_COLORS[editThemeIdx][1] }
                : p));
              setView('me');
              showToast('已保存');
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
              <Avatar size={34} avatarUrl={storyKey === 'me' ? undefined : resolveAvatar(storyKey)} name={storyName} />
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
      {sheet && (
        <div className="absolute inset-0 z-20 bg-[rgba(30,24,20,.4)] flex items-end" onClick={() => setSheet(null)}>
          <div className="w-full bg-white rounded-t-[22px] pt-3 pb-7 max-h-[80%] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <i className="block w-9 h-1 rounded bg-[#ececec] mx-auto mb-3" />
            {sheet === 'persona' && (
              <>
                <div className="px-[18px] pb-1.5"><b className="text-[16px]">我的人设</b><div className="text-[#999] text-[12px] mt-0.5">点头像圈切换身份，主页和快拍会跟着变</div></div>
                {personas.map((p, i) => (
                  <button key={i} onClick={() => { setActivePersonaIdx(i); setSheet(null); showToast('已切换为 ' + p.name); }} className="flex items-center gap-3 px-[18px] py-2.5 w-full text-left">
                    <Avatar size={56} ring={1} />
                    <div className="flex-1 text-[13px]"><b>{p.name} · {i ? '小号' : '主号'}</b><div className="text-[#999] text-[11.5px]">{p.job}</div></div>
                    {activePersonaIdx === i && <span className="text-[#b4838a]"><Check size={22} /></span>}
                  </button>
                ))}
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
                {people.slice(0, 3).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 px-[18px] py-2.5">
                    <Avatar size={44} avatarUrl={p.avatar} name={p.name} />
                    <div className="flex-1 text-[13px]"><b>{p.name}</b><div className="text-[11.5px] text-[#999]">{['看了 2 次', '23:41', '20:15'][i]}</div></div>
                  </div>
                ))}
              </>
            )}
            {typeof sheet === 'object' && sheet.pm && (() => {
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
