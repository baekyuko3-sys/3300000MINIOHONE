import { useEffect, useMemo, useState } from 'react';
import { compressImageDataUrl } from '../../store/imageCompress';
import { ArrowLeft, Check, ChevronDown, Copy, Lock, Palette, Plus, Smartphone, Sparkles, Trash2, Type, Wand2 } from 'lucide-react';
import type { ScreenType, ThemeMode } from '../../types';
import {
  applyAppearanceScheme,
  deleteAppearanceScheme,
  getAppearanceSchemes,
  readAppearance,
  saveAppearance,
  saveAppearanceScheme,
  type AppearanceScheme,
  getSavedFonts,
  saveFont,
  deleteSavedFont,
  type SavedFont,
} from '../../store/appearance';
import { putMedia } from '../../store/mediaVault';

interface AppearanceScreenViewProps {
  currentTheme: ThemeMode;
  onNavigate: (screen: ScreenType) => void;
  onSelectTheme: (theme: ThemeMode) => void;
}

type Section = 'theme' | 'home' | 'widgets' | 'icons' | 'apps' | 'lock' | 'shell' | 'schemes';

const themeOptions: Array<{ id: ThemeMode; title: string; note: string }> = [
  { id: 'nordic-light', title: '胶片原色', note: '米白 / 纸张 / 安静' },
  { id: 'dark-luxury', title: '暗夜胶片', note: '黑 / 炭灰 / 夜间' },
  { id: 'ocean-breeze', title: '海蓝胶片', note: '灰蓝 / 清冷 / 空气感' },
];

