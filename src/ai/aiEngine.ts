import type { ImportedCharacter } from '../data/characterImport';
import type { ProjectManifest, WorldBook } from '../types';
import type { CharacterMemory, MemorySection } from '../store/characterMemory';
import type { StatusBarPreset } from '../store/statusBarPresets';
import { extractStatusMatch, splitStatusBarFromText } from '../store/statusBarPresets';
import { buildMemoryContext } from '../store/characterMemory';
import type { AppSettings, ChannelAiSettings } from '../store/appSettings';
import { readAppSettings } from '../store/appSettings';
import { getCharacterAiProfile, mergeCharacterAiSettings } from '../store/characterAiProfiles';
import { resolveCharacterContext, selectWorldBookEntries } from './contextEngine';
import { filterWorldBooksForCharacter } from '../store/worldbookRuntime';
import type { CotPreset } from '../store/cotPresets';
import { buildLineHumanBehaviorPrompt } from '../store/lineReality';
import { pushAiDebugLog, writeAiDebugTrace } from '../store/aiDebug';
import { resolveMacros, type MacroNames } from './macros';
import { buildPromptPresetInstructions, getPromptPresetFlowSteps, type PromptPresetScope } from '../store/promptPresets';
import { isLineVroomCard, lineCardHistoryText, LINE_VROOM_CARD_RULE } from '../store/lineMediaCards';

export type AiSettings = Pick<AppSettings, 'provider' | 'apiBaseUrl' | 'apiKey' | 'model' | 'streaming' | 'contextLength' | 'maxOutputTokens' | 'autoSave' | 'temperature' | 'topP' | 'topK' | 'frequencyPenalty' | 'presencePenalty' | 'seed'>;

function macroNamesOf(input: AiReplyInput): MacroNames {
  return {
    char: input.character?.name || input.characterProfile?.nickname,
    user: input.persona?.name,
  };
}

export interface AiReplyInput {
  settings: AiSettings;
  character?: ImportedCharacter | null;
  /** 当前所在群聊的名称（用于朋友圈话题标签）。单聊传空字符串即可。 */
  groupName?: string;
  characterProfile: {
    nickname: string;
    relationship: string;
    callMe: string;
    bio?: string;
    canCharacterSelfJudge?: boolean;
  };
  persona?: {
    name?: string;
    identity?: string;
    gender?: string;
    traits?: string;
    background?: string;
    region?: string;
    timezone?: string;
    birthday?: string;
    profession?: string;
    age?: string;
    ageMode?: 'manual' | 'follow-character';
    weather?: string;
  } | null;
  characterWeather?: string;
  worldbooks?: WorldBook[];
  memory?: CharacterMemory | null;
  project?: ProjectManifest | null;
  messages: Array<{
    sender: 'me' | 'other' | 'system' | string;
    text?: string;
    transcript?: string;
    desc?: string;
    type?: string;
    kind?: string;
    category?: string;
    title?: string;
    cardStyle?: string;
    textCard?: unknown;
    videoCard?: unknown;
    imageData?: string;
    senderName?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string | number;
    timestamp?: string | number;
    isRecalled?: boolean;
    isRecalledByOther?: boolean;
  }>;
  userMessage: string;
  isGroup?: boolean;
  authorNote?: string;
  stylePreset?: string;
  typingHabit?: string;
  cotTarget?: 'line' | 'offline' | 'group';
  presetOutputEnabled?: boolean;
  cotPreset?: Pick<CotPreset, 'id' | 'title' | 'template' | 'tag'>;
  statusBarPreset?: Pick<StatusBarPreset, 'name' | 'promptSuffix' | 'regex' | 'html'>;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number | null;
  onDelta?: (delta: string) => void;
  debugConversationId?: string;
}

export interface AiReplyResult {
  text: string;
  thinkingSummary?: string;
  actionDescription?: string;
  statusBarRaw?: string;
  rawResponse?: string;
  provider: AiSettings['provider'];
  model: string;
  matchedWorldbookEntries: number;
}

export function parseAiReplyPayload(
  rawText: string,
  cotTag?: string,
  statusRegex?: string,
): Pick<AiReplyResult, 'text' | 'thinkingSummary' | 'actionDescription' | 'statusBarRaw'> {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const escapeRegex = (value: string): string => value.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');

  // The presets may intentionally use different visible summary formats:
  // XML tags (<cot>, <think>, or a custom tag), bracket tags ([COT]), or
  // titled sections (【COT】). These are all display summaries, never hidden
  // step-by-step reasoning.
  const sectionBoundary = '(?=<\\s*message\\b|<\\s*action\\b|<\\s*status(?:bar)?\\b|\\[\\s*(?:动作|状态栏)\\s*\\]|【\\s*(?:COT|动作|状态栏)\\s*】|$)';
  const angleTagName = cotTag?.match(/^<\s*([A-Za-z][\w:-]*)\s*>/)?.[1] || '';
  const bracketTagName = cotTag?.match(/^\[\s*([A-Za-z][\w:-]*)\s*\]/)?.[1] || '';
  const titledTagName = cotTag?.match(/^【\s*([^】]+?)\s*】/)?.[1]?.trim() || '';

  const readAngleSection = (name: string, source: string = raw): string => {
    const tag = escapeRegex(name);
    const match = source.match(new RegExp(
      '<\\s*' + tag + '\\s*>([\\s\\S]*?)(?:<\\s*\\/\\s*' + tag + '\\s*>|' + sectionBoundary + ')',
      'i',
    ));
    return match ? match[1].trim() : '';
  };
  const readBracketSection = (name: string, source: string = raw): string => {
    const tag = escapeRegex(name);
    const boundary = '(?=<\\s*message\\b|<\\s*action\\b|<\\s*status(?:bar)?\\b|\\[\\s*(?:动作|状态栏)\\s*\\]|【\\s*(?:COT|动作|状态栏)\\s*】|$)';
    const match = source.match(new RegExp(
      '\\[\\s*' + tag + '\\s*\\]([\\s\\S]*?)(?:\\[\\s*\\/\\s*' + tag + '\\s*\\]|' + boundary + ')',
      'i',
    ));
    return match ? match[1].trim() : '';
  };
  const readTitledSection = (name: string, source: string = raw): string => {
    const tag = escapeRegex(name);
    const boundary = '(?=<\\s*message\\b|<\\s*action\\b|<\\s*status(?:bar)?\\b|\\[\\s*(?:动作|状态栏)\\s*\\]|【\\s*(?:COT|动作|状态栏)\\s*】|$)';
    const match = source.match(new RegExp('【\\s*' + tag + '\\s*】([\\s\\S]*?)' + boundary, 'i'));
    return match ? match[1].trim() : '';
  };
  const stripAngleSection = (source: string, name: string): string => {
    const tag = escapeRegex(name);
    return source.replace(new RegExp(
      '<\\s*' + tag + '\\s*>[\\s\\S]*?(?:<\\s*\\/\\s*' + tag + '\\s*>|' + sectionBoundary + ')',
      'gi',
    ), '');
  };
  const stripBracketSection = (source: string, name: string): string => {
    const tag = escapeRegex(name);
    const boundary = '(?=<\\s*message\\b|<\\s*action\\b|<\\s*status(?:bar)?\\b|\\[\\s*(?:动作|状态栏)\\s*\\]|【\\s*(?:COT|动作|状态栏)\\s*】|$)';
    return source.replace(new RegExp(
      '\\[\\s*' + tag + '\\s*\\][\\s\\S]*?(?:\\[\\s*\\/\\s*' + tag + '\\s*\\]|' + boundary + ')',
      'gi',
    ), '');
  };
  const stripTitledSection = (source: string, name: string): string => {
    const tag = escapeRegex(name);
    const boundary = '(?=<\\s*message\\b|<\\s*action\\b|<\\s*status(?:bar)?\\b|\\[\\s*(?:动作|状态栏)\\s*\\]|【\\s*(?:COT|动作|状态栏)\\s*】|$)';
    return source.replace(new RegExp('【\\s*' + tag + '\\s*】[\\s\\S]*?' + boundary, 'gi'), '');
  };

  // The collapsible panel belongs to the Preset App flow only. Legacy COT tags
  // are still stripped below so they can never leak into the visible chat body.
  const thinkingSummary = readAngleSection('preset_flow') || '';

  let withoutMetadata = raw;
  const metadataTags = new Set(['preset_flow', 'think', 'thought', 'thinking', 'cot', 'summary', 'decision', 'decision_summary']);
  if (angleTagName && !['message', 'action', 'status', 'statusbar'].includes(angleTagName.toLowerCase())) metadataTags.add(angleTagName);
  for (const tag of metadataTags) withoutMetadata = stripAngleSection(withoutMetadata, tag);
  withoutMetadata = stripBracketSection(withoutMetadata, 'COT');
  withoutMetadata = stripTitledSection(withoutMetadata, 'COT');
  if (bracketTagName && !['message', 'action', 'status', 'statusbar', 'cot'].includes(bracketTagName.toLowerCase())) {
    withoutMetadata = stripBracketSection(withoutMetadata, bracketTagName);
  }
  if (titledTagName && !['动作', '状态栏'].includes(titledTagName)) {
    withoutMetadata = stripTitledSection(withoutMetadata, titledTagName);
  }

  const actionDescription = readAngleSection('action', withoutMetadata) ||
    readBracketSection('动作', withoutMetadata) ||
    readTitledSection('动作', withoutMetadata) || '';

  // Remove action metadata even when the chosen delimiter contains whitespace,
  // uses an alternate supported format, or has an omitted closing delimiter.
  withoutMetadata = stripAngleSection(withoutMetadata, 'action');
  withoutMetadata = stripBracketSection(withoutMetadata, '动作');
  withoutMetadata = stripTitledSection(withoutMetadata, '动作');

  // UWU/Tavern-style presets apply their Regex to the status payload itself.
  // If the model follows our <statusbar> wrapper instruction, unwrap first so
  // anchored Regexes (^...$) still match. For legacy presets that emit the
  // status inline in the full reply, retain whole-reply matching as a fallback.
  let statusBarRaw = '';
  const wrappedStatusMatch = withoutMetadata.match(/<\s*status(?:bar)?\s*>([\s\S]*?)\s*<\s*\/\s*status(?:bar)?\s*>/i);
  if (statusRegex?.trim()) {
    if (wrappedStatusMatch) {
      const wrappedPayload = wrappedStatusMatch[1].trim();
      const wrappedSplit = splitStatusBarFromText(wrappedPayload, statusRegex);
      if (wrappedSplit.status) {
        statusBarRaw = wrappedSplit.status;
        withoutMetadata = withoutMetadata.replace(wrappedStatusMatch[0], '');
      }
    }
    if (!statusBarRaw) {
      const split = splitStatusBarFromText(withoutMetadata, statusRegex);
      if (split.status) {
        statusBarRaw = split.status;
        withoutMetadata = split.text;
      }
    }
  } else {
    const statusMatch = withoutMetadata.match(/\[\s*状态栏\s*\]\s*([\s\S]*?)\s*\[\s*\/\s*状态栏\s*\]/i) ||
      wrappedStatusMatch ||
      withoutMetadata.match(/【\s*状态栏\s*】([\s\S]*?)(?=<\s*message\b|<\s*action\b|【\s*(?:动作|COT)\s*】|$)/i);
    if (statusMatch) {
      statusBarRaw = statusMatch[1].trim();
      withoutMetadata = withoutMetadata.replace(statusMatch[0], '');
    }
  }

  withoutMetadata = withoutMetadata
    .replace(/\[\s*状态栏\s*\][\s\S]*?(?:\[\s*\/\s*状态栏\s*\]|$)/gi, '')
    .replace(/<\s*status(?:bar)?\s*>[\s\S]*?(?:<\s*\/\s*status(?:bar)?\s*>|$)/gi, '')
    .replace(/【\s*状态栏\s*】[\s\S]*$/gi, '');

  const messageMatch = /<\s*message\s*>([\s\S]*?)<\s*\/\s*message\s*>/i.exec(withoutMetadata);
  const text = (messageMatch?.[1] || withoutMetadata
    .replace(/<\s*action\s*>[\s\S]*?(?:<\s*\/\s*action\s*>|$)/gi, '')
    .replace(/\[\s*动作\s*\][\s\S]*?(?:\[\s*\/\s*动作\s*\]|$)/gi, '')
    .replace(/【\s*动作\s*】[\s\S]*$/gi, '')
    .replace(/<\s*message\s*>[\s\S]*?<\s*\/\s*message\s*>/gi, '')).trim();

  return {
    text,
    thinkingSummary: thinkingSummary || undefined,
    actionDescription: actionDescription || undefined,
    statusBarRaw: statusBarRaw || undefined,
  };
}
export function resolveChannelAiSettings(channel: 'chat' | 'moments'): AiSettings {
  const settings = readAppSettings();
  const override: ChannelAiSettings = channel === 'moments' ? settings.momentsApiOverride : settings.chatApiOverride;
  const base: AiSettings = {
    provider: settings.provider,
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    streaming: settings.streaming,
    contextLength: settings.contextLength,
    maxOutputTokens: settings.maxOutputTokens,
    autoSave: settings.autoSave,
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    frequencyPenalty: settings.frequencyPenalty,
    presencePenalty: settings.presencePenalty,
    seed: settings.seed,
  };
  if (!override?.enabled) return base;
  return {
    ...base,
    provider: override.provider,
    apiBaseUrl: override.apiBaseUrl,
    apiKey: override.apiKey,
    model: override.model,
    streaming: override.streaming,
    contextLength: override.contextLength,
    maxOutputTokens: override.maxOutputTokens,
    temperature: override.temperature,
    topP: override.topP,
    topK: override.topK,
    frequencyPenalty: override.frequencyPenalty,
    presencePenalty: override.presencePenalty,
    seed: override.seed,
  };
}

