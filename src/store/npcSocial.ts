import { generateCreativeText, resolveChannelAiSettings } from '../ai/aiEngine';
import { buildNpcRuntimeContext } from './npcContext';
import { readPersistentState } from './usePersistentState';
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

export function getNpcFriendRequests(): NpcFriendRequest[] {
  const raw = readPersistentState<Partial<NpcFriendRequest>[]>(REQUESTS_KEY, []);
  return raw.filter(item => item && typeof item.id === 'string' && typeof item.npcId === 'string')
    .map(item => ({ ...item, status: item.status || 'pending' } as NpcFriendRequest));
}

function saveRequests(items: NpcFriendRequest[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REQUESTS_KEY, JSON.stringify(items.slice(0, 200)));
  window.dispatchEvent(new CustomEvent('sane333:npc-friend-requests-updated'));
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
  const requests = getNpcFriendRequests();
  const pending = requests.find(item => item.npcId === input.npc.id && item.personaId === input.personaId && item.status === 'pending');
  if (pending) return pending;
  const recent = requests.find(item => item.npcId === input.npc.id && item.personaId === input.personaId && Date.now() - new Date(item.createdAt).getTime() < 7 * 86400000);
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
  saveRequests([request, ...requests]);
  return request;
}

export function respondToNpcFriendRequest(id: string, status: 'accepted' | 'declined'): NpcFriendRequest | null {
  const requests = getNpcFriendRequests();
  const current = requests.find(item => item.id === id && item.status === 'pending');
  if (!current) return null;
  const next = { ...current, status, updatedAt: new Date().toISOString() } as NpcFriendRequest;
  saveRequests(requests.map(item => item.id === id ? next : item));
  return next;
}

export function hasNpcFriendship(npcId: string, personaId: string): boolean {
  const links = readPersistentState<Array<{ npcId: string; personaId: string }>>(FRIENDSHIP_KEY, []);
  return links.some(item => item.npcId === npcId && item.personaId === personaId);
}

export function setNpcFriendship(npcId: string, personaId: string, enabled: boolean) {
  if (typeof window === 'undefined' || !npcId || !personaId) return;
  const links = readPersistentState<Array<{ npcId: string; personaId: string }>>(FRIENDSHIP_KEY, []);
  const next = links.filter(item => !(item.npcId === npcId && item.personaId === personaId));
  if (enabled) next.push({ npcId, personaId });
  window.localStorage.setItem(FRIENDSHIP_KEY, JSON.stringify(next));
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
        buildNpcRuntimeContext(input.npc, 'online-chat'),
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
  if (hasNpcFriendship(npcId, personaId)) return false;
  return !getNpcFriendRequests().some(item =>
    item.npcId === npcId && item.personaId === personaId &&
    (item.status === 'pending' || Date.now() - new Date(item.updatedAt).getTime() < 7 * 86400000)
  );
}
