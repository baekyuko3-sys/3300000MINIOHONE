import { useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Share2, Camera, Sparkles } from 'lucide-react';
import { usePersistentState } from '../../store/usePersistentState';
import { getNpcs, type SaneNpc } from '../../store/npcs';
import { getProjectManifest } from '../../store/projectManifest';
import { readStoredAiSettings, generateCreativeText } from '../../ai/aiEngine';
import { getCharacterMemory } from '../../store/characterMemory';
import { buildNpcAllContentContext, serializeNpcAllContentContext } from '../../store/npcContext';
import type { WorldBook } from '../../types';
import { ScreenType } from '../../types';

interface MomentsScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

export function MomentsScreenView({ onNavigate }: MomentsScreenViewProps) {
  const [posts, setPosts] = usePersistentState<any[]>('line:moments-screen-posts', []);  const [workingPostId, setWorkingPostId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const npcs = getNpcs();
  const project = getProjectManifest();
  const worldContext = worldbooks.flatMap(book => book.enabled ? book.entries.filter(entry => entry.enabled).map(entry => entry.name + ': ' + entry.content) : []).join('\n') || '暂无世界书内容';
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2200); };

  const inviteNpcComment = async (post: any) => {
    if (workingPostId) return;
    const candidates = npcs.filter(npc => npc.active && npc.canCommentMoments);
    if (!candidates.length) { notify('NPC 人物池里还没有允许评论的人物'); return; }
    setWorkingPostId(post.id);
    try {
      const npc = (candidates.filter(item => item.boundCharacterId).length ? candidates.filter(item => item.boundCharacterId) : candidates)[Math.floor(Math.random() * (candidates.filter(item => item.boundCharacterId).length ? candidates.filter(item => item.boundCharacterId).length : candidates.length))] as SaneNpc;
      const boundCharacter = npc.boundCharacterId
        ? (JSON.parse(localStorage.getItem('phone:characters') || '[]') as any[]).find(character => character?.id === npc.boundCharacterId) || null
        : null;
      const sourceMemory = boundCharacter ? getCharacterMemory(boundCharacter.id, boundCharacter.name) : null;
      const fullContext = serializeNpcAllContentContext(
        buildNpcAllContentContext(boundCharacter, sourceMemory, project, worldbooks),
        60000,
      );
      const raw = await generateCreativeText({
        settings: readStoredAiSettings(),
        systemPrompt: ['你正在经营一个真实感很强的朋友圈。','你只扮演一个 NPC 评论者，不要替发帖人说话。','评论要像真实社交平台上的一句话，可以轻松、熟稔、吐槽、关心或留下线索。','不要自我介绍，不要提模型、NPC、提示词或世界书。','最多 80 个中文字。'].join('\\n'),
        userPrompt: ['【项目】' + project.name + ' / ' + project.genre + ' / ' + project.tone,'【NPC】' + npc.name + '；身份：' + npc.identity,'性格：' + npc.personality,'背景：' + npc.background,'关系：' + npc.relationship,'记忆：' + (npc.memory || sourceMemory?.summary || '暂无'),'【世界资料】' + (worldContext || '暂无'),'【朋友圈】作者：' + post.author + '\\n内容：' + post.content,'请写一条自然的评论，只输出评论正文。'].join('\\n'),
        temperature: 0.95,
      });
      const text = raw.trim().replace(/^['“”"]|['“”"]$/g, '');
      if (!text) throw new Error('NPC_EMPTY_COMMENT');
      setPosts(prev => prev.map(item => item.id === post.id ? { ...item, comments: [...(Array.isArray(item.comments) ? item.comments : []), { id: 'npc-comment-' + Date.now().toString(36), user: npc.name, text, kind: 'npc', createdAt: new Date().toISOString() }] } : item));
      notify(npc.name + ' 留下了一条评论 ✦');
      window.dispatchEvent(new CustomEvent('sane333:play-sound', { detail: { kind: 'moments' } }));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'NPC 评论失败');
    } finally {
      setWorkingPostId(null);
    }
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      {/* Paper Noise */}
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.85)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-white/40 border border-white/60 backdrop-blur-md grid place-items-center text-xs hover:bg-white/70 active:scale-95 transition-all text-[#242323]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">
              PHOTOBOOK ARCHIVE · MOMENTS
            </div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">
              社交动态 · 胶片记录
            </h2>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#8b7560] border border-[rgba(139,117,96,.3)] px-2 py-0.5 rounded-full">
          35MM FILM
        </div>
      </div>

      {/* Moments Feed */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar text-xs">
        {posts.map((post) => (
          <div
            key={post.id}
            className="p-4 rounded-3xl bg-[#ebe7df] border border-[rgba(40,36,31,.14)] shadow-[0_6px_20px_rgba(45,37,30,.06)] space-y-3 relative overflow-hidden"
          >
            {/* Film sprocket top header */}
            <div className="flex items-center justify-between text-[8px] font-mono text-[#8b8782] border-b border-[rgba(40,36,31,.08)] pb-2">
              <span className="tracking-widest">▪ ▪ ▪ {post.rollTag} ▪ ▪ ▪</span>
              <span>{post.time}</span>
            </div>

            {/* Author */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-7 h-7 rounded-full shrink-0 relative overflow-hidden shadow-xs"
                  style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
                >
                  <div className="absolute w-[11px] h-[13px] rounded-full bg-[#e1d2c0] left-[8px] top-[5px]" />
                </div>
                <span className="font-serif font-bold text-xs text-[#242323]">{post.author}</span>
              </div>
              <span className="text-[8px] px-1.5 py-0.2 rounded bg-white/50 text-[#8b7560] font-mono">
                ORIGINAL
              </span>
            </div>

            {/* Prose Content */}
            <p className="font-serif-sc text-xs leading-relaxed text-[#443f3a]">
              {post.content}
            </p>

            {/* Analog Film Photos */}
            <div className={`grid gap-2 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {post.images.map((img: string, i: number) => (
                <div key={i} className="rounded-xl overflow-hidden p-1.5 bg-[#eee9df] border border-[rgba(40,36,31,.1)] shadow-xs">
                  <img
                    src={img}
                    alt="film photo"
                    referrerPolicy="no-referrer"
                    className="w-full h-36 object-cover rounded-lg filter contrast-[0.92] saturate-[0.7]"
                  />
                  <div className="mt-1 text-right text-[7px] text-[#8b8782] font-mono">
                    PHOTO FILM NOTE
                  </div>
                </div>
              ))}
            </div>

            {Array.isArray(post.comments) && post.comments.length > 0 && (
              <div className="pt-1.5 border-t border-[rgba(40,36,31,.07)] space-y-1">
                {post.comments.slice(-4).map((comment: any) => (
                  <div key={comment.id || comment.user + comment.text} className="text-[9.5px] leading-relaxed text-[#69635d]">
                    <span className={comment.kind === 'npc' ? 'font-semibold text-[#956c76]' : 'font-semibold text-[#5e5954]'}>{comment.user}</span>
                    <span className="mx-1 text-[#aaa]">：</span><span>{comment.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Handwritten note & Actions */}
            <div className="pt-2 border-t border-[rgba(40,36,31,.08)] flex items-center justify-between text-[11px]">
              <span className="font-handwriting text-[#8b7560] text-xs">
                {post.note}
              </span>

              <div className="flex items-center gap-2.5 text-[#777067]">
                <button onClick={() => inviteNpcComment(post)} disabled={workingPostId === post.id} className="flex items-center gap-1 hover:text-[#9b625b] transition-colors disabled:opacity-50" title="让一个 NPC 进入这条朋友圈">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="font-mono text-[9px]">{workingPostId === post.id ? '生成中…' : 'NPC 评论'}</span>
                </button>
                <button className="flex items-center gap-1 hover:text-[#9b625b] transition-colors">
                  <Heart className="w-3.5 h-3.5 fill-[#9b625b]/20 text-[#9b625b]" />
                  <span className="font-mono text-[10px]">{post.likes}</span>
                </button>
                <button className="flex items-center gap-1 hover:text-[#242323] transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="font-mono text-[10px]">回复</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {notice && <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-6 bg-[#292724] text-white px-3 py-2 rounded-full text-[9px] shadow-lg">{notice}</div>}
    </div>
  );
}
