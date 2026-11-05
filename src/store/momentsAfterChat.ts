import type { ImportedCharacter } from '../data/characterImport';
import type { WorldBook } from '../types';
import { generateCreativeText, resolveChannelAiSettings } from '../ai/aiEngine';
import { filterWorldBooksForCharacter } from './worldbookRuntime';
import {
  MOMENTS_POSTS_KEY,
  isCharacterAllowedToPostMoments,
  listPostableNpcs,
  readMomentsSettings,
  spawnBatchCommentsForPost,
} from './momentsComments';
import { readPersistentState, reportPersistenceIssue } from './usePersistentState';
import type { SaneNpc } from './npcs';

function readPosts(): any[] {
  const saved = readPersistentState<unknown>(MOMENTS_POSTS_KEY, []);
  if (!Array.isArray(saved)) {
    reportPersistenceIssue('read:' + MOMENTS_POSTS_KEY, '朋友圈动态数据结构不是数组；已停止读取，避免后续保存覆盖原始数据', new Error('MOMENTS_POSTS_SCHEMA_INVALID'));
    return [];
  }
  return saved;
}
/**
 * 写帖子必须可验证：写失败（比如本地存储已满）时返回 false，
 * 调用方不得再报“生成成功/已发布”。写成功才发刷新事件。
 */
export function writePosts(posts: any[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const payload = JSON.stringify(posts.slice(0, 200));
    window.localStorage.setItem(MOMENTS_POSTS_KEY, payload);
    if (window.localStorage.getItem(MOMENTS_POSTS_KEY) !== payload) return false;
    window.dispatchEvent(new CustomEvent('sane333:moments-updated', { detail: { kind: 'refresh' } }));
    return true;
  } catch { return false; }
}

/**
 * 朋友圈生成专用：只读人设与相关世界书条目。
 * 取角色卡内嵌书 + 该角色相关的全局书（走角色相关性过滤），仅已启用条目，
 * 截断防提示词过长。聊天记录、长期记忆、日程一律不进。
 */
export function buildMomentWorldbookContext(character: ImportedCharacter | null | undefined): string {
  if (!character) return '';
  const embedded = (character as any).embeddedWorldBooks
    || ((character as any).embeddedWorldBook ? [(character as any).embeddedWorldBook] : []);
  const globals = readPersistentState<WorldBook[]>('phone:worldbooks', []);
  const scopedGlobals = filterWorldBooksForCharacter(Array.isArray(globals) ? globals : [], character);
  const books = [...(embedded as WorldBook[]), ...scopedGlobals];
  const seen = new Set<string>();
  const lines: string[] = [];
  let totalChars = 0;
  for (const book of books) {
    if (!book || !Array.isArray((book as any).entries)) continue;
    for (const entry of (book as any).entries) {
      if (!entry || entry.enabled === false) continue;
      const key = ((book as any).id || 'book:' + (book as any).name) + '::' + entry.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = '【' + (book as any).name + ' / ' + entry.name + '】\n' + (entry.content || '');
      if (!text.trim()) continue;
      if (lines.length >= 30 || totalChars + text.length > 6000) break;
      lines.push(text);
      totalChars += text.length;
    }
    if (lines.length >= 30 || totalChars >= 6000) break;
  }
  return lines.join('\n\n');
}

