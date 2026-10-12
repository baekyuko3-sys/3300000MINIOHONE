import { Home, Bookmark, MessageSquare, Settings, ChevronRight, Music, Cloud } from 'lucide-react';

interface LineProfileViewProps {
  onNavigateHome: () => void;
}

export function LineProfileView({ onNavigateHome }: LineProfileViewProps) {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar bg-white text-[#111111] select-none text-xs pb-8 font-sans">
      
      {/* 1. Top Cover Banner */}
      <div className="relative mb-12">
        <div className="h-36 w-full overflow-hidden bg-neutral-800">
          <img
            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80"
            alt="coastal twilight"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover brightness-90"
          />
        </div>

        {/* Circular Avatar overlapping cover */}
        <div className="absolute left-6 -bottom-7 w-15 h-15 rounded-full overflow-hidden border-2 border-white shadow-md bg-white">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"
            alt="Sane333"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* 2. Identity info & Edit button */}
      <div className="px-6 flex items-start justify-between">
        <div>
          <h2 className="font-bold text-lg text-[#111111] leading-tight">
            Sane333
          </h2>
          <p className="text-[11px] text-[#8E8E93] mt-0.5">
            Good evening.
          </p>
        </div>

        <button className="px-3.5 py-1 rounded-full border border-[#E5E5EA] bg-white text-[11px] text-[#111111] shadow-2xs hover:bg-[#F2F2F6]">
          编辑
        </button>
      </div>

      {/* 3. Navigation Menu Rows on Pure White */}
      <div className="px-6 pt-5 space-y-2">
        {[
          { label: '我的主页', icon: Home },
          { label: '我的收藏', icon: Bookmark },
          { label: '我的动态', icon: MessageSquare },
          { label: '设置', icon: Settings },
        ].map((item, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-2xl bg-[#F9F9FB] border border-[#F0F0F2] shadow-2xs flex items-center justify-between cursor-pointer hover:bg-[#F2F2F6] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white grid place-items-center text-[#111111] shadow-2xs">
                <item.icon className="w-4 h-4 stroke-[1.8]" />
              </div>
              <span className="font-medium text-xs text-[#111111]">
                {item.label}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A0A0A5]" />
          </div>
        ))}
      </div>

      {/* 4. 个人资料 */}
      <div className="px-6 pt-5 space-y-3">
        <span className="font-bold text-xs text-[#111111] block">
          个人资料
        </span>

        <div className="p-4 rounded-2xl bg-[#F9F9FB] border border-[#F0F0F2] shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cloud className="w-4 h-4 text-[#111111]" />
              <span className="text-xs text-[#444444]">状态消息</span>
            </div>
            <span className="text-[11px] text-[#8E8E93]">生活很普通 但很喜欢 ☁</span>
          </div>

          <div className="border-t border-[#EAEAEF] pt-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Music className="w-4 h-4 text-[#111111]" />
              <span className="text-xs text-[#444444]">背景音乐</span>
            </div>
            <span className="text-[11px] text-[#8E8E93]">The 11th Hour - James Morrison</span>
          </div>
        </div>

        {/* Handwritten signature stamp */}
        <div className="text-right pt-2 pr-2">
          <span className="font-serif italic text-sm text-[#E0533C] opacity-90 inline-block">
            Small steps make big changes.
          </span>
        </div>
      </div>

      {/* Exit back to Phone Desktop */}
      <div className="px-6 pt-5">
        <button
          onClick={onNavigateHome}
          className="w-full py-2.5 rounded-full border border-[#E5E5EA] bg-[#F2F2F6] hover:bg-[#EBEBEF] text-xs text-[#111111] text-center transition-colors font-medium"
        >
          返回小手机桌面
        </button>
      </div>

    </div>
  );
}
