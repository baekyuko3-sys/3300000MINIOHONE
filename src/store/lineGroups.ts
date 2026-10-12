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

export function upsertLineGroup(group: LineGroup): void {
  if (typeof window === 'undefined') return;
  try {
    const groups = getLineGroups();
    const next = groups.some(item => item.id === group.id)
      ? groups.map(item => item.id === group.id ? group : item)
      : [group, ...groups];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage failure must not break LINE.
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
  announcement?: string;
}): LineGroup {
  const now = new Date().toISOString();
  const uniqueNames = Array.from(new Set([input.ownerName, ...input.memberNames].map(name => name.trim()).filter(Boolean)));
  const group: LineGroup = {
    id: 'group-' + Date.now().toString(36),
    name: input.name.trim(),
    ownerId: input.ownerId,
    members: uniqueNames.map((name, index) => ({
      id: input.characterIds?.[name] || 'member-' + name,
      name,
      characterId: input.characterIds?.[name] || null,
      role: name === input.ownerName ? 'owner' : index === 1 ? 'admin' : 'member',
      nickname: name,
      muted: false,
    })),
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
