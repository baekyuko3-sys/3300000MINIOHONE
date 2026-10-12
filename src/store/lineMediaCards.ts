export const TEXT_IMAGE_TYPE = 'text-image';
export const TEXT_VIDEO_TYPE = 'text-video';

export type LineMediaCardKind = typeof TEXT_IMAGE_TYPE | typeof TEXT_VIDEO_TYPE;

export type LineMediaCardSegment = {
  text: string;
  type?: LineMediaCardKind | string;
  desc?: string;
  cardStyle?: string;
  category?: 'image' | 'video';
  duration?: number;
};

function messageType(message: any): string {
  return String(message?.type || message?.kind || message?.metadata?.cardKind || '').trim();
}

function messageCategory(message: any): string {
  return String(message?.category || message?.metadata?.category || '').trim().toLowerCase();
}

function messageBody(message: any): string {
  return String(
    message?.desc ||
    message?.text ||
    message?.content ||
    message?.metadata?.desc ||
    ''
  ).trim();
}

export function isLineTextImageCard(message: any): boolean {
  const type = messageType(message);
  const category = messageCategory(message);
  const title = String(message?.title || '');
  if (type === TEXT_IMAGE_TYPE || type === 'text-card') return true;
  if (message?.textCard && !message?.videoCard) return true;
  if (type === 'ai-card' && (category === 'image' || title === '文字图片')) return true;
  return false;
}

export function isLineTextVideoCard(message: any): boolean {
  const type = messageType(message);
  const category = messageCategory(message);
  const title = String(message?.title || '');
  if (type === TEXT_VIDEO_TYPE) return true;
  if (message?.videoCard) return true;
  if (type === 'ai-card' && (category === 'video' || title === '文字视频')) return true;
  return false;
}

export function isLineVroomCard(message: any): boolean {
  return isLineTextImageCard(message) || isLineTextVideoCard(message);
}

export function isLineVoiceMessage(message: any): boolean {
  const type = messageType(message);
  const category = messageCategory(message);
  const title = String(message?.title || message?.metadata?.title || '').trim();
  if (type === 'voice') return true;
  if (category === 'voice') return true;
  if (title === '文字语音') return true;
  if (String(message?.metadata?.mediaType || message?.mediaType || '').toLowerCase() === 'voice') return true;
  return false;
}

function estimateVoiceDurationSeconds(message: any): number {
  const raw = message?.duration ?? message?.metadata?.duration;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const text = String(raw).trim();
    const mmss = text.match(/^(\d+):(\d{1,2})$/);
    if (mmss) return Math.max(1, parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10));
    const num = text.match(/(\d+)/);
    if (num) return Math.max(1, parseInt(num[1], 10));
  }
  const body = messageBody(message);
  return Math.max(1, Math.round(body.length / 5));
}

export function lineCardStyleOf(message: any, fallback = 'a'): string {
  const raw = String(
    message?.cardStyle ||
    message?.textCard?.style ||
    message?.videoCard?.style ||
    message?.metadata?.cardStyle ||
    fallback ||
    'a'
  ).trim();
  // Normalize accidental JSON-quoted style ids from older builds.
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch {
      return raw.slice(1, -1).trim() || fallback;
    }
  }
  return raw || fallback;
}

export function lineCardHistoryText(message: any): string {
  const body = messageBody(message);
  if (isLineTextImageCard(message)) {
    return '[文字图片卡片，你看到的画面] ' + (body || '（无描述）');
  }
  if (isLineTextVideoCard(message)) {
    return '[文字视频卡片，你刚看完的短片] ' + (body || '（无描述）');
  }
  if (isLineVoiceMessage(message)) {
    const transcript = String(
      message?.transcript || message?.desc || message?.text || message?.metadata?.transcript || body || ''
    ).trim();
    return '[语音消息] ' + (transcript || '（无转写）');
  }
  return body;
}

export function lineCardPreview(message: any): string | null {
  if (isLineTextImageCard(message)) {
    const body = messageBody(message).replace(/\s+/g, ' ').slice(0, 48);
    return body ? `[图片卡片] ${body}` : '[图片卡片]';
  }
  if (isLineTextVideoCard(message)) {
    const body = messageBody(message).replace(/\s+/g, ' ').slice(0, 48);
    return body ? `[视频卡片] ${body}` : '[视频卡片]';
  }
  if (isLineVoiceMessage(message)) {
    const transcript = String(
      message?.transcript || message?.desc || message?.text || message?.metadata?.transcript || ''
    ).replace(/\s+/g, ' ').trim().slice(0, 48);
    return transcript ? `[语音] ${transcript}` : '[语音]';
  }
  return null;
}

