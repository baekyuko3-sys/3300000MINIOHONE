import type { OfflineEvent } from '../types';
import { reportPersistenceIssue } from './usePersistentState';

export type LineMessageKind =
  | 'text' | 'image' | 'video' | 'file' | 'voice' | 'sticker'
  | 'text-image' | 'text-video' | 'ai-card' | 'real-media' | 'ai-reply'
  | 'system' | 'offline-invite' | 'music-invite' | 'music-together' | 'call' | 'call-record'
  | 'system-nudge' | 'html-interlude'
  | 'transfer' | 'red-packet' | 'location'
  | 'contact-card' | 'offline-event';

/** Message side, the ONLY field that decides left/right rendering.
 *  user = own message (right), assistant = character/NPC reply (left), system = centered.
 *  senderType decides only avatar/name/character-vs-NPC rules, never side. */
export type LineMessageRole = 'user' | 'assistant' | 'system' | string;

export interface LineRuntimeMessage {
  id: number | string;
  role?: LineMessageRole;
  /** Stable group-chat identity; display names are legacy fallbacks only. */
  senderType?: 'npc' | 'character' | 'user' | 'system' | string;
  senderId?: string;
  text?: string;
  kind?: LineMessageKind;
  createdAt?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'recalled' | 'deleted';
  replyToId?: number | string;
  editedAt?: string;
  recalledAt?: string;
  deletedAt?: string;
  reactions?: Record<string, number>;
  isRecalled?: boolean;
  isRecalledByOther?: boolean;
  recalledOriginalText?: string;
  recalledByOtherReason?: string;
  favorite?: boolean;
  edited?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface LineConversationMeta {
  id: string;
  characterId?: string;
  name: string;
  isGroup: boolean;
  lastReadMessageId?: number | string | null;
  updatedAt: string;
  unread: number;
  muted: boolean;
  pinned: boolean;
}

export interface LineNotification {
  id: string;
  type: 'message' | 'invite' | 'call' | 'system';
  conversationId?: string;
  characterId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  payload?: Record<string, unknown>;
}

const META_KEY = 'line:runtime:conversations';
const NOTIFICATION_KEY = 'line:runtime:notifications';
const CONVERSATION_PREFIX = 'line:conversation:';
const MAX_NOTIFICATIONS = 200;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch (error) {
    // Preserve malformed LINE data before a later write can replace the original value.
    if (raw !== null && raw.length <= 1_000_000) {
      try {
        const recoveryKey = 'sane333:recovery:corrupt:' + encodeURIComponent(key);
        if (window.localStorage.getItem(recoveryKey) === null) {
          window.localStorage.setItem(recoveryKey, JSON.stringify({ key, capturedAt: new Date().toISOString(), raw }));
        }
      } catch (recoveryError) {
        reportPersistenceIssue('line-recovery:' + key, 'LINE 损坏数据恢复副本保存失败；请尽快导出本地数据', recoveryError);
      }
    }
    reportPersistenceIssue('line-read:' + key, 'LINE 本地数据读取或解析失败，已使用备用值；已尝试保留原始内容', error);
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { reportPersistenceIssue('line-write:' + key, 'LINE 会话数据写入失败；本次更改可能尚未保存', error); }
}

function conversationKey(id: string) {
  return CONVERSATION_PREFIX + id;
}

export function getLineConversationMessages(id: string): LineRuntimeMessage[] {
  return readJson<LineRuntimeMessage[]>(conversationKey(id), []);
}

/** Synchronously persist the complete UI snapshot before a conversation unmounts.
 * The runtime index is intentionally normalized/lossy; this key remains the full transcript source.
 */
export function saveLineConversationSnapshot(id: string, messages: unknown[]) {
  if (!id) return;
  writeJson(conversationKey(id), messages);
}

export function saveLineConversationMessages(id: string, messages: LineRuntimeMessage[]) {
  const normalized = messages.map(normalizeLineMessage);
  writeJson(conversationKey(id), normalized);
  return normalized;
}

/**
 * Resolve the visual side of a LINE message from role ONLY.
 * role=user → own message (right); anything else → not mine (left/centered).
 * senderType, senderName, kind and any other field NEVER decide side.
 * Legacy sender values are translated to role by normalizeLineMessage at save
 * time; render must never read them.
 */
/**
 * Compact chat-list time for a message timestamp (LINE-style):
 * just now -> '刚刚', today -> HH:MM, yesterday -> '昨天',
 * same year -> MM-DD, older -> YYYY-MM-DD. Missing/invalid -> '刚刚'
 * (a message with no timestamp was just created).
 */
export function formatChatListTime(value: unknown): string {
  if (!value) return '刚刚';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '刚刚';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return '刚刚';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `${hh}:${mm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${month}-${day}`;
  return `${d.getFullYear()}-${month}-${day}`;
}

export function isLineMessageFromUser(candidate: any, _activeCharacterName = '', _userName = ''): boolean {
  if (!candidate) return false;
  const role = String(candidate.role || '').trim().toLowerCase();
  if (role === 'user' || role === 'assistant' || role === 'system') return role === 'user';
  // Role absent: fall back to the legacy sender field ONLY. New code never
  // writes sender, so this can only apply to legacy data and can never
  // contradict a role written by current code. senderName/senderType/kind
  // NEVER decide side.
  const legacy = String(candidate.sender || '').trim().toLowerCase();
  return legacy === 'me' || legacy === 'user';
}

/** Legacy sender → role, used ONLY by storage migration / normalize (never by render). */
export function roleFromLegacySender(sender: unknown): 'user' | 'assistant' | 'system' | undefined {
  const value = String(sender || '').trim().toLowerCase();
  if (value === 'me' || value === 'user') return 'user';
  if (value === 'other') return 'assistant';
  if (value === 'system') return 'system';
  return undefined;
}

const KNOWN_KINDS = new Set([
  'text', 'image', 'video', 'file', 'voice', 'sticker',
  'text-image', 'text-video', 'ai-card', 'real-media', 'ai-reply',
  'system', 'offline-invite', 'music-invite', 'music-together', 'call', 'call-record',
  'system-nudge', 'html-interlude', 'transfer', 'red-packet', 'location',
  'contact-card', 'offline-event',
]);

/** Resolve kind from kind, falling back to legacy type / category values that are valid kinds. */
export function resolveMessageKind(message: any): LineMessageKind | undefined {
  const kind = String(message?.kind || '').trim();
  if (KNOWN_KINDS.has(kind)) return kind as LineMessageKind;
  const legacyType = String(message?.type || message?.metadata?.cardKind || '').trim();
  if (KNOWN_KINDS.has(legacyType)) return legacyType as LineMessageKind;
  const category = String(message?.category || message?.metadata?.category || '').trim().toLowerCase();
  if (KNOWN_KINDS.has(category)) return category as LineMessageKind;
  return undefined;
}

/** Resolve role: explicit role wins; otherwise translate legacy sender (migration path only). */
export function resolveMessageRole(message: any): 'user' | 'assistant' | 'system' | undefined {
  const role = String(message?.role || '').trim().toLowerCase();
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  // Defensive: never treat legacy role-shaped values as side signals beyond this map.
  if (role === 'me') return 'user';
  if (role === 'other') return 'assistant';
  return roleFromLegacySender(message?.sender);
}
/** AI 误把内部结构化数据块（如角色卡朋友圈 WX_MOMENTS 数据）输出到聊天正文时，去掉它。
 *  块格式：[WX_MOMENTS: Signature="...", Private1="...", ...]，字段值可能含中文逗号但不含裸双引号；
 *  若块被截断没有右括号，则从标记起截到文末（这类块只会出现在正文末尾）。 */
export function stripLeakedInternalBlocks(text: string): string {
  if (!text || !text.includes('[WX_')) return text;
  let out = text.replace(/\[WX_[A-Z0-9_]+:(?:[^"\]]|"[^"]*")*\]/g, '');
  const leftover = out.indexOf('[WX_');
  if (leftover >= 0) out = out.slice(0, leftover);
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trimEnd();
}

/** AI 误把内部标签（如残留的 </cot>、未闭合的 <cot> 块）输出到聊天正文时，去掉它们。
 *  思维链显示读的是 message.thinking 等独立字段，不靠正文标签，所以正文里清掉是安全的。 */
export function stripLeakedMarkupTags(text: string): string {
  if (!text || !text.includes('<')) return text;
  let out = text;
  // 成对的内部块（含未闭合的）连内容一起去掉
  out = out.replace(/<(cot|thinking|analysis|preset_flow|think|thought|summary|decision)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '');
  out = out.replace(/<action\b[^>]*>[\s\S]*?(<\/action\s*>|$)/gi, '');
  out = out.replace(/<(statusbar|status)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '');
  // 残留的单个开/闭标签（包括落单的 </cot>）
  out = out.replace(/<\/?(?:cot|thinking|analysis|preset_flow|think|thought|summary|decision|action|statusbar|status|message|final|response|output|assistant|user|system)\b[^>]*>/gi, '');
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();
}

export function normalizeLineMessage(message: LineRuntimeMessage, fallbackIndex = 0): LineRuntimeMessage {
  const raw: any = message as any;
  const legacyTimestamp = (message as LineRuntimeMessage & { timestamp?: string | number }).timestamp;
  const timestampValue = message.createdAt || (
    typeof legacyTimestamp === 'number'
      ? new Date(legacyTimestamp < 1e12 ? legacyTimestamp * 1000 : legacyTimestamp).toISOString()
      : legacyTimestamp
  );
  // sender / type / top-level category / top-level mediaType are deleted
  // fields: sender is replaced by role, type is replaced by kind, category
  // and mediaType fold into metadata.
  const { sender: _legacySender, type: _legacyType, category: legacyCategory, mediaType: legacyMediaType, ...rest } = raw;
  const role = resolveMessageRole(raw);
  const kind = resolveMessageKind(raw);
  const metadata = { ...(raw.metadata || {}) };
  if (legacyCategory && !metadata.category) metadata.category = legacyCategory;
  if (legacyMediaType && !metadata.mediaType) metadata.mediaType = legacyMediaType;
  if (raw.metadata?.cardKind && !kind) {
    // cardKind already feeds resolveMessageKind; keep it in metadata for info.
  }
  return {
    ...rest,
    id: message.id ?? `line-msg-${Date.now()}-${fallbackIndex}`,
    ...(role ? { role } : {}),
    ...(kind ? { kind } : {}),
    metadata,
    // 落盘前去掉 AI 误输出的内部数据块（如 WX_MOMENTS）和内部标签（如 </cot>），避免预览和导出里出现原始格式
    ...(typeof message.text === 'string' ? { text: stripLeakedMarkupTags(stripLeakedInternalBlocks(message.text)) } : {}),
    // Do not invent "today" for imported/legacy messages that have no real timestamp.
    // Real timestamps are preserved; new messages already receive createdAt when created.
    ...(timestampValue ? { createdAt: timestampValue } : { createdAt: undefined }),
    status: message.status || (role === 'user' ? 'sent' : 'delivered'),
  };
}

export function appendLineMessage(id: string, message: LineRuntimeMessage): LineRuntimeMessage[] {
  const current = getLineConversationMessages(id);
  const nextMessage = normalizeLineMessage(message, current.length);
  if (current.some(item => String(item.id) === String(nextMessage.id))) return current;
  const next = [...current, nextMessage];
  saveLineConversationMessages(id, next);
  // Do not advance unread counters or previews if localStorage rejected the write
  // (for example because the browser quota is full). That would advertise a message
  // as delivered while its transcript was never persisted.
  if (typeof window !== 'undefined') {
    const persisted = getLineConversationMessages(id);
    if (!persisted.some(item => String(item.id) === String(nextMessage.id))) {
      reportPersistenceIssue('line-append:' + id, '消息未能持久化，已阻止未读数和聊天预览继续更新');
      return current;
    }
  }
  const previousUnread = getLineConversationMeta(id)?.unread || 0;
  // Outgoing/system messages must not erase unread incoming messages.
  // Only an unread incoming message increments the counter; a message already
  // marked read leaves the existing count unchanged.
  const nextUnread = nextMessage.role === 'assistant'
    ? (nextMessage.status === 'read' || nextMessage.metadata?.isRead === true ? previousUnread : previousUnread + 1)
    : previousUnread;

  // Keep the visible LINE chat list synchronized with the runtime message stream.
  // This is especially important for background events such as offline-story updates
  // and call records that arrive while the conversation screen is closed.
  if (typeof window !== 'undefined') {
    try {
      const rawChats = window.localStorage.getItem('line:chat-items');
      const chats = rawChats ? JSON.parse(rawChats) : [];
      if (Array.isArray(chats)) {
        const preview = String(
          (nextMessage.kind === 'text-image' || nextMessage.metadata?.cardKind === 'text-image' ? '[图片卡片] ' + (nextMessage.text || nextMessage.metadata?.desc || '') : '') ||
          (nextMessage.kind === 'text-video' || nextMessage.metadata?.cardKind === 'text-video' ? '[视频卡片] ' + (nextMessage.text || nextMessage.metadata?.desc || '') : '') ||
          nextMessage.text ||
          (nextMessage.kind === 'offline-invite' ? '💌 线下剧情邀约' : '') ||
          (nextMessage.kind === 'call-record' ? nextMessage.text || '通话记录' : '') ||
          (nextMessage.kind === 'voice' ? '[语音]' : '') ||
          (nextMessage.kind === 'image' ? '[图片]' : '') ||
          (nextMessage.kind === 'video' ? '[视频]' : '') ||
          (nextMessage.kind === 'file' ? '[文件]' : '') ||
          '[新消息]'
        ).replace(/\s+/g, ' ').slice(0, 80);
        // Prefer the exact conversation ID. Legacy callers sometimes pass a
        // character ID instead; only use that fallback when exactly one ordinary
        // chat matches, otherwise never mutate multiple persona conversations.
        const exactMatches = chats.filter((item: any) => String(item?.id || '') === String(id));
        const legacyMatches = exactMatches.length
          ? []
          : chats.filter((item: any) =>
              item && !item.isGroup && !item.npcId &&
              String(item.characterId || '') === String(id)
            );
        const targetIds = new Set<string>();
        if (exactMatches.length === 1 && exactMatches[0]?.id) {
          targetIds.add(String(exactMatches[0].id));
        } else if (exactMatches.length === 0 && legacyMatches.length === 1 && legacyMatches[0]?.id) {
          targetIds.add(String(legacyMatches[0].id));
        }
        const nextChats = targetIds.size
          ? chats.map((item: any) => targetIds.has(String(item?.id || ''))
              ? { ...item, preview, time: '刚刚', unread: nextUnread }
              : item)
          : chats;
        if (nextChats !== chats) window.localStorage.setItem('line:chat-items', JSON.stringify(nextChats));
      }
    } catch {
      // Chat-list synchronization is best-effort.
    }
  }

  touchLineConversation(id, {
    unread: nextUnread,
  });
  return next;
}

export function updateLineMessage(id: string, messageId: number | string, patch: Partial<LineRuntimeMessage>) {
  const key = conversationKey(id);
  const current = getLineConversationMessages(id);
  const next = current.map(message =>
    String(message.id) === String(messageId) ? normalizeLineMessage({ ...message, ...patch }) : message
  );
  if (typeof window === 'undefined') return current;
  try {
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(key, serialized);
    if (window.localStorage.getItem(key) !== serialized) {
      reportPersistenceIssue('line-update:' + id, 'LINE 消息状态更新未能验证落盘；保留原始消息状态以便恢复');
      return current;
    }
    return next;
  } catch (error) {
    reportPersistenceIssue('line-update:' + id, 'LINE 消息状态更新失败；原始消息状态已保留', error);
    return current;
  }
}

export function recallLineMessage(id: string, messageId: number | string) {
  return updateLineMessage(id, messageId, {
    text: '你撤回了一条消息',
    status: 'recalled',
    recalledAt: new Date().toISOString(),
  });
}

/** A deleted message retains only presentation identity; no content or card data. */
export function buildDeletedTombstone<T extends Record<string, any>>(message: T): T {
  const keep = ['id', 'role', 'sender', 'senderName', 'senderType', 'senderId', 'characterId', 'createdAt', 'timestamp', 'time'];
  const tomb: Record<string, any> = {};
  for (const key of keep) if (message && message[key] !== undefined) tomb[key] = message[key];
  tomb.text = '';
  tomb.kind = 'text';
  tomb.status = 'deleted';
  tomb.deletedAt = new Date().toISOString();
  tomb.metadata = {};
  return tomb as T;
}

/** Deleted and recalled content must never be included in AI context. */
export function isLineMessageAiVisible(message: Record<string, any> | null | undefined): boolean {
  if (!message) return false;
  return !(message.status === 'deleted' || message.deletedAt || message.status === 'recalled' || message.isRecalled || message.isRecalledByOther);
}

export function deleteLineMessage(id: string, messageId: number | string) {
  const next = getLineConversationMessages(id).map(message =>
    String(message.id) === String(messageId)
      ? normalizeLineMessage(buildDeletedTombstone(message as any) as LineRuntimeMessage)
      : message
  );
  saveLineConversationMessages(id, next);
  return next;
}

export function editLineMessage(id: string, messageId: number | string, text: string) {
  return updateLineMessage(id, messageId, {
    text: text.trim(),
    edited: true,
    editedAt: new Date().toISOString(),
    status: 'sent',
  });
}

export function toggleLineReaction(id: string, messageId: number | string, emoji: string) {
  const current = getLineConversationMessages(id);
  const target = current.find(message => String(message.id) === String(messageId));
  if (!target) return current;
  const reactions = { ...(target.reactions || {}) };
  if (reactions[emoji]) delete reactions[emoji];
  else reactions[emoji] = 1;
  return updateLineMessage(id, messageId, { reactions });
}

export function setLineMessageFavorite(id: string, messageId: number | string, favorite: boolean) {
  return updateLineMessage(id, messageId, { favorite });
}

export function markLineMessageFailed(id: string, messageId: number | string, error: string) {
  return updateLineMessage(id, messageId, { status: 'failed', error });
}

export function markLineMessageDelivered(id: string, messageId: number | string) {
  return updateLineMessage(id, messageId, { status: 'delivered', error: undefined });
}

export function recordLineCall(
  id: string,
  input: { direction: 'incoming' | 'outgoing'; kind: 'audio' | 'video'; status: 'ringing' | 'connected' | 'ended' | 'missed'; duration?: number },
) {
  return appendLineMessage(id, {
    id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: input.direction === 'outgoing' ? 'user' : 'assistant',
    kind: 'call-record',
    text: input.status === 'missed' ? '未接来电' : `${input.kind === 'video' ? '视频' : '语音'}通话 · ${input.status === 'ended' ? Math.floor(input.duration || 0) + ' 秒' : input.status}`,
    createdAt: new Date().toISOString(),
    status: 'delivered',
    metadata: { call: input },
  });
}

export function searchLineMessages(id: string, query: string): LineRuntimeMessage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getLineConversationMessages(id).filter(message =>
    [
      message.text,
      message.metadata?.desc,
      message.metadata?.fileName,
      message.metadata?.transcript,
    ].some(value => String(value || '').toLowerCase().includes(q))
  );
}

export function getLineConversationPage(id: string, page = 0, pageSize = 80): LineRuntimeMessage[] {
  const all = getLineConversationMessages(id);
  const safeSize = Math.max(10, Math.min(200, pageSize));
  const end = Math.max(0, all.length - page * safeSize);
  return all.slice(Math.max(0, end - safeSize), end);
}

export function getLineConversationMeta(id: string): LineConversationMeta | null {
  const all = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  return all[id] || null;
}

export function touchLineConversation(id: string, patch: Partial<LineConversationMeta> = {}) {
  const all = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  const current = all[id] || {
    id,
    name: patch.name || id,
    isGroup: Boolean(patch.isGroup),
    updatedAt: new Date().toISOString(),
    unread: 0,
    muted: false,
    pinned: false,
  };
  all[id] = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  writeJson(META_KEY, all);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed', { detail: all[id] }));
  }
  return all[id];
}

export function markLineConversationRead(id: string, messageId?: number | string) {
  return touchLineConversation(id, {
    unread: 0,
    lastReadMessageId: messageId ?? getLineConversationMessages(id).at(-1)?.id ?? null,
  });
}

export function setLineConversationUnread(id: string, unread: number) {
  return touchLineConversation(id, { unread: Math.max(0, unread) });
}

export function getLineNotifications(): LineNotification[] {
  return readJson<LineNotification[]>(NOTIFICATION_KEY, []);
}

export function addLineNotification(input: Omit<LineNotification, 'id' | 'createdAt' | 'read'>) {
  const notification: LineNotification = {
    ...input,
    id: `line-notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const next = [notification, ...getLineNotifications()].slice(0, MAX_NOTIFICATIONS);
  writeJson(NOTIFICATION_KEY, next);
  window.dispatchEvent(new CustomEvent('sane333:line-notification', { detail: notification }));
  return notification;
}

export function markLineNotificationRead(id: string) {
  writeJson(NOTIFICATION_KEY, getLineNotifications().map(item => item.id === id ? { ...item, read: true } : item));
  window.dispatchEvent(new CustomEvent('sane333:line-notifications-changed'));
}

export function markAllLineNotificationsRead() {
  writeJson(NOTIFICATION_KEY, getLineNotifications().map(item => ({ ...item, read: true })));
  window.dispatchEvent(new CustomEvent('sane333:line-notifications-changed'));
}

export function markLineNotificationsReadForConversation(conversationId: string) {
  const next = getLineNotifications().map(item =>
    item.conversationId === conversationId ? { ...item, read: true } : item
  );
  writeJson(NOTIFICATION_KEY, next);
  window.dispatchEvent(new CustomEvent('sane333:line-notifications-changed'));
  return next;
}

export function getLineUnreadNotificationCount() {
  return getLineNotifications().filter(item => !item.read).length;
}

export interface LineBackup {
  version: 1;
  exportedAt: string;
  conversations: Record<string, LineRuntimeMessage[]>;
  metadata: Record<string, LineConversationMeta>;
  notifications: LineNotification[];
  /** This lightweight transcript backup does not include the separate IndexedDB media vault. */
  mediaIncluded?: false;
}

export function exportLineBackup(): LineBackup {
  const conversations: Record<string, LineRuntimeMessage[]> = {};
  if (typeof window !== 'undefined') {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(CONVERSATION_PREFIX)) {
        conversations[key.slice(CONVERSATION_PREFIX.length)] = readJson<LineRuntimeMessage[]>(key, []);
      }
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations,
    metadata: readJson<Record<string, LineConversationMeta>>(META_KEY, {}),
    notifications: getLineNotifications(),
    mediaIncluded: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function importLineBackup(backup: LineBackup) {
  if (typeof window === 'undefined') return;
  if (!isPlainRecord(backup) || backup.version !== 1) throw new Error('LINE_BACKUP_VERSION_UNSUPPORTED');
  if (!isPlainRecord(backup.conversations)) throw new Error('LINE_BACKUP_CONVERSATIONS_INVALID');
  if (!isPlainRecord(backup.metadata)) throw new Error('LINE_BACKUP_METADATA_INVALID');
  if (!Array.isArray(backup.notifications)) throw new Error('LINE_BACKUP_NOTIFICATIONS_INVALID');

  // Validate and normalize the entire payload before the first persistent write.
  const conversations = new Map<string, LineRuntimeMessage[]>();
  for (const [id, value] of Object.entries(backup.conversations)) {
    if (!id || id.length > 500 || !Array.isArray(value)) throw new Error('LINE_BACKUP_CONVERSATION_INVALID');
    const messages = value.map((message, index) => {
      if (!isPlainRecord(message)) throw new Error('LINE_BACKUP_MESSAGE_INVALID: ' + id + ':' + index);
      if (message.id !== undefined && typeof message.id !== 'string' && typeof message.id !== 'number') {
        throw new Error('LINE_BACKUP_MESSAGE_ID_INVALID: ' + id + ':' + index);
      }
      if (message.text !== undefined && typeof message.text !== 'string') {
        throw new Error('LINE_BACKUP_MESSAGE_TEXT_INVALID: ' + id + ':' + index);
      }
      return normalizeLineMessage(message as unknown as LineRuntimeMessage, index);
    });
    conversations.set(id, messages);
  }
  for (const [id, meta] of Object.entries(backup.metadata)) {
    if (!id || !isPlainRecord(meta) || typeof meta.name !== 'string' || typeof meta.isGroup !== 'boolean') {
      throw new Error('LINE_BACKUP_METADATA_ENTRY_INVALID: ' + id);
    }
  }
  const notifications = backup.notifications.map((item, index) => {
    if (!isPlainRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string') {
      throw new Error('LINE_BACKUP_NOTIFICATION_INVALID: ' + index);
    }
    return item as unknown as LineNotification;
  });

  const writes = new Map<string, string>();
  for (const [id, messages] of conversations) writes.set(conversationKey(id), JSON.stringify(messages));
  writes.set(META_KEY, JSON.stringify(backup.metadata));
  writes.set(NOTIFICATION_KEY, JSON.stringify(notifications));
  const previous = new Map<string, string | null>();
  for (const key of writes.keys()) previous.set(key, window.localStorage.getItem(key));

  const changed: string[] = [];
  try {
    for (const [key, serialized] of writes) {
      window.localStorage.setItem(key, serialized);
      changed.push(key);
      if (window.localStorage.getItem(key) !== serialized) throw new Error('LINE_BACKUP_WRITE_VERIFY_FAILED: ' + key);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const key of changed.reverse()) {
      try {
        const oldValue = previous.get(key);
        if (oldValue === null || oldValue === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, oldValue);
        if (window.localStorage.getItem(key) !== (oldValue ?? null)) rollbackFailed = true;
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      reportPersistenceIssue('line-backup-rollback', 'LINE 备份恢复失败，且自动回滚未能完整验证；请勿继续写入并保留原备份文件', error);
      throw new Error('LINE_BACKUP_IMPORT_ROLLBACK_FAILED');
    }
    throw new Error('LINE_BACKUP_IMPORT_FAILED_ROLLED_BACK: ' + (error instanceof Error ? error.message : 'unknown error'));
  }

  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
}

export function clearLineConversation(id: string) {
  if (typeof window === 'undefined') return;
  // 同步写空数组而不是删 key：删 key 会导致 usePersistentState 回退到初始值（如默认开场白），
  // 且若组件在 setMessages([]) 的 effect 执行前卸载，旧数据可能被残留的 effect 写回。
  // 写 [] 确保任何路径读取到的都是空。
  writeJson(conversationKey(id), []);
  const meta = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  delete meta[id];
  writeJson(META_KEY, meta);
  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
}

/**
 * Remove a character's LINE data.
 * When removeChatItem=false, the transcript stays accessible as an archived chat,
 * but it is detached from the deleted character so it can no longer recreate the contact.
 */
export function removeLineConversationData(id: string, options: { removeChatItem?: boolean } = {}) {
  if (typeof window === 'undefined' || !id) return;
  const removeChatItem = options.removeChatItem !== false;

  window.localStorage.removeItem(conversationKey(id));
  window.localStorage.removeItem(`line:custom-css:${id}`);
  window.localStorage.removeItem(`line:wallpaper:${id}`);
  window.localStorage.removeItem(`line:chat-api-override:${id}`);
  // 该会话的其余 per-conversation 设置也一并清理，否则同 id 重建会话时会读到幽灵旧配置。
  for (const key of [
    `line:opening-context:${id}`,
    `line:schedule:${id}`,
    `line:cot-active:${id}`,
    `line:cot-custom:${id}`,
    `line:preset:${id}`,
    `line:preset-temp:${id}`,
    `line:preset-context:${id}`,
    `line:status:${id}`,
    `line:status-regex:${id}`,
    `line:status-format:${id}`,
    `line:status-bar-active:${id}`,
    `line:offline-draft:${id}`,
    `line:offline-css:${id}`,
    `line:allow-role-message:${id}`,
  ]) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }

  const meta = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  delete meta[id];
  writeJson(META_KEY, meta);

  // Notifications are not part of the transcript, so they are always removed
  // when the character itself is deleted.
  writeJson(
    NOTIFICATION_KEY,
    getLineNotifications().filter(item => item.characterId !== id && item.conversationId !== id),
  );

  try {
    const rawChats = window.localStorage.getItem('line:chat-items');
    const chats = rawChats ? JSON.parse(rawChats) : [];
    if (Array.isArray(chats)) {
      const nextChats = removeChatItem
        ? chats.filter((item: any) => item.id !== id && item.characterId !== id)
        : chats.map((item: any) =>
            item.id === id || item.characterId === id
              ? { ...item, characterId: undefined, unread: 0, chatLabel: item.chatLabel || '已归档角色' }
              : item
          );
      window.localStorage.setItem('line:chat-items', JSON.stringify(nextChats));
    }
  } catch {
    // Chat-list cleanup is best-effort.
  }

  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
  window.dispatchEvent(new CustomEvent('sane333:line-notifications-changed'));
}

export interface BlankChatRepairReport {
  healthy: number;
  restored: Array<{ name: string; messages: number; from: string }>;
  recovered: Array<{ name: string; messages: number }>;
  deleted: string[];
  orphanedLeft: number;
}

function visibleChatMessages(messages: unknown): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m: any) => m && typeof m === 'object' && !m.deletedAt && !m.isDeleted);
}

/** 真实对话消息：排除系统提示（如“你们已经是好友了”）。只有系统问候的聊天视为空白。 */
function realChatMessages(messages: unknown): any[] {
  return visibleChatMessages(messages).filter((m: any) => m.role !== 'system' && m.kind !== 'system');
}

function safeReadArray(key: string): any[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lastMessagePreview(messages: any[]): { preview: string; time: string } {
  const visible = visibleChatMessages(messages);
  const last = visible[visible.length - 1];
  if (!last) return { preview: '', time: '' };
  const text = String(last.text || last.content || last.desc || '');
  return {
    preview: text ? (text.length > 30 ? text.slice(0, 30) + '…' : text) : (last.kind === 'image' ? '[图片]' : last.kind === 'voice' ? '[语音]' : ''),
    time: String(last.time || last.createdAt || ''),
  };
}

/**
 * 一键修复空白聊天：
 * 1. 聊天项有、消息为空 → 先到处找数据（旧版 NPC key / 角色 id / 名字 / 消息里的角色标识），找到就恢复到当前会话；
 * 2. 实在哪都找不到数据 → 删掉这个空白聊天项；
 * 3. 有消息但没有聊天项的孤儿会话 → 能认出主人的，重建聊天项恢复显示；认不出的不动，只计数。
 * 绝不删除任何带消息的数据，只删“确实空”的聊天项。
 */
export function repairBlankChats(): BlankChatRepairReport {
  const report: BlankChatRepairReport = { healthy: 0, restored: [], recovered: [], deleted: [], orphanedLeft: 0 };
  if (typeof window === 'undefined') return report;

  const chats: any[] = safeReadArray('line:chat-items');

  // 所有会话 key → 消息
  const convMap = new Map<string, any[]>();
  const convKeys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(CONVERSATION_PREFIX)) {
      convKeys.push(key);
      convMap.set(key, safeReadArray(key));
    }
  }
  const usedKeys = new Set<string>();

  const characters: any[] = safeReadArray('phone:characters');
  const npcs: any[] = safeReadArray('phone:npcs');
  const findCharacter = (id?: string, name?: string) => {
    if (id) {
      const byId = characters.find((c: any) => c && (c.id === id || sameIdentityId(c.id, id)));
      if (byId) return byId;
    }
    if (name) return characters.find((c: any) => c && c.name === name) || null;
    return null;
  };
  const findNpc = (id?: string, name?: string) => {
    if (id) {
      const byId = npcs.find((n: any) => n && (n.id === id || sameIdentityId(n.id, id)));
      if (byId) return byId;
    }
    if (name) return npcs.find((n: any) => n && n.name === name) || null;
    return null;
  };

  const keptChats: any[] = [];
  const meta = readJson<Record<string, LineConversationMeta>>(META_KEY, {});
  let metaChanged = false;

  for (const item of chats) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
    const directKey = conversationKey(item.id);
    const directMsgs = realChatMessages(convMap.get(directKey) || []);
    if (directMsgs.length > 0) {
      report.healthy++;
      usedKeys.add(directKey);
      keptChats.push(item);
      continue;
    }
    // 空白：按顺序找备用数据
    const candidates: string[] = [];
    if (!item.isGroup) {
      if (item.npcId) candidates.push(conversationKey(npcConversationId(item.npcId, item.personaId)));
      if (item.characterId) candidates.push(conversationKey(item.characterId));
      if (item.name) candidates.push(conversationKey(item.name));
    }
    let foundKey: string | null = null;
    for (const key of candidates) {
      if (realChatMessages(convMap.get(key) || []).length > 0) { foundKey = key; break; }
    }
    if (!foundKey && !item.isGroup) {
      // 按消息内容匹配：某会话的消息里带有该聊天的角色标识
      for (const key of convKeys) {
        if (usedKeys.has(key) || key === directKey || candidates.includes(key)) continue;
        const msgs = realChatMessages(convMap.get(key) || []);
        if (!msgs.length) continue;
        const hit = msgs.some((m: any) =>
          (item.characterId && (m.characterId === item.characterId || m.metadata?.characterId === item.characterId)) ||
          (item.npcId && (m.npcId === item.npcId || m.metadata?.npcId === item.npcId)) ||
          (item.name && m.senderName === item.name)
        );
        if (hit) { foundKey = key; break; }
      }
    }
    if (foundKey) {
      const msgs = convMap.get(foundKey) || [];
      writeJson(directKey, msgs);
      convMap.set(directKey, msgs);
      usedKeys.add(directKey);
      usedKeys.add(foundKey);
      const { preview, time } = lastMessagePreview(msgs);
      keptChats.push({ ...item, preview: preview || item.preview, time: time || item.time, unread: 0 });
      report.restored.push({ name: String(item.name || item.id), messages: realChatMessages(msgs).length, from: foundKey.replace(CONVERSATION_PREFIX, '') });
      continue;
    }
    // 确实没真实对话：删聊天项 + 清 meta + 删会话 key，否则聊天列表的恢复逻辑会用残留的系统问候把它复活
    report.deleted.push(String(item.name || item.id));
    if (meta[item.id]) { delete meta[item.id]; metaChanged = true; }
    try { window.localStorage.removeItem(directKey); } catch { /* ignore */ }
  }

  // 孤儿会话：有真实消息、无聊天项，能认出主人的重建
  for (const key of convKeys) {
    if (usedKeys.has(key)) continue;
    const msgs = realChatMessages(convMap.get(key) || []);
    if (!msgs.length) continue;
    const suffix = key.slice(CONVERSATION_PREFIX.length);
    let owner: any = null;
    let ownerKind: 'character' | 'npc' | null = null;
    const npcMatch = suffix.match(/^npc:([^:]+):persona:/);
    if (npcMatch) {
      owner = findNpc(npcMatch[1]);
      ownerKind = owner ? 'npc' : null;
    }
    if (!owner) {
      const ch = findCharacter(suffix, suffix);
      if (ch) { owner = ch; ownerKind = 'character'; }
    }
    if (!owner) {
      // 从消息里找角色标识
      for (const m of msgs) {
        const cid = m.characterId || m.metadata?.characterId;
        const nid = m.npcId || m.metadata?.npcId;
        if (nid && findNpc(nid)) { owner = findNpc(nid); ownerKind = 'npc'; break; }
        if (cid && findCharacter(cid)) { owner = findCharacter(cid); ownerKind = 'character'; break; }
        if (m.senderName) {
          const byName = findNpc(undefined, m.senderName) || findCharacter(undefined, m.senderName);
          if (byName) { owner = byName; ownerKind = findNpc(undefined, m.senderName) ? 'npc' : 'character'; break; }
        }
      }
    }
    if (!owner || !ownerKind) { report.orphanedLeft++; continue; }
    // 该主人已有聊天项就不再重建，避免重复
    const alreadyListed = keptChats.some((c: any) =>
      ownerKind === 'npc' ? c.npcId === owner.id : (c.characterId === owner.id && !c.npcId)
    );
    if (alreadyListed) { usedKeys.add(key); continue; }
    const { preview, time } = lastMessagePreview(msgs);
    const newId = 'recovered-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    // 恢复后的会话统一挂到新聊天项 id 下
    writeJson(conversationKey(newId), msgs);
    keptChats.push({
      id: newId,
      name: owner.name || suffix,
      characterId: ownerKind === 'character' ? owner.id : (owner.boundCharacterId || undefined),
      npcId: ownerKind === 'npc' ? owner.id : undefined,
      time: time || '刚刚',
      preview,
      unread: 0,
      isPinned: false,
      isMuted: false,
      draft: '',
      isGroup: false,
    });
    report.recovered.push({ name: String(owner.name || suffix), messages: msgs.length });
    usedKeys.add(key);
  }

  writeJson('line:chat-items', keptChats);
  if (metaChanged) writeJson(META_KEY, meta);
  window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
  return report;
}

export function bindLineRuntimeEvents() {
  if (typeof window === 'undefined') return () => {};
  const onProactive = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    const character = detail.character;
    if (!character?.id && !character?.name) return;
    const text = detail.text || detail.message || '收到一条新消息';

    // Prefer an explicitly supplied conversation ID. NPCs can have separate chats
    // for different LINE personas, so never write their proactive message to the
    // legacy characterId key (that would create a shared transcript across personas).
    let conversationId = String(detail.conversationId || detail.chatId || '').trim();
    const npcId = String(detail.npcId || detail.npc?.id || '').trim();
    const personaId = String(detail.personaId || '').trim();
    const isNpc = Boolean(npcId || detail.kind === 'npc' || detail.npc);
    const ambiguousConversation = detail.ambiguousConversation === true;
    if (!conversationId && !ambiguousConversation && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('line:chat-items');
        const chats = raw ? JSON.parse(raw) : [];
        if (Array.isArray(chats)) {
          const matches = chats.filter((chat: any) => {
            if (!chat || chat.isGroup) return false;
            if (npcId ? String(chat.npcId || '') !== npcId : String(chat.characterId || '') !== String(character.id || '')) return false;
            if (personaId && String(chat.personaId || '') !== personaId) return false;
            return true;
          });
          if (matches.length === 1) conversationId = String(matches[0].id || '');
        }
      } catch {
        // Malformed chat list: do not guess an NPC's persona-bound transcript.
      }
    }
    // For ordinary imported characters keep legacy compatibility. For NPCs, an
    // ambiguous/missing match means we notify only rather than leak into another chat.
    if (!conversationId && !isNpc && !ambiguousConversation) conversationId = String(character.id || character.name || '');
    if (conversationId && detail.persisted !== true) {
      // Some producers (including the scheduled proactive runtime) persist the
      // message before emitting this event. Do not append it a second time.
      appendLineMessage(conversationId, {
        id: detail.id || `proactive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant',
        text: String(text),
        kind: detail.kind || 'text',
        createdAt: detail.createdAt || new Date().toISOString(),
        status: 'delivered',
        metadata: {
          proactive: true,
          reason: detail.reason,
          eventId: detail.eventId,
          ...(npcId ? { npcId } : {}),
          ...(personaId ? { personaId } : {}),
        },
      });
    }
    addLineNotification({
      type: 'message',
      ...(conversationId ? { conversationId } : {}),
      // If an NPC message could not be assigned to one unique chat, keep it as
      // a notification only. A characterId fallback can route the tap into a
      // shared/legacy transcript and defeat the isolation guard above.
      ...((conversationId || !isNpc) ? { characterId: character.id } : {}),
      title: character.name || '新消息',
      body: String(text).slice(0, 120),
      payload: detail,
    });
  };
  const onWorldEvent = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    if (!['offline.invite', 'offline.accepted', 'offline.started', 'offline.completed'].includes(detail.type)) return;
    const bodyByType: Record<string, string> = {
      'offline.invite': '发来了一份线下邀约',
      'offline.accepted': '线下邀约已接受',
      'offline.started': '你们的线下剧情已经开始',
      'offline.completed': '这次见面已经结束并存档',
    };
    addLineNotification({
      type: 'invite',
      conversationId: detail.characterId,
      characterId: detail.characterId,
      title: detail.characterName || '线下剧情',
      body: bodyByType[detail.type] || '线下剧情有新进展',
      payload: detail,
    });
  };
  const onCall = (event: Event) => {
    const detail = (event as CustomEvent<any>).detail || {};
    addLineNotification({
      type: 'call',
      conversationId: detail.characterId,
      characterId: detail.characterId,
      title: detail.characterName || '来电',
      body: '有人正在呼叫你',
      payload: detail,
    });
  };
  window.addEventListener('sane333:proactive-message', onProactive);
  window.addEventListener('sane333:world-event', onWorldEvent);
  window.addEventListener('sane333:incoming-call', onCall);
  return () => {
    window.removeEventListener('sane333:proactive-message', onProactive);
    window.removeEventListener('sane333:world-event', onWorldEvent);
    window.removeEventListener('sane333:incoming-call', onCall);
  };
}

