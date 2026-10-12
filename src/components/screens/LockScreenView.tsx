import { useEffect, useState } from 'react';
import { ChevronUp, Lock } from 'lucide-react';
import { ThemeMode } from '../../types';

interface LockScreenViewProps {
  themeMode: ThemeMode;
  onUnlock: () => void;
  onOpenNotifications?: () => void;
}

export function LockScreenView({ themeMode, onUnlock }: LockScreenViewProps) {
  const isDark = themeMode === 'dark-luxury';
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <div
      className="h-full flex flex-col justify-between p-6 select-none relative overflow-hidden text-white"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #181715 0%, #302d28 100%)'
          : 'linear-gradient(180deg, #8c8174 0%, #c7bcae 100%)',
      }}
    >
      <div className="absolute inset-0 opacity-[0.08] bg-paper-noise pointer-events-none" />

      <div className="relative z-10 pt-8 text-center space-y-2">
        <Lock className="w-4 h-4 mx-auto opacity-80" />
        <div className="text-[54px] leading-none font-mono font-light tracking-[-2px]">{time}</div>
        <div className="text-xs font-medium tracking-[2px] text-white/75 uppercase">{date}</div>
      </div>

      <div className="relative z-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-[22px] border border-white/20 bg-white/10 backdrop-blur-xl grid place-items-center">
          <Lock className="w-6 h-6 text-white/80 stroke-[1.3]" />
        </div>
        <div className="mt-4 font-serif text-[17px]">私人设备</div>
        <div className="mt-1 text-[10px] font-mono tracking-[1.5px] text-white/55">NO NEW NOTIFICATIONS</div>
      </div>

      <button
        onClick={onUnlock}
        className="relative z-10 text-center cursor-pointer pb-2 hover:opacity-80 transition-opacity"
      >
        <ChevronUp className="w-5 h-5 mx-auto animate-bounce opacity-80" />
        <span className="text-xs tracking-wider text-white/80 font-mono">点击进入主屏幕</span>
      </button>
    </div>
  );
}
