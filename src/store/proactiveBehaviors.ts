/**
 * 角色主动行为：主动发消息 / 打电话 / 打视频 / 发照片
 * 由 runProactiveCatchup 每分钟调用，内部按 15 分钟节流
 */
import type { ImportedCharacter } from '../data/characterImport';
import { generateCreativeText, readStoredAiSettings } from '../ai/aiEngine';
import { appendLineMessage } from './lineRuntime';
import { getNpcs } from './npcs';
import { getLineRealitySettings } from './lineReality';

const LAST_CHECK_KEY = 'line:proactive-behaviors-last-check';
const LAST_TRIGGER_KEY = 'line:proactive-behaviors-last-trigger'; // { [charId]: timestamp }
const INCOMING_CALL_KEY = 'line:incoming-call';

export interface IncomingCall {
  characterId: string;
  characterName: string;
  avatar?: string;
  kind: 'voice' | 'video';
  conversationId: string;
  createdAt: number;
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

function saveLocal(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function readBool(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === 'true' || raw === '"true"';
  } catch {
    return false;
  }
}

/** 23:00-8:00 不打扰 */
function isQuietHours(): boolean {
  const h = new Date().getHours();
  return h >= 23 || h < 8;
}

interface ActivePerson {
  id: string;
  name: string;
  avatar?: string;
  personality: string;
  conversationId: string;
  isNpc: boolean;
}

function listCandidates(): ActivePerson[] {
  const out: ActivePerson[] = [];
  try {
    const chars = readLocal<ImportedCharacter[]>('phone:characters', []);
    for (const ch of chars) {
      if (!ch.name?.trim()) continue;
      out.push({
        id: ch.id || ch.name,
        name: ch.name,
        avatar: ch.avatar,
        personality: [ch.personality, ch.description].filter(Boolean).join(' ').slice(0, 200),
        conversationId: ch.id || ch.name,
        isNpc: false,
      });
    }
  } catch { /* ignore */ }
  try {
    for (const npc of getNpcs()) {
      if (!npc.name?.trim()) continue;
      out.push({
        id: npc.id,
        name: npc.name,
        avatar: (npc as unknown as { avatar?: string }).avatar,
        personality: [npc.personality, npc.identity].filter(Boolean).join(' ').slice(0, 200),
        conversationId: npc.id,
        isNpc: true,
      });
    }
  } catch { /* ignore */ }
  return out;
}

async function generateProactiveText(person: ActivePerson): Promise<string> {
  const settings = readStoredAiSettings();
  const now = new Date();
  const hour = now.getHours();
  const timeDesc = hour < 6 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 22 ? '晚上' : '深夜';
  const text = await generateCreativeText({
    settings,
    systemPrompt: `你是${person.name}。${person.personality ? '人设：' + person.personality : ''}现在是${timeDesc}，你突然想给朋友发条 LINE 消息。只输出消息内容，一句话，自然口语，不要带名字前缀。`,
    userPrompt: '发一条你此刻想发的消息：',
  });
  return text.trim().slice(0, 200);
}

function pushMessage(conversationId: string, person: ActivePerson, text: string, extra?: Record<string, unknown>) {
  const msg = {
    id: 'proactive-' + Date.now().toString(36),
    sender: 'other' as const,
    senderName: person.name,
    text,
    time: '刚刚',
    type: 'text' as const,
    ...extra,
  };
  appendLineMessage(conversationId, msg as never);
  // 通知 UI 刷新
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sane333:proactive-message', { detail: { conversationId } }));
  }
}

