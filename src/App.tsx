import { useEffect, useState } from 'react';
import { ThemeMode, ScreenType } from './types';
import { PhoneSimulator } from './components/PhoneSimulator';
import { cleanupOldDemoData } from './store/blankPhoneMigration';

export default function App() {
  const release = '2026.10.17-ig-circle-update-v1';
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
            <div><b className="text-black/80">Instagram 全新上线</b><br/>信息流、快拍、发帖、评论、私信，支持真实图片视频上传。人设与 LINE 联通，改一边三边同步。</div>
            <div><b className="text-black/80">Circle（原 Threads）</b><br/>改名 Circle，发帖支持真图/视频，关注逻辑与 IG 一致。</div>
            <div><b className="text-black/80">IG 音乐状态</b><br/>个人页"🎵 正在听"，发帖可带音乐，角色/NPC 也能设。</div>
            <div><b className="text-black/80">AI 生图 + MiniMax 语音</b><br/>正面/负面提示词预设，锁脸生图；每个角色专属语音 ID；全部开关控制。</div>
            <div><b className="text-black/80">角色主动行为</b><br/>角色可主动发消息、打语音/视频电话、发照片，23:00-8:00 不打扰。</div>
            <div><b className="text-black/80">视频通话"看看TA现在"</b><br/>AI 根据聊天内容生成角色此刻的画面。</div>
            <div><b className="text-black/80">LINE Pay 钱包</b><br/>极简白设计，充值/明细/亲情卡。</div>
            <div><b className="text-black/80">主题三件套</b><br/>LINE 主题/聊天背景/字体大小，聊天内实时生效。</div>
            <div><b className="text-black/80">评论管理</b><br/>朋友圈评论可删除/重新生成，非好友评论自动过滤。</div>
            <div><b className="text-black/80">线下邀约联通</b><br/>接受邀约后自动跳转线下 App。</div>
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
