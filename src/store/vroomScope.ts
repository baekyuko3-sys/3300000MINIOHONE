import { readPersistentState } from './usePersistentState';

export const VROOM_EDGES_KEY = 'vroom:friend-edges';
export const VROOM_SCOPE_KEY = 'vroom:scope-settings';

export interface VroomScopeSettings {
  /** 开：角色之间必须同群（或显式好友）才能互评；关：同为我的好友即可互评 */
  strictFriendsOnly: boolean;
}

export function readVroomScopeSettings(): VroomScopeSettings {
  const raw = readPersistentState<Partial<VroomScopeSettings>>(VROOM_SCOPE_KEY, {});
  return { strictFriendsOnly: raw.strictFriendsOnly !== false };
}

interface EdgeStore { allow: string[]; block: string[]; }

function readEdges(): EdgeStore {
  const raw = readPersistentState<Partial<EdgeStore>>(VROOM_EDGES_KEY, {});
  return {
    allow: Array.isArray(raw.allow) ? raw.allow.map(String) : [],
    block: Array.isArray(raw.block) ? raw.block.map(String) : [],
  };
}

function writeEdges(next: EdgeStore) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VROOM_EDGES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sane333:vroom-friends-changed'));
  } catch { /* ignore */ }
}

export function edgePair(a: string, b: string): string {
  return [String(a), String(b)].sort().join('|');
}

export function isBlockedEdge(a: string, b: string): boolean {
  return readEdges().block.includes(edgePair(a, b));
}

export function isAllowedEdge(a: string, b: string): boolean {
  return readEdges().allow.includes(edgePair(a, b));
}

export function setFriendEdge(a: string, b: string, friend: boolean) {
  const store = readEdges();
  const pair = edgePair(a, b);
  writeEdges({
    allow: (friend ? [...store.allow, pair] : store.allow.filter(x => x !== pair)).filter((x, i, arr) => arr.indexOf(x) === i),
    block: (!friend ? [...store.block, pair] : store.block.filter(x => x !== pair)).filter((x, i, arr) => arr.indexOf(x) === i),
  });
}

export type VroomViewerKind = 'persona' | 'character' | 'npc' | 'user';

export interface VroomViewer {
  kind: VroomViewerKind;
  id: string;
  name: string;
  /** character  viewing 时的角色 id；npc 的绑定角色 id */
  characterId?: string;
}

export function viewerKey(v: VroomViewer): string {
  return v.kind + ':' + (v.id || v.name);
}

function readJson<T>(key: string, fallback: T): T {
  return readPersistentState<T>(key, fallback);
}

function lineFriendCharacterIds(): Set<string> {
  const friends = readJson<any[]>('line:friends-list', []);
  const out = new Set<string>();
  for (const f of friends) {
    if (!f || typeof f !== 'object' || f.deleted) continue;
    if (f.characterId) out.add('character:' + String(f.characterId));
    if (f.name) out.add('character-name:' + String(f.name));
    if (f.npcId) out.add('npc:' + String(f.npcId));
  }
  return out;
}

function isLineNpcFriend(npcId: string): boolean {
  return lineFriendCharacterIds().has('npc:' + npcId);
}

function groupMembersOf(characterId: string, characterName: string): Set<string> {
  const groups = readJson<any[]>('line:groups', []);
  const out = new Set<string>();
  for (const g of groups) {
    if (!g || !Array.isArray(g.members)) continue;
    const hit = g.members.some((m: any) => m && (m.characterId === characterId || m.name === characterName));
    if (!hit) continue;
    for (const m of g.members) {
      if (m?.characterId) out.add('character:' + String(m.characterId));
      if (m?.name) out.add('character-name:' + String(m.name));
      if (m?.npcId) out.add('npc:' + String(m.npcId));
    }
  }
  return out;
}

function npcBoundCharacterKey(npcId: string, npcName: string): string | null {
  const npcs = readJson<any[]>('phone:npcs', []);
  const npc = npcs.find(n => n && (n.id === npcId || n.name === npcName));
  if (!npc) return null;
  const bound = npc.boundCharacterId || npc.sourceCharacterId;
  if (bound) return 'character:' + String(bound);
  if (npc.boundCharacterName || npc.sourceCharacterName) return 'character-name:' + String(npc.boundCharacterName || npc.sourceCharacterName);
  return null;
}

