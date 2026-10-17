/**
 * MiniMax 语音合成 (TTS)
 * 接口: https://api.minimax.chat/v1/t2a_v2
 * 认证: Authorization: Bearer <apiKey>
 */

export interface MinimaxVoiceSettings {
  apiKey: string;
  voiceId: string;
  /** 语速 -1~2, 默认0 */
  speed?: number;
  /** 音量 -10~10, 默认0 */
  vol?: number;
  /** 音调 -12~12, 默认0 */
  pitch?: number;
}

export interface MinimaxVoiceResult {
  ok: boolean;
  /** base64 音频 (mp3) */
  audioBase64?: string;
  error?: string;
}

const MINIMAX_TTS_URL = 'https://api.minimax.chat/v1/t2a_v2';

export async function synthesizeMinimaxVoice(
  text: string,
  settings: MinimaxVoiceSettings
): Promise<MinimaxVoiceResult> {
  if (!settings.apiKey.trim()) {
    return { ok: false, error: 'MiniMax API Key 未设置' };
  }
  if (!settings.voiceId.trim()) {
    return { ok: false, error: 'Voice ID 未设置' };
  }
  if (!text.trim()) {
    return { ok: false, error: '文本为空' };
  }

  try {
    const resp = await fetch(MINIMAX_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text: text.trim().slice(0, 4000),
        stream: false,
        voice_setting: {
          voice_id: settings.voiceId.trim(),
          speed: settings.speed ?? 0,
          vol: settings.vol ?? 0,
          pitch: settings.pitch ?? 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { ok: false, error: `MiniMax 请求失败 (${resp.status}): ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    // t2a_v2 返回 { data: { audio: "hex..." }, ... } 或 base64
    const audioHex: string | undefined = data?.data?.audio;
    if (!audioHex) {
      return { ok: false, error: `MiniMax 返回异常: ${JSON.stringify(data).slice(0, 200)}` };
    }

    // hex 转 base64
    const bytes = new Uint8Array(audioHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(audioHex.substr(i * 2, 2), 16);
    }
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { ok: true, audioBase64: btoa(binary) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** base64 mp3 转可播放的 blob URL */
export function minimaxAudioToUrl(audioBase64: string): string {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
}
