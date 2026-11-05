import { reportPersistenceIssue } from './usePersistentState';
/**
* 群聊 AI 总结记录：统一后的群聊记忆。
* 不再逐条存聊天记录，只存 AI 生成的总结（每 N 楼 / 手动 / 大事件）。
* NPC 记忆 = 群总结 = 这同一套数据。
*/


export interface GroupAiSummary {
id: string;
/** 消息楼层范围，如 1-100 */
rangeStart: number;
rangeEnd: number;
/** 生成时间 ISO */
createdAt: string;
/** 总结正文 */
text: string;
/** 时间轴标题（一句话） */
title: string;
kind: 'auto' | 'manual' | 'event';
}

const keyFor = (conversationId: string) => `line:group-ai-summaries:${conversationId}`;

const blockedSummaryKeys = new Set<string>();

export function getGroupAiSummaries(conversationId: string): GroupAiSummary[] {
  if (typeof window === 'undefined') return [];
  const key = keyFor(conversationId);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) { blockedSummaryKeys.delete(key); return []; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('GROUP_AI_SUMMARIES_SCHEMA_INVALID');
    blockedSummaryKeys.delete(key);
    return parsed as GroupAiSummary[];
  } catch (error) {
    blockedSummaryKeys.add(key);
    reportPersistenceIssue('read:' + key, '群聊 AI 总结记录损坏或格式不符；已锁定写入以保留原始记忆', error);
    return [];
  }
}

export function saveGroupAiSummaries(conversationId: string, list: GroupAiSummary[]): boolean {
  if (typeof window === 'undefined') return false;
  const key = keyFor(conversationId);
  if (blockedSummaryKeys.has(key)) return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null && !Array.isArray(JSON.parse(raw))) throw new Error('GROUP_AI_SUMMARIES_SCHEMA_INVALID');
    const serialized = JSON.stringify(list.slice(0, 100));
    window.localStorage.setItem(key, serialized);
    if (window.localStorage.getItem(key) !== serialized) throw new Error('GROUP_AI_SUMMARIES_WRITE_VERIFY_FAILED');
    window.dispatchEvent(new CustomEvent('sane333:group-ai-summaries-updated', { detail: { conversationId } }));
    return true;
  } catch (error) {
    blockedSummaryKeys.add(key);
    reportPersistenceIssue('write:' + key, '群聊 AI 总结记录写入失败；原始记忆已保留', error);
    return false;
  }
}

export function addGroupAiSummary(conversationId: string, s: Omit<GroupAiSummary, 'id' | 'createdAt'>): GroupAiSummary {
const item: GroupAiSummary = {
...s,
id: 'gsum-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
createdAt: new Date().toISOString(),
};
const list = getGroupAiSummaries(conversationId);
saveGroupAiSummaries(conversationId, [item,...list]);
return item;
}

export function updateGroupAiSummary(conversationId: string, id: string, patch: Partial<Pick<GroupAiSummary, 'text' | 'title'>>): void {
const list = getGroupAiSummaries(conversationId).map(s => (s.id === id? {...s,...patch}: s));
saveGroupAiSummaries(conversationId, list);
}

export function clearGroupAiSummaries(conversationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(conversationId));
    window.dispatchEvent(new CustomEvent('sane333:group-ai-summaries-updated', { detail: { conversationId } }));
  } catch { /* ignore */ }
}
export function deleteGroupAiSummary(conversationId: string, id: string): void {
saveGroupAiSummaries(conversationId, getGroupAiSummaries(conversationId).filter(s => s.id!== id));
}

/** 给 prompt 用的合并文本：倒序（新的在前），只取正文 */
export function buildGroupAiSummariesContext(conversationId: string, maxItems = 10): string {
const list = getGroupAiSummaries(conversationId);
if (!list.length) return '';
return list
.slice(0, maxItems)
.map(s => `${s.text}`)
.join('\n');
}

