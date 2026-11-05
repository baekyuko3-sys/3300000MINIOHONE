import { reportPersistenceIssue } from './usePersistentState';
import type { AppSettings, ChatProvider } from './appSettings';

export interface ApiPreset {
  id: string; name: string; provider: ChatProvider; apiBaseUrl: string; apiKey: string; model: string;
  streaming: boolean; contextLength: number; maxOutputTokens: number; temperature: number;
  topP: number; topK: number; frequencyPenalty: number; presencePenalty: number; seed: number | null;
  createdAt: string; updatedAt: string;
}
const STORAGE_KEY = 'phone:api-presets';
let apiPresetsWriteBlocked = false;

export function readApiPresets(): ApiPreset[] {
  apiPresetsWriteBlocked = false;
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('API_PRESETS_SCHEMA_INVALID');
    return parsed as ApiPreset[];
  } catch (error) {
    apiPresetsWriteBlocked = true;
    reportPersistenceIssue('read:' + STORAGE_KEY, 'API 预设数据损坏或格式不符；已锁定写入以保留密钥和预设', error);
    return [];
  }
}
export function saveApiPresets(v: ApiPreset[]): boolean {
  if (typeof window === 'undefined' || apiPresetsWriteBlocked) return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null && !Array.isArray(JSON.parse(raw))) throw new Error('API_PRESETS_SCHEMA_INVALID');
    const serialized = JSON.stringify(v);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    if (window.localStorage.getItem(STORAGE_KEY) !== serialized) throw new Error('API_PRESETS_WRITE_VERIFY_FAILED');
    window.dispatchEvent(new CustomEvent('sane333:api-presets-changed'));
    return true;
  } catch (error) {
    apiPresetsWriteBlocked = true;
    reportPersistenceIssue('write:' + STORAGE_KEY, 'API 预设写入失败；原始配置已保留', error);
    return false;
  }
}
export function settingsToApiPreset(s: AppSettings, name: string, id?: string): ApiPreset {
  const now = new Date().toISOString();
  return { id: id || 'api-' + Date.now(), name: name.trim() || '未命名 API', provider: s.provider, apiBaseUrl: s.apiBaseUrl, apiKey: s.apiKey, model: s.model, streaming: s.streaming, contextLength: s.contextLength, maxOutputTokens: s.maxOutputTokens, temperature: s.temperature, topP: s.topP, topK: s.topK, frequencyPenalty: s.frequencyPenalty, presencePenalty: s.presencePenalty, seed: s.seed, createdAt: now, updatedAt: now };
}
export function applyApiPreset(p: ApiPreset): Partial<AppSettings> {
  return { provider:p.provider, apiBaseUrl:p.apiBaseUrl, apiKey:p.apiKey, model:p.model, streaming:p.streaming, contextLength:p.contextLength, maxOutputTokens:p.maxOutputTokens, temperature:p.temperature, topP:p.topP, topK:p.topK, frequencyPenalty:p.frequencyPenalty, presencePenalty:p.presencePenalty, seed:p.seed };
}
export function upsertApiPreset(p: ApiPreset): boolean {
  const v = readApiPresets();
  const i = v.findIndex(x => x.id === p.id);
  if (i >= 0) v[i] = { ...p, updatedAt: new Date().toISOString() };
  else v.unshift(p);
  return saveApiPresets(v);
}
export function deleteApiPreset(id: string): boolean {
  return saveApiPresets(readApiPresets().filter(x => x.id !== id));
}
