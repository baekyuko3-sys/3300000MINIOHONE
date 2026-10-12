import type { ImportedCharacter } from '../data/characterImport';
import { generateCreativeText, resolveChannelAiSettings } from '../ai/aiEngine';
import { getNpcs, type SaneNpc } from './npcs';
import { readPersistentState } from './usePersistentState';

export const MOMENTS_SETTINGS_KEY = 'line:moments-settings';
export const MOMENTS_POSTS_KEY = 'line:moments-posts';

export type CommentSpawnMode = 'batch' | 'autonomous' | 'both';

export interface MomentsCommentSettings {
  enabledCharacterIds: string[];
  allowCharacterAutoPost: boolean;
  aiPolishTextCard: boolean;
  allowCharacterComment: boolean;
  allowCharacterMentionMe: boolean;
  allowNpcComment: boolean;
  commentSpawnMode: CommentSpawnMode;
  batchCommentCount: number;
  instantReplyOnCommentReply: boolean;
  instantReplyOnPostComment: boolean;
}

export const DEFAULT_MOMENTS_SETTINGS: MomentsCommentSettings = {
  enabledCharacterIds: [],
  allowCharacterAutoPost: true,
  aiPolishTextCard: false,
  allowCharacterComment: true,
  allowCharacterMentionMe: true,
  allowNpcComment: true,
  commentSpawnMode: 'both',
  batchCommentCount: 2,
  instantReplyOnCommentReply: true,
  instantReplyOnPostComment: false,
};

export function readMomentsSettings(): MomentsCommentSettings {
  const raw = readPersistentState<Partial<MomentsCommentSettings>>(MOMENTS_SETTINGS_KEY, {});
  const mode = raw.commentSpawnMode;
  const count = Number(raw.batchCommentCount);
  return {
    ...DEFAULT_MOMENTS_SETTINGS,
    ...raw,
    enabledCharacterIds: Array.isArray(raw.enabledCharacterIds) ? raw.enabledCharacterIds : [],
    allowCharacterAutoPost: raw.allowCharacterAutoPost !== false,
    aiPolishTextCard: !!raw.aiPolishTextCard,
    allowCharacterComment: raw.allowCharacterComment !== false,
    allowCharacterMentionMe: raw.allowCharacterMentionMe !== false,
    allowNpcComment: raw.allowNpcComment !== false,
    commentSpawnMode: mode === 'batch' || mode === 'autonomous' || mode === 'both' ? mode : 'both',
    batchCommentCount: Number.isFinite(count) ? Math.min(5, Math.max(1, Math.round(count))) : 2,
    instantReplyOnCommentReply: raw.instantReplyOnCommentReply !== false,
    instantReplyOnPostComment: !!raw.instantReplyOnPostComment,
  };
}

export type MomentComment = {
  id?: string;
  user: string;
  text: string;
  time?: string;
  replyTo?: string;
  replies?: MomentComment[];
  kind?: 'character' | 'npc' | 'user';
  characterId?: string;
  npcId?: string;
};

export function normalizeMomentComments(list: unknown): MomentComment[] {
  if (!Array.isArray(list)) return [];
  return list.map((raw, idx) => {
    const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const kind: MomentComment['kind'] =
      c.kind === 'character' || c.kind === 'npc' || c.kind === 'user' ? c.kind : undefined;
    return {
      id: String(c.id || `legacy-${idx}`),
      user: String(c.user || '朋友').trim() || '朋友',
      text: String(c.text || '').trim(),
      time: c.time ? String(c.time) : undefined,
      replyTo: c.replyTo ? String(c.replyTo) : undefined,
      replies: normalizeMomentComments(c.replies),
      kind,
      characterId: c.characterId ? String(c.characterId) : undefined,
      npcId: c.npcId ? String(c.npcId) : undefined,
    };
  }).filter(c => c.text);
}

export function countMomentComments(list: MomentComment[]): number {
  let n = 0;
  const walk = (arr: MomentComment[]) => {
    for (const c of arr) {
      n += 1;
      if (c.replies?.length) walk(c.replies);
    }
  };
  walk(list);
  return n;
}

export function flattenMomentComments(list: MomentComment[]): MomentComment[] {
  const out: MomentComment[] = [];
  const walk = (arr: MomentComment[]) => {
    for (const c of arr) {
      out.push(c);
      if (c.replies?.length) walk(c.replies);
    }
  };
  walk(list);
  return out;
}

