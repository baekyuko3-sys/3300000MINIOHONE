import { useEffect, useState } from 'react';
import { usePersistentState } from '../../store/usePersistentState';
import { ArrowLeft, Heart, MessageCircle, Repeat2, Share } from 'lucide-react';
import { ScreenType } from '../../types';

interface ThreadsScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
}

interface ThreadItem {
  id: string;
  author: string;
  handle: string;
  time: string;
  avatar: string;
  content: string;
  likes: number;
  replies: number;
  isLiked: boolean;
}

export function ThreadsScreenView({ onNavigate }: ThreadsScreenViewProps) {
  const [threads, setThreads] = usePersistentState<ThreadItem[]>('phone:threads', []);
  const [inputPost, setInputPost] = useState('');
  const [currentUser, setCurrentUser] = usePersistentState<{ name: string; id: string; desc: string }>('line:current-user', {
    name: '',
    id: '',
    desc: '',
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem('line:current-user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {
      // Keep the blank identity.
    }
  }, [setCurrentUser]);

  const handlePost = () => {
    if (!inputPost.trim()) return;
    const displayName = currentUser.name.trim() || '我';
    const handle = currentUser.id.trim() ? '@' + currentUser.id.replace(/^@/, '') : '@private';
    const newThread: ThreadItem = {
      id: 't-' + Date.now().toString(36),
      author: displayName,
      handle,
      time: '刚刚',
      avatar: '',
      content: inputPost.trim(),
      likes: 0,
      replies: 0,
      isLiked: false,
    };
    setThreads(prev => [newThread, ...prev]);
    setInputPost('');
  };

  const toggleLike = (id: string) => {
    setThreads(prev => prev.map(item => item.id === id ? {
      ...item,
      isLiked: !item.isLiked,
      likes: item.isLiked ? Math.max(0, item.likes - 1) : item.likes + 1,
    } : item));
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden" style={{ background: 'var(--screen, #ffffff)', color: 'var(--ink, #242323)' }}>
      <div className="absolute inset-0 opacity-[0.03] bg-paper-noise pointer-events-none" />

      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center text-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-bold tracking-tight text-[#1a1a1a]">Threads</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-[#8e8b86] font-mono border border-neutral-200">PRIVATE FEED</span>
            </div>
            <div className="text-[9px] text-[#8e8b86] font-mono tracking-wider mt-0.5">LOCAL · {threads.length} POSTS</div>
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#1a1a1a] text-white grid place-items-center text-xs font-mono font-bold">
          {currentUser.name.trim() ? currentUser.name.trim()[0].toUpperCase() : '·'}
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar text-xs">
        <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/80 space-y-2">
          <div className="flex gap-2.5 items-start">
            <div className="w-7 h-7 rounded-full bg-neutral-800 text-white grid place-items-center text-[10px] font-mono shrink-0">
              {currentUser.name.trim() ? currentUser.name.trim()[0].toUpperCase() : '·'}
            </div>
            <textarea value={inputPost} onChange={e => setInputPost(e.target.value)} placeholder="分享一句只留给风听的随笔..." rows={2} className="flex-1 bg-transparent border-0 outline-none text-xs text-[#1a1a1a] placeholder-[#8e8b86] font-serif-sc resize-none" />
          </div>
          {inputPost.trim() && (
            <div className="flex justify-end pt-1">
              <button onClick={handlePost} className="px-3 py-1 rounded-full bg-[#1a1a1a] text-white text-[11px] font-medium">发布 Thread</button>
            </div>
          )}
        </div>

        {threads.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-[9px] font-mono tracking-[1.6px] text-[#aaa]">EMPTY THREADS</div>
            <div className="mt-2 font-serif text-[15px] text-[#3a3734]">还没有动态</div>
            <div className="mt-1 text-[10px] text-[#8e8b86]">你的第一条 Thread 会从这里开始。</div>
          </div>
        ) : threads.map(item => (
          <div key={item.id} className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-[0_4px_16px_rgba(0,0,0,.03)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-neutral-200 shrink-0 bg-neutral-100 grid place-items-center text-[10px] text-neutral-500">
                  {item.avatar ? <img src={item.avatar} alt={item.author} className="w-full h-full object-cover" /> : (item.author[0] || '·')}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif font-bold text-xs text-[#1a1a1a]">{item.author}</span>
                    <span className="text-[10px] text-[#8e8b86] font-mono">{item.handle}</span>
                  </div>
                  <div className="text-[9px] text-[#8e8b86] font-mono">{item.time}</div>
                </div>
              </div>
              <span className="text-[8px] font-mono text-[#8b7560] bg-[#fbf9f5] px-2 py-0.5 rounded border border-[#8b7560]/20">LOCAL</span>
            </div>
            <p className="font-serif-sc text-xs leading-relaxed text-[#3a3734]">{item.content}</p>
            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-[#8e8b86]">
              <div className="flex items-center gap-4">
                <button onClick={() => toggleLike(item.id)} className={`flex items-center gap-1.5 transition-colors ${item.isLiked ? 'text-[#9b625b]' : 'hover:text-[#1a1a1a]'}`}>
                  <Heart className={`w-3.5 h-3.5 ${item.isLiked ? 'fill-current' : ''}`} />
                  <span className="font-mono text-[10px]">{item.likes}</span>
                </button>
                <button className="flex items-center gap-1.5 hover:text-[#1a1a1a]"><MessageCircle className="w-3.5 h-3.5" /><span className="font-mono text-[10px]">{item.replies}</span></button>
                <button className="flex items-center gap-1.5 hover:text-[#1a1a1a]"><Repeat2 className="w-3.5 h-3.5" /></button>
              </div>
              <button className="hover:text-[#1a1a1a]"><Share className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8e8b86] font-mono border-t border-neutral-200/80">
        PRIVATE THREADS · LOCAL ONLY
      </div>
    </div>
  );
}
