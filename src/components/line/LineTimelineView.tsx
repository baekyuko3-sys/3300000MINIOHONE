import { Camera } from 'lucide-react';

export function LineTimelineView() {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar bg-white text-[#111111] select-none text-xs font-sans">
      <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-[#F0F0F2] sticky top-0 bg-white z-10">
        <h1 className="font-bold text-xl text-[#111111] tracking-tight">朋友圈</h1>
        <button className="p-1 text-[#555555]" title="发布动态">
          <Camera className="w-5 h-5 stroke-[1.8]" />
        </button>
      </div>
      <div className="py-20 px-6 text-center">
        <div className="text-[9px] font-mono tracking-[1.6px] text-[#aaa]">EMPTY TIMELINE</div>
        <div className="mt-2 font-serif text-[15px] text-[#333]">还没有朋友圈动态</div>
        <div className="mt-1 text-[10px] text-[#999]">你的第一条动态会从这里开始。</div>
      </div>
    </div>
  );
}
