import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { readPersistentState } from '../../store/usePersistentState';

export const TEXT_CARD_STYLE_KEY = 'line:textcard-style';
export const VIDEO_CARD_STYLE_KEY = 'line:videocard-style';
export const TEXT_CARD_LOADING_KEY = 'line:textcard-loading-label';
export const VIDEO_CARD_DURATION_KEY = 'line:videocard-duration';

export type TextCardStyleId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export const TEXT_CARD_STYLES: Array<{
  id: TextCardStyleId;
  name: string;
  border: string;
  text: string;
  sub: string;
  bar: string;
}> = [
  { id: 'a', name: '墨线', border: '#e3e3e5', text: '#202124', sub: '#aaa', bar: '#202124' },
  { id: 'b', name: '樱粉', border: '#f0d9de', text: '#8c5f6b', sub: '#c49aa4', bar: '#d4aab5' },
  { id: 'c', name: '薄荷', border: '#cfe6d9', text: '#3f6154', sub: '#8fb5a3', bar: '#7fb69e' },
  { id: 'd', name: '奶茶', border: '#e5d6bf', text: '#77644f', sub: '#bfa887', bar: '#c9a97e' },
  { id: 'e', name: '雾蓝', border: '#d3dcea', text: '#4a5d7a', sub: '#9aadc9', bar: '#8ba3c7' },
  { id: 'f', name: '朱砂', border: '#e8c9c4', text: '#333333', sub: '#c99', bar: '#c66' },
];

/** 图片卡封面「加载中」文案选项（来自 card-prototype） */
export const IMAGE_LOADING_LABELS: Array<{
  id: string;
  name: string;
  note: string;
  text: string;
}> = [
  { id: 'ja', name: '日本語', note: '推荐感最强', text: '読み込み中' },
  { id: 'en', name: 'English', note: '干净', text: 'Loading…' },
  { id: 'zh-TW', name: '繁體中文', note: '温柔', text: '圖片載入中' },
  { id: 'zh-CN', name: '简体中文', note: '直白', text: '图片加载中' },
  { id: 'ja-soft', name: '日本語…', note: '稍软', text: '読み込み中…' },
  { id: 'en-full', name: 'English full', note: '偏说明', text: 'Image loading' },
];

const DEFAULT_LOADING_LABEL = IMAGE_LOADING_LABELS[0].text;
const DEFAULT_VIDEO_DURATION = 12;

const LEGACY_STYLE_ALIASES: Record<string, TextCardStyleId> = {
  sakura: 'b',
  mint: 'c',
  milktea: 'd',
  ink: 'a',
};

function normalizeCardStyleId(cardStyle?: string): string {
  let id = String(cardStyle ?? '').trim();
  if (
    (id.startsWith('"') && id.endsWith('"')) ||
    (id.startsWith("'") && id.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(id);
      if (typeof parsed === 'string') id = parsed.trim();
    } catch {
      id = id.slice(1, -1).trim();
    }
  }
  return LEGACY_STYLE_ALIASES[id] || id || 'a';
}

export function resolveTextCardStyle(cardStyle?: string) {
  const id = normalizeCardStyleId(cardStyle);
  return TEXT_CARD_STYLES.find(item => item.id === id) || TEXT_CARD_STYLES[0];
}

export function readStoredImageLoadingLabel(): string {
  const raw = readPersistentState<string>(TEXT_CARD_LOADING_KEY, DEFAULT_LOADING_LABEL);
  const text = String(raw || '').trim();
  if (IMAGE_LOADING_LABELS.some(item => item.text === text)) return text;
  return DEFAULT_LOADING_LABEL;
}

/** 默认视频秒数；0 / 非法值表示按文字长度自动估算 */
export function readStoredVideoDuration(): number {
  const raw = readPersistentState<number>(VIDEO_CARD_DURATION_KEY, DEFAULT_VIDEO_DURATION);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(599, Math.max(1, Math.round(n)));
}

