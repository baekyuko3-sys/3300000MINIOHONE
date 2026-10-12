import { useState } from 'react';
import { Search, Plus, Sparkles, ChevronRight, MessageSquare, Disc, X } from 'lucide-react';

interface LineHomeScreenProps {
  onSelectChat: (name: string) => void;
  onGoToListTab: () => void;
}

export function LineHomeScreen({ onSelectChat, onGoToListTab }: LineHomeScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const allContacts: Array<{ name: string; subtitle: string; time: string; avatar: string }> = [];

  const searchResults = searchQuery.trim()
    ? allContacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar bg-[#F7F5F0] text-[#282421] select-none font-sans">
      
      {/* 1. Header */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden shadow-2xs">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"
              alt="avatar"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="font-semibold text-sm text-[#282421] leading-tight">Sane333</div>
            <div className="text-[11px] text-[#8E877F] font-normal mt-0.5">Good evening.</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 text-[#5C554E]">
          <button 
            onClick={() => document.getElementById('home-search-bar')?.focus()}
            className="p-1 hover:text-black transition-colors"
          >
            <Search className="w-4 h-4 stroke-[1.8]" />
          </button>
          <button className="p-1 hover:text-black transition-colors">
            <Plus className="w-4 h-4 stroke-[1.8]" />
          </button>
        </div>
      </div>

      {/* 2. Cinematic Banner: "Better things are coming." */}
      <div className="px-5 py-2">
        <div className="relative h-[116px] rounded-2xl overflow-hidden shadow-2xs">
          <img
            src="https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=600&q=80"
            alt="paris"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover brightness-[0.78] contrast-[0.95]"
          />
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white font-serif text-[17px] leading-[1.3] drop-shadow-sm">
            Better things<br />are coming.
          </div>
        </div>
      </div>

      {/* 3. Pure Minimalist Search Bar (已彻底去除好友/群组/标签/keep 4个图标，也彻底去除了杂乱快捷词) */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#EFECE5] text-[#8E877F] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#DCD6CC] shadow-2xs transition-all">
          <Search className="w-4 h-4 text-[#8E877F] shrink-0" />
          <input
            id="home-search-bar"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索联系人与聊天记录..."
            className="w-full text-xs bg-transparent border-0 outline-none placeholder-[#8E877F] font-sans text-[#282421]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-0.5 text-[#8E877F] hover:text-black">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Main Body: Real Search Results when typing, OR Cinematic Daily Journal when empty */}
      <div className="px-5 pb-6 flex-1">
        {searchQuery.trim() ? (
          /* Search Results */
          <div className="divide-y divide-[#EAE6DE] bg-white rounded-2xl p-2 border border-[#E8E4DA] shadow-2xs animate-in fade-in duration-150">
            <div className="px-2.5 py-1.5 text-[10px] text-[#8E877F] font-mono uppercase">
              搜索结果 ({searchResults.length})
            </div>
            {searchResults.length > 0 ? (
              searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectChat(item.name)}
                  className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-[#F7F5F0] rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 shadow-2xs">
                      <img src={item.avatar} alt={item.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-[#282421]">{item.name}</div>
                      <div className="text-[11px] text-[#8E877F] mt-0.5">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#8E877F]">{item.time}</span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-[#8E877F]">
                未搜到与“{searchQuery}”相关的联系人
              </div>
            )}
          </div>
        ) : (
          /* Pure, aesthetic, cinematic cards (matching the reference album/vinyl cards in Image 1 Screen 4) */
          <div className="space-y-4 pt-1">
            
            {/* Daily Mood & Inspiration Card */}
            <div className="p-4 rounded-2xl bg-white border border-[#E8E4DA] shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B5746] font-semibold">
                  DAILY ARCHIVE · 今日寄语
                </span>
                <span className="text-[10px] text-[#8E877F] font-mono">21:46</span>
              </div>
              <p className="font-serif text-[13.5px] leading-relaxed text-[#282421] italic">
                “生活不仅是赶路，更是凝视当下的每一个瞬间。”
              </p>
              <div className="flex items-center justify-between pt-1 border-t border-[#F2EFE8] text-[10.5px] text-[#8E877F]">
                <span>London · Rainy Night · 16°C</span>
                <span className="font-serif">Vol. 024</span>
              </div>
            </div>

            {/* Quick Entrance to Friends List */}
            <div 
              onClick={onGoToListTab}
              className="p-3.5 rounded-2xl bg-[#EFECE5] hover:bg-[#EAE6DE] transition-colors cursor-pointer flex items-center justify-between shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white grid place-items-center text-[#5C554E] shadow-2xs">
                  <MessageSquare className="w-4 h-4 stroke-[1.8]" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-[#282421]">进入好友列表</div>
                  <div className="text-[10px] text-[#8E877F]">共 9 位联系人与群聊 · 2 条未读</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E877F]" />
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
