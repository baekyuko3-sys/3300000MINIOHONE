import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  HomeWidget, WidgetSize, WIDGET_CATALOG, WIDGET_DEFAULTS,
  getHomeWidgets, saveHomeWidgets, addHomeWidget, removeHomeWidget, updateHomeWidget
} from '../../store/homeWidgets';
import type { ThemeMode } from '../../types';
import { Sun, Moon, Cloud, CloudRain, CloudSnow, Zap } from 'lucide-react';

// ============= 大小尺寸配置 =============
const SIZE_CONFIG: Record<WidgetSize, { cols: number; rows: number; className: string }> = {
  small: { cols: 2, rows: 2, className: 'w-24 h-24' },
  medium: { cols: 4, rows: 2, className: 'w-[calc(200%+12px)] h-24' },
  large: { cols: 4, rows: 4, className: 'w-[calc(200%+12px)] h-[calc(200%+32px)]' },
};

// ============= 单个小组件视图 =============

interface WidgetViewProps {
  widget: HomeWidget;
  themeMode: ThemeMode;
  isEditing?: boolean;
  onUpdate?: (updates: Partial<HomeWidget>) => void;
}

function WidgetView({ widget, themeMode, isEditing, onUpdate }: WidgetViewProps) {
  const isDark = themeMode === 'dark-luxury';
  const sizeClass = SIZE_CONFIG[widget.size]?.className || SIZE_CONFIG.medium.className;
  
  const bgClass = isDark
    ? 'bg-gradient-to-br from-[#1e2330]/90 to-[#141822]/90 border-white/10 text-white'
    : 'bg-white/90 to-white/60 border-neutral-200/60 text-neutral-800';

  const renderContent = () => {
    switch (widget.type) {
      case 'weather':
        return <WeatherWidgetContent widget={widget} isDark={isDark} />;
      case 'clock':
        return <ClockWidgetContent widget={widget} isDark={isDark} />;
      case 'calendar':
        return <CalendarWidgetContent widget={widget} isDark={isDark} />;
      case 'photos':
        return <PhotosWidgetContent widget={widget} isDark={isDark} />;
      case 'battery':
        return <BatteryWidgetContent widget={widget} isDark={isDark} />;
      case 'health':
        return <HealthWidgetContent widget={widget} isDark={isDark} />;
      case 'notes':
        return <NotesWidgetContent widget={widget} isDark={isDark} />;
      case 'reminders':
        return <RemindersWidgetContent widget={widget} isDark={isDark} />;
      case 'music':
        return <MusicWidgetContent widget={widget} isDark={isDark} />;
      case 'shortcuts':
        return <ShortcutsWidgetContent widget={widget} isDark={isDark} />;
      case 'system-status':
        return <SystemStatusWidgetContent widget={widget} isDark={isDark} />;
      case 'timer':
        return <TimerWidgetContent widget={widget} isDark={isDark} />;
      case 'world-clock':
        return <WorldClockWidgetContent widget={widget} isDark={isDark} />;
      default:
        return <div className="p-2 text-xs">未知小组件</div>;
    }
  };

  return (
    <div
      className={`
        ${sizeClass} rounded-3xl border backdrop-blur-xl shadow-lg
        ${bgClass}
        transition-all duration-200
        ${isEditing ? 'hover:shadow-xl cursor-move ring-2 ring-blue-400/50 ring-offset-2' : 'hover:scale-[1.02]'}
        relative overflow-hidden
      `}
      style={{
        left: `${widget.x}%`,
        top: `${widget.y}%`,
        gridColumn: `span ${SIZE_CONFIG[widget.size]?.cols || 4}`,
        gridRow: `span ${SIZE_CONFIG[widget.size]?.rows || 2}`,
      }}
    >
      {renderContent()}
      
      {/* 删除按钮 - 编辑模式下显示 */}
      {isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeHomeWidget(widget.id);
          }}
          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-lg z-50 hover:bg-red-600 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ============= 各个小组件内容 =============

function WeatherWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const city = widget.config.city as string || 'Beijing';
  const [temp, setTemp] = useState(22);
  
  useEffect(() => {
    const interval = setInterval(() => setTemp(t => t + (Math.random() > 0.5 ? 1 : -1)), 5000);
    return () => clearInterval(interval);
  }, []);

  const conditions = ['晴', '多云', '阴', '小雨', '大雪'];
  const condition = conditions[Math.floor(Math.random() * conditions.length)];
  
  const WeatherIcon = condition === '晴' ? Sun : condition === '阴' ? Cloud : condition.includes('雨') ? CloudRain : CloudSnow;

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] opacity-80">{city}</div>
          <div className="text-2xl font-bold font-mono">{temp}°</div>
        </div>
        <div className={`p-1.5 rounded-2xl ${isDark ? 'bg-white/10' : 'bg-sky-100'}`}>
          <WeatherIcon className={`w-5 h-5 ${isDark ? 'text-amber-200' : 'text-amber-500'}`} />
        </div>
      </div>
      <div className="text-[10px] opacity-70">{condition} · H {temp + 3}° L {temp - 4}°</div>
    </div>
  );
}

function ClockWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const cityName = widget.config.cityName as string || '现在';
  const showSeconds = widget.config.showSeconds as boolean || false;

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="text-[10px] opacity-70">{cityName}</div>
      <div className="text-2xl font-bold font-mono tracking-tight">
        {hours}:{minutes}
        {showSeconds && <span className="text-sm opacity-60">:{seconds}</span>}
      </div>
      <div className="text-[10px] opacity-60">
        {time.getFullYear()}/{String(time.getMonth() + 1).padStart(2, '0')}/{String(time.getDate()).padStart(2, '0')}
      </div>
    </div>
  );
}

function CalendarWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const now = new Date();
  const day = now.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[now.getDay()];

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="text-[10px] opacity-70">日历</div>
      <div className="text-4xl font-bold font-mono">{day}</div>
      <div className="text-[10px] opacity-60">星期{weekday}</div>
    </div>
  );
}

function PhotosWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const colors = ['from-rose-400', 'from-blue-400', 'from-emerald-400', 'from-purple-400', 'from-amber-400'];
  const gradient = colors[Math.floor(Math.random() * colors.length)];
  
  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradient} to-transparent flex items-center justify-center rounded-3xl`}>
      <div className="text-white/80 text-xs text-center p-4">
        <div className="text-2xl mb-2">🖼️</div>
        <div>{widget.config.albumName || '最近照片'}</div>
      </div>
    </div>
  );
}

function BatteryWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const [battery, setBattery] = useState(Math.floor(Math.random() * 40) + 50);
  const isLow = battery < 20;

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="flex items-center gap-2">
        <div className={`text-lg ${isLow ? 'text-red-500' : isDark ? 'text-emerald-400' : 'text-emerald-500'}`}>
          <Zap className="w-5 h-5" />
        </div>
        <span className="text-2xl font-bold">{battery}%</span>
      </div>
      <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
        <div 
          className={`h-full rounded-full transition-all ${isLow ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${battery}%` }}
        />
      </div>
    </div>
  );
}

function HealthWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const stats = [
    { icon: '👟', label: '步数', value: 8432, unit: '步' },
    { icon: '🔥', label: '卡路里', value: 486, unit: '千卡' },
    { icon: '⏰', label: '站立', value: 8, unit: '小时' },
  ];
  const stat = stats[Math.floor(Math.random() * stats.length)];

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="text-2xl">{stat.icon}</div>
      <div>
        <div className="text-xl font-bold">{stat.value}</div>
        <div className="text-[10px] opacity-60">{stat.label}</div>
      </div>
    </div>
  );
}

function NotesWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const colors: Record<string, string> = {
    yellow: 'bg-amber-100 border-amber-300',
    blue: 'bg-blue-100 border-blue-300',
    green: 'bg-emerald-100 border-emerald-300',
    pink: 'bg-pink-100 border-pink-300',
  };
  const color = widget.config.color as string || 'yellow';

  return (
    <div className={`w-full h-full p-3 border-2 rounded-2xl ${colors[color] || colors.yellow}`}>
      <div className="text-xs font-medium line-clamp-3">
        {widget.config.content || '点击编辑便签内容...'}
      </div>
    </div>
  );
}

function RemindersWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const items = ['买菜', '开会', '健身', '读书'];
  const count = (widget.config.count as number) || 3;

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="text-[10px] font-medium opacity-70">提醒事项</div>
      <div className="space-y-1">
        {items.slice(0, count).map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="w-3.5 h-3.5 rounded border border-current flex items-center justify-center" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function MusicWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const [progress, setProgress] = useState(35);
  
  useEffect(() => {
    const interval = setInterval(() => setProgress(p => p >= 100 ? 0 : p + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          🎵
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium truncate">夜曲</div>
          <div className="text-[9px] opacity-60 truncate">周杰伦</div>
        </div>
      </div>
      <div className="w-full bg-white/30 rounded-full h-1">
        <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function ShortcutsWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const shortcuts = [
    { icon: '💬', label: '信息' },
    { icon: '📷', label: '相机' },
    { icon: '🎵', label: '音乐' },
    { icon: '🖼️', label: '照片' },
  ];

  return (
    <div className="w-full h-full p-3 grid grid-cols-4 gap-2">
      {shortcuts.map((s, i) => (
        <div key={i} className="flex flex-col items-center justify-center gap-1">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${isDark ? 'bg-white/10' : 'bg-gray-100'}`}>
            {s.icon}
          </div>
          <span className="text-[8px] opacity-70">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function SystemStatusWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  return (
    <div className="w-full h-full p-3 flex items-center justify-around">
      <div className="text-center">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-500/30' : 'bg-blue-100'}`}>
          📶
        </div>
        <div className="text-[8px] mt-1 opacity-70">WiFi</div>
      </div>
      <div className="text-center">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-500/30' : 'bg-blue-100'}`}>
          🔵
        </div>
        <div className="text-[8px] mt-1 opacity-70">蓝牙</div>
      </div>
      <div className="text-center">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-white/10' : 'bg-gray-100'}`}>
          ✈️
        </div>
        <div className="text-[8px] mt-1 opacity-70">飞行</div>
      </div>
    </div>
  );
}

function TimerWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const minutes = (widget.config.minutes as number) || 25;
  const [remaining, setRemaining] = useState(minutes * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');

  return (
    <div className="w-full h-full p-3 flex flex-col justify-between">
      <div className="text-[10px] opacity-70">{widget.config.label || '专注时间'}</div>
      <div className="text-3xl font-bold font-mono text-center">{mins}:{secs}</div>
      <button 
        onClick={() => setIsRunning(!isRunning)}
        className={`text-[9px] py-1 px-3 rounded-full ${isDark ? 'bg-white/20' : 'bg-gray-200'}`}
      >
        {isRunning ? '暂停' : '开始'}
      </button>
    </div>
  );
}

function WorldClockWidgetContent({ widget, isDark }: { widget: HomeWidget; isDark: boolean }) {
  const cities = [
    { name: '北京', offset: 8 },
    { name: '纽约', offset: -5 },
    { name: '东京', offset: 9 },
    { name: '伦敦', offset: 0 },
  ];

  const getTime = (offset: number) => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const target = new Date(utc + offset * 3600000);
    return target.getHours().toString().padStart(2, '0') + ':' + target.getMinutes().toString().padStart(2, '0');
  };

  return (
    <div className="w-full h-full p-3 space-y-2">
      {cities.slice(0, 3).map((city, i) => (
        <div key={i} className="flex items-center justify-between text-[10px]">
          <span className="opacity-70">{city.name}</span>
          <span className="font-mono font-medium">{getTime(city.offset)}</span>
        </div>
      ))}
    </div>
  );
}

// ============= 小组件面板 - 添加/编辑小组件 =============

interface WidgetPanelProps {
  themeMode: ThemeMode;
  isOpen: boolean;
  onClose: () => void;
}