export function formatVideoCardDuration(secs: number): string {
  const total = Math.min(599, Math.max(1, Math.round(secs)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function resolveVideoCardSeconds(input?: {
  duration?: number | string | null;
  text?: string;
}): number {
  const explicit = Number(input?.duration);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(599, Math.max(1, Math.round(explicit)));
  }
  const stored = readStoredVideoDuration();
  if (stored > 0) return stored;
  const text = String(input?.text || '');
  return Math.min(59, Math.max(5, Math.ceil(text.length / 4) || 5));
}

type CardLayout = 'moments' | 'chat';

/** 短文居中；长文从顶部起排 */
export function isShortCardText(text?: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  const lines = t.split(/\n/).filter(Boolean);
  return t.length <= 36 && lines.length <= 3;
}

function cardShellClass(layout: CardLayout) {
  return layout === 'chat'
    ? 'block w-[118px] aspect-square text-left bg-white rounded-[12px] relative overflow-hidden p-0'
    : 'ml-[59px] mt-3 block w-[44%] max-w-[136px] aspect-square text-left bg-white rounded-[12px] relative overflow-hidden p-0';
}

/** 杂志引版式 + 夜读字距：短句居中带引号，长文顶起可下滑 */
const CARD_TEXT_FONT = '"Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", Georgia, serif';

export function TextCardView({
  text,
  cardStyle,
  layout = 'moments',
  loadingLabel,
  onContextMenu,
}: {
  text: string;
  cardStyle?: string;
  layout?: CardLayout;
  loadingLabel?: string;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const s = resolveTextCardStyle(cardStyle);
  const label = (loadingLabel && loadingLabel.trim()) || readStoredImageLoadingLabel();
  const shortText = isShortCardText(text);
  const bodySize = layout === 'chat' ? (shortText ? 14 : 11.5) : (shortText ? 15 : 12);
  const quoteColor = s.sub;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(v => !v);
      }}
      onContextMenu={onContextMenu}
      className={cardShellClass(layout)}
      style={{ border: `1px solid ${s.border}` }}
    >
      {!open ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3">
          <span
            className="block w-[18px] h-[18px] rounded-full border-[1.5px] border-transparent animate-spin opacity-70"
            style={{ borderTopColor: s.bar, borderRightColor: s.bar }}
          />
          <span className="text-[10px] tracking-[0.5px] text-center leading-tight" style={{ color: s.sub }}>
            {label}
          </span>
          <span className="text-[7px] tracking-[2px] font-mono opacity-70" style={{ color: s.sub }}>
            TEXT IMAGE
          </span>
        </div>
      ) : shortText ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 py-5 text-center">
          <span
            aria-hidden
            className="absolute top-1 left-2 leading-none select-none"
            style={{ color: quoteColor, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: layout === 'chat' ? 22 : 26, opacity: 0.75 }}
          >
            “
          </span>
          <div
            className="whitespace-pre-wrap relative z-[1]"
            style={{
              color: s.text,
              fontFamily: CARD_TEXT_FONT,
              fontSize: bodySize,
              lineHeight: 1.6,
              letterSpacing: '0.14em',
              fontWeight: 400,
            }}
          >
            {text}
          </div>
          <span
            aria-hidden
            className="absolute bottom-2 right-2.5 leading-none select-none"
            style={{ color: quoteColor, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: layout === 'chat' ? 22 : 26, opacity: 0.75 }}
          >
            ”
          </span>
        </div>
      ) : (
        <div
          className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pt-2.5 pb-4 text-left [-webkit-overflow-scrolling:touch]"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="text-[7px] tracking-[2px] font-mono mb-2" style={{ color: s.sub }}>
            TEXT IMAGE
          </div>
          <div className="relative">
            <span
              aria-hidden
              className="absolute -top-1 left-0 leading-none select-none pointer-events-none"
              style={{ color: quoteColor, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, opacity: 0.55 }}
            >
              “
            </span>
            <div
              className="whitespace-pre-wrap pl-0.5"
              style={{
                color: s.text,
                fontFamily: CARD_TEXT_FONT,
                fontSize: bodySize,
                lineHeight: 2,
                letterSpacing: '0.08em',
                fontWeight: 400,
              }}
            >
              {text}
            </div>
            <span
              aria-hidden
              className="block text-right leading-none select-none mt-1"
              style={{ color: quoteColor, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, opacity: 0.55 }}
            >
              ”
            </span>
          </div>
        </div>
      )}
      <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-black/5 z-[2] pointer-events-none">
        <i className="block h-full opacity-80" style={{ width: '28%', background: s.bar }} />
      </span>
    </button>
  );
}

