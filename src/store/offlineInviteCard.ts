/**
 * 线下小票邀约卡 · 统一数据结构与 AI 解析
 *
 * 小票文字格式：
 * OFFLINE INVITATION · 0001
 * [角色名]
 * [邀约标题 theme]
 * [一句话预览 preview]
 * ────────────────
 * DATE / PLACE
 * OPEN INVITATION
 */

export type OfflineInviteFields = {
  theme: string;
  preview: string;
  letter: string;
  time: string;
  location: string;
};

export type OfflineInviteChatMessage = {
  id: number | string;
  sender: 'me' | 'other';
  type: 'offline-invite';
  kind: 'offline-invite';
  inviteFrom: 'me' | 'other';
  inviteTheme: string;
  invitePreview: string;
  inviteLetter: string;
  inviteTime: string;
  inviteLocation: string;
  inviteStatus: 'pending' | 'accepted' | 'declined';
  text: string;
  time: string;
  createdAt: string;
  metadata: {
    theme: string;
    preview: string;
    letter: string;
    time: string;
    location: string;
    title: string;
    status: 'pending';
  };
};

const THEME_FALLBACK = '要不要和我一起去看看？';

export function offlineInviteSystemPrompt(characterName: string): string {
  return [
    `你正在扮演角色「${characterName}」，亲自填写一张线下见面小票邀约。`,
    '只能用角色第一人称口吻写内容，不要替用户说话或做决定。',
    '不要提 AI、模型、提示词、JSON、小票、系统。',
    '地点、时间、标题必须结合当前聊天与角色生活，禁止套用固定示例文案。',
    '严格只输出一个 JSON 对象，不要 markdown 代码块，不要其它说明。',
  ].join('\n');
}

export function offlineInviteUserPromptTail(): string {
  return [
    '请按下列字段填写（角色自己写）：',
    'theme = 小票上的邀约标题，口语短句，像随口约人，例如「要不要和我一起去看看？」',
    'preview = 小票上的一句话预览，一句即可，比正文短，像想对对方说的第一句',
    'letter = 点开后的完整邀约正文，可多句，自然、具体',
    'time = 日期/时间，短，例如「周六 15:00」「今晚 8 点」',
    'location = 地点，短而具体',
    '',
    '输出格式必须是：',
    '{"theme":"...","preview":"...","letter":"...","time":"...","location":"..."}',
  ].join('\n');
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstSentence(text: string, max = 18): string {
  const cleaned = cleanText(text, 200);
  if (!cleaned) return '';
  const first = cleaned.split(/[。！？!?\n]/).find(Boolean)?.trim() || cleaned;
  return first.length > max ? `${first.slice(0, max)}…` : first;
}

/** 从 AI 原文里抠 JSON，尽量容错 */
export function parseOfflineInviteJson(raw: string): Partial<OfflineInviteFields> {
  const text = String(raw || '').trim();
  if (!text) return {};
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === 'object') return parsed as Partial<OfflineInviteFields>;
  } catch {
    /* continue */
  }
  const match = unfenced.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === 'object') return parsed as Partial<OfflineInviteFields>;
  } catch {
    return {};
  }
  return {};
}

/** 规范化为小票可用字段；缺省时用正文首句补预览 */
export function normalizeOfflineInviteFields(
  input: Partial<OfflineInviteFields> & Record<string, unknown> = {},
  fallback: Partial<OfflineInviteFields> = {},
): OfflineInviteFields {
  const letter = cleanText(input.letter ?? fallback.letter, 800);
  const previewRaw = cleanText(input.preview ?? fallback.preview, 40);
  const theme = cleanText(input.theme ?? input.title ?? fallback.theme, 40) || THEME_FALLBACK;
  const time = cleanText(input.time ?? fallback.time, 40) || '待定';
  const location = cleanText(
    input.location ?? input.place ?? fallback.location,
    40,
  ) || '待定';
  const preview = previewRaw || firstSentence(letter) || '……';

  return { theme, preview, letter: letter || preview, time, location };
}

export function buildOfflineInviteChatMessage(options: {
  id?: number | string;
  from: 'me' | 'other';
  characterName: string;
  fields: OfflineInviteFields;
}): OfflineInviteChatMessage {
  const id = options.id ?? Date.now();
  const fields = normalizeOfflineInviteFields(options.fields);
  const createdAt = new Date().toISOString();
  return {
    id,
    sender: options.from,
    type: 'offline-invite',
    kind: 'offline-invite',
    inviteFrom: options.from,
    inviteTheme: fields.theme,
    invitePreview: fields.preview,
    inviteLetter: fields.letter,
    inviteTime: fields.time,
    inviteLocation: fields.location,
    inviteStatus: 'pending',
    text: `💌 ${options.characterName} 的线下邀约：${fields.theme}`,
    time: '刚刚',
    createdAt,
    metadata: {
      theme: fields.theme,
      preview: fields.preview,
      letter: fields.letter,
      time: fields.time,
      location: fields.location,
      title: fields.theme,
      status: 'pending',
    },
  };
}

export function fieldsFromInviteMessage(msg: any): OfflineInviteFields {
  const meta = msg?.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
  return normalizeOfflineInviteFields({
    theme: msg?.inviteTheme ?? meta.theme ?? meta.title,
    preview: msg?.invitePreview ?? meta.preview,
    letter: msg?.inviteLetter ?? meta.letter,
    time: msg?.inviteTime ?? meta.time,
    location: msg?.inviteLocation ?? meta.location ?? meta.place,
  });
}
