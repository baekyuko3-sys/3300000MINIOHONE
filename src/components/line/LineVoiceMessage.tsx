import { type MouseEvent } from 'react';
import { Mic, Pause } from 'lucide-react';

/** 解析语音时长为秒：支持 12 / "12" / "0:12" / "12\"" */
export function parseVoiceDurationSeconds(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.max(1, Math.round(raw));
  const text = String(raw ?? '').trim();
  if (!text) return 1;
  const mmss = text.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return Math.max(1, parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10));
  const num = text.match(/(\d+)/);
  if (num) return Math.max(1, parseInt(num[1], 10));
  return 1;
}

/** 语音时长：短语音用 1s，超过 60 秒用 1:05 */
export function formatVoiceDurationLabel(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 波形轨宽度（随时长变长） */
export function voiceWaveWidthPx(seconds: number): number {
  const sec = Math.max(1, Math.min(60, Math.round(seconds)));
  return Math.round(28 + sec * 1.35);
}

/** 整条气泡宽度 ≈ 麦克风 + 波形 + 时长 + 内边距 */
export function voiceBarWidthPx(seconds: number): number {
  return voiceWaveWidthPx(seconds) + 62;
}

export function isPlaceholderVoiceTranscript(transcript: unknown): boolean {
  const t = String(transcript ?? '').trim();
  if (!t) return true;
  return t.startsWith('（') || t.startsWith('(');
}

export function resolveLineVoiceTranscript(message: any): string {
  return String(
    message?.transcript ||
    message?.desc ||
    message?.text ||
    message?.content ||
    message?.metadata?.transcript ||
    message?.metadata?.desc ||
    ''
  ).trim();
}

export function resolveLineVoiceDuration(message: any): unknown {
  return message?.duration ?? message?.metadata?.duration;
}

export function resolveLineVoiceMediaRef(message: any): string | undefined {
  const ref = message?.mediaRef || message?.metadata?.mediaRef;
  return ref ? String(ref) : undefined;
}

/** 中间高、两边矮，贴近真实 LINE 波形 */
const VOICE_TICK_HEIGHTS = [4, 7, 11, 8, 14, 9, 12, 6, 13, 10, 7, 5, 9, 6];

/**
 * 真实 LINE 语音条布局（双方统一）：
 * 左麦克风（播放） → 中波形（点按转文字） → 右时长
 */
export function LineVoiceMessageBar({
  isMe,
  seconds,
  playing,
  progress,
  transcriptOpen,
  onMicClick,
  onBarClick,
  onContextMenu,
}: {
  isMe: boolean;
  seconds: number;
  playing: boolean;
  progress: number;
  transcriptOpen?: boolean;
  onMicClick: () => void;
  onBarClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}) {
  const waveWidth = voiceWaveWidthPx(seconds);
  const label = formatVoiceDurationLabel(seconds);
  const pct = Math.max(0, Math.min(100, (Number.isFinite(progress) ? progress : 0) * 100));

  return (
    <div
      onContextMenu={onContextMenu}
      className={[
        'line-voice-bar',
        isMe ? 'line-voice-bar--me' : 'line-voice-bar--other',
        playing ? 'is-playing' : '',
        transcriptOpen ? 'has-transcript-open' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className={`line-voice-mic${playing ? ' is-playing' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onMicClick();
        }}
        aria-label={playing ? `暂停语音 ${label}` : `播放语音 ${label}`}
      >
        {playing ? (
          <Pause className="w-[14px] h-[14px] stroke-[2]" />
        ) : (
          <Mic className="w-[14px] h-[14px] stroke-[1.65]" />
        )}
      </button>

      <button
        type="button"
        className={`line-voice-wave${transcriptOpen ? ' is-transcript-open' : ''}`}
        style={{ width: waveWidth }}
        onClick={onBarClick}
        aria-label="查看语音文字"
        aria-expanded={!!transcriptOpen}
      >
        <span className="line-voice-progress" style={{ width: `${pct}%` }} />
        <span className="line-voice-ticks" aria-hidden="true">
          {VOICE_TICK_HEIGHTS.map((h, i) => (
            <i
              key={i}
              style={{
                height: `${h}px`,
                animationDelay: playing ? `${(i % 5) * 0.08}s` : undefined,
              }}
            />
          ))}
        </span>
      </button>

      <span className="line-voice-dur" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

export function LineVoiceTranscript({
  isMe,
  transcript,
  maxWidth,
  onClose,
}: {
  isMe: boolean;
  transcript: string;
  maxWidth: number;
  onClose: () => void;
}) {
  return (
    <div
      className={`line-voice-transcript ${isMe ? 'line-voice-transcript--me' : 'line-voice-transcript--other'}`}
      style={{ maxWidth }}
    >
      <div className="line-voice-transcript-head">
        <span className="line-voice-transcript-badge">转文字</span>
        <button
          type="button"
          className="line-voice-transcript-close"
          onClick={onClose}
          aria-label="收起转写"
        >
          ×
        </button>
      </div>
      <div className="line-voice-transcript-text">
        {!isPlaceholderVoiceTranscript(transcript)
          ? transcript
          : '暂无转写内容，可在设置中开启语音转文字后重新录制'}
      </div>
    </div>
  );
}
