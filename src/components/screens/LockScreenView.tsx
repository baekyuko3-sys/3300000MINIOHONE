import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Camera, Flashlight, Lock, ChevronUp } from 'lucide-react';
import type { ThemeMode } from '../../types';
import { readAppearance } from '../../store/appearance';

interface LockScreenViewProps {
  themeMode: ThemeMode;
  onUnlock: () => void;
  onOpenNotifications?: () => void;
}

export function LockScreenView({ themeMode, onUnlock }: LockScreenViewProps) {
  const [now, setNow] = useState(new Date());
  const [appearance] = useState(() => readAppearance());
  const [flashlightOn, setFlashlightOn] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const isDark = themeMode === 'dark-luxury';
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const weekdayDate = now.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    touchStartY.current = event.clientY;
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (touchStartY.current !== null && touchStartY.current - event.clientY > 48) onUnlock();
    touchStartY.current = null;
  };

  const wallpaper = appearance.wallpaper;
  const wallpaperIsImage = !!wallpaper && (wallpaper.startsWith('data:image/') || wallpaper.startsWith('https://') || wallpaper.startsWith('http://') || wallpaper.startsWith('blob:'));

  return (
    <div
      className="absolute inset-0 z-[30] flex h-full select-none flex-col overflow-hidden text-white"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onDoubleClick={onUnlock}
      style={{
        background: wallpaperIsImage
          ? `linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.04) 35%, rgba(0,0,0,.48) 100%), url("${wallpaper}") center / cover no-repeat`
          : isDark
            ? 'linear-gradient(160deg, #1a2630 0%, #354b5a 42%, #101923 100%)'
            : 'linear-gradient(160deg, #8eb3c6 0%, #c8d9e0 36%, #829eaf 70%, #334d60 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.08), transparent 32%, rgba(0,0,0,.1) 58%, rgba(0,0,0,.28))' }} />
      <div className="relative z-10 flex items-center justify-center pt-[14px]">
        <div className="flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md">
          <Lock className="h-3 w-3" strokeWidth={2.2} />
          <span>已锁定</span>
        </div>
      </div>

      <div className="relative z-10 mt-[42px] text-center">
        <div className="text-[13px] font-semibold tracking-[.1px] text-white/95 drop-shadow-sm">{weekdayDate}</div>
        <div className="mt-1 text-[76px] font-light leading-[.98] tracking-[-4px] tabular-nums drop-shadow-sm">{time}</div>
      </div>

      <div className="relative z-10 mt-7 flex justify-center px-5">
        <div className="w-full max-w-[310px] rounded-[20px] border border-white/20 bg-white/15 px-4 py-3.5 shadow-lg backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-white/80">
            <div className="grid h-5 w-5 place-items-center rounded-[6px] bg-white/90 text-[9px] font-bold text-[#4d6877]">小</div>
            <span>小手机</span>
            <span className="ml-auto font-normal text-white/65">现在</span>
          </div>
          <div className="mt-2 text-[12px] font-semibold">你的私人空间</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-white/80">上滑解锁，继续使用小手机。</div>
        </div>
      </div>

      <div className="relative z-10 mt-auto px-8 pb-8">
        <div className="mb-7 flex items-center justify-between">
          <button type="button" aria-label="手电筒" onClick={() => setFlashlightOn(value => !value)} className={`grid h-[46px] w-[46px] place-items-center rounded-full border border-white/20 backdrop-blur-xl transition ${flashlightOn ? 'bg-white text-[#27333a]' : 'bg-black/25 text-white'}`}>
            <Flashlight className="h-[19px] w-[19px]" />
          </button>
          <button type="button" aria-label="解锁手机" onClick={onUnlock} className="flex flex-col items-center gap-1.5 text-white/90">
            <ChevronUp className="h-5 w-5 animate-bounce" />
            <span className="text-[10px] tracking-wide">上滑解锁</span>
          </button>
          <button type="button" aria-label="相机" onClick={onUnlock} className="grid h-[46px] w-[46px] place-items-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-xl">
            <Camera className="h-[19px] w-[19px]" />
          </button>
        </div>
        <div className="mx-auto h-[5px] w-[118px] rounded-full bg-white/90 shadow-sm" />
      </div>
    </div>
  );
}