/** NPC 发朋友圈的世界书：走它绑定的角色（没有绑定角色就没有世界书）。 */
export function buildNpcMomentWorldbookContext(npc: SaneNpc | null | undefined): string {
  if (!npc?.boundCharacterId) return '';
  const chars = readPersistentState<ImportedCharacter[]>('phone:characters', []);
  const ch = (Array.isArray(chars) ? chars : []).find(c => c.id === npc.boundCharacterId);
  return buildMomentWorldbookContext(ch || null);
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

async function makeMomentText(character: ImportedCharacter): Promise<string> {
  const settings = resolveChannelAiSettings('moments');
  const worldbook = buildMomentWorldbookContext(character);
  const raw = await generateCreativeText({
    settings,
    systemPrompt: [
      '你是' + character.name + '，正在发一条自己的朋友圈。',
      '【角色人设】',
      (character.identity || ''),
      (character.description || ''),
      (character.personality || ''),
      (character.scenario || ''),
      worldbook ? '【相关世界书条目】\n' + worldbook : '',
      '只输出动态正文，像正常人随手发的朋友圈：口语、简短，一般一两句话，不要写成散文和小作文；说什么、什么语气要符合这个角色的性格和身份，不要写成统一的文艺腔，不要@用户，不要解释，不要自称AI。',
      '绝对不要输出【朋友圈配图：...】或[图片描述]之类的括号说明文字，直接写动态内容本身。',
    ].filter(Boolean).join('\n'),
    userPrompt: '按上面的人设和世界书，写一条今天的朋友圈动态。',
    temperature: (settings.temperature ?? 0.85),
  });
  // 兜底：去掉 AI 可能输出的配图描述括号
  return raw.trim().replace(/【朋友圈配图[：:][^】]*】/g, '').replace(/\[朋友圈配图[：:][^\]]*\]/g, '').trim();
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
  const text = await makeMomentText(opts.character);
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
  return writePosts([post, ...readPosts()]);
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
  if (!writePosts(next)) return '保存失败：本地存储空间不足，评论没有存下来';
  if (added) return '刷新成功：新增 ' + added + ' 条评论';
  if (failed) return '刷新完成，但有 ' + failed + ' 条评论生成失败（检查 AI 配置）';
  return '刷新完成：没有新评论（可能评论者已都出现过）';
}

async function makeNpcMomentText(npc: SaneNpc): Promise<string> {
  const settings = resolveChannelAiSettings('moments');
  const worldbook = buildNpcMomentWorldbookContext(npc);
  const raw = await generateCreativeText({
    settings,
    systemPrompt: [
      '你是' + npc.name + '，正在发一条自己的朋友圈。',
      '【人设】',
      '身份：' + (npc.identity || ''),
      '性格：' + (npc.personality || ''),
      '背景：' + (npc.background || ''),
      '近况：' + (npc.recentLife || ''),
      worldbook ? '【相关世界书条目】\n' + worldbook : '',
      '只输出动态正文，像正常人随手发的朋友圈：口语、简短，一般一两句话，不要写成散文和小作文；说什么、什么语气要符合这个NPC的性格和身份，不要写成统一的文艺腔，不要@用户，不要解释，不要自称AI/NPC。',
      '绝对不要输出【朋友圈配图：...】或[图片描述]之类的括号说明文字，直接写动态内容本身。',
    ].filter(Boolean).join('\n'),
    userPrompt: '按上面的人设和世界书，写一条今天的朋友圈动态。',
    temperature: (settings.temperature ?? 0.85),
  });
  // 兜底：去掉 AI 可能输出的配图描述括号
  return raw.trim().replace(/【朋友圈配图[：:][^】]*】/g, '').replace(/\[朋友圈配图[：:][^\]]*\]/g, '').trim();
}