export interface VroomPostLike {
  id?: string;
  name?: string;
  characterId?: string;
  npcId?: string;
  personaId?: string;
  isMine?: boolean;
  visibility?: string;
  allowedIds?: unknown;
  blockedIds?: unknown;
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function viewerIds(v: VroomViewer): string[] {
  const ids = [v.id, v.name, viewerKey(v)];
  if (v.characterId) ids.push(v.characterId, 'character:' + v.characterId);
  return ids.map(String).filter(Boolean);
}

/** 帖子作者 key：NPC 优先；角色帖用 character:id；persona 帖用 persona:id（无 id 用 user） */
export function postAuthorKey(post: VroomPostLike): string {
  if (post.npcId) return 'npc:' + String(post.npcId);
  if (post.characterId) return 'character:' + String(post.characterId);
  if (post.isMine || post.personaId || (!post.characterId && post.name)) {
    return post.personaId ? 'persona:' + String(post.personaId) : 'user';
  }
  return 'character-name:' + String(post.name || '');
}

/**
 * 某 viewer 能不能看到这条动态（看不见 = 不能评论、自主评论跳过）。
 * - 自己永远可见；仅自己仅作者可见；blockedIds 命中不可见；
 * - 分组/部分可见：allowedIds 命中才可见；
 * - 公开：user/persona 帖 → LINE 好友（或显式 allow）；角色帖 → 同群或显式 allow（严格模式），非严格再加“同为我的好友”；
 * - 显式 block 一票否决；user 本人（刷自己手机）永远可见。
 */
export function canViewerSeePost(post: VroomPostLike, viewer: VroomViewer): boolean {
  if (viewer.kind === 'user') return true;
  const authorKey = postAuthorKey(post);
  const selfKey = viewerKey(viewer);
  if (authorKey === selfKey) return true;
  if (isBlockedEdge(authorKey, selfKey)) return false;
  if (post.visibility === 'self') return false;
  const blocked = idList(post.blockedIds);
  if (blocked.length && viewerIds(viewer).some(id => blocked.includes(id))) return false;
  const allowed = idList(post.allowedIds);
  if ((post.visibility === 'group' || post.visibility === 'custom' || post.visibility === 'partial') && allowed.length) {
    if (!viewerIds(viewer).some(id => allowed.includes(id))) return false;
    return true;
  }
  if (isAllowedEdge(authorKey, selfKey)) return true;

  const friends = lineFriendCharacterIds();
  const isUserPost = authorKey === 'user' || authorKey.startsWith('persona:');
  if (viewer.kind === 'persona') return true; // 自己换人设刷手机，全可见
  if (isUserPost) {
    // user/persona 的帖：LINE 好友角色，或 LINE 好友 NPC（及绑定角色是好友的 NPC）
    if (viewer.kind === 'character') {
      return friends.has('character:' + viewer.id) || friends.has('character-name:' + viewer.name);
    }
    if (viewer.kind === 'npc') {
      if (isLineNpcFriend(viewer.id)) return true;
      const bound = viewer.characterId
        ? 'character:' + viewer.characterId
        : npcBoundCharacterKey(viewer.id, viewer.name);
      if (!bound) return false;
      const chars = readJson<any[]>('phone:characters', []);
      const boundName = chars.find(c => c?.id === (viewer.characterId || ''))?.name;
      return friends.has(bound) || (boundName ? friends.has('character-name:' + boundName) : false);
    }
    return false;
  }
  // 角色/NPC 的帖
  const posterCharId = post.characterId && !post.npcId ? String(post.characterId) : '';
  const posterNpcId = post.npcId ? String(post.npcId) : '';
  const posterName = String(post.name || '');
  const posterBoundKey = posterNpcId
    ? (npcBoundCharacterKey(posterNpcId, posterName) || (post.characterId ? 'character:' + post.characterId : null))
    : null;
  if (viewer.kind === 'character') {
    if (posterNpcId) {
      // 看 NPC 帖：同群（含 npc 成员）或绑定角色同群/同为好友
      const boundId = posterBoundKey?.startsWith('character:') ? posterBoundKey.slice('character:'.length) : '';
      const mates = groupMembersOf(boundId || posterCharId, posterName);
      if (mates.has('character:' + viewer.id) || mates.has('character-name:' + viewer.name) || mates.has('npc:' + posterNpcId)) return true;
      if (!readVroomScopeSettings().strictFriendsOnly) {
        const a = (boundId && friends.has('character:' + boundId)) || friends.has('npc:' + posterNpcId);
        const b = friends.has('character:' + viewer.id) || friends.has('character-name:' + viewer.name);
        if (a && b) return true;
      }
      return false;
    }
    const mates = groupMembersOf(posterCharId, posterName);
    if (mates.has('character:' + viewer.id) || mates.has('character-name:' + viewer.name)) return true;
    if (!readVroomScopeSettings().strictFriendsOnly) {
      const a = friends.has('character:' + posterCharId) || (posterName ? friends.has('character-name:' + posterName) : false);
      const b = friends.has('character:' + viewer.id) || friends.has('character-name:' + viewer.name);
      if (a && b) return true;
    }
    return false;
  }
  if (viewer.kind === 'npc') {
    if (posterNpcId && posterNpcId === viewer.id) return true;
    const boundId = viewer.characterId || '';
    const chars = readJson<any[]>('phone:characters', []);
    const boundName = chars.find(c => c?.id === boundId)?.name || '';
    if (boundId && boundId === posterCharId) return true;
    if (posterBoundKey && boundId && posterBoundKey === 'character:' + boundId) return true;
    const mates = groupMembersOf(posterCharId || (posterBoundKey?.startsWith('character:') ? posterBoundKey.slice('character:'.length) : ''), posterName);
    if ((boundId && mates.has('character:' + boundId)) || (boundName && mates.has('character-name:' + boundName))) return true;
    if (mates.has('npc:' + viewer.id)) return true;
    if (!readVroomScopeSettings().strictFriendsOnly) {
      const a = posterNpcId
        ? friends.has('npc:' + posterNpcId) || Boolean(posterBoundKey && friends.has(posterBoundKey))
        : friends.has('character:' + posterCharId) || (posterName ? friends.has('character-name:' + posterName) : false);
      const b = friends.has('npc:' + viewer.id) || (boundId ? friends.has('character:' + boundId) : false);
      if (a && b) return true;
    }
    return false;
  }
  return false;
}

export function characterViewerFor(id: string, name: string): VroomViewer {
  return { kind: 'character', id: String(id || name), name: String(name || id) };
}

export function npcViewerFor(id: string, name: string, boundCharacterId?: string): VroomViewer {
  return { kind: 'npc', id: String(id || name), name: String(name || id), characterId: boundCharacterId };
}
