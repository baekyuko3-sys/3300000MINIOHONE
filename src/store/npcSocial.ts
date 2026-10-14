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

export function canNpcConsiderFriendRequest(npcId: string, personaId: string): boolean {
  if (hasNpcFriendship(npcId, personaId)) return false;
  return !getNpcFriendRequests().some(item =>
    item.npcId === npcId && item.personaId === personaId &&
    (item.status === 'pending' || Date.now() - new Date(item.updatedAt).getTime() < 7 * 86400000)
  );
}
