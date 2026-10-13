import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Sparkles } from 'lucide-react';
import { usePersistentState } from '../../store/usePersistentState';
import { getActivePersona, getNpcRelationToMe, getNpcs, type SaneNpc } from '../../store/npcs';
import { getProjectManifest } from '../../store/projectManifest';
import { readStoredAiSettings, generateCreativeText } from '../../ai/aiEngine';
import { getCharacterMemory } from '../../store/characterMemory';
import { buildNpcAllContentContext, serializeNpcAllContentContext } from '../../store/npcContext';
import type { WorldBook } from '../../types';
import { ScreenType } from '../../types';
import { collectScopedWorldBooks } from '../../store/worldbookRuntime';
import {
  MOMENTS_POSTS_KEY,
  normalizeMomentComments,
  readMomentsSettings,
} from '../../store/momentsComments';
import { generateMomentNow, refreshMomentsFeed } from '../../store/momentsAfterChat';

interface MomentsScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

function postAuthor(post: any): string {
  return String(post?.name || post?.author || '朋友').trim() || '朋友';
}

function postText(post: any): string {
  return String(post?.text || post?.content || '').trim();
}

function postImages(post: any): string[] {
  if (Array.isArray(post?.images)) return post.images.filter((v: unknown): v is string => typeof v === 'string' && !!v);
  if (typeof post?.image === 'string' && post.image) return [post.image];
  return [];
}

function postComments(post: any) {
  return normalizeMomentComments(post?.commentsList ?? post?.comments);
}