/** 一键生成：随机挑一个允许发帖的角色或 NPC 发一条 */
export async function generateMomentNow(): Promise<string> {
  const cfg = readMomentsSettings();
  const savedCharacters = readPersistentState<unknown>('phone:characters', []);
  const chars = (Array.isArray(savedCharacters) ? savedCharacters : [])
    .filter((c: any) => c && typeof c.id === 'string' && isCharacterAllowedToPostMoments(c.id, cfg));
  const npcs = listPostableNpcs(cfg);
  if (!chars.length && !npcs.length) {
    return '没有允许发朋友圈的角色/NPC（去 VROOM 设置里勾选）';
  }
  const useNpc = npcs.length > 0 && (chars.length === 0 || Math.random() < 0.45);
  if (useNpc) {
    const npc = npcs[Math.floor(Math.random() * npcs.length)];
    let text = '';
    try {
      text = await makeNpcMomentText(npc);
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
    if (!writePosts([post, ...readPosts()])) return '保存失败：本地存储空间不足，帖子没有存下来';
    return '生成成功：NPC ' + npc.name + ' 发了一条朋友圈';
  }
  const ch = chars[Math.floor(Math.random() * chars.length)];
  let text = '';
  try {
    text = await makeMomentText(ch);
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
  if (!writePosts([post, ...readPosts()])) return '保存失败：本地存储空间不足，帖子没有存下来';
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
    text = await makeNpcMomentText(npc);
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
  if (!writePosts([post, ...readPosts()])) return '保存失败：本地存储空间不足，帖子没有存下来';
  return '生成成功：NPC ' + npc.name + ' 发了一条朋友圈';
}

/**
 * 群聊 → 朋友圈：一轮结束后，选一位本轮发言者，有感而发就发一条。
 * speakers: [{ kind: 'npc'|'character', npc?: SaneNpc, character?: ImportedCharacter, texts: string[] }]
 */
export async function maybePostGroupMomentAfterRound(opts: {
  speakers: Array<{
    kind: 'npc' | 'character';
    npc?: SaneNpc;
    character?: ImportedCharacter;
    texts: string[];
  }>;
  groupName: string;
  roundSummary: string;
  personaId?: string | null;
}): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!opts.speakers.length) return false;
  const cfg = readMomentsSettings();
  if (!cfg.allowCharacterAutoPost) return false;
  // 选本轮话最多的发言者
  const sorted = [...opts.speakers].sort((a, b) => b.texts.join('').length - a.texts.join('').length);
  const picked = sorted[0];
  const name = picked.kind === 'npc' ? picked.npc!.name : picked.character!.name;
  // 权限检查
  if (picked.kind === 'npc') {
    const postable = listPostableNpcs(cfg);
    if (!postable.some(n => n.id === picked.npc!.id)) return false;
  } else {
    if (!isCharacterAllowedToPostMoments(picked.character!.id, cfg)) return false;
  }
  const chatText = picked.texts.join('\n').slice(-400);
  // AI 判定：这轮有没有值得发朋友圈的点
  let yes = false;
  try {
    const settings = resolveChannelAiSettings('moments');
    const raw = await generateCreativeText({
      settings: { ...settings, maxOutputTokens: 8 },
      systemPrompt: '你是朋友圈判定器。只输出 YES 或 NO：角色刚在群聊「' + opts.groupName + '」里聊完这些，是否有值得发朋友圈的生活点（见闻/心情/趣事）？普通问答、干巴寒暄一律 NO。',
      userPrompt: name + '在群里说：\n' + chatText,
      temperature: 0.2,
    });
    yes = raw.trim().toUpperCase().startsWith('Y');
  } catch { return false; }
  if (!yes) return false;
  // 生成朋友圈正文
  let text = '';
  try {
    if (picked.kind === 'npc') {
      text = await makeNpcMomentText(picked.npc!);
    } else {
      text = await makeMomentText(picked.character!);
    }
  } catch { return false; }
  if (!text) return false;
  const post: any = {
    id: 'moment-group-' + Date.now().toString(36),
    name,
    text,
    time: '刚刚',
    tag: '#' + opts.groupName,
    liked: false, likes: 0, likers: [],
    commentsList: [] as any[],
    source: 'group-chat',
    groupName: opts.groupName,
  };
  if (picked.kind === 'npc') {
    post.npcId = picked.npc!.id;
    post.characterId = picked.npc!.boundCharacterId || undefined;
  } else {
    post.characterId = picked.character!.id;
  }
  try {
    const { comments } = await spawnBatchCommentsForPost({ post, meName: meName(), settings: cfg });
    if (comments.length) post.commentsList = comments;
  } catch { /* best-effort */ }
  if (!writePosts([post, ...readPosts()])) return false;
  // 注意：这里不再自动给作者开 VROOM 可见边——朋友圈只能出现加了好友的人，
  // 群成员不是好友时，联动帖子照常存下来，但不会进当前人设的 feed。
  return true;
}

/** 读最近 N 条朋友圈（给群聊 prompt 注入用） */
export function getRecentMomentsForGroup(count: number = 5): Array<{ name: string; text: string; time: string }> {
  try {
    return readPosts().slice(0, count).map((p: any) => ({
      name: String(p.name || '朋友'),
      text: String(p.text || '').slice(0, 120),
      time: String(p.time || ''),
    })).filter(p => p.text);
  } catch { return []; }
}
