import { readPersistentState } from './usePersistentState';
import { removeLineConversationData } from './lineRuntime';

export interface SaneNpc {
  id: string;
  name: string;
  gender?: string;
  age?: string;
  identity: string;
  appearance?: string;
  personality: string;
  background: string;
  relationship: string;
  relationshipCategory?: 'family' | 'friend' | 'coworker' | 'other';
  /** NPC 与「我的人设」的关系（一句话）；空 = 未设定，保持旧行为 */
  relationToMe?: string;
  /** 写 relationToMe 时对应的人设名；用于人设切换后失效提示 */
  relationToMeName?: string;
  worldBookIds?: string[];
  worldBookNames?: string[];
  settingSource: 'project' | 'worldbook' | 'character' | 'manual';
  boundCharacterId: string;
  boundCharacterName: string;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  tags: string[];
  avatar?: string;
  /** 主页个性签名 */
  statusMessage?: string;
  /** MiniMax 语音预设 ID */
  voicePresetId?: string;
  /** IG 正在听的音乐 */
  currentTrack?: { title: string; artist: string } | null;
  /** 主页简介 */
  bio?: string;
  /** 兴趣标签 */
  interests?: string[];
  /** 近况 / 最近在忙什么 */
  recentLife?: string;
  createdAt: string;
  updatedAt: string;
  memory?: string;
  active: boolean;
  /** 是否允许在 VROOM 评论 */
  canCommentMoments: boolean;
  /** 是否允许在 VROOM 发朋友圈；默认 true */
  canPostMoments?: boolean;
}

const KEY = 'phone:npcs';

export function getNpcs(): SaneNpc[] {
  const saved = readPersistentState<Partial<SaneNpc>[]>(KEY, []);
  return saved
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      ...item,
      boundCharacterId: item.boundCharacterId || item.sourceCharacterId || '',
      boundCharacterName: item.boundCharacterName || item.sourceCharacterName || '',
      active: item.active !== false,
      canCommentMoments: item.canCommentMoments !== false,
      canPostMoments: item.canPostMoments !== false,
      tags: Array.isArray(item.tags) ? item.tags : [],
      interests: Array.isArray(item.interests) ? item.interests.filter((v): v is string => typeof v === 'string') : [],
      settingSource: item.settingSource || 'character',
    }) as SaneNpc)
    .filter(item => Boolean(item.name));
}

export function upsertNpc(npc: SaneNpc): void {
  if (typeof window === 'undefined') return;
  const all = getNpcs();
  const next = all.some(item => item.id === npc.id)
    ? all.map(item => item.id === npc.id ? npc : item)
    : [npc, ...all];
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function deleteNpc(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(getNpcs().filter(item => item.id !== id)));
}

