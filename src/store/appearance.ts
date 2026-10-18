import type { ThemeMode, WidgetConfig } from '../types';

export interface SavedFont {
  id: string;
  name: string;
  source: 'upload' | 'url';
  value: string;
  createdAt: string;
}

export interface AppearanceScheme {
  id: string;
  name: string;
  themeMode: ThemeMode;
  appTitle: string;
  greeting: string;
  subtitle: string;
  wallpaper: string;
  globalBackground: string;
  customFont: string;
  customFontName: string;
  customFontUrl: string;
  customFontSize: number;
  appIcons: Record<string, string>;
  desktopLayouts: Record<'page1' | 'page2', Record<string, { x: number; y: number }>>;
  desktopHidden: Record<'page1' | 'page2', string[]>;
  widget: WidgetConfig;
  appBeauty: Record<string, {
    background?: string;
    accent: string;
    radius: number;
    fontScale: number;
  }>;
  /** 小手机顶部灵动岛；真机自带岛时可关掉，避免叠两层 */
  showDynamicIsland: boolean;
  /** 待机是否显示左侧圆点（默认关，更像真 iOS） */
  islandShowIdleDot: boolean;
  /** 待机文字；空 = 纯胶囊无字 */
  islandIdleLabel: string;
  /** 圆点颜色 */
  islandDotColor: string;
  /** 收起态皮肤：glass 白玻璃 / black 纯黑 */
  islandCollapsedStyle: 'glass' | 'black';
  /** 灵动岛专用字体名（CSS font-family）；空 = 跟手机字体 */
  islandFontFamily: string;
  /** 锁屏独立壁纸；空 = 跟主屏幕 */
  lockWallpaper: string;
  /** 锁屏时间格式风格：'ios-large' | 'classic' */
  lockStyle: 'ios-large' | 'classic';
  /** 解锁方式组合：可叠加，例如 ['swipe','passcode','fingerprint'] */
  lockMethods: Array<'swipe' | 'passcode' | 'fingerprint'>;
  /** 4-6 位数字密码（明文存本地，仅演示） */
  lockPasscode: string;
  /** 手机外形 */
  phoneShell: 'modern' | 'classic-round' | 'classic-square';
  /** 是否显示手机外框；关掉后只显示内容区 */
  showPhoneFrame: boolean;
  /** 是否显示顶部系统状态栏（时间/信号/电池） */
  showStatusBar: boolean;
  updatedAt: string;
}

const KEY = 'sane333:appearance';
const SCHEMES_KEY = 'sane333:appearance-schemes';
const FONTS_KEY = 'sane333:saved-fonts';

export const DEFAULT_APPEARANCE: AppearanceScheme = {
  id: 'default',
  name: 'Sane333 Default',
  themeMode: 'nordic-light',
  appTitle: 'Sane333',
  greeting: 'GOOD EVENING · PRIVATE DEVICE',
  subtitle: '这是你的私人设备。\n内容由你自己建立。',
  wallpaper: '',
  globalBackground: '#f7f4ee',
  customFont: '',
  customFontName: '',
  customFontUrl: '',
  customFontSize: 1,
  appIcons: {},
  desktopLayouts: { page1: {}, page2: {} },
  desktopHidden: { page1: [], page2: [] },
  appBeauty: {},
  showDynamicIsland: true,
  islandShowIdleDot: false,
  islandIdleLabel: '',
  islandDotColor: '#34d399',
  islandCollapsedStyle: 'glass',
  islandFontFamily: '',
  lockWallpaper: '',
  lockStyle: 'ios-large',
  lockMethods: ['swipe'],
  lockPasscode: '',
  phoneShell: 'modern',
  showPhoneFrame: true,
  showStatusBar: true,
  widget: {
    weatherCity: 'YOUR CITY',
    weatherTemp: '21°',
    weatherCondition: 'CLEAR',
    weatherHighLow: 'H 24° · L 16°',
    quoteContent: 'Make it yours.',
    quoteAuthor: 'Sane333',
    musicTitle: '暂无正在播放',
    musicArtist: 'MUSIC APP',
    anniversaryDays: 0,
    anniversaryText: 'PRIVATE MEMORY',
  },
  updatedAt: new Date(0).toISOString(),
};

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAppearance(value: Partial<AppearanceScheme>): AppearanceScheme {
  const widget = { ...DEFAULT_APPEARANCE.widget, ...(value.widget || {}) };
  return {
    ...DEFAULT_APPEARANCE,
    ...value,
    widget,
    id: String(value.id || DEFAULT_APPEARANCE.id),
    name: String(value.name || DEFAULT_APPEARANCE.name),
    appTitle: String(value.appTitle ?? DEFAULT_APPEARANCE.appTitle),
    greeting: String(value.greeting ?? DEFAULT_APPEARANCE.greeting),
    subtitle: String(value.subtitle ?? DEFAULT_APPEARANCE.subtitle),
    wallpaper: String(value.wallpaper ?? ''),
    globalBackground: String(value.globalBackground || '#f7f4ee'),
    customFont: String(value.customFont || ''),
    customFontName: String(value.customFontName || ''),
    customFontUrl: String(value.customFontUrl || ''),
    customFontSize: Number.isFinite(Number(value.customFontSize)) ? Math.max(.75, Math.min(1.5, Number(value.customFontSize))) : 1,
    appIcons: value.appIcons && typeof value.appIcons === 'object' ? Object.fromEntries(Object.entries(value.appIcons).map(([key, icon]) => [String(key), String(icon || '')])) : {},
    desktopLayouts: value.desktopLayouts && typeof value.desktopLayouts === 'object' ? { page1: value.desktopLayouts.page1 || {}, page2: value.desktopLayouts.page2 || {} } : { page1: {}, page2: {} },
    desktopHidden: value.desktopHidden && typeof value.desktopHidden === 'object' ? { page1: Array.isArray(value.desktopHidden.page1) ? value.desktopHidden.page1.map(String) : [], page2: Array.isArray(value.desktopHidden.page2) ? value.desktopHidden.page2.map(String) : [] } : { page1: [], page2: [] },
    appBeauty: value.appBeauty && typeof value.appBeauty === 'object' ? Object.fromEntries(Object.entries(value.appBeauty).map(([key, raw]) => {
      const item = raw as Partial<{ background: string; accent: string; radius: number; fontScale: number }>;
      return [String(key), {
        background: String(item?.background || ''),
        accent: String(item?.accent || '#292724'),
        radius: Number.isFinite(Number(item?.radius)) ? Math.max(0, Math.min(36, Number(item.radius))) : 18,
        fontScale: Number.isFinite(Number(item?.fontScale)) ? Math.max(.9, Math.min(1.15, Number(item.fontScale))) : 1,
      }];
    })) : {},
    showDynamicIsland: value.showDynamicIsland !== false,
    islandShowIdleDot: value.islandShowIdleDot === true,
    islandIdleLabel: String(value.islandIdleLabel ?? ''),
    islandDotColor: String(value.islandDotColor || '#34d399'),
    islandCollapsedStyle: value.islandCollapsedStyle === 'black' ? 'black' : 'glass',
    islandFontFamily: String(value.islandFontFamily || ''),
    lockWallpaper: String(value.lockWallpaper ?? ''),
    lockStyle: value.lockStyle === 'classic' ? 'classic' : 'ios-large',
    lockMethods: Array.isArray(value.lockMethods)
      ? (value.lockMethods as string[]).filter((item): item is 'swipe' | 'passcode' | 'fingerprint' => item === 'swipe' || item === 'passcode' || item === 'fingerprint')
      : ['swipe'],
    lockPasscode: String(value.lockPasscode || '').replace(/\D/g, '').slice(0, 6),
    phoneShell: value.phoneShell === 'classic-round' || value.phoneShell === 'classic-square' ? value.phoneShell : 'modern',
    showPhoneFrame: value.showPhoneFrame !== false,
    showStatusBar: value.showStatusBar !== false,
    updatedAt: String(value.updatedAt || new Date().toISOString()),
  };
}

