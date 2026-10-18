import React, { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from '../types';
import { SaneHomeScreenView } from './screens/SaneHomeScreenView';
import { ChatScreenView } from './screens/ChatScreenView';
import { InboxScreenView } from './screens/InboxScreenView';
import { CharacterProfileView } from './screens/CharacterProfileView';
import { MomentsScreenView } from './screens/MomentsScreenView';
import { GalleryScreenView } from './screens/GalleryScreenView';
import { MusicHtmlView } from './screens/MusicHtmlView';
import { NotesScreenView } from './screens/NotesScreenView';
import { ThreadsScreenView } from './screens/ThreadsScreenView';
import { InstagramScreenView } from './screens/InstagramScreenView';
import { SpyPhoneScreenView } from './screens/SpyPhoneScreenView';
import { WorldBookScreenView } from './screens/WorldBookScreenView';
import { SettingsScreenView } from './screens/SettingsScreenView';
import { ProjectStudioScreenView } from './screens/ProjectStudioScreenView';
import { MemoryScreenView } from './screens/MemoryScreenView';
import { AppearanceScreenView } from './screens/AppearanceScreenView';
import { OfflineStoryHtmlView } from './screens/OfflineStoryHtmlView';
import { CalendarScreenView } from './screens/CalendarScreenView';
import { NpcScreenView } from './screens/NpcScreenView';
import { GroupPresetScreenView } from './screens/GroupPresetScreenView';
import { LineAppView } from './line/LineAppView';
import { LockScreenView } from './screens/LockScreenView';
import { HomeCustomizeSheet } from './modals/HomeCustomizeSheet';
import { playAppSound, type AppSoundKind } from '../store/soundManager';
import { runProactiveCatchup } from '../store/proactiveRuntime';
import { readAppearance } from '../store/appearance';
import { getMedia } from '../store/mediaVault';
import { DynamicIsland } from './DynamicIsland';
import { AppErrorBoundary } from '../crashUi';

interface PhoneSimulatorProps {
  themeMode: ThemeMode;
  currentScreen: ScreenType;
  setCurrentScreen: (screen: ScreenType) => void;
  onSelectTheme: (theme: ThemeMode) => void;
}

export function PhoneSimulator({
  themeMode,
  currentScreen,
  setCurrentScreen,
  onSelectTheme,
}: PhoneSimulatorProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [appearance, setAppearance] = useState(() => readAppearance());
  const [screenHistory, setScreenHistory] = useState<ScreenType[]>(['home']);
  const [statusBarNow, setStatusBarNow] = useState(() => new Date());
  // 锁屏状态：首次打开时为 true，解锁后变为 false
  const [isLocked, setIsLocked] = useState(true);

  useEffect(() => {
    const refreshClock = () => setStatusBarNow(new Date());
    refreshClock();
    const timer = window.setInterval(refreshClock, 30_000);
    window.addEventListener('focus', refreshClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshClock);
    };
  }, []);

  // LINE 接受一起听后切到音乐页，让一起听播放页能立刻打开
  useEffect(() => {
    const onOpenTogether = () => setCurrentScreen('music');
    window.addEventListener('sane333:open-music-together', onOpenTogether);
    return () => window.removeEventListener('sane333:open-music-together', onOpenTogether);
  }, [setCurrentScreen]);

  // 通用导航事件（如线下邀约接受后跳转）
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const screen = (e as CustomEvent).detail?.screen as ScreenType | undefined;
      if (screen) setCurrentScreen(screen);
    };
    window.addEventListener('sane333:navigate', onNavigate);
    return () => window.removeEventListener('sane333:navigate', onNavigate);
  }, [setCurrentScreen]);

  const statusBarTime = statusBarNow.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const navigateTo = (next: ScreenType) => {
    if (next === currentScreen) return;
    setScreenHistory(previous => [...previous, currentScreen].slice(-50));
    setCurrentScreen(next);
  };

  const goBack = () => {
    setScreenHistory(previous => {
      if (!previous.length) {
        setCurrentScreen('home');
        return ['home'];
      }
      const nextHistory = previous.slice();
      const previousScreen = nextHistory.pop() || 'home';
      setCurrentScreen(previousScreen);
      return nextHistory;
    });
  };

  // Every app receives this wrapper. Its "home" target means Back within
  // the current app/navigation stack, not "jump to the phone Home screen".
  const navigateFromApp = (next: ScreenType) => {
    if (next === 'home') {
      goBack();
      return;
    }
    navigateTo(next);
  };
  const isDark = themeMode === 'dark-luxury';
  // 手机外框开关：关掉后只显示内容区；顶部状态栏开关
  const showPhoneFrame = appearance.showPhoneFrame !== false;
  const showStatusBar = appearance.showStatusBar !== false;
  const appBeauty = appearance.appBeauty?.[currentScreen] || {};
  const isLineScreen = currentScreen === 'chat' || currentScreen === 'inbox';
  const globalBg = isLineScreen ? '#ffffff' : (appearance.globalBackground || '#f7f4ee');
  // 上传字体优先于旧 URL，避免「上传了却仍用旧链接」
  const activeFont = appearance.customFont || appearance.customFontUrl || '';
  const [fontFaceCss, setFontFaceCss] = useState('');

  const handleToggleTheme = () => {
    onSelectTheme(isDark ? 'nordic-light' : 'dark-luxury');
  };

  useEffect(() => {
    const syncAppearance = () => setAppearance(readAppearance());
    window.addEventListener('sane333:appearance-changed', syncAppearance);
    return () => window.removeEventListener('sane333:appearance-changed', syncAppearance);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let addedFace: FontFace | null = null;

    const guessFormat = (src: string, fileName?: string): string | null => {
      const hay = `${fileName || ''} ${src.slice(0, 120)}`.toLowerCase();
      if (hay.includes('woff2') || hay.includes('font/woff2')) return 'woff2';
      if (hay.includes('woff') || hay.includes('font/woff')) return 'woff';
      if (hay.includes('.ttf') || hay.includes('font/ttf') || hay.includes('truetype')) return 'truetype';
      if (hay.includes('.otf') || hay.includes('font/otf') || hay.includes('opentype')) return 'opentype';
      return null;
    };

    const apply = async () => {
      if (!activeFont) {
        setFontFaceCss('');
        return;
      }
      // 上传字体存的是 media:<id> 引用（避免 localStorage 5MB 爆掉），先解析成 dataURL
      let srcValue = activeFont;
      if (srcValue.startsWith('media:')) {
        try {
          const resolved = await getMedia(srcValue.slice(6));
          if (cancelled) return;
          if (resolved) srcValue = resolved;
          else { setFontFaceCss(''); return; }
        } catch { setFontFaceCss(''); return; }
      }
      const format = guessFormat(srcValue, appearance.customFontName);
      const quoted = JSON.stringify(srcValue);
      const src = format ? `url(${quoted}) format(${JSON.stringify(format)})` : `url(${quoted})`;
      // 不写死 woff2：ttf/otf/woff 也能生效；再用 FontFace 确保加载完成
      setFontFaceCss(`@font-face{font-family:Sane333Custom;src:${src};font-display:swap;}`);
      try {
        if (typeof FontFace !== 'undefined' && document?.fonts) {
          // FontFace 只接受 url(...)，不接受 format(...)，否则直接抛 SyntaxError
          const face = new FontFace('Sane333Custom', `url(${quoted})`, { display: 'swap' });
          await face.load();
          if (cancelled) return;
          document.fonts.add(face);
          addedFace = face;
        }
      } catch {
        // CSS @font-face 仍保留；加载失败时回退系统字体，不打断手机壳
      }
    };

    void apply();
    return () => {
      cancelled = true;
      if (addedFace) {
        try { document.fonts.delete(addedFace); } catch { /* ignore */ }
      }
    };
  }, [activeFont, appearance.customFontName]);

  useEffect(() => {
    // The phone itself owns the world clock: proactive messages can arrive
    // while the user is on Home, Music, Notes, etc. — not only inside LINE.
    const onLineReplied = (event: Event) => {
      try {
        const d = ((event as unknown) as CustomEvent<any>).detail || {};
        if (!d.replyText) return;
        void import('../store/momentsAfterChat').then(async (m) => {
          const chars: any[] = JSON.parse(window.localStorage.getItem('phone:characters') || '[]');
          const ch = chars.find((c) => (d.characterId && c.id === d.characterId) || (d.characterName && c.name === d.characterName));
          if (!ch) return;
          await m.maybePostMomentAfterChat({ character: ch, chatText: String(d.chatText || ''), replyText: String(d.replyText || ''), groupName: d.groupName || null });
        });
      } catch { /* best-effort */ }
    };
    window.addEventListener('sane333:line-replied', onLineReplied);
    void runProactiveCatchup();
    const interval = window.setInterval(() => {
      void runProactiveCatchup();
    }, 60_000);

    return () => { window.removeEventListener('sane333:line-replied', onLineReplied); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handleSound = (event: Event) => {
      const custom = event as CustomEvent<{ kind?: AppSoundKind }>;
      const kind = custom.detail?.kind;
      if (kind) void playAppSound(kind);
    };
    const handleProactive = () => { void playAppSound('message'); };
    const handleIncomingCall = () => { void playAppSound('call'); };
    window.addEventListener('sane333:play-sound', handleSound as EventListener);
    window.addEventListener('sane333:proactive-message', handleProactive);
    window.addEventListener('sane333:incoming-call', handleIncomingCall);
    return () => {
      window.removeEventListener('sane333:play-sound', handleSound as EventListener);
      window.removeEventListener('sane333:proactive-message', handleProactive);
      window.removeEventListener('sane333:incoming-call', handleIncomingCall);
    };
  }, []);

  return (
    <div className="relative mx-auto flex flex-col items-center">
      {fontFaceCss ? <style>{fontFaceCss + ' .phone-screen, .phone-screen *{font-family:Sane333Custom,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif !important;}'}</style> : null}
      
      {/* Physical Phone Chassis — shape depends on phoneShell */}
      {appearance.phoneShell === 'modern' && (
        <div
          data-theme={isDark ? 'dark' : 'light'}
          className={`relative ${showPhoneFrame ? 'w-[360px] sm:w-[390px] h-[780px] sm:h-[844px] rounded-[43px] border-[7px] border-[var(--frame,#1e1d1b)] shadow-[0_30px_100px_rgba(20,18,15,.28)]' : 'w-full h-[100dvh]'} overflow-hidden flex flex-col select-none ${
            isDark ? 'dark-theme-mode' : ''
          }`}
          style={{ background: globalBg, color: 'var(--ink, #242323)', fontFamily: activeFont ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' : undefined, fontSize: `${appearance.customFontSize || 1}em` }}
        >
          {/* Statusbar · 极简版 */}
          {showStatusBar && (
            <div className="absolute z-20 top-0 left-0 right-0 h-[44px] flex items-center justify-between px-4 text-[11px] text-[#666]">
              <span className="font-medium tracking-[0.5px]">{statusBarTime}</span>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
                  <path d="M8 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>
                  <path d="M8 5.5c1.8 0 3.4.7 4.6 1.9l-1.4 1.4C10.3 7.9 9.2 7.5 8 7.5s-2.3.4-3.2 1.3L3.4 7.4C4.6 6.2 6.2 5.5 8 5.5z"/>
                  <path d="M8 1c2.9 0 5.6 1.2 7.6 3.1l-1.4 1.4C12.6 3.9 10.4 3 8 3S3.4 3.9 1.8 5.5L.4 4.1C2.4 2.2 5.1 1 8 1z"/>
                </svg>
                <span className="relative inline-flex items-center">
                  <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
                    <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
                    <rect x="2" y="2" width="15" height="8" rx="1.5" fill="currentColor"/>
                    <path d="M23 4v4c1-.3 1.5-1 1.5-2s-.5-1.7-1.5-2z" fill="currentColor" opacity="0.4"/>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold" style={{color:'#fff'}}>80</span>
                </span>
              </span>
            </div>
          )}
          <DynamicIsland
            enabled={appearance.showDynamicIsland !== false}
            onOpenMusic={() => setCurrentScreen('music')}
            island={{
              islandShowIdleDot: appearance.islandShowIdleDot === true,
              islandIdleLabel: appearance.islandIdleLabel || '',
              islandDotColor: appearance.islandDotColor || '#34d399',
              islandCollapsedStyle: appearance.islandCollapsedStyle === 'black' ? 'black' : 'glass',
              islandFontFamily: appearance.islandFontFamily || '',
            }}
          />
          <div
            data-sane333-home-viewport
            className="flex-1 relative overflow-hidden"
            style={{
              fontSize: appBeauty.fontScale ? `${appBeauty.fontScale}em` : undefined,
              background: appBeauty.background || globalBg,
              ['--phone-bg' as any]: globalBg,
              ['--paper' as any]: globalBg,
              ['--screen' as any]: globalBg,
              ['--page' as any]: globalBg,
              ['--glass' as any]: 'color-mix(in srgb, ' + globalBg + ' 78%, white 22%)',
              ['--icon' as any]: 'color-mix(in srgb, ' + globalBg + ' 86%, white 14%)',
              ['--app-accent' as any]: appBeauty.accent || '#292724',
              ['--app-radius' as any]: `${appBeauty.radius ?? 18}px`,
              ['--font-sans' as any]: activeFont
                ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
                : undefined,
            }}
          >
          {appBeauty.background && (
            <div
              className="absolute inset-0 z-[4] pointer-events-none opacity-[0.12] bg-center bg-cover"
              style={{ backgroundImage: `url(${appBeauty.background})` }}
            />
          )}
          {currentScreen === 'home' && (
            <SaneHomeScreenView
              onNavigate={navigateTo}
              onOpenSheet={() => setIsSheetOpen(true)}
              onToggleTheme={handleToggleTheme}
            />
          )}

          {(currentScreen === 'chat' || currentScreen === 'inbox') && (
            <AppErrorBoundary
              where={`screen:${currentScreen}`}
              resetLabel="重新打开"
              onReset={() => {
                window.localStorage.removeItem('line:chat-items');
                window.localStorage.removeItem('line:friends-list');
                window.localStorage.removeItem('line:global-favorites');
                window.localStorage.removeItem('line:moments-posts');
                window.localStorage.removeItem('line:moments-screen-posts');
                window.location.reload();
              }}
            >
              <LineAppView
                onNavigateHome={goBack}
                onNavigateScreen={navigateTo}
              />
            </AppErrorBoundary>
          )}

          {currentScreen === 'character-profile' && (
            <CharacterProfileView
              themeMode={themeMode}
              onNavigate={navigateFromApp}
            />
          )}

          {currentScreen === 'moments' && (
            <MomentsScreenView
              themeMode={themeMode}
              onNavigate={navigateFromApp}
            />
          )}

          {currentScreen === 'gallery' && (
            <GalleryScreenView
              themeMode={themeMode}
              onNavigate={navigateFromApp}
            />
          )}

          {/* 常挂载音乐页，离开时隐藏，灵动岛才能继续控播放 */}
          <div
            className={
              currentScreen === 'music'
                ? 'absolute inset-0 z-[5]'
                : 'absolute inset-0 z-0 invisible pointer-events-none'
            }
            aria-hidden={currentScreen !== 'music'}
          >
            <AppErrorBoundary
              where="screen:music"
              resetLabel="回主页"
              onReset={() => setCurrentScreen('home')}
            >
              <MusicHtmlView
                themeMode={themeMode}
                active={currentScreen === 'music'}
                onNavigate={navigateFromApp}
              />
            </AppErrorBoundary>
          </div>

          {currentScreen === 'threads' && (
            <ThreadsScreenView
              onNavigate={navigateFromApp}
            />
          )}
          {currentScreen === 'instagram' && (
            <InstagramScreenView
              onNavigate={navigateFromApp}
            />
          )}

          {currentScreen === 'spy-phone' && (
            <SpyPhoneScreenView
              onNavigate={navigateFromApp}
            />
          )}

          {currentScreen === 'notes' && (
            <NotesScreenView
              themeMode={themeMode}
              onNavigate={navigateFromApp}
            />
          )}

          {currentScreen === 'world-book' && (
            <WorldBookScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'settings' && (
            <SettingsScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'project-studio' && (
            <ProjectStudioScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'memory' && (
            <MemoryScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'appearance' && (
            <AppearanceScreenView
              currentTheme={themeMode}
              onNavigate={navigateFromApp}
              onSelectTheme={onSelectTheme}
            />
          )}

          {currentScreen === 'offline-story' && (
            <OfflineStoryHtmlView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'calendar' && (
            <CalendarScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'npc' && (
            <NpcScreenView onNavigate={setCurrentScreen} />
          )}

          {currentScreen === 'group-presets' && (
            <GroupPresetScreenView onNavigate={setCurrentScreen} />
          )}

          {isLocked && (
            <LockScreenView
              themeMode={themeMode}
              onUnlock={() => setIsLocked(false)}
            />
          )}
        </div>
        </div>
      )}

        {/* ========== Classic iPhone 8 (Round Home Button) ========== */}

        {/* iPhone 8 body wrapper — holds viewport + classic chrome */}
        {appearance.phoneShell === 'classic-round' && (
          <div
            data-theme={isDark ? 'dark' : 'light'}
            className={`relative ${showPhoneFrame ? 'w-[342px] sm:w-[375px] h-[740px] sm:h-[812px] rounded-[42px] border-[9px] border-[#1c1c1e] shadow-[inset_0_0_0_1px_rgba(255,255,255,.15),0_30px_100px_rgba(20,18,15,.32)]' : 'w-full h-[100dvh]'} overflow-hidden flex flex-col select-none`}
            style={{ background: isDark ? '#171719' : '#f6f6f7', color: 'var(--ink, #242323)', fontFamily: activeFont ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' : undefined, fontSize: `${appearance.customFontSize || 1}em` }}
          >
            {showPhoneFrame && (
              <>
                {/* iPhone 8 top bezel (speaker / sensor) */}
                <div className="relative h-[62px] shrink-0 flex items-center justify-center">
                  <div className="absolute left-1/2 -translate-x-1/2 top-[22px] flex items-center gap-[8px]">
                    <div className="w-[6px] h-[6px] rounded-full bg-black/35 shadow-[inset_0_1px_1px_rgba(255,255,255,.25)]" />
                    <div className="w-[42px] h-[5px] rounded-full bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,.2)]" />
                  </div>
                </div>
              </>
            )}

            {/* iPhone 8 Viewport */}
            <div
              className="flex-1 relative overflow-hidden"
              style={{
                background: appBeauty.background || globalBg,
                ['--phone-bg' as any]: globalBg,
                ['--paper' as any]: globalBg,
                ['--screen' as any]: globalBg,
                ['--page' as any]: globalBg,
                ['--glass' as any]: 'color-mix(in srgb, ' + globalBg + ' 78%, white 22%)',
                ['--icon' as any]: 'color-mix(in srgb, ' + globalBg + ' 86%, white 14%)',
                ['--app-accent' as any]: appBeauty.accent || '#292724',
                ['--app-radius' as any]: `${appBeauty.radius ?? 18}px`,
                ['--font-sans' as any]: activeFont
                  ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
                  : undefined,
              }}
            >
              {appBeauty.background && (
                <div className="absolute inset-0 z-[4] pointer-events-none opacity-[0.12] bg-center bg-cover" style={{ backgroundImage: `url(${appBeauty.background})` }} />
              )}
              {/* Statusbar · 极简版 */}
              {showStatusBar && (
                <div className="absolute z-20 top-0 left-0 right-0 h-[44px] flex items-center justify-between px-4 text-[11px] text-[#666]">
                  <span className="font-medium tracking-[0.5px]">{statusBarTime}</span>
                  <span className="flex items-center gap-1.5">
                <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
                  <path d="M8 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>
                  <path d="M8 5.5c1.8 0 3.4.7 4.6 1.9l-1.4 1.4C10.3 7.9 9.2 7.5 8 7.5s-2.3.4-3.2 1.3L3.4 7.4C4.6 6.2 6.2 5.5 8 5.5z"/>
                  <path d="M8 1c2.9 0 5.6 1.2 7.6 3.1l-1.4 1.4C12.6 3.9 10.4 3 8 3S3.4 3.9 1.8 5.5L.4 4.1C2.4 2.2 5.1 1 8 1z"/>
                </svg>
                <span className="relative inline-flex items-center">
                  <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
                    <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
                    <rect x="2" y="2" width="15" height="8" rx="1.5" fill="currentColor"/>
                    <path d="M23 4v4c1-.3 1.5-1 1.5-2s-.5-1.7-1.5-2z" fill="currentColor" opacity="0.4"/>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold" style={{color:'#fff'}}>80</span>
                </span>
              </span>
                </div>
              )}

              {currentScreen === 'home' && <SaneHomeScreenView onNavigate={navigateTo} onOpenSheet={() => setIsSheetOpen(true)} onToggleTheme={handleToggleTheme} />}
              {(currentScreen === 'chat' || currentScreen === 'inbox') && (
                <AppErrorBoundary where={`screen:${currentScreen}`} resetLabel="重新打开" onReset={() => { window.localStorage.removeItem('line:chat-items'); window.localStorage.removeItem('line:friends-list'); window.localStorage.removeItem('line:global-favorites'); window.localStorage.removeItem('line:moments-posts'); window.localStorage.removeItem('line:moments-screen-posts'); window.location.reload(); }}>
                  <LineAppView onNavigateHome={goBack} onNavigateScreen={navigateTo} />
                </AppErrorBoundary>
              )}
              {currentScreen === 'character-profile' && <CharacterProfileView themeMode={themeMode} onNavigate={navigateFromApp} />}
              {currentScreen === 'moments' && <MomentsScreenView themeMode={themeMode} onNavigate={navigateFromApp} />}
              {currentScreen === 'gallery' && <GalleryScreenView themeMode={themeMode} onNavigate={navigateFromApp} />}
              <div className={currentScreen === 'music' ? 'absolute inset-0 z-[5]' : 'absolute inset-0 z-0 invisible pointer-events-none'}>
                <MusicHtmlView active={currentScreen === 'music'} onNavigate={navigateFromApp} />
              </div>
              {currentScreen === 'notes' && <NotesScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'calendar' && <CalendarScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'world-book' && <WorldBookScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'spy-phone' && <SpyPhoneScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'threads' && <ThreadsScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'instagram' && <InstagramScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'offline-story' && <OfflineStoryHtmlView onNavigate={navigateTo} />}
              {currentScreen === 'settings' && <SettingsScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'project-studio' && <ProjectStudioScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'memory' && <MemoryScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'appearance' && <AppearanceScreenView onNavigate={navigateFromApp} currentTheme={themeMode} onSelectTheme={onSelectTheme} />}
              {currentScreen === 'npc' && <NpcScreenView onNavigate={setCurrentScreen} />}
              {currentScreen === 'group-presets' && <GroupPresetScreenView onNavigate={setCurrentScreen} />}
              {isLocked && <LockScreenView themeMode={themeMode} onUnlock={() => setIsLocked(false)} />}
            </div>

            {showPhoneFrame && (
              <>
                {/* iPhone 8 bottom chrome with round Home button */}
                <div className="relative h-[78px] shrink-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setCurrentScreen('home')}
                    className="w-[48px] h-[48px] rounded-full border border-black/35 bg-[linear-gradient(145deg,#fbfbfc,#d6d6d9)] shadow-[inset_0_1px_1px_rgba(255,255,255,.9),0_1px_2px_rgba(0,0,0,.18)] active:scale-95 transition flex items-center justify-center"
                    aria-label="Home"
                  >
                    <span className="w-[39px] h-[39px] rounded-full border border-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,.5)]" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== Classic iPhone SE (Square Home Button) ========== */}
        {appearance.phoneShell === 'classic-square' && (
          <div
            data-theme={isDark ? 'dark' : 'light'}
            className={`relative ${showPhoneFrame ? 'w-[320px] sm:w-[350px] h-[665px] sm:h-[728px] rounded-[10px] border-[8px] border-[#1c1c1e] shadow-[inset_0_0_0_1px_rgba(255,255,255,.15),0_28px_85px_rgba(20,18,15,.30)]' : 'w-full h-[100dvh]'} overflow-hidden flex flex-col select-none`}
            style={{ background: isDark ? '#171719' : '#f6f6f7', color: 'var(--ink, #242323)', fontFamily: activeFont ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' : undefined, fontSize: `${appearance.customFontSize || 1}em` }}
          >
            {showPhoneFrame && (
              <>
                {/* Top bezel */}
                <div className="relative h-[56px] shrink-0 flex items-center justify-center">
                  <div className="absolute left-1/2 -translate-x-1/2 top-[20px] flex items-center gap-[8px]">
                    <div className="w-[6px] h-[6px] rounded-full bg-black/35" />
                    <div className="w-[38px] h-[5px] rounded-full bg-black/40" />
                  </div>
                </div>
              </>
            )}

            {/* Viewport */}
            <div
              className="flex-1 relative overflow-hidden"
              style={{
                background: appBeauty.background || globalBg,
                ['--phone-bg' as any]: globalBg,
                ['--paper' as any]: globalBg,
                ['--screen' as any]: globalBg,
                ['--page' as any]: globalBg,
                ['--glass' as any]: 'color-mix(in srgb, ' + globalBg + ' 78%, white 22%)',
                ['--icon' as any]: 'color-mix(in srgb, ' + globalBg + ' 86%, white 14%)',
                ['--app-accent' as any]: appBeauty.accent || '#292724',
                ['--app-radius' as any]: `${appBeauty.radius ?? 18}px`,
                ['--font-sans' as any]: activeFont
                  ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
                  : undefined,
              }}
            >
              {appBeauty.background && (
                <div className="absolute inset-0 z-[4] pointer-events-none opacity-[0.12] bg-center bg-cover" style={{ backgroundImage: `url(${appBeauty.background})` }} />
              )}
              {/* Statusbar · 极简版 */}
              {showStatusBar && (
                <div className="absolute z-20 top-0 left-0 right-0 h-[44px] flex items-center justify-between px-4 text-[11px] text-[#666]">
                  <span className="font-medium tracking-[0.5px]">{statusBarTime}</span>
                  <span className="flex items-center gap-1.5">
                <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
                  <path d="M8 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>
                  <path d="M8 5.5c1.8 0 3.4.7 4.6 1.9l-1.4 1.4C10.3 7.9 9.2 7.5 8 7.5s-2.3.4-3.2 1.3L3.4 7.4C4.6 6.2 6.2 5.5 8 5.5z"/>
                  <path d="M8 1c2.9 0 5.6 1.2 7.6 3.1l-1.4 1.4C12.6 3.9 10.4 3 8 3S3.4 3.9 1.8 5.5L.4 4.1C2.4 2.2 5.1 1 8 1z"/>
                </svg>
                <span className="relative inline-flex items-center">
                  <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
                    <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
                    <rect x="2" y="2" width="15" height="8" rx="1.5" fill="currentColor"/>
                    <path d="M23 4v4c1-.3 1.5-1 1.5-2s-.5-1.7-1.5-2z" fill="currentColor" opacity="0.4"/>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold" style={{color:'#fff'}}>80</span>
                </span>
              </span>
                </div>
              )}

              {currentScreen === 'home' && <SaneHomeScreenView onNavigate={navigateTo} onOpenSheet={() => setIsSheetOpen(true)} onToggleTheme={handleToggleTheme} />}
              {(currentScreen === 'chat' || currentScreen === 'inbox') && (
                <AppErrorBoundary where={`screen:${currentScreen}`} resetLabel="重新打开" onReset={() => { window.localStorage.removeItem('line:chat-items'); window.localStorage.removeItem('line:friends-list'); window.localStorage.removeItem('line:global-favorites'); window.localStorage.removeItem('line:moments-posts'); window.localStorage.removeItem('line:moments-screen-posts'); window.location.reload(); }}>
                  <LineAppView onNavigateHome={goBack} onNavigateScreen={navigateTo} />
                </AppErrorBoundary>
              )}
              {currentScreen === 'character-profile' && <CharacterProfileView themeMode={themeMode} onNavigate={navigateFromApp} />}
              {currentScreen === 'moments' && <MomentsScreenView themeMode={themeMode} onNavigate={navigateFromApp} />}
              {currentScreen === 'gallery' && <GalleryScreenView themeMode={themeMode} onNavigate={navigateFromApp} />}
              <div className={currentScreen === 'music' ? 'absolute inset-0 z-[5]' : 'absolute inset-0 z-0 invisible pointer-events-none'}>
                <MusicHtmlView active={currentScreen === 'music'} onNavigate={navigateFromApp} />
              </div>
              {currentScreen === 'notes' && <NotesScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'calendar' && <CalendarScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'world-book' && <WorldBookScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'spy-phone' && <SpyPhoneScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'threads' && <ThreadsScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'instagram' && <InstagramScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'offline-story' && <OfflineStoryHtmlView onNavigate={navigateTo} />}
              {currentScreen === 'settings' && <SettingsScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'project-studio' && <ProjectStudioScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'memory' && <MemoryScreenView onNavigate={navigateFromApp} />}
              {currentScreen === 'appearance' && <AppearanceScreenView onNavigate={navigateFromApp} currentTheme={themeMode} onSelectTheme={onSelectTheme} />}
              {currentScreen === 'npc' && <NpcScreenView onNavigate={setCurrentScreen} />}
              {currentScreen === 'group-presets' && <GroupPresetScreenView onNavigate={setCurrentScreen} />}
              {isLocked && <LockScreenView themeMode={themeMode} onUnlock={() => setIsLocked(false)} />}
            </div>

            {showPhoneFrame && (
              <>
                {/* Bottom chrome with square Home button */}
                <div className="relative h-[72px] shrink-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setCurrentScreen('home')}
                    className="w-[44px] h-[44px] rounded-full border border-black/35 bg-[linear-gradient(145deg,#fbfbfc,#d6d6d9)] shadow-[inset_0_1px_1px_rgba(255,255,255,.9),0_1px_2px_rgba(0,0,0,.18)] active:scale-95 transition flex items-center justify-center"
                    aria-label="Home"
                  >
                    <span className="w-[25px] h-[25px] rounded-[6px] border border-black/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,.5)]" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}


        {/* Home Indicator (modern only — classic shells have built-in Home) */}
        {appearance.phoneShell === 'modern' && (
          <div
            onClick={() => setCurrentScreen('home')}
            className="absolute z-20 bottom-[7px] left-1/2 -translate-x-1/2 w-[118px] h-[4px] rounded-[5px] bg-[#242321] cursor-pointer hover:w-[130px] transition-all"
            title="点击返回主屏幕"
          />
        )}

        {/* Customization Sheet Modal */}
        <HomeCustomizeSheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          currentTheme={themeMode}
          onSelectTheme={onSelectTheme}
        />

      </div>
  );
}
