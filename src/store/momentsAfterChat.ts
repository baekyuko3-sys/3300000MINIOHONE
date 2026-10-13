import type { ImportedCharacter } from '../data/characterImport';
import { generateCreativeText, resolveChannelAiSettings } from '../ai/aiEngine';
import {
  MOMENTS_POSTS_KEY,
  isCharacterAllowedToPostMoments,
  listPostableNpcs,
  readMomentsSettings,
  spawnBatchCommentsForPost,
} from './momentsComments';
import { readPersistentState } from './usePersistentState';
import type { SaneNpc } from './npcs';

function readPosts(): any[] {
  return readPersistentState<any[]>(MOMENTS_POSTS_KEY, []);
}
function writePosts(posts: any[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOMENTS_POSTS_KEY, JSON.stringify(posts.slice(0, 200)));
    window.dispatchEvent(new CustomEvent('sane333:moments-updated', { detail: { kind: 'refresh' } }));
  } catch { /* ignore */ }
}

function meName(): string {
  const personas = readPersistentState<Array<{ id: string; name?: string; isDefault?: boolean }>>('line:user-personas', []);
  const active = readPersistentState<string | null>('line:active-persona', null);
  const p = personas.find(x => x.id === active) || personas.find(x => x.isDefault) || personas[0];
  return (p?.name || readPersistentState<{ name?: string }>('line:current-user', {}).name || '我').trim() || '我';
}

async function decidePost(chatText: string, replyText: string): Promise<boolean> {
  try {
    const settings = resolveChannelAiSettings('moments');
    const raw = await generateCreativeText({
      settings: { ...settings, maxOutputTokens: 8 },
      systemPrompt: '你是朋友圈判定器。只输出 YES 或 NO：角色刚回完这轮聊天，是否有值得发朋友圈的生活点（见闻/心情/照片感）？普通问答、干巴寒暄一律 NO。',
      userPrompt: '我：' + chatText.slice(-300) + '\n角色：' + replyText.slice(-300),
      temperature: 0.2,
    });
    return raw.trim().toUpperCase().startsWith('Y');
  } catch { return false; }
}

async function makeMomentText(character: ImportedCharacter, hint: string): Promise<string> {
  const settings = resolveChannelAiSettings('moments');
  const raw = await generateCreativeText({
    settings,
    systemPrompt: [
      '你是' + character.name + '，正在发一条自己的朋友圈。',
      (character.personality || '') + '\n' + (character.scenario || ''),
      '只输出动态正文，30-120字，有生活感，不要@用户，不要解释，不要自称AI。',
    ].join('\n'),
    userPrompt: hint || '按你最近的生活发一条朋友圈。',
    temperature: (settings.temperature ?? 0.85),
  });
  return raw.trim();
}

/** 单聊/群聊回复后：off=不发 always=每次发 decide=角色自己判定 */
export async function maybePostMomentAfterChat(opts: {
  character: ImportedCharacter;
  chatText: string;
  replyText: string;
  groupName?: string | null;
}): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cfg = readMomentsSettings();
  if (cfg.postMomentsAfterChat === 'off') return false;
  if (!cfg.allowCharacterAutoPost) return false;
  if (!isCharacterAllowedToPostMoments(opts.character.id, cfg)) return false;
  if (cfg.postMomentsAfterChat === 'decide') {
    const yes = await decidePost(opts.chatText, opts.replyText);
    if (!yes) return false;
  }
  const text = await makeMomentText(
    opts.character,
    '刚聊完：我：' + opts.chatText.slice(-300) + '\n你回：' + opts.replyText.slice(-300) + '\n有感而发就发一条朋友圈（可带群聊「' + (opts.groupName || '') + '」里的事），没感觉就输出空。',
  );
  if (!text) return false;
  const post = {
    id: 'moment-chat-' + Date.now().toString(36),
    name: opts.character.name,
    text,
    time: '刚刚',
    tag: opts.groupName ? '#' + opts.groupName : '#日常',
    liked: false, likes: 0, likers: [],
    commentsList: [] as any[],
    characterId: opts.character.id,
    source: 'after-chat',
  };
  try {
    const { comments } = await spawnBatchCommentsForPost({ post, meName: meName(), settings: cfg });
    if (comments.length) post.commentsList = comments;
  } catch { /* best-effort */ }
  writePosts([post, ...readPosts()]);
  return true;
}

/** 一键刷新：给每条动态补评论（冷启动也补），不重复刷同一个人 */
export async function refreshMomentsFeed(): Promise<string> {
  const cfg = readMomentsSettings();
  const posts = readPosts();
  if (!posts.length) return '还没有朋友圈动态，先点「一键生成」';
  let added = 0;
  let failed = 0;
  const next = [...posts];
  for (let i = 0; i < Math.min(10, next.length); i += 1) {
    const p = next[i];
    try {
      const { comments } = await spawnBatchCommentsForPost({ post: p, meName: meName(), settings: { ...cfg, batchCommentCount: 1 } });
      if (comments.length) {
        const names = new Set((Array.isArray(p.commentsList) ? p.commentsList : []).map((c: any) => c.user));
        const fresh = comments.filter(c => !names.has(c.user));
        if (fresh.length) { p.commentsList = [...(Array.isArray(p.commentsList) ? p.commentsList : []), ...fresh]; added += fresh.length; }
      }
    } catch {
      failed += 1;
    }
  }
  writePosts(next);
  if (added) return '刷新成功：新增 ' + added + ' 条评论';
  if (failed) return '刷新完成，但有 ' + failed + ' 条评论生成失败（检查 AI 配置）';
  return '刷新完成：没有新评论（可能评论者已都出现过）';
}