/** Chat settings persist via usePersistentState (JSON). Always parse the same way. */
export function readStoredLineCardStyle(kind: 'image' | 'video'): string {
  if (typeof window === 'undefined') return 'a';
  try {
    const key = kind === 'video' ? 'line:videocard-style' : 'line:textcard-style';
    const raw = window.localStorage.getItem(key);
    if (raw === null || raw === '') return 'a';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch {
      // Legacy plain-string writes
      const plain = raw.trim();
      if (plain) return plain.replace(/^["']|["']$/g, '') || 'a';
    }
    return 'a';
  } catch {
    return 'a';
  }
}

function resolveBuildDuration(kind: 'image' | 'video', duration?: number): number | undefined {
  if (kind !== 'video') return undefined;
  const n = Number(duration);
  if (Number.isFinite(n) && n > 0) return Math.min(599, Math.max(1, Math.round(n)));
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem('line:videocard-duration');
    if (raw == null || raw === '') return undefined;
    const parsed = JSON.parse(raw);
    const stored = Number(parsed);
    if (Number.isFinite(stored) && stored > 0) return Math.min(599, Math.max(1, Math.round(stored)));
  } catch {
    // ignore
  }
  return undefined;
}

export function buildLineVroomCardMessage(input: {
  id?: number | string;
  sender?: 'me' | 'other' | string;
  senderName?: string;
  characterId?: string;
  kind: 'image' | 'video';
  text: string;
  cardStyle?: string;
  duration?: number;
  createdAt?: string;
}): Record<string, unknown> {
  const type = input.kind === 'video' ? TEXT_VIDEO_TYPE : TEXT_IMAGE_TYPE;
  const text = String(input.text || '').trim();
  const cardStyle = input.cardStyle || readStoredLineCardStyle(input.kind);
  const duration = resolveBuildDuration(input.kind, input.duration);
  return {
    id: input.id ?? Date.now(),
    sender: input.sender || 'me',
    senderName: input.senderName,
    characterId: input.characterId,
    type,
    kind: type,
    category: input.kind,
    title: input.kind === 'video' ? '文字视频' : '文字图片',
    descTitle: input.kind === 'video' ? '视频描述' : '图片描述',
    desc: text,
    text,
    content: text,
    cardStyle,
    duration,
    textCard: input.kind === 'image' ? { style: cardStyle, collapsed: true } : undefined,
    videoCard: input.kind === 'video' ? { style: cardStyle, duration } : undefined,
    time: '刚刚',
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: {
      cardKind: type,
      category: input.kind,
      cardStyle,
      desc: text,
      duration,
    },
  };
}

export function hydrateLineChatMessage(message: any) {
  if (!message || typeof message !== 'object') return message;
  const type = messageType(message);
  const next: Record<string, unknown> = {
    ...message,
    type: type || message.type,
    text: message.text || message.content || message.desc || message.metadata?.desc,
    desc: message.desc || message.metadata?.desc || message.text,
    cardStyle: lineCardStyleOf(message),
    category: message.category || message.metadata?.category,
  };
  if (isLineTextImageCard(next)) {
    const cardStyle = lineCardStyleOf(next, readStoredLineCardStyle('image'));
    next.type = TEXT_IMAGE_TYPE;
    next.kind = TEXT_IMAGE_TYPE;
    next.category = 'image';
    next.cardStyle = cardStyle;
    next.textCard = next.textCard && typeof next.textCard === 'object'
      ? { ...(next.textCard as object), style: cardStyle }
      : { style: cardStyle, collapsed: true };
    next.metadata = { ...(typeof next.metadata === 'object' && next.metadata ? next.metadata as object : {}), cardKind: TEXT_IMAGE_TYPE, category: 'image', cardStyle, desc: next.desc };
  }
  if (isLineTextVideoCard(next)) {
    const cardStyle = lineCardStyleOf(next, readStoredLineCardStyle('video'));
    const durationRaw = Number(
      next.duration ??
      (next.videoCard as any)?.duration ??
      (next.metadata as any)?.duration
    );
    const duration = Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.min(599, Math.max(1, Math.round(durationRaw)))
      : undefined;
    next.type = TEXT_VIDEO_TYPE;
    next.kind = TEXT_VIDEO_TYPE;
    next.category = 'video';
    next.cardStyle = cardStyle;
    if (duration) next.duration = duration;
    next.videoCard = next.videoCard && typeof next.videoCard === 'object'
      ? { ...(next.videoCard as object), style: cardStyle, ...(duration ? { duration } : {}) }
      : { style: cardStyle, ...(duration ? { duration } : {}) };
    next.metadata = {
      ...(typeof next.metadata === 'object' && next.metadata ? next.metadata as object : {}),
      cardKind: TEXT_VIDEO_TYPE,
      category: 'video',
      cardStyle,
      desc: next.desc,
      ...(duration ? { duration } : {}),
    };
  }
  if (isLineVoiceMessage(next)) {
    const transcript = String(
      next.transcript ||
      next.desc ||
      next.text ||
      (next.metadata as any)?.transcript ||
      (next.metadata as any)?.desc ||
      ''
    ).trim();
    const durationSeconds = estimateVoiceDurationSeconds(next);
    next.type = 'voice';
    next.kind = 'voice';
    next.category = 'voice';
    next.transcript = transcript;
    next.duration = next.duration ?? durationSeconds;
    next.mediaRef = next.mediaRef || (next.metadata as any)?.mediaRef;
    next.audioUrl = next.audioUrl || (next.metadata as any)?.audioUrl;
    next.metadata = {
      ...(typeof next.metadata === 'object' && next.metadata ? next.metadata as object : {}),
      mediaType: 'voice',
      category: 'voice',
      transcript,
      duration: next.duration,
      mediaRef: next.mediaRef,
      audioUrl: next.audioUrl,
    };
  }
  return next;
}

export function expandLineReplyIntoMessages(
  source: string,
  splitPlain: (text: string) => string[],
  base: {
    id: number | string;
    sender?: string;
    senderName?: string;
    characterId?: string;
    extras?: Record<string, unknown>;
  },
) {
  const segments = materializeLineReplyMessages(source, splitPlain);
  return segments.map((segment, index) => {
    const id = index === 0 ? base.id : `${base.id}-${index}`;
    const extras = index === 0 ? (base.extras || {}) : {};
    if (segment.type === TEXT_IMAGE_TYPE || segment.type === TEXT_VIDEO_TYPE) {
      const card = buildLineVroomCardMessage({
        id,
        sender: base.sender || 'other',
        senderName: base.senderName,
        characterId: base.characterId,
        kind: segment.category === 'video' ? 'video' : 'image',
        text: segment.text,
        cardStyle: segment.cardStyle,
        duration: segment.duration,
      });
      return {
        ...card,
        turnId: String(base.id),
        ...extras,
        metadata: {
          ...(card.metadata as object),
          ...((extras.metadata && typeof extras.metadata === 'object') ? extras.metadata as object : {}),
        },
      };
    }
    return {
      id,
      turnId: String(base.id),
      sender: base.sender || 'other',
      senderName: base.senderName,
      characterId: base.characterId,
      text: segment.text,
      content: segment.text,
      time: '刚刚',
      createdAt: new Date().toISOString(),
      type: 'ai-reply',
      ...extras,
    };
  });
}

const CARD_TAG_RE = /<(text-image|text-video)(\s+[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;

export function splitTextWithMediaCards(source: string): LineMediaCardSegment[] {
  const text = String(source || '');
  const segments: LineMediaCardSegment[] = [];
  let lastIndex = 0;
  CARD_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CARD_TAG_RE.exec(text))) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) segments.push({ text: before });
    const attrs = match[2] || '';
    const style = attrs.match(/style\s*=\s*["']([^"']+)["']/i)?.[1];
    const durationAttr = attrs.match(/duration\s*=\s*["']?(\d+)["']?/i)?.[1];
    const durationNum = durationAttr ? Number(durationAttr) : undefined;
    const kind = match[1].toLowerCase() === 'text-video' ? TEXT_VIDEO_TYPE : TEXT_IMAGE_TYPE;
    const body = String(match[3] || '').trim();
    if (body) {
      segments.push({
        text: body,
        type: kind,
        desc: body,
        cardStyle: style,
        category: kind === TEXT_VIDEO_TYPE ? 'video' : 'image',
        duration: Number.isFinite(durationNum) && (durationNum as number) > 0
          ? Math.min(599, Math.max(1, Math.round(durationNum as number)))
          : undefined,
      });
    }
    lastIndex = CARD_TAG_RE.lastIndex;
  }
  const after = text.slice(lastIndex).trim();
  if (after) segments.push({ text: after });
  if (!segments.length && text.trim()) segments.push({ text: text.trim() });
  return segments;
}

export function materializeLineReplyMessages(
  source: string,
  splitPlain: (text: string) => string[],
): LineMediaCardSegment[] {
  return splitTextWithMediaCards(source).flatMap((segment) => {
    if (segment.type) return [segment];
    return splitPlain(segment.text).map(text => ({ text }));
  });
}

export const LINE_VROOM_CARD_RULE = [
  '【文字图片 / 文字视频】聊天里会出现 VROOM 文字图片卡和文字视频卡。',
  '把它们当成你真的看见的画面或刚看完的短片来回应，不要说这是卡片、标签、提示词或系统消息。',
  '若你也要发图片或视频，使用 <text-image>画面描述</text-image> 或 <text-video>短片描述</text-video>；需要指定秒数时可用 <text-video duration="12">短片描述</text-video>；标签外的文字仍是普通聊天气泡。',
].join('');