export function readStoredAiSettings(characterId?: string, characterName?: string): AiSettings {
  const settings = readAppSettings();
  const base: AiSettings = {
    provider: settings.provider,
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    streaming: settings.streaming,
    contextLength: settings.contextLength,
    maxOutputTokens: settings.maxOutputTokens,
    autoSave: settings.autoSave,
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    frequencyPenalty: settings.frequencyPenalty,
    presencePenalty: settings.presencePenalty,
    seed: settings.seed,
  };

  if (!characterId && !characterName) return base;
  return mergeCharacterAiSettings(base, getCharacterAiProfile(characterId || characterName || '', characterName));
}

function getApplicableWorldBooks(input: AiReplyInput): WorldBook[] {
  // Callers (LINE / offline / music) must already scope the pool to online/offline
  // globals + character bindings. Here we only enforce character-card privacy so
  // character-owned books never leak — without dropping online/offline globals
  // when a character also has worldBookIds selected.
  return filterWorldBooksForCharacter(input.worldbooks || [], input.character);
}

function buildWorldBookScanResolver(input: AiReplyInput, defaultDepth: number) {
  const messages = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge');

  return (entry: WorldBook['entries'][number]) => {
    const depth = entry.scanDepth !== undefined
      ? Math.max(0, Math.min(50, Number(entry.scanDepth) || 0))
      : defaultDepth;
    if (depth <= 0) return '';
    return messages
      .slice(-depth)
      .map(message => message.text || message.transcript || '')
      .filter(Boolean)
      .join('\n') + '\n' + input.userMessage;
  };
}

function parseMessageTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatChatTimestamp(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function formatVirtualWallTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return date.getUTCFullYear() + '年' + pad(date.getUTCMonth() + 1) + '月' +
    pad(date.getUTCDate()) + '日 ' + pad(date.getUTCHours()) + ':' +
    pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds());
}

function buildMessageTimeContext(input: AiReplyInput): string {
  const authorNote = String(input.authorNote || '');
  const timezoneMatch = authorNote.match(/(?:当前时区为|时区为)\s*([A-Za-z_]+\/[A-Za-z_]+|UTC)/);
  const timezone = timezoneMatch?.[1] || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const virtualMatch = authorNote.match(/【虚拟时间】本聊天时间固定为\s*([^，；。\n]+)/);
  const virtualDate = virtualMatch?.[1]?.trim();
  const virtualParts = virtualDate?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const virtualNow = virtualParts
    ? Date.UTC(Number(virtualParts[1]), Number(virtualParts[2]) - 1, Number(virtualParts[3]), Number(virtualParts[4]), Number(virtualParts[5]), Number(virtualParts[6] || 0))
    : null;
  const realNow = Date.now();
  const chatNow = virtualNow ?? realNow;
  const format = (date: Date) => formatChatTimestamp(date, timezone);

  const messages = input.messages as Array<AiReplyInput['messages'][number] & { createdAt?: string | number; timestamp?: string | number }>;
  let userIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].sender === 'me' && String(messages[index].text || '').trim()) {
      userIndex = index;
      break;
    }
  }
  const userMessageDate = userIndex >= 0
    ? parseMessageTimestamp(messages[userIndex].createdAt ?? messages[userIndex].timestamp)
    : null;
  const previousMessage = userIndex > 0 ? messages[userIndex - 1] : null;
  const previousMessageDate = previousMessage
    ? parseMessageTimestamp(previousMessage.createdAt ?? previousMessage.timestamp)
    : null;

  // In virtual-time mode, preserve real elapsed gaps but map them onto the
  // selected fictional clock, so the model sees one coherent timeline.
  const userChatTimestamp = virtualNow !== null && userMessageDate
    ? chatNow - Math.max(0, realNow - userMessageDate.getTime())
    : (userMessageDate?.getTime() ?? null);
  const previousChatTimestamp = userChatTimestamp !== null && userMessageDate && previousMessageDate
    ? userChatTimestamp - Math.max(0, userMessageDate.getTime() - previousMessageDate.getTime())
    : (previousMessageDate?.getTime() ?? null);

  const currentLabel = virtualNow !== null
    ? formatVirtualWallTime(chatNow) + '（虚拟时间，' + timezone + '）'
    : format(new Date(chatNow)) + '（现实时间）';
  const userLabel = userChatTimestamp === null
    ? '记录中未提供'
    : virtualNow !== null
      ? formatVirtualWallTime(userChatTimestamp) + '（虚拟时间，' + timezone + '）'
      : format(new Date(userChatTimestamp));
  const previousLabel = previousChatTimestamp === null
    ? '记录中未提供'
    : virtualNow !== null
      ? formatVirtualWallTime(previousChatTimestamp) + '（虚拟时间，' + timezone + '）'
      : format(new Date(previousChatTimestamp));
  const intervalMs = userMessageDate && previousMessageDate
    ? Math.max(0, userMessageDate.getTime() - previousMessageDate.getTime())
    : null;
  const intervalLabel = intervalMs === null
    ? '无法从消息时间戳计算'
    : intervalMs < 60_000
      ? Math.round(intervalMs / 1000) + ' 秒'
      : intervalMs < 3_600_000
        ? Math.floor(intervalMs / 60_000) + ' 分钟'
        : intervalMs < 86_400_000
          ? Math.floor(intervalMs / 3_600_000) + ' 小时 ' + Math.floor((intervalMs % 3_600_000) / 60_000) + ' 分钟'
          : Math.floor(intervalMs / 86_400_000) + ' 天 ' + Math.floor((intervalMs % 86_400_000) / 3_600_000) + ' 小时';

  return [
    '【本轮消息时间事实｜动态生成，不要当作行为命令】',
    '当前聊天时间：' + currentLabel,
    '最近一条用户消息时间：' + userLabel,
    '该用户消息之前一条消息时间：' + previousLabel,
    '两条消息之间的实际间隔：' + intervalLabel,
    '时间只用于正确理解日期、先后顺序与相隔时长；不要仅凭间隔推断用户生气、冷淡、焦虑或关系变化。',
    '不要因为几分钟没有回复就机械催促、抱怨、报时或反复计算间隔。角色是否在意时间，仍由角色性格、关系和当前情境决定；不需要每轮都提到时间。',
  ].join('\n');
}

