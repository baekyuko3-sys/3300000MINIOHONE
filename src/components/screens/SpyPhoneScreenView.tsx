import { ScreenType } from '../../types';
import { ArrowLeft, Lock, ShieldAlert } from 'lucide-react';

interface SpyPhoneScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
}

export function SpyPhoneScreenView({ onNavigate }: SpyPhoneScreenViewProps) {
  return (
    <div
      className="relative w-full h-full flex flex-col select-none overflow-hidden"
      style={{ background: 'var(--screen, #ffffff)', color: 'var(--ink, #242323)' }}
    >
      <div className="absolute inset-0 opacity-[0.03] bg-paper-noise pointer-events-none" />
      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 grid place-items-center text-[#1a1a1a]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-bold tracking-tight text-[#1a1a1a]">查手机</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-[#8e8b86] font-mono border border-neutral-200">EMPTY</span>
            </div>
            <div className="text-[9px] text-[#8e8b86] font-mono tracking-wider mt-0.5">
              PRIVATE DEVICE · 尚未绑定角色
            </div>
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-neutral-100 text-[#888] grid place-items-center">
          <Lock className="w-3.5 h-3.5" />
        </div>
      </header>

      <div className="relative z-10 flex-1 grid place-items-center px-8 text-center">
        <div>
          <div className="mx-auto w-14 h-14 rounded-full border border-neutral-200 bg-neutral-50 grid place-items-center text-[#aaa]">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="mt-4 font-serif text-base font-bold text-[#333]">暂无可查看内容</div>
          <div className="mt-2 text-[10px] leading-relaxed text-[#999]">
            当前手机没有预置任何角色或私人设备数据。<br />
            导入角色后，这里才会出现对应的手机内容。
          </div>
        </div>
      </div>
    </div>
  );
}
