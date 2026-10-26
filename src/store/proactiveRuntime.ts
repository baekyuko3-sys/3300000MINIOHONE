import type { ImportedCharacter } from '../data/characterImport';
import type { OfflineEvent, ProjectManifest, WorldBook } from '../types';
import { getCharacterProfile } from '../data/characterProfiles';
import { getCharacterMemory } from './characterMemory';
import { getProjectManifest } from './projectManifest';
import { readAppSettings } from './appSettings';
import { generateCreativeText, readStoredAiSettings } from '../ai/aiEngine';
import { emitWorldEvent, setCharacterRuntime, syncWorldCharacters, readSchedulesForCharacter } from './worldRuntime';
import { appendLineMessage, getLineConversationMessages, saveLineConversationMessages } from './lineRuntime';
import { upsertOfflineEvent } from './offlineEvents';
import {
  buildOfflineInviteChatMessage,
  normalizeOfflineInviteFields,
  offlineInviteSystemPrompt,
  offlineInviteUserPromptTail,
  parseOfflineInviteJson,
  type OfflineInviteFields,
} from './offlineInviteCard';
import { buildLineHumanBehaviorPrompt, getLineRealitySettings, getCurrentLineTimeContext } from './lineReality';
import {
  listPostableNpcs,
  readMomentsSettings,
  spawnBatchCommentsForPost,
  tryAutonomousMomentComment,
} from './momentsComments';
import { generateNpcMomentNow } from './momentsAfterChat';
import { getNpcs } from './npcs';
import { hasNpcFriendship } from './npcSocial';
import { buildNpcRuntimeContext } from './npcContext';
import { collectScopedWorldBooks } from './worldbookRuntime';

interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  kind?: 'message' | 'moment' | 'offline-invite';
  location?: string;
  theme?: string;
  conversationId?: string;
}

interface ProactiveState {
  delivered: Record<string, string>;
  lastSentAt?: Record<string, string>;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage limits; chat itself remains usable.
  }
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function getProactivePersona() {
  const personas = readLocal<any[]>('line:user-personas', []);
  const activeId = readLocal<string | null>('line:active-persona', null);
  return personas.find(item => item.id === activeId)
    || personas.find(item => item.isDefault)
    || personas[0]
    || null;
}

function resolveProactiveConversation(character: ImportedCharacter, personaId?: string | null) {
  try {
    const rawChats = window.localStorage.getItem('line:chat-items');
    const chats = rawChats ? JSON.parse(rawChats) : [];
    if (!Array.isArray(chats)) return { conversationId: '', ambiguous: true };
    const matches = chats.filter((chat: any) =>
      Boolean(character.id) &&
      chat && !chat.isGroup && !chat.npcId &&
      String(chat.characterId || '') === String(character.id) &&
      (personaId
        ? String(chat.personaId || '') === String(personaId)
        : !chat.personaId)
    );
    return matches.length === 1 && matches[0].id
      ? { conversationId: String(matches[0].id), ambiguous: false }
      : { conversationId: '', ambiguous: true };
  } catch {
    return { conversationId: '', ambiguous: true };
  }
}

function resolveProactiveTarget(character: ImportedCharacter, schedule: ScheduleItem) {
  const chats = readLocal<any[]>('line:chat-items', []);
  if (schedule.conversationId) {
    const match = Array.isArray(chats) ? chats.find(chat =>
      chat && String(chat.id || '') === String(schedule.conversationId) &&
      !chat.isGroup && !chat.npcId &&
      String(chat.characterId || '') === String(character.id || '')
    ) : null;
    if (!match) return { conversationId: '', personaId: undefined as string | undefined, ambiguous: true };
    return {
      conversationId: String(match.id),
      personaId: match.personaId ? String(match.personaId) : undefined,
      ambiguous: false,
    };
  }
  const persona = getProactivePersona();
  const personaId = persona?.id ? String(persona.id) : undefined;
  return { ...resolveProactiveConversation(character, personaId), personaId };
}