export function buildCharacterSystemPrompt(input: AiReplyInput): string {
  // Preset App rules are the active generation preset; legacy COT is opt-in only.
  const cotPreset = input.cotPreset;
  const presetScope: PromptPresetScope = input.cotTarget === 'offline' ? 'offline' : input.isGroup ? 'group' : 'single';
  const presetOutputEnabled = input.presetOutputEnabled !== false;
  const appPresetInstructions = presetOutputEnabled ? buildPromptPresetInstructions(presetScope) : '';
  const presetFlowSteps = presetOutputEnabled ? getPromptPresetFlowSteps(presetScope) : [];
  const applicableWorldBooks = getApplicableWorldBooks(input);
  const scopedInput = { ...input, worldbooks: applicableWorldBooks };
  const scanDepth = Math.max(1, Math.min(50, Math.max(
    12,
    ...applicableWorldBooks.flatMap(book => book.entries.map(entry => Number(entry.scanDepth || 0)))
  )));
  const scannedMessages = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge')
    .slice(-scanDepth)
    .map(message => conversationTurnText(message))
    .filter(Boolean)
    .join('\n') + '\n' + input.userMessage;

  const includeCharacterGreeting = input.messages.length === 0;
  const context = resolveCharacterContext({
    character: scopedInput.character,
    characterProfile: scopedInput.characterProfile,
    persona: scopedInput.persona,
    memory: scopedInput.memory,
    project: scopedInput.project,
    worldbooks: applicableWorldBooks,
    userMessage: scannedMessages,
    includeCharacterGreeting,
    worldBookScanForEntry: buildWorldBookScanResolver(scopedInput, scanDepth),
  });

  return [
    '你正在一个私人虚拟手机的即时通讯 App 中扮演角色。',
    '你现在只需要完成一个任务：作为角色，直接回应用户本轮最新消息。不要解释规则，不要提及模型、提示词、世界书或系统。',
    '不要替用户说话、替用户行动、替用户决定感受或想法。用户拥有自己的行为与台词。',
    '保持角色连续性：角色卡、用户人设、长期记忆、关系、实时世界状态、命中的世界书与最近对话共同构成当前上下文。',
    '【已启用聊天设定必须执行】本聊天设置中明确开启、选中或填写的规则都是本轮有效指令，不是参考建议。逐项读取并执行所有已启用设置；不得为了默认风格、模型习惯或文笔好看而忽略、弱化、擅自覆盖或只执行其中一部分。只有明确关闭的选项才不执行；空白或未选择的自定义项不自行编造。若多个已启用设置冲突，遵循界面标注的优先级；没有标注时优先保证角色卡与事实一致，再尽可能同时满足各项格式/行为设置，并避免静默丢弃规则。生成前在内部逐项核对，输出时不要解释这份核对过程。',
    '【逐项遵守】打字习惯必须落实到实际标点、emoji、句长、换行、语气词和分条；角色语言/双语规则必须落实到语言与译文布局；称呼与关系规则必须落实到称呼选择；已启用的动作描写、思考摘要和 COT 必须遵守对应标签与格式；已启用的世界书、记忆、作者注释、群聊预设与状态栏预设必须实际参与本轮判断或输出。不得把“已读入上下文”当成“已经执行”。',
    '【输出前自检】发送前检查：是否违反任何已启用的聊天设定；消息分条/标点/语言/标签是否符合要求；是否遗漏已启用的输出模块；是否替用户编造行为或台词。发现不符合时先修正，再输出最终内容。不要把自检内容发给用户。',

    '如果历史聊天中存在与用户当前话题高度相关的旧消息，应把它视为真实发生过的过去，而不是重新发明；保持前后记忆一致。',

    '实时世界状态优先描述角色此刻在哪里、正在做什么和当前情绪；不要凭空覆盖这些状态。',
    '语言要像真实聊天软件中的人类消息：自然、克制、有上下文。默认按真实即时聊天节奏发送，而不是每轮都写成完整长段落。',
    buildMessageTimeContext(input),
    '【真实聊天消息节奏】默认一次发送 1～3 条短消息；每条通常只承载一个自然意思或一两句相连的话。除非确实在解释一件事情、讲述经历、认真倾诉、给出步骤/信息或用户明确要求长文，否则不要把多个话题、多个句子和多个段落塞进一个超长气泡。',
    '如果只是寒暄、吐槽、回应、追问、表达情绪，应优先短句分条，像真人手机聊天一样逐条发送；不要为了“完整”而写成小作文。',
    '【消息分条硬规则】“自然分条”不是“全部合并成一条”。自然聊天中，独立意思应在语义边界处分开；只有本来就是一个完整说明/故事/长篇倾诉时才保留长消息。',
    input.stylePreset ? '【当前 LINE 预设】' + input.stylePreset + '。保持该预设的节奏与情感强度，但不要让预设覆盖角色卡、长期记忆、关系或世界书。' : '',
    input.typingHabit ? '【当前聊天打字习惯 · 必须执行】' + input.typingHabit + '。这是硬性格式约束，不是参考建议。输出前逐项检查标点、emoji、消息分条、换行、句长、语气词和断句；设置为“用空格连接”就实际用空格连接，设置为“分行断句”就实际换行。若和模型默认文风冲突，以本项为准，但不得改变角色性格、事实或剧情。' : '',
    // A character's own language fingerprint must override global LINE defaults.
    buildLineHumanBehaviorPrompt(input.character?.languageProfile),
    input.character?.languageProfile ? [
      '【角色个人语言指纹】',
      '角色语言：' + input.character!.languageProfile.language,
      '双语模式：' + input.character!.languageProfile.bilingualMode,
      '双语布局：' + input.character!.languageProfile.bilingualLayout,
      '双语顺序：' + input.character!.languageProfile.bilingualTranslationDirection,
      '标点习惯：' + input.character!.languageProfile.punctuationStyle,
      '句子长度：' + input.character!.languageProfile.sentenceLength,
      '换行习惯：' + input.character!.languageProfile.lineBreakStyle,
      '口语程度：' + input.character!.languageProfile.colloquialLevel,
      '语气词：' + (input.character!.languageProfile.fillerWords || []).join('、'),
      'Emoji：' + input.character!.languageProfile.emojiStyle,
      '大小写：' + input.character!.languageProfile.capitalizationStyle,
      '数字习惯：' + input.character!.languageProfile.numberStyle,
      '是否偏好空格：' + (input.character!.languageProfile.preferredSpaces ? '是' : '否'),
      '消息分组：' + ({ single: '尽量一句一句发送，每个短句独立成一条消息。', double: '倾向把相邻两句自然地合并成一条消息，不要一句一句碎发。', natural: '根据语境自然决定一条还是两条，不要机械切分。' }[input.character!.languageProfile.messageGrouping || 'natural']),
      '语言示例：' + (input.character!.languageProfile.examples || []).join(' / '),
      '保持稳定，但不要机械复制每条消息的格式。',
      '非普通话且双语开启时，在同一次角色发言中提供原文与中文翻译，不要生成两条独立消息。',
      input.character!.languageProfile.bilingualLayout === 'below-bubble' ? '译文属于同一消息，应显示在原气泡下方。' : '原文与译文属于同一个气泡。'
    ].join('\n') : '',
    '除非角色卡明确要求，否则不要每轮都过度煽情或重复昵称。',
    input.isGroup ? '这是群聊：请根据群聊上下文与群成员资料协调生成一个完整回合，可以让多位角色自然接话、插话或连续发言；不要替用户发言，也不要强制所有成员发言。' : '这是私聊：只扮演当前角色。',
    context.worldBookBefore ? '【世界书 · 角色定义前】\n' + context.worldBookBefore : '',
    '【角色上下文】\n' + context.character,
    '',
    '【用户人设】\n' + context.persona,
    input.persona ? [
      '【用户个人资料】',
      '姓名：' + (input.persona.name || ''),
      '年龄：' + (input.persona.age || ''),
      '职业：' + (input.persona.profession || ''),
      '地区：' + (input.persona.region || ''),
      '时区：' + (input.persona.timezone || ''),
      '生日：' + (input.persona.birthday || ''),
      '年龄模式：' + (input.persona.ageMode || 'manual'),
      input.persona.weather ? '用户所在地区当前天气：' + input.persona.weather : '',
      '这些资料属于用户本人。相关时自然参考，不要每轮机械提及。'
    ].join('\n') : '',
    input.characterWeather ? '【角色所在地天气】' + input.characterWeather + '。角色可以知道自己所在地的当前天气，但不要每轮主动播报。' : '',
    '',
    '【关系状态】\n' + context.relationship,
    '',
    '【角色自主判断】' + (input.characterProfile.canCharacterSelfJudge !== false
      ? '开启：角色可以基于自己的性格、经历、关系和当前情境形成自己的判断与反应，不需要迎合用户，也不要套用统一模板。'
      : '关闭：角色不要主动改变既有关系判断；仍须遵守角色设定与当前情境。'),
    '',
    '【长期记忆】\n' + context.memory,
    '',
    '【实时世界状态】\n' + context.world,

    '',
    '【项目设定】\n' + context.project,
    context.worldBookAfter ? '【世界书 · 角色定义后】\n' + context.worldBookAfter : '',
    '',
    input.stylePreset ? '【聊天风格预设】\n' + input.stylePreset : '【聊天风格预设】自然、沉浸、像真实聊天。',
    appPresetInstructions,
    presetOutputEnabled ? [
      '【预设执行流程｜仅使用预设 App】',
      '当前生效预设的每个已启用条目都必须按顺序实际执行。先在 <preset_flow>...</preset_flow> 内输出完整的逐步执行记录，再输出角色正文。',
      '折叠区域展示的是预设执行记录：必须逐项列出本轮预设中的全部步骤，保留步骤名称和顺序；每步写明与当前消息相关的判断结论及该规则如何落实。不能只写总摘要、不能跳过步骤、不能把角色正文复制到流程里。',
      '这里是可展示的规则执行记录，不是私密逐字思维链；只写简洁、具体、可核验的结论，不输出隐秘的逐字推演。',
      '语言规则：优先严格遵守角色档案中明确配置的回复语言；若没有明确语言配置，则使用当前用户消息的主要语言。预设条目即使是英文，也只执行其中的规则，不要照搬英文步骤或英文说明；中文对话默认用简体中文展示流程和正文。',
      '预设流程与角色正文必须分开。<preset_flow> 中只放流程记录；角色实际发送的内容放在 <message>...</message> 中。',
      '【本轮必须执行的预设步骤】',
      ...presetFlowSteps.map((step, index) => (index + 1) + '. ' + step.name + '\n规则内容：' + step.content)
    ].join('\n'),
 : '',
    input.authorNote ? '【作者注释】\n' + input.authorNote : '【作者注释】无。',
    cotPreset ? [
      '【COT 角色回复决策器】先完成角色判断，再输出角色消息：结合当前消息与最近上下文 → 角色设定/关系 → 用户真实意图 → 角色情绪与立场 → 决定自然回应方式与长度 → 检查 OOC/未知信息/是否替用户行动。不要展示隐藏推理。',
      '状态栏不是 COT 的 STEP。状态栏属于本轮角色回复的末尾输出层。',
      '原始预设如下：',
      cotPreset.template
    ].join('\n') : '【内部生成预设】无。',
    '',
    '【当前任务 · 绝对最高优先级】',
    '你只能回答当前用户消息，不要替当前用户补写下一句，也不要自行延续旧话题。',
    input.statusBarPreset ? '在完成当前角色回复后，再执行状态栏 Prompt；状态栏字段中的自然语言指令必须被“执行”，不能被当成需要复制的模板文字。' : '',
    '下面这条才是本轮必须处理的用户消息：',
    '<<<CURRENT_USER_MESSAGE>>>',
    input.userMessage,
    '<<<END_CURRENT_USER_MESSAGE>>>',
    '如果旧聊天、记忆、世界书、关系设定与当前消息冲突，当前消息决定本轮要回答什么；其他资料只用于角色身份、事实连续性和语气。',
    '不要因为旧消息里出现过的问题、请求或关键词，就再次回答那个旧问题。',
    '',
    '【输出约束】',
    presetOutputEnabled ? '只使用预设 App 的规则执行流程，不要把独立 COT 当成预设。必须在 <preset_flow>...</preset_flow> 中逐项展示本轮所有启用条目的执行记录，保留完整步骤名称与顺序，并说明本轮的具体落实结论；不能只给摘要。不要输出私密逐字思维链。流程使用角色明确配置的语言；没有明确配置时跟随当前用户消息语言，中文对话默认简体中文。随后把角色真正发送的内容单独放进 <message>...</message>，绝不把流程内容混进正文。' : '预设 App 流程已关闭：不要执行或输出 <preset_flow>，直接输出正常角色正文。',
    '不要描述用户尚未明确做出的动作。',
    '不要把聊天回复写成旁白长文；保持手机消息的阅读节奏。',
    LINE_VROOM_CARD_RULE,
    '不要用“角色动作 + 长段心理描写 + 一大段台词”代替聊天消息；动作描写如果开启必须单独放进 <action>...</action>，正文仍然是正常聊天消息。',
    input.authorNote?.includes('【线上动作描写：开启】') ? '【动作描写】开启。动作是角色线上聊天时可被感知的行为层；每轮必须判断是否有自然、有信息量的线上反应。若有，输出一条简短具体的 <action>...</action>，例如停顿、删改重写、看完后迟疑、输入后又删掉等；若当前语境确实没有值得表现的动作，可输出极短的“停了一下”类反应，但禁止长篇旁白、禁止替用户行动。动作必须与正文分离。' : '【动作描写】关闭。不要输出 <action> 标签，也不要额外写动作旁白。',
    '不要另行输出 <summary>、<cot> 或 <think> 摘要。本轮可展示的摘要统一使用 <preset_flow>...</preset_flow>。',
    '',
    '【LINE 聊天设定 · 最高优先级格式约束】',
    input.typingHabit ? [
      '以下是用户在“聊天设定”里主动选择的打字习惯。它不是参考建议，而是本次回复必须执行的输出格式。',
      input.typingHabit,
      '执行顺序：先遵守这些聊天设定，再生成角色内容。',
      '标点设置必须直接体现在最终文本中；如果设置为少标点，不要为了语法习惯自动补满句号和逗号。',
      '消息分条设置必须体现在最终文本中；如果设置为一句一句发，应使用独立短句/换行表达，而不是把所有内容合成一大段。',
      '换行与断句设置必须体现在最终文本中；如果设置为分行或用空格连接，不要擅自改成另一种格式。',
      'emoji/表情包设置必须体现在最终文本中；如果设置为经常使用，可以自然加入 emoji，但不要机械每句添加。',
      '句子长度、语气词也必须遵守。角色性格、事实、剧情仍然保持不变。',
    ].join('\n') : '当前没有额外的聊天打字习惯设置。',
    '',
    '【输出协议】',
    presetOutputEnabled ? '输出顺序固定为：完整预设执行记录 <preset_flow>...</preset_flow>，然后是角色正文 <message>...</message>。不要输出【COT】、[COT]、<cot>、<think> 或其他流程标签作为正文内容。' : '预设流程关闭时，直接输出角色正文，不要输出 <preset_flow>、【COT】、[COT]、<cot>、<think> 或其他流程标签。',
    input.authorNote?.includes('【线上动作描写：开启】')
      ? '动作描写开启：如果角色这一轮有自然动作/反应，输出一条简短具体的 <action>...</action>；不要把动作写成长篇旁白。'
      : '动作描写关闭：不要输出 <action>。',
    '正文直接输出正常角色聊天消息。<message>...</message> 不是必需格式；如果模型使用它，解析器会自动剥离外壳。',
    '预设执行记录、动作描写和角色正文是不同内容层，不要把预设步骤或动作描写混进角色正文。',
    '不要输出 Markdown 代码块，不要输出格式说明。',
    input.statusBarPreset ? [
      '【状态栏｜本轮回复末尾的原始输出】',
      '本轮状态栏已开启。你必须先正常完成角色聊天正文，然后在同一次 AI 回复的最末尾追加状态栏原文。',
      '【状态栏 Prompt】是当前预设唯一的内容与格式规则，必须严格执行。不要擅自改成其他字段、JSON、自然语言或固定模板。',
      '状态栏内容与格式完全由当前选中预设的 Prompt 决定。不要假设存在 Q、A、QT、AT、time 等字段，也不要生成任何其他预设的字段、标签或固定格式。',
      '逐项执行当前 Prompt 的实际要求，只输出它要求的状态栏原文；不要把 Prompt 中的说明文字当作字段值，除非 Prompt 明确要求原样输出。',
      '除非当前 Prompt 明确规定，否则不要添加额外字段、示例、占位文字、解释或包装格式。保留当前 Prompt 要求的结构与分隔符。',
      '状态栏原文只能出现在整次回复的最末尾；聊天正文中不要提前输出状态栏的字段名或标记。',
      '无论 Regex 是否配置，都必须把状态栏内容放在 <statusbar>...</statusbar> 结构标签内，并放在整次回复最末尾。该结构标签由程序剥离，不属于状态栏原文，不会显示给用户。',
      '如果状态栏 Prompt 写着“不要输出状态栏标签”，它指的是不要把说明性标签写进状态内容；这不取消本协议要求的 <statusbar> 结构标签。',
      input.statusBarPreset.regex?.trim()
        ? '当前预设有 Regex：<statusbar> 内部的状态栏原文必须符合当前 Regex 的格式，包括 Regex 要求的字段名、分隔符、字面标记与结尾；不要在结构标签内部再添加额外包装。'
        : '当前预设没有 Regex：<statusbar> 内部放置 Prompt 要求的原始状态内容，程序将其整体作为状态内容。',
      '状态栏必须与角色正文分开，且只出现一次；程序先剥离 <statusbar> 结构标签，再按当前预设 Regex 校验和渲染内部原文。',
      '当前状态栏名称：' + input.statusBarPreset.name,
      '当前状态栏 Prompt：' + (input.statusBarPreset.promptSuffix || ''),
      '当前预设 Regex：' + (input.statusBarPreset.regex || ''),
      '状态栏只描述角色自己的当前状态，不要替用户编造动作、想法或事实。',
      '输出顺序必须是：角色正常消息 → 状态栏原文。状态栏必须在整次回复的最后。',
    ].join('\n') : '【状态栏】关闭：不要输出状态栏。',
  ].join('\n');
}


