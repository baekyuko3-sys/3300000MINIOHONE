import type { OfflineEvent } from '../types';

export interface OfflinePersona {
  id: string;
  name: string;
  title?: string;
  bio?: string;
  avatar?: string;
  themeColor?: string;
}

export interface OfflineStyleSettings {
  fontSize: number;
  lineHeight: number;
  showAvatars: boolean;
  showMetadata: boolean;
  compact: boolean;
  background: 'paper' | 'white' | 'soft';
}

const PERSONA_KEY = 'line:personas';
const STYLE_KEY = 'offline:style';
const SESSION_KEY = 'offline:session';

export const DEFAULT_OFFLINE_STYLE: OfflineStyleSettings = {
  fontSize: 12,
  lineHeight: 1.85,
  showAvatars: true,
  showMetadata: true,
  compact: false,
  background: 'paper',
};

export function getOfflinePersonas(): OfflinePersona[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PERSONA_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveOfflinePersonas(items: OfflinePersona[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PERSONA_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('sane333:personas-updated'));
}

export function getOfflineStyle(): OfflineStyleSettings {
  if (typeof window === 'undefined') return DEFAULT_OFFLINE_STYLE;
  try { return { ...DEFAULT_OFFLINE_STYLE, ...JSON.parse(localStorage.getItem(STYLE_KEY) || '{}') }; }
  catch { return DEFAULT_OFFLINE_STYLE; }
}

export function saveOfflineStyle(next: Partial<OfflineStyleSettings>) {
  if (typeof window === 'undefined') return;
  const value = { ...getOfflineStyle(), ...next };
  localStorage.setItem(STYLE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('sane333:offline-style-updated'));
}

export interface OfflineSessionExport {
  type: 'sane333-offline-story';
  version: 1;
  event: OfflineEvent;
  exportedAt: string;
}

export function exportOfflineEvent(event: OfflineEvent): string {
  return JSON.stringify({
    type: 'sane333-offline-story',
    version: 1,
    event,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

export function importOfflineEvent(raw: string): OfflineEvent {
  const parsed = JSON.parse(raw);
  const event = parsed?.event || parsed;
  if (!event || typeof event !== 'object' || !event.id || !event.characterId) {
    throw new Error('不是有效的线下剧情文件。');
  }
  return {
    ...event,
    id: 'offline-import-' + Date.now(),
    title: String(event.title || '导入的线下剧情'),
    sceneLog: Array.isArray(event.sceneLog) ? event.sceneLog : [],
    updatedAt: new Date().toISOString(),
  } as OfflineEvent;
}

export function cloneOfflineBranch(event: OfflineEvent): OfflineEvent {
  const branchId = 'branch-' + Date.now();
  return {
    ...event,
    id: 'offline-' + Date.now(),
    branchId,
    parentBranchId: event.branchId,
    branchName: '分支 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: event.status === 'completed' ? 'in-progress' : event.status,
    sceneLog: [...(event.sceneLog || [])],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getSessionDefaults() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); } catch { return {}; }
}