export function buildLineTranscript(id: string, limit = 120) {
  return getLineConversationMessages(id)
    .slice(-limit)
    .map(message => `${message.role || 'unknown'}: ${message.text || '[媒体消息]'}`)
    .join('\n');
}

export function recordOfflineEventInLine(event: OfflineEvent) {
  if (event.status === 'draft' || event.status === 'declined') return;
  let id = event.conversationId || '';
  if (!id && event.personaId) {
    // Never send persona-scoped event updates to a shared legacy transcript.
    const chats = readJson<any[]>('line:chat-items', []);
    const matches = Array.isArray(chats) ? chats.filter(chat =>
      chat && !chat.isGroup && !chat.npcId &&
      String(chat.characterId || '') === String(event.characterId || '') &&
      String(chat.personaId || '') === String(event.personaId)
    ) : [];
    if (matches.length === 1 && matches[0].id) id = String(matches[0].id);
    else {
      reportPersistenceIssue('offline-event-line', '线下剧情状态未写入聊天：无法唯一确定对应用户人设会话', new Error('AMBIGUOUS_PERSONA_CONVERSATION'));
      return;
    }
  }
  if (!id) id = event.characterId || event.characterName;
  appendLineMessage(id, {
    id: `offline-${event.id}-${event.status}`,
    role: 'system',
    kind: 'offline-invite',
    text: event.status === 'completed' ? `线下剧情已完成：${event.title}` : `线下剧情状态更新：${event.title}`,
    metadata: { offlineEventId: event.id, location: event.location, time: event.time, status: event.status, ...(event.personaId ? { personaId: event.personaId } : {}) },
  });
}