function extractHistoryKeywords(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ').trim();
  const words = normalized.split(/\s+/).filter(word => word.length >= 2);
  const chinese = Array.from(normalized.replace(/\s/g, '')).filter(char => /[\u4e00-\u9fff]/u.test(char));
  const bigrams = chinese.slice(0, 80).map((_, index) => chinese.slice(index, index + 2).join('')).filter(word => word.length === 2);
  return Array.from(new Set([...words, ...bigrams])).slice(0, 32);
}

function findRelevantHistory(input: AiReplyInput, recentIds: Set<string>): AiReplyInput['messages'] {
  const keywords = extractHistoryKeywords(input.userMessage);
  if (!keywords.length) return [];

  return input.messages
    .filter(message =>
      message.type !== 'system-nudge' &&
      !message.isRecalled &&
      !message.isRecalledByOther &&
      !recentIds.has(String((message as any).id))
    )
    .map((message, index) => {
      const text = String(isLineVroomCard(message) ? lineCardHistoryText(message) : (message.text || message.transcript || message.desc || '')).toLowerCase();
      if (!text) return null;
      const score = keywords.reduce((total, keyword) => total + (text.includes(keyword) ? Math.min(4, keyword.length) : 0), 0);
      return score > 0 ? { message, score, index } : null;
    })
    .filter((item): item is { message: AiReplyInput['messages'][number]; score: number; index: number } => Boolean(item))
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index)
    .map(item => item.message);
}

function mediaContextLabel(message: AiReplyInput['messages'][number]): string {
  if (isLineVroomCard(message)) return lineCardHistoryText(message);
  const metadata = message.metadata || {};
  const mediaType = String(metadata.mediaType || message.type || '');
  const fileName = String(metadata.fileName || '');
  const transcript = String(metadata.transcript || message.transcript || '');
  if (mediaType === 'image') return '[图片消息：这是一张之前发送过的图片，当前轮次可参考其记录]' + (fileName ? ' 文件：' + fileName : '');
  if (mediaType === 'voice' || message.type === 'voice') return '[语音消息]' + (transcript ? ' 转写：' + transcript : '');
  if (mediaType === 'video') return '[视频消息]' + (fileName ? ' 文件：' + fileName : '');
  if (mediaType === 'file') return '[文件消息]' + (fileName ? ' 文件：' + fileName : '');
  return '[多媒体消息]';
}

function conversationTurnText(message: AiReplyInput['messages'][number]): string {
  if (isLineVroomCard(message)) return lineCardHistoryText(message);
  return String(message.text || message.transcript || message.desc || mediaContextLabel(message) || '').trim();
}

function buildConversationMessages(input: AiReplyInput) {
  // The model must see the current user message as the final conversational turn.
  // Do not mix old "historical chat memory" or depth-injected lorebook messages into
  // the provider's dialogue stream: they can look like fresh instructions and cause
  // the character to answer an older topic instead of what the user just said.
  const turnBudget = Math.max(6, Math.min(80, Number(input.settings.contextLength) || 10));
  const eligible = input.messages
    .filter(message =>
      message.type !== 'system-nudge' &&
      !message.isRecalled &&
      !message.isRecalledByOther
    );

  // Exclude the current user turn here; it is appended exactly once as the final
  // user message below, which makes its priority unambiguous to both Gemini and
  // OpenAI-compatible models.
  // Remove the exact user turn being answered, not blindly the last message.
  // Continue/regenerate flows can end with an assistant message; slicing the last
  // item there silently discarded the most recent character context.
  let currentTurnIndex = -1;
  const currentUserText = String(input.userMessage || '').trim();
  for (let index = eligible.length - 1; index >= 0; index -= 1) {
    const message = eligible[index];
    const text = conversationTurnText(message);
    if (message.sender === 'me' && text === currentUserText) {
      currentTurnIndex = index;
      break;
    }
  }
  const historySource = eligible
    .filter((_, index) => index !== currentTurnIndex)
    .slice(-(turnBudget * 2));

  const history = historySource.map(message => ({
    role: message.sender === 'other' ? 'assistant' as const : 'user' as const,
    content: input.isGroup && message.senderName
      ? '[' + message.senderName + '] ' + conversationTurnText(message)
      : conversationTurnText(message),
    imageData: message.imageData,
  }));

  // The current message is deliberately isolated from the older dialogue.
  // This is the single message the character is answering right now.
  history.push({
    role: 'user' as const,
    content: '【当前用户消息】\n' + input.userMessage,
    // Preserve the current turn's attachment when its text was removed from history
    // to avoid duplicating the user turn. Otherwise image messages silently lose
    // their image before the provider request is assembled.
    imageData: currentTurnIndex >= 0 ? eligible[currentTurnIndex]?.imageData : undefined,
  });

  return history;
}

function requireApiKey(settings: AiSettings) {
  if (!settings.apiKey.trim()) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  if (!settings.model.trim()) {
    throw new Error('AI_MODEL_MISSING');
  }
}

async function readError(response: Response): Promise<string> {
  const statusLabel = response.statusText ? ' ' + response.statusText : '';
  try {
    const data = await response.json();
    const error = data?.error ?? data;
    const code = error?.code ?? error?.error_code ?? error?.statusCode;
    const type = error?.type;
    const message = error?.message ?? data?.message;
    const parts = [
      code !== undefined ? 'code=' + String(code) : '',
      type ? 'type=' + String(type) : '',
      message ? String(message) : '',
    ].filter(Boolean);
    return '[' + response.status + statusLabel + ']' + (parts.length ? ' ' + parts.join(' · ') : ' ' + JSON.stringify(data));
  } catch {
    try {
      const text = (await response.text()).trim();
      return '[' + response.status + statusLabel + ']' + (text ? ' ' + text : '');
    } catch {
      return '[' + response.status + statusLabel + '] AI 请求失败';
    }
  }
}

async function parseSseResponse(
  response: Response,
  extractText: (data: any) => string,
  onDelta?: (delta: string) => void,
  idleTimeoutMs = 45000,
  onReasoning?: (delta: string) => void,
  extractReasoning?: (data: any) => string,
): Promise<string> {
  if (!response.body) {
    const data = await response.json();
    const text = extractText(data).trim();
    const reasoning = extractReasoning?.(data) || '';
    if (reasoning) onReasoning?.(reasoning);
    if (text) onDelta?.(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    try {
      const data = JSON.parse(payload);
      const delta = extractText(data);
      const reasoning = extractReasoning?.(data) || '';
      if (reasoning) onReasoning?.(reasoning);
      if (delta) {
        fullText += delta;
        onDelta?.(delta);
      }
    } catch {
      // Ignore non-JSON SSE comments/keep-alives.
    }
  };

  let lastChunkAt = Date.now();
  while (true) {
    const readPromise = reader.read();
    const timeoutPromise = new Promise<{ value: undefined; done: true }>((_, reject) => {
      const timer = window.setTimeout(() => reject(new Error('AI_STREAM_TIMEOUT: 流式接口连续 ' + Math.round(idleTimeoutMs / 1000) + ' 秒没有收到新数据')), idleTimeoutMs);
      readPromise.finally(() => window.clearTimeout(timer));
    });
    const { value, done } = await Promise.race([readPromise, timeoutPromise]);
    if (done) break;
    lastChunkAt = Date.now();
    void lastChunkAt;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(processLine);
  }

  buffer += decoder.decode();
  if (buffer) processLine(buffer);

  return fullText.trim();
}

function extractGeminiText(data: any): string {
  return (data?.candidates || [])
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

function extractOpenAiText(data: any): string {
  return (data?.choices || [])
    .map((choice: any) => choice?.message?.content ?? choice?.delta?.content ?? '')
    .flatMap((value: unknown) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) {
        return value
          .map((part: any) => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : ''))
          .filter(Boolean);
      }
      return [];
    })
    .join('');
}

function extractOpenAiReasoning(data: any): string {
  return (data?.choices || [])
    .flatMap((choice: any) => [
      choice?.message?.reasoning_content, choice?.message?.reasoning, choice?.message?.thinking,
      choice?.delta?.reasoning_content, choice?.delta?.reasoning, choice?.delta?.thinking,
    ])
    .flatMap((value: unknown) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap((part: any) =>
        typeof part === 'string' ? [part] :
        typeof part?.text === 'string' ? [part.text] :
        typeof part?.content === 'string' ? [part.content] : []
      );
      return [];
    })
    .filter(Boolean)
    .join('');
}

function extractGeminiReasoning(data: any): string {
  return (data?.candidates || [])
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .filter((part: any) => part?.thought === true || part?.type === 'thought' || part?.type === 'reasoning')
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('');
}

function wrapProviderReasoning(text: string, reasoning: string): string {
  const cleanText = String(text || '').trim();
  const cleanReasoning = String(reasoning || '').trim();
  if (!cleanReasoning || /<(?:think|thinking|thought|cot|summary|decision|decision_summary)>/i.test(cleanText)) return cleanText;
  return '<cot>' + cleanReasoning + '</cot>' + cleanText;
}

async function callGemini(input: AiReplyInput): Promise<string> {
  const { settings } = input;
  const base = (settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const action = settings.streaming ? 'streamGenerateContent' : 'generateContent';
  const suffix = settings.streaming ? '?alt=sse' : '';
  const endpoint =
    base +
    '/models/' +
    encodeURIComponent(settings.model.trim()) +
    ':' +
    action +
    suffix;

  const macroNames = macroNamesOf(input);
  const system = resolveMacros(buildCharacterSystemPrompt(input), macroNames);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: buildConversationMessages(input).map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: resolveMacros(message.content, macroNames) },
        ...(message.imageData ? (() => {
          const match = message.imageData.match(/^data:([^;]+);base64,(.+)$/);
          return match ? [{ inlineData: { mimeType: match[1], data: match[2] } }] : [];
        })() : []),
      ],
    })),
    generationConfig: {
      temperature: Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85)),
      topP: Math.max(0, Math.min(1, input.topP ?? input.settings.topP ?? 0.95)),
      topK: Math.max(1, Math.min(100, input.topK ?? input.settings.topK ?? 40)),
      maxOutputTokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 1200)),
    },
  };

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey.trim(),
    },
    body: JSON.stringify(body),
  }, 30000);

  if (!response.ok) throw new Error('AI_GEMINI_' + response.status + ': ' + await readError(response));

  if (settings.streaming) {
    let rawStream = '';
    const revealMessage = (delta: string) => {
      rawStream += delta;

      // Do not wait for <message>. Many OpenAI-compatible models return perfectly
      // valid plain text (or only COT/action metadata) without that wrapper. The
      // old streamer therefore looked like "no reply" until the request finished.
      // Keep metadata hidden while revealing the actual chat text as it arrives.
      let visible = rawStream;
      const messageMatch = rawStream.match(/<message>\s*([\s\S]*)$/i);
      if (messageMatch) {
        visible = messageMatch[1];
      } else {
        visible = visible
          .replace(/<(?:cot|thinking|think|thought|summary|decision|decision_summary)>[\s\S]*?(?:<\/(?:cot|thinking|think|thought|summary|decision|decision_summary)>|$)/gi, '')
          .replace(/\\[COT\\][\s\S]*?(?:\\[\/COT\\]|$)/gi, '')
          .replace(/【COT】[\s\S]*?(?=【(?:动作|状态栏)】|$)/gi, '');
      }

      visible = visible
        .replace(/<action>[\s\S]*?<\/action>/gi, '')
        .replace(/\\[动作\\][\s\S]*?\\[\/动作\\]/gi, '')
        .replace(/【动作】[\s\S]*?(?=【(?:状态栏|COT)】|$)/gi, '')
        .replace(/<status(?:bar)?>[\s\S]*?<\/status(?:bar)?>/gi, '')
        .replace(/\\[状态栏\\][\s\S]*?\\[\/状态栏\\]/gi, '')
        .replace(/【状态栏】[\s\S]*?(?=【(?:动作|COT)】|$)/gi, '')
        .replace(/<\/message>[\s\S]*$/i, '')
        .trimStart();

      input.onDelta?.(visible);
    };
    let reasoningStream = '';
    const result = await parseSseResponse(response, extractGeminiText, revealMessage, 45000, (delta) => { reasoningStream += delta; }, extractGeminiReasoning);
    return wrapProviderReasoning(result, reasoningStream);
  }

  const data = await response.json();
  const text = extractGeminiText(data).trim();
  const result = wrapProviderReasoning(text, extractGeminiReasoning(data));
  input.onDelta?.(result);
  return result;
}

function normalizeOpenAiEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('AI_BASE_URL_MISSING');
  return /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
}

function isLocalAiBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(baseUrl.trim());
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: API 接口超过 ' + Math.round(timeoutMs / 1000) + ' 秒没有响应，请检查 API 地址、API Key、网络连接或服务商状态。');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function callOpenAiCompatible(input: AiReplyInput): Promise<string> {
  const endpoint = normalizeOpenAiEndpoint(input.settings.apiBaseUrl);
  const macroNames = macroNamesOf(input);
  const system = resolveMacros(buildCharacterSystemPrompt(input), macroNames);
  const body = {
    model: input.settings.model.trim(),
    stream: Boolean(input.settings.streaming),
    temperature: Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85)),
    top_p: Math.max(0, Math.min(1, input.topP ?? input.settings.topP ?? 0.95)),
    frequency_penalty: Math.max(-2, Math.min(2, input.frequencyPenalty ?? input.settings.frequencyPenalty ?? 0)),
    presence_penalty: Math.max(-2, Math.min(2, input.presencePenalty ?? input.settings.presencePenalty ?? 0)),
    ...(input.seed ?? input.settings.seed) !== null && (input.seed ?? input.settings.seed) !== undefined ? { seed: Number(input.seed ?? input.settings.seed) } : {},
    max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 1200)),
    messages: [
      { role: 'system', content: system },
      ...buildConversationMessages(input).map(message => ({
        role: message.role,
        content: message.imageData
          ? [
              { type: 'text', text: resolveMacros(message.content, macroNames) },
              { type: 'image_url', image_url: { url: message.imageData } },
            ]
          : resolveMacros(message.content, macroNames),
      })),
    ],
  };

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + input.settings.apiKey.trim(),
    },
    body: JSON.stringify(body),
  }, 30000);

  if (!response.ok) throw new Error('AI_OPENAI_' + response.status + ': ' + await readError(response));

  if (input.settings.streaming) {
    let rawStream = '';
    const revealMessage = (delta: string) => {
      rawStream += delta;
      const match = rawStream.match(/<message>\s*([\s\S]*)$/i);
      if (match) {
        const visible = match[1]
          .replace(/<action>[\s\S]*?<\/action>/gi, '')
          .replace(/<\/message>[\s\S]*$/i, '')
          .trimStart();
        input.onDelta?.(visible);
      }
    };
    let reasoningStream = '';
    const result = await parseSseResponse(response, extractOpenAiText, revealMessage, 45000, (delta) => { reasoningStream += delta; }, extractOpenAiReasoning);
    return wrapProviderReasoning(result, reasoningStream);
  }

  const data = await response.json();
  const text = extractOpenAiText(data).trim();
  const result = wrapProviderReasoning(text, extractOpenAiReasoning(data));
  input.onDelta?.(result);
  return result;
}

function escapeCotRegex(value: string): string {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, '\\export async function generateCharacterReply(input: AiReplyInput): Promise<AiReplyResult> {');
}

/**
 * The selected COT preset controls both the emitted tag and the visible summary.
 * The final model may try to produce a second, different COT paragraph, so make
 * the pipeline use the already-completed prepass summary in the selected format.
 */
function normalizeCotOutputToSelectedPreset(rawText: string, cotTag: string, summary: string): string {
  const rawTag = String(cotTag || '<cot>...</cot>').trim();
  const safeSummary = String(summary || '').trim();
  if (!safeSummary) return rawText;

  const angle = rawTag.match(/<\s*([A-Za-z][\w:-]*)\s*>/);
  const bracket = rawTag.match(/\[\s*([A-Za-z][\w:-]*)\s*\]/);
  const titled = rawTag.match(/【\s*([^】]+?)\s*】/);
  let wrapper = '';
  let selectedName = '';

  if (angle) {
    selectedName = angle[1];
    wrapper = '<' + selectedName + '>' + safeSummary + '</' + selectedName + '>';
  } else if (bracket) {
    selectedName = bracket[1];
    wrapper = '[' + selectedName + ']' + safeSummary + '[/' + selectedName + ']';
  } else if (titled) {
    selectedName = titled[1].trim();
    wrapper = '【' + selectedName + '】' + safeSummary;
  } else {
    selectedName = 'cot';
    wrapper = '<cot>' + safeSummary + '</cot>';
  }

  let output = String(rawText || '');
  const boundary = '(?=<\\s*(?:message|action|statusbar?)\\b|\\[\\s*QA\\s*:|$)';
  const angleNames = new Set(['cot', 'thinking', 'think', 'thought', 'summary', 'decision', 'decision_summary']);
  if (angle) angleNames.add(selectedName);
  for (const name of angleNames) {
    const escaped = escapeCotRegex(name);
    output = output.replace(new RegExp(
      '<\\s*' + escaped + '\\s*>[\\s\\S]*?(?:<\\s*\\/\\s*' + escaped + '\\s*>|' + boundary + ')',
      'gi',
    ), '');
  }

  const bracketNames = new Set(['COT', 'THINKING', 'THINK', '动作思考']);
  if (bracket) bracketNames.add(selectedName);
  for (const name of bracketNames) {
    const escaped = escapeCotRegex(name);
    output = output.replace(new RegExp(
      '\\[\\s*' + escaped + '\\s*\\][\\s\\S]*?(?:\\[\\s*\\/\\s*' + escaped + '\\s*\\]|' + boundary + ')',
      'gi',
    ), '');
  }

  const titledNames = new Set(['COT', '思维链', '思考摘要']);
  if (titled) titledNames.add(selectedName);
  for (const name of titledNames) {
    const escaped = escapeCotRegex(name);
    output = output.replace(new RegExp('【\\s*' + escaped + '\\s*】[\\s\\S]*?' + boundary, 'gi'), '');
  }

  output = output.trim();
  const messageTag = /<\s*message\b/i.exec(output);
  if (messageTag && messageTag.index >= 0) {
    return output.slice(0, messageTag.index) + wrapper + '\n' + output.slice(messageTag.index);
  }
  return wrapper + (output ? '\n' + output : '');
}

