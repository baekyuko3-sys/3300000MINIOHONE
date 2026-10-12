import { ThemeMode } from '../../types';

interface HomeCustomizeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
}

export function HomeCustomizeSheet({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}: HomeCustomizeSheetProps) {
  if (!isOpen) return null;

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="absolute inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-end animate-in fade-in duration-200"
    >
      <div className="w-full p-[18px_22px_28px] rounded-[30px_30px_0_0] bg-[#f2eee7] shadow-[0_-20px_60px_rgba(30,25,20,.16)] text-[#242323] font-sans border-t border-white/60">
        <div className="w-10 h-1 rounded-full bg-[#c1bbb3] mx-auto mb-4" />
        
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] font-bold tracking-tight">主页与小组件自定义</h3>
          <span className="text-[11px] text-[#8b8782] font-mono">SANE333 EDITION</span>
        </div>

        {/* Theme presets switcher */}
        <div className="mb-4">
          <span className="text-[11px] text-[#8b857e] block mb-1.5 font-medium">主题色板预设</span>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => onSelectTheme('nordic-light')}
              className={`p-2 rounded-xl border text-center transition-all ${
                currentTheme === 'nordic-light'
                  ? 'bg-white border-[#8b7560] font-bold shadow-xs'
                  : 'bg-white/60 border-neutral-300 text-neutral-600'
              }`}
            >
              胶片原色
            </button>
            <button
              onClick={() => onSelectTheme('dark-luxury')}
              className={`p-2 rounded-xl border text-center transition-all ${
                currentTheme === 'dark-luxury'
                  ? 'bg-white border-[#8b7560] font-bold shadow-xs'
                  : 'bg-white/60 border-neutral-300 text-neutral-600'
              }`}
            >
              暗夜胶片
            </button>
            <button
              onClick={() => onSelectTheme('ocean-breeze')}
              className={`p-2 rounded-xl border text-center transition-all ${
                currentTheme === 'ocean-breeze'
                  ? 'bg-white border-[#8b7560] font-bold shadow-xs'
                  : 'bg-white/60 border-neutral-300 text-neutral-600'
              }`}
            >
              海蓝胶片
            </button>
          </div>
        </div>

        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between py-2.5 border-b border-[rgba(40,36,31,.12)]">
            <span className="text-[#8b857e]">壁纸质感</span>
            <b className="font-semibold cursor-pointer text-[#8b7560]">纸性质感 + 胶片噪点 (已开启)</b>
          </div>
          <div className="flex justify-between py-2.5 border-b border-[rgba(40,36,31,.12)]">
            <span className="text-[#8b857e]">小组件排版</span>
            <b className="font-semibold cursor-pointer text-[#8b7560]">双格天气 + 亲笔便签 + 音乐栏</b>
          </div>
          <div className="flex justify-between py-2.5 border-b border-[rgba(40,36,31,.12)]">
            <span className="text-[#8b857e]">拍立得贴纸</span>
            <b className="font-semibold cursor-pointer text-[#8b7560]">右倾 5° · 洛杉矶 21:06</b>
          </div>
          <div className="flex justify-between py-2.5 border-b border-[rgba(40,36,31,.12)]">
            <span className="text-[#8b857e]">应用图标系统</span>
            <b className="font-semibold cursor-pointer text-[#8b7560]">统一圆角微凸 + 莫兰迪底色</b>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="mt-4 w-full h-11 rounded-[14px] bg-[#292724] text-white text-sm font-medium hover:bg-black transition-colors"
        >
          完成
        </button>
      </div>
    </div>
  );
}