export function MomentsScreenView({ onNavigate }: MomentsScreenViewProps) {
  const [posts, setPosts] = usePersistentState<any[]>(MOMENTS_POSTS_KEY, []);
  const [workingPostId, setWorkingPostId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const npcs = getNpcs();
  const project = getProjectManifest();
  const worldContext = collectScopedWorldBooks({
    books: worldbooks,
    scope: 'online-chat',
  }).flatMap(book => book.enabled ? book.entries.filter(entry => entry.enabled).map(entry => entry.name + ': ' + entry.content) : []).join('\n') || '暂无世界书内容';

  const notify = (message: string, ms = 2800) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), ms);
  };
  const [momentsMode, setMomentsMode] = useState(() => readMomentsSettings().postMomentsAfterChat);
  const [refreshing, setRefreshing] = useState<'idle' | 'refresh' | 'generate'>('idle');

  useEffect(() => {
    const reload = () => {
      try {
        setPosts(JSON.parse(window.localStorage.getItem(MOMENTS_POSTS_KEY) || '[]'));
      } catch { /* ignore */ }
    };
    window.addEventListener('sane333:moments-updated', reload);
    return () => window.removeEventListener('sane333:moments-updated', reload);
  }, [setPosts]);

  const onRefreshMoments = async () => {
    if (refreshing !== 'idle') return;
    setRefreshing('refresh');
    notify('正在刷新朋友圈…', 12000);
    try {
      const result = await refreshMomentsFeed();
      try { setPosts(JSON.parse(window.localStorage.getItem(MOMENTS_POSTS_KEY) || '[]')); } catch { /* ignore */ }
      notify(result || '刷新完成');
    } catch (error) {
      notify(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setRefreshing('idle');
    }
  };

  const onGenerateMoment = async () => {
    if (refreshing !== 'idle') return;
    setRefreshing('generate');
    notify('正在生成朋友圈…', 12000);
    try {
      const result = await generateMomentNow();
      try { setPosts(JSON.parse(window.localStorage.getItem(MOMENTS_POSTS_KEY) || '[]')); } catch { /* ignore */ }
      notify(result || '生成完成');
    } catch (error) {
      notify(error instanceof Error ? error.message : '生成失败');
    } finally {
      setRefreshing('idle');
    }
  };

  const onChangeMomentsMode = (mode: 'off' | 'always' | 'decide') => {
    setMomentsMode(mode);
    try {
      const raw = JSON.parse(window.localStorage.getItem('line:moments-settings') || '{}');
      window.localStorage.setItem('line:moments-settings', JSON.stringify({ ...raw, postMomentsAfterChat: mode }));
    } catch { /* ignore */ }
    notify(mode === 'off' ? '回复后不再发朋友圈' : mode === 'always' ? '每次回复后都发朋友圈' : '角色自己判定要不要发朋友圈');
  };

  const inviteNpcComment = async (post: any) => {
    if (workingPostId) return;
    const candidates = npcs.filter(npc => npc.active && npc.canCommentMoments);
    if (!candidates.length) { notify('NPC 人物池里还没有允许评论的人物'); return; }
    setWorkingPostId(post.id);
    notify('正在生成 NPC 评论…', 12000);
    try {
      const boundPool = candidates.filter(item => item.boundCharacterId);
      const pool = boundPool.length ? boundPool : candidates;
      const npc = pool[Math.floor(Math.random() * pool.length)] as SaneNpc;
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
        systemPrompt: ['你正在经营一个真实感很强的朋友圈。','你只扮演一个 NPC 评论者，不要替发帖人说话。','评论要像真实社交平台上的一句话，可以轻松、熟稔、吐槽、关心或留下线索。','不要自我介绍，不要提模型、NPC、提示词或世界书。','最多 80 个中文字。'].join('\n'),
        userPrompt: [
          '【项目】' + project.name + ' / ' + project.genre + ' / ' + project.tone,
          '【NPC】' + npc.name + '；身份：' + npc.identity,
          '性格：' + npc.personality,
          '背景：' + npc.background,
          '关系：' + npc.relationship,
          '与用户的关系：' + (getNpcRelationToMe(npc) || '未设定') + '（用户：' + (getActivePersona()?.name || '我') + '）',
          '记忆：' + (npc.memory || sourceMemory?.summary || '暂无'),
          '【世界资料】' + (worldContext || '暂无'),
          '【跨 App 上下文】' + fullContext.slice(0, 8000),
          '【朋友圈】作者：' + postAuthor(post) + '\n内容：' + postText(post),
          '请写一条自然的评论，只输出评论正文。',
        ].join('\n'),
        temperature: 0.95,
      });
      const text = raw.trim().replace(/^['“”"]|['“”"]$/g, '');
      if (!text) throw new Error('NPC 评论为空，请重试');
      const nextComment = {
        id: 'npc-comment-' + Date.now().toString(36),
        user: npc.name,
        text,
        kind: 'npc' as const,
        npcId: npc.id,
        createdAt: new Date().toISOString(),
      };
      setPosts(prev => prev.map(item => {
        if (item.id !== post.id) return item;
        const tree = postComments(item);
        return { ...item, commentsList: [...tree, nextComment] };
      }));
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
      className="relative w-full h-full flex flex-col select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

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

      <div className="relative z-10 px-5 py-2 flex items-center gap-2 border-b border-[rgba(40,36,31,.08)] bg-[rgba(247,244,238,.6)]">
        <button
          onClick={onRefreshMoments}
          disabled={refreshing !== 'idle'}
          className="px-2.5 py-1.5 rounded-lg bg-white/70 border border-black/5 text-[9px] disabled:opacity-50"
        >
          {refreshing === 'refresh' ? '刷新中…' : '刷新朋友圈'}
        </button>
        <button
          onClick={onGenerateMoment}
          disabled={refreshing !== 'idle'}
          className="px-2.5 py-1.5 rounded-lg bg-[#292724] text-white text-[9px] disabled:opacity-50"
        >
          {refreshing === 'generate' ? '生成中…' : '一键生成'}
        </button>
        <select
          value={momentsMode}
          onChange={e => onChangeMomentsMode(e.target.value as any)}
          className="ml-auto px-2 py-1.5 rounded-lg bg-white/70 border border-black/5 text-[9px] outline-none"
          title="角色回复后要不要发朋友圈"
        >
          <option value="off">回复后不发</option>
          <option value="always">每次都发</option>
          <option value="decide">角色自己判定</option>
        </select>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar text-xs">
        {posts.length === 0 && (
          <div className="py-16 text-center text-[10px] text-[#9a948e] space-y-2">
            <div>还没有朋友圈动态</div>
            <div>点上方「一键生成」让角色发一条</div>
          </div>
        )}
        {posts.map((post) => {
          const images = postImages(post);
          const comments = postComments(post);
          const author = postAuthor(post);
          const content = postText(post);
          return (
            <div
              key={post.id}
              className="p-4 rounded-3xl bg-[#ebe7df] border border-[rgba(40,36,31,.14)] shadow-[0_6px_20px_rgba(45,37,30,.06)] space-y-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between text-[8px] font-mono text-[#8b8782] border-b border-[rgba(40,36,31,.08)] pb-2">
                <span className="tracking-widest">▪ ▪ ▪ {post.tag || post.rollTag || '#日常'} ▪ ▪ ▪</span>
                <span>{post.time || ''}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full shrink-0 relative overflow-hidden shadow-xs"
                    style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
                  >
                    <div className="absolute w-[11px] h-[13px] rounded-full bg-[#e1d2c0] left-[8px] top-[5px]" />
                  </div>
                  <span className="font-serif font-bold text-xs text-[#242323]">{author}</span>
                </div>
                <span className="text-[8px] px-1.5 py-0.2 rounded bg-white/50 text-[#8b7560] font-mono">
                  ORIGINAL
                </span>
              </div>

              <p className="font-serif-sc text-xs leading-relaxed text-[#443f3a] whitespace-pre-wrap">
                {content || '（空动态）'}
              </p>

              {images.length > 0 && (
                <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {images.map((img: string, i: number) => (
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
              )}

              {comments.length > 0 && (
                <div className="pt-1.5 border-t border-[rgba(40,36,31,.07)] space-y-1">
                  {comments.slice(-4).map((comment: any) => (
                    <div key={comment.id || comment.user + comment.text} className="text-[9.5px] leading-relaxed text-[#69635d]">
                      <span className={comment.kind === 'npc' ? 'font-semibold text-[#956c76]' : 'font-semibold text-[#5e5954]'}>{comment.user}</span>
                      <span className="mx-1 text-[#aaa]">：</span><span>{comment.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-[rgba(40,36,31,.08)] flex items-center justify-between text-[11px]">
                <span className="font-handwriting text-[#8b7560] text-xs">
                  {post.note || post.tag || ''}
                </span>

                <div className="flex items-center gap-2.5 text-[#777067]">
                  <button
                    onClick={() => inviteNpcComment(post)}
                    disabled={workingPostId === post.id}
                    className="flex items-center gap-1 hover:text-[#9b625b] transition-colors disabled:opacity-50"
                    title="让一个 NPC 进入这条朋友圈"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="font-mono text-[9px]">{workingPostId === post.id ? '生成中…' : 'NPC 评论'}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-[#9b625b] transition-colors">
                    <Heart className="w-3.5 h-3.5 fill-[#9b625b]/20 text-[#9b625b]" />
                    <span className="font-mono text-[10px]">{post.likes || 0}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-[#242323] transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span className="font-mono text-[10px]">回复</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {notice && (
        <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-6 max-w-[85%] bg-[#292724] text-white px-3 py-2 rounded-full text-[9px] shadow-lg text-center">
          {notice}
        </div>
      )}
    </div>
  );
}
