import { readPersistentState } from './usePersistentState';

export interface LineGroupMember {
  id: string;
  name: string;
  /** character = 角色卡；npc = NPC App 人物（可绑定角色） */
  kind?: 'character' | 'npc' | 'user';
  characterId?: string | null;
  npcId?: string | null;
  role: 'owner' | 'admin' | 'member';
  nickname?: string;
  title?: string;
  avatar?: string;
  muted?: boolean;
  online?: boolean;
  mood?: string;
  lastSeenAt?: string;
  relationship?: string;
  memory?: string[];
}

export interface LineGroup {
  id: string;
  name: string;
  avatar?: string;
  ownerId: string;
  members: LineGroupMember[];
  announcement: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  relationships?: Array<{ from: string; to: string; relation: string }>;
  events?: Array<{ id: string; text: string; createdAt: string }>;
}

const STORAGE_KEY = 'line:groups';

export function getLineGroups(): LineGroup[] {
  return readPersistentState<LineGroup[]>(STORAGE_KEY, []);
}

export function getLineGroupById(id: string): LineGroup | null {
  return getLineGroups().find(group => group.id === id) || null;
}

export function getLineGroupByName(name: string): LineGroup | null {
  return getLineGroups().find(group => group.name === name) || null;
}

export function upsertLineGroup(group: LineGroup): { ok: boolean; error?: string } {
  if (typeof window === 'undefined') return { ok: false, error: 'no-window' };
  try {
    const groups = getLineGroups();
    const next = groups.some(item => item.id === group.id)
      ? groups.map(item => item.id === group.id ? group : item)
      : [group, ...groups];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { ok: true };
  } catch (error) {
    // Storage failure must not break LINE, but callers must know the save failed
    // instead of showing a fake success (invite prompt with no member added).
    // The error name is surfaced so the user sees WHY (e.g. storage full).
    return { ok: false, error: (error as any)?.name || 'unknown' };
  }
}

export function updateLineGroupMember(groupId: string, memberId: string, patch: Partial<LineGroupMember>): LineGroup | null {
  const group = getLineGroups().find(item => item.id === groupId);
  if (!group) return null;
  const next = {
    ...group,
    members: group.members.map(member => member.id === memberId ? { ...member, ...patch } : member),
    updatedAt: new Date().toISOString(),
  };
  upsertLineGroup(next);
  return next;
}

export function addLineGroupMemory(groupId: string, text: string): LineGroup | null {
  const group = getLineGroups().find(item => item.id === groupId);
  if (!group || !text.trim()) return group || null;
  const events = [...(group.events || []), { id: 'group-event-' + Date.now(), text: text.trim(), createdAt: new Date().toISOString() }].slice(-100);
  const next = { ...group, events, updatedAt: new Date().toISOString() };
  upsertLineGroup(next);
  return next;
}

export function setLineGroupRelationships(groupId: string, relationships: Array<{ from: string; to: string; relation: string }>): LineGroup | null {
  const group = getLineGroups().find(item => item.id === groupId);
  if (!group) return null;
  const next = { ...group, relationships, updatedAt: new Date().toISOString() };
  upsertLineGroup(next);
  return next;
}

export function createLineGroup(input: {
  name: string;
  ownerId: string;
  ownerName: string;
  memberNames: string[];
  characterIds?: Record<string, string>;
  /** 创建时带入 NPC App 成员（按显示名索引） */
  npcMembers?: Record<string, { npcId: string; boundCharacterId?: string; avatar?: string }>;
  announcement?: string;
}): LineGroup {
  const now = new Date().toISOString();
  const uniqueNames = Array.from(new Set([input.ownerName, ...input.memberNames].map(name => name.trim()).filter(Boolean)));
  const group: LineGroup = {
    id: 'group-' + Date.now().toString(36),
    name: input.name.trim(),
    ownerId: input.ownerId,
    members: uniqueNames.map((name, index) => {
      const npc = input.npcMembers?.[name];
      if (npc?.npcId && name !== input.ownerName) {
        return {
          id: npc.npcId,
          name,
          kind: 'npc' as const,
          npcId: npc.npcId,
          characterId: npc.boundCharacterId || null,
          role: (index === 1 ? 'admin' : 'member') as LineGroupMember['role'],
          nickname: name,
          muted: false,
          avatar: npc.avatar || '',
        };
      }
      return {
        id: input.characterIds?.[name] || 'member-' + name,
        name,
        kind: name === input.ownerName ? 'user' as const : 'character' as const,
        characterId: input.characterIds?.[name] || null,
        npcId: null,
        role: (name === input.ownerName ? 'owner' : index === 1 ? 'admin' : 'member') as LineGroupMember['role'],
        nickname: name,
        muted: false,
      };
    }),
    announcement: input.announcement || '',
    description: '',
    relationships: [],
    events: [],
    createdAt: now,
    updatedAt: now,
  };
  upsertLineGroup(group);
  return group;
}


/** Remove a deleted character from every group while preserving NPC members bound to it. */
export function removeCharacterFromLineGroups(characterId: string): number {
  if (typeof window === 'undefined' || !characterId) return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return 0;
  const groups = JSON.parse(raw);
  if (!Array.isArray(groups)) throw new Error('LINE_GROUPS_STORAGE_INVALID');
  let changedCount = 0;
  const next = groups.flatMap((group: any) => {
    if (!group || typeof group !== 'object') return [group];
    const members = Array.isArray(group.members) ? group.members : [];
    const filtered = members.filter((member: any) =>
      !(member && (String(member.characterId || '') === characterId ||
        (member.kind === 'character' && String(member.id || '') === characterId)))
    );
    const removed = filtered.length !== members.length;
    const ownerRemoved = String(group.ownerId || '') === characterId ||
      members.some((member: any) => member?.kind === 'character' && String(member?.id || '') === characterId && member.role === 'owner');
    const nextOwner = ownerRemoved ? (filtered[0]?.id || '') : group.ownerId;
    const relationships = Array.isArray(group.relationships)
      ? group.relationships.filter((edge: any) => edge && String(edge.from) !== characterId && String(edge.to) !== characterId)
      : group.relationships;
    const relationshipsChanged = Array.isArray(group.relationships) && relationships.length !== group.relationships.length;
    if (!removed && !relationshipsChanged && !ownerRemoved) return [group];
    changedCount += 1;
    // A group with no remaining members cannot be used and is removed as a whole.
    if (!filtered.length) return [];
    return [{
      ...group,
      members: filtered,
      ownerId: nextOwner || group.ownerId,
      relationships,
      updatedAt: new Date().toISOString(),
    }];
  });
  if (changedCount) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sane333:storage-changed', { detail: { key: STORAGE_KEY } }));
  }
  return changedCount;
}
