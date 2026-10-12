import { 
  MessageSquare, Phone, Image as ImageIcon, Sparkles, 
  Music, FileText, Calendar as CalendarIcon, BookOpen, Compass, Mail, Settings, User
} from 'lucide-react';
import { ThemeMode, ScreenType } from '../../types';
import { THEME_CONFIGS } from '../../data/mockData';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { QuoteWidget } from '../widgets/QuoteWidget';

interface HomeScreenViewProps {
  themeMode: ThemeMode;
  onNavigate: (screen: ScreenType) => void;
}

export function HomeScreenView({ themeMode, onNavigate }: HomeScreenViewProps) {
  const currentConfig = THEME_CONFIGS[themeMode];
  const isDark = themeMode === 'dark-luxury';

  return (
    <div className="h-full flex flex-col justify-between p-4 relative select-none overflow-hidden">
      {/* Background wallpaper */}
      <div 
        className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-500"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 100%), url('${currentConfig.wallpaperUrl}')`
        }}
      />

      {/* Main Content (Widgets + Apps) */}
      <div className="relative z-10 space-y-4 pt-1">
        
        {/* Top Widgets Grid (2x2 modular blocks - Weather & Character Quote) */}
        <div className="grid grid-cols-2 gap-3 h-32">
          <WeatherWidget config={currentConfig.widgets} themeMode={themeMode} />
          <QuoteWidget config={currentConfig.widgets} themeMode={themeMode} />
        </div>

        {/* 4x2 App Icons Grid (Clean Scandinavian / Minimalist Squircle Icons) */}
        <div className="grid grid-cols-4 gap-y-4 gap-x-2 pt-2 text-center text-xs">
          
          {/* App 1: Messages */}
          <div 
            onClick={() => onNavigate('inbox')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center relative shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <MessageSquare className="w-5 h-5 text-emerald-500" />
              {/* Unread Badge */}
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow">
                2
              </span>
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              信息
            </span>
          </div>

          {/* App 2: Character Profile */}
          <div 
            onClick={() => onNavigate('character-profile')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <User className="w-5 h-5 text-indigo-400" />
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              角色中心
            </span>
          </div>

          {/* App 3: Gallery */}
          <div 
            onClick={() => onNavigate('gallery')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <ImageIcon className="w-5 h-5 text-amber-500" />
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              相册
            </span>
          </div>

          {/* App 4: Moments */}
          <div 
            onClick={() => onNavigate('moments')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <Sparkles className="w-5 h-5 text-rose-400" />
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              动态
            </span>
          </div>

          {/* App 5: Music */}
          <div 
            onClick={() => onNavigate('music')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <Music className="w-5 h-5 text-purple-400" />
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              音乐
            </span>
          </div>

          {/* App 6: Notes */}
          <div 
            onClick={() => onNavigate('notes')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              备忘录
            </span>
          </div>

          {/* App 7: Calendar */}
          <div 
            onClick={() => onNavigate('calendar')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <span className="text-[7px] font-bold text-red-500 uppercase leading-none">SAT</span>
              <span className="text-sm font-bold leading-tight font-mono">20</span>
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              日历
            </span>
          </div>

          {/* App 8: World Book */}
          <div 
            onClick={() => onNavigate('world-book')}
            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${currentConfig.iconBg} group-hover:scale-105 transition-all`}>
              <BookOpen className="w-5 h-5 text-sky-500" />
            </div>
            <span className={`text-[11px] mt-1.5 font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
              世界书
            </span>
          </div>

        </div>

        {/* Pagination Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Bottom Frosted Glass Dock Bar (Iconic 4-App Dock) */}
      <div className={`relative z-10 p-2.5 rounded-[30px] border flex items-center justify-around transition-all ${currentConfig.dockBg}`}>
        <button 
          onClick={() => onNavigate('inbox')}
          className="p-2.5 rounded-2xl hover:scale-110 active:scale-95 transition-all"
          title="消息中心"
        >
          <Compass className="w-5 h-5 text-sky-400" />
        </button>

        <button 
          onClick={() => onNavigate('chat')}
          className="p-2.5 rounded-2xl hover:scale-110 active:scale-95 transition-all relative"
          title="与 Ethan 对话"
        >
          <MessageSquare className="w-5 h-5 text-emerald-400" />
          <span className="absolute 0 top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
        </button>

        <button 
          onClick={() => onNavigate('character-profile')}
          className="p-2.5 rounded-2xl hover:scale-110 active:scale-95 transition-all"
          title="角色中心"
        >
          <Phone className="w-5 h-5 text-amber-400" />
        </button>

        <button 
          onClick={() => onNavigate('notes')}
          className="p-2.5 rounded-2xl hover:scale-110 active:scale-95 transition-all"
          title="备忘录"
        >
          <Mail className="w-5 h-5 text-indigo-400" />
        </button>
      </div>
    </div>
  );
}