const VIDEO_SEEK_STEP = 5;

function formatPlayClock(sec: number): string {
  const n = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function VideoCardView({
  text,
  cardStyle,
  layout = 'moments',
  duration,
  onContextMenu,
}: {
  text: string;
  cardStyle?: string;
  layout?: CardLayout;
  duration?: number | string | null;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const s = resolveTextCardStyle(cardStyle);
  const secs = resolveVideoCardSeconds({ duration, text });
  const shortText = isShortCardText(text);
  const compact = layout === 'chat';
  const baseRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const resumeAfterScrubRef = useRef(false);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  const stopPlayback = () => {
    setActive(false);
    setPaused(false);
    setElapsed(0);
    baseRef.current = 0;
    startedAtRef.current = null;
  };

  const startFrom = (at: number) => {
    const next = Math.min(secs, Math.max(0, at));
    baseRef.current = next;
    startedAtRef.current = null;
    setElapsed(next);
    setActive(true);
    setPaused(false);
  };

  useEffect(() => {
    if (!active || paused || scrubbing) return;
    let raf = 0;
    const tick = (now: number) => {
      if (startedAtRef.current == null) startedAtRef.current = now;
      const t = baseRef.current + (now - startedAtRef.current) / 1000;
      if (t >= secs) {
        setElapsed(secs);
        baseRef.current = secs;
        startedAtRef.current = null;
        setPaused(true);
        return;
      }
      setElapsed(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, paused, scrubbing, secs]);

  const togglePause = () => {
    if (!active) {
      startFrom(0);
      return;
    }
    if (paused) {
      if (elapsed >= secs) {
        startFrom(0);
        return;
      }
      baseRef.current = elapsed;
      startedAtRef.current = null;
      setPaused(false);
      return;
    }
    baseRef.current = elapsed;
    startedAtRef.current = null;
    setPaused(true);
  };

  const seekBy = (delta: number) => {
    if (!active) {
      startFrom(Math.max(0, delta));
      return;
    }
    const next = Math.min(secs, Math.max(0, elapsed + delta));
    baseRef.current = next;
    startedAtRef.current = null;
    setElapsed(next);
    if (next >= secs) setPaused(true);
  };

  const progressPct = secs > 0 ? Math.min(100, (elapsed / secs) * 100) : 0;
  const bodySize = shortText
    ? (compact ? 12 : 13)
    : (compact ? 10.5 : 11.5);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (active) return;
        startFrom(0);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (!active) startFrom(0);
        }
      }}
      onContextMenu={onContextMenu}
      className={cardShellClass(layout)}
      style={{ border: `1px solid ${s.border}` }}
    >
      {!active && (
        <>
          <div className="absolute top-2 left-2 z-[2] text-[7px] tracking-[2px] font-mono pointer-events-none" style={{ color: s.sub }}>
            TEXT VIDEO
          </div>
          <div
            className="absolute top-1.5 right-1.5 z-[2] text-[7px] px-1.5 py-0.5 rounded-full border bg-white pointer-events-none"
            style={{ color: s.sub, borderColor: s.border }}
          >
            {formatVideoCardDuration(secs)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-[8px] flex items-center justify-center pointer-events-none">
            <span
              className="inline-flex w-8 h-8 rounded-full bg-white border-[1.5px] items-center justify-center text-[11px] pl-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
              style={{ borderColor: s.bar, color: s.bar }}
            >
              ▶
            </span>
          </div>
          <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-black/[0.06] z-[3] pointer-events-none">
            <i className="block h-full w-[18%] opacity-85" style={{ background: s.bar }} />
          </span>
        </>
      )}

      {active && (
        <>
          {/* B：顶起左对齐文字（无竖线）；字多可下滑 */}
          <div
            className="absolute inset-x-0 top-0 z-[2] overflow-y-auto overscroll-contain px-3.5 pt-4 pb-2 text-left [-webkit-overflow-scrolling:touch]"
            style={{ bottom: compact ? 46 : 50 }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="whitespace-pre-wrap break-words"
              style={{
                color: s.text,
                fontFamily: CARD_TEXT_FONT,
                fontSize: bodySize,
                lineHeight: shortText ? 1.7 : 1.9,
                letterSpacing: shortText ? '0.06em' : '0.04em',
                fontWeight: 400,
              }}
            >
              {text}
            </div>
          </div>

          {/* 1 的底栏：进度 + 返回 / 快退 / 暂停 / 快进（无大圆键） */}
          <div
            className="absolute inset-x-0 bottom-0 z-[4] px-2.5 pt-1 pb-1.5"
            style={{ background: 'linear-gradient(180deg, rgba(255,254,251,0), #fffefb 32%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1 h-3.5 flex items-center">
                <input
                  aria-label="播放进度"
                  type="range"
                  min={0}
                  max={secs}
                  step={0.05}
                  value={Math.min(elapsed, secs)}
                  onPointerDown={() => {
                    resumeAfterScrubRef.current = !paused && elapsed < secs;
                    setScrubbing(true);
                    baseRef.current = elapsed;
                    startedAtRef.current = null;
                    setPaused(true);
                  }}
                  onPointerUp={() => {
                    const at = elapsedRef.current;
                    setScrubbing(false);
                    baseRef.current = at;
                    startedAtRef.current = null;
                    if (resumeAfterScrubRef.current && at < secs) setPaused(false);
                    resumeAfterScrubRef.current = false;
                  }}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    const next = Math.min(secs, Math.max(0, n));
                    setElapsed(next);
                    baseRef.current = next;
                    startedAtRef.current = null;
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-[1]"
                />
                <span className="pointer-events-none absolute left-0 right-0 h-[2px] rounded-full bg-black/[0.08]" />
                <span
                  className="pointer-events-none absolute left-0 h-[2px] rounded-full"
                  style={{ width: `${progressPct}%`, background: s.bar }}
                />
                <span
                  className="pointer-events-none absolute top-1/2 h-2 w-2 -mt-1 -ml-1 rounded-full"
                  style={{ left: `${progressPct}%`, background: s.bar }}
                />
              </div>
              <span className="shrink-0 text-[7px] tabular-nums font-mono" style={{ color: s.sub }}>
                {formatPlayClock(elapsed)}/{formatVideoCardDuration(secs)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                aria-label="返回封面"
                className="grid h-5 w-5 place-items-center"
                style={{ color: s.sub }}
                onClick={(e) => {
                  e.stopPropagation();
                  stopPlayback();
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label={`快退 ${VIDEO_SEEK_STEP} 秒`}
                  className="grid h-5 w-5 place-items-center"
                  style={{ color: s.bar }}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekBy(-VIDEO_SEEK_STEP);
                  }}
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={paused ? '播放' : '暂停'}
                  className="grid h-5 w-5 place-items-center"
                  style={{ color: s.bar }}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePause();
                  }}
                >
                  {paused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
                </button>
                <button
                  type="button"
                  aria-label={`快进 ${VIDEO_SEEK_STEP} 秒`}
                  className="grid h-5 w-5 place-items-center"
                  style={{ color: s.bar }}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekBy(VIDEO_SEEK_STEP);
                  }}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="w-5" aria-hidden />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TextCardStylePicker({
  value,
  onChange,
  kind = 'image',
  loadingLabel,
  durationSecs,
}: {
  value: string;
  onChange: (id: string) => void;
  kind?: 'image' | 'video';
  loadingLabel?: string;
  durationSecs?: number;
}) {
  const label = loadingLabel || readStoredImageLoadingLabel();
  const secs = durationSecs && durationSecs > 0 ? durationSecs : DEFAULT_VIDEO_DURATION;

  return (
    <div className="grid grid-cols-3 gap-2">
      {TEXT_CARD_STYLES.map(st => (
        <button
          key={st.id}
          type="button"
          onClick={() => onChange(st.id)}
          className="rounded-[12px] border p-2 bg-white text-left"
          style={{ borderColor: value === st.id ? '#202124' : '#eeeeef' }}
        >
          {kind === 'video' ? (
            <div className="aspect-square rounded-[8px] bg-white border relative overflow-hidden" style={{ borderColor: st.border }}>
              <span className="absolute top-1.5 left-1.5 text-[6px] tracking-[1px] font-mono" style={{ color: st.sub }}>TEXT VIDEO</span>
              <span className="absolute top-1 right-1 text-[6px] px-1 rounded-full border bg-white" style={{ color: st.sub, borderColor: st.border }}>
                {formatVideoCardDuration(secs)}
              </span>
              <span className="absolute inset-0 bottom-[6px] flex items-center justify-center">
                <span className="w-7 h-7 rounded-full bg-white border flex items-center justify-center text-[10px]" style={{ borderColor: st.bar, color: st.bar }}>▶</span>
              </span>
              <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-black/5">
                <i className="block h-full w-[18%]" style={{ background: st.bar }} />
              </span>
            </div>
          ) : (
            <div className="aspect-square rounded-[8px] bg-white border relative overflow-hidden flex flex-col items-center justify-center gap-1.5 px-1" style={{ borderColor: st.border }}>
              <span
                className="block w-3.5 h-3.5 rounded-full border border-transparent animate-spin opacity-70"
                style={{ borderTopColor: st.bar, borderRightColor: st.bar }}
              />
              <span className="text-[8px] text-center leading-tight" style={{ color: st.sub }}>{label}</span>
              <span className="text-[6px] tracking-[1px] font-mono opacity-70" style={{ color: st.sub }}>TEXT IMAGE</span>
              <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-black/5">
                <i className="block h-full w-[28%]" style={{ background: st.bar }} />
              </span>
            </div>
          )}
          <div className="mt-1 text-center text-[9px]" style={{ color: value === st.id ? '#202124' : '#999' }}>
            {st.name}{value === st.id ? ' ✓' : ''}
          </div>
        </button>
      ))}
    </div>
  );
}

export function ImageLoadingLabelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {IMAGE_LOADING_LABELS.map(opt => {
        const pick = value === opt.text;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.text)}
            className="rounded-[12px] border p-2.5 bg-white text-left"
            style={{
              borderColor: pick ? '#202124' : '#eeeeef',
              boxShadow: pick ? '0 0 0 1px #202124' : undefined,
            }}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-semibold text-[#333]">{opt.name}</span>
              <span className="text-[9px] text-[#aaa]">{pick ? '✓' : opt.note}</span>
            </div>
            <div className="text-[11px]" style={{ color: pick ? '#202124' : '#888' }}>{opt.text}</div>
          </button>
        );
      })}
    </div>
  );
}

export function VideoDurationSetter({
  value,
  onChange,
}: {
  value: number;
  onChange: (secs: number) => void;
}) {
  const modeAuto = !value || value <= 0;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`flex-1 py-2 rounded-[10px] text-[10px] border ${modeAuto ? 'bg-[#202124] text-white border-[#202124]' : 'bg-white text-[#666] border-[#eeeeef]'}`}
        >
          按文字长度自动
        </button>
        <button
          type="button"
          onClick={() => onChange(value > 0 ? value : DEFAULT_VIDEO_DURATION)}
          className={`flex-1 py-2 rounded-[10px] text-[10px] border ${!modeAuto ? 'bg-[#202124] text-white border-[#202124]' : 'bg-white text-[#666] border-[#eeeeef]'}`}
        >
          自定义秒数
        </button>
      </div>
      {!modeAuto && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={599}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              onChange(Math.min(599, Math.max(1, Math.round(n))));
            }}
            className="w-20 p-2 bg-[#fafafa] border border-[#e8e8e9] rounded-[9px] text-[12px] outline-none text-center"
          />
          <span className="text-[10px] text-[#888]">秒 · 封面显示 {formatVideoCardDuration(value)}</span>
        </div>
      )}
      <div className="text-[9px] text-[#aaa] leading-relaxed">
        {modeAuto
          ? '未设固定秒数时，按描述字数估算（约 5–59 秒）。发单条视频卡时也可临时改秒数。'
          : `默认固定 ${value} 秒（${formatVideoCardDuration(value)}）。发单条时可再改。`}
      </div>
    </div>
  );
}