/** 删除 NPC 后清理各处引用，避免群聊/好友列表里留下幽灵成员 */
export function removeNpcReferences(npcId: string): void {
  if (typeof window === 'undefined' || !npcId) return;
  const broadcastKey = (key: string) => {
    try { window.dispatchEvent(new CustomEvent('sane333:storage-changed', { detail: { key } })); } catch { /* ignore */ }
  };

  // Group cleanup is isolated: corrupt group data must not block friend/chat cleanup.
  try {
    const raw = window.localStorage.getItem('line:groups');
    if (raw !== null) {
      const groups = JSON.parse(raw);
      if (!Array.isArray(groups)) throw new Error('LINE_GROUPS_STORAGE_INVALID');
      const next = groups.flatMap((group: any) => {
        if (!group || typeof group !== 'object') return [group];
        const members = Array.isArray(group.members) ? group.members : [];
        const filtered = members.filter((member: any) => member?.npcId !== npcId && !(member?.kind === 'npc' && member?.id === npcId));
        const changed = filtered.length !== members.length;
        const relationships = Array.isArray(group.relationships)
          ? group.relationships.filter((edge: any) => edge && String(edge.from) !== npcId && String(edge.to) !== npcId)
          : group.relationships;
        const edgesChanged = Array.isArray(group.relationships) && relationships.length !== group.relationships.length;
        const ownerRemoved = String(group.ownerId || '') === npcId;
        if (!changed && !edgesChanged && !ownerRemoved) return [group];
        if (!filtered.length) return [];
        return [{
          ...group,
          members: filtered,
          ownerId: ownerRemoved ? String(filtered[0]?.id || filtered[0]?.npcId || '') : group.ownerId,
          relationships,
          updatedAt: new Date().toISOString(),
        }];
      });
      if (JSON.stringify(next) !== JSON.stringify(groups)) {
        window.localStorage.setItem('line:groups', JSON.stringify(next));
        broadcastKey('line:groups');
      }
    }
  } catch (error) {
    console.error('[NPC deletion] Group cleanup failed; original group data retained', error);
  }

  // Friends cleanup has its own transaction boundary.
  try {
    const raw = window.localStorage.getItem('line:friends-list');
    if (raw !== null) {
      const friends = JSON.parse(raw);
      if (!Array.isArray(friends)) throw new Error('LINE_FRIENDS_STORAGE_INVALID');
      const next = friends.filter((friend: any) => friend?.npcId !== npcId);
      if (next.length !== friends.length) {
        window.localStorage.setItem('line:friends-list', JSON.stringify(next));
        broadcastKey('line:friends-list');
      }
    }
  } catch (error) {
    console.error('[NPC deletion] Friend cleanup failed; original friend data retained', error);
  }

  // Remove every persona-specific NPC chat, its transcript/settings, and notifications.
  try {
    const raw = window.localStorage.getItem('line:chat-items');
    if (raw !== null) {
      const chats = JSON.parse(raw);
      if (!Array.isArray(chats)) throw new Error('LINE_CHAT_ITEMS_INVALID');
      const targets = chats.filter((chat: any) => chat?.npcId === npcId && typeof chat.id === 'string');
      for (const chat of targets) removeLineConversationData(chat.id);
      const next = chats.filter((chat: any) => chat?.npcId !== npcId);
      if (next.length !== chats.length) {
        window.localStorage.setItem('line:chat-items', JSON.stringify(next));
        broadcastKey('line:chat-items');
      }
    }
  } catch (error) {
    console.error('[NPC deletion] Conversation cleanup failed; original data retained where possible', error);
  }
}

export function unbindNpcCharacterReferences(characterId: string): number {
  if (typeof window === 'undefined' || !characterId) return 0;
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return 0;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('NPC_STORAGE_INVALID');
  let changed = 0;
  const next = parsed.map((npc: any) => {
    if (!npc || typeof npc !== 'object') return npc;
    const patch: Record<string, unknown> = {};
    if (String(npc.boundCharacterId || '') === characterId) {
      patch.boundCharacterId = '';
      patch.boundCharacterName = '';
    }
    if (String(npc.sourceCharacterId || '') === characterId) {
      patch.sourceCharacterId = null;
      patch.sourceCharacterName = null;
    }
    if (!Object.keys(patch).length) return npc;
    changed += 1;
    return { ...npc, ...patch, updatedAt: new Date().toISOString() };
  });
  if (changed) {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sane333:storage-changed', { detail: { key: KEY } }));
  }
  return changed;
}

export function updateNpc(id: string, patch: Partial<SaneNpc>): void {
  const npc = getNpcs().find(item => item.id === id);
  if (!npc) return;
  upsertNpc({ ...npc, ...patch, updatedAt: new Date().toISOString() });
}

/** 当前「我的人设」（LINE  persona），NPC 的 relationToMe 相对它而言 */
export function getActivePersona(): { id: string; name: string; setting?: string } | null {
  const personas = readPersistentState<Array<{ id: string; name?: string; setting?: string; isDefault?: boolean }>>('line:user-personas', []);
  const activeId = readPersistentState<string | null>('line:active-persona', null);
  const found = personas.find(p => p.id === activeId) || personas.find(p => p.isDefault) || personas[0];
  if (!found) {
    const legacy = readPersistentState<{ name?: string }>('line:current-user', {});
    return legacy.name ? { id: 'legacy', name: legacy.name } : null;
  }
  return { id: found.id, name: (found.name || '我').trim() || '我', setting: found.setting };
}

/** NPC 对当前人设的关系文本；人设切换后若名字对不上则返回空（避免张冠李戴） */
export function getNpcRelationToMe(npc: Pick<SaneNpc, 'relationToMe' | 'relationToMeName'>): string {
  const text = String(npc.relationToMe || '').trim();
  if (!text) return '';
  if (!npc.relationToMeName) return text;
  const persona = getActivePersona();
  if (!persona) return text;
  return npc.relationToMeName === persona.name ? text : '';
}
