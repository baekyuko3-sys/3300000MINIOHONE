import type { AppSettings } from '../store/appSettings';

export interface GeneratedMedia {
  url: string;
  mimeType?: string;
  source: 'api' | 'browser';
}

function dataUrlFromBytes(bytes: ArrayBuffer, mimeType: string): string {
  const array = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < array.length; i += chunk) {
    binary += String.fromCharCode(...array.subarray(i, i + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function readJsonOrText(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return { message: await response.text() };
  }
}

function joinEndpoint(base: string, path: string): string {
  const normalized = base.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('MEDIA_BASE_URL_MISSING');
  return /\/(audio\/speech|images\/generations)$/i.test(normalized)
    ? normalized
    : normalized + path;
}

export function speakWithBrowser(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.98;
  utterance.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export async function generateSpeech(text: string, settings: AppSettings): Promise<GeneratedMedia | null> {
  const content = text.trim();
  if (!content) return null;

  if (!settings.voiceEnabled || settings.voiceProvider === 'browser') {
    speakWithBrowser(content);
    return { url: '', source: 'browser' };
  }

  if (!settings.voiceApiKey.trim()) throw new Error('VOICE_API_KEY_MISSING');
  const endpoint = joinEndpoint(settings.voiceBaseUrl, '/audio/speech');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + settings.voiceApiKey.trim(),
    },
    body: JSON.stringify({
      model: settings.voiceModel.trim(),
      voice: settings.voiceName.trim() || 'alloy',
      input: content,
      response_format: settings.voiceFormat,
    }),
  });

  if (!response.ok) {
    const error = await readJsonOrText(response);
    throw new Error('VOICE_' + response.status + ': ' + (error?.error?.message || error?.message || '语音请求失败'));
  }

  const mime = settings.voiceFormat === 'wav' ? 'audio/wav' : settings.voiceFormat === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
  return {
    url: dataUrlFromBytes(await response.arrayBuffer(), mime),
    mimeType: mime,
    source: 'api',
  };
}

export async function generateImage(prompt: string, settings: AppSettings): Promise<GeneratedMedia> {
  if (!settings.imageEnabled) throw new Error('IMAGE_DISABLED');
  if (!settings.imageApiKey.trim()) throw new Error('IMAGE_API_KEY_MISSING');

  const endpoint = joinEndpoint(settings.imageBaseUrl, '/images/generations');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + settings.imageApiKey.trim(),
    },
    body: JSON.stringify({
      model: settings.imageModel.trim(),
      prompt: prompt.trim(),
      size: settings.imageSize,
      n: 1,
    }),
  });

  if (!response.ok) {
    const error = await readJsonOrText(response);
    throw new Error('IMAGE_' + response.status + ': ' + (error?.error?.message || error?.message || '图片请求失败'));
  }

  const data = await readJsonOrText(response);
  const item = data?.data?.[0];
  if (typeof item?.b64_json === 'string') {
    return { url: 'data:image/png;base64,' + item.b64_json, mimeType: 'image/png', source: 'api' };
  }
  if (typeof item?.url === 'string') {
    return { url: item.url, mimeType: 'image/png', source: 'api' };
  }
  throw new Error('IMAGE_EMPTY_RESPONSE');
}


export async function transcribeAudio(
  audio: Blob,
  filename: string,
  settings: AppSettings,
): Promise<string> {
  if (!settings.sttEnabled) throw new Error('STT_DISABLED');

  if (settings.sttProvider === 'browser') {
    throw new Error('STT_BROWSER_REQUIRES_LIVE_MIC');
  }

  if (!settings.sttApiKey.trim()) throw new Error('STT_API_KEY_MISSING');
  const endpoint = joinEndpoint(settings.sttBaseUrl, '/audio/transcriptions');
  const form = new FormData();
  form.append('file', audio, filename || 'voice.webm');
  form.append('model', settings.sttModel.trim());
  if (settings.sttLanguage.trim()) form.append('language', settings.sttLanguage.trim());

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + settings.sttApiKey.trim() },
    body: form,
  });

  if (!response.ok) {
    const error = await readJsonOrText(response);
    throw new Error('STT_' + response.status + ': ' + (error?.error?.message || error?.message || '语音转文字失败'));
  }

  const data = await readJsonOrText(response);
  const text = typeof data?.text === 'string'
    ? data.text
    : typeof data?.transcript === 'string'
    ? data.transcript
    : '';

  if (!text.trim()) throw new Error('STT_EMPTY_RESPONSE');
  return text.trim();
}