export async function generateCharacterReply(input: AiReplyInput): Promise<AiReplyResult> {
  const startedAt = Date.now();
  const cotEnabled = Boolean(input.cotTarget && input.cotPreset);
  const actionEnabled = input.authorNote?.includes('【线上动作描写：开启】') || false;
  const trace: any = {
    provider: input.settings.provider,
    model: input.settings.model,
    context: {
      characterId: input.character?.id,
      characterName: input.character?.name,
      userPersona: input.persona?.name,
      conversationId: input.debugConversationId,
      userMessage: input.userMessage,
      messageCount: input.messages.length,
    },
    stage: 'created',
    stages: [],
    switches: {
      cotEnabled,
      cotTarget: input.cotTarget || null,
      cotPreset: input.cotPreset ? { id: input.cotPreset.id, title: input.cotPreset.title, tag: input.cotPreset.tag } : null,
      actionEnabled,
      actionRule: actionEnabled ? '【线上动作描写：开启】' : '关闭',
    },
  };
  const saveTrace = () => writeAiDebugTrace({ ...trace, durationMs: Date.now() - startedAt });
  const markTraceStage = (stage: string, detail?: string) => {
    trace.stage = stage;
    trace.stages = [...(Array.isArray(trace.stages) ? trace.stages : []), {
      stage,
      at: new Date().toISOString(),
      ...(detail ? { detail: String(detail).slice(0, 500) } : {}),
    }].slice(-24);
    saveTrace();
  };

  // Validation is part of the trace too: a missing key/model should never look like
  // "the request vanished before AI". The caller still receives the same error.
  try {
    requireApiKey(input.settings);
    markTraceStage('config-ready', input.settings.provider + ' / ' + input.settings.model);
  } catch (error) {
    trace.error = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined };
    markTraceStage('config-error', trace.error.message);
    throw error;
  }

  // Write immediately so the debug panel is never blank, even if prompt construction,
  // the provider request, or parsing fails later in the turn.
  saveTrace();
  pushAiDebugLog({ level:'info', event:'request:start', message:'开始角色回复请求', provider:input.settings.provider, model:input.settings.model, meta:{ cot:cotEnabled, action:actionEnabled, conversationId: input.debugConversationId } });

  const worldbooks = input.worldbooks || [];
  const scanDepth = Math.max(1, Math.min(50, Math.max(12, ...worldbooks.flatMap(book => book.entries.map(entry => Number(entry.scanDepth || 0))))));
  const scannedText = input.messages
    .filter(message => !message.isRecalled && !message.isRecalledByOther && message.type !== 'system-nudge')
    .slice(-scanDepth)
    .map(message => message.text || message.transcript || '')
    .filter(Boolean)
    .join('\n') + '\n' + input.userMessage;
  const matchedWorldbookEntries = selectWorldBookEntries(worldbooks, scannedText, buildWorldBookScanResolver(input, scanDepth)).length;

  const providerInput: AiReplyInput = { ...input, onDelta: undefined };
  let finalProviderInput: AiReplyInput = providerInput;
  let debugSystemPrompt = buildCharacterSystemPrompt(providerInput);
  const debugMessages = buildConversationMessages(providerInput);
  const replyMacroNames = macroNamesOf(input);
  trace.request = {
    system: debugSystemPrompt,
    messages: debugMessages,
    payload: input.settings.provider === 'gemini'
      ? {
          endpoint: ((input.settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')) +
            '/models/' + encodeURIComponent(input.settings.model.trim()) + ':' +
            (input.settings.streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'),
          body: {
            systemInstruction: { parts: [{ text: debugSystemPrompt }] },
            contents: [
              ...debugMessages.map(message => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
              })),
            ],
            generationConfig: {
              temperature: Number(input.settings.temperature ?? 0.85),
              maxOutputTokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 2200)),
            },
          },
        }
      : {
          endpoint: normalizeOpenAiEndpoint(input.settings.apiBaseUrl),
          body: {
            model: input.settings.model.trim(),
            stream: Boolean(input.settings.streaming),
            temperature: Number(input.settings.temperature ?? 0.85),
            max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 2200)),
            messages: [
              { role: 'system', content: debugSystemPrompt },
              ...debugMessages,
            ],
          },
        },
  };
  markTraceStage('request-prepared', 'messages=' + debugMessages.length + ', worldbookMatches=' + matchedWorldbookEntries);

  // COT must be an actual prerequisite of the character response, not just an
  // optional tag that the final model may omit. First generate a concise,
  // display-safe decision summary using the selected COT preset and context.
  // The final response is then generated with that summary injected into its
  // system prompt. This is a summary, not hidden step-by-step reasoning.
  let cotDecisionSummary = '';
  if (cotEnabled) {
    const cotStartedAt = Date.now();
    markTraceStage('cot-prepass-start', String(input.cotPreset?.title || input.cotPreset?.id || 'COT'));
    trace.cotPrepass = {
      status: 'running',
      presetId: input.cotPreset?.id || null,
      presetTitle: input.cotPreset?.title || null,
      tag: input.cotPreset?.tag || null,
    };
    saveTrace();

    try {
      // Rebuild only the context for the planning phase. Generated LINE author
      // notes contain final-output directives (emit the COT tag, then <message>,
      // and optionally <action>); those must not leak into this prepass.
      const prepassAuthorNote = String(providerInput.authorNote || '')
        .replace(/【COT 输出：(?:开启|关闭)】[\s\S]*?(?=\\n|\r?\n|$)/g, '')
        .replace(/【线上动作描写：(?:开启|关闭)】[\s\S]*?(?=\\n|\r?\n|$)/g, '');
      const prepassProviderInput: AiReplyInput = {
        ...providerInput,
        authorNote: prepassAuthorNote,
        statusBarPreset: undefined,
      };
      const prepassBasePrompt = buildCharacterSystemPrompt(prepassProviderInput);
      const roleContextPrompt = prepassBasePrompt.split('【当前任务 · 绝对最高优先级】')[0] || prepassBasePrompt;
      const decisionSystemPrompt = [
        roleContextPrompt,
        '',
        '【COT 前置阶段｜必须先完成】',
        '你现在只负责当前用户消息的角色回复决策，不要生成最终聊天回复、动作描写或状态栏。',
        '必须实际应用上方当前选中的 COT 预设，以及角色卡、人物关系、长期记忆、世界状态、作者注释和最近聊天上下文。不得改用其他预设或默认决策规则。',
        '【本轮唯一生效的 COT 预设】ID=' + String(input.cotPreset?.id || '') + '；标题=' + String(input.cotPreset?.title || '') + '；输出标签=' + String(input.cotPreset?.tag || ''),
        '【当前预设完整决策模板】\n' + String(input.cotPreset?.template || ''),
        '按这份模板中的判断顺序完成角色决策；此阶段输出的是给用户查看的“决策记录”，不是角色台词，也不是聊天正文的改写。不要展示逐步推理、私密思维链或冗长的内心独白。',
        '将预设内的 STEP/判断标准实际用于本轮判断；如果预设模板包含 FINAL、最终输出、标签或聊天正文格式要求，那些只属于第二阶段，不能在本阶段执行。',
        '严格按照当前选中预设的决策阶段理解和组织记录；预设中的阶段名称、顺序、关注点优先于任何通用模板。不要强行改写成固定的 STEP 1-6，也不要遗漏预设中与本轮相关的关键阶段。',
        '记录必须是具体、可核验的结论，而不是复述用户原话、角色即将说的话、玩笑台词、泛泛的“自然回应”，也不是把聊天正文换个说法。不得编造未出现在角色档案、记忆或对话中的事实。',
        '严格以当前选中预设的 template 为执行依据，优先遵守其中定义的阶段名称、顺序、字段、格式与详细程度。不要把通用 COT 模板强加到当前预设上；只有预设未说明的部分，才补充必要的情境事实、意图判断、角色立场、回应策略和风险检查。只写本轮相关内容，不得为了凑字段编造事实。',
        '输出具体、可核验的高层角色决策记录，长度和组织方式由当前预设决定，不再统一压缩成固定的 3～7 行。不要输出最终回复、动作描写、状态栏、JSON、Markdown 代码块或角色会直接发给用户的台词。若上下文不足，应明确写出不确定性，不得猜测。',
        '下面是本轮唯一需要处理的用户消息：',
        '<<<CURRENT_USER_MESSAGE>>>',
        input.userMessage,
        '<<<END_CURRENT_USER_MESSAGE>>>',
      ].join('\n');

      const cotRaw = await generateCreativeText({
        settings: { ...input.settings, streaming: false },
        systemPrompt: decisionSystemPrompt,
        history: debugMessages.slice(0, -1).map(message => ({
          role: message.role,
          content: message.content,
        })),
        userPrompt: input.userMessage,
        temperature: Math.min(0.65, Number(input.temperature ?? input.settings.temperature ?? 0.85)),
        // COT is a separate planning request; allow slower local/Docker-compatible endpoints
        // more time than the normal 30-second request timeout.
        timeoutMs: 60000,
        macroNames: replyMacroNames,
      });

      cotDecisionSummary = String(cotRaw || '')
        .replace(/^\x60{3}[a-zA-Z0-9_-]*\s*/, '')
        .replace(/\s*\x60{3}$/, '')
        .replace(/<\/?(?:cot|think|thinking|thought|summary|decision|decision_summary)>/gi, '')
        .replace(/^【(?:COT|思维链|思考摘要)】\s*/i, '')
        .trim()
        .slice(0, 3000);

      if (!cotDecisionSummary || /^(?:\.{2,}|…+|待填写|TODO)$/i.test(cotDecisionSummary)) {
        throw new Error('COT 前置阶段没有生成有效的角色决策摘要');
      }

      trace.cotPrepass = {
        status: 'success',
        presetId: input.cotPreset?.id || null,
        presetTitle: input.cotPreset?.title || null,
        tag: input.cotPreset?.tag || null,
        summary: cotDecisionSummary,
        durationMs: Date.now() - cotStartedAt,
      };
      pushAiDebugLog({
        level: 'success',
        event: '[SANE333 COT] prepass:complete',
        message: 'COT 前置决策已完成，最终回复将依据该摘要生成',
        provider: input.settings.provider,
        model: input.settings.model,
        durationMs: Date.now() - cotStartedAt,
        meta: {
          conversationId: input.debugConversationId,
          presetId: input.cotPreset?.id,
          presetTitle: input.cotPreset?.title,
          tag: input.cotPreset?.tag,
          summary: cotDecisionSummary,
        },
      });
      markTraceStage('cot-prepass-complete', 'summaryLength=' + cotDecisionSummary.length);

      finalProviderInput = {
        ...providerInput,
        authorNote: [
          input.authorNote,
          '【COT 前置决策已完成｜必须用于本轮回复】',
          '本轮在生成最终消息之前，已经应用当前选择的 COT 预设完成角色判断。',
          '本轮决策摘要：' + cotDecisionSummary,
          '【最高优先级·本轮 COT 执行锚点】生成正文前必须逐项读取上面的决策摘要，并把其中的情境判断、角色立场、回应策略与自检结论落实到实际回复。不得只输出摘要却忽略其内容，也不得用模型默认风格覆盖它。',
          '如果当前用户消息或明确的角色事实要求修正摘要中的推断，以当前事实为准，并在回复中自然体现；除此之外，不得无理由偏离摘要。不要向用户解释或复述这条执行规则。',
          '最终输出仍须按已配置的 COT 标签输出这份简短摘要，再输出正常消息；摘要不是隐藏推理，不得补写逐步推理。',
        ].filter(Boolean).join('\n'),
      };
      debugSystemPrompt = buildCharacterSystemPrompt(finalProviderInput);
      trace.request.system = debugSystemPrompt;
      if (input.settings.provider === 'gemini') {
        const parts = trace.request.payload?.body?.systemInstruction?.parts;
        if (Array.isArray(parts) && parts[0]) parts[0].text = debugSystemPrompt;
      } else {
        const requestMessages = trace.request.payload?.body?.messages;
        if (Array.isArray(requestMessages) && requestMessages[0]) requestMessages[0].content = debugSystemPrompt;
      }
      saveTrace();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      trace.cotPrepass = {
        status: 'failed',
        presetId: input.cotPreset?.id || null,
        presetTitle: input.cotPreset?.title || null,
        durationMs: Date.now() - cotStartedAt,
        error: message,
      };
      trace.error = { message: 'COT_PREPASS_FAILED: ' + message, stack: error instanceof Error ? error.stack : undefined };
      markTraceStage('cot-prepass-error', message);
      pushAiDebugLog({
        level: 'error',
        event: '[SANE333 COT] prepass:failed',
        message: 'COT 前置决策失败，已阻止跳过 COT 直接生成回复',
        provider: input.settings.provider,
        model: input.settings.model,
        durationMs: Date.now() - cotStartedAt,
        meta: { conversationId: input.debugConversationId, presetId: input.cotPreset?.id, error: message },
      });
      throw new Error('COT 前置决策失败，本轮没有跳过思维链直接回复。' + message);
    }
  }

  let rawText = '';
  try {
    markTraceStage('request-sending', input.settings.provider + ' / ' + input.settings.model + (cotEnabled ? ' / COT complete' : ''));
    rawText = input.settings.provider === 'gemini'
      ? await callGemini(finalProviderInput)
      : await callOpenAiCompatible(finalProviderInput);
    markTraceStage('response-received', 'rawLength=' + String(rawText || '').length);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace.error = { message, stack: error instanceof Error ? error.stack : undefined };
    markTraceStage('request-error', message);
    pushAiDebugLog({ level:'error', event:'request:error', message, provider:input.settings.provider, model:input.settings.model, durationMs:Date.now()-startedAt });
    throw error;
  }

  const providerRawText = rawText;
  let providerParsedRaw = parseAiReplyPayload(providerRawText, input.cotPreset?.tag, input.statusBarPreset?.regex);
  const normalizedReplyText = cotEnabled && cotDecisionSummary
    ? normalizeCotOutputToSelectedPreset(providerRawText, input.cotPreset?.tag || '<cot>...</cot>', cotDecisionSummary)
    : providerRawText;
  trace.providerRawResponse = providerRawText;
  trace.rawResponse = normalizedReplyText;
  trace.cotOutputNormalization = cotEnabled ? {
    selectedPresetId: input.cotPreset?.id || null,
    selectedPresetTitle: input.cotPreset?.title || null,
    selectedTag: input.cotPreset?.tag || null,
    modelEmittedCot: Boolean(providerParsedRaw.thinkingSummary),
    modelSummary: providerParsedRaw.thinkingSummary || null,
    normalizedToPrepassSummary: Boolean(cotDecisionSummary),
    visibleSummary: cotDecisionSummary || null,
  } : null;
  let parsedRaw = parseAiReplyPayload(normalizedReplyText, input.cotPreset?.tag, input.statusBarPreset?.regex);
  if (providerParsedRaw.statusBarRaw && !parsedRaw.statusBarRaw) {
    parsedRaw.statusBarRaw = providerParsedRaw.statusBarRaw;
  }


  // A valid status payload is NOT a chat reply. Some models may obey the status
  // format but accidentally omit the normal character message, which previously
  // made the whole turn fail as AI_EMPTY_RESPONSE. Repair only this malformed case:
  // keep the exact status payload, add a natural character reply before it, and
  // re-parse the repaired single response. Normal turns still use one AI request.
  if (input.statusBarPreset?.regex?.trim() && parsedRaw.statusBarRaw && !parsedRaw.text.trim()) {
    pushAiDebugLog({
      level: 'error',
      event: '[SANE333 STATUS BAR] response-status-only',
      message: 'AI 只返回了状态栏，没有正常角色回复；启动同回复修复',
      provider: input.settings.provider,
      model: input.settings.model,
      meta: {
        regex: input.statusBarPreset.regex,
        statusBarRaw: parsedRaw.statusBarRaw,
        userMessage: input.userMessage,
      },
    });

    const repairSystemPrompt = [
      debugSystemPrompt,
      '',
      '【回复结构修复】',
      '上一轮 AI 已经生成了正确的状态栏原文，但错误地没有生成正常角色聊天消息。',
      '这是一次格式修复，不是重新设计状态栏。',
      '必须先生成一段自然、符合当前角色人设的正常聊天回复，然后在整段回复最后原样追加下面提供的状态栏原文。',
      '不要修改、翻译、缩写或重新生成状态栏原文；不要把状态栏内容当成聊天回复。',
      '最终必须同时存在：正常角色聊天消息 + 状态栏原文。',
      '状态栏必须保持在整段输出的最后。',
      '【已经生成的状态栏原文】',
      parsedRaw.statusBarRaw,
    ].join('\n');

    const repairedRaw = (await generateCreativeText({
      settings: { ...input.settings, streaming: false },
      systemPrompt: repairSystemPrompt,
      userPrompt: input.userMessage,
      history: debugMessages,
      macroNames: replyMacroNames,
      temperature: Math.min(0.8, input.settings.temperature ?? 0.8),
    })).trim();

    const repairedProviderParsed = parseAiReplyPayload(
      repairedRaw,
      input.cotPreset?.tag,
      input.statusBarPreset.regex,
    );
    const repairedNormalizedRaw = cotEnabled && cotDecisionSummary
      ? normalizeCotOutputToSelectedPreset(repairedRaw, input.cotPreset?.tag || '<cot>...</cot>', cotDecisionSummary)
      : repairedRaw;
    const repairedParsed = parseAiReplyPayload(
      repairedNormalizedRaw,
      input.cotPreset?.tag,
      input.statusBarPreset.regex,
    );
    if (repairedProviderParsed.statusBarRaw && !repairedParsed.statusBarRaw) {
      repairedParsed.statusBarRaw = repairedProviderParsed.statusBarRaw;
    }

    pushAiDebugLog({
      level: repairedParsed.text.trim() && repairedParsed.statusBarRaw ? 'success' : 'error',
      event: '[SANE333 STATUS BAR] response-repair',
      message: repairedParsed.text.trim() && repairedParsed.statusBarRaw
        ? '同回复修复成功：正常角色回复与状态栏同时存在'
        : '同回复修复失败',
      provider: input.settings.provider,
      model: input.settings.model,
      meta: {
        originalStatus: parsedRaw.statusBarRaw,
        repairedRaw,
        repairedText: repairedParsed.text,
        repairedStatus: repairedParsed.statusBarRaw || '',
      },
    });

    if (repairedParsed.text.trim() && repairedParsed.statusBarRaw) {
      parsedRaw = repairedParsed;
      providerParsedRaw = repairedProviderParsed;
      rawText = repairedRaw;
      trace.providerRawResponse = rawText;
      trace.rawResponse = repairedNormalizedRaw;
      trace.cotOutputNormalization = cotEnabled ? {
        selectedPresetId: input.cotPreset?.id || null,
        selectedPresetTitle: input.cotPreset?.title || null,
        selectedTag: input.cotPreset?.tag || null,
        modelEmittedCot: Boolean(repairedProviderParsed.thinkingSummary),
        modelSummary: repairedProviderParsed.thinkingSummary || null,
        normalizedToPrepassSummary: Boolean(cotDecisionSummary),
        visibleSummary: cotDecisionSummary || null,
      } : null;
      markTraceStage('response-repaired', 'status-only response repaired with normal chat text');
    }
  }

  const parsed = {
    text: resolveMacros(parsedRaw.text, replyMacroNames),
    // Show the exact decision summary from the required prepass. The final
    // model's optional echo tag remains available separately in the trace.
    thinkingSummary: cotDecisionSummary
      ? resolveMacros(cotDecisionSummary, replyMacroNames)
      : (parsedRaw.thinkingSummary ? resolveMacros(parsedRaw.thinkingSummary, replyMacroNames) : undefined),
    actionDescription: parsedRaw.actionDescription ? resolveMacros(parsedRaw.actionDescription, replyMacroNames) : undefined,
    statusBarRaw: parsedRaw.statusBarRaw ? resolveMacros(parsedRaw.statusBarRaw, replyMacroNames) : undefined,
    rawResponse: rawText,
  };
  trace.parsed = {
    thinkingSummary: parsed.thinkingSummary || null,
    reasoningSeparated: Boolean(parsed.thinkingSummary),
    actionDescription: parsed.actionDescription || null,
    statusBarRaw: parsed.statusBarRaw || null,
    rawResponseLength: rawText.length,
    text: parsed.text,
    hasCot: Boolean(parsed.thinkingSummary),
    modelEmittedCotTag: Boolean(providerParsedRaw.thinkingSummary),
    modelEmittedCotSummary: providerParsedRaw.thinkingSummary || null,
    cotDecisionSummary: cotDecisionSummary || null,
    cotOutputNormalizedToSelectedPreset: Boolean(cotEnabled && cotDecisionSummary),
    cotPrepassCompleted: Boolean(cotDecisionSummary),
    hasAction: Boolean(parsed.actionDescription),
    expectedCot: cotEnabled,
    expectedAction: actionEnabled,
    missingCot: cotEnabled && !parsed.thinkingSummary,
    missingAction: actionEnabled && !parsed.actionDescription,
  };
  markTraceStage('parsed', 'textLength=' + parsed.text.length + ', cot=' + Boolean(parsed.thinkingSummary) + ', action=' + Boolean(parsed.actionDescription));

  if (!parsed.text) {

    trace.error = { message: 'AI_EMPTY_RESPONSE' };
    markTraceStage('parse-error', 'AI_EMPTY_RESPONSE');
    throw new Error('AI_EMPTY_RESPONSE');
  }

  if (!input.settings.streaming) input.onDelta?.(parsed.text);
  markTraceStage('final-ready', 'replyLength=' + parsed.text.length);
  trace.final = {
    text: parsed.text,
    thinkingSummary: parsed.thinkingSummary || null,
    actionDescription: parsed.actionDescription || null,
    statusBarRaw: parsed.statusBarRaw || null,
    matchedWorldbookEntries,
    expectedCot: cotEnabled,
    expectedAction: actionEnabled,
    hasCot: Boolean(parsed.thinkingSummary),
    hasAction: Boolean(parsed.actionDescription),
  };
  saveTrace();

  pushAiDebugLog({ level:'success', event:'request:success', message:'角色回复成功', provider:input.settings.provider, model:input.settings.model, durationMs:Date.now()-startedAt, meta:{ textLength:parsed.text.length, hasCot:Boolean(parsed.thinkingSummary), hasAction:Boolean(parsed.actionDescription), matchedWorldbookEntries } });
  const replyResult = {
    text: parsed.text,
    thinkingSummary: parsed.thinkingSummary,
    actionDescription: parsed.actionDescription,
    statusBarRaw: parsed.statusBarRaw,
    rawResponse: rawText,
    provider: input.settings.provider,
    model: input.settings.model.trim(),
    matchedWorldbookEntries,
  };
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sane333:line-replied', {
        detail: {
          characterId: (input.character as any)?.id || null,
          characterName: (input.character as any)?.name || '',
          channel: (input as any)?.channel || '',
          conversationId: (input as any)?.conversationId || '',
          groupName: (input as any)?.groupName || '',
          chatText: String((input as any)?.userMessage || '').slice(-500),
          replyText: String(parsed.text || '').slice(-800),
        },
      }));
    }
  } catch { /* never break reply */ }
  return replyResult;
}
export async function testAiConnection(
  settings: AiSettings,
): Promise<{ ok: true; text: string } | never> {
  await generateCharacterReply({
    settings: { ...settings, streaming: false },
    character: null,
    characterProfile: {
      nickname: '测试角色',
      relationship: '测试关系',
      callMe: '朋友',
      bio: '连接测试',
    },
    persona: null,
    worldbooks: [],
    messages: [],
    userMessage: '请只回复两个字：已连接',
  });

  return { ok: true, text: '已连接' };
}


