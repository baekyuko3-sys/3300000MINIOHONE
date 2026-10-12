import { Feather, Heart } from 'lucide-react';
import { WidgetConfig, ThemeMode } from '../../types';

interface QuoteWidgetProps {
  config: WidgetConfig;
  themeMode: ThemeMode;
}

export function QuoteWidget({ config, themeMode }: QuoteWidgetProps) {
  const isDark = themeMode === 'dark-luxury';

  return (
    <div className={`w-full h-full p-3.5 rounded-3xl relative overflow-hidden flex flex-col justify-between border transition-all ${
      isDark 
        ? 'bg-gradient-to-br from-[#1c1d26]/90 to-[#12131b]/90 border-white/10 text-neutral-200 shadow-lg' 
        : 'bg-gradient-to-br from-white/95 to-[#faf7f2]/90 border-amber-900/10 text-neutral-800 shadow-sm'
    } backdrop-blur-xl group hover:scale-[1.02]`}>
      
      {/* Top micro kicker */}
      <div className="flex items-center justify-between text-[10px] opacity-70">
        <span className="font-mono tracking-wider flex items-center gap-1">
          <Feather className="w-3 h-3 text-amber-400" />
          MOMENT NOTE
        </span>
        <Heart className="w-3 h-3 text-rose-400/70 fill-rose-400/30" />
      </div>

      {/* Quote body in elegant serif */}
      <div className="my-auto py-1">
        <p className="text-[11px] leading-relaxed font-serif-sc line-clamp-3 italic opacity-90">
          {config.quoteContent}
        </p>
      </div>

      {/* Author signature */}
      <div className="text-right text-[10px] font-serif-cormorant font-semibold tracking-wider text-amber-400/90 pt-1 border-t border-current/10">
        {config.quoteAuthor}
      </div>
    </div>
  );
}
