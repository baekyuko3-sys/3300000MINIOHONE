import type { ImportedCharacter } from '../data/characterImport';
import type { OfflineEvent, ProjectManifest, WorldBook } from '../types';
import { getCharacterProfile } from '../data/characterProfiles';
import { getCharacterMemory } from './characterMemory';
import { getProjectManifest } from './projectManifest';
import { readAppSettings } from './appSettings';
import { generateCreativeText, readStoredAiSettings } from '../ai/aiEngine';
import { emitWorldEvent, setCharacterRuntime, syncWorldCharacters } from './worldRuntime';
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

function appendProactiveMessage(character: ImportedCharacter, text: string) {
  // The open LINE transcript is keyed by the chat item's ID, not necessarily
  // the imported character ID. Use that ID when there is exactly one matching
  // ordinary-character chat; never guess when multiple persona chats exist.
  const fallbackConversationId = character.id || character.name;
  let conversationId = fallbackConversationId;
  try {
    const rawChats = window.localStorage.getItem('line:chat-items');
    const chats = rawChats ? JSON.parse(rawChats) : [];
    if (Array.isArray(chats)) {
      const matches = chats.filter((chat: any) =>
        chat && !chat.isGroup && !chat.npcId &&
        String(chat.characterId || '') === String(character.id || '') &&
        (!character.id || String(chat.characterId || '') === String(character.id))
      );
      if (matches.length === 1 && matches[0].id) conversationId = String(matches[0].id);
    }
  } catch {
    // Keep the legacy key if the chat list cannot be read.
  }
  const legacyKey = `line:conversation:${character.name}`;
  const key = `line:conversation:${conversationId}`;
  const messageId = `proactive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // The runtime store is the single source of truth. If an older name-keyed
  // conversation exists, migrate it once before appending the new normalized message.
  if (conversationId !== character.name) {
    const legacyMessages = readLocal<any[]>(legacyKey, []);
    const currentMessages = getLineConversationMessages(conversationId);
    if (legacyMessages.length && !currentMessages.length) {
      saveLocal(key, legacyMessages);
    }
  }

  appendLineMessage(conversationId, {
    id: messageId,
    sender: 'other',
    text,
    kind: 'text',
    createdAt: new Date().toISOString(),
    status: 'delivered',
    metadata: { proactive: true },
  });
  emitWorldEvent('character.message', {
    characterId: character.id,
    characterName: character.name,
    data: { preview: text.replace(/\\s+/g, ' ').slice(0, 120), source: 'proactive' },
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
      conversationId,
      text,
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
  const memory = getCharacterMemory(character.id, character.name);
  const recentMessages = getLineConversationMessages(character.id || character.name).slice(-10);
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
    userPrompt: '请写一条角色自己的朋友圈动态。像真实生活记录，不要向用户提问，不要替用户说话，不要解释这是 AI。可以是照片感、正在做的事、看到的东西或一句自然的话。控制在手机朋友圈适合的长度。\n日程：' + schedule.time + ' · ' + schedule.title,
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
  const memory = getCharacterMemory(character.id, character.name);
  const recentMessages = getLineConversationMessages(character.id || character.name).slice(-12);
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
  const memory = getCharacterMemory(character.id, character.name);
  const project = getProjectManifest();
  const worldbooks = collectScopedWorldBooks({
    books: readLocal<WorldBook[]>('phone:worldbooks', []),
    scope: 'online-chat',
    character,
  });
  const personas = readLocal<any[]>('line:user-personas', []);
  const persona = personas.find(item => item.isDefault) || personas[0] || null;
  const recentMessages = getLineConversationMessages(character.id || character.name).slice(-12);
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

let running = false;

export async function runProactiveCatchup() {
  if (typeof window === 'undefined' || running) return;
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
    for (const character of characters) {
      const rawSchedule = window.localStorage.getItem(`line:schedule:${character.name}`);
      if (!rawSchedule) continue;

      let schedule: ScheduleItem[] = [];
      try { schedule = JSON.parse(rawSchedule); } catch { continue; }
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
        const event: OfflineEvent = {
          id: 'offline-proactive-' + Date.now().toString(36),
          characterId: character.id,
          characterName: character.name,
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
        appendLineMessage(character.id || character.name, {
          ...card,
          createdAt: event.createdAt,
          status: 'delivered',
          metadata: {
            ...card.metadata,
            offlineEventId: event.id,
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
        appendProactiveMessage(character, message.trim());
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