async function makeNpcMomentText(npc: SaneNpc, hint: string): Promise<string> {
  const settings = resolveChannelAiSettings('moments');
  const raw = await generateCreativeText({
    settings,
    systemPrompt: [
      '你是' + npc.name + '，正在发一条自己的朋友圈。',
      '身份：' + (npc.identity || ''),
      '性格：' + (npc.personality || ''),
      '背景：' + (npc.background || ''),
      '近况：' + (npc.recentLife || ''),
      '只输出动态正文，30-120字，有生活感，不要@用户，不要解释，不要自称AI/NPC。',
    ].join('\n'),
    userPrompt: hint || '按你最近的生活发一条朋友圈。',
    temperature: (settings.temperature ?? 0.85),
  });
  return raw.trim();
}

/** 一键生成：随机挑一个允许发帖的角色或 NPC 发一条 */
export async function generateMomentNow(): Promise<string> {
  const cfg = readMomentsSettings();
  const chars = readPersistentState<ImportedCharacter[]>('phone:characters', [])
    .filter(c => isCharacterAllowedToPostMoments(c.id, cfg));
  const npcs = listPostableNpcs(cfg);
  if (!chars.length && !npcs.length) {
    return '没有允许发朋友圈的角色/NPC（去 VROOM 设置里勾选）';
  }
  const useNpc = npcs.length > 0 && (chars.length === 0 || Math.random() < 0.45);
  if (useNpc) {
    const npc = npcs[Math.floor(Math.random() * npcs.length)];
    let text = '';
    try {
      text = await makeNpcMomentText(npc, '按你最近的生活发一条朋友圈，30-120字。');
    } catch (error) {
      throw new Error(error instanceof Error ? '无法生成朋友圈：' + error.message : '无法生成朋友圈');
    }
    if (!text) return '生成失败：AI 返回空内容，请重试';
    const post = {
      id: 'moment-npc-' + Date.now().toString(36),
      name: npc.name,
      text,
      time: '刚刚',
      tag: '#NPC日常',
      liked: false,
      likes: 0,
      likers: [],
      commentsList: [] as any[],
      npcId: npc.id,
      characterId: npc.boundCharacterId || undefined,
      source: 'manual-npc',
    };
    try {
      const { comments } = await spawnBatchCommentsForPost({ post, meName: meName(), settings: cfg });
      if (comments.length) post.commentsList = comments;
    } catch { /* best-effort */ }
    writePosts([post, ...readPosts()]);
    return '生成成功：NPC ' + npc.name + ' 发了一条朋友圈';
  }
  const ch = chars[Math.floor(Math.random() * chars.length)];
  let text = '';
  try {
    text = await makeMomentText(ch, '按你最近的生活发一条朋友圈，30-120字。');
  } catch (error) {
    throw new Error(error instanceof Error ? '无法生成朋友圈：' + error.message : '无法生成朋友圈');
  }
  if (!text) return '生成失败：AI 返回空内容，请重试';
  const post = {
    id: 'moment-manual-' + Date.now().toString(36),
    name: ch.name, text, time: '刚刚', tag: '#日常',
    liked: false, likes: 0, likers: [],
    commentsList: [] as any[], characterId: ch.id, source: 'manual',
  };
  try {
    const { comments } = await spawnBatchCommentsForPost({ post, meName: meName(), settings: cfg });
    if (comments.length) post.commentsList = comments;
  } catch { /* best-effort */ }
  writePosts([post, ...readPosts()]);
  return '生成成功：' + ch.name + ' 发了一条朋友圈';
}

/** 专门让一个允许发帖的 NPC 发一条 */
export async function generateNpcMomentNow(npcId?: string): Promise<string> {
  const cfg = readMomentsSettings();
  const npcs = listPostableNpcs(cfg);
  const npc = npcId ? npcs.find(n => n.id === npcId) : npcs[Math.floor(Math.random() * npcs.length)];
  if (!npc) return '没有允许发朋友圈的 NPC（去 VROOM 设置勾选，并打开「允许 NPC 发朋友圈」）';
  let text = '';
  try {
    text = await makeNpcMomentText(npc, '按你最近的生活发一条朋友圈，30-120字。');
  } catch (error) {
    throw new Error(error instanceof Error ? '无法生成 NPC 朋友圈：' + error.message : '无法生成 NPC 朋友圈');
  }
  if (!text) return '生成失败：AI 返回空内容，请重试';
  const post = {
    id: 'moment-npc-' + Date.now().toString(36),
    name: npc.name,
    text,
    time: '刚刚',
    tag: '#NPC日常',
    liked: false,
    likes: 0,
    likers: [],
    commentsList: [] as any[],
    npcId: npc.id,
    characterId: npc.boundCharacterId || undefined,
    source: 'manual-npc',
  };
  try {
    const { comments } = await spawnBatchCommentsForPost({ post, meName: meName(), settings: cfg });
    if (comments.length) post.commentsList = comments;
  } catch { /* best-effort */ }
  writePosts([post, ...readPosts()]);
  return '生成成功：NPC ' + npc.name + ' 发了一条朋友圈';
}