export interface CreativeTextInput {
  settings: AiSettings;
  systemPrompt: string;
  userPrompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  onDelta?: (delta: string) => void;
  timeoutMs?: number;
  macroNames?: MacroNames;
}

export async function generateCreativeText(input: CreativeTextInput): Promise<string> {
  const resolved: CreativeTextInput = {
    ...input,
    systemPrompt: resolveMacros(input.systemPrompt, input.macroNames),
    userPrompt: resolveMacros(input.userPrompt, input.macroNames),
    history: input.history?.map(message => ({ ...message, content: resolveMacros(message.content, input.macroNames) })),
  };
  return resolveMacros(await generateCreativeTextRaw(resolved), input.macroNames);
}

async function generateCreativeTextRaw(input: CreativeTextInput): Promise<string> {
  requireApiKey(input.settings);
  const temperature = Math.max(0, Math.min(2, input.temperature ?? input.settings.temperature ?? 0.85));
  const history = input.history || [];

  const proxyChat = async () => {
    const response = await fetch('/api/ai-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        provider: input.settings.provider,
        baseUrl: input.settings.apiBaseUrl,
        apiKey: input.settings.apiKey.trim(),
        model: input.settings.model.trim(),
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        history,
      }),
    });
    if (!response.ok) throw new Error('AI_PROXY_' + response.status + ': ' + await readError(response));
    const data = await response.json();
    const text = input.settings.provider === 'gemini' ? extractGeminiText(data).trim() : extractOpenAiText(data).trim();
    if (!text) throw new Error('AI_EMPTY_RESPONSE');
    input.onDelta?.(text);
    return text;
  };

  try {
    if (input.settings.provider === 'gemini') {
      const base = (input.settings.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const action = input.settings.streaming ? 'streamGenerateContent' : 'generateContent';
      const suffix = input.settings.streaming ? '?alt=sse' : '';
      const endpoint = base + '/models/' + encodeURIComponent(input.settings.model.trim()) + ':' + action + suffix;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.settings.apiKey.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemPrompt }] },
          contents: [
            ...history.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
            { role: 'user', parts: [{ text: input.userPrompt }] },
          ],
          generationConfig: { temperature, maxOutputTokens: 2200 },
        }),
      });
      if (!response.ok) throw new Error('AI_GEMINI_' + response.status + ': ' + await readError(response));
      if (input.settings.streaming) return parseSseResponse(response, extractGeminiText, input.onDelta);
      const data = await response.json();
      const text = extractGeminiText(data).trim();
      input.onDelta?.(text);
      return text;
    }

    const endpoint = normalizeOpenAiEndpoint(input.settings.apiBaseUrl);
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + input.settings.apiKey.trim(),
      },
      body: JSON.stringify({
        model: input.settings.model.trim(),
        stream: Boolean(input.settings.streaming),
        temperature,
        max_tokens: Math.max(128, Math.min(12000, Number(input.settings.maxOutputTokens) || 2200)),
        messages: [
          { role: 'system', content: input.systemPrompt },
          ...history,
          { role: 'user', content: input.userPrompt },
        ],
      }),
    }, input.timeoutMs ?? 30000);
    if (!response.ok) throw new Error('AI_OPENAI_' + response.status + ': ' + await readError(response));
    if (input.settings.streaming) return parseSseResponse(response, extractOpenAiText, input.onDelta);
    const data = await response.json();
    const text = extractOpenAiText(data).trim();
    input.onDelta?.(text);
    return text;
  } catch (error) {
    // A local Docker endpoint must stay in the browser. Vercel cannot reach
    // the user's localhost, so proxying localhost requests only creates a hang.
    if (!isLocalAiBaseUrl(input.settings.apiBaseUrl) &&
        (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed|CORS/i.test(String(error)))) {
      return proxyChat();
    }
    throw error;
  }
}