export function AppearanceScreenView({ currentTheme, onNavigate, onSelectTheme }: AppearanceScreenViewProps) {
  const [section, setSection] = useState<Section>('theme');
  const [appearance, setAppearance] = useState<AppearanceScheme>(() => readAppearance());
  const [schemes, setSchemes] = useState<AppearanceScheme[]>(() => getAppearanceSchemes());
  const [schemeName, setSchemeName] = useState('');
  const [notice, setNotice] = useState('');
  const [savedFonts, setSavedFonts] = useState<SavedFont[]>(() => getSavedFonts());
  const [fontDraftName, setFontDraftName] = useState('');
  const [fontDraftValue, setFontDraftValue] = useState('');
  const [fontDraftSource, setFontDraftSource] = useState<'upload' | 'url'>('url');
  const [selectedApp, setSelectedApp] = useState('line');
  const [appBeauty, setAppBeauty] = useState(() => readAppearance().appBeauty || {});
  const [islandOpen, setIslandOpen] = useState(false);
  const [lockAppearanceOpen, setLockAppearanceOpen] = useState(false);
  const appItems = [
    ['line', 'LINE / 聊天'], ['moments', 'VROOM / 朋友圈'], ['character-profile', '角色档案'], ['offline-story', '线下剧情'],
    ['world-book', '世界书'], ['gallery', '相册'], ['music', '音乐'], ['memory', 'Memory'], ['npc', 'NPC'],
    ['threads', 'Threads'], ['group-presets', '群聊预设'], ['spy-phone', '查手机'], ['notes', 'Notes'], ['calendar', 'Calendar'],
    ['studio', 'Studio'], ['settings', '设置'],
  ] as const;

  useEffect(() => {
    const sync = () => {
      setAppearance(readAppearance());
      setSchemes(getAppearanceSchemes());
      setSavedFonts(getSavedFonts());
    };
    window.addEventListener('sane333:appearance-changed', sync);
    return () => window.removeEventListener('sane333:appearance-changed', sync);
  }, []);

  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const update = <K extends keyof AppearanceScheme>(key: K, value: AppearanceScheme[K]) => {
    const next = saveAppearance({ [key]: value });
    setAppearance(next);
    setAppBeauty(next.appBeauty || {});
  };

  const updateWidget = (key: keyof AppearanceScheme['widget'], value: string | number) => {
    const next = saveAppearance({ widget: { ...appearance.widget, [key]: value } });
    setAppearance(next);
  };

  const updateIcon = (key: string, value: string) => {
    const next = saveAppearance({
      appIcons: { ...appearance.appIcons, [key]: value },
    });
    setAppearance(next);
  };

  const iconItems = [
    ['line', 'LINE', 'LINE', 'bg-[#36332f]', 'text-[#eee]', 'border-transparent'],
    ['moments', 'IG', 'IG', 'bg-[#9b8068]', 'text-white', 'border-transparent'],
    ['music', '音乐', 'MUSIC', 'bg-[var(--icon)]', 'text-[var(--ink)]', 'border-[var(--edge)]'],
    ['offline-story', '线下剧情', 'BOOK', 'bg-[var(--icon)]', 'text-[var(--ink)]', 'border-[var(--edge)]'],
    ['character-profile', '角色档案', 'CARD', 'bg-[var(--icon)]', 'text-[var(--ink)]', 'border-[var(--edge)]'],
    ['world-book', '世界书', 'GLOBE', 'bg-[var(--icon)]', 'text-[var(--ink)]', 'border-[var(--edge)]'],
    ['appearance', '外观', 'LOOK', 'bg-[var(--icon)]', 'text-[var(--ink)]', 'border-[var(--edge)]'],
    ['settings', '设置', 'GEAR', 'bg-[var(--icon)]', 'text-[var(--ink)]', 'border-[var(--edge)]'],
    ['threads', 'Threads', 'THREADS', 'bg-[#1a1a1a]', 'text-white', 'border-transparent'],
    ['npc', 'NPC', 'NPC', 'bg-[#ebe2dc]', 'text-[#5f554f]', 'border border-black/5'],
    ['group-presets', '预设', '预', 'bg-[#f0ebe5]', 'text-[#63584f]', 'border border-black/5'],
    ['spy-phone', '查手机', 'SPY', 'bg-[#9b625b]', 'text-white', 'border-transparent'],
    ['memory', 'Memory', 'M', 'bg-[#292724]', 'text-white', 'border-transparent'],
    ['studio', 'Studio', 'STUDIO', 'bg-[#242220]', 'text-white', 'border-transparent'],
  ] as const;

  const chooseTheme = (theme: ThemeMode) => {
    onSelectTheme(theme);
    update('themeMode', theme);
    update('globalBackground', theme === 'ocean-breeze' ? '#eaf1f6' : theme === 'dark-luxury' ? '#161514' : '#f7f4ee');
  };

  const saveScheme = () => {
    const saved = saveAppearanceScheme(schemeName);
    setSchemes(getAppearanceSchemes());
    setSchemeName('');
    notify('外观方案已保存');
  };

  const applyScheme = (id: string) => {
    const next = applyAppearanceScheme(id);
    setAppearance(next);
    onSelectTheme(next.themeMode);
    setSchemes(getAppearanceSchemes());
    notify('方案已应用');
  };

  const removeScheme = (id: string) => {
    if (!window.confirm('删除这套外观方案？')) return;
    deleteAppearanceScheme(id);
    setSchemes(getAppearanceSchemes());
    notify('方案已删除');
  };

  const navItems = useMemo(() => [
    ['theme', '主题', Palette],
    ['home', '文字', Type],
    ['widgets', '小组件', Wand2],
    ['icons', '图标', Sparkles],
    ['apps', '应用美化', Wand2],
    ['lock', '锁屏', Lock],
    ['shell', '外形', Smartphone],
    ['schemes', '方案', Copy],
  ] as const, []);

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col" style={{ background: appearance.globalBackground || 'var(--paper)', color: 'var(--ink)' }}>
      <header className="shrink-0 pt-11 px-5 pb-3 border-b border-black/10 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/70 grid place-items-center">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">PERSONAL DEVICE · APPEARANCE</div>
            <h1 className="m-0 text-[18px] font-semibold tracking-tight">Appearance</h1>
          </div>
          <div className="text-[8px] font-mono text-[#8b8782]">CUSTOM</div>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-3">
          {navItems.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setSection(id)} className={section === id ? 'py-2 rounded-xl bg-[#292724] text-white text-[8px]' : 'py-2 rounded-xl text-[#777069] text-[8px] bg-white/40'}>
              <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-3.5 pb-24 space-y-2.5">
        {section === 'theme' && (
          <>
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">THEME PRESETS</div>
              <div className="mt-1 text-[12px] font-semibold">不改变首页布局，只改变它的外观系统。</div>
              <div className="mt-1 text-[9px] text-[#777069]">颜色、纸张感和整体氛围都可以换；已经确认的 LINE UI 不受影响。</div>
            </div>
            <div className="grid gap-2">
              {themeOptions.map(option => (
                <button key={option.id} onClick={() => chooseTheme(option.id)} className={currentTheme === option.id ? 'p-3 rounded-2xl bg-[#292724] text-white text-left' : 'p-3 rounded-2xl bg-white/65 border border-black/5 text-left'}>
                  <div className="flex items-center justify-between">
                    <b className="text-[11px]">{option.title}</b>
                    {currentTheme === option.id && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div className={currentTheme === option.id ? 'mt-1 text-[8px] text-white/65' : 'mt-1 text-[8px] text-[#8b8782]'}>{option.note}</div>
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-white/65 border border-black/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setIslandOpen((value) => !value)}
                className="w-full p-3 flex items-center gap-2 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">DYNAMIC ISLAND</div>
                  <div className="mt-1 text-[11px] font-semibold">灵动岛设置</div>
                  <div className="mt-0.5 text-[8px] text-[#777069] truncate">
                    {appearance.showDynamicIsland === false
                      ? '已隐藏'
                      : [
                          appearance.islandCollapsedStyle === 'black' ? '纯黑' : '白玻璃',
                          appearance.islandShowIdleDot ? '有圆点' : '无圆点',
                          (appearance.islandIdleLabel || '').trim() || '无文字',
                        ].join(' · ')}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#8b8782] transition-transform ${islandOpen ? 'rotate-180' : ''}`} />
              </button>

              {islandOpen && (
                <div className="px-3 pb-3 space-y-3 border-t border-black/5 pt-3">
                  <div className="text-[8px] text-[#777069] leading-relaxed">
                    默认像真 iOS：干净胶囊，没有绿点和字。想写字、加圆点、换字体都可以在这里改。真机自带岛时建议整块关掉。
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => update('showDynamicIsland', true)}
                      className={appearance.showDynamicIsland !== false
                        ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                        : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
                    >
                      <div className="text-[10px] font-semibold">显示</div>
                      <div className={appearance.showDynamicIsland !== false ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
                        桌面 / 模拟器
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => update('showDynamicIsland', false)}
                      className={appearance.showDynamicIsland === false
                        ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                        : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
                    >
                      <div className="text-[10px] font-semibold">隐藏</div>
                      <div className={appearance.showDynamicIsland === false ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
                        真机自带岛
                      </div>
                    </button>
                  </div>

                  <div>
                    <div className="text-[9px] font-semibold mb-1.5">收起皮肤</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => update('islandCollapsedStyle', 'glass')}
                        className={appearance.islandCollapsedStyle !== 'black'
                          ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                          : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
                      >
                        <div className="text-[10px] font-semibold">白玻璃</div>
                        <div className={appearance.islandCollapsedStyle !== 'black' ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
                          方案 F
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => update('islandCollapsedStyle', 'black')}
                        className={appearance.islandCollapsedStyle === 'black'
                          ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                          : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
                      >
                        <div className="text-[10px] font-semibold">纯黑</div>
                        <div className={appearance.islandCollapsedStyle === 'black' ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
                          更像系统
                        </div>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] font-semibold mb-1.5">待机圆点</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => update('islandShowIdleDot', false)}
                        className={appearance.islandShowIdleDot !== true
                          ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                          : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
                      >
                        <div className="text-[10px] font-semibold">不显示</div>
                        <div className={appearance.islandShowIdleDot !== true ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
                          像真 iOS
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => update('islandShowIdleDot', true)}
                        className={appearance.islandShowIdleDot === true
                          ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                          : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
                      >
                        <div className="text-[10px] font-semibold">显示圆点</div>
                        <div className={appearance.islandShowIdleDot === true ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
                          可改颜色
                        </div>
                      </button>
                    </div>
                    {appearance.islandShowIdleDot === true && (
                      <label className="mt-2 flex items-center gap-2 text-[9px]">
                        <span className="text-[#777069]">圆点颜色</span>
                        <input
                          type="color"
                          value={appearance.islandDotColor || '#34d399'}
                          onChange={(event) => update('islandDotColor', event.target.value)}
                          className="w-9 h-8 rounded-lg border-0 bg-transparent p-0"
                        />
                        <input
                          value={appearance.islandDotColor || '#34d399'}
                          onChange={(event) => update('islandDotColor', event.target.value)}
                          className="flex-1 p-2 rounded-xl bg-white/80 text-[9px] outline-none font-mono"
                        />
                      </label>
                    )}
                  </div>

                  <label className="block text-[9px]">
                    待机文字
                    <input
                      value={appearance.islandIdleLabel || ''}
                      onChange={(event) => update('islandIdleLabel', event.target.value)}
                      placeholder="留空 = 不写字（推荐）"
                      maxLength={16}
                      className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[10px] outline-none"
                      style={appearance.islandFontFamily ? { fontFamily: appearance.islandFontFamily } : undefined}
                    />
                    <div className="mt-1 text-[7px] text-[#8b8782]">例如 PRIVATE / 静か / 你的昵称 · 最多 16 字</div>
                  </label>

                  <label className="block text-[9px]">
                    灵动岛字体
                    <input
                      value={appearance.islandFontFamily || ''}
                      onChange={(event) => update('islandFontFamily', event.target.value)}
                      placeholder='留空跟手机 · 或写 "Shippori Mincho", serif'
                      className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none font-mono"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[
                        ['', '默认'],
                        ['"PingFang SC", "Hiragino Sans GB", sans-serif', '苹方'],
                        ['"Shippori Mincho", "Songti SC", serif', '明朝'],
                        ['ui-monospace, SFMono-Regular, Menlo, monospace', '等宽'],
                        ['Georgia, "Times New Roman", serif', '衬线'],
                      ].map(([value, label]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => update('islandFontFamily', value)}
                          className={
                            (appearance.islandFontFamily || '') === value
                              ? 'px-2 py-1 rounded-lg bg-[#292724] text-white text-[8px]'
                              : 'px-2 py-1 rounded-lg bg-white/80 border border-black/5 text-[8px] text-[#777069]'
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </label>

                  <div
                    className="flex items-center justify-center py-3 rounded-xl"
                    style={{
                      background: appearance.islandCollapsedStyle === 'black'
                        ? 'linear-gradient(165deg,#dfe8f0,#c5d4e3)'
                        : '#181817',
                    }}
                  >
                    {appearance.showDynamicIsland !== false ? (
                      <div
                        className={`h-[26px] rounded-full flex items-center justify-center gap-1.5 px-3 ${
                          appearance.islandCollapsedStyle === 'black'
                            ? 'bg-[#0a0a0a] text-white shadow-[0_4px_12px_rgba(0,0,0,.35)]'
                            : 'bg-white/85 text-[#1c1917] border border-white/80 shadow-[0_4px_14px_rgba(0,0,0,.2)] backdrop-blur'
                        }`}
                        style={{
                          minWidth: 96,
                          fontFamily: appearance.islandFontFamily || undefined,
                        }}
                      >
                        {appearance.islandShowIdleDot === true && (
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-none"
                            style={{ background: appearance.islandDotColor || '#34d399' }}
                          />
                        )}
                        {(appearance.islandIdleLabel || '').trim() ? (
                          <span className="text-[9px] font-semibold tracking-wide">
                            {(appearance.islandIdleLabel || '').trim()}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[8px] text-white/45">顶部干净 · 无灵动岛</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* 锁屏外观（折叠）：壁纸设定 */}
            <div className="rounded-2xl bg-white/65 border border-black/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setLockAppearanceOpen((value) => !value)}
                className="w-full p-3 flex items-center gap-2 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">LOCK SCREEN</div>
                  <div className="mt-1 text-[11px] font-semibold">锁屏外观</div>
                  <div className="mt-0.5 text-[8px] text-[#777069] truncate">
                    {appearance.lockWallpaper ? '已设置独立锁屏壁纸' : '跟随主屏幕壁纸'}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#8b8782] transition-transform ${lockAppearanceOpen ? 'rotate-180' : ''}`} />
              </button>

              {lockAppearanceOpen && (
                <div className="px-3 pb-3 space-y-3 border-t border-black/5 pt-3">
                  <LockWallpaperBlock appearance={appearance} update={update} notify={notify} />
                </div>
              )}
            </div>
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-3">
              <div>
                <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">PHONE COLOR SYSTEM</div>
                <div className="mt-1 text-[11px] font-semibold">手机主背景色</div>
                <div className="mt-1 text-[8px] text-[#777069]">统一控制手机的大部分页面；LINE / 聊天保持纯白，不跟随这里改变。</div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['#ffffff','纯白'],['#f7f4ee','暖纸'],['#f2f4f7','雾灰'],['#eef2f1','鼠尾草'],
                  ['#eef3f8','冰蓝'],['#f2edf1','灰粉'],['#f4efe7','燕麦'],['#e9edf0','银灰']
                ].map(([color,label]) => (
                  <button key={color} onClick={() => update('globalBackground', color)} className="p-1.5 rounded-xl border border-black/5 bg-white/70">
                    <div className="h-8 rounded-lg border border-black/5" style={{background:color}} />
                    <div className="mt-1 text-[7px] text-[#777069]">{label}</div>
                  </button>
                ))}
              </div>
              <label className="text-[9px] block">自定义颜色
                <div className="mt-1 flex gap-2">
                  <input type="color" value={appearance.globalBackground || '#f7f4ee'} onChange={event => update('globalBackground', event.target.value)} className="w-10 h-9 rounded-lg border-0 bg-transparent p-0" />
                  <input value={appearance.globalBackground || '#f7f4ee'} onChange={event => update('globalBackground', event.target.value)} className="flex-1 p-2.5 rounded-xl bg-white/80 text-[9px] outline-none font-mono" />
                </div>
              </label>
              <div className="space-y-2">
                <div>
                  <div className="text-[9px] font-semibold">桌面壁纸</div>
                  <div className="mt-0.5 text-[8px] text-[#777069]">可上传本地图片，或填图片链接；显示在手机桌面首页。</div>
                </div>
                {appearance.wallpaper ? (
                  <div className="relative h-28 rounded-xl overflow-hidden border border-black/5 bg-[#f0ebe4]">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${JSON.stringify(appearance.wallpaper)})` }}
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/45 to-transparent flex items-end justify-between gap-2">
                      <span className="text-[8px] text-white/90 truncate">
                        {appearance.wallpaper.startsWith('data:') ? '本地图片已应用' : '链接壁纸已应用'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { update('wallpaper', ''); notify('已移除桌面壁纸'); }}
                        className="shrink-0 px-2 py-1 rounded-full bg-white/90 text-[8px] text-[#555]"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-20 rounded-xl border border-dashed border-[#d7d2ca] bg-white/45 grid place-items-center text-[8px] text-[#aaa]">
                    还没有壁纸 · 上传后会出现在桌面
                  </div>
                )}
                <label className="block p-3 rounded-xl border border-dashed border-[#d7d2ca] bg-white/45 cursor-pointer">
                  <div className="text-[9px] font-medium">{appearance.wallpaper ? '更换壁纸图片' : '上传壁纸图片'}</div>
                  <div className="text-[8px] text-[#aaa] mt-1">支持 jpg / png / webp · 保存在本机浏览器</div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > 8 * 1024 * 1024) {
                        notify('图片太大了，请选 8MB 以内的');
                        event.currentTarget.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const raw = String(reader.result || '');
                        update('wallpaper', await compressImageDataUrl(raw, 1024));
                        notify('桌面壁纸已更新');
                      };
                      reader.onerror = () => notify('壁纸读取失败');
                      reader.readAsDataURL(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <label className="text-[9px] block">或使用图片链接
                  <input
                    value={appearance.wallpaper.startsWith('data:') ? '' : appearance.wallpaper}
                    onChange={event => update('wallpaper', event.target.value.trim())}
                    placeholder="https://… 留空则用背景色"
                    className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none"
                  />
                </label>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-3">
              <div>
                <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">CUSTOM TYPEFACE</div>
                <div className="mt-1 text-[11px] font-semibold">上传字体</div>
                <div className="mt-1 text-[8px] text-[#777069]">支持 .woff / .woff2 / .ttf / .otf。字体只保存在本机浏览器。</div>
              </div>
              <label className="block text-[9px]">字体链接
                <input
                  value={appearance.customFontUrl || ''}
                  onChange={event => {
                    const url = event.target.value.trim();
                    // 填链接时清空本地上传，避免互相盖住
                    const next = saveAppearance({ customFontUrl: url, customFont: url ? '' : appearance.customFont, customFontName: url ? (appearance.customFontName || '远程字体') : appearance.customFontName });
                    setAppearance(next);
                    setAppBeauty(next.appBeauty || {});
                  }}
                  placeholder="https://example.com/font.woff2"
                  className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none font-mono"
                />
                <div className="text-[8px] text-[#aaa] mt-1">支持直接可访问的 .woff / .woff2 / .ttf / .otf 字体链接。</div>
              </label>
              <label className="block p-3 rounded-xl border border-dashed border-[#d7d2ca] bg-white/45 cursor-pointer">
                <div className="text-[9px] font-medium">{appearance.customFontName || '选择字体文件'}</div>
                <div className="text-[8px] text-[#aaa] mt-1">点击上传并立即应用（会覆盖字体链接）</div>
                <input type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" className="hidden" onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 12 * 1024 * 1024) {
                    notify('字体文件太大（请小于 12MB）');
                    event.currentTarget.value = '';
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const dataUrl = String(reader.result || '');
                      if (!dataUrl) { notify('字体读取为空'); return; }
                      // dataURL 动辄几 MB，直接进 localStorage 必爆 quota：存 IndexedDB，只存 media: 引用
                      let ref = dataUrl;
                      if (dataUrl.startsWith('data:')) {
                        const id = await putMedia(dataUrl);
                        ref = 'media:' + id;
                      }
                      const next = saveAppearance({
                        customFont: ref,
                        customFontName: file.name,
                        customFontUrl: '',
                      });
                      setAppearance(next);
                      setAppBeauty(next.appBeauty || {});
                      window.dispatchEvent(new CustomEvent('sane333:appearance-changed'));
                      notify('字体已保存并应用');
                    } catch {
                      notify('字体保存失败：本地存储空间可能不足');
                    }
                  };
                  reader.onerror = () => notify('字体读取失败');
                  reader.readAsDataURL(file);
                  event.currentTarget.value = '';
                }} />
              </label>
              {(appearance.customFont || appearance.customFontUrl) && (
                <div className="p-3 rounded-xl bg-[#f7f4ee] border border-[#e5dfd6]">
                  <div className="text-[9px] text-[#777069]">当前字体预览</div>
                  <div className="mt-1.5 text-[16px] leading-relaxed" style={{ fontFamily: 'Sane333Custom, Georgia, serif' }}>
                    你好 · Hello · 123 · {appearance.customFontName || '自定义字体'}
                  </div>
                </div>
              )}
              <div className="p-3 rounded-xl bg-[#f7f4ee] border border-[#e5dfd6] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] font-semibold">字体大小</div>
                    <div className="text-[8px] text-[#999]">调整整个手机文字比例</div>
                  </div>
                  <span className="text-[9px] font-mono">{Math.round((appearance.customFontSize || 1) * 100)}%</span>
                </div>
                <input type="range" min="0.75" max="1.5" step="0.05" value={appearance.customFontSize || 1} onChange={event => update('customFontSize', Number(event.target.value))} className="w-full" />
                <div className="flex justify-between text-[7px] text-[#aaa]"><span>75%</span><span>100%</span><span>125%</span><span>150%</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { update('customFont',''); update('customFontUrl',''); update('customFontName',''); notify('已恢复默认字体'); }} className="py-2.5 rounded-xl bg-[#f5f3ef] text-[#777069] text-[9px]">恢复默认字体</button>
                <button onClick={() => { saveAppearance({}); notify('字体设置已保存'); }} className="py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">保存字体设置</button>
              </div>
              <div className="text-[8px] text-[#aaa] leading-relaxed">字体、链接、大小都会保存到当前设备。上传字体会保存在浏览器本地，不会上传到服务器。</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-3">
              <div>
                <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">FONT LIBRARY</div>
                <div className="mt-1 text-[11px] font-semibold">字体收藏与切换</div>
                <div className="mt-1 text-[8px] text-[#777069]">保存多套字体，随时应用其中一套；不是按 App 分配。</div>
              </div>
              <div className="rounded-xl bg-white/75 border border-black/5 p-2.5 space-y-2">
                <input value={fontDraftName} onChange={e=>setFontDraftName(e.target.value)} placeholder="字体名称，例如 Noto Serif" className="w-full p-2.5 rounded-xl bg-white border border-black/5 text-[9px] outline-none"/>
                <input value={fontDraftSource==='url'?fontDraftValue:''} onChange={e=>{setFontDraftSource('url');setFontDraftValue(e.target.value)}} placeholder="字体 URL：https://.../font.woff2" className="w-full p-2.5 rounded-xl bg-white border border-black/5 text-[9px] outline-none font-mono"/>
                <label className="block p-2.5 rounded-xl border border-dashed border-[#d7d2ca] bg-white cursor-pointer">
                  <div className="text-[9px] font-medium">{fontDraftSource==='upload'&&fontDraftName?fontDraftName:'上传字体文件'}</div>
                  <div className="text-[8px] text-[#aaa] mt-1">.woff / .woff2 / .ttf / .otf</div>
                  <input type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{setFontDraftSource('upload');setFontDraftValue(String(reader.result||''));setFontDraftName(file.name.replace(/\.(woff2?|ttf|otf)$/i,''));};reader.readAsDataURL(file);e.currentTarget.value='';}}/>
                </label>
                <button onClick={async ()=>{if(!fontDraftName.trim()||!fontDraftValue.trim()){notify('请填写名称并提供字体');return;}let value=fontDraftValue.trim();let source=fontDraftSource;if(value.startsWith('data:')){try{const id=await putMedia(value);value='media:'+id;source='upload';}catch{notify('字体太大，保存失败');return;}}saveFont({name:fontDraftName.trim(),source,value});setSavedFonts(getSavedFonts());setFontDraftName('');setFontDraftValue('');setFontDraftSource('url');notify('字体已保存');}} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">保存到字体库</button>
              </div>
              <div className="space-y-1.5">
                {savedFonts.length===0&&<div className="rounded-xl border border-dashed border-black/10 p-4 text-center text-[8px] text-[#aaa]">还没有保存的字体</div>}
                {savedFonts.map(font=>{const active=(appearance.customFontUrl||appearance.customFont)===font.value;return <div key={font.id} className="rounded-xl bg-white/75 border border-black/5 p-2.5 flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-[#f2f4f7] grid place-items-center text-[9px] font-semibold">Aa</div>
                  <div className="min-w-0 flex-1"><div className="text-[9px] font-semibold truncate">{font.name}</div><div className="text-[7px] text-[#aaa] mt-0.5">{font.source==='url'?'URL':'本地上传'}{active?' · 当前使用':''}</div></div>
                  <button onClick={()=>{
                    const isRemote = font.value.startsWith('http') || font.value.startsWith('blob:');
                    const next = isRemote
                      ? saveAppearance({ customFontUrl: font.value, customFont: '', customFontName: font.name })
                      : saveAppearance({ customFont: font.value, customFontUrl: '', customFontName: font.name });
                    setAppearance(next);
                    window.dispatchEvent(new CustomEvent('sane333:appearance-changed'));
                    notify('字体已应用');
                  }} className={active?'px-2 py-1.5 rounded-lg bg-[#292724] text-white text-[8px]':'px-2 py-1.5 rounded-lg bg-[#f1efeb] text-[#555] text-[8px]'}>{active?'已应用':'应用'}</button>
                  <button onClick={()=>{deleteSavedFont(font.id);setSavedFonts(getSavedFonts());if(active){update('customFont','');update('customFontUrl','')}notify('字体已删除')}} className="p-1.5 rounded-lg bg-[#f5f3ef] text-[#999]"><Trash2 className="w-3 h-3"/></button>
                </div>})}
              </div>
            </div>
          </>
        )}

        {section === 'home' && (
          <>
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2.5">
              <label className="text-[9px] block">手机名称
                <input value={appearance.appTitle} onChange={event => update('appTitle', event.target.value)} placeholder="Sane333" className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[10px] outline-none" />
              </label>
              <label className="text-[9px] block">首页问候
                <input value={appearance.greeting} onChange={event => update('greeting', event.target.value)} placeholder="GOOD EVENING · PRIVATE DEVICE" className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" />
              </label>
              <label className="text-[9px] block">副标题 / 私人设备文案
                <textarea value={appearance.subtitle} onChange={event => update('subtitle', event.target.value)} className="mt-1 w-full h-20 p-2.5 rounded-xl bg-white/80 text-[9px] outline-none resize-none" />
              </label>
            </div>
          </>
        )}

        {section === 'widgets' && (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">WIDGET DESIGN</div>
              <div className="mt-1 text-[11px] font-semibold">选择小组件设计</div>
              <div className="mt-1 text-[8px] text-[#777069] leading-relaxed">为每个小组件选择喜欢的视觉风格</div>
            </div>

            {/* 天气小组件样式 */}
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
              <div className="text-[10px] font-semibold flex items-center gap-1.5">
                <span>☀️</span>
                <span>天气小组件</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'weather-glass', name: '玻璃', bg: 'bg-[var(--glass)] backdrop-blur-2xl border border-[var(--edge)]', text: 'text-[var(--ink)]' },
                  { id: 'weather-dark', name: '暗色', bg: 'bg-[#1a1a1a]', text: 'text-white' },
                  { id: 'weather-light', name: '极简', bg: 'bg-white border border-black/5', text: 'text-[#1a1a1a]' },
                ].map(style => (
                  <button
                    key={style.id}
                    onClick={() => updateWidget('weatherStyle', style.id)}
                    className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 ${style.bg} ${style.text} ${appearance.widget.weatherStyle === style.id ? 'ring-2 ring-[#9b625b]' : ''}`}
                  >
                    <div className="text-[16px] font-bold">{appearance.widget.weatherTemp || '21°'}</div>
                    <div className="text-[7px]">{style.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 便签小组件样式 */}
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
              <div className="text-[10px] font-semibold flex items-center gap-1.5">
                <span>📝</span>
                <span>便签小组件</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'note-paper', name: '纸张', bg: 'bg-[var(--paper)]', text: 'text-[#5f554f]' },
                  { id: 'note-glass', name: '玻璃', bg: 'bg-[var(--glass)] backdrop-blur-2xl border border-[var(--edge)]', text: 'text-[var(--ink)]' },
                  { id: 'note-dark', name: '黑板', bg: 'bg-[#1a1a1a]', text: 'text-white' },
                ].map(style => (
                  <button
                    key={style.id}
                    onClick={() => updateWidget('noteStyle', style.id)}
                    className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 ${style.bg} ${style.text} ${appearance.widget.noteStyle === style.id ? 'ring-2 ring-[#9b625b]' : ''}`}
                  >
                    <div className="text-[8px] font-serif leading-tight">{appearance.widget.quoteContent?.slice(0, 8) || '便签'}</div>
                    <div className="text-[7px]">{style.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 音乐小组件样式 */}
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
              <div className="text-[10px] font-semibold flex items-center gap-1.5">
                <span>🎵</span>
                <span>音乐小组件</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'music-glass', name: '玻璃', bg: 'bg-[var(--glass)] backdrop-blur-2xl border border-[var(--edge)]', text: 'text-[var(--ink)]' },
                  { id: 'music-dark', name: '暗色', bg: 'bg-[#1a1a1a]', text: 'text-white' },
                  { id: 'music-light', name: '极简', bg: 'bg-white border border-black/5', text: 'text-[#1a1a1a]' },
                ].map(style => (
                  <button
                    key={style.id}
                    onClick={() => updateWidget('musicStyle', style.id)}
                    className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 ${style.bg} ${style.text} ${appearance.widget.musicStyle === style.id ? 'ring-2 ring-[#9b625b]' : ''}`}
                  >
                    <div className="text-[8px] font-bold truncate w-full text-center">{appearance.widget.musicTitle?.slice(0, 6) || '音乐'}</div>
                    <div className="text-[7px]">{style.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 日期小组件样式 */}
            <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
              <div className="text-[10px] font-semibold flex items-center gap-1.5">
                <span>📅</span>
                <span>日期小组件</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'date-classic', name: '经典', bg: 'bg-transparent', text: 'text-[var(--ink)]' },
                  { id: 'date-box', name: '卡片', bg: 'bg-[var(--paper)]', text: 'text-[#1a1a1a]' },
                  { id: 'date-glass', name: '玻璃', bg: 'bg-[var(--glass)] backdrop-blur-2xl border border-[var(--edge)]', text: 'text-[var(--ink)]' },
                ].map(style => (
                  <button
                    key={style.id}
                    onClick={() => updateWidget('dateStyle', style.id)}
                    className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 ${style.bg} ${style.text} ${appearance.widget.dateStyle === style.id ? 'ring-2 ring-[#9b625b]' : ''}`}
                  >
                    <div className="text-[18px] font-serif font-bold leading-none">02</div>
                    <div className="text-[6px] font-mono">OCT</div>
                    <div className="text-[7px]">{style.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'icons' && (
          <>
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">APP ICONS</div>
              <div className="mt-1 text-[11px] font-semibold">自定义应用图标</div>
              <div className="mt-1 text-[8px] leading-relaxed text-[#777069]">
                填图片 URL 即可替换对应图标；留空恢复原来的内置线稿。默认图标和已经确认好的首页布局不会改变。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(readAppearance(), null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='sane333-appearance.json'; a.click(); URL.revokeObjectURL(url); notify('整套外观已导出');
              }} className="py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">导出整套外观</button>
              <label className="py-2.5 rounded-xl bg-white border border-black/5 text-[9px] text-center cursor-pointer">导入整套外观
                <input type="file" accept=".json,application/json" className="hidden" onChange={async e => {
                  const file=e.target.files?.[0]; if(!file) return;
                  try { const parsed=JSON.parse(await file.text()); const next=saveAppearance(parsed); setAppearance(next); setAppBeauty(next.appBeauty||{}); onSelectTheme(next.themeMode); notify('整套外观已导入'); }
                  catch { notify('外观文件格式不正确'); }
                  e.currentTarget.value='';
                }} />
              </label>
            </div>
            <div className="space-y-1.5">
              {iconItems.map(([key, label, text, bg, textColor, border]) => (
                <div key={key} className="p-2.5 rounded-2xl bg-white/65 border border-black/5 flex items-center gap-2">
                  {/* 图标预览 - 64x64统一大小 */}
                  <div className={`w-[52px] h-[52px] rounded-[14px] shadow-[0_4px_12px_rgba(52,43,34,.06)] flex items-center justify-center overflow-hidden shrink-0 ${bg} ${border}`}>
                    {appearance.appIcons[key] ? (
                      <img src={appearance.appIcons[key]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className={`text-[10px] font-bold ${textColor}`}>{text}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-[10px] font-semibold">{label}</div>
                    <input
                      value={appearance.appIcons[key] || ''}
                      onChange={event => updateIcon(key, event.target.value)}
                      placeholder="图片链接"
                      className="w-full p-2 rounded-lg bg-white/80 text-[8px] outline-none"
                    />
                  </div>
                  <button
                    onClick={() => updateIcon(key, '')}
                    className="px-2 py-1.5 rounded-lg bg-[#ebe7df] text-[8px] text-[#777069]"
                  >
                    重置
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'apps' && (
          <>
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">APP BEAUTY · SELECT ANY APP</div>
              <div className="mt-1 text-[12px] font-semibold">选择任意应用，单独保存它的美化</div>
              <div className="mt-1 text-[9px] text-[#777069] leading-relaxed">每个应用都有自己的背景、强调色、圆角和文字比例。保存外观方案时，这些设置也会一起保存。</div>
            </div>
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5 space-y-2">
  <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">DESKTOP LAYOUT</div>
  <div className="text-[11px] font-semibold">桌面布局</div>
  <div className="text-[8px] text-[#777069] leading-relaxed">第一页、第二页都可以自由拖动 App 和小组件，位置会自动保存到当前外观。</div>
  <div className="grid grid-cols-2 gap-1.5">
    <button onClick={() => window.dispatchEvent(new CustomEvent('sane333:open-desktop-editor', { detail: { page: 1 } }))} className="py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">整理第一页</button>
    <button onClick={() => window.dispatchEvent(new CustomEvent('sane333:open-desktop-editor', { detail: { page: 2 } }))} className="py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">整理第二页</button>
  </div>
  <div className="grid grid-cols-2 gap-1.5">
    <button onClick={() => update('desktopLayouts', { ...appearance.desktopLayouts, page1: {} })} className="py-2 rounded-xl bg-white text-[#777] text-[8px] border border-black/5">恢复第一页</button>
    <button onClick={() => update('desktopLayouts', { ...appearance.desktopLayouts, page2: {} })} className="py-2 rounded-xl bg-white text-[#777] text-[8px] border border-black/5">恢复第二页</button>
  </div>
</div>
<div className="grid grid-cols-2 gap-1.5">
              {appItems.map(([id, label]) => (
                <button key={id} onClick={() => setSelectedApp(id)} className={selectedApp === id ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left text-[9px]' : 'p-2.5 rounded-xl bg-white/65 border border-black/5 text-left text-[9px] text-[#555]'}>
                  {label}
                </button>
              ))}
            </div>
            {(() => {
              const current = appBeauty[selectedApp] || { background: '', accent: '#292724', radius: 18, fontScale: 1 };
              const updateAppBeauty = (patch: Partial<typeof current>) => {
                const next = { ...appBeauty, [selectedApp]: { ...current, ...patch } };
                setAppBeauty(next);
                update('appBeauty', next);
              };
              return <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-3">
                <div className="flex items-center justify-between"><div><div className="text-[11px] font-semibold">{appItems.find(x => x[0] === selectedApp)?.[1]}</div><div className="text-[8px] text-[#8b8782] mt-1">只影响这个应用的视觉层</div></div><div className="w-9 h-9 rounded-xl" style={{ background: current.accent }} /></div>
                <label className="block p-3 rounded-xl border border-dashed border-[#ddd] text-[9px] cursor-pointer">
                  <div className="font-medium">上传应用背景</div><div className="text-[#aaa] mt-1">图片会保存到这个应用的专属美化设置</div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file=e.target.files?.[0]; if(!file) return;
                    const reader=new FileReader(); reader.onload=async()=>updateAppBeauty({background:await compressImageDataUrl(String(reader.result||''),1024)}); reader.readAsDataURL(file);
                  }} />
                </label>
                <div><div className="text-[8px] text-[#999] mb-1.5">强调色</div><div className="flex gap-2">{['#292724','#ae7e89','#71849b','#7d8b72','#9b7d62','#5e6b63'].map(color=><button key={color} onClick={()=>updateAppBeauty({accent:color})} className="w-8 h-8 rounded-full border-2 border-white shadow" style={{background:color}} />)}</div></div>
                <div><div className="flex justify-between text-[8px] text-[#999]"><span>圆角</span><span>{current.radius}px</span></div><input type="range" min="0" max="32" value={current.radius} onChange={e=>updateAppBeauty({radius:Number(e.target.value)})} className="w-full" /></div>
                <div><div className="flex justify-between text-[8px] text-[#999]"><span>文字比例</span><span>{current.fontScale.toFixed(2)}×</span></div><input type="range" min=".9" max="1.15" step=".05" value={current.fontScale} onChange={e=>updateAppBeauty({fontScale:Number(e.target.value)})} className="w-full" /></div>
                <button onClick={()=>{ const next={...appBeauty}; delete next[selectedApp]; setAppBeauty(next); update('appBeauty',next); notify('该应用美化已恢复默认'); }} className="w-full py-2.5 rounded-xl bg-[#f5f5f5] text-[#777] text-xs">恢复这个应用默认</button>
              </div>;
            })()}
          </>
        )}

        {section === 'lock' && (
          <LockScreenSection
            appearance={appearance}
            update={update}
            notify={notify}
          />
        )}

        {section === 'shell' && (
          <PhoneShellSection
            appearance={appearance}
            update={update}
            notify={notify}
          />
        )}

        {section === 'schemes' && (
          <>
            <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">APPEARANCE SCHEMES</div>
              <div className="mt-1 text-[9px] text-[#777069]">把当前整套外观保存下来，之后可以一键切换。</div>
            </div>
            <div className="flex gap-1.5">
              <input value={schemeName} onChange={event => setSchemeName(event.target.value)} placeholder="例如：London Film" className="flex-1 p-2.5 rounded-xl bg-white text-[9px] outline-none" />
              <button onClick={saveScheme} className="px-3 rounded-xl bg-[#292724] text-white text-[9px]"><Plus className="w-3 h-3 inline mr-1" />保存</button>
            </div>
            <div className="space-y-1.5">
              {schemes.map(scheme => (
                <div key={scheme.id} className="p-3 rounded-2xl bg-white/65 border border-black/5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <b className="text-[10px] block truncate">{scheme.name}</b>
                    <span className="text-[8px] text-[#8b8782]">{scheme.themeMode} · {scheme.appTitle}</span>
                  </div>
                  <button onClick={() => applyScheme(scheme.id)} className="px-2.5 py-1.5 rounded-lg bg-[#292724] text-white text-[8px]">应用</button>
                  {scheme.id !== 'default' && <button onClick={() => removeScheme(scheme.id)} className="w-7 h-7 rounded-lg bg-[#f5e8e4] text-[#8d4e4e] grid place-items-center"><Trash2 className="w-3 h-3" /></button>}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <div className="absolute left-3 right-3 bottom-3 z-20 p-2 rounded-2xl bg-white/90 backdrop-blur-xl border border-black/10 shadow-[0_8px_24px_rgba(0,0,0,.10)]">
        <button
          onClick={() => { const next = saveAppearance(appearance); setAppearance(next); window.dispatchEvent(new CustomEvent('sane333:appearance-changed')); notify('当前外观已保存'); }}
          className="w-full py-3 rounded-xl bg-[#292724] text-white text-[10px] font-semibold"
        >
          保存当前外观
        </button>
      </div>

      {notice && <div className="absolute bottom-5 left-4 right-4 z-30 p-2.5 rounded-xl bg-[#292724] text-white text-[9px] text-center">{notice}</div>}
    </div>
  );
}

// ========== 锁屏设置 Section ==========

// ========== 锁屏壁纸设定（可复用：主题页折叠卡片 + 锁屏 tab 共用） ==========

function LockWallpaperBlock({ appearance, update, notify }: {
  appearance: ReturnType<typeof readAppearance>;
  update: <K extends keyof ReturnType<typeof readAppearance>>(key: K, value: ReturnType<typeof readAppearance>[K]) => void;
  notify: (text: string) => void;
}) {
  const [wallpaperDraft, setWallpaperDraft] = useState(appearance.lockWallpaper || '');

  useEffect(() => {
    setWallpaperDraft(appearance.lockWallpaper || '');
  }, [appearance.lockWallpaper]);

  const handleWallpaperFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      notify('图片过大，请使用 4MB 以下');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = await compressImageDataUrl(String(reader.result || ''), 1024);
      setWallpaperDraft(dataUrl);
      update('lockWallpaper', dataUrl);
      notify('锁屏壁纸已更换');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const useMainWallpaper = () => {
    setWallpaperDraft(appearance.wallpaper);
    update('lockWallpaper', appearance.wallpaper);
    notify('锁屏壁纸已与主屏幕同步');
  };

  const clearWallpaper = () => {
    setWallpaperDraft('');
    update('lockWallpaper', '');
    notify('锁屏壁纸已清除');
  };

  const presetWallpapers = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
  ];

  return (
    <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
      <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">锁屏壁纸</div>
      {wallpaperDraft ? (
        <div className="relative h-28 w-full overflow-hidden rounded-xl border border-black/5">
          <img src={wallpaperDraft} alt="锁屏壁纸" className="absolute inset-0 h-full w-full object-cover" />
          <button onClick={clearWallpaper} className="absolute right-1.5 top-1.5 px-2 py-0.5 rounded-full bg-black/60 text-white text-[8px]">移除</button>
        </div>
      ) : (
        <div className="h-20 w-full rounded-xl border border-dashed border-black/15 grid place-items-center text-[9px] text-[#999]">未设置锁屏壁纸（用主屏幕）</div>
      )}
      <div className="flex gap-1.5">
        <label className="flex-1 py-2 rounded-xl bg-white border border-black/5 text-[9px] text-center cursor-pointer">
          上传图片
          <input type="file" accept="image/*" className="hidden" onChange={handleWallpaperFile} />
        </label>
        <button onClick={useMainWallpaper} className="flex-1 py-2 rounded-xl bg-white border border-black/5 text-[9px]">同步主屏</button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {presetWallpapers.map(url => (
          <button
            key={url}
            onClick={() => { setWallpaperDraft(url); update('lockWallpaper', url); notify('锁屏壁纸已应用'); }}
            className="aspect-[9/16] rounded-lg overflow-hidden border border-black/5"
          >
            <img src={url} alt="preset" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function LockScreenSection({ appearance, update, notify }: {
  appearance: ReturnType<typeof readAppearance>;
  update: <K extends keyof ReturnType<typeof readAppearance>>(key: K, value: ReturnType<typeof readAppearance>[K]) => void;
  notify: (text: string) => void;
}) {
  const [passcodeDraft, setPasscodeDraft] = useState(appearance.lockPasscode || '');

  useEffect(() => {
    setPasscodeDraft(appearance.lockPasscode || '');
  }, [appearance.lockPasscode]);

  const toggleMethod = (method: 'swipe' | 'passcode' | 'fingerprint') => {
    const current = appearance.lockMethods;
    const next = current.includes(method)
      ? current.filter(item => item !== method)
      : [...current, method];
    // 至少保留一种
    const safe = next.length ? next : ['swipe' as const];
    update('lockMethods', safe);
  };

  const savePasscode = () => {
    const cleaned = passcodeDraft.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length < 4) {
      notify('密码至少 4 位数字');
      return;
    }
    update('lockPasscode', cleaned);
    if (!appearance.lockMethods.includes('passcode')) {
      update('lockMethods', [...appearance.lockMethods.filter(item => item !== 'swipe'), 'passcode']);
    }
    setPasscodeDraft(cleaned);
    notify('锁屏密码已设置');
  };

  const clearPasscode = () => {
    setPasscodeDraft('');
    update('lockPasscode', '');
    update('lockMethods', appearance.lockMethods.filter(item => item !== 'passcode'));
    notify('锁屏密码已清除');
  };

  return (
    <>
      <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
        <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">LOCK SCREEN</div>
        <div className="mt-1 text-[12px] font-semibold">锁屏外观与解锁方式</div>
        <div className="mt-1 text-[9px] text-[#777069] leading-relaxed">iOS 风格布局：居中大号时间、底部小滑条上滑解锁。可选密码 / 指纹 / 上滑。</div>
      </div>

      {/* 锁屏风格 */}
      <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
        <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">时间样式</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ['ios-large', 'iOS 大号', '居中 96px'],
            ['classic', '经典数字', '居中 64px'],
          ].map(([value, label, desc]) => (
            <button
              key={value}
              onClick={() => update('lockStyle', value as 'ios-large' | 'classic')}
              className={appearance.lockStyle === value
                ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
                : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
            >
              <div className="text-[10px] font-semibold">{label}</div>
              <div className={appearance.lockStyle === value ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 锁屏壁纸 */}
      <LockWallpaperBlock appearance={appearance} update={update} notify={notify} />

      {/* 解锁方式 */}
      <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
        <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">解锁方式</div>
        <div className="space-y-1.5">
          {[
            { key: 'swipe', label: '上滑解锁', desc: '屏幕底部小滑条上滑' },
            { key: 'passcode', label: '密码解锁', desc: '4-6 位数字密码' },
            { key: 'fingerprint', label: '指纹解锁', desc: 'Touch ID 模拟' },
          ].map(item => {
            const active = appearance.lockMethods.includes(item.key as 'swipe' | 'passcode' | 'fingerprint');
            return (
              <button
                key={item.key}
                onClick={() => toggleMethod(item.key as 'swipe' | 'passcode' | 'fingerprint')}
                className={active
                  ? 'w-full p-2.5 rounded-xl bg-[#292724] text-white text-left flex items-center gap-2'
                  : 'w-full p-2.5 rounded-xl bg-white/80 border border-black/5 text-left flex items-center gap-2'}
              >
                <div className={active ? 'w-7 h-7 rounded-full bg-white/15 grid place-items-center' : 'w-7 h-7 rounded-full bg-[#f0ede7] grid place-items-center'}>
                  {item.key === 'swipe' && <ChevronDown className="w-3.5 h-3.5 -rotate-180" />}
                  {item.key === 'passcode' && <Copy className="w-3.5 h-3.5" />}
                  {item.key === 'fingerprint' && <Lock className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold">{item.label}</div>
                  <div className={active ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>{item.desc}</div>
                </div>
                <div className={active ? 'w-5 h-5 rounded-full bg-white text-[#292724] grid place-items-center text-[10px] font-bold' : 'w-5 h-5 rounded-full border border-black/15'}>
                  {active && '✓'}
                </div>
              </button>
            );
          })}
        </div>
        <div className="text-[8px] leading-relaxed text-[#777069]">优先级：密码 &gt; 指纹 &gt; 上滑。指纹仅在未设置密码时可用。</div>
      </div>

      {/* 密码设置 */}
      <div className="p-3 rounded-2xl bg-white/65 border border-black/5 space-y-2">
        <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">锁屏密码</div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={passcodeDraft}
          onChange={event => setPasscodeDraft(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="4-6 位数字"
          className="w-full p-2.5 rounded-xl bg-white text-[11px] outline-none tracking-[0.4em] text-center"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={savePasscode} className="py-2 rounded-xl bg-[#292724] text-white text-[9px]">保存密码</button>
          <button onClick={clearPasscode} className="py-2 rounded-xl bg-white border border-black/5 text-[#8d4e4e] text-[9px]">清除密码</button>
        </div>
        <div className="text-[8px] leading-relaxed text-[#777069]">密码以明文存于浏览器本地（仅用于演示）。</div>
      </div>
    </>
  );
}

// ========== 手机外形 Section ==========

function PhoneShellSection({ appearance, update, notify }: {
  appearance: ReturnType<typeof readAppearance>;
  update: <K extends keyof ReturnType<typeof readAppearance>>(key: K, value: ReturnType<typeof readAppearance>[K]) => void;
  notify: (text: string) => void;
}) {
  const shells: Array<{ key: 'modern' | 'classic-round' | 'classic-square'; label: string; desc: string; preview: React.ReactNode }> = [
    {
      key: 'modern',
      label: 'iPhone X+ · 全面屏',
      desc: '底部细横线指示，点击返回主屏幕',
      preview: (
        <div className="relative h-32 w-20 rounded-[14px] border border-black/10 bg-gradient-to-b from-white/80 to-white/40 grid place-items-center">
          <div className="text-[7px] text-[#777]">MODERN</div>
          <div className="absolute bottom-1.5 w-9 h-[3px] rounded-full bg-[#222]" />
        </div>
      ),
    },
    {
      key: 'classic-round',
      label: 'iPhone 8 · 圆形 Home',
      desc: '底部圆 Home 键，圆形有边框',
      preview: (
        <div className="relative h-32 w-20 rounded-[14px] border border-black/10 bg-gradient-to-b from-white/80 to-white/40 grid place-items-end pb-2">
          <div className="w-7 h-7 rounded-full border-2 border-[#666]" />
        </div>
      ),
    },
    {
      key: 'classic-square',
      label: 'iPhone 5/SE · 方形 Home',
      desc: '底部方形 Home 键',
      preview: (
        <div className="relative h-32 w-20 rounded-[14px] border border-black/10 bg-gradient-to-b from-white/80 to-white/40 grid place-items-end pb-2">
          <div className="w-6 h-6 rounded-md border-2 border-[#666]" />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
        <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">PHONE SHELL</div>
        <div className="mt-1 text-[12px] font-semibold">手机外形</div>
        <div className="mt-1 text-[9px] text-[#777069] leading-relaxed">切换手机外观：全面屏、经典圆形 Home、经典方形 Home。Home 键点击会直接返回主屏幕。</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {shells.map(shell => {
          const active = appearance.phoneShell === shell.key;
          return (
            <button
              key={shell.key}
              onClick={() => { update('phoneShell', shell.key); notify('外形已切换：' + shell.label); }}
              className={active ? 'p-3 rounded-2xl bg-[#292724] text-white' : 'p-3 rounded-2xl bg-white/65 border border-black/5'}
            >
              <div className="grid place-items-center mb-2">{shell.preview}</div>
              <div className="text-[9px] font-semibold leading-tight">{shell.label}</div>
              <div className={active ? 'mt-1 text-[7px] text-white/65 leading-relaxed' : 'mt-1 text-[7px] text-[#777069] leading-relaxed'}>{shell.desc}</div>
            </button>
          );
        })}
      </div>

      {/* 手机外框开关 */}
      <div className="p-3 rounded-2xl bg-white/65 border border-black/5">
        <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">PHONE FRAME</div>
        <div className="mt-1 text-[11px] font-semibold">手机外框</div>
        <div className="mt-0.5 mb-2 text-[8px] text-[#777069] leading-relaxed">关掉后不渲染外框，只按网页大小显示内容。</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { update('showPhoneFrame', true); notify('已显示手机外框'); }}
            className={appearance.showPhoneFrame !== false
              ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
              : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
          >
            <div className="text-[10px] font-semibold">显示</div>
            <div className={appearance.showPhoneFrame !== false ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
              带边框的手机
            </div>
          </button>
          <button
            type="button"
            onClick={() => { update('showPhoneFrame', false); notify('已隐藏手机外框'); }}
            className={appearance.showPhoneFrame === false
              ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
              : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
          >
            <div className="text-[10px] font-semibold">隐藏</div>
            <div className={appearance.showPhoneFrame === false ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
              纯网页模式
            </div>
          </button>
        </div>
      </div>

      {/* 顶部状态栏开关 */}
      <div className="p-3 rounded-2xl bg-white/65 border border-black/5">
        <div className="text-[9px] font-mono tracking-[1.5px] text-[#8b8782]">STATUS BAR</div>
        <div className="mt-1 text-[11px] font-semibold">顶部状态栏</div>
        <div className="mt-0.5 mb-2 text-[8px] text-[#777069] leading-relaxed">时间 · Wi-Fi · 电量。关掉后顶部不再显示。</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { update('showStatusBar', true); notify('已显示状态栏'); }}
            className={appearance.showStatusBar !== false
              ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
              : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
          >
            <div className="text-[10px] font-semibold">显示</div>
            <div className={appearance.showStatusBar !== false ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
              时间 / Wi-Fi / 电量
            </div>
          </button>
          <button
            type="button"
            onClick={() => { update('showStatusBar', false); notify('已隐藏状态栏'); }}
            className={appearance.showStatusBar === false
              ? 'p-2.5 rounded-xl bg-[#292724] text-white text-left'
              : 'p-2.5 rounded-xl bg-white/80 border border-black/5 text-left'}
          >
            <div className="text-[10px] font-semibold">隐藏</div>
            <div className={appearance.showStatusBar === false ? 'mt-0.5 text-[7px] text-white/65' : 'mt-0.5 text-[7px] text-[#8b8782]'}>
              顶部更干净
            </div>
          </button>
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-white/65 border border-black/5">
        <div className="text-[8px] leading-relaxed text-[#777069]">
          外形变化只影响屏幕底部 Home 区域。其他地方（锁屏、App、外观、字体、壁纸）都跟外形解耦，可以自由搭配。
        </div>
      </div>
    </>
  );
}
