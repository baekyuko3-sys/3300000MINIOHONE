import { Cloud, Sun, Moon, CloudRain } from 'lucide-react';
import { WidgetConfig, ThemeMode } from '../../types';

interface WeatherWidgetProps {
  config: WidgetConfig;
  themeMode: ThemeMode;
}

export function WeatherWidget({ config, themeMode }: WeatherWidgetProps) {
  const isDark = themeMode === 'dark-luxury';

  return (
    <div className={`w-full h-full p-3.5 rounded-3xl relative overflow-hidden flex flex-col justify-between border transition-all ${
      isDark 
        ? 'bg-gradient-to-br from-[#1e2330]/90 to-[#141822]/90 border-white/10 text-white shadow-lg' 
        : 'bg-gradient-to-br from-white/90 to-white/60 border-neutral-200/60 text-neutral-800 shadow-sm'
    } backdrop-blur-xl group hover:scale-[1.02]`}>
      
      {/* Subtle background ambient light */}
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full blur-xl pointer-events-none ${
        isDark ? 'bg-indigo-500/20' : 'bg-sky-400/20'
      }`} />

      {/* Top: City & Condition Icon */}
      <div className="flex items-start justify-between relative z-10">
        <div>
          <span className="text-[11px] font-medium tracking-tight opacity-80 block">
            {config.weatherCity}
          </span>
          <span className="text-2xl font-bold tracking-tighter leading-none mt-0.5 block font-mono">
            {config.weatherTemp}
          </span>
        </div>
        <div className={`p-1.5 rounded-2xl ${isDark ? 'bg-white/10 text-amber-200' : 'bg-sky-100 text-sky-600'}`}>
          {isDark ? (
            <Moon className="w-5 h-5 fill-amber-200/40" />
          ) : (
            <Sun className="w-5 h-5 text-amber-500 fill-amber-400/50" />
          )}
        </div>
      </div>

      {/* Bottom: Details & High/Low */}
      <div className="relative z-10 pt-2 border-t border-current/10 flex items-center justify-between text-[10px]">
        <span className="font-medium truncate opacity-90">{config.weatherCondition}</span>
        <span className="font-mono opacity-70 tracking-tight">{config.weatherHighLow}</span>
      </div>
    </div>
  );
}
