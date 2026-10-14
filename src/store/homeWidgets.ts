/**
 * iOS风格小组件系统
 * 支持拖拽、调整大小、多种小组件类型
 */

import type { WidgetConfig } from '../types';

// ============= 小组件类型定义 =============

export type WidgetSize = 'small' | 'medium' | 'large';
export type WidgetType = 
  | 'weather'      // 天气
  | 'clock'        // 时钟
  | 'calendar'     // 日历
  | 'photos'       // 照片
  | 'battery'       // 电池
  | 'health'       // 健康
  | 'notes'         // 备忘录/便签
  | 'reminders'     // 提醒
  | 'music'         // 音乐
  | 'shortcuts'     // 快捷指令
  | 'system-status' // 系统状态
  | 'timer'         // 计时器
  | 'world-clock';  // 世界时钟

export interface HomeWidget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  x: number;  // 0-100 百分比位置
  y: number;
  config: Record<string, string | number | boolean>;
}

// ============= 小组件默认配置 =============

export const WIDGET_DEFAULTS: Record<WidgetType, Record<string, string | number | boolean>> = {
  'weather': {
    city: 'Beijing',
    showCondition: true,
    showHighLow: true,
  },
  'clock': {
    cityName: '现在',
    showSeconds: false,
    isAnalog: false,
  },
  'calendar': {
    showEvents: true,
    eventCount: 2,
  },
  'photos': {
    albumName: '最近照片',
    shuffle: true,
  },
  'battery': {
    showPercentage: true,
    showIcon: true,
  },
  'health': {
    stat: 'steps', // steps, calories, stand, exercise
    showRing: true,
  },
  'notes': {
    content: '待办事项...',
    color: 'yellow', // yellow, blue, green, pink
  },
  'reminders': {
    title: '提醒事项',
    count: 3,
  },
  'music': {
    showArtwork: true,
    showProgress: true,
  },
  'shortcuts': {
    app1: 'messages',
    app2: 'camera',
    app3: 'music',
    app4: 'photos',
  },
  'system-status': {
    items: 'wifi,bluetooth',
  },
  'timer': {
    label: '专注时间',
    minutes: 25,
  },
  'world-clock': {
    city1: '纽约',
    city2: '东京',
  },
};

// ============= 小组件元数据 =============

export interface WidgetMeta {
  type: WidgetType;
  name: string;
  nameZh: string;
  icon: string;
  description: string;
  supportsSizes: WidgetSize[];
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  { type: 'weather', name: 'Weather', nameZh: '天气', icon: '☀️', description: '显示天气信息和温度', supportsSizes: ['small', 'medium', 'large'] },
  { type: 'clock', name: 'Clock', nameZh: '时钟', icon: '🕐', description: '显示当前时间', supportsSizes: ['small', 'medium', 'large'] },
  { type: 'calendar', name: 'Calendar', nameZh: '日历', icon: '📅', description: '显示日历和日程', supportsSizes: ['small', 'medium', 'large'] },
  { type: 'photos', name: 'Photos', nameZh: '照片', icon: '🖼️', description: '展示照片或回忆', supportsSizes: ['medium', 'large'] },
  { type: 'battery', name: 'Battery', nameZh: '电池', icon: '🔋', description: '显示设备电量', supportsSizes: ['small', 'medium'] },
  { type: 'health', name: 'Health', nameZh: '健康', icon: '❤️', description: '显示健康数据', supportsSizes: ['small', 'medium'] },
  { type: 'notes', name: 'Notes', nameZh: '便签', icon: '📝', description: '快速记录想法', supportsSizes: ['small', 'medium'] },
  { type: 'reminders', name: 'Reminders', nameZh: '提醒', icon: '✅', description: '待办事项列表', supportsSizes: ['small', 'medium', 'large'] },
  { type: 'music', name: 'Music', nameZh: '音乐', icon: '🎵', description: '正在播放的音乐', supportsSizes: ['small', 'medium', 'large'] },
  { type: 'shortcuts', name: 'Shortcuts', nameZh: '快捷指令', icon: '⚡', description: '常用应用快捷方式', supportsSizes: ['medium', 'large'] },
  { type: 'system-status', name: 'System', nameZh: '系统状态', icon: '📡', description: 'WiFi、蓝牙等状态', supportsSizes: ['small', 'medium'] },
  { type: 'timer', name: 'Timer', nameZh: '计时器', icon: '⏱️', description: '专注计时', supportsSizes: ['small', 'medium'] },
  { type: 'world-clock', name: 'World Clock', nameZh: '世界时钟', icon: '🌍', description: '多个时区时间', supportsSizes: ['medium', 'large'] },
];

// ============= 存储相关 =============

const HOME_WIDGETS_KEY = 'sane333:home-widgets';

export function getHomeWidgets(): HomeWidget[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HOME_WIDGETS_KEY);
    if (!raw) return getDefaultWidgets();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultWidgets();
    return parsed;
  } catch {
    return getDefaultWidgets();
  }
}

export function saveHomeWidgets(widgets: HomeWidget[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HOME_WIDGETS_KEY, JSON.stringify(widgets));
  window.dispatchEvent(new CustomEvent('sane333:home-widgets-changed'));
}

export function addHomeWidget(type: WidgetType, size: WidgetSize = 'medium'): HomeWidget {
  const widgets = getHomeWidgets();
  const newWidget: HomeWidget = {
    id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    size,
    x: Math.floor(Math.random() * 40) + 5, // 5-45%
    y: Math.floor(Math.random() * 30) + 10, // 10-40%
    config: { ...WIDGET_DEFAULTS[type] },
  };
  widgets.push(newWidget);
  saveHomeWidgets(widgets);
  return newWidget;
}

export function removeHomeWidget(id: string): void {
  const widgets = getHomeWidgets().filter(w => w.id !== id);
  saveHomeWidgets(widgets);
}

export function updateHomeWidget(id: string, updates: Partial<HomeWidget>): void {
  const widgets = getHomeWidgets().map(w => w.id === id ? { ...w, ...updates } : w);
  saveHomeWidgets(widgets);
}

export function resetHomeWidgets(): void {
  saveHomeWidgets(getDefaultWidgets());
}

function getDefaultWidgets(): HomeWidget[] {
  return [
    {
      id: 'default-weather',
      type: 'weather',
      size: 'medium',
      x: 5,
      y: 5,
      config: { ...WIDGET_DEFAULTS['weather'] },
    },
    {
      id: 'default-clock',
      type: 'clock',
      size: 'small',
      x: 55,
      y: 5,
      config: { ...WIDGET_DEFAULTS['clock'] },
    },
  ];
}
