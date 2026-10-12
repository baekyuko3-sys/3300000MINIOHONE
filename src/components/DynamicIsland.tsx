import React, { useEffect, useMemo, useState } from 'react';
import {
  readMusicCurrent,
  readStrangerSession,
  getTogetherSessionInfo,
  parseLrc,
  strangerDisplayName,
  type MusicTrack,
  type MusicLyricLine,
} from '../store/music';
import type { AppearanceScheme } from '../store/appearance';

type PlaybackTick = {
  playing?: boolean;
  pos?: number;
  dur?: number;
};

export type IslandAppearance = Pick<
  AppearanceScheme,
  | 'islandShowIdleDot'
  | 'islandIdleLabel'
  | 'islandDotColor'
  | 'islandCollapsedStyle'
  | 'islandFontFamily'
>;

function coverStyle(track: MusicTrack | null): React.CSSProperties {
  if (track?.cover) {
    return {
      backgroundImage: `url(${track.cover})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    backgroundImage: 'linear-gradient(145deg,#fda4af,#67e8f9)',
  };
}

function dispatchMusicCommand(type: 'pp' | 'next' | 'prev') {
  window.dispatchEvent(new CustomEvent('sane333:music-command', { detail: { type } }));
}

/** 找当前 pos 对应的歌词行；返回 -1 表示还没开始。 */
function findLyricIndex(lyrics: MusicLyricLine[], pos: number): number {
  if (!lyrics.length) return -1;
  let lo = 0;
  let hi = lyrics.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lyrics[mid].time <= pos) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

interface DynamicIslandProps {
  enabled: boolean;
  onOpenMusic: () => void;
  island: IslandAppearance;
}

/**
 * 单独听 = A+D 白卡播放器
 * D：收起胶囊缩小消失 → 白玻璃播放器长出
 * A：封面 + 均衡器 + 滚动歌词 + 进度 + 上/暂停/下
 * （一起听另有面板，不混进单独听）
 */
export function DynamicIsland({ enabled, onOpenMusic, island }: DynamicIslandProps) {
  const [track, setTrack] = useState<MusicTrack | null>(() => readMusicCurrent());
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  const [togetherSession, setTogetherSession] = useState(() => {
    const session = readStrangerSession();
    return session && session.status !== 'ended' ? getTogetherSessionInfo(session) : null;
  });
  const [togetherStartedAt, setTogetherStartedAt] = useState<string | null>(() => {
    const session = readStrangerSession();
    return session && session.status !== 'ended' ? session.createdAt : null;
  });
  const [togetherMins, setTogetherMins] = useState(1);

  const isTogether = Boolean(togetherSession);

  useEffect(() => {
    const syncTrack = () => setTrack(readMusicCurrent());
    const onTick = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackTick>).detail || {};
      if (typeof detail.playing === 'boolean') setPlaying(detail.playing);
      if (typeof detail.pos === 'number') setPos(detail.pos);
      if (typeof detail.dur === 'number') setDur(detail.dur);
    };
    const onStrangerChanged = () => {
      const session = readStrangerSession();
      const active = session && session.status !== 'ended' ? session : null;
      setTogetherSession(active ? getTogetherSessionInfo(active) : null);
      setTogetherStartedAt(active ? active.createdAt : null);
      // 一起听生效后切到共听面板；结束则回到单独听/收起
      if (active) {
        setTrack(readMusicCurrent() || active.track || null);
        setOpen(true);
      } else {
        setTrack(readMusicCurrent());
        setOpen(false);
      }
    };
    window.addEventListener('sane333:music-changed', syncTrack);
    window.addEventListener('sane333:music-playback', onTick as EventListener);
    window.addEventListener('sane333:music-stranger-changed', onStrangerChanged);
    return () => {
      window.removeEventListener('sane333:music-changed', syncTrack);
      window.removeEventListener('sane333:music-playback', onTick as EventListener);
      window.removeEventListener('sane333:music-stranger-changed', onStrangerChanged);
    };
  }, []);

  useEffect(() => {
    const refreshMins = () => {
      if (!togetherStartedAt) {
        setTogetherMins(1);
        return;
      }
      const start = Date.parse(togetherStartedAt);
      if (!Number.isFinite(start)) {
        setTogetherMins(1);
        return;
      }
      setTogetherMins(Math.max(1, Math.floor((Date.now() - start) / 60000)));
    };
    refreshMins();
    const timer = window.setInterval(refreshMins, 15000);
    return () => window.clearInterval(timer);
  }, [togetherStartedAt]);

  useEffect(() => {
    if (!track) setOpen(false);
  }, [track]);

  const lyrics = useMemo<MusicLyricLine[]>(() => {
    if (!track) return [];
    if (Array.isArray(track.lyrics) && track.lyrics.length) return track.lyrics;
    const rawAny = track.raw as { lyric?: string; lrc?: string } | undefined;
    if (rawAny && typeof rawAny.lyric === 'string') return parseLrc(rawAny.lyric);
    if (rawAny && typeof rawAny.lrc === 'string') return parseLrc(rawAny.lrc);
    return [];
  }, [track]);

  const currentLyricIdx = useMemo(() => findLyricIndex(lyrics, pos), [lyrics, pos]);
  const lyricText =
    currentLyricIdx >= 0 && lyrics[currentLyricIdx]?.text
      ? lyrics[currentLyricIdx].text
      : track
        ? `正在听 ${track.name}`
        : '';

  if (!enabled) return null;

  const progress = dur > 0 ? Math.min(1, Math.max(0, pos / dur)) : 0;
  const idleLabel = (island.islandIdleLabel || '').trim();
  const showDot = island.islandShowIdleDot === true;
  const dotColor = island.islandDotColor || '#34d399';
  const isGlass = island.islandCollapsedStyle !== 'black';
  const fontFamily = island.islandFontFamily?.trim() || undefined;
  const idleHasContent = showDot || Boolean(idleLabel);

  const soloOpen = open && Boolean(track) && !isTogether;
  const togetherOpen = open && Boolean(track) && isTogether;
  const peerName = strangerDisplayName(readStrangerSession());

  const toggleOpen = () => {
    if (!track) {
      onOpenMusic();
      return;
    }
    setOpen((value) => !value);
  };

  const collapsedShell = isGlass
    ? 'bg-white/82 text-[#1c1917] border border-white/85 shadow-[0_10px_28px_rgba(40,50,70,.16),inset_0_1px_0_rgba(255,255,255,.7)] backdrop-blur-xl'
    : 'bg-[#0a0a0a] text-white shadow-[0_8px_28px_rgba(0,0,0,.35)] border border-transparent';

  const muted = isGlass ? 'text-black/40' : 'text-white/45';
  const strong = isGlass ? 'text-[#1c1917]' : 'text-white/95';

  return (
    <div
      className="absolute z-40 top-2 left-1/2 -translate-x-1/2 flex flex-col items-center"
      data-dynamic-island
      style={fontFamily ? { fontFamily } : undefined}
    >
      {(soloOpen || togetherOpen) && (
        <button
          type="button"
          className="absolute z-0 left-1/2 top-0 -translate-x-1/2 w-[400px] h-[900px] cursor-default bg-transparent"
          aria-label="收起灵动岛"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 收起胶囊 · D：展开时缩小消失 */}
      <button
        type="button"
        onClick={toggleOpen}
        className={`relative z-[2] h-[29px] rounded-[18px] flex items-center justify-center overflow-hidden transition-[transform,opacity,width] duration-300 ease-out ${collapsedShell} ${
          soloOpen || togetherOpen
            ? 'w-[118px] scale-50 opacity-0 pointer-events-none'
            : track
              ? 'w-[148px] px-2 justify-start gap-1.5'
              : idleHasContent
                ? 'w-[108px] px-2.5 gap-1.5'
                : 'w-[104px]'
        }`}
        title={track ? `正在播放 · ${track.name}` : '灵动岛'}
        aria-label={track ? `正在播放 ${track.name}` : '灵动岛'}
        aria-expanded={open}
      >
        {track ? (
          <>
            <span
              className="w-[18px] h-[18px] rounded-[6px] flex-none shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)]"
              style={coverStyle(track)}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-left">
              <span className={`block text-[9px] font-semibold truncate leading-tight ${strong}`}>{track.name}</span>
              <span className={`block text-[7px] truncate leading-tight ${muted}`}>
                {isTogether ? `与 ${peerName} 共听` : (track.artist || 'MUSIC')}
              </span>
            </span>
            <span className="island-eq flex items-end gap-[2px] h-[11px] flex-none" aria-hidden>
              <i className={playing ? 'on' : ''} />
              <i className={playing ? 'on' : ''} />
              <i className={playing ? 'on' : ''} />
              <i className={playing ? 'on' : ''} />
            </span>
          </>
        ) : idleHasContent ? (
          <>
            {showDot && (
              <span
                className="w-2 h-2 rounded-full flex-none"
                style={{ background: dotColor, boxShadow: `0 0 0 2px ${dotColor}33` }}
              />
            )}
            {idleLabel ? (
              <span className={`text-[9px] font-semibold tracking-wide ${strong}`}>{idleLabel}</span>
            ) : null}
          </>
        ) : null}
      </button>

      {/* 单独听 · A+D 白卡播放器（缩小版） */}
      <div
        className={`absolute top-0 left-1/2 z-[1] overflow-hidden rounded-[26px] border border-white/75 bg-white/92 text-[#1c1917] shadow-[0_16px_36px_rgba(0,0,0,.18),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(.2,1.15,.3,1)] ${
          soloOpen
            ? 'w-[min(92vw,236px)] h-[142px] opacity-100 -translate-x-1/2 scale-100 pointer-events-auto'
            : 'w-0 h-0 opacity-0 -translate-x-1/2 scale-[0.88] pointer-events-none'
        }`}
        style={{ padding: soloOpen ? '10px 11px 9px' : 0 }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-island-ctrl]')) return;
          setOpen(false);
        }}
      >
        {track && !isTogether && (
          <>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="w-[42px] h-[42px] rounded-[12px] flex-none shadow-[0_6px_14px_rgba(40,30,25,.16),inset_0_0_0_1px_rgba(255,255,255,.35)]"
                style={coverStyle(track)}
                aria-label="打开音乐"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMusic();
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-bold tracking-tight truncate leading-tight">{track.name}</div>
                <div className="mt-[2px] text-[10px] text-[#8a8178] truncate">{track.artist || 'Now Playing'}</div>
              </div>
              <span className="island-eq flex items-end gap-[2px] h-[11px] flex-none" aria-hidden>
                <i className={playing ? 'on' : ''} />
                <i className={playing ? 'on' : ''} />
                <i className={playing ? 'on' : ''} />
                <i className={playing ? 'on' : ''} />
              </span>
            </div>

            <div className="island-lyric mt-[8px] text-[11px] leading-[1.3] text-[#4a433c]" aria-label="歌词">
              <span key={lyricText}>{lyricText}</span>
            </div>

            <div className="mt-[8px] h-[2px] rounded-full bg-black/[0.08] overflow-hidden">
              <i
                className="block h-full rounded-full bg-gradient-to-r from-[#c4989a] to-[#dcb3ae] transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <div className="mt-[7px] flex items-center justify-between px-0.5" data-island-ctrl>
              <button
                type="button"
                className="w-[28px] h-[28px] rounded-full bg-black/[0.06] text-[#2d2724] grid place-items-center text-[10px]"
                aria-label="上一首"
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchMusicCommand('prev');
                }}
              >
                ⏮
              </button>
              <button
                type="button"
                className="w-[30px] h-[30px] rounded-full bg-[#1c1917] text-white grid place-items-center text-[10px]"
                aria-label={playing ? '暂停' : '播放'}
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchMusicCommand('pp');
                }}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className="w-[28px] h-[28px] rounded-full bg-black/[0.06] text-[#2d2724] grid place-items-center text-[10px]"
                aria-label="下一首"
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchMusicCommand('next');
                }}
              >
                ⏭
              </button>
            </div>
          </>
        )}
      </div>

      {/* 一起听 · A 方案：无头像，宋体「与 XX 共听 · N分钟」 */}
      <div
        className={`absolute top-0 left-1/2 z-[1] overflow-hidden rounded-[26px] border border-white/80 bg-white/92 text-[#1c1917] shadow-[0_12px_28px_rgba(0,0,0,.18)] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(.2,1.15,.3,1)] ${
          togetherOpen
            ? 'w-[min(92vw,236px)] h-[124px] opacity-100 -translate-x-1/2 scale-100 pointer-events-auto'
            : 'w-0 h-0 opacity-0 -translate-x-1/2 scale-[0.88] pointer-events-none'
        }`}
        style={{
          padding: togetherOpen ? '12px' : 0,
          fontFamily: '"Noto Serif SC","Source Han Serif SC","Songti SC",serif',
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-island-ctrl]')) return;
          setOpen(false);
        }}
      >
        {track && isTogether && togetherSession && (
          <>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="w-[44px] h-[44px] rounded-[14px] flex-none shadow-[0_6px_16px_rgba(40,30,25,.14)]"
                style={coverStyle(track)}
                aria-label="打开音乐"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMusic();
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold tracking-[0.04em] truncate leading-tight">
                  {track.name}
                </div>
                <div className="mt-[3px] text-[10px] font-medium tracking-[0.08em] text-[#8a8178] truncate leading-tight">
                  与 <span className="text-[#6f675f]">{peerName}</span> 共听 · {togetherMins}分钟
                </div>
              </div>
            </div>
            <div className="mt-2 h-[2px] rounded-full bg-black/[0.08] overflow-hidden">
              <i
                className="block h-full rounded-full bg-gradient-to-r from-[#c4989a] to-[#dcb3ae] transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between" data-island-ctrl>
              <button
                type="button"
                className="w-[28px] h-[28px] rounded-full bg-black/[0.06] grid place-items-center text-[10px]"
                aria-label="上一首"
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchMusicCommand('prev');
                }}
              >
                ⏮
              </button>
              <button
                type="button"
                className="w-[30px] h-[30px] rounded-full bg-[#1c1917] text-white grid place-items-center text-[10px]"
                aria-label={playing ? '暂停' : '播放'}
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchMusicCommand('pp');
                }}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className="w-[28px] h-[28px] rounded-full bg-black/[0.06] grid place-items-center text-[10px]"
                aria-label="下一首"
                onClick={(event) => {
                  event.stopPropagation();
                  dispatchMusicCommand('next');
                }}
              >
                ⏭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