/** 主入口：每分钟被调用，内部 15 分钟节流 */
export async function checkProactiveBehaviors() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const lastCheck = readLocal<number>(LAST_CHECK_KEY, 0);
  if (now - lastCheck < 15 * 60 * 1000) return;
  saveLocal(LAST_CHECK_KEY, now);

  if (isQuietHours()) return;

  const msgOn = readBool('line:proactive-message');
  const voiceOn = readBool('line:proactive-voice-call');
  const videoOn = readBool('line:proactive-video-call');
  const photoOn = readBool('line:proactive-photo');
  if (!msgOn && !voiceOn && !videoOn && !photoOn) return;

  const candidates = listCandidates();
  if (!candidates.length) return;

  const lastTrigger = readLocal<Record<string, number>>(LAST_TRIGGER_KEY, {});
  const eligible = candidates.filter(c => {
    const last = lastTrigger[c.id] || 0;
    return now - last > 2 * 60 * 60 * 1000;
  });
  if (!eligible.length) return;

  // 随机挑一个角色，30% 概率触发（避免太频繁）
  if (Math.random() > 0.3) return;
  const person = eligible[Math.floor(Math.random() * eligible.length)];

  // 按开的开关随机选一种行为
  const behaviors: string[] = [];
  if (msgOn) behaviors.push('message', 'message'); // 消息权重更高
  if (voiceOn) behaviors.push('voice-call');
  if (videoOn) behaviors.push('video-call');
  if (photoOn) behaviors.push('photo');
  if (!behaviors.length) return;
  const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];

  lastTrigger[person.id] = now;
  saveLocal(LAST_TRIGGER_KEY, lastTrigger);

  try {
    if (behavior === 'message') {
      const text = await generateProactiveText(person);
      if (text) pushMessage(person.conversationId, person, text);
    } else if (behavior === 'voice-call' || behavior === 'video-call') {
      const call: IncomingCall = {
        characterId: person.id,
        characterName: person.name,
        avatar: person.avatar,
        kind: behavior === 'voice-call' ? 'voice' : 'video',
        conversationId: person.conversationId,
        createdAt: now,
      };
      saveLocal(INCOMING_CALL_KEY, call);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sane333:incoming-call', { detail: call }));
      }
      // 30 秒无人接听 → 自动挂断 + 发消息
      setTimeout(() => {
        const pending = readLocal<IncomingCall | null>(INCOMING_CALL_KEY, null);
        if (pending && pending.characterId === person.id && pending.createdAt === now) {
          saveLocal(INCOMING_CALL_KEY, null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sane333:incoming-call', { detail: null }));
          }
          pushMessage(person.conversationId, person, '怎么不接电话呀？');
        }
      }, 30_000);
    } else if (behavior === 'photo') {
      // 照片走 AI 生图（需要开生图开关且有预设）
      if (!readBool('line:ai-image-enabled')) return;
      const presets = readLocal<Array<{ id: string; name: string; positive: string; negative: string; useReference: boolean }>>('line:image-presets', []);
      const preset = presets[0];
      if (!preset) return;
      const { generateImage, resolveImageToDataUrl } = await import('../ai/imageGen');
      const aiSettings = readStoredAiSettings();
      let refB64: string | undefined;
      if (preset.useReference) {
        refB64 = await resolveImageToDataUrl(person.avatar);
      }
      // 让 AI 描述此刻在干嘛
      const doing = await generateCreativeText({
        settings: aiSettings,
        systemPrompt: `你是${person.name}。用一句话描述你此刻在做什么、穿什么、在哪里。只输出描述。`,
        userPrompt: '你现在在干嘛？',
      });
      const result = await generateImage(
        `casual selfie photo: ${doing.trim().slice(0, 150)}`,
        preset,
        {
          apiKey: (aiSettings as { apiKey?: string }).apiKey || '',
          baseUrl: (aiSettings as { apiBaseUrl?: string }).apiBaseUrl || 'https://api.openai.com',
          model: 'gpt-image-1',
        },
        refB64
      );
      if (result.ok && result.imageBase64) {
        pushMessage(person.conversationId, person, '看！我现在在干嘛 📸', {
          type: 'real-media',
          imageData: `data:image/png;base64,${result.imageBase64}`,
        });
      }
    }
  } catch {
    // best-effort
  }
}

export function getIncomingCall(): IncomingCall | null {
  return readLocal<IncomingCall | null>(INCOMING_CALL_KEY, null);
}

export function clearIncomingCall() {
  saveLocal(INCOMING_CALL_KEY, null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sane333:incoming-call', { detail: null }));
  }
}

export function dismissIncomingCallWithMessage() {
  const call = getIncomingCall();
  clearIncomingCall();
  if (call) {
    pushMessage(call.conversationId, { id: call.characterId, name: call.characterName, personality: '', conversationId: call.conversationId, isNpc: false }, '怎么不接电话呀？');
  }
}