export function appendMomentComment(
  list: MomentComment[],
  comment: MomentComment,
  parentId?: string | null,
): MomentComment[] {
  if (!parentId) return [...list, comment];
  const walk = (arr: MomentComment[]): MomentComment[] =>
    arr.map((c) => {
      if (c.id === parentId) {
        return { ...c, replies: [...(c.replies || []), comment] };
      }
      if (c.replies?.length) return { ...c, replies: walk(c.replies) };
      return c;
    });
  const next = walk(list);
  const found = flattenMomentComments(list).some(c => c.id === parentId);
  return found ? next : [...list, comment];
}

type Commenter =
  | { kind: 'character'; character: ImportedCharacter }
  | { kind: 'npc'; npc: SaneNpc };

function readImportedCharacters(): ImportedCharacter[] {
  return readPersistentState<ImportedCharacter[]>('phone:characters', []);
}

function pickCommenters(
  settings: MomentsCommentSettings,
  excludeCharacterId?: string | null,
  excludeNames: string[] = [],
): Commenter[] {
  const out: Commenter[] = [];
  const nameSet = new Set(excludeNames.map(n => n.trim()).filter(Boolean));

  if (settings.allowCharacterComment) {
    const all = readImportedCharacters();
    const allowed = settings.enabledCharacterIds.length === 0
      ? all
      : all.filter(c => settings.enabledCharacterIds.includes(c.id));
    for (const character of allowed) {
      if (excludeCharacterId && character.id === excludeCharacterId) continue;
      if (nameSet.has(character.name)) continue;
      out.push({ kind: 'character', character });
    }
  }

  if (settings.allowNpcComment) {
    for (const npc of getNpcs()) {
      if (!npc.active || !npc.canCommentMoments) continue;
      if (nameSet.has(npc.name)) continue;
      out.push({ kind: 'npc', npc });
    }
  }

  return out;
}

function shufflePick<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}

function commenterName(c: Commenter): string {
  return c.kind === 'character' ? c.character.name : c.npc.name;
}

function commenterPromptBlock(c: Commenter): string {
  if (c.kind === 'character') {
    const ch = c.character;
    return [
      '【评论者】角色 ' + ch.name,
      ch.description || '',
      ch.personality || '',
      ch.scenario || '',
    ].filter(Boolean).join('\n');
  }
  const n = c.npc;
  return [
    '【评论者】NPC ' + n.name,
    '身份：' + n.identity,
    '性格：' + n.personality,
    '背景：' + n.background,
    '关系：' + n.relationship,
  ].join('\n');
}

