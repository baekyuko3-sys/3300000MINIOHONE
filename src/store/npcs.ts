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
  worldBookIds?: string[];
  worldBookNames?: string[];
  settingSource: 'project' | 'worldbook' | 'character' | 'manual';
  boundCharacterId: string;
  boundCharacterName: string;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  tags: string[];
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  memory?: string;
  active: boolean;
  canCommentMoments: boolean;
}

const KEY = 'phone:npcs';

export function getNpcs(): SaneNpc[] {
  const saved = readPersistentState<Partial<SaneNpc>[]>(KEY, []);
  return saved
    .map(item => ({
      ...item,
      boundCharacterId: item.boundCharacterId || item.sourceCharacterId || '',
      boundCharacterName: item.boundCharacterName || item.sourceCharacterName || '',
      active: item.active !== false,
      canCommentMoments: item.canCommentMoments !== false,
      tags: Array.isArray(item.tags) ? item.tags : [],
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
