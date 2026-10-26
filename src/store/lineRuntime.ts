import type { OfflineEvent } from '../types';
import { reportPersistenceIssue } from './usePersistentState';
import { removeMemoryByMessage } from './characterMemory';

export type LineMessageKind =
  | 'text' | 'image' | 'video' | 'file' | 'voice' | 'sticker'
  | 'text-image' | 'text-video' | 'ai-card' | 'real-media' | 'ai-reply'
  | 'system' | 'offline-invite' | 'music-invite' | 'music-together' | 'call' | 'call-record'
  | 'system-nudge' | 'html-interlude'
  | 'transfer' | 'red-packet' | 'location';

export interface LineRuntimeMessage {
  id: number | string;
  sender?: 'me' | 'other' | 'system' | string;
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

export function saveLineConversationMessages(id: string, messages: LineRuntimeMessage[]) {
  const normalized = messages.map(normalizeLineMessage);
  writeJson(conversationKey(id), normalized);
  return normalized;
}

export function normalizeLineMessage(message: LineRuntimeMessage, fallbackIndex = 0): LineRuntimeMessage {
  const legacyTimestamp = (message as LineRuntimeMessage & { timestamp?: string | number }).timestamp;
  const timestampValue = message.createdAt || (
    typeof legacyTimestamp === 'number'
      ? new Date(legacyTimestamp < 1e12 ? legacyTimestamp * 1000 : legacyTimestamp).toISOString()
      : legacyTimestamp
  );
  return {
    ...message,
    id: message.id ?? `line-msg-${Date.now()}-${fallbackIndex}`,
    // Do not invent "today" for imported/legacy messages that have no real timestamp.
    // Real timestamps are preserved; new messages already receive createdAt when created.
    ...(timestampValue ? { createdAt: timestampValue } : { createdAt: undefined }),
    status: message.status || (message.sender === 'me' ? 'sent' : 'delivered'),
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
  const nextUnread = nextMessage.sender === 'other'
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
  const next = getLineConversationMessages(id).map(message =>
    String(message.id) === String(messageId) ? normalizeLineMessage({ ...message, ...patch }) : message
  );
  saveLineConversationMessages(id, next);
  return next;
}

export function recallLineMessage(id: string, messageId: number | string) {
  return updateLineMessage(id, messageId, {
    text: '你撤回了一条消息',
    status: 'recalled',
    recalledAt: new Date().toISOString(),
  });
}

export function deleteLineMessage(id: string, messageId: number | string) {
  // 先拿到原文：删掉的聊天内容不应再留在角色记忆里。
  const target = getLineConversationMessages(id).find(message => String(message.id) === String(messageId));
  const deletedText = String((target as { text?: unknown } | undefined)?.text || '').trim();
  const next = updateLineMessage(id, messageId, {
    text: '',
    status: 'deleted',
    deletedAt: new Date().toISOString(),
  });
  if (deletedText) {
    try {
      // 会话 id 可能是 `npc:{npcId}:persona:{personaId}` 格式，记忆 key 用 characterId[/persona]。
      const npcMatch = /^npc:(.+):persona:(.+)$/.exec(id);
      if (npcMatch) {
        removeMemoryByMessage(npcMatch[1], deletedText, npcMatch[2] === 'legacy' ? null : npcMatch[2]);
      } else {
        removeMemoryByMessage(id, deletedText);
      }
    } catch {
      // 记忆清理是尽力而为，不影响删除本身。
    }
  }
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
    sender: input.direction === 'outgoing' ? 'me' : 'other',
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
  };
}

export function importLineBackup(backup: LineBackup) {
  if (typeof window === 'undefined') return;
  if (!backup || backup.version !== 1) throw new Error('LINE_BACKUP_VERSION_UNSUPPORTED');
  for (const [id, messages] of Object.entries(backup.conversations || {})) {
    saveLineConversationMessages(id, messages);
  }
  writeJson(META_KEY, backup.metadata || {});
  writeJson(NOTIFICATION_KEY, backup.notifications || []);
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
        sender: 'other',
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
    .map(message => `${message.sender || 'unknown'}: ${message.text || '[媒体消息]'}`)
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
    sender: 'system',
    kind: 'offline-invite',
    text: event.status === 'completed' ? `线下剧情已完成：${event.title}` : `线下剧情状态更新：${event.title}`,
    metadata: { offlineEventId: event.id, location: event.location, time: event.time, status: event.status, ...(event.personaId ? { personaId: event.personaId } : {}) },
  });
}
