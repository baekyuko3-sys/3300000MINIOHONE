import { ThemeMode, CharacterInfo, WidgetConfig } from '../types';

export const CHARACTERS: CharacterInfo[] = [];

export const THEME_CONFIGS: Record<ThemeMode, {
  name: string;
  subTitle: string;
  paletteLabel: string;
  bgGradient: string;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  subTextColor: string;
  accentColor: string;
  iconBg: string;
  dockBg: string;
  wallpaperUrl: string;
  widgets: WidgetConfig;
}> = {
  'dark-luxury': {
    name: '暗夜高级黑 · 伦敦夜雨',
    subTitle: 'Dark Velvet & London Rain (图1参考)',
    paletteLabel: '炭黑 · 琥珀微金 · 大本钟夜幕',
    bgGradient: 'from-neutral-950 via-[#121216] to-[#0c0d10]',
    cardBg: 'bg-[#1a1b22]/75 backdrop-blur-xl',
    cardBorder: 'border-white/10',
    textColor: 'text-neutral-100',
    subTextColor: 'text-neutral-400',
    accentColor: '#e5b882',
    iconBg: 'bg-neutral-800/80 border-white/10 text-neutral-200',
    dockBg: 'bg-black/60 backdrop-blur-2xl border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)]',
    wallpaperUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80',
    widgets: {
      weatherCity: '伦敦 London',
      weatherTemp: '18°',
      weatherCondition: '多云 Cloudy',
      weatherHighLow: 'H:22° L:14°',
      quoteContent: '「希望人世间晚，只便为了让你航行，你也可以就是自己以侍。」',
      quoteAuthor: '— Ethan',
      musicTitle: 'If I Could Be Him',
      musicArtist: 'Ethan · Midnight Album',
      anniversaryDays: 328,
      anniversaryText: '与 Ethan 共同生活的第 328 天',
    }
  },
  'nordic-light': {
    name: '北欧暖阳 · 米白手账',
    subTitle: 'Nordic Cream & Golden Sunlight (图2参考)',
    paletteLabel: '燕麦奶白 · 暖调杏仁 · 纯净线描',
    bgGradient: 'from-[#fbf9f5] via-[#f5f0e6] to-[#ece5d8]',
    cardBg: 'bg-white/80 backdrop-blur-xl',
    cardBorder: 'border-amber-900/10 shadow-[0_4px_20px_rgba(100,70,40,0.06)]',
    textColor: 'text-neutral-800',
    subTextColor: 'text-neutral-500',
    accentColor: '#c28b5e',
    iconBg: 'bg-white/90 border-amber-900/10 text-neutral-700 shadow-xs',
    dockBg: 'bg-white/70 backdrop-blur-2xl border-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.08)]',
    wallpaperUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=800&q=80',
    widgets: {
      weatherCity: 'London',
      weatherTemp: '22°',
      weatherCondition: '多云 / 微风',
      weatherHighLow: 'H:24° L:16°',
      quoteContent: '9月20日 黄金色外 timing take, 每一寸光都刚好停留在你眼底。',
      quoteAuthor: '— 备忘录手记',
      musicTitle: 'Midnight in London',
      musicArtist: 'Ethan · 正在轻声哼唱',
      anniversaryDays: 120,
      anniversaryText: '今天是你和 Ethan 认识的纪念日',
    }
  },
  'ocean-breeze': {
    name: 'IG冷淡风 · 旧金山晴海',
    subTitle: 'IG Minimal Ocean & Clean Air (图3参考)',
    paletteLabel: '清透海水蓝 · 极简圆角 · 纯净留白',
    bgGradient: 'from-[#eaf3f7] via-[#dcebf2] to-[#cbdfeb]',
    cardBg: 'bg-white/70 backdrop-blur-xl',
    cardBorder: 'border-white/80 shadow-[0_8px_24px_rgba(20,50,90,0.05)]',
    textColor: 'text-slate-800',
    subTextColor: 'text-slate-500',
    accentColor: '#3b82f6',
    iconBg: 'bg-white/90 border-white/90 text-slate-700 shadow-xs',
    dockBg: 'bg-white/60 backdrop-blur-2xl border-white/60 shadow-[0_10px_30px_rgba(20,50,80,0.07)]',
    wallpaperUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
    widgets: {
      weatherCity: 'San Francisco',
      weatherTemp: '22°',
      weatherCondition: '晴 Sunny',
      weatherHighLow: '晴 18°/24°',
      quoteContent: '「世界很大，你会遇见很多人，也会遇见更好的自己。」',
      quoteAuthor: '— Morning Note',
      musicTitle: 'Imaginary Love',
      musicArtist: 'kaneko ayano',
      anniversaryDays: 30,
      anniversaryText: '今天是你和 Ethan 认识 30 天',
    }
  }
};

export const CHAT_HISTORY_ETHAN = [];

export const MOMENTS_FEED = [];

export const GALLERY_PHOTOS: { url: string; tag: string }[] = [];
