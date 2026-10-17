import { readPersistentState } from './usePersistentState';

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
