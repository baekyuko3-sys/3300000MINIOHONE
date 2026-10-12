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

  const statusBarTime = statusBarNow.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const statusBarDate = statusBarNow.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
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
  const appBeauty = appearance.appBeauty?.[currentScreen] || {};
  const isLineScreen = currentScreen === 'chat' || currentScreen === 'inbox';
  const globalBg = isLineScreen ? '#ffffff' : (appearance.globalBackground || '#f7f4ee');
  const activeFont = appearance.customFontUrl || appearance.customFont;


  const handleToggleTheme = () => {
    onSelectTheme(isDark ? 'nordic-light' : 'dark-luxury');
  };

  useEffect(() => {
    const syncAppearance = () => setAppearance(readAppearance());
    window.addEventListener('sane333:appearance-changed', syncAppearance);
    return () => window.removeEventListener('sane333:appearance-changed', syncAppearance);
  }, []);

  useEffect(() => {
    // The phone itself owns the world clock: proactive messages can arrive
    // while the user is on Home, Music, Notes, etc. — not only inside LINE.
    void runProactiveCatchup();
    const interval = window.setInterval(() => {
      void runProactiveCatchup();
    }, 60_000);

    return () => window.clearInterval(interval);
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
      {activeFont && (
        <style>{`@font-face{font-family:Sane333Custom;src:url("${activeFont}") format("woff2");font-display:swap;}`}</style>
      )}
      
      {/* Authentic Physical Phone Chassis (Exact CSS from user template) */}
      <div 
        data-theme={isDark ? 'dark' : 'light'}
        className={`relative w-[360px] sm:w-[390px] h-[780px] sm:h-[844px] overflow-hidden rounded-[43px] border-[7px] border-[var(--frame,#1e1d1b)] shadow-[0_30px_100px_rgba(20,18,15,.28)] flex flex-col select-none ${
          isDark ? 'dark-theme-mode' : ''
        }`}
        style={{ background: globalBg, color: 'var(--ink, #242323)', fontFamily: activeFont ? 'Sane333Custom, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif' : undefined, fontSize: `${appearance.customFontSize || 1}em` }}
      >
        
        {/* Statusbar (Exact from user template) */}
        <div className="absolute z-20 top-0 left-0 right-0 h-[42px] flex items-center justify-between px-6 text-[12px] font-[650] tracking-[0.2px] text-[var(--ink)]">
          <div className="flex items-baseline gap-1.5 tabular-nums" aria-label={statusBarNow.toLocaleString()}>
            <span>{statusBarTime}</span>
            <span className="text-[9px] font-medium tracking-normal opacity-75">{statusBarDate}</span>
          </div>

          <div className="flex items-center gap-[7px]">
            <span className="text-[11px]">⌁</span>
            <span className="text-[11px] font-normal">Wi‑Fi</span>
            {/* Battery icon with inner fill */}
            <div className="w-[21px] h-[10px] border-[1.4px] border-current rounded-[3px] relative">
              <div className="absolute -right-[3px] top-[2.5px] w-[2px] h-[4px] bg-current rounded-[1px]" />
              <div className="w-[72%] h-full bg-current rounded-[1px]" />
            </div>
          </div>
        </div>

        {/* Dynamic Island A+D — 外观设置可关；真机自带岛时建议隐藏 */}
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

        {/* Screen Content Viewport */}
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
            // Tailwind's font-sans utility reads --font-sans. Keep LINE's many
            // font-sans elements aligned with the phone-wide custom font.
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

          {currentScreen === 'lock' && (
            <LockScreenView
              themeMode={themeMode}
              onUnlock={() => setCurrentScreen('home')}
            />
          )}
        </div>


        {/* Home Indicator Bar (Exact from user template) */}
        <div 
          onClick={() => setCurrentScreen('home')}
          className="absolute z-20 bottom-[7px] left-1/2 -translate-x-1/2 w-[118px] h-[4px] rounded-[5px] bg-[#242321] cursor-pointer hover:w-[130px] transition-all"
          title="点击返回主屏幕"
        />

        {/* Customization Sheet Modal */}
        <HomeCustomizeSheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          currentTheme={themeMode}
          onSelectTheme={onSelectTheme}
        />

      </div>



    </div>
  );
}