function appendProactiveMessage(character: ImportedCharacter, text: string, schedule: ScheduleItem) {
  // Explicit schedule conversation wins over the currently selected persona.
  const target = resolveProactiveTarget(character, schedule);
  const personaId = target.personaId;
  const conversationId = target.conversationId;
  const ambiguousConversation = target.ambiguous;
  const messageId = `proactive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Never copy a legacy shared transcript into this persona-scoped conversation.

  if (conversationId) {
    appendLineMessage(conversationId, {
      id: messageId,
      sender: 'other',
      text,
      kind: 'text',
      createdAt: new Date().toISOString(),
      status: 'delivered',
      metadata: { proactive: true },
    });
  }
  emitWorldEvent('character.message', {
    characterId: character.id,
    characterName: character.name,
    data: { preview: text.replace(/\s+/g, ' ').slice(0, 120), source: 'proactive' },
  });
  setCharacterRuntime(character.id, {
    activity: '刚刚主动联系了你',
    mood: '想起了你',
    lastInteractionAt: new Date().toISOString(),
  }, character.name);

  window.dispatchEvent(new CustomEvent('sane333:proactive-message', {
    detail: {
      id: messageId,
      character: { id: character.id, name: character.name },
      characterName: character.name,
      ...(conversationId ? { conversationId } : {}),
      ...(personaId ? { personaId } : {}),
      text,
      persisted: Boolean(conversationId),
      ...(ambiguousConversation ? { ambiguousConversation: true } : {}),
      kind: 'text',
      createdAt: new Date().toISOString(),
      reason: 'scheduled-proactive',
    },
  }));
}

async function generateLifeText(
  character: ImportedCharacter,
  schedule: ScheduleItem,
  mode: 'moment',
): Promise<string> {
  const settings = readStoredAiSettings();
  if (!settings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');
  const profile = getCharacterProfile(character.name, character.id);
  const target = resolveProactiveTarget(character, schedule);
  const personaId = target.personaId;
  const memory = getCharacterMemory(character.id, character.name, personaId);
  const recentMessages = target.conversationId ? getLineConversationMessages(target.conversationId).slice(-10) : [];
  return generateCreativeText({
    settings,
    systemPrompt: [
      '你是 Sane333 的角色生活引擎。',
      '角色：' + character.name,
      character.description || '', character.personality || '', character.scenario || '',
      '关系：' + profile.relationship + '；称呼：' + profile.callMe,
      '长期记忆：' + (memory.summary || '暂无') ,
      '最近聊天：\n' + recentMessages.map(m => (m.sender === 'other' ? character.name : '我') + ': ' + (m.text || '[媒体]')).join('\n'),
      '朋友圈动态必须是角色自己的生活，不要伪装成聊天消息。',
    ].join('\n'),
    userPrompt: '请写一条角色自己的朋友圈动态。像真实生活记录，不要向用户提问，不要替用户说话，不要解释这是 AI。可以是照片感、正在做的事、看到的东西或一句自然的话。控制在手机朋友圈适合的长度。绝对不要输出【朋友圈配图：...】之类的括号说明，直接写动态内容。\n日程：' + schedule.time + ' · ' + schedule.title,
    temperature: settings.temperature ?? 0.85,
  });
}

/** 角色亲自填写完整小票字段（theme/preview/letter/time/location） */
async function generateOfflineInviteFields(
  character: ImportedCharacter,
  schedule: ScheduleItem,
): Promise<OfflineInviteFields> {
  const settings = readStoredAiSettings();
  if (!settings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');
  const profile = getCharacterProfile(character.name, character.id);
  const target = resolveProactiveTarget(character, schedule);
  const personaId = target.personaId;
  const memory = getCharacterMemory(character.id, character.name, personaId);
  const recentMessages = target.conversationId ? getLineConversationMessages(target.conversationId).slice(-12) : [];
  const raw = await generateCreativeText({
    settings,
    systemPrompt: offlineInviteSystemPrompt(character.name),
    userPrompt: [
      '【角色】' + character.name,
      '【性格】' + (character.personality || ''),
      '【设定】' + (character.scenario || ''),
      '【关系】' + profile.relationship + '；称呼：' + profile.callMe,
      '【长期记忆】' + (memory.summary || '暂无'),
      '【最近聊天】\n' + recentMessages.map(m => (m.sender === 'other' ? character.name : '我') + ': ' + (m.text || '[媒体]')).join('\n'),
      '【日程参考】' + schedule.time + ' · ' + (schedule.title || '') + (schedule.location ? ' · ' + schedule.location : '') + (schedule.theme ? ' · ' + schedule.theme : ''),
      '若日程已写地点/时间/主题，可吸收进字段，但仍要用角色自己的话说。',
      offlineInviteUserPromptTail(),
    ].join('\n\n'),
    temperature: settings.temperature ?? 0.85,
  });
  return normalizeOfflineInviteFields(parseOfflineInviteJson(raw), {
    theme: schedule.theme || schedule.title || '',
    time: schedule.time || '',
    location: schedule.location || '',
    letter: '',
    preview: '',
  });
}

async function generateProactiveMessage(
  character: ImportedCharacter,
  schedule: ScheduleItem,
): Promise<string> {
  const settings = readStoredAiSettings();
  const appSettings = readAppSettings();
  const proactiveModel = appSettings.proactiveModel.trim();
  const proactiveSettings = proactiveModel
    ? { ...settings, model: proactiveModel, temperature: appSettings.proactiveTemperature }
    : { ...settings, temperature: appSettings.proactiveTemperature };
  if (!proactiveSettings.apiKey.trim()) throw new Error('AI_NOT_CONFIGURED');

  const profile = getCharacterProfile(character.name, character.id);
  const persona = getProactivePersona();
  const personaId = persona?.id ? String(persona.id) : undefined;
  const memory = getCharacterMemory(character.id, character.name, personaId);
  const target = resolveProactiveConversation(character, personaId);
  const project = getProjectManifest();
  const worldbooks = collectScopedWorldBooks({
    books: readLocal<WorldBook[]>('phone:worldbooks', []),
    scope: 'online-chat',
    character,
  });
  const recentMessages = target.conversationId
    ? getLineConversationMessages(target.conversationId).slice(-12)
    : [];
  const lastInteraction = recentMessages.at(-1)?.createdAt ? Date.parse(recentMessages.at(-1)!.createdAt!) : 0;
  const offlineMinutes = lastInteraction ? Math.max(0, Math.floor((Date.now() - lastInteraction) / 60000)) : null;
  const offlineContext = offlineMinutes === null
    ? '这是你们第一次在当前聊天周期里联系。'
    : offlineMinutes >= 24 * 60
      ? '你们已经超过一天没有联系。可以自然提到这段时间里自己在做的事或现在的状态，但绝对不要责怪用户失联。'
      : offlineMinutes >= 180
        ? '你们已经几个小时没有联系。像一个有自己生活的人一样继续自己的节奏，不要假装一直在等用户。'
        : '你们刚刚还有联系。不要为了主动而重复上一轮话题。';

  const systemPrompt = [
    '你是 Sane333 的主动消息引擎。',
    '你正在代表一个真实存在于私人虚拟手机里的角色，在合适的日程节点主动给用户发一条消息。',
    '这不是系统通知，也不是说明书。只写角色真正会发给用户的聊天内容。',
    '不要替用户说话、不要猜测用户动作，不要写选择菜单。',
    '消息自然、具体、有生活感；不要为了“主动消息”强行煽情。',
    '',
    '【角色】',
    character.name,
    character.description || '',
    character.personality || '',
    character.scenario || '',
    character.systemPrompt || '',
    buildLineHumanBehaviorPrompt(character.languageProfile),
    character.languageProfile ? '【角色个人语言指纹】' + JSON.stringify(character.languageProfile) + '。以此角色自己的语言、标点、句长、口语、Emoji 与消息分组习惯为准。' : '',
    '',
    '【关系】',
    profile.relationship + '；称呼：' + profile.callMe,
    '',
    '【用户人设】',
    persona ? JSON.stringify(persona) : '未设置',
    '',
    '【长期记忆】',
    memory.summary || '暂无摘要',
    ...memory.items.slice(0, 10).map(item => '- ' + item.content),
    '',
    '【项目】',
    project.name + ' / ' + project.genre,
    project.tone,
    project.globalPrompt || '',
    '',
    '【世界书】',
    worldbooks.flatMap(book => book.enabled
      ? book.entries.filter(entry => entry.enabled).slice(0, 8).map(entry => '- ' + entry.name + ': ' + entry.content)
      : []).join('\n') || '无',
    '',
    '【最近聊天】',
    '【离线期间 / 当前联系状态】\n' + offlineContext,
    recentMessages.map(message => (message.sender === 'other' ? character.name : '用户') + ': ' + (message.text || '[媒体]')).join('\n'),
  ].join('\n');

  return generateCreativeText({
    settings: proactiveSettings,
    systemPrompt,
    userPrompt: [
      '现在触发角色主动消息。',
      '日程时间：' + schedule.time,
      '日程事件：' + schedule.title,
      '请结合角色自己的生活节奏、离线期间发生的事情、长期记忆、最近聊天与当前日程，发出一条自然的主动消息。',
      '主动联系必须有具体动机：刚发生的事、日程、想到某件旧事、分享生活、回复之前未完的话题等；不要只是因为计时器到了就机械问候。',
      '如果长时间没联系，不要说“你为什么不回”“怎么不理我”；角色可以自然地继续自己的生活，再分享现在发生的事。',
      '控制在适合手机聊天的长度，不要解释你为什么主动联系。',
    ].join('\n'),
    temperature: proactiveSettings.temperature ?? 0.85,
  });
}

async function runNpcPrivateProactive(today: string, state: ProactiveState) {
  const persona = getProactivePersona();
  const personaId = persona?.id ? String(persona.id) : '';
  if (!personaId || typeof window === 'undefined') return;
  state.delivered ||= {};

  const settings = readStoredAiSettings();
  if (!settings.apiKey.trim()) return;
  const chatsRaw = readLocal<any[]>('line:chat-items', []);
  const chats = Array.isArray(chatsRaw) ? chatsRaw : [];
  const npcs = getNpcs().filter(npc => npc.active && hasNpcFriendship(npc.id, personaId));

  for (const npc of npcs) {
    const checkKey = 'npc-private-check:' + personaId + ':' + npc.id;
    if (state.delivered[checkKey] === today) continue;

    // Keep autonomous private messages occasional and deterministic per day.
    // The check is recorded even when the daily roll does not select this NPC.
    const seedText = today + ':' + personaId + ':' + npc.id;
    const seed = Array.from(seedText).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
    state.delivered[checkKey] = today;
    // Persist the daily decision immediately; the rest of the scheduled runtime
    // may have no work today and therefore may not mark its own state dirty.
    saveLocal('phone:proactive-state', state);
    if (seed % 100 >= 18) continue;

    const matches = chats.filter(chat =>
      chat && !chat.isGroup &&
      String(chat.npcId || '') === String(npc.id) &&
      String(chat.personaId || '') === personaId
    );
    // A confirmed friendship can exist without a chat row in older data. Create
    // a persona-scoped row rather than falling back to the NPC's bound character.
    let chat = matches.length === 1 ? matches[0] : null;
    if (matches.length > 1) continue;
    if (!chat) {
      chat = {
        id: 'npc-chat-' + npc.id + '-' + personaId,
        name: npc.name,
        characterId: npc.boundCharacterId || undefined,
        npcId: npc.id,
        personaId,
        kind: 'npc',
        time: '刚刚',
        preview: '',
        unread: 0,
        isGroup: false,
      };
    }
    const chatId = String(chat.id);
    // Respect the existing LINE proactive-message permission at both the
    // conversation and NPC identity keys; neither can be bypassed by fallback.
    if (
      readLocal<boolean>('line:allow-role-message:' + chatId, true) === false ||
      readLocal<boolean>('line:allow-role-message:' + npc.id, true) === false
    ) continue;
    // Do not create a visible empty chat until the NPC has actually generated
    // a message. A NO_MESSAGE response or AI failure should leave the chat list unchanged.
    const history = getLineConversationMessages(chatId).slice(-12);
    const runtimeContext = buildNpcRuntimeContext(npc, 'online-chat', personaId);
    const userPrompt = [
      '你是 LINE 中的 NPC「' + npc.name + '」，现在可以主动给已经成为好友的用户发一条私聊。',
      '当前用户人设：' + String(persona.name || '用户'),
      '最近聊天：',
      history.map(message => (message.sender === 'other' ? npc.name : '用户') + ': ' + (message.text || '[媒体]')).join('\n') || '暂无聊天记录',
      '结合你自己的性格、背景、当前关系、个人记忆和最近聊天，自然决定是否真的有值得发送的内容。',
      '如果没有合适的动机，只输出精确文本：NO_MESSAGE。',
      '如果要发消息，只输出消息正文；不要写角色名、旁白、系统解释或用户的行为。',
    ].join('\n\n');
    try {
      const text = (await generateCreativeText({
        settings,
        systemPrompt: runtimeContext + '\n\n你正在进行自然的、低频的 LINE 主动私聊。不得替用户说话，不得把绑定角色当成自己。',
        userPrompt,
        temperature: settings.temperature ?? 0.8,
      })).trim();
      if (!text || text === 'NO_MESSAGE' || text.length > 1200) continue;

      const createdAt = new Date().toISOString();
      const messageId = 'npc-proactive-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      if (!matches.length) {
        // Persist the new chat only after generation succeeds, but before appending
        // so appendLineMessage can synchronize its preview and unread count by exact ID.
        const latestChats = readLocal<any[]>('line:chat-items', []);
        if (!latestChats.some(item => String(item?.id || '') === chatId)) {
          saveLocal('line:chat-items', [chat, ...latestChats]);
        }
      }
      appendLineMessage(chatId, {
        id: messageId,
        sender: 'other',
        text,
        kind: 'text',
        createdAt,
        status: 'delivered',
        metadata: { proactive: true, npcId: npc.id, personaId, reason: 'npc-autonomous-private-message' },
      });
      const updatedChats = readLocal<any[]>('line:chat-items', []);
      // appendLineMessage already updates the exact chat's unread count.
      // Only refresh preview/time here; incrementing unread again double-counts it.
      saveLocal('line:chat-items', updatedChats.map(item => item.id === chat.id
        ? { ...item, time: '刚刚', preview: text.slice(0, 100) }
        : item));
      window.dispatchEvent(new CustomEvent('sane333:proactive-message', {
        detail: {
          id: messageId,
          character: { id: npc.id, name: npc.name },
          npcId: npc.id,
          kind: 'npc',
          personaId,
          conversationId: chatId,
          text,
          persisted: true,
          reason: 'npc-autonomous-private-message',
          createdAt,
        },
      }));
      emitWorldEvent('character.message', {
        characterId: npc.id,
        characterName: npc.name,
        data: { preview: text.replace(/\s+/g, ' ').slice(0, 120), source: 'npc-proactive', activity: '刚刚主动联系了你', lastInteractionAt: createdAt },
      });
    } catch {
      // An NPC background failure must not interrupt LINE or other scheduled jobs.
    }
  }
}

let running = false;

export async function runProactiveCatchup() {
  if (typeof window === 'undefined' || running) return;
  // 角色主动行为（独立开关，不依赖 backgroundEnabled）
  try {
    const { checkProactiveBehaviors } = await import('./proactiveBehaviors');
    void checkProactiveBehaviors();
  } catch { /* best-effort */ }
  const settings = readAppSettings();
  if (!settings.backgroundEnabled || !settings.proactiveMessagesEnabled) return;

  const characters = readLocal<ImportedCharacter[]>('phone:characters', []);
  if (characters.length) syncWorldCharacters(characters);

  const now = new Date();
  const reality = getLineRealitySettings();
  const timeContext = getCurrentLineTimeContext();
  const zonedParts = new Intl.DateTimeFormat('en-US', { timeZone: reality.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const currentMinutes = Number(zonedParts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(zonedParts.find(part => part.type === 'minute')?.value || 0);
  const zonedDate = new Intl.DateTimeFormat('en-CA', { timeZone: reality.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const today = zonedDate;
  const cooldownMs = reality.proactiveCooldownMinutes * 60 * 1000;
  const state = readLocal<ProactiveState>('phone:proactive-state', { delivered: {}, lastSentAt: {} });
  state.lastSentAt ||= {};
  let dirty = false;

  running = true;
  try {
    // Run the NPC pipeline independently before legacy character schedules,
    // so one broken imported-character schedule cannot suppress NPC messages.
    try { await runNpcPrivateProactive(today, state); } catch { /* best-effort background work */ }

    for (const character of characters) {
      // 日程可能存在角色名 key / 角色 id key / 会话 id key 三种命名空间下
      //（聊天设置页写入的是会话级 key），统一读取避免日程静默失效。
      const schedule: ScheduleItem[] = readSchedulesForCharacter(character);
      if (!schedule.length) continue;

      const due = schedule
        .map(item => ({ item, minute: parseClock(item.time) }))
        .filter((entry): entry is { item: ScheduleItem; minute: number } => entry.minute !== null && entry.minute <= currentMinutes)
        .sort((a, b) => b.minute - a.minute);

      if (!due.length) continue;

      const candidate = due[0];
      const deliveryKey = today + ':' + character.id + ':' + candidate.item.id;
      if (state.delivered[character.id] === deliveryKey) continue;
      const lastSent = state.lastSentAt?.[character.id] ? Date.parse(state.lastSentAt[character.id]!) : 0;
      if (lastSent && now.getTime() - lastSent < cooldownMs) continue;

      const kind = candidate.item.kind || 'message';
      // Settings are stored per conversation. Older schedules may lack a
      // conversationId, and imported contacts can have both ID- and name-based
      // legacy keys. Honor any explicit opt-out across these equivalent keys
      // so a stale/missing schedule ID can never bypass a disabled permission.
      const permissionIds = [...new Set([
        candidate.item.conversationId,
        character.id,
        character.name,
      ].filter((value): value is string => Boolean(value && value.trim())))];
      const behaviorAllowed = (type: 'message' | 'moment' | 'offline') => {
        const key = type === 'message' ? 'line:allow-role-message:' : type === 'moment' ? 'line:allow-role-moments:' : 'line:allow-offline-invite:';
        return permissionIds.every(id => readLocal<boolean>(key + id, true));
      };
      let notificationBody = '';
      if (kind === 'moment') {
        if (!behaviorAllowed('moment')) {
          state.delivered[character.id] = deliveryKey;
          dirty = true;
          continue;
        }
        const momentsCfg = readMomentsSettings();
        if (!momentsCfg.allowCharacterAutoPost) {
          state.delivered[character.id] = deliveryKey;
          dirty = true;
          continue;
        }
        const text = await generateLifeText(character, candidate.item, 'moment');
        if (!text.trim()) continue;
        const rawPosts = window.localStorage.getItem('line:moments-posts');
        let posts: any[] = [];
        try { posts = rawPosts ? JSON.parse(rawPosts) : []; } catch { posts = []; }
        const newPost = {
          id: 'moment-proactive-' + Date.now().toString(36),
          name: character.name,
          text: text.trim(),
          time: '刚刚',
          tag: '#日常',
          liked: false,
          likes: 0,
          likers: [],
          commentsList: [] as any[],
          characterId: character.id,
          source: 'proactive-life',
        };
        try {
          const meName =
            (JSON.parse(window.localStorage.getItem('line:current-user') || '{}') as { name?: string }).name || '我';
          const { comments } = await spawnBatchCommentsForPost({ post: newPost, meName, settings: momentsCfg });
          if (comments.length) newPost.commentsList = comments;
        } catch {
          // batch comments after proactive post are best-effort
        }
        posts.unshift(newPost);
        window.localStorage.setItem('line:moments-posts', JSON.stringify(posts.slice(0, 200)));
        window.dispatchEvent(new CustomEvent('sane333:moments-updated', { detail: { characterId: character.id, characterName: character.name } }));
        emitWorldEvent('character.moment', { characterId: character.id, characterName: character.name, data: { preview: text.trim().slice(0, 120) } });
        setCharacterRuntime(character.id, { activity: '刚刚更新了朋友圈', mood: '有自己的生活', lastInteractionAt: new Date().toISOString() }, character.name);
        if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(character.name + ' · VROOM', { body: text.trim().slice(0, 180), tag: 'sane333-moment-' + character.id });
        }
        notificationBody = text.trim();
      } else if (kind === 'offline-invite') {
        if (!behaviorAllowed('offline')) {
          state.delivered[character.id] = deliveryKey;
          dirty = true;
          continue;
        }
        const fields = await generateOfflineInviteFields(character, candidate.item);
        const inviteTarget = resolveProactiveTarget(character, candidate.item);
        const invitePersonaId = inviteTarget.personaId;
        const event: OfflineEvent = {
          id: 'offline-proactive-' + Date.now().toString(36),
          characterId: character.id,
          characterName: character.name,
          ...(invitePersonaId ? { personaId: invitePersonaId } : {}),
          ...(inviteTarget.conversationId ? { conversationId: inviteTarget.conversationId } : {}),
          title: fields.theme,
          location: fields.location,
          time: fields.time,
          theme: fields.theme,
          letter: fields.letter,
          openingGreeting: fields.preview,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        upsertOfflineEvent(event);
        const card = buildOfflineInviteChatMessage({
          id: 'offline-invite-' + event.id,
          from: 'other',
          characterName: character.name,
          fields,
        });
        if (inviteTarget.conversationId) appendLineMessage(inviteTarget.conversationId, {
          ...card,
          createdAt: event.createdAt,
          status: 'delivered',
          metadata: {
            ...card.metadata,
            offlineEventId: event.id,
            ...(invitePersonaId ? { personaId: invitePersonaId } : {}),
          },
        });
        emitWorldEvent('offline.invite', { characterId: character.id, characterName: character.name, data: { eventId: event.id, ...(event as unknown as Record<string, unknown>) } });
        notificationBody = '💌 ' + fields.theme;
      } else {
        if (!behaviorAllowed('message')) {
          state.delivered[character.id] = deliveryKey;
          dirty = true;
          continue;
        }
        const message = await generateProactiveMessage(character, candidate.item);
        if (!message.trim()) continue;
        appendProactiveMessage(character, message.trim(), candidate.item);
        notificationBody = message.trim();
      }
      state.delivered[character.id] = deliveryKey;
      state.lastSentAt![character.id] = now.toISOString();
      dirty = true;

      if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(character.name, {
          body: notificationBody.slice(0, 180),
          tag: 'sane333-proactive-' + character.id,
        });
      }
    }
    // NPC 偶尔自主发一条朋友圈（每天最多一条，不依赖角色日程）
    try {
      const momentsCfg = readMomentsSettings();
      const npcs = listPostableNpcs(momentsCfg);
      const npcDayKey = 'npc-vroom:' + today;
      if (
        npcs.length
        && momentsCfg.allowNpcAutoPost !== false
        && state.delivered['__npc_moment__'] !== npcDayKey
        && Math.random() < 0.4
      ) {
        const npc = npcs[Math.floor(Math.random() * npcs.length)];
        const msg = await generateNpcMomentNow(npc.id);
        if (msg.startsWith('生成成功')) {
          state.delivered['__npc_moment__'] = npcDayKey;
          dirty = true;
          if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(npc.name + ' · VROOM', { body: '发了一条朋友圈', tag: 'sane333-npc-moment-' + npc.id });
          }
        }
      }
    } catch {
      // NPC proactive moments are best-effort
    }

    // Autonomous moment comments (independent of schedule / auto-post)
    try {
      await tryAutonomousMomentComment();
    } catch {
      // never break phone runtime
    }
  } catch {
    // Proactive messages must never break the phone runtime.
  } finally {
    running = false;
    if (dirty) saveLocal('phone:proactive-state', state);
  }
}
