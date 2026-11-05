import { generateCreativeText, resolveChannelAiSettings } from '../ai/aiEngine';
import { buildNpcRuntimeContext } from './npcContext';
import { reportPersistenceIssue } from './usePersistentState';
import type { SaneNpc } from './npcs';

export type NpcFriendRequestSource = 'group-chat' | 'vroom' | 'npc-initiative' | 'user-initiated';
export type NpcFriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export interface NpcFriendRequest {
  id: string;
  npcId: string;
  npcName: string;
  personaId: string;
  source: NpcFriendRequestSource;
  sourceLabel: string;
  message: string;
  status: NpcFriendRequestStatus;
  createdAt: string;
  updatedAt: string;
}

const REQUESTS_KEY = 'line:npc-friend-requests';
const FRIENDSHIP_KEY = 'line:npc-friendships';

const blockedNpcSocialKeys = new Set<string>();

function readNpcSocialArray<T>(key: string): T[] | null {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) { blockedNpcSocialKeys.delete(key); return []; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('NPC_SOCIAL_SCHEMA_INVALID');
    blockedNpcSocialKeys.delete(key);
    return parsed as T[];
  } catch (error) {
    blockedNpcSocialKeys.add(key);
    reportPersistenceIssue('read:' + key, 'NPC 社交数据损坏或格式不符；已锁定写入以保留好友关系和申请记录', error);
    return null;
  }
}

export function getNpcFriendRequests(): NpcFriendRequest[] {
  const raw = readNpcSocialArray<Partial<NpcFriendRequest>>(REQUESTS_KEY);
  if (!raw) return [];
  return raw.filter(item => item && typeof item.id === 'string' && typeof item.npcId === 'string')
    .map(item => ({ ...item, status: item.status || 'pending' } as NpcFriendRequest));
}

function saveRequests(items: NpcFriendRequest[]): boolean {
  if (typeof window === 'undefined' || blockedNpcSocialKeys.has(REQUESTS_KEY)) return false;
  try {
    const existingRaw = window.localStorage.getItem(REQUESTS_KEY);
    if (existingRaw !== null && !Array.isArray(JSON.parse(existingRaw))) throw new Error('NPC_FRIEND_REQUEST_SCHEMA_INVALID');
    const serialized = JSON.stringify(items.slice(0, 200));
    window.localStorage.setItem(REQUESTS_KEY, serialized);
    if (window.localStorage.getItem(REQUESTS_KEY) !== serialized) throw new Error('NPC_FRIEND_REQUEST_PERSISTENCE_MISMATCH');
    window.dispatchEvent(new CustomEvent('sane333:npc-friend-requests-updated'));
    return true;
  } catch (error) {
    blockedNpcSocialKeys.add(REQUESTS_KEY);
    reportPersistenceIssue('write:' + REQUESTS_KEY, 'NPC 好友申请写入失败；原始申请记录已保留', error);
    return false;
  }
}

