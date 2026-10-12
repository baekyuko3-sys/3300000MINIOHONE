import { useState, useEffect, useRef } from 'react';
import { ScreenType } from '../../types';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getWorldUnreadCount } from '../../store/worldRuntime';
import { readAppearance, saveAppearance, type AppearanceScheme } from '../../store/appearance';

interface SaneHomeScreenViewProps {
  onNavigate: (screen: ScreenType) => void;
  onOpenSheet: () => void;
  onToggleTheme?: () => void;
}

export function SaneHomeScreenView({ onNavigate, onOpenSheet, onToggleTheme }: SaneHomeScreenViewProps) {
  const [currentPage, setCurrentPage] = useState<1 | 2>(1);
  const pageTouchStartX = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPhotoFlipped, setIsPhotoFlipped] = useState(false);
  const [isPhotoFlippedP2, setIsPhotoFlippedP2] = useState(false);
  const [cityIndex, setCityIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState('21:06');
  const [appearance, setAppearance] = useState<AppearanceScheme>(() => readAppearance());
  const [currentGreeting, setCurrentGreeting] = useState(() => readAppearance().greeting);
  const [currentDateNumber, setCurrentDateNumber] = useState('02');
  const [currentMonthString, setCurrentMonthString] = useState('OCTOBER · FRIDAY · 2026');
  const [archiveCap, setArchiveCap] = useState('PRIVATE ARCHIVE');
  const [worldUnread, setWorldUnread] = useState(0);

  type DesktopItem = { id: string; x: number; y: number };
  type DesktopPage = 1 | 2;

  const defaultPage1Layout: DesktopItem[] = [
    { id: 'widget-date', x: 26, y: 105 },
    { id: 'widget-photo', x: 260, y: 145 },
    { id: 'widget-weather', x: 26, y: 270 },
    { id: 'widget-note', x: 201, y: 270 },
    { id: 'widget-music', x: 26, y: 395 },
    { id: 'app-line', x: 32, y: 510 },
    { id: 'app-moments', x: 120, y: 510 },
    { id: 'app-music', x: 208, y: 510 },
    { id: 'app-offline-story', x: 296, y: 510 },
  ];
  const defaultPage2Layout: DesktopItem[] = [
    { id: 'widget-threads', x: 20, y: 220 },
    { id: 'app-threads', x: 18, y: 350 },
    { id: 'app-npc', x: 104, y: 350 },
    { id: 'app-group-presets', x: 190, y: 350 },
    { id: 'app-spy-phone', x: 276, y: 350 },
    { id: 'app-memory', x: 104, y: 440 },
    { id: 'app-studio', x: 190, y: 440 },
  ];

  const [desktopLayouts, setDesktopLayouts] = useState(() => readAppearance().desktopLayouts || { page1: {}, page2: {} });
  const [desktopHidden, setDesktopHidden] = useState(() => readAppearance().desktopHidden || { page1: [], page2: [] });
  const [desktopEditing, setDesktopEditing] = useState(false);
  const [draggingDesktopItem, setDraggingDesktopItem] = useState<string | null>(null);
  const [dragGuides, setDragGuides] = useState<{ x?: number; y?: number }>({});
  const dragStartRef = useRef<{ id: string; x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const getDefaultLayout = (page: DesktopPage) => page === 1 ? defaultPage1Layout : defaultPage2Layout;
  const pageKey = (page: DesktopPage) => page === 1 ? 'page1' : 'page2';
  const getLayout = (page: DesktopPage): DesktopItem[] => {
    const phone = typeof document !== 'undefined' ? document.querySelector('[data-sane333-home-viewport]') as HTMLElement | null : null;
    const width = phone?.clientWidth || 360;
    const height = phone?.clientHeight || 800;
    return getDefaultLayout(page).map(item => {
      const saved = desktopLayouts[pageKey(page)][item.id] || {};
      // Saved positions are user-owned: never auto-shift them during render.
      const merged = { ...item, ...saved };
      const metrics = itemMetrics(item.id);
      const dockSafeBottom = 132;
      return { ...merged, x: Math.max(8, Math.min(width - metrics.width - 8, merged.x)), y: Math.max(8, Math.min(height - dockSafeBottom - metrics.height, merged.y)) };
    });
  };

  const isHidden = (page: DesktopPage, id: string) => desktopHidden[pageKey(page)].includes(id);

  const itemMetrics = (id: string) => {
    if (id.startsWith('app-')) return { width: 64, height: 88 };
    if (id === 'widget-photo') return { width: 84, height: 106 };
    if (id === 'widget-music') return { width: 334, height: 84 };
    if (id === 'widget-threads') return { width: 320, height: 96 };
    if (id === 'widget-date') return { width: 220, height: 105 };
    if (id === 'widget-weather' || id === 'widget-note') return { width: 160, height: 112 };
    return { width: 155, height: 105 };
  };

  const overlaps = (a: DesktopItem, b: DesktopItem) => {
    const am = itemMetrics(a.id), bm = itemMetrics(b.id);
    return a.x < b.x + bm.width && a.x + am.width > b.x && a.y < b.y + bm.height && a.y + am.height > b.y;
  };

  const resolvePosition = (page: DesktopPage, moving: DesktopItem): DesktopItem => {
    const phone = document.querySelector('[data-sane333-home-viewport]') as HTMLElement | null;
    const width = phone?.clientWidth || 360;
    const height = phone?.clientHeight || 800;
    const metrics = itemMetrics(moving.id);
    const others = getLayout(page).filter(item => item.id !== moving.id && !isHidden(page, item.id));
    // Apple-like 8px grid plus edge/center snapping to nearby widgets and apps.
    const grid = 8;
    let x = Math.round(moving.x / grid) * grid;
    let y = Math.round(moving.y / grid) * grid;
    let guideX: number | undefined;
    let guideY: number | undefined;
    const snapThreshold = 9;
    for (const other of others) {
      const om = itemMetrics(other.id);
      const xPairs = [
        [x, other.x],
        [x + metrics.width / 2, other.x + om.width / 2],
        [x + metrics.width, other.x + om.width],
        [x, other.x + om.width],
        [x + metrics.width, other.x],
      ];
      for (const [movingEdge, otherEdge] of xPairs) {
        if (Math.abs(movingEdge - otherEdge) <= snapThreshold) {
          x += otherEdge - movingEdge; guideX = otherEdge; break;
        }
      }
      const yPairs = [
        [y, other.y],
        [y + metrics.height / 2, other.y + om.height / 2],
        [y + metrics.height, other.y + om.height],
        [y, other.y + om.height],
        [y + metrics.height, other.y],
      ];
      for (const [movingEdge, otherEdge] of yPairs) {
        if (Math.abs(movingEdge - otherEdge) <= snapThreshold) {
          y += otherEdge - movingEdge; guideY = otherEdge; break;
        }
      }
    }
    setDragGuides({ x: guideX, y: guideY });
    return {
      ...moving,
      x: Math.max(8, Math.min(width - metrics.width - 8, x)),
      y: Math.max(8, Math.min(height - 132 - metrics.height, y)),
    };
  };

  const saveDesktopLayout = (page: DesktopPage, next: DesktopItem[]) => {
    const key = pageKey(page);
    const saved = Object.fromEntries(next.map(item => [item.id, { x: item.x, y: item.y }]));
    const nextLayouts = { ...desktopLayouts, [key]: saved };
    setDesktopLayouts(nextLayouts);
    saveAppearance({ desktopLayouts: nextLayouts });
  };

  const moveDesktopItem = (page: DesktopPage, id: string, clientX: number, clientY: number) => {
    const phone = document.querySelector('[data-sane333-home-viewport]') as HTMLElement | null;
    const start = dragStartRef.current;
    if (!phone || !start || start.id !== id || isHidden(page, id)) return;
    const rect = phone.getBoundingClientRect();
    const raw = {
      id,
      x: clientX - rect.left - start.offsetX,
      y: clientY - rect.top - start.offsetY,
    };
    const next = getLayout(page).map(item => item.id === id ? resolvePosition(page, raw) : item);
    saveDesktopLayout(page, next);
  };

  const itemPosition = (page: DesktopPage, id: string) => getLayout(page).find(item => item.id === id) || getDefaultLayout(page).find(item => item.id === id)!;
  const resetDesktopLayout = (page: DesktopPage) => saveDesktopLayout(page, getDefaultLayout(page));

  const hideDesktopItem = (page: DesktopPage, id: string) => {
    const key = pageKey(page);
    const nextHidden = { ...desktopHidden, [key]: [...new Set([...desktopHidden[key], id])] };
    setDesktopHidden(nextHidden);
    saveAppearance({ desktopHidden: nextHidden });
  };

  const showAllDesktopItems = (page: DesktopPage) => {
    const key = pageKey(page);
    const nextHidden = { ...desktopHidden, [key]: [] };
    setDesktopHidden(nextHidden);
    saveAppearance({ desktopHidden: nextHidden });
  };

  const endDesktopDrag = () => {
    setDraggingDesktopItem(null);
    setDragGuides({});
    dragStartRef.current = null;
  };

  const beginDesktopDrag = (page: DesktopPage, id: string, event: ReactPointerEvent) => {
    if (!desktopEditing || isHidden(page, id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    dragStartRef.current = { id, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
  };

  const continueDesktopDrag = (page: DesktopPage, id: string, event: ReactPointerEvent) => {
    if (!desktopEditing || isHidden(page, id)) return;
    const start = dragStartRef.current;
    if (!start || start.id !== id) return;
    if (!draggingDesktopItem) {
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance < 8) return;
      setDraggingDesktopItem(id);
    }
    moveDesktopItem(page, id, event.clientX, event.clientY);
  };

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const h = d.getHours();
      const timeStr = `${p(h)}:${p(d.getMinutes())}`;
      setCurrentTime(timeStr);
      setCurrentDateNumber(p(d.getDate()));
      
      const monthName = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
      const weekDay = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      setCurrentMonthString(`${monthName} · ${weekDay} · ${d.getFullYear()}`);

      const customGreeting = readAppearance().greeting.trim();
      const greet = h < 12 ? 'GOOD MORNING' : h < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
      setCurrentGreeting(customGreeting || `${greet} · PRIVATE DEVICE`);
      setArchiveCap(`ARCHIVE ${p(d.getDate())}/${p(d.getMonth() + 1)}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);
    const refreshWorld = () => setWorldUnread(getWorldUnreadCount());
    refreshWorld();
    window.addEventListener('sane333:world-state-changed', refreshWorld);
    window.addEventListener('sane333:world-event', refreshWorld);
    return () => {
      clearInterval(timer);
      window.removeEventListener('sane333:world-state-changed', refreshWorld);
      window.removeEventListener('sane333:world-event', refreshWorld);
    };
  }, []);

  useEffect(() => {
    const openDesktopEditor = (event: Event) => {
      const page = (event as CustomEvent<{ page?: 1 | 2 }>).detail?.page;
      if (page === 1 || page === 2) setCurrentPage(page);
      setDesktopEditing(true);
    };
    window.addEventListener('sane333:open-desktop-editor', openDesktopEditor);
    return () => window.removeEventListener('sane333:open-desktop-editor', openDesktopEditor);
  }, []);

  useEffect(() => {
    const syncAppearance = () => {
      const next = readAppearance();
      setAppearance(next);
      setCurrentGreeting(next.greeting);
      setDesktopLayouts(next.desktopLayouts || { page1: {}, page2: {} });
      setDesktopHidden(next.desktopHidden || { page1: [], page2: [] });
    };
    window.addEventListener('sane333:appearance-changed', syncAppearance);
    return () => window.removeEventListener('sane333:appearance-changed', syncAppearance);
  }, []);

  const cities = [
    {
      city: appearance.widget.weatherCity,
      temp: appearance.widget.weatherTemp,
      sky: appearance.widget.weatherCondition,
      icon: '○',
      note: appearance.widget.weatherHighLow,
    },
  ];
  const currentCity = cities[cityIndex];

  const renderAppIcon = (key: string, symbol: string, className = 'w-6 h-6') => {
    const custom = appearance.appIcons[key];
    if (custom) {
      return <img src={custom} alt="" className={className + ' object-cover rounded-[18px]'} />;
    }
    return (
      <svg className={className}>
        <use href={'#' + symbol} />
      </svg>
    );
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none" onTouchStart={(e) => { pageTouchStartX.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const start = pageTouchStartX.current; const end = e.changedTouches[0]?.clientX ?? null; pageTouchStartX.current = null; if (desktopEditing || start === null || end === null) return; const dx = end - start; if (Math.abs(dx) < 55) return; setCurrentPage((page) => dx < 0 ? 2 : 1); }} style={{ background: 'var(--screen, #fff)', color: 'var(--ink, #242323)', backgroundImage: appearance.wallpaper ? `url(${appearance.wallpaper})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      
      {desktopEditing && <>
        <button onClick={() => resetDesktopLayout(currentPage)} className="absolute z-30 top-[70px] left-[18px] px-3 h-8 rounded-full bg-white/80 border border-black/5 text-[9px] font-mono text-[#777]">重置</button>
        <button onClick={() => setDesktopEditing(false)} className="absolute z-30 top-[70px] right-[18px] px-3 h-8 rounded-full bg-[#292724] text-white border border-[#292724] text-[9px] font-mono">完成整理</button>
        {dragGuides.x !== undefined && <div className="absolute z-20 top-0 bottom-[132px] border-l border-dashed border-[#b58c75]/80 pointer-events-none" style={{ left: dragGuides.x }} />}
        {dragGuides.y !== undefined && <div className="absolute z-20 left-0 right-0 border-t border-dashed border-[#b58c75]/80 pointer-events-none" style={{ top: dragGuides.y }} />}
      </>}
      {/* SVG Icon Definitions */}
      <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
          <symbol id="chat" viewBox="0 0 24 24"><path d="M20.5 12a8 8 0 0 1-11.6 7.1L4 20.2l1.2-4.4A8 8 0 1 1 20.5 12z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></symbol>
          <symbol id="book" viewBox="0 0 24 24"><path d="M5 5.5A2 2 0 0 1 7 3.5h11v15H7a2 2 0 0 0-2 2z" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M5 18.5V5.5M9 8h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="ig" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="16.8" cy="7.2" r=".7" fill="currentColor"/></symbol>
          <symbol id="music" viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="7" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="17" cy="16" r="2" fill="none" stroke="currentColor" strokeWidth="1.6"/></symbol>
          <symbol id="card" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="9" cy="11" r="2" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M6.5 16c.5-1.6 1.6-2.2 2.5-2.2s2 .6 2.5 2.2M14 10h3.5M14 13.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.5 5.3 3.5 8.5s-1 6.1-3.5 8.5c-2.5-2.4-3.5-5.3-3.5-8.5s1-6.1 3.5-8.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="look" viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.5 0 2-1 1.5-2.1-.5-1.1.2-2.4 1.5-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.7 3.5 12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="8" cy="11" r=".8" fill="currentColor"/><circle cx="11" cy="7.8" r=".8" fill="currentColor"/><circle cx="15" cy="8.5" r=".8" fill="currentColor"/></symbol>
          <symbol id="gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></symbol>
          <symbol id="threads" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c2.8 0 5.4-1.1 7.2-3l-1.5-1.5C16.2 19 14.2 20 12 20c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8c0 2.2-.9 4.1-2.4 5.3-1.1.9-2.5 1.2-3.8.9-1.8-.4-2.8-1.8-2.8-3.7V11c0-1.7-1.3-3-3-3s-3 1.3-3 3 1.3 3 3 3c1 0 1.9-.5 2.4-1.2v1.7c0 2.8 1.7 4.8 4.3 5.4 1.8.4 3.7-.1 5.2-1.3C21 16.9 22 14.5 22 12c0-5.5-4.5-10-10-10zm-1 10.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" fill="currentColor"/></symbol>
          <symbol id="spy" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="18" r="1" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M9.5 9h5M12 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></symbol>
          <symbol id="studio" viewBox="0 0 24 24"><path d="M12 3.5l1.8 5.7L19.5 11l-5.7 1.8L12 18.5l-1.8-5.7L4.5 11l5.7-1.8L12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round"/><circle cx="18.5" cy="5.5" r="1" fill="currentColor"/></symbol>
        </defs>
      </svg>

      {/* Pure White Background with subtle clean paper noise */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: appearance.wallpaper
          ? 'linear-gradient(180deg, rgba(255,255,255,.64) 0%, rgba(255,255,255,.78) 100%)'
          : `
            radial-gradient(circle at 75% 15%, rgba(245, 242, 236, 0.5) 0%, transparent 35%),
            linear-gradient(180deg, var(--screen, #ffffff) 0%, var(--screen, #ffffff) 100%)
          `
        }}
      >
        <div className="absolute inset-0 opacity-[0.03] bg-paper-noise" />
      </div>

      {/* Top Header Identity (Persists across pages) */}
      <div className="absolute z-10 top-[70px] left-[25px] right-[25px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => onNavigate('character-profile')}
            className="w-[45px] h-[45px] rounded-full cursor-pointer relative overflow-hidden shadow-[0_5px_18px_rgba(56,46,36,.18)] shrink-0"
            style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
            title="查看角色中心"
          >
            <div className="absolute w-[18px] h-[22px] rounded-full bg-[#e1d2c0] left-[13px] top-[8px]" />
            <div className="absolute w-[35px] h-[22px] rounded-[50%_50%_42%_42%] bg-[#51473f] left-[5px] top-[1px]" />
          </div>
          <div>
            <div className="text-[11px] text-[#8b8782] tracking-[0.5px] mb-0.5 font-mono">
              {currentPage === 1 ? currentGreeting : 'VAULT ARCHIVES · PAGE 02'}
            </div>
            <div className="text-[17px] font-[650] tracking-[0.2px] text-[var(--ink)]">
              {appearance.appTitle}
            </div>
          </div>
        </div>

        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('sane333:open-desktop-editor', { detail: { page: currentPage } }))}
          className="w-[35px] h-[35px] rounded-full bg-[var(--icon,rgba(248,245,239,.72))] border border-[var(--edge,rgba(255,255,255,.6))] backdrop-blur-md grid place-items-center text-base hover:scale-105 active:scale-95 transition-all text-[var(--ink)] shadow-xs"
          title="自由摆放 App 与小组件"
          aria-label="自由摆放 App 与小组件"
        >
          ⌘
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PAGE 1: 经典胶片主屏幕 (LINE + IG + 音乐 + 线下剧情) */}
      {/* ========================================================================= */}
      {currentPage === 1 && (
        <div className="animate-in fade-in duration-300">
          
          {/* Date & Literary Section */}
          <div className={`absolute z-10 ${desktopEditing ? "ring-1 ring-[#b7a59a]/45 rounded-xl cursor-grab active:cursor-grabbing touch-none" : ""}`} style={{ left: itemPosition(1, "widget-date").x, top: itemPosition(1, "widget-date").y }} onPointerDown={e=>beginDesktopDrag(1,"widget-date",e)} onPointerMove={e=>continueDesktopDrag(1,"widget-date",e)} onPointerUp={endDesktopDrag} onPointerCancel={endDesktopDrag}>
            <div className="font-serif text-[55px] leading-[0.9] font-normal tracking-[-3px] text-[var(--ink)]">
              {currentDateNumber}
            </div>
            <div className="text-[11px] text-[#8b8782] tracking-[2.4px] mt-3 font-mono">
              {currentMonthString}
            </div>
            <div className="mt-5 font-serif-sc text-[13px] leading-[1.8] text-[var(--sub,#68625b)] max-w-[205px]">
              {appearance.subtitle.split('\n').map((line, index) => <span key={index} className="block">{line}</span>)}
            </div>
          </div>

          {worldUnread > 0 && (
            <button onClick={() => onNavigate('chat')} className="absolute z-20 left-[26px] right-[26px] top-[266px] flex items-center justify-between px-3 py-2 rounded-full bg-white/75 border border-[rgba(40,36,31,.09)] shadow-[0_5px_18px_rgba(45,37,30,.05)] backdrop-blur-md text-[8px] font-mono text-[#6f685f]">
              <span>WORLD · 有新的世界动态</span>
              <span className="text-[#9b625b]">{worldUnread} NEW</span>
            </button>
          )}

          {/* Film Photo Polaroid pinned diagonally (Click to Flip!) */}
          <div 
            onClick={() => { if (!desktopEditing) setIsPhotoFlipped(!isPhotoFlipped); }}
            className={`absolute z-10 w-[84px] h-[106px] rotate-[4deg] p-[5px_5px_15px] bg-[var(--paper,#eee9df)] shadow-[0_7px_18px_rgba(45,37,30,.09)] opacity-90 cursor-pointer hover:rotate-0 hover:scale-105 transition-all group ${desktopEditing ? "ring-1 ring-[#b7a59a]/45 cursor-grab active:cursor-grabbing touch-none" : ""}`} style={{ left: itemPosition(1, "widget-photo").x, top: itemPosition(1, "widget-photo").y }} onPointerDown={e=>beginDesktopDrag(1,"widget-photo",e)} onPointerMove={e=>continueDesktopDrag(1,"widget-photo",e)} onPointerUp={endDesktopDrag} onPointerCancel={endDesktopDrag}
            title="点击翻转拍立得相纸"
          >
            {desktopEditing && <button onPointerDown={e=>e.stopPropagation()} onClick={()=>hideDesktopItem(1,'widget-photo')} className="absolute -right-2 -top-2 z-20 w-5 h-5 rounded-full bg-[#292724] text-white text-[10px]">×</button>}
            {isPhotoFlipped ? (
              <div className="h-[82px] p-1.5 bg-[#fbf9f5] border border-neutral-200/80 rounded flex flex-col justify-between text-left">
                <span className="text-[6px] font-mono text-[#8b8782]">MEMO</span>
                <p className="font-handwriting text-[8.5px] leading-tight text-[#8b7560]">
                  NO PRIVATE NOTE<br />
                  这里还没有私人便签。
                </p>
                <span className="font-handwriting text-[7px] text-[#9b625b] text-right">
                  EMPTY FRAME.
                </span>
              </div>
            ) : (
              <div 
                className="h-[82px] relative overflow-hidden filter contrast-[0.92] saturate-[0.68]"
                style={{
                  background: `
                    radial-gradient(circle at 70% 28%, rgba(230,215,190,.7), transparent 20%),
                    linear-gradient(135deg, #655d55, #b1a08e 48%, #5e5750)
                  `
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/40" />
                <span className="absolute left-[6px] top-[6px] text-white/85 text-[7px] tracking-[0.9px] font-mono">
                  EMPTY FRAME
                </span>
                <b className="absolute right-[6px] bottom-[5px] text-white font-serif text-[11px] font-normal">
                  {currentTime}
                </b>
              </div>
            )}
            <div className="absolute left-[5px] bottom-[3px] text-[7px] tracking-[0.8px] text-[#6f685f] whitespace-nowrap font-mono">
              {isPhotoFlipped ? 'CLICK FLIP' : archiveCap}
            </div>
          </div>

          {/* Widgets — each card has its own desktop position */}
          <div className="absolute inset-0 z-10 pointer-events-none">

            {/* Weather Card */}
            {!isHidden(1, 'widget-weather') && (
              <button
                style={{ left: itemPosition(1, 'widget-weather').x, top: itemPosition(1, 'widget-weather').y }}
                onPointerDown={e=>beginDesktopDrag(1,'widget-weather',e)}
                onPointerMove={e=>continueDesktopDrag(1,'widget-weather',e)}
                onPointerUp={endDesktopDrag}
                onPointerCancel={endDesktopDrag}
                onClick={() => { if (!desktopEditing) setCityIndex((prev) => (prev + 1) % cities.length); }}
                className={`pointer-events-auto absolute w-[160px] h-[112px] overflow-hidden border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[15px] shadow-[0_6px_22px_rgba(40,35,30,.045)] text-left cursor-pointer active:scale-98 transition-all ${desktopEditing ? 'ring-1 ring-[#b7a59a]/45 cursor-grab active:cursor-grabbing touch-none' : ''}`}
                title="点击切换城市天气"
              >
                {desktopEditing && <span onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();hideDesktopItem(1,'widget-weather')}} className="absolute -right-2 -top-2 z-20 w-5 h-5 rounded-full bg-[#292724] text-white text-[10px] grid place-items-center cursor-pointer">×</span>}
                <div className="absolute -right-7 -top-8 w-24 h-24 border border-[rgba(67,58,49,.09)] rounded-full pointer-events-none" />
                <div className="text-[10px] text-[#8b8782] tracking-[1.6px] font-mono">{currentCity.city}</div>
                <div className="flex items-end justify-between mt-3">
                  <div>
                    <div className="text-[27px] font-light tracking-[-1px] text-[var(--ink)] leading-none">{currentCity.temp}</div>
                    <div className="text-[9px] text-[#8b8782] tracking-[1px] mt-1 font-mono">{currentCity.sky}</div>
                    <div className="text-[8px] text-[#9b8f84] tracking-[.5px] mt-1 font-mono">{currentCity.note}</div>
                  </div>
                  <div className="text-[28px] text-[#8b7560] leading-none">{currentCity.icon}</div>
                </div>
              </button>
            )}

            {/* Private Memory Note */}
            {!isHidden(1, 'widget-note') && (
              <button
                style={{ left: itemPosition(1, 'widget-note').x, top: itemPosition(1, 'widget-note').y }}
                onPointerDown={e=>beginDesktopDrag(1,'widget-note',e)}
                onPointerMove={e=>continueDesktopDrag(1,'widget-note',e)}
                onPointerUp={endDesktopDrag}
                onPointerCancel={endDesktopDrag}
                onClick={() => { if (!desktopEditing) onNavigate('notes'); }}
                className={`pointer-events-auto absolute w-[160px] h-[112px] overflow-hidden border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[15px] shadow-[0_6px_22px_rgba(40,35,30,.045)] text-left cursor-pointer active:scale-98 transition-all ${desktopEditing ? 'ring-1 ring-[#b7a59a]/45 cursor-grab active:cursor-grabbing touch-none' : ''}`}
              >
                {desktopEditing && <span onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();hideDesktopItem(1,'widget-note')}} className="absolute -right-2 -top-2 z-20 w-5 h-5 rounded-full bg-[#292724] text-white text-[10px] grid place-items-center cursor-pointer">×</span>}
                <div className="text-[10px] text-[#8b8782] tracking-[1.6px] font-mono">NOTE</div>
                <div className="mt-3 font-serif text-[14px] leading-[1.35] text-[var(--ink)] line-clamp-2">{appearance.widget.quoteContent || '此刻正在发生'}</div>
                <div className="mt-1 text-[8px] text-[#8b8782] font-mono truncate">{appearance.widget.quoteAuthor || 'PRIVATE NOTE'}</div>
                {appearance.widget.anniversaryDays > 0 && <div className="absolute bottom-3 left-[15px] right-[15px] text-[7px] text-[#9b625b] font-mono truncate">{appearance.widget.anniversaryText} · DAY {appearance.widget.anniversaryDays}</div>}
              </button>
            )}

            {/* Music Player — independent full-width card */}
            {!isHidden(1, 'widget-music') && (
              <div
                style={{ left: itemPosition(1, 'widget-music').x, top: itemPosition(1, 'widget-music').y }}
                onPointerDown={e=>beginDesktopDrag(1,'widget-music',e)}
                onPointerMove={e=>continueDesktopDrag(1,'widget-music',e)}
                onPointerUp={endDesktopDrag}
                onPointerCancel={endDesktopDrag}
                className={`pointer-events-auto absolute w-[334px] h-[84px] border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl rounded-[21px] p-[15px] shadow-[0_6px_22px_rgba(40,35,30,.045)] flex items-center gap-3 transition-all relative ${desktopEditing ? 'ring-1 ring-[#b7a59a]/45 cursor-grab active:cursor-grabbing touch-none' : ''}`}
              >
                {desktopEditing && <span onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();hideDesktopItem(1,'widget-music')}} className="absolute -right-2 -top-2 z-20 w-5 h-5 rounded-full bg-[#292724] text-white text-[10px] grid place-items-center cursor-pointer">×</span>}
                <div onClick={() => { if (!desktopEditing) onNavigate('music'); }} className={`w-[54px] h-[54px] rounded-[13px] shrink-0 grid place-items-center text-white font-serif text-[21px] shadow-[0_5px_13px_rgba(40,32,26,.15)] cursor-pointer hover:scale-105 transition-transform ${isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''}`} style={{ background: 'linear-gradient(145deg, #9e9489, #38332f)' }}>♪</div>
                <div onClick={() => { if (!desktopEditing) onNavigate('music'); }} className="flex-1 min-w-0 cursor-pointer">
                  <b className="text-[13px] font-semibold text-[var(--ink)] truncate block">{appearance.widget.musicTitle}</b>
                  <p className="m-0 mt-1 text-[#8b8782] text-[10px] truncate font-mono">{appearance.widget.musicArtist}</p>
                </div>
                <button onClick={() => { if (!desktopEditing) setIsPlaying(!isPlaying); }} className="w-8 h-8 rounded-full bg-[#2d2b29] text-white grid place-items-center text-xs hover:scale-105 active:scale-95 transition-transform shrink-0" title={isPlaying ? "暂停" : "播放"}>{isPlaying ? 'Ⅱ' : '▶'}</button>
              </div>
            )}

          </div>

          {/* Page 1 Apps */}
          <section className="absolute z-10 inset-0 pointer-events-none">
            {[
              ['line','LINE','chat','bg-[#36332f] text-[#eee]','chat'],
              ['moments','IG','ig','bg-[#9b8068] text-white','moments'],
              ['music','音乐','music','bg-[var(--icon,rgba(248,245,239,.72))] text-[var(--ink)] border border-[var(--edge,rgba(255,255,255,.6))]','music'],
              ['offline-story','线下剧情','book','bg-[var(--icon,rgba(248,245,239,.72))] text-[var(--ink)] border border-[var(--edge,rgba(255,255,255,.6))]','offline-story'],
            ].map(([id,label,symbol,iconClass,screen]) => { if (isHidden(1,'app-'+id)) return null; const pos=itemPosition(1,'app-'+id); return <button key={id} onClick={()=>{if(!desktopEditing) onNavigate(screen as ScreenType)}} onPointerDown={e=>beginDesktopDrag(1,'app-'+id,e)} onPointerMove={e=>continueDesktopDrag(1,'app-'+id,e)} onPointerUp={endDesktopDrag} onPointerCancel={endDesktopDrag} className={`absolute pointer-events-auto flex flex-col items-center gap-2 text-[10px] tracking-[0.4px] text-[var(--sub,#68625b)] select-none touch-none ${desktopEditing?'cursor-grab active:cursor-grabbing':''}`} style={{left:pos.x,top:pos.y}}>
                <div className={`w-[64px] h-[64px] rounded-[21px] shadow-[0_6px_18px_rgba(52,43,34,.055)] grid place-items-center ${iconClass}`}>{renderAppIcon(id,symbol,'w-6 h-6')}{id==='line'&&worldUnread>0&&<span className="absolute -top-1 right-[-2px] w-4 h-4 rounded-full bg-[#9b625b] text-white text-[9px] font-bold flex items-center justify-center">{worldUnread>99?'99+':worldUnread}</span>}</div><span className="font-medium">{label}</span>
              </button>; })}
          </section>

        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 2: 自由桌面 */}
      {/* ========================================================================= */}
      {currentPage === 2 && (
        <div className="absolute inset-0 animate-in fade-in duration-300">
          {!isHidden(2, 'widget-threads') && (() => {
            const item = itemPosition(2, 'widget-threads');
            return (
              <div
                className={`absolute z-10 w-[320px] h-[96px] rounded-[20px] border border-[var(--edge,rgba(255,255,255,.6))] bg-[var(--glass,rgba(248,246,242,.72))] backdrop-blur-2xl p-[14px_16px] shadow-[0_6px_22px_rgba(40,35,30,.045)] ${desktopEditing ? 'ring-1 ring-[#b7a59a]/45 cursor-grab active:cursor-grabbing touch-none' : 'cursor-pointer'}`}
                style={{ left: item.x, top: item.y }}
                onPointerDown={e => desktopEditing ? beginDesktopDrag(2, 'widget-threads', e) : onNavigate('threads')}
                onPointerMove={e => continueDesktopDrag(2, 'widget-threads', e)}
                onPointerUp={() => { setDraggingDesktopItem(null); dragStartRef.current = null; }}
                onPointerCancel={() => { setDraggingDesktopItem(null); dragStartRef.current = null; }}
              >
                {desktopEditing && <button onPointerDown={e => e.stopPropagation()} onClick={() => hideDesktopItem(2, 'widget-threads')} className="absolute -right-2 -top-2 z-20 w-5 h-5 rounded-full bg-[#292724] text-white text-[10px]">×</button>}
                <div className="flex items-center justify-between text-[9px] font-mono text-[#8b8782] mb-1.5">
                  <span className="flex items-center gap-1.5 text-[#1a1a1a] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />THREADS · PRIVATE</span>
                  <span>PRIVATE DESKTOP</span>
                </div>
                <p className="font-serif-sc text-[12px] leading-relaxed text-[var(--ink)] line-clamp-2">暂无动态。导入角色后，Threads 会在这里显示内容。</p>
                <div className="mt-2 text-[9px] font-mono text-[#8b7560]">点击进入 Threads 查阅互动 →</div>
              </div>
            );
          })()}

          <section className="absolute z-10 inset-0 pointer-events-none">
            {[
              ['threads','Threads','threads','bg-[#1a1a1a] text-white','threads'],
              ['npc','NPC','npc','bg-[#ebe2dc] text-[#5f554f] border border-black/5','npc'],
              ['group-presets','预设','group-presets','bg-[#f0ebe5] text-[#63584f] border border-black/5','group-presets'],
              ['spy-phone','查手机','spy-phone','bg-[#9b625b] text-white','spy-phone'],
              ['memory','Memory','memory','bg-[#292724] text-white','memory'],
              ['studio','STUDIO','studio','bg-[#242220] text-white','project-studio'],
            ].map(([id,label,symbol,iconClass,screen]) => {
              const itemId='app-'+id;
              if (isHidden(2,itemId)) return null;
              const item=itemPosition(2,itemId);
              return (
                <button key={id}
                  onClick={() => { if (!desktopEditing) onNavigate(screen as ScreenType); }}
                  onPointerDown={e => beginDesktopDrag(2,itemId,e)}
                  onPointerMove={e => continueDesktopDrag(2,itemId,e)}
                  onPointerUp={endDesktopDrag}
                  onPointerCancel={endDesktopDrag}
                  className={`absolute pointer-events-auto w-[64px] flex flex-col items-center gap-2 text-[10px] tracking-[0.25px] text-[var(--sub,#68625b)] select-none touch-none ${desktopEditing ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  style={{ left:item.x, top:item.y }}
                >
                  <div className={`relative w-[64px] h-[64px] rounded-[20px] shadow-[0_6px_18px_rgba(52,43,34,.07)] grid place-items-center ${iconClass}`}>
                    {appearance.appIcons[id] ? renderAppIcon(id,symbol,'w-6 h-6') : id==='npc' ? <span className="text-[20px] font-serif">人</span> : id==='group-presets' ? <span className="text-[18px] font-serif">预</span> : id==='memory' ? <span className="font-serif text-[20px]">M</span> : renderAppIcon(id,symbol,'w-6 h-6')}
                  </div>
                  <span className="font-semibold tracking-tight text-[var(--ink)] whitespace-nowrap">{label}</span>
                  {desktopEditing && <span onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();hideDesktopItem(2,itemId)}} className="absolute -right-2 -top-2 z-20 w-5 h-5 rounded-full bg-[#292724] text-white text-[10px] grid place-items-center cursor-pointer">×</span>}
                </button>
              );
            })}
          </section>

          {desktopEditing && desktopHidden.page2.length > 0 && (
            <button onClick={() => showAllDesktopItems(2)} className="absolute z-20 bottom-[150px] left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/80 border border-black/5 text-[8px] font-mono text-[#777]">恢复隐藏</button>
          )}
        </div>
      )}

      {/* Fixed Dock — never participates in desktop dragging */}
      <div className="absolute z-20 bottom-[28px] left-[18px] right-[18px] h-[92px] rounded-[28px] border border-[var(--edge,rgba(255,255,255,.7))] bg-[rgba(250,248,244,.72)] backdrop-blur-2xl shadow-[0_8px_28px_rgba(45,37,30,.055)] px-[10px] flex items-center justify-around">
        {[
          ['character-profile','角色档案','card','character-profile'],
          ['world-book','世界书','globe','world-book'],
          ['appearance','外观','look','appearance'],
          ['settings','设置','gear','settings'],
        ].map(([id,label,symbol,screen]) => (
          <button
            key={id}
            onClick={() => onNavigate(screen as ScreenType)}
            className="w-[64px] flex flex-col items-center gap-2 text-[10px] text-[var(--sub,#68625b)]"
          >
            <div className="w-[50px] h-[50px] rounded-[16px] bg-[rgba(255,255,255,.52)] border border-[var(--edge,rgba(255,255,255,.75))] shadow-[0_4px_14px_rgba(52,43,34,.05)] grid place-items-center text-[var(--ink)]">
              {renderAppIcon(id,symbol,'w-5 h-5')}
            </div>
            <span className="font-medium whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* Pagination Indicator Dots (● ○  /  ○ ●) */}
      {/* ========================================================================= */}
      <div className="absolute z-10 bottom-[128px] left-0 right-0 flex items-center justify-center gap-2">
        <button
          onClick={() => setCurrentPage(1)}
          className={`h-1.5 rounded-full transition-all ${
            currentPage === 1 ? 'w-5 bg-[var(--ink,#242323)]' : 'w-1.5 bg-[#8b8782]/40 hover:bg-[#8b8782]'
          }`}
          title="切换至第 1 页 (主桌面)"
        />
        <button
          onClick={() => setCurrentPage(2)}
          className={`h-1.5 rounded-full transition-all ${
            currentPage === 2 ? 'w-5 bg-[var(--ink,#242323)]' : 'w-1.5 bg-[#8b8782]/40 hover:bg-[#8b8782]'
          }`}
          title="切换至第 2 页 (Threads · NPC · 预设 · 查手机)"
        />
      </div>

      {desktopEditing && desktopHidden.page1.length > 0 && (
        <button onClick={() => showAllDesktopItems(1)} className="absolute z-20 bottom-[126px] left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/80 border border-black/5 text-[8px] font-mono text-[#777]">
          恢复隐藏项目
        </button>
      )}

    </div>
  );
}