export async function listOpenAiCompatibleModels(
  settings: AiSettings,
): Promise<string[]> {
  if (!settings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');

  let base = (
    settings.apiBaseUrl.trim() ||
    (settings.provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : '')
  ).replace(/\/+$/, '');
  if (!base) throw new Error('AI_BASE_URL_MISSING');

  base = base
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');

  const endpoint = base + '/models';
  let response: Response | null = null;
  let directError: unknown = null;

  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + settings.apiKey.trim(),
      },
    }, 15000);
  } catch (error) {
    directError = error;
  }

  // Gemini discovery uses the server-side proxy. Local Docker OpenAI-compatible
  // endpoints must remain browser-side because a Vercel function cannot reach
  // the user's localhost.
  if (settings.provider === 'gemini' || (!response && !isLocalAiBaseUrl(base))) {
    try {
      response = await fetch('/api/ai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'models',
          provider: settings.provider,
          baseUrl: base,
          apiKey: settings.apiKey.trim(),
        }),
      });
    } catch (proxyError) {
      throw new Error(
        'AI_MODELS_NETWORK: ' +
        (proxyError instanceof Error
          ? proxyError.message
          : directError instanceof Error
            ? directError.message
            : '无法连接模型接口'),
      );
    }
  }

  if (!response) {
    throw new Error('AI_MODELS_NETWORK: ' + (directError instanceof Error ? directError.message : '无法连接模型接口'));
  }

  if (!response.ok) {
    throw new Error('AI_MODELS_' + response.status + ': ' + await readError(response));
  }

  const data = await response.json();
  const rawModels =
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data?.models) ? data.models :
    Array.isArray(data) ? data :
    [];

  const models = rawModels
    .map((item: any) => typeof item === 'string' ? item : item?.id || item?.name)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id: string) => id.trim())
    .map((id: string) => settings.provider === 'gemini' ? id.replace(/^models\//i, '') : id);

  return Array.from(new Set(models));
}




export async function generateStatusBarContent(
  settings: AiSettings,
  characterName: string,
  preset: { name: string; promptSuffix?: string; regex: string; html: string },
  conversation: Array<{ sender: string; text?: string; transcript?: string }>,
  currentStatus?: string,
  userName?: string,
): Promise<string> {
  const recent = conversation.slice(-16).map(message => {
    const speaker = message.sender === 'other' ? characterName : message.sender === 'me' ? '用户' : '系统';
    return speaker + ': ' + (message.text || message.transcript || '[媒体]');
  }).join('\n');

  const resolvedPrompt = resolveMacros(
    preset.promptSuffix || '请根据刚刚的聊天回复生成当前状态。',
    { char: characterName, user: userName },
  );
  const regexSource = String(preset.regex || '').trim();

  const systemPrompt = [
    '你是角色聊天的状态栏原始输出生成器。',
    '你的工作不是设计 HTML，也不是解释状态栏，而是严格执行这个预设自己的 Prompt，生成一段原始状态文本，供应用随后用 Regex 捕获并交给 HTML 模板渲染。',
    '【最重要规则】当前选中状态栏预设的 Prompt 决定生成内容与格式；同一预设的 Regex 只负责从原始输出中捕获内容，HTML 模板负责渲染捕获结果。三者职责不可互相替代。',
    '绝对不要套用其他状态栏预设的字段、标签、示例或固定格式。只按当前选中预设的 Prompt 生成原始文本，并让当前预设的 Regex 负责捕获；Prompt 未要求的结构一律不要自行添加。',
    '只有当前预设 Prompt 明确要求时，才输出它指定的标签、括号、字段名或分隔符；不要从别的预设借用格式。',
    '不要输出 Markdown 代码块、解释、前后注释或额外文本。',
    currentStatus ? '【最近状态（由旧到新，最后一条是最新）】\n' + currentStatus + '\n只在当前聊天提供依据时更新最新一条；时间只能向后推进，不要倒退或跳变。' : '【上一状态】暂无。',
    '【状态栏名称】' + preset.name,
    '【状态栏 Prompt｜必须执行】\n' + resolvedPrompt,
    regexSource ? '【Regex｜输出必须匹配】\n' + regexSource : '【Regex】未配置；按 Prompt 自身格式输出。',
    regexSource ? '输出前自检：整段原始输出中必须包含一段能够被上面 Regex 匹配的完整文本；如果不匹配，就重新生成，直到匹配为止。' : '',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    '角色：' + characterName,
    '最近聊天：',
    recent || '暂无',
    '',
    '现在生成这一轮最新状态快照。',
    '严格执行【状态栏 Prompt｜必须执行】。',
    regexSource ? '严格确保最终原始输出能够被【Regex｜输出必须匹配】捕获。只返回最终原始状态，不要附加说明。' : '只返回最终原始状态，不要附加说明。',
  ].join('\n');

  const raw = (await generateCreativeText({
    settings: { ...settings, streaming: false },
    systemPrompt,
    userPrompt,
    macroNames: { char: characterName, user: userName },
    temperature: Math.min(0.75, settings.temperature ?? 0.75),
  })).trim();

  pushAiDebugLog({
    level: regexSource ? (extractStatusMatch(raw, regexSource) ? 'success' : 'error') : 'info',
    event: '[SANE333 STATUS BAR] generator',
    message: regexSource && !extractStatusMatch(raw, regexSource)
      ? '状态栏 AI 首次返回未匹配 Regex，准备进行格式修复重试'
      : '状态栏 AI 首次返回完成',
    provider: settings.provider,
    model: settings.model,
    meta: { characterName, preset: preset.name, prompt: resolvedPrompt, regex: regexSource, rawStatus: raw },
  });

  if (regexSource && !extractStatusMatch(raw, regexSource)) {
    // Every status-bar preset owns its own Regex. Never assume a fixed field
    // layout such as Q/QT/A/AT; the current preset's regex is the only parser rule.
    const repairPrompt = [
      '把下面这段 AI 状态栏原文修复成“能够匹配当前预设 Regex”的最终原文。',
      '当前预设的 Regex 就是唯一需要满足的结构规则。不要假设字段名、字段数量、字段顺序、标签文字或包装形式。',
      '不要重新编造事实；尽可能保留原始返回中的事实与内容，只把输出调整到当前 Regex 能捕获的结构。',
      '最终只输出一段原始状态文本，不要解释。',
      '【本次预设的 Regex】' + regexSource,
      '【本次预设的 Prompt】' + resolvedPrompt,
      '【AI 第一次原始返回】' + raw,
      '在输出前自检：把最终原文代入【本次预设的 Regex】，必须能够得到匹配结果。',
    ].join('\n');

    const repaired = (await generateCreativeText({
      settings: { ...settings, streaming: false, temperature: 0.15 },
      systemPrompt: '你是状态栏 Regex 格式修复器。只针对当前请求提供的 Regex 修复当前原文；绝对不要套用任何预设示例或固定字段。',
      userPrompt: repairPrompt,
      macroNames: { char: characterName, user: userName },
      temperature: 0.15,
    })).trim();

    const repairedMatch = extractStatusMatch(repaired, regexSource);
    pushAiDebugLog({
      level: repairedMatch ? 'success' : 'error',
      event: '[SANE333 STATUS BAR] generator-repair',
      message: repairedMatch ? '状态栏格式修复成功，已匹配 Regex' : '状态栏格式修复后仍未匹配 Regex',
      provider: settings.provider,
      model: settings.model,
      meta: { regex: regexSource, original: raw, repaired, captures: repairedMatch?.captures || [] },
    });
    return repaired;
  }

  return raw;
}

export async function generateHtmlInterlude(
  settings: AiSettings,
  characterName: string,
  htmlTemplate: string,
  conversation: Array<{ sender: string; text?: string; transcript?: string }>,
): Promise<string> {
  const recent = conversation.slice(-18).map(message => {
    const speaker = message.sender === 'other' ? characterName : message.sender === 'me' ? '用户' : '系统';
    return speaker + ': ' + (message.text || message.transcript || '[媒体]');
  }).join('\n');

  const systemPrompt = [
    '你是聊天里的 HTML 中插生成器。',
    '根据当前剧情决定这一轮是否适合出现一个轻量的视觉内容卡片。',
    '只输出 HTML 片段，不要 Markdown 代码块，不要解释。',
    '必须遵守提供的 HTML 模板结构，不得添加 script、style、iframe、form、事件属性、javascript: URL 或外部资源。',
    '内容必须直接来自最近聊天，不能凭空制造已经发生的事实。',
    'HTML 可以有标题、正文、标签、列表、时间、地点、引用、简单装饰结构。',
    '如果模板提供占位符，就替换成与当前聊天相关的内容。',
    '【HTML 模板】' + htmlTemplate,
  ].join('\n');

  const userPrompt = [
    '角色：' + characterName,
    '最近聊天：',
    recent || '暂无',
    '',
    '生成一张适合插入当前聊天的 HTML 内容卡片。',
  ].join('\n');

  return (await generateCreativeText({
    settings: { ...settings, streaming: false },
    systemPrompt,
    userPrompt,
    temperature: Math.min(0.9, settings.temperature ?? 0.85),
  })).trim();
}


export interface MemoryMergeResult {
  summary: string;
  updates: Array<{
    action: 'add' | 'update' | 'delete';
    id?: string;
    content?: string;
    section?: MemorySection;
    kind?: 'fact' | 'diary' | 'relationship' | 'preference' | 'event';
    importance?: number;
  }>;
}

function memoryStyleInstructions(memory: CharacterMemory): string {
  const style = memory.memoryStyle;
  if (!style) return '使用角色自己的自然记忆方式，但绝不改变事实。';
  const personalityMap: Record<string,string> = {
    balanced: '平衡、克制，优先保留真正有用的信息。',
    observant: '像一个细心观察的人，重视细节与行为变化。',
    diary: '像角色自己的私人记录，保留事件与当时氛围。',
    analytical: '重视因果、关系变化与稳定事实。',
    warm: '更关注关系中的重要时刻与情绪，但不替用户编造感受。',
    'character-style': '完全按照这个角色自己的性格、经历和既有记忆来决定什么值得记住。',
  };
  const sectionLines = Object.entries(style.sections || {}).map(([section, preset]) =>
    section + ': ' + preset.length + ', 最多 ' + preset.maxChars + ' 字, 重点=' + preset.focus
  );
  return [
    '整体记忆人格：' + (personalityMap[style.personality] || personalityMap['character-style']),
    '每一层记忆的总结方式：',
    ...sectionLines,
    '“角色自己的风格”只能改变选择、详略、语气和主观侧重点，绝对不能凭空创造事实。',
  ].join('\n');
}

export async function mergeRecentMemoryBatch(
  settings: AiSettings,
  characterName: string,
  currentMemory: CharacterMemory,
  batch: Array<{ id: string; content: string; importance: number; source: string; createdAt: string }>,
): Promise<MemoryMergeResult> {
  const appSettings = readAppSettings();
  const model = appSettings.memoryModel.trim() || settings.model;
  const mergeSettings: AiSettings = { ...settings, model, temperature: appSettings.memoryTemperature };
  const existing = currentMemory.items.slice(0, 120).map(item =>
    JSON.stringify({ id: item.id, section: item.section || 'stage', kind: item.kind || 'fact', importance: item.importance, content: item.content })
  ).join('\n');
  const incoming = batch.map(item =>
    JSON.stringify({ id: item.id, importance: item.importance, source: item.source, createdAt: item.createdAt, content: item.content })
  ).join('\n');

  const systemPrompt = [
    '你是角色 Memory Merge Engine。',
    '这里有一批已经通过候选判断的近期 Memory Summary。它们不是聊天原文，而是值得进一步整理的候选记忆。',
    '你的任务不是简单压缩成一段话，而是把它们与已有长期记忆逐项比较。',
    '必须：去重、合并相关记忆、识别新旧冲突、处理过时信息、更新长期记忆、分类到七个固定层。',
    '七个层只能使用：stage, about-you, relationship, understanding, confirm, todo, done。',
    '普通闲聊不要进入长期记忆。',
    '发生冲突时，以更晚、证据更明确的信息更新旧记忆；必要时保留时间关系，不要同时保留明显互相矛盾的永久事实。',
    'delete 用于明确已经失效或被新信息完全取代的旧条目。',
    memoryStyleInstructions(currentMemory),
    '只能使用输入中的事实。绝不脑补。',
    '输出严格 JSON，不要 Markdown。',
    JSON.stringify({
      summary: '新的长期记忆总览',
      updates: [
        { action: 'add', content: '...', section: 'about-you', kind: 'fact', importance: 80 },
        { action: 'update', id: '已有记忆ID', content: '...', section: 'relationship', kind: 'relationship', importance: 90 },
        { action: 'delete', id: '已有记忆ID' }
      ]
    }),
  ].join('\n');

  const userPrompt = [
    '【角色】' + characterName,
    '【角色现有长期记忆】',
    existing || '暂无',
    '',
    '【本次刚满 100 条的近期 Summary】',
    incoming,
    '',
    '请完成一次完整 Merge。不要为了填满七层而制造内容。',
  ].join('\n');

  const raw = await generateCreativeText({
    settings: mergeSettings,
    systemPrompt,
    userPrompt,
    temperature: appSettings.memoryTemperature,
  });
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '');
  const parsed = JSON.parse(cleaned);
  const validSections = new Set(['stage','about-you','relationship','understanding','confirm','todo','done']);
  const validKinds = new Set(['fact','diary','relationship','preference','event']);
  const updates = Array.isArray(parsed?.updates) ? parsed.updates.map((item: any) => ({
    action: item?.action === 'delete' ? 'delete' : item?.action === 'update' ? 'update' : 'add',
    id: typeof item?.id === 'string' ? item.id : undefined,
    content: typeof item?.content === 'string' ? item.content.trim() : undefined,
    section: validSections.has(item?.section) ? item.section : 'stage',
    kind: validKinds.has(item?.kind) ? item.kind : 'fact',
    importance: Math.max(0, Math.min(100, Number(item?.importance) || 50)),
  })).filter((item: any) => item.action === 'delete' ? Boolean(item.id) : Boolean(item.content)).slice(0, 120) : [];
  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : currentMemory.summary,
    updates,
  };
}

export async function summarizeConversationMemory(
  settings: AiSettings,
  characterName: string,
  currentMemory: CharacterMemory,
  messages: Array<{ sender: string; text?: string; transcript?: string }>,
): Promise<{ summary: string; items: Array<{ content: string; kind: 'fact' | 'diary' | 'relationship' | 'preference' | 'event'; importance: number }> }> {
  const appSettings = readAppSettings();
  if (!appSettings.memoryEnabled) return { summary: currentMemory.summary, items: [] };

  const conversation = messages
    .slice(-Math.max(10, appSettings.memoryContextMessages || 40))
    .map(message => {
      const speaker = message.sender === 'other' ? characterName : message.sender === 'me' ? '用户' : '系统';
      return speaker + ': ' + (message.text || message.transcript || '[媒体消息]');
    })
    .join('\n');

  const mode = appSettings.memoryMode || 'hybrid';
  const roleModel =
    mode === 'diary' ? appSettings.memoryDiaryModel.trim() :
    mode === 'facts' ? appSettings.memoryFactsModel.trim() :
    mode === 'relationship' ? appSettings.memoryRelationshipModel.trim() :
    '';
  const model = roleModel || appSettings.memoryModel.trim() || settings.model;
  const memorySettings: AiSettings = { ...settings, model, temperature: appSettings.memoryTemperature };
  const modeInstruction =
    mode === 'diary' ? '重点整理成关系日记：记录发生了什么、氛围与值得记住的经历，不虚构用户感受。' :
    mode === 'facts' ? '重点整理成结构化事实：偏好、承诺、关系变化、持续事件、稳定人物信息，每条尽量一句话。' :
    mode === 'relationship' ? '重点整理关系状态：关键事件、关系变化、未完成约定。' :
    '混合提取稳定事实、关系变化、重要事件和少量值得保留的互动日记。';

  const systemPrompt = [
    '你是 Sane333 的长期记忆引擎，不是聊天角色。',
    '把聊天记录压缩成以后仍然有用的长期上下文。',
    modeInstruction,
    memoryStyleInstructions(currentMemory),
    '这是候选记忆生成，不是最终长期记忆写入。',
    '先判断信息是否值得未来继续影响角色对用户的理解；普通闲聊、寒暄、一次性废话、没有持续价值的内容必须忽略。',
    '只记录聊天中有证据支持的内容；禁止猜测、脑补或替用户决定感受。',
    '与已有记忆重复的内容要合并或跳过。',
    '输出严格 JSON，不要 Markdown。',
    JSON.stringify({ summary: '80-220 字长期摘要', items: [{ content: '一条长期记忆', kind: 'fact', importance: 80 }] }),
  ].join('\n');

  const userPrompt = [
    '【角色】' + characterName,
    '【模式】' + mode,
    '【已有长期摘要】' + (currentMemory.summary || '暂无'),
    '【已有重要记忆】',
    currentMemory.items.slice(0, 25).map(item => '- [' + (item.kind || 'fact') + '] ' + item.content).join('\n') || '暂无',
    '',
    '【最近聊天】',
    conversation || '暂无',
    '',
    '去重、合并、压缩，最多输出 12 条新记忆；重要度 0-100。',
  ].join('\n');

  const raw = await generateCreativeText({
    settings: memorySettings,
    systemPrompt,
    userPrompt,
    temperature: appSettings.memoryTemperature,
  });
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '');
  const parsed = JSON.parse(cleaned);

  return {
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : currentMemory.summary,
    items: Array.isArray(parsed?.items)
      ? parsed.items.filter((item: any) => item && typeof item.content === 'string' && item.content.trim()).map((item: any) => ({
          content: item.content.trim(),
          kind: ['fact','diary','relationship','preference','event'].includes(item.kind) ? item.kind : (mode === 'diary' ? 'diary' : mode === 'relationship' ? 'relationship' : 'fact'),
          importance: Math.max(0, Math.min(100, Number(item.importance) || 50)),
        })).slice(0, 12)
      : [],
  };
}
