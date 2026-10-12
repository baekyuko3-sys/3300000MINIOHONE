export type LineMessageStatus = 'sending' | 'receiving' | 'sent' | 'read' | 'failed' | 'recalled';

export function lineNowTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function normalizeLineMessage(message: any, fallbackSender: 'me' | 'other' = 'other') {
  const sender = message?.sender || fallbackSender;
  const isIncoming = sender !== 'me';
  return {
    ...message,
    sender,
    time: message?.time || lineNowTime(),
    status: message?.status || (isIncoming ? 'sent' : 'sent'),
    isRead: Boolean(message?.isRead),
  };
}

export function nextLineUnread(current: number, message: any, conversationIsOpen: boolean) {
  if (!message || message.sender === 'me' || conversationIsOpen || message.isRead) return Number(current || 0);
  return Number(current || 0) + 1;
}

export function markLineMessagesRead(messages: any[]) {
  return messages.map(message =>
    message.sender === 'me'
      ? { ...message, isRead: true, status: message.status === 'sending' || message.status === 'failed' ? message.status : 'read' }
      : { ...message, isRead: true, status: message.status === 'recalled' ? 'recalled' : 'read' }
  );
}

export function linePreview(message: any): string {
  const type = String(message?.type || message?.kind || '');
  const category = String(message?.category || message?.metadata?.category || '');
  const title = String(message?.title || '');
  const body = String(message?.desc || message?.text || message?.metadata?.desc || '').replace(/\s+/g, ' ').trim();
  if (type === 'text-image' || message?.textCard || (type === 'ai-card' && (category === 'image' || title === '文字图片'))) {
    return (body ? '[图片卡片] ' + body : '[图片卡片]').slice(0, 80);
  }
  if (type === 'text-video' || message?.videoCard || (type === 'ai-card' && (category === 'video' || title === '文字视频'))) {
    return (body ? '[视频卡片] ' + body : '[视频卡片]').slice(0, 80);
  }
  if (type === 'voice' || category === 'voice' || title === '文字语音') {
    const voiceText = String(message?.transcript || message?.desc || message?.text || '').replace(/\s+/g, ' ').trim();
    return (voiceText ? '[语音] ' + voiceText : '[语音]').slice(0, 80);
  }
  if (type === 'music-together' || type === 'music-invite') {
    const title = String(
      message?.musicSession?.title
      || message?.musicSession?.track?.name
      || message?.metadata?.musicSession?.title
      || message?.metadata?.musicSession?.track?.name
      || ''
    ).trim();
    return (title ? '♪ 邀请一起听《' + title + '》' : '♪ 邀请一起听').slice(0, 80);
  }
  return String(
    message?.text ||
    message?.transcript ||
    (message?.type === 'offline-invite' ? '💌 线下剧情邀约' : '') ||
    (message?.type === 'real-media' ? '[媒体] ' + (message?.fileName || '附件') : '') ||
    (message?.type === 'ai-card' ? '[' + (message?.title || '多媒体') + ']' : '') ||
    '新消息'
  ).replace(/\s+/g, ' ').slice(0, 80);
}

export function appendLineRuntimeMessage(conversationId: string, message: any) {
  if (typeof window === 'undefined' || !conversationId) return null;
  const key = 'line:conversation:' + conversationId;
  try {
    const raw = window.localStorage.getItem(key);
    const current = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(current) ? current : [];
    const normalized = normalizeLineMessage({
      ...message,
      id: message?.id ?? Date.now(),
      time: message?.time || lineNowTime(),
    }, message?.sender === 'me' ? 'me' : 'other');
    if (list.some(item => String(item?.id) === String(normalized.id))) return normalized;
    window.localStorage.setItem(key, JSON.stringify([...list, normalized].slice(-300)));
    const rawChats = window.localStorage.getItem('line:chat-items');
    const chats = rawChats ? JSON.parse(rawChats) : [];
    if (Array.isArray(chats)) {
      const next = chats.map(item =>
        item.id === conversationId || item.characterId === conversationId
          ? { ...item, time: normalized.time, preview: linePreview(normalized), unread: nextLineUnread(item.unread, normalized, false) }
          : item
      );
      window.localStorage.setItem('line:chat-items', JSON.stringify(next));
    }
    window.dispatchEvent(new CustomEvent('sane333:line-runtime-message', { detail: { conversationId, message: normalized } }));
    return normalized;
  } catch {
    return null;
  }
}

export function appendOfflineEventToLine(event: any, text: string, status: string) {
  const conversationId = event?.characterId || event?.characterName;
  if (!conversationId) return null;
  return appendLineRuntimeMessage(conversationId, {
    id: 'offline-event-' + event.id + '-' + status,
    sender: 'other',
    senderName: event.characterName,
    type: 'offline-event',
    offlineEventId: event.id,
    offlineEventStatus: status,
    text,
    time: lineNowTime(),
    status: 'sent',
    isRead: false,
  });
}
