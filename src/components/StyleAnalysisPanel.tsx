import { useState } from 'react';
import { 
  Sparkles, Layers, Palette, LayoutGrid, CheckCircle2, 
  Copy, Check, AlertTriangle, Eye, ShieldCheck, Heart 
} from 'lucide-react';
import { ThemeMode } from '../types';
import { THEME_CONFIGS } from '../data/mockData';

interface StyleAnalysisPanelProps {
  currentTheme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
}

export function StyleAnalysisPanel({ currentTheme, onSelectTheme }: StyleAnalysisPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6 text-neutral-200">
      
      {/* Critique & Core Revelation Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-neutral-900 via-[#13141a] to-neutral-950 border border-neutral-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-mono border border-amber-500/30">
            深度纠偏与设计重构
          </span>
          <span className="text-xs text-neutral-400">基于最新 3 张官方系统全案设计板</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-3 font-serif-sc">
          为什么之前的插件会“丑”？你真正追求的是：<br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-rose-300">
            「北欧极简 · IG高质感 · 模块化克制桌面」
          </span>
        </h2>

        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-sans">
          你发来的最新全案展示板（《小手机 UI 设计》《我的小手机 Your Personal Phone》）直接揭示了最关键的设计痛点：
          <strong>你讨厌的是市面上那些花哨、杂乱、堆砌卡通贴纸和劣质花体的“假手账插件”！</strong>
          在真正高级的小手机主页中，小组件（插件）必须遵循 <strong>iOS Human Interface + 北欧极简 / IG 杂志感</strong> 的严格数学法则。
        </p>
      </div>

      {/* 3 Reference Theme Presets from the User's Board */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white tracking-wide uppercase font-mono flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-amber-400" />
            参考画板中的 3 大高质感调色板（点击立即切换手机）
          </h3>
          <span className="text-[11px] text-neutral-400">点击切换主屏幕</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Preset 1 */}
          <div
            onClick={() => onSelectTheme('dark-luxury')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              currentTheme === 'dark-luxury'
                ? 'bg-neutral-800/90 border-amber-400 shadow-md ring-1 ring-amber-400/50'
                : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-white font-serif-sc">
                ① 暗夜高级黑
              </span>
              <span className="text-[10px] text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded">
                图1全案
              </span>
            </div>
            <div className="text-[11px] text-amber-200/90 font-mono mb-1">
              Dark Velvet & London Rain
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              炭黑底色、大本钟夜雨、Ethan深情立绘、高通透深色毛玻璃卡片。
            </p>
          </div>

          {/* Preset 2 */}
          <div
            onClick={() => onSelectTheme('nordic-light')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              currentTheme === 'nordic-light'
                ? 'bg-neutral-800/90 border-amber-300 shadow-md ring-1 ring-amber-300/50'
                : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-white font-serif-sc">
                ② 北欧暖阳米白
              </span>
              <span className="text-[10px] text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded">
                图2全案
              </span>
            </div>
            <div className="text-[11px] text-amber-200/90 font-mono mb-1">
              Nordic Cream & Sun
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              燕麦奶白、黄金日光、手写微便签组件、清雅白底圆角图标。
            </p>
          </div>

          {/* Preset 3 */}
          <div
            onClick={() => onSelectTheme('ocean-breeze')}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              currentTheme === 'ocean-breeze'
                ? 'bg-neutral-800/90 border-sky-400 shadow-md ring-1 ring-sky-400/50'
                : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-sm text-white font-serif-sc">
                ③ IG冷淡蓝海
              </span>
              <span className="text-[10px] text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded">
                图3全案
              </span>
            </div>
            <div className="text-[11px] text-sky-200/90 font-mono mb-1">
              IG Ocean & Clean Wind
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              旧金山晴空、浪花与微风、22°天气大字、极简线描扁平图标。
            </p>
          </div>
        </div>
      </div>

      {/* The 4 Principles of Non-Ugly Widgets */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase font-mono flex items-center gap-1.5">
          <LayoutGrid className="w-4 h-4 text-amber-400" />
          解密画板：真正高阶的“小手机插件”长什么样？
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          
          {/* Rule 1 */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold flex items-center justify-center text-xs">
                1
              </span>
              <h4 className="font-bold text-white text-xs">
                严谨的 iOS 2x2 模块化比例（杜绝杂乱异形）
              </h4>
            </div>
            <p className="text-neutral-300 leading-relaxed">
              你看参考图里的主屏顶部：永远是<strong>标准并排的两个大正方形（Square Widget）</strong>。左边是严谨的天气卡片，右边是文学便签卡片。没有乱七八糟的倾斜角度和贴纸堆砌，呼吸感极佳。
            </p>
          </div>

          {/* Rule 2 */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-mono font-bold flex items-center justify-center text-xs">
                2
              </span>
              <h4 className="font-bold text-white text-xs">
                高定字体排印（大字温度 + 衬线亲笔签名）
              </h4>
            </div>
            <p className="text-neutral-300 leading-relaxed">
              天气组件使用<strong>超大字号无衬线数字（18° / 22°）</strong>配上极轻量的高低温区间；便签组件使用<strong>宋体/古典衬线（Serif）排印角色金句</strong>，右下角带有精细的「— Ethan」，高级感油然而生。
            </p>
          </div>

          {/* Rule 3 */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold flex items-center justify-center text-xs">
                3
              </span>
              <h4 className="font-bold text-white text-xs">
                4×2 统一圆角微凸图标系统（Squircle Icons）
              </h4>
            </div>
            <p className="text-neutral-300 leading-relaxed">
              图标不再是色彩斑斓的大杂烩，而是采用<strong>统一圆角（Squircle）、高统一微渐变底色，搭配纤细现代的线条图标</strong>。包括：信息、电话、相册、动态、音乐、备忘录、日历、世界书。
            </p>
          </div>

          {/* Rule 4 */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 font-mono font-bold flex items-center justify-center text-xs">
                4
              </span>
              <h4 className="font-bold text-white text-xs">
                通透磨砂玻璃与高光边缘（Backdrop Blur）
              </h4>
            </div>
            <p className="text-neutral-300 leading-relaxed">
              小组件背景拥有 <code>backdrop-blur-xl</code>（毛玻璃深度模糊）与 <code>border-white/10</code> 的高精细极细边框，能若隐若现地透出背后的伦敦大本钟雨景或加州海浪壁纸。
            </p>
          </div>

        </div>
      </div>

      {/* Complete OS Architecture Overview from the Boards */}
      <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 space-y-3">
        <h3 className="text-sm font-semibold text-white font-mono flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          画板揭示的完整“小手机系统宇宙”（你可以在左侧手机里逐一体验）
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">🔒 锁屏界面</div>
            <div className="text-neutral-400 mt-0.5">Ethan 专属通知横幅预览</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">📱 主桌面</div>
            <div className="text-neutral-400 mt-0.5">天气 + 语录便签 + 4x2图标</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">💬 消息中心</div>
            <div className="text-neutral-400 mt-0.5">多角色未读红点与会话列表</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">🎙️ 聊天界面</div>
            <div className="text-neutral-400 mt-0.5">语音条 0:12、图片、CoT思维链</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">👤 角色中心</div>
            <div className="text-neutral-400 mt-0.5">28岁/185cm/处女座、此刻模样</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">✨ 朋友圈动态</div>
            <div className="text-neutral-400 mt-0.5">程凛与林予的日常随笔与九宫格</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">🎵 音乐播放器</div>
            <div className="text-neutral-400 mt-0.5">Midnight in London 大黑胶唱片</div>
          </div>
          <div className="p-2 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="font-bold text-white">📝 备忘手记</div>
            <div className="text-neutral-400 mt-0.5">灵感碎片、写作计划与日常</div>
          </div>
        </div>
      </div>

      {/* Prompt recipe for generating this exact Nordic Minimalist look */}
      <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 space-y-2 text-xs">
        <div className="flex justify-between items-center text-neutral-400 font-mono text-[10px]">
          <span>【为你定制的准确 Prompt：生成这种高级北欧 IG 风壁纸与素材】</span>
          <button
            onClick={() => copyText('High-end minimalist iPhone aesthetic wallpaper, dark moody cinematic rainy London Big Ben through vintage car window, amber streetlamps, quiet atmospheric noir, ultra-clean composition, 35mm film grain, Leica M11 aesthetic, 9:16 aspect ratio.', 'prompt-exact')}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300"
          >
            {copiedKey === 'prompt-exact' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedKey === 'prompt-exact' ? '已复制' : '复制Prompt'}</span>
          </button>
        </div>
        <code className="text-neutral-300 text-[11px] font-mono leading-relaxed block bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
          High-end minimalist iPhone aesthetic wallpaper, dark moody cinematic rainy London Big Ben through vintage car window, amber streetlamps, quiet atmospheric noir, ultra-clean composition, 35mm film grain, 9:16 aspect ratio.
        </code>
      </div>

    </div>
  );
}
