import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { ScreenType, OfflineEvent } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';

export function CalendarScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [events] = usePersistentState<OfflineEvent[]>('phone:offline-events-cache', []);
  const now = new Date();
  const month = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }).toUpperCase();

  const visible = events.filter(event => ['pending', 'accepted', 'in-progress'].includes(event.status));

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.85)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center text-xs text-[#242323]">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">PRIVATE CALENDAR · EVENTS</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">日程 · Calendar</h2>
          </div>
        </div>
        <CalendarDays className="w-4 h-4 text-[#8b7560]" />
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
        <div className="rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] p-4">
          <div className="flex items-center justify-between">
            <button className="text-[#8b7560]"><ChevronLeft className="w-4 h-4" /></button>
            <div className="text-xs font-mono tracking-[1.2px] text-[#4e4943]">{month}</div>
            <button className="text-[#8b7560]"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[8px] font-mono text-[#8b8782]">
            {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, index) => {
              const day = index + 1;
              const isToday = day === now.getDate();
              return (
                <div key={day} className={`h-7 rounded-lg grid place-items-center text-[9px] ${isToday ? 'bg-[#292724] text-white' : 'text-[#59534d] bg-white/40'}`}>
                  {day}
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">STORY EVENTS · 已与线下邀约同步</div>

        {visible.map(event => (
          <button
            key={event.id}
            onClick={() => onNavigate('offline-story')}
            className="w-full text-left rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.12)] p-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="font-serif font-bold text-sm text-[#242323]">{event.title}</div>
              <span className="text-[8px] font-mono text-[#8b7560]">{event.time}</span>
            </div>
            <div className="mt-1 text-[10px] text-[#736c65] flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {event.location}
            </div>
            <div className="mt-2 text-[10px] text-[#5f5851]">{event.characterName} · {event.theme}</div>
          </button>
        ))}

        {!visible.length && (
          <div className="rounded-2xl border border-dashed border-[rgba(40,36,31,.18)] bg-white/35 p-6 text-center text-[#8b8782]">
            <div className="font-serif text-sm">目前没有待赴约剧情。</div>
            <div className="mt-1 text-[9px]">角色发来的邀约接受后会自动出现在这里。</div>
          </div>
        )}
      </div>

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">
        SANE333 PRIVATE CALENDAR · STORY SCHEDULE
      </div>
    </div>
  );
}