export function readAppearance(): AppearanceScheme {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  const parsed = safeParse<Partial<AppearanceScheme>>(window.localStorage.getItem(KEY), {});
  return normalizeAppearance(parsed);
}

export function saveAppearance(value: Partial<AppearanceScheme>): AppearanceScheme {
  const next = normalizeAppearance({ ...readAppearance(), ...value, updatedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('sane333:appearance-changed'));
    } catch (error) {
      // 大字体 data URL 容易撞配额；抛出让 UI 提示，避免静默失败
      const message = error instanceof Error ? error.message : 'appearance save failed';
      throw new Error(message.includes('Quota') || message.includes('quota')
        ? '本地存储空间不足，字体可能过大'
        : message);
    }
  }
  return next;
}

export function getAppearanceSchemes(): AppearanceScheme[] {
  if (typeof window === 'undefined') return [DEFAULT_APPEARANCE];
  const parsed = safeParse<unknown>(window.localStorage.getItem(SCHEMES_KEY), []);
  if (!Array.isArray(parsed) || !parsed.length) return [DEFAULT_APPEARANCE];
  return parsed.map(item => normalizeAppearance(item as Partial<AppearanceScheme>));
}

export function saveAppearanceScheme(name: string): AppearanceScheme {
  const current = readAppearance();
  const scheme = {
    ...current,
    id: 'scheme-' + Date.now().toString(36),
    name: name.trim() || '未命名方案',
    updatedAt: new Date().toISOString(),
  };
  const next = [...getAppearanceSchemes().filter(item => item.id !== scheme.id), scheme];
  if (typeof window !== 'undefined') window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(next));
  return scheme;
}

export function applyAppearanceScheme(id: string): AppearanceScheme {
  const scheme = getAppearanceSchemes().find(item => item.id === id);
  if (!scheme) return readAppearance();
  return saveAppearance(scheme);
}

export function deleteAppearanceScheme(id: string) {
  if (id === DEFAULT_APPEARANCE.id || typeof window === 'undefined') return;
  const next = getAppearanceSchemes().filter(item => item.id !== id);
  window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(next));
}


export function getSavedFonts(): SavedFont[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeParse<unknown>(window.localStorage.getItem(FONTS_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(item => item && typeof item === 'object').map(item => {
    const value = item as Partial<SavedFont>;
    return { id: String(value.id || ''), name: String(value.name || '未命名字体'), source: (value.source === 'url' ? 'url' : 'upload') as 'upload' | 'url', value: String(value.value || ''), createdAt: String(value.createdAt || new Date().toISOString()) };
  }).filter(item => item.id && item.value);
}
export function saveFont(font: Omit<SavedFont, 'id' | 'createdAt'>): SavedFont {
  const next: SavedFont = { ...font, id: 'font-' + Date.now().toString(36), createdAt: new Date().toISOString() };
  if (typeof window !== 'undefined') window.localStorage.setItem(FONTS_KEY, JSON.stringify([next, ...getSavedFonts()]));
  return next;
}
export function deleteSavedFont(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FONTS_KEY, JSON.stringify(getSavedFonts().filter(font => font.id !== id)));
}