/** NPC 可以表达想认识用户，但这里只创建申请，不会偷偷把 NPC 加成好友。 */
export function createNpcFriendRequest(input: {
  npc: Pick<SaneNpc, 'id' | 'name' | 'active'>;
  personaId: string;
  source: NpcFriendRequestSource;
  sourceLabel: string;
  message: string;
}): NpcFriendRequest | null {
  if (typeof window === 'undefined' || !input.npc.active || !input.personaId) return null;
  // Friendship is persona-scoped. Never enqueue another request once the pair is already friends.
  if (hasNpcFriendship(input.npc.id, input.personaId)) return null;
  const requests = getNpcFriendRequests();
  const matching = requests.filter(item => item.npcId === input.npc.id && item.personaId === input.personaId);
  const pending = matching.find(item => item.status === 'pending');
  if (pending) return pending;
  const recent = matching.find(item => {
    const createdAt = Date.parse(item.createdAt || item.updatedAt || '');
    return Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt < 7 * 86400000;
  });
  if (recent) return null;
  const now = new Date().toISOString();
  const request: NpcFriendRequest = {
    id: 'npc-request-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    npcId: input.npc.id,
    npcName: input.npc.name,
    personaId: input.personaId,
    source: input.source,
    sourceLabel: input.sourceLabel,
    message: input.message.trim().slice(0, 500),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  try {
    if (!saveRequests([request, ...requests])) return null;
    return request;
  } catch (error) {
    reportPersistenceIssue('npc-friend-request-create', 'NPC 好友申请保存失败；未向界面报告申请已创建', error);
    return null;
  }
}

export function respondToNpcFriendRequest(id: string, status: 'accepted' | 'declined'): NpcFriendRequest | null {
  if (typeof window === 'undefined') return null;
  const requests = getNpcFriendRequests();
  const current = requests.find(item => item.id === id && item.status === 'pending');
  if (!current) return null;

  const requestKeyBefore = window.localStorage.getItem(REQUESTS_KEY);
  const friendshipKeyBefore = window.localStorage.getItem(FRIENDSHIP_KEY);
  const next = { ...current, status, updatedAt: new Date().toISOString() } as NpcFriendRequest;
  try {
    if (status === 'accepted') {
      const links = readNpcSocialArray<{ npcId: string; personaId: string }>(FRIENDSHIP_KEY);
      if (!links) throw new Error('NPC_FRIENDSHIPS_UNAVAILABLE');
      const unique = links.filter(item => !(item.npcId === current.npcId && item.personaId === current.personaId));
      unique.push({ npcId: current.npcId, personaId: current.personaId });
      // Persist the friendship and request status as one guarded operation.
      // If either write fails, restore both prior values to avoid a half-accepted request.
      const serializedFriendships = JSON.stringify(unique);
      window.localStorage.setItem(FRIENDSHIP_KEY, serializedFriendships);
      if (window.localStorage.getItem(FRIENDSHIP_KEY) !== serializedFriendships) {
        throw new Error('NPC_FRIENDSHIP_PERSISTENCE_MISMATCH');
      }
    }
    if (!saveRequests(requests.map(item => item.id === id ? next : item))) throw new Error('NPC_FRIEND_REQUEST_SAVE_FAILED');
    const persistedRequest = getNpcFriendRequests().find(item => item.id === id);
    if (!persistedRequest || persistedRequest.status !== status) {
      throw new Error('NPC_FRIEND_REQUEST_STATUS_PERSISTENCE_MISMATCH');
    }
    if (status === 'accepted' && !hasNpcFriendship(current.npcId, current.personaId)) {
      throw new Error('NPC_FRIENDSHIP_PERSISTENCE_MISMATCH');
    }
    return next;
  } catch (error) {
    try {
      if (requestKeyBefore === null) window.localStorage.removeItem(REQUESTS_KEY);
      else window.localStorage.setItem(REQUESTS_KEY, requestKeyBefore);
      if (friendshipKeyBefore === null) window.localStorage.removeItem(FRIENDSHIP_KEY);
      else window.localStorage.setItem(FRIENDSHIP_KEY, friendshipKeyBefore);
    } catch (rollbackError) {
      reportPersistenceIssue('npc-friend-request-rollback', '好友申请状态回滚失败；请保留本地数据并检查存储空间', rollbackError);
    }
    reportPersistenceIssue('npc-friend-request-response', '好友申请处理失败，已尝试恢复原状态', error);
    throw error;
  }
}

export function hasNpcFriendship(npcId: string, personaId: string): boolean {
  const links = readNpcSocialArray<{ npcId: string; personaId: string }>(FRIENDSHIP_KEY);
  // Fail closed: unknown friendship state must not be treated as proof that no friendship exists.
  if (!links) return true;
  return links.some(item => item.npcId === npcId && item.personaId === personaId);
}

export function setNpcFriendship(npcId: string, personaId: string, enabled: boolean): boolean {
  if (typeof window === 'undefined' || !npcId || !personaId) return false;
  const links = readNpcSocialArray<{ npcId: string; personaId: string }>(FRIENDSHIP_KEY);
  if (!links || blockedNpcSocialKeys.has(FRIENDSHIP_KEY)) return false;
  const next = links.filter(item => !(item.npcId === npcId && item.personaId === personaId));
  if (enabled) next.push({ npcId, personaId });
  try {
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(FRIENDSHIP_KEY, serialized);
    if (window.localStorage.getItem(FRIENDSHIP_KEY) !== serialized) throw new Error('NPC_FRIENDSHIP_PERSISTENCE_MISMATCH');
    return true;
  } catch (error) {
    reportPersistenceIssue('npc-friendship-write', 'NPC 好友关系写入失败；更改可能尚未保存', error);
    throw error;
  }
}

/** Ask the model whether a specific social event plausibly makes the NPC want to add this persona. Cooldowns prevent repetitive requests. */
export async function considerNpcFriendRequest(input: {
  npc: SaneNpc;
  personaId: string;
  personaName: string;
  source: Exclude<NpcFriendRequestSource, 'user-initiated'>;
  sourceLabel: string;
  eventContext: string;
}): Promise<NpcFriendRequest | null> {
  if (!canNpcConsiderFriendRequest(input.npc.id, input.personaId)) return null;
  if (!input.npc.active) return null;
  try {
    const settings = resolveChannelAiSettings('moments');
    const result = await generateCreativeText({
      settings: { ...settings, maxOutputTokens: 80 },
      systemPrompt: [
        '你在判断一个独立 NPC 是否会自然地想添加某人为 LINE 好友。',
        buildNpcRuntimeContext(input.npc, 'online-chat', input.personaId),
        '只输出 JSON：{"wantsToAdd":true或false,"message":"申请附言"}。',
        '判断必须符合 NPC 自己的性格、关系、记忆与事件。不要为了推动剧情而强行想加好友。',
        '刚见过一面、普通寒暄、没有兴趣或信任基础时通常为 false。已经是好友或最近申请过则不要申请。',
      ].join('\n\n'),
      userPrompt: '目标用户人设：' + input.personaName + '\n事件来源：' + input.sourceLabel + '\n事件经过：' + input.eventContext.slice(-2200),
      temperature: 0.35,
    });
    const json = result.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as { wantsToAdd?: boolean; message?: string };
    if (parsed.wantsToAdd !== true) return null;
    return createNpcFriendRequest({
      npc: input.npc,
      personaId: input.personaId,
      source: input.source,
      sourceLabel: input.sourceLabel,
      message: String(parsed.message || '最近和你相处后，我想认识你多一点。').slice(0, 500),
    });
  } catch {
    return null;
  }
}

export function canNpcConsiderFriendRequest(npcId: string, personaId: string): boolean {
  if (!npcId || !personaId || hasNpcFriendship(npcId, personaId)) return false;
  return !getNpcFriendRequests().some(item => {
    if (item.npcId !== npcId || item.personaId !== personaId) return false;
    if (item.status === 'pending') return true;
    const updatedAt = Date.parse(item.updatedAt || item.createdAt || '');
    return Number.isFinite(updatedAt) && Date.now() - updatedAt >= 0 && Date.now() - updatedAt < 7 * 86400000;
  });
}