export function WidgetPanel({ themeMode, isOpen, onClose }: WidgetPanelProps) {
  const [selectedType, setSelectedType] = useState<any>(null);
  const [selectedSize, setSelectedSize] = useState<WidgetSize>('medium');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleAddWidget = () => {
    if (!selectedType) return;
    addHomeWidget(selectedType.type, selectedSize);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSelectedType(null);
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end justify-center" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl p-4 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        
        <h3 className="text-lg font-semibold mb-4">添加小组件</h3>
        
        {showSuccess && (
          <div className="mb-4 p-3 bg-emerald-100 text-emerald-700 rounded-xl text-center text-sm">
            ✅ 小组件已添加！长按桌面进入编辑模式调整位置
          </div>
        )}
        
        {/* 大小选择 */}
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">选择大小</div>
          <div className="grid grid-cols-3 gap-2">
            {(['small', 'medium', 'large'] as WidgetSize[]).map(size => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`p-2 rounded-xl text-xs ${
                  selectedSize === size 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}
              >
                {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
              </button>
            ))}
          </div>
        </div>
        
        {/* 小组件类型 */}
        <div className="grid grid-cols-3 gap-2">
          {WIDGET_CATALOG.map(widget => (
            <button
              key={widget.type}
              onClick={() => setSelectedType(widget)}
              className={`p-3 rounded-xl text-center ${
                selectedType?.type === widget.type
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              <div className="text-2xl mb-1">{widget.icon}</div>
              <div className="text-[10px]">{widget.nameZh}</div>
            </button>
          ))}
        </div>
        
        {/* 添加按钮 */}
        <button
          onClick={handleAddWidget}
          disabled={!selectedType}
          className={`w-full mt-4 py-3 rounded-xl font-medium ${
            selectedType
              ? 'bg-blue-500 text-white'
              : 'bg-gray-300 text-gray-500'
          }`}
        >
          添加到桌面
        </button>
      </div>
    </div>
  );
}

// ============= 可编辑的主屏幕小组件区域 =============

interface EditableWidgetsProps {
  themeMode: ThemeMode;
  isEditMode: boolean;
  onExitEdit: () => void;
}

export function EditableWidgets({ themeMode, isEditMode, onExitEdit }: EditableWidgetsProps) {
  const [widgets, setWidgets] = useState<HomeWidget[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWidgets(getHomeWidgets());
    const handleChange = () => setWidgets(getHomeWidgets());
    window.addEventListener('sane333:home-widgets-changed', handleChange);
    return () => window.removeEventListener('sane333:home-widgets-changed', handleChange);
  }, []);

  const handleMouseDown = (e: React.MouseEvent, widgetId: string) => {
    if (!isEditMode) return;
    e.preventDefault();
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const percentX = (e.clientX - rect.left) / rect.width * 100;
    const percentY = (e.clientY - rect.top) / rect.height * 100;
    
    setDragOffset({
      x: percentX - widget.x,
      y: percentY - widget.y,
    });
    setDragging(widgetId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const percentX = (e.clientX - rect.left) / rect.width * 100 - dragOffset.x;
    const percentY = (e.clientY - rect.top) / rect.height * 100 - dragOffset.y;
    
    updateHomeWidget(dragging, {
      x: Math.max(0, Math.min(70, percentX)),
      y: Math.max(0, Math.min(60, percentY)),
    });
  }, [dragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  if (widgets.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${isEditMode ? 'bg-black/20 rounded-2xl' : ''}`}
      onClick={() => isEditMode && onExitEdit()}
    >
      {widgets.map(widget => (
        <div
          key={widget.id}
          onMouseDown={(e) => handleMouseDown(e, widget.id)}
          onClick={(e) => e.stopPropagation()}
          className="absolute"
        >
          <WidgetView 
            widget={widget} 
            themeMode={themeMode}
            isEditing={isEditMode}
          />
        </div>
      ))}
      
      {isEditMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-xs">
          拖动小组件调整位置 · 点击删除
        </div>
      )}
    </div>
  );
}

export { WidgetView };
