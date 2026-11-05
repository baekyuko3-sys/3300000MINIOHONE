import { reportPersistenceIssue } from './usePersistentState';

export type ChatProvider = 'gemini' | 'openai-compatible' | 'custom';

export interface ChannelAiSettings {
  enabled: boolean;
  provider: ChatProvider;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  streaming: boolean;
  contextLength: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  seed: number | null;
}

export const DEFAULT_CHANNEL_AI_SETTINGS: ChannelAiSettings = {
  enabled: false,
  provider: 'openai-compatible',
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  streaming: true,
  contextLength: 24,
  maxOutputTokens: 1200,
  temperature: 0.85,
  topP: 0.95,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: null,
};

export interface AppSettings {
  provider: ChatProvider;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  streaming: boolean;
  contextLength: number;
  maxOutputTokens: number;
  autoSave: boolean;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  seed: number | null;
  memoryEnabled: boolean;
  memoryMode: 'hybrid' | 'diary' | 'facts' | 'relationship';
  memoryModel: string;
  memoryDiaryModel: string;
  memoryFactsModel: string;
  memoryRelationshipModel: string;
  memoryTemperature: number;
  proactiveModel: string;
  chatApiOverride: ChannelAiSettings;
  momentsApiOverride: ChannelAiSettings;
  proactiveTemperature: number;
  memoryContextMessages: number;

  voiceEnabled: boolean;
  voiceProvider: 'browser' | 'openai-compatible' | 'custom';
  voiceBaseUrl: string;
  voiceApiKey: string;
  voiceModel: string;
  voiceName: string;
  voiceFormat: 'mp3' | 'wav' | 'ogg';
  autoSpeakAiReplies: boolean;

  sttEnabled: boolean;
  sttProvider: 'browser' | 'openai-compatible' | 'custom';
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
  sttLanguage: string;

  imageEnabled: boolean;
  imageProvider: 'openai-compatible' | 'custom';
  imageBaseUrl: string;
  imageApiKey: string;
  imageModel: string;
  imageSize: string;

  backgroundEnabled: boolean;
  notificationEnabled: boolean;
  proactiveMessagesEnabled: boolean;
  keepAliveMinutes: number;

  soundEnabled: boolean;
  soundVolume: number;
  messageSoundUrl: string;
  messageSoundRef: string;
  momentsSoundUrl: string;
  momentsSoundRef: string;
  callRingtoneUrl: string;
  callRingtoneRef: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  provider: 'gemini',
  apiBaseUrl: '',
  apiKey: '',
  model: 'gemini-2.5-flash',
  streaming: true,
  contextLength: 24,
  maxOutputTokens: 1200,
  autoSave: true,
  temperature: 0.85,
  topP: 0.95,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: null,
  memoryEnabled: true,
  memoryMode: 'hybrid',
  memoryModel: 'gemini-2.5-flash',
  memoryDiaryModel: '',
  memoryFactsModel: '',
  memoryRelationshipModel: '',
  memoryTemperature: 0.2,
  proactiveModel: '',
  chatApiOverride: { ...DEFAULT_CHANNEL_AI_SETTINGS },
  momentsApiOverride: { ...DEFAULT_CHANNEL_AI_SETTINGS },
  proactiveTemperature: 0.85,
  memoryContextMessages: 40,

  voiceEnabled: false,
  voiceProvider: 'browser',
  voiceBaseUrl: '',
  voiceApiKey: '',
  voiceModel: 'gpt-4o-mini-tts',
  voiceName: 'alloy',
  voiceFormat: 'mp3',
  autoSpeakAiReplies: false,

  sttEnabled: false,
  sttProvider: 'openai-compatible',
  sttBaseUrl: '',
  sttApiKey: '',
  sttModel: 'gpt-4o-mini-transcribe',
  sttLanguage: 'zh',

  imageEnabled: false,
  imageProvider: 'openai-compatible',
  imageBaseUrl: '',
  imageApiKey: '',
  imageModel: 'gpt-image-1',
  imageSize: '1024x1024',

  backgroundEnabled: true,
  notificationEnabled: false,
  proactiveMessagesEnabled: true,
  keepAliveMinutes: 5,

  soundEnabled: true,
  soundVolume: 0.65,
  messageSoundUrl: '',
  messageSoundRef: '',
  momentsSoundUrl: '',
  momentsSoundRef: '',
  callRingtoneUrl: '',
  callRingtoneRef: '',
};

const STORAGE_KEY = 'phone:settings';
let appSettingsWriteBlocked = false;

export function readAppSettings(): AppSettings {
  appSettingsWriteBlocked = false;
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('APP_SETTINGS_SCHEMA_INVALID');
    return { ...DEFAULT_APP_SETTINGS, ...parsed };
  } catch (error) {
    appSettingsWriteBlocked = true;
    reportPersistenceIssue('read:' + STORAGE_KEY, 'AI 与应用设置损坏或格式不符；已锁定写入以保留原始配置', error);
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readAppSettings();
  const next = { ...current, ...patch };
  if (typeof window !== 'undefined') {
    if (appSettingsWriteBlocked) return current;
    try {
      const serialized = JSON.stringify(next);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      if (window.localStorage.getItem(STORAGE_KEY) !== serialized) throw new Error('APP_SETTINGS_WRITE_VERIFY_FAILED');
      window.dispatchEvent(new CustomEvent('sane333:settings-changed'));
      return next;
    } catch (error) {
      reportPersistenceIssue('write:' + STORAGE_KEY, 'AI 与应用设置写入失败；原始配置已保留', error);
      return current;
    }
  }
  return next;
}
