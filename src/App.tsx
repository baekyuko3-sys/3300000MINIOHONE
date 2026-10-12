import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from './types';
import { PhoneSimulator } from './components/PhoneSimulator';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

export default function App() {
  const release = '2026.10.09-preset-studio-v1';
  const [themeMode, setThemeMode] = useState<ThemeMode>('nordic-light');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    cleanupOldDemoData();
    const seen = window.localStorage.getItem('sane333:last-seen-release');
    if (seen !== release) setShowUpdate(true);
    const marker = 'sane333:blank-foundation-v1';
    if (!window.localStorage.getItem(marker)) {
      for (const key of [
        'line:masks',
        'line:current-user',
        'line:chat-items',
        'line:friends-list',
        'line:global-favorites',
        'line:moments-posts',
        'line:moments-screen-posts',
        'phone:threads',
        'phone:notes',
        'phone:gallery',
        'phone:world-runtime-v1',
      ]) {
        window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(marker, 'done');
    }
  }, []);

  return (
    <>
    <main className="min-h-screen w-full bg-[#eeeae4] flex items-center justify-center overflow-hidden">
      <PhoneSimulator
        themeMode={themeMode}
        currentScreen={currentScreen}
        setCurrentScreen={setCurrentScreen}
        onSelectTheme={setThemeMode}
      />
    </main>
    {showUpdate && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/25 px-6 backdrop-blur-sm">
        <div className="w-full max-w-[360px] max-h-[min(88vh,680px)] overflow-hidden rounded-[30px] bg-[#f8f6f1] p-6 shadow-2xl border border-black/5 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-mono tracking-[2px] text-black/35">SANE333 · UPDATE</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#292724]">这次更新了什么？</h2>
            </div>
            <button onClick={() => { window.localStorage.setItem('sane333:last-seen-release', release); setShowUpdate(false); }} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"><span className="text-lg">×</span></button>
          </div>
          <div className="mt-5 max-h-[min(52vh,390px)] overflow-y-auto pr-1 space-y-3 text-[11px] leading-5 text-black/65">
            <div><b className="text-black/80">预设工坊 · 三种独立分类</b><br/>预设 App 现在分别管理线上单聊、线上群聊和线下剧情预设，各分类有独立预设列表。</div>
            <div><b className="text-black/80">预设工坊 · 酒馆式条目管理</b><br/>可添加、编辑、保存、启用/禁用、删除和调整提示词条目顺序，并设置角色、注入位置、Depth 与 Order。</div>
            <div><b className="text-black/80">预设工坊 · 导入导出与格式参数</b><br/>支持单个预设或整套预设库导入导出，并可编辑 Temperature、Top P、Penalty、最大输出 tokens、模型前后缀和停止序列。</div>
          </div>
          <div className="mt-5 flex items-center justify-between text-[10px] text-black/35">
            <span>release {release}</span>
            <button onClick={() => { window.localStorage.setItem('sane333:last-seen-release', release); setShowUpdate(false); }} className="rounded-full bg-[#292724] px-5 py-2.5 text-white tracking-[1px]">知道了 · ENTER</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
