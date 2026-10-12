import type { AiSettings } from '../ai/aiEngine';

export interface CharacterAiProfile {
  id: string;
  characterId: string;
  characterName: string;
  enabled: boolean;
  provider: AiSettings['provider'];
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  streaming: boolean;
  contextLength: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  seed: number | null;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'phone:character-ai-profiles';

export function readCharacterAiProfiles(): CharacterAiProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCharacterAiProfiles(profiles: CharacterAiProfile[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  window.dispatchEvent(new CustomEvent('sane333:character-ai-profiles-changed'));
}

export function getCharacterAiProfile(characterId: string, characterName?: string): CharacterAiProfile | null {
  return readCharacterAiProfiles().find(profile =>
    profile.characterId === characterId || Boolean(characterName && profile.characterName === characterName)
  ) || null;
}

export function upsertCharacterAiProfile(profile: CharacterAiProfile) {
  const profiles = readCharacterAiProfiles();
  const index = profiles.findIndex(item => item.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.unshift(profile);
  saveCharacterAiProfiles(profiles);
  return profile;
}

export function deleteCharacterAiProfile(id: string) {
  saveCharacterAiProfiles(readCharacterAiProfiles().filter(profile => profile.id !== id));
}

export function buildCharacterAiProfile(base: AiSettings, characterId: string, characterName: string): CharacterAiProfile {
  return {
    id: 'char-ai-' + characterId,
    characterId,
    characterName,
    enabled: true,
    provider: base.provider,
    apiBaseUrl: base.apiBaseUrl,
    apiKey: base.apiKey,
    model: base.model,
    streaming: base.streaming,
    contextLength: base.contextLength,
    maxOutputTokens: base.maxOutputTokens,
    temperature: base.temperature,
    topP: base.topP,
    topK: base.topK,
    frequencyPenalty: base.frequencyPenalty,
    presencePenalty: base.presencePenalty,
    seed: base.seed,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function mergeCharacterAiSettings(base: AiSettings, profile: CharacterAiProfile | null): AiSettings {
  if (!profile?.enabled) return base;
  return {
    ...base,
    provider: profile.provider,
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    streaming: profile.streaming,
    contextLength: profile.contextLength,
    maxOutputTokens: profile.maxOutputTokens,
    temperature: profile.temperature,
    topP: profile.topP,
    topK: profile.topK,
    frequencyPenalty: profile.frequencyPenalty,
    presencePenalty: profile.presencePenalty,
    seed: profile.seed,
  };
}
