export type ThemeMode = 'dark-luxury' | 'nordic-light' | 'ocean-breeze';

export type ScreenType = 
  | 'lock'
  | 'home'
  | 'inbox'
  | 'chat'
  | 'character-profile'
  | 'moments'
  | 'gallery'
  | 'music'
  | 'notes'
  | 'calendar'
  | 'npc'
  | 'group-presets'
  | 'world-book'
  | 'threads'
  | 'spy-phone'
  | 'settings'
  | 'offline-story'
  | 'project-studio'
  | 'memory'
  | 'appearance';

export interface CharacterGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterInfo {
  id: string;
  name: string;
  avatar: string;
  heroImage: string;
  status: string;
  age: number;
  height: string;
  constellation: string;
  location: string;
  bio: string;
  quote: string;
  recentMoments: string[];
  unreadCount?: number;
}

export type CharacterLanguage = 'zh-CN' | 'zh-TW' | 'yue' | 'en' | 'ja' | 'ko' | 'fr' | 'es' | 'de' | 'other';
export type BilingualMode = 'off' | 'auto';
export type BilingualLayout = 'inside-bubble' | 'below-bubble';
export type CharacterPunctuationStyle = 'natural' | 'spaces' | 'tight' | 'mixed';
export interface CharacterLanguageProfile {
  language: CharacterLanguage;
  bilingualMode: BilingualMode;
  bilingualLayout: BilingualLayout;
  bilingualTranslationDirection: 'original-first' | 'translation-first';
  punctuationStyle: CharacterPunctuationStyle;
  sentenceLength: 'short' | 'natural' | 'long' | 'mixed';
  lineBreakStyle: 'natural' | 'every-sentence' | 'compact' | 'mixed';
  colloquialLevel: 'formal' | 'natural' | 'casual' | 'very-casual';
  fillerWords: string[];
  emojiStyle: 'none' | 'light' | 'frequent' | 'mixed';
  capitalizationStyle: 'standard' | 'lowercase' | 'mixed';
  numberStyle: 'standard' | 'digits' | 'words' | 'mixed';
  preferredSpaces: boolean;
  messageGrouping?: 'single' | 'double' | 'natural';
  examples?: string[];
}

export interface CharacterProfile {
  nickname: string;
  birthday: string;
  relationship: string;
  /** 角色是否可以依据角色卡、聊天、记忆与世界书自主判断，而非被固定关系数值牵着走 */
  canCharacterSelfJudge?: boolean;
  /** 兼容旧版本保存的数据；新 UI 不再把它当作关系数值开关 */
  canAutoChangeRelation?: boolean;
  canBlockUser?: boolean;
  isBlockedByCharacter?: boolean;
  callMe: string;
  selectedLorebook: string;
  bio?: string;
  onlinePersona?: string;
  typingHabit?: string;
}

export interface WorldBookEntry {
  id: string;
  name: string;
  keywords: string[];
  content: string;
  enabled: boolean;
  priority: number;
  weight: number;
  insertion: 'before' | 'after' | 'depth';
  depth: number;
  secondaryKeywords?: string[];
  selective?: boolean;
  selectiveLogic?: 0 | 1 | 2 | 3;
  constant?: boolean;
  useProbability?: boolean;
  probability?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  order?: number;
  role?: 'system' | 'user' | 'assistant';
  outletName?: string;
  group?: string;
  groupWeight?: number;
  preventRecursion?: boolean;
  excludeRecursion?: boolean;
}

export interface WorldBook {
  id: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  entries: WorldBookEntry[];
  enabled: boolean;
  updatedAt: string;
  sourceCharacterId?: string;
  sourceCharacterName?: string;
  sourceType?: 'character-card' | 'manual' | 'imported';
  globalScopes?: Array<'online-chat' | 'offline-story'>;
}

export interface OfflineEvent {
  id: string;
  characterId: string;
  characterName: string;
  title: string;
  location: string;
  time: string;
  theme: string;
  letter: string;
  openingGreeting?: string;
  status: 'draft' | 'pending' | 'accepted' | 'declined' | 'in-progress' | 'completed';
  createdAt: string;
  updatedAt?: string;
  sceneIntro?: string;
  sceneLog?: Array<{ id: string; speaker: 'role' | 'me' | 'narrator'; text: string; createdAt: string }>;
  /** SillyTavern-style offline session controls. Kept optional for backwards compatibility. */
  personaId?: string;
  worldBookIds?: string[];
  cotPresetId?: string;
  authorNote?: string;
  systemPrompt?: string;
  branchId?: string;
  parentBranchId?: string;
  branchName?: string;
}

export interface WidgetConfig {
  weatherCity: string;
  weatherTemp: string;
  weatherCondition: string;
  weatherHighLow: string;
  quoteContent: string;
  quoteAuthor: string;
  musicTitle: string;
  musicArtist: string;
  anniversaryDays: number;
  anniversaryText: string;
}


export interface ProjectManifest {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  genre: string;
  language: string;
  tone: string;
  globalPrompt: string;
  activeCharacterId: string | null;
  activeWorldBookId: string | null;
  createdAt: string;
  updatedAt: string;
}