/* ------------------------------------------------------------------ */
/* Role + identity-prefix storage migrations (one-time, idempotent).   */
/* Role decides side ONLY (user/assistant/system). senderType decides  */
/* only avatar/name/character-vs-NPC rules. sender is deleted.          */
/* Character ids use char: prefix, NPC ids use npc: prefix (colon).    */
/* ------------------------------------------------------------------ */

/** Strip a leading char:/npc:/char-/npc- prefix → bare id (for tolerant lookup). */
export function bareIdentityId(id: unknown): string {
  return String(id || '').replace(/^(?:char|npc)[:-]/i, '');
}

export function withCharPrefix(id: unknown): string {
  const bare = bareIdentityId(id);
  return bare ? `char:${bare}` : '';
}

export function withNpcPrefix(id: unknown): string {
  const bare = bareIdentityId(id);
  return bare ? `npc:${bare}` : '';
}

/** NPC conversation key, always built from the bare NPC id so old (npc-xxx)
 *  and new (npc:xxx) record ids produce the identical key. */
export function npcConversationId(npcId: string, personaId?: string | null): string {
  return `npc:${bareIdentityId(npcId)}:persona:${personaId || 'legacy'}`;
}

/** Prefix-tolerant identity equality: char:X, char-X and X all match. */
export function sameIdentityId(a: unknown, b: unknown): boolean {
  const left = bareIdentityId(a);
  const right = bareIdentityId(b);
  return Boolean(left) && left === right;
}

