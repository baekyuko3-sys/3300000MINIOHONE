import type { ImportedCharacter } from '../data/characterImport';

/** 在线时段设置 */
export interface OnlineHours {
  start: string; // "09:00"
  end: string;   // "23:00"
}

/** 解析 "HH:MM" 为分钟数 */
function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 判断角色当前是否在线。
 * - invisible=true → 不在线（隐身）
 * - 有 onlineHours → 当前时间在时段内才在线（支持跨午夜，如 22:00-02:00）
 * - 无设置 → 默认在线
 */
export function isCharacterOnline(character: ImportedCharacter | null | undefined, now: Date = new Date()): boolean {
  if (!character) return false;
  if ((character as any).invisible) return false;
  const hours = (character as any).onlineHours as OnlineHours | undefined;
  if (!hours || !hours.start || !hours.end) return true; // 没设置 = 默认在线
  const start = parseTime(hours.start);
  const end = parseTime(hours.end);
  if (start === null || end === null) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start <= end) {
    return cur >= start && cur < end;
  }
  // 跨午夜
  return cur >= start || cur < end;
}

/** 获取角色的不在线提示文案（可自定义） */
export function getOfflineMessage(character: ImportedCharacter | null | undefined): string {
  const custom = (character as any)?.offlineMessage as string | undefined;
  if (custom && custom.trim()) return custom.trim();
  return 'TA 现在不在线，稍后回复你';
}

/** 默认在线时段 */
export const DEFAULT_ONLINE_HOURS: OnlineHours = { start: '09:00', end: '23:00' };