function makeCommentId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function generateOneCommentText(opts: {
  commenter: Commenter;
  postAuthor: string;
  postText: string;
  meName: string;
  allowMentionMe: boolean;
  replyToUser?: string;
  replyContext?: string;
}): Promise<string> {
  const settings = resolveChannelAiSettings('moments');
  const mentionHint = opts.allowMentionMe
    ? `可以自然地 @${opts.meName}（当前用户身份），也可以不艾特；不要硬塞。`
    : `不要艾特用户（不要写 @${opts.meName}）。`;
  const replyHint = opts.replyToUser
    ? `你在回复「${opts.replyToUser}」刚才说的话。对方说：${opts.replyContext || ''}。用一句自然的中文回一句，像朋友圈楼下闲聊。`
    : '写一条对这条动态的自然评论，最多 60 个中文字。';

  const raw = await generateCreativeText({
    settings,
    systemPrompt: [
      '你正在一个私人虚拟手机的朋友圈里写评论。',
      '只输出评论正文，不要引号、不要解释、不要自称 AI/NPC。',
      mentionHint,
      commenterPromptBlock(opts.commenter),
    ].join('\n'),
    userPrompt: [
      '【动态作者】' + opts.postAuthor,
      '【动态内容】' + (opts.postText || '（无文字）'),
      replyHint,
    ].join('\n'),
    temperature: Math.min(0.98, (settings.temperature ?? 0.85) + 0.05),
  });
  return raw.trim().replace(/^['"“”]|['"“”]$/g, '');
}

function toMomentComment(commenter: Commenter, text: string, replyTo?: string): MomentComment {
  if (commenter.kind === 'character') {
    return {
      id: makeCommentId('c-char'),
      user: commenter.character.name,
      text,
      time: '刚刚',
      replyTo,
      replies: [],
      kind: 'character',
      characterId: commenter.character.id,
    };
  }
  return {
    id: makeCommentId('c-npc'),
    user: commenter.npc.name,
    text,
    time: '刚刚',
    replyTo,
    replies: [],
    kind: 'npc',
    npcId: commenter.npc.id,
  };
}

function normalizeSettings(partial?: Partial<MomentsCommentSettings> | null): MomentsCommentSettings {
  if (!partial) return readMomentsSettings();
  return {
    ...DEFAULT_MOMENTS_SETTINGS,
    ...partial,
    enabledCharacterIds: Array.isArray(partial.enabledCharacterIds)
      ? partial.enabledCharacterIds
      : DEFAULT_MOMENTS_SETTINGS.enabledCharacterIds,
    commentSpawnMode:
      partial.commentSpawnMode === 'batch' || partial.commentSpawnMode === 'autonomous' || partial.commentSpawnMode === 'both'
        ? partial.commentSpawnMode
        : DEFAULT_MOMENTS_SETTINGS.commentSpawnMode,
    batchCommentCount: (() => {
      const n = Number(partial.batchCommentCount);
      return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : DEFAULT_MOMENTS_SETTINGS.batchCommentCount;
    })(),
  };
}

export function shouldBatchSpawn(settings?: Partial<MomentsCommentSettings>): boolean {
  const s = normalizeSettings(settings);
  return s.commentSpawnMode === 'batch' || s.commentSpawnMode === 'both';
}

export function shouldAutonomousSpawn(settings?: Partial<MomentsCommentSettings>): boolean {
  const s = normalizeSettings(settings);
  return s.commentSpawnMode === 'autonomous' || s.commentSpawnMode === 'both';
}

/** 发帖后批量生成评论（失败返回空数组，不抛） */
export async function spawnBatchCommentsForPost(opts: {
  post: { id: string; name?: string; text?: string; characterId?: string };
  meName: string;
  settings?: Partial<MomentsCommentSettings>;
}): Promise<{ comments: MomentComment[]; skippedReason?: string }> {
  const settings = normalizeSettings(opts.settings);
  if (!shouldBatchSpawn(settings)) return { comments: [] };
  if (!settings.allowCharacterComment && !settings.allowNpcComment) {
    return { comments: [], skippedReason: '已关闭角色/NPC 评论' };
  }

  const pool = pickCommenters(settings, opts.post.characterId, [opts.post.name || '']);
  if (!pool.length) {
    return { comments: [], skippedReason: '没有可评论的角色或 NPC' };
  }

  const picked = shufflePick(pool, settings.batchCommentCount);
  const comments: MomentComment[] = [];
  for (const commenter of picked) {
    try {
      const text = await generateOneCommentText({
        commenter,
        postAuthor: opts.post.name || '朋友',
        postText: opts.post.text || '',
        meName: opts.meName,
        allowMentionMe: settings.allowCharacterMentionMe,
      });
      if (text) comments.push(toMomentComment(commenter, text));
    } catch {
      // skip failed individual commenter
    }
  }
  return { comments };
}

/** 立刻回敬：被回复者（角色/NPC）或帖子作者回一条 */
export async function spawnInstantReply(opts: {
  post: { id: string; name?: string; text?: string; characterId?: string };
  meName: string;
  /** 用户刚发的评论 */
  userComment: MomentComment;
  /** 若是回复某条评论，传入该条（楼中楼） */
  parentComment?: MomentComment | null;
  settings?: Partial<MomentsCommentSettings>;
}): Promise<MomentComment | null> {
  const settings = normalizeSettings(opts.settings);
  const isNested = Boolean(opts.parentComment);

  if (isNested) {
    if (!settings.instantReplyOnCommentReply) return null;
    const parent = opts.parentComment!;
    let commenter: Commenter | null = null;
    if (parent.characterId) {
      const character = readImportedCharacters().find(c => c.id === parent.characterId);
      if (character) commenter = { kind: 'character', character };
    } else if (parent.npcId) {
      const npc = getNpcs().find(n => n.id === parent.npcId);
      if (npc) commenter = { kind: 'npc', npc };
    } else if (parent.kind === 'character' || parent.kind === 'npc') {
      // legacy without ids: match by name
      const byChar = readImportedCharacters().find(c => c.name === parent.user);
      if (byChar) commenter = { kind: 'character', character: byChar };
      else {
        const byNpc = getNpcs().find(n => n.name === parent.user);
        if (byNpc) commenter = { kind: 'npc', npc: byNpc };
      }
    }
    if (!commenter) return null;
    if (commenter.kind === 'character' && !settings.allowCharacterComment) return null;
    if (commenter.kind === 'npc' && !settings.allowNpcComment) return null;

    try {
      const text = await generateOneCommentText({
        commenter,
        postAuthor: opts.post.name || '朋友',
        postText: opts.post.text || '',
        meName: opts.meName,
        allowMentionMe: settings.allowCharacterMentionMe,
        replyToUser: opts.meName,
        replyContext: opts.userComment.text,
      });
      if (!text) return null;
      return toMomentComment(commenter, text, opts.meName);
    } catch {
      return null;
    }
  }

  // 顶层新评：作者回敬
  if (!settings.instantReplyOnPostComment) return null;
  if (!opts.post.characterId && !settings.allowCharacterComment && !settings.allowNpcComment) return null;

  let authorCommenter: Commenter | null = null;
  if (opts.post.characterId) {
    const character = readImportedCharacters().find(c => c.id === opts.post.characterId);
    if (character && settings.allowCharacterComment) {
      authorCommenter = { kind: 'character', character };
    }
  }
  if (!authorCommenter && opts.post.name) {
    const character = readImportedCharacters().find(c => c.name === opts.post.name);
    if (character && settings.allowCharacterComment) {
      authorCommenter = { kind: 'character', character };
    } else if (settings.allowNpcComment) {
      const npc = getNpcs().find(n => n.name === opts.post.name && n.active && n.canCommentMoments);
      if (npc) authorCommenter = { kind: 'npc', npc };
    }
  }
  if (!authorCommenter) return null;

  try {
    const text = await generateOneCommentText({
      commenter: authorCommenter,
      postAuthor: opts.post.name || '朋友',
      postText: opts.post.text || '',
      meName: opts.meName,
      allowMentionMe: settings.allowCharacterMentionMe,
      replyToUser: opts.meName,
      replyContext: opts.userComment.text,
    });
    if (!text) return null;
    return toMomentComment(authorCommenter, text, opts.meName);
  } catch {
    return null;
  }
}

const AUTONOMOUS_COMMENT_STATE_KEY = 'phone:moments-autonomous-comment';

/**
 * 自主评论：挑一条近期动态，让角色/NPC 留一条。
 * 直接读写 localStorage 的 line:moments-posts，并派发更新事件。
 */
export async function tryAutonomousMomentComment(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const settings = readMomentsSettings();
  if (!shouldAutonomousSpawn(settings)) return false;
  if (!settings.allowCharacterComment && !settings.allowNpcComment) return false;

  const state = readPersistentState<{ lastAt?: string }>(AUTONOMOUS_COMMENT_STATE_KEY, {});
  const lastAt = state.lastAt ? Date.parse(state.lastAt) : 0;
  const cooldownMs = 8 * 60 * 1000;
  if (lastAt && Date.now() - lastAt < cooldownMs) return false;

  const posts = readPersistentState<any[]>(MOMENTS_POSTS_KEY, []);
  if (!posts.length) return false;

  // Prefer recent posts that aren't already flooded
  const candidates = posts.slice(0, 12).filter(p => {
    const tree = normalizeMomentComments(p.commentsList);
    return countMomentComments(tree) < 12;
  });
  if (!candidates.length) return false;
  const post = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];

  const existingNames = flattenMomentComments(normalizeMomentComments(post.commentsList)).map(c => c.user);
  const pool = pickCommenters(settings, post.characterId, [post.name || '', ...existingNames]);
  if (!pool.length) return false;

  const commenter = shufflePick(pool, 1)[0];
  if (!commenter) return false;

  const meName =
    readPersistentState<{ name?: string }>('line:current-user', {}).name ||
    '我';
  const activePersonaId = readPersistentState<string | null>('line:active-persona', null);
  const personas = readPersistentState<Array<{ id: string; name?: string }>>('line:user-personas', []);
  const persona = personas.find(p => p.id === activePersonaId);
  const displayMe = (persona?.name || meName || '我').trim() || '我';

  try {
    const text = await generateOneCommentText({
      commenter,
      postAuthor: post.name || '朋友',
      postText: post.text || '',
      meName: displayMe,
      allowMentionMe: settings.allowCharacterMentionMe,
    });
    if (!text) return false;
    const comment = toMomentComment(commenter, text);
    const nextPosts = posts.map(p => {
      if (p.id !== post.id) return p;
      const tree = normalizeMomentComments(p.commentsList);
      return { ...p, commentsList: appendMomentComment(tree, comment) };
    });
    window.localStorage.setItem(MOMENTS_POSTS_KEY, JSON.stringify(nextPosts.slice(0, 200)));
    window.localStorage.setItem(AUTONOMOUS_COMMENT_STATE_KEY, JSON.stringify({ lastAt: new Date().toISOString() }));
    window.dispatchEvent(new CustomEvent('sane333:moments-updated', {
      detail: { postId: post.id, commenter: commenterName(commenter), kind: 'autonomous-comment' },
    }));
    return true;
  } catch {
    return false;
  }
}
