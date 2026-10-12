import type { AppSettings, ChatProvider } from './appSettings';

export interface ApiPreset {
  id: string; name: string; provider: ChatProvider; apiBaseUrl: string; apiKey: string; model: string;
  streaming: boolean; contextLength: number; maxOutputTokens: number; temperature: number;
  topP: number; topK: number; frequencyPenalty: number; presencePenalty: number; seed: number | null;
  createdAt: string; updatedAt: string;
}
const STORAGE_KEY = 'phone:api-presets';

export function readApiPresets(): ApiPreset[] {
  if (typeof window === 'undefined') return [];
  try { const v = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveApiPresets(v: ApiPreset[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent('sane333:api-presets-changed'));
}
export function settingsToApiPreset(s: AppSettings, name: string, id?: string): ApiPreset {
  const now = new Date().toISOString();
  return { id: id || 'api-' + Date.now(), name: name.trim() || '未命名 API', provider: s.provider, apiBaseUrl: s.apiBaseUrl, apiKey: s.apiKey, model: s.model, streaming: s.streaming, contextLength: s.contextLength, maxOutputTokens: s.maxOutputTokens, temperature: s.temperature, topP: s.topP, topK: s.topK, frequencyPenalty: s.frequencyPenalty, presencePenalty: s.presencePenalty, seed: s.seed, createdAt: now, updatedAt: now };
}
export function applyApiPreset(p: ApiPreset): Partial<AppSettings> {
  return { provider:p.provider, apiBaseUrl:p.apiBaseUrl, apiKey:p.apiKey, model:p.model, streaming:p.streaming, contextLength:p.contextLength, maxOutputTokens:p.maxOutputTokens, temperature:p.temperature, topP:p.topP, topK:p.topK, frequencyPenalty:p.frequencyPenalty, presencePenalty:p.presencePenalty, seed:p.seed };
}
export function upsertApiPreset(p: ApiPreset) {
  const v=readApiPresets(); const i=v.findIndex(x=>x.id===p.id);
  if(i>=0) v[i]={...p,updatedAt:new Date().toISOString()}; else v.unshift(p); saveApiPresets(v);
}
export function deleteApiPreset(id:string){ saveApiPresets(readApiPresets().filter(x=>x.id!==id)); }
