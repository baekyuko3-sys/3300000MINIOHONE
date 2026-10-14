import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Camera, Flashlight, Lock, Fingerprint, Delete, KeyRound } from 'lucide-react';
import type { ThemeMode } from '../../types';
import { readAppearance } from '../../store/appearance';

interface LockScreenViewProps {
  themeMode: ThemeMode;
  onUnlock: () => void;
  onOpenNotifications?: () => void;
}

type UnlockStage = 'idle' | 'passcode' | 'fingerprint' | 'success';

export function LockScreenView({ themeMode, onUnlock }: LockScreenViewProps) {
  const [now, setNow] = useState(new Date());
  const [appearance] = useState(() => readAppearance());
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [stage, setStage] = useState<UnlockStage>('idle');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [fingerprintProgress, setFingerprintProgress] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const isDark = themeMode === 'dark-luxury';
  const isModern = appearance.phoneShell !== 'modern' ? false : true;

  // 锁屏字体：跟全局设置
  const fontFamily = appearance.customFont || 'inherit';
  const fontSize = appearance.customFontSize || 1;

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const weekdayDate = now.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (stage === 'success') {
      const t = window.setTimeout(() => onUnlock(), 320);
      return () => window.clearTimeout(t);
    }
  }, [stage, onUnlock]);

  useEffect(() => {
    if (stage !== 'fingerprint') return;
    setFingerprintProgress(0);
    const start = performance.now();
    const duration = 1100;
    let raf = 0;
    const step = (timestamp: number) => {
      const elapsed = timestamp - start;
      const next = Math.min(1, elapsed / duration);
      setFingerprintProgress(next);
      if (next < 1) raf = window.requestAnimationFrame(step);
      else setStage('success');
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [stage]);

  // 优先级：passcode > fingerprint > swipe
  const hasPasscode = appearance.lockMethods.includes('passcode') && appearance.lockPasscode.length >= 4;
  const hasFingerprint = appearance.lockMethods.includes('fingerprint') && !hasPasscode;
  const hasSwipe = appearance.lockMethods.includes('swipe');

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (stage !== 'idle' || !hasSwipe) return;
    touchStartY.current = event.clientY;
    touchStartTime.current = performance.now();
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const startY = touchStartY.current;
    if (startY === null || stage !== 'idle' || !hasSwipe) return;
    setSwipeOffset(Math.min(190, Math.max(0, startY - event.clientY)));
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const startY = touchStartY.current;
    const startTime = touchStartTime.current;
    touchStartY.current = null;
    setIsDragging(false);
    if (startY === null) return;
    const dy = startY - event.clientY;
    const dt = performance.now() - startTime;
    const velocity = dy / Math.max(1, dt);
    if (stage === 'idle' && hasSwipe && (dy > 112 || (dy > 58 && velocity > 0.55))) {
      setSwipeOffset(240);
      handleSwipeUp();
    } else {
      setSwipeOffset(0);
    }
  };
  const handlePointerCancel = () => {
    touchStartY.current = null;
    setIsDragging(false);
    setSwipeOffset(0);
  };

  const handleSwipeUp = () => {
    if (hasPasscode) {
      setStage('passcode');
      setPasscode('');
      setError('');
    } else if (hasFingerprint) {
      setStage('fingerprint');
    } else {
      setStage('success');
    }
  };

  const handlePasscodeKey = (digit: string) => {
    if (passcode.length >= 6) return;
    const next = passcode + digit;
    setPasscode(next);
    setError('');
    if (next.length >= appearance.lockPasscode.length) {
      if (next === appearance.lockPasscode) {
        setStage('success');
      } else {
        setError('密码错误');
        window.setTimeout(() => {
          setPasscode('');
          setError('');
        }, 600);
      }
    }
  };

  const handlePasscodeDelete = () => {
    setPasscode(value => value.slice(0, -1));
    setError('');
  };

  const handleFingerprintStart = () => {
    setStage('fingerprint');
  };

  // 锁屏壁纸优先级：lockWallpaper > wallpaper
  const wallpaper = appearance.lockWallpaper || appearance.wallpaper;
  const wallpaperIsImage = !!wallpaper && (wallpaper.startsWith('data:image/') || wallpaper.startsWith('https://') || wallpaper.startsWith('http://') || wallpaper.startsWith('blob:'));

  // iOS 风格：大号时间、居中显示
  const isLarge = appearance.lockStyle === 'ios-large';
  const timeFontSize = isLarge ? 96 : 64;
  const swipeProgress = Math.min(1, swipeOffset / 150);
  const lockContentStyle = {
    transform: stage === 'success'
      ? 'translateY(-38%) scale(0.96)'
      : `translateY(${-swipeOffset * 0.72}px) scale(${1 - swipeProgress * 0.035})`,
    opacity: stage === 'success' ? 0 : 1 - swipeProgress * 0.28,
    transition: isDragging ? 'none' : 'transform 520ms cubic-bezier(.2,.9,.16,1), opacity 360ms ease',
  };
  const bottomChromeStyle = {
    transform: stage === 'success' ? 'translateY(120px)' : `translateY(${swipeOffset * 0.24}px)`,
    opacity: stage === 'success' ? 0 : 1 - swipeProgress * 0.45,
    transition: isDragging ? 'none' : 'transform 520ms cubic-bezier(.2,.9,.16,1), opacity 360ms ease',
  };

  return (
    <div
      className="absolute inset-0 z-[30] flex h-full select-none flex-col overflow-hidden text-white"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        background: wallpaperIsImage
          ? `linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.04) 35%, rgba(0,0,0,.55) 100%), url("${wallpaper}") center / cover no-repeat`
          : isDark
            ? 'linear-gradient(160deg, #1a2630 0%, #354b5a 42%, #101923 100%)'
            : 'linear-gradient(160deg, #8eb3c6 0%, #c8d9e0 36%, #829eaf 70%, #334d60 100%)',
        fontFamily,
        fontSize: `${fontSize}em`,
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.08), transparent 32%, rgba(0,0,0,.1) 58%, rgba(0,0,0,.28))' }} />

      {/* 顶部状态：已锁定徽标 */}
      {stage === 'idle' && (
        <div className="relative z-10 flex items-center justify-center pt-[12px]" style={lockContentStyle}>
          <div className="flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md">
            <Lock className="h-3 w-3" strokeWidth={2.2} />
            <span>已锁定</span>
          </div>
        </div>
      )}

      {/* iOS 大号时间 */}
      {stage === 'idle' && (
        <div className="relative z-10 mt-[60px] flex-1 flex flex-col items-center justify-start" style={lockContentStyle}>
          <div className="text-center" style={{ textShadow: '0 2px 18px rgba(0,0,0,.45)' }}>
            <div className="text-[15px] font-medium tracking-wide text-white/95">{weekdayDate}</div>
            <div
              className="mt-1 font-light leading-[.98] tabular-nums"
              style={{ fontSize: `${timeFontSize}px`, letterSpacing: '-0.06em', fontWeight: 200 }}
            >
              {time}
            </div>
          </div>

          {/* 通知卡片（iOS 风格） */}
          <div className="mt-10 w-[88%] max-w-[330px] rounded-[20px] border border-white/15 bg-white/12 px-4 py-3 shadow-lg backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-white/85">
              <div className="grid h-5 w-5 place-items-center rounded-[6px] bg-white/90 text-[9px] font-bold text-[#4d6877]">小</div>
              <span>小手机</span>
              <span className="ml-auto font-normal text-white/65">现在</span>
            </div>
            <div className="mt-2 text-[12px] font-semibold">你的私人空间</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-white/85">
              {hasSwipe ? '向上滑动解锁，继续使用小手机。' : '点击下方按钮解锁，继续使用小手机。'}
            </div>
          </div>

          {/* 快捷解锁按钮（无 swipe 时显示） */}
          {!hasSwipe && (
            <button
              type="button"
              onClick={handleSwipeUp}
              className="mt-6 flex items-center gap-2 rounded-full bg-white/15 border border-white/20 backdrop-blur-xl px-5 py-2.5 text-[11px] font-medium text-white shadow-lg active:scale-95 transition"
            >
              {hasFingerprint ? <Fingerprint className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
              {hasFingerprint ? '点击指纹解锁' : '点击输入密码'}
            </button>
          )}
        </div>
      )}

      {/* 密码解锁面板（iOS 数字键盘） */}
      {stage === 'passcode' && (
        <div className="relative z-10 mt-[80px] flex-1 flex flex-col items-center">
          <div className="text-center">
            <div className="text-[14px] font-medium text-white/90">输入密码</div>
            <div className="mt-1 text-[11px] text-white/65">{appearance.lockPasscode.length} 位数字密码</div>
          </div>
          {/* 密码点 */}
          <div className="mt-8 flex gap-4">
            {Array.from({ length: appearance.lockPasscode.length }).map((_, index) => {
              const filled = index < passcode.length;
              return (
                <div
                  key={index}
                  className={`h-3 w-3 rounded-full transition-all ${
                    filled ? 'bg-white' : 'bg-transparent border border-white/55'
                  } ${error ? 'border-red-400 bg-red-400' : ''}`}
                />
              );
            })}
          </div>
          {error && <div className="mt-3 text-[11px] text-red-300">{error}</div>}

          {/* 数字键盘 */}
          <div className="mt-auto mb-12 w-[88%] max-w-[300px] grid grid-cols-3 gap-x-6 gap-y-3">
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, i) => {
              if (key === '') return <div key={i} />;
              if (key === 'del') {
                return (
                  <button
                    key={i}
                    onClick={handlePasscodeDelete}
                    className="grid h-16 place-items-center text-white/85 active:bg-white/10 rounded-full transition"
                    aria-label="删除"
                  >
                    <Delete className="h-5 w-5" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handlePasscodeKey(key)}
                  className="grid h-16 w-16 place-self-center place-items-center rounded-full bg-white/12 backdrop-blur-md text-white text-[26px] font-light active:bg-white/25 transition"
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 指纹解锁面板 */}
      {stage === 'fingerprint' && (
        <div className="relative z-10 mt-[140px] flex-1 flex flex-col items-center justify-start">
          <Fingerprint className="h-20 w-20 text-white/85" strokeWidth={1.4} />
          <div className="mt-6 h-1 w-44 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-white/90 transition-all"
              style={{ width: `${fingerprintProgress * 100}%` }}
            />
          </div>
          <div className="mt-4 text-[12px] text-white/75">正在识别指纹…</div>
          <button
            onClick={handleFingerprintStart}
            className="mt-10 text-[11px] text-white/60 underline"
          >
            重新识别
          </button>
        </div>
      )}

      {/* 成功瞬间：短暂白闪 */}
      {stage === 'success' && (
        <div className="pointer-events-none absolute inset-0 z-50 bg-white/80 transition-opacity" />
      )}

      {/* 底部：手电筒 + 解锁提示 + 相机 */}
      {stage === 'idle' && (
        <div className="relative z-10 mt-auto px-8 pb-8" style={bottomChromeStyle}>
          <div className="mb-7 flex items-center justify-between">
            <button
              type="button"
              aria-label="手电筒"
              onClick={() => setFlashlightOn(value => !value)}
              className={`grid h-[46px] w-[46px] place-items-center rounded-full border border-white/20 backdrop-blur-xl transition ${
                flashlightOn ? 'bg-white text-[#27333a]' : 'bg-black/25 text-white'
              }`}
            >
              <Flashlight className="h-[19px] w-[19px]" />
            </button>
            <button
              type="button"
              aria-label="解锁手机"
              onClick={handleSwipeUp}
              onMouseEnter={() => setShowHint(true)}
              onMouseLeave={() => setShowHint(false)}
              className="flex flex-col items-center gap-1.5 text-white/90 active:scale-95 transition"
            >
              <ChevronUp className="h-5 w-5 animate-bounce" />
              <span className="text-[10px] tracking-wide">{hasSwipe ? '上滑解锁' : '点击解锁'}</span>
            </button>
            <button
              type="button"
              aria-label="相机"
              onClick={handleSwipeUp}
              className="grid h-[46px] w-[46px] place-items-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-xl active:scale-95 transition"
            >
              <Camera className="h-[19px] w-[19px]" />
            </button>
          </div>
          {isModern && <div className="mx-auto h-[5px] w-[118px] rounded-full bg-white/90 shadow-sm" />}
        </div>
      )}
    </div>
  );
}

function ChevronUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
