import { ArrowLeft, Search, Mail, CheckCheck } from 'lucide-react';
import { ScreenType } from '../../types';

interface InboxScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
  onSelectChat: (charId: string) => void;
}

export function InboxScreenView({ onNavigate, onSelectChat }: InboxScreenViewProps) {
  const letters: Array<{ id: string; name: string; unread: number; date: string; location: string; snippet: string }> = [];
  return (
    <div 
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      {/* Paper Noise */}
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.85)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-white/40 border border-white/60 backdrop-blur-md grid place-items-center text-xs hover:bg-white/70 active:scale-95 transition-all text-[#242323]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">
              POSTAL DESK · CORRESPONDENCE
            </div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">
              私密信函 · 联系人
            </h2>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#8b7560] border border-[rgba(139,117,96,.3)] px-2 py-0.5 rounded-full">
          MAILBOX
        </div>
      </div>

      {/* Letters List */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar text-xs">
        {letters.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectChat(item.id)}
            className="p-3.5 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.14)] shadow-xs hover:bg-[#e4dfd6] active:scale-98 transition-all cursor-pointer flex items-center gap-3.5"
          >
            {/* Avatar Stamp */}
            <div 
              className="w-10 h-10 rounded-full shrink-0 relative overflow-hidden shadow-xs border border-white/40"
              style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
            >
              <div className="absolute w-[16px] h-[18px] rounded-full bg-[#e1d2c0] left-[12px] top-[7px]" />
              {item.unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#9b625b] text-white text-[8px] font-bold flex items-center justify-center">
                  {item.unread}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-serif font-bold text-xs text-[#242323]">{item.name}</span>
                <span className="text-[8px] font-mono text-[#8b8782]">{item.date}</span>
              </div>
              <div className="text-[8px] font-mono text-[#8b7560] mt-0.5">
                {item.location}
              </div>
              <p className="text-[11px] text-[#55504a] truncate mt-1 font-serif-sc">
                {item.snippet}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">
        SANE333 MAIL DESK · ROLL 024 THREADS
      </div>
    </div>
  );
}