const ID_PREFIX_MIGRATION_KEY = 'line:fix-id-prefix-v1';

function listConversationKeys(): string[] {
  if (typeof window === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(CONVERSATION_PREFIX)) keys.push(key);
  }
  return keys;
}

function readJsonArray(key: string): any[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Safe to run on every mount/open: imported legacy messages still get a normalized role. */
export function migrateLineMessagesToRole(): { conversations: number; messages: number } {
  const empty = { conversations: 0, messages: 0 };
  if (typeof window === 'undefined') return empty;
  try {
      let conversations = 0;
    let messages = 0;
    for (const key of listConversationKeys()) {
      try {
        const list = readJsonArray(key);
        let changed = false;
        const next = list.map((item: any, index: number) => {
          if (!item || typeof item !== 'object') return item;
          const normalized = normalizeLineMessage(item, index);
          if (JSON.stringify(normalized) !== JSON.stringify(item)) changed = true;
          return normalized;
        });
        if (changed) {
          window.localStorage.setItem(key, JSON.stringify(next));
          conversations++;
          messages += next.length;
        }
      } catch {
        // Corrupt conversation keys are reported by phone diagnostics; skip them.
      }
    }
    return { conversations, messages };
  } catch {
    return empty;
  }
}

export interface LineIdentityMigrationReport {
  charactersRenamed: number;
  npcsRenamed: number;
  conversationKeysRenamed: number;
  messageIdentitiesPrefixed: number;
  skipped: string[];
}

/**
 * One-time: prefix character record ids with char: and NPC record ids with
 * npc:. Only membership-certain renames happen: an id is renamed only when
 * it is found in the character or NPC store. Conversation keys derived from
 * renamed character ids are renamed together with their chat-item and
 * runtime-meta references; npc: conversation keys are intentionally left
 * alone because npcConversationId() builds them from bare ids, so old and
 * new NPC ids already produce identical keys. Anything that cannot be
 * mapped (names, stale ids, c_/group- keys) is left unchanged and reported.
 */
export function migrateLineIdentityPrefixes(): LineIdentityMigrationReport {
  const report: LineIdentityMigrationReport = {
    charactersRenamed: 0,
    npcsRenamed: 0,
    conversationKeysRenamed: 0,
    messageIdentitiesPrefixed: 0,
    skipped: [],
  };
  if (typeof window === 'undefined') return report;
  try {
    if (window.localStorage.getItem(ID_PREFIX_MIGRATION_KEY)) return report;
    const skip = (sample: string) => {
      if (report.skipped.length < 20) report.skipped.push(sample);
    };

    // 1. Character + NPC store records.
    const charMap = new Map<string, string>();
    const characters = readJsonArray('phone:characters');
    let charsChanged = false;
    const nextCharacters = characters.map((record: any) => {
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) return record;
      if (record.id.startsWith('char:')) return record;
      const nextId = withCharPrefix(record.id);
      if (!nextId || nextId === record.id) return record;
      charMap.set(record.id, nextId);
      charsChanged = true;
      report.charactersRenamed++;
      return { ...record, id: nextId };
    });
    if (charsChanged) window.localStorage.setItem('phone:characters', JSON.stringify(nextCharacters));

    const npcMap = new Map<string, string>();
    const npcs = readJsonArray('phone:npcs');
    let npcsChanged = false;
    const nextNpcs = npcs.map((record: any) => {
      if (!record || typeof record !== 'object') return record;
      let next = record;
      if (typeof record.id === 'string' && record.id && !record.id.startsWith('npc:')) {
        const nextId = withNpcPrefix(record.id);
        if (nextId && nextId !== record.id) {
          npcMap.set(record.id, nextId);
          npcsChanged = true;
          report.npcsRenamed++;
          next = { ...next, id: nextId };
        }
      }
      for (const field of ['boundCharacterId', 'sourceCharacterId'] as const) {
        const value = (next as any)[field];
        if (typeof value === 'string' && value && !value.startsWith('char:')) {
          if (charMap.has(value)) {
            next = { ...next, [field]: charMap.get(value) };
            npcsChanged = true;
          } else {
            skip(`npc bound ${field}=${value} (no character record)`);
          }
        }
      }
      return next;
    });
    if (npcsChanged) window.localStorage.setItem('phone:npcs', JSON.stringify(nextNpcs));

    const mapId = (value: unknown): string | null => {
      if (typeof value !== 'string' || !value) return null;
      if (value.startsWith('char:') || value.startsWith('npc:')) return null;
      if (charMap.has(value)) return charMap.get(value) as string;
      if (npcMap.has(value)) return npcMap.get(value) as string;
      return null;
    };

    // 2. Conversation keys derived from renamed character/NPC ids, plus the
    // chat-item and runtime-meta rows that point at those conversations.
    const renameConversationRefs = (rows: any[]): boolean => {
      let changed = false;
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        if (typeof row.id === 'string' && (charMap.has(row.id) || npcMap.has(row.id))) {
          row.id = mapId(row.id);
          changed = true;
        }
        if (typeof row.characterId === 'string') {
          const mapped = mapId(row.characterId);
          if (mapped) { row.characterId = mapped; changed = true; }
        }
        if (typeof row.npcId === 'string') {
          const mapped = mapId(row.npcId);
          if (mapped) { row.npcId = mapped; changed = true; }
        }
      }
      return changed;
    };
    for (const key of listConversationKeys()) {
      const suffix = key.slice(CONVERSATION_PREFIX.length);
      const mapped = mapId(suffix);
      if (!mapped) continue;
      const newKey = CONVERSATION_PREFIX + mapped;
      if (window.localStorage.getItem(newKey) !== null) {
        skip(`conversation key collision: ${suffix} -> ${mapped}`);
        continue;
      }
      const value = window.localStorage.getItem(key);
      if (value === null) continue;
      window.localStorage.setItem(newKey, value);
      window.localStorage.removeItem(key);
      report.conversationKeysRenamed++;
    }
    const chatItems = readJsonArray('line:chat-items');
    if (renameConversationRefs(chatItems)) window.localStorage.setItem('line:chat-items', JSON.stringify(chatItems));
    try {
      const metaRaw = window.localStorage.getItem(META_KEY);
      const meta = metaRaw ? JSON.parse(metaRaw) : {};
      if (meta && typeof meta === 'object') {
        let metaChanged = false;
        for (const [metaId, row] of Object.entries<any>(meta)) {
          const mapped = mapId(metaId);
          if (mapped) {
            meta[mapped] = row;
            delete meta[metaId];
            metaChanged = true;
          }
          if (row && typeof row === 'object') {
            if (typeof row.characterId === 'string') {
              const next = mapId(row.characterId);
              if (next) { row.characterId = next; metaChanged = true; }
            }
            if (typeof row.npcId === 'string') {
              const next = mapId(row.npcId);
              if (next) { row.npcId = next; metaChanged = true; }
            }
          }
        }
        if (metaChanged) window.localStorage.setItem(META_KEY, JSON.stringify(meta));
      }
    } catch {
      // Meta is rebuilt from chat items; a corrupt blob must not block migration.
    }

    // 3. Friends list + group members (mechanical, membership-mapped only).
    const friends = readJsonArray('line:friends-list');
    if (renameConversationRefs(friends)) window.localStorage.setItem('line:friends-list', JSON.stringify(friends));
    const groups = readJsonArray('line:groups');
    let groupsChanged = false;
    for (const group of groups) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.members)) continue;
      for (const member of group.members) {
        if (!member || typeof member !== 'object') continue;
        for (const field of ['characterId', 'npcId'] as const) {
          if (typeof member[field] === 'string') {
            const mapped = mapId(member[field]);
            if (mapped) { member[field] = mapped; groupsChanged = true; }
          }
        }
      }
    }
    if (groupsChanged) window.localStorage.setItem('line:groups', JSON.stringify(groups));

    // 4. Message identity fields, membership-mapped only. Anything not found
    // in either store is left unchanged (name, stale id, or bound reference).
    for (const key of listConversationKeys()) {
      try {
        const list = readJsonArray(key);
        let changed = false;
        const next = list.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          let nextItem = item;
          let itemChanged = false;
          for (const field of ['senderId', 'characterId', 'npcId'] as const) {
            if (typeof nextItem[field] === 'string') {
              const mapped = mapId(nextItem[field]);
              if (mapped) { nextItem = { ...nextItem, [field]: mapped }; itemChanged = true; }
            }
          }
          if (nextItem.metadata && typeof nextItem.metadata === 'object') {
            for (const field of ['characterId', 'npcId'] as const) {
              if (typeof nextItem.metadata[field] === 'string') {
                const mapped = mapId(nextItem.metadata[field]);
                if (mapped) {
                  nextItem = { ...nextItem, metadata: { ...nextItem.metadata, [field]: mapped } };
                  itemChanged = true;
                }
              }
            }
          }
          if (itemChanged) { changed = true; report.messageIdentitiesPrefixed++; }
          return nextItem;
        });
        if (changed) window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Skip corrupt conversation keys; diagnostics reports them.
      }
    }

    window.localStorage.setItem(ID_PREFIX_MIGRATION_KEY, '1');
    return report;
  } catch {
    return report;
  }
}

/** Run storage migrations; role migration is idempotent, identity migration is one-time. */
export function runLineStorageMigrations(): { role: { conversations: number; messages: number }; identity: LineIdentityMigrationReport } {
  return {
    role: migrateLineMessagesToRole(),
    identity: migrateLineIdentityPrefixes(),
  };
}


