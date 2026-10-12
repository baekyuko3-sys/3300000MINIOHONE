import { readPersistentState } from './usePersistentState';

export type GroupPresetKind = 'online' | 'offline';
export type GroupReplyMode = 'free' | 'all';

export interface GroupChatPreset {
  id: string;
  name: string;
  kind: GroupPresetKind;
  description: string;
  systemPrompt: string;
  /** Controls group turn participation, not a fixed speaker count. */
  replyMode?: GroupReplyMode;
  maxResponders: number;
  mentionPriority: boolean;
  createdAt: string;
  updatedAt: string;
}

const KEY = 'line:group-presets';
const now = '2026-10-04T00:00:00.000Z';

export const DEFAULT_GROUP_PRESETS: GroupChatPreset[] = [
  {
    id: 'online-natural',
    name: '自然闲聊',
    kind: 'online',
    description: '像微信/QQ群一样自然，有人说话、有人潜水，不强制全员回复。',
    systemPrompt: '保持真实群聊节奏。不要让所有成员轮流发言；根据关系、话题与性格决定谁接话。短句优先，可插话、吐槽、已读不回。',
    replyMode: 'free',
    maxResponders: 2,
    mentionPriority: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'online-active',
    name: '高活跃群',
    kind: 'online',
    description: '多人抢话、快速插话，适合朋友群和热闹日常。',
    systemPrompt: '这是一个活跃群聊。允许多人连续插话，但每个人仍必须保持独立性。偶尔出现短消息、表情、吐槽和话题跑偏。',
    replyMode: 'free',
    maxResponders: 3,
    mentionPriority: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'online-drama',
    name: '关系暗流',
    kind: 'online',
    description: '群聊表面正常，成员关系和潜台词更重要。',
    systemPrompt: '优先表现成员之间微妙关系、竞争、偏爱、误会与潜台词。不要把暗流写成长篇旁白，要藏在真实聊天语气里。',
    maxResponders: 2,
    mentionPriority: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'offline-gathering',
    name: '线下聚会',
    kind: 'offline',
    description: '多人线下活动，包含到场、动作、环境与多人对话。',
    systemPrompt: '这是多人线下剧情。场景应包含地点、时间、环境和角色动作；角色只能控制自己，不得替用户行动或发言。成员可以同时聊天，也可以分成小范围对话。',
    maxResponders: 3,
    mentionPriority: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'offline-party',
    name: '热闹聚餐',
    kind: 'offline',
    description: '饭局、生日、朋友聚餐，节奏轻快并允许多人抢话。',
    systemPrompt: '重点是多人同时存在的生活感：上菜、碰杯、抢话、笑声、小插曲。不要每个人都长篇说话，让角色自然打断、接话和沉默。',
    maxResponders: 3,
    mentionPriority: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'offline-conflict',
    name: '剧情冲突',
    kind: 'offline',
    description: '适合争执、秘密暴露、误会与关键剧情节点。',
    systemPrompt: '保持紧张但真实。角色可以发生冲突、沉默、离场或改变关系，但不要替用户做决定。重要信息应该通过角色行为与对话自然暴露。',
    maxResponders: 2,
    mentionPriority: true,
    createdAt: now,
    updatedAt: now,
  },
];

export function getGroupPresets(): GroupChatPreset[] {
  return readPersistentState<GroupChatPreset[]>(KEY, DEFAULT_GROUP_PRESETS);
}

export function getGroupPreset(id?: string | null, kind?: GroupPresetKind): GroupChatPreset {
  const presets = getGroupPresets();
  const match = id ? presets.find(item => item.id === id && (!kind || item.kind === kind)) : null;
  if (match) return match;
  return presets.find(item => !kind || item.kind === kind) || DEFAULT_GROUP_PRESETS[0];
}

export function upsertGroupPreset(preset: GroupChatPreset): void {
  if (typeof window === 'undefined') return;
  const presets = getGroupPresets();
  const next = presets.some(item => item.id === preset.id)
    ? presets.map(item => item.id === preset.id ? preset : item)
    : [preset, ...presets];
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function deleteGroupPreset(id: string): void {
  if (typeof window === 'undefined') return;
  const next = getGroupPresets().filter(item => item.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
}
