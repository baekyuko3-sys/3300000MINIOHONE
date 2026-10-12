import type { CharacterProfile } from '../types';

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {};

function getImportedProfile(name: string, characterId?: string): CharacterProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('phone:characters');
    if (!raw) return null;
    const characters = JSON.parse(raw) as Array<{
      id?: string;
      name?: string;
      description?: string;
    }>;
    const character = characters.find(item => characterId ? item.id === characterId : item.name === name);
    if (!character) return null;
    return {
      nickname: character.name || name || '角色',
      birthday: '未设置',
      relationship: '刚导入 · 等待建立关系',
      canCharacterSelfJudge: true,
      canAutoChangeRelation: true,
      canBlockUser: true,
      isBlockedByCharacter: false,
      callMe: '',
      selectedLorebook: '',
      bio: character.description || '已从角色卡导入。',
    };
  } catch {
    return null;
  }
}

export function getCharacterProfile(name: string, characterId?: string): CharacterProfile {
  return getImportedProfile(name, characterId) ?? CHARACTER_PROFILES[name] ?? {
    nickname: name || '角色',
    birthday: '未设置',
    relationship: '刚认识',
    canCharacterSelfJudge: true,
    canAutoChangeRelation: true,
    canBlockUser: true,
    isBlockedByCharacter: false,
    callMe: '',
    selectedLorebook: '',
  };
}
