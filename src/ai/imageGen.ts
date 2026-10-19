/**
 * AI 生图 - OpenAI 兼容接口 (DALL-E / GPT-Image)
 * 支持参考图锁脸: 传入角色头像作为参考
 */
import { usePersistentState } from '../store/usePersistentState';

export interface ImagePreset {
  id: string;
  name: string;
  /** 正面提示词 */
  positive: string;
  /** 负面提示词 */
  negative: string;
  /** 是否用角色头像做参考图锁脸 */
  useReference: boolean;
}

export interface ImageGenSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ImageGenResult {
  ok: boolean;
  /** base64 图片 (png) */
  imageBase64?: string;
  error?: string;
}

export function useImagePresets() {
  return usePersistentState<ImagePreset[]>('line:image-presets', [
    {
      id: 'default',
      name: '默认写实',
      positive: 'photorealistic, natural lighting, high detail',
      negative: 'blurry, low quality, distorted face, extra limbs',
      useReference: true,
    },
  ]);
}

export function useMinimaxKey() {
  return usePersistentState<string>('line:minimax-key', '');
}

export interface VoicePreset {
  id: string;
  name: string;
  voiceId: string;
}

export function useVoicePresets() {
  return usePersistentState<VoicePreset[]>('line:voice-presets', []);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`生图请求超时（${Math.round(timeoutMs / 1000)}s），请重试`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把图片引用解析成 dataURL
 * 支持 data: / media: (IndexedDB) / http(s)；解析失败返回 undefined（不抛错）
 */
export async function resolveImageToDataUrl(url?: string | null): Promise<string | undefined> {
  if (!url || typeof url !== 'string') return undefined;
  if (url.startsWith('data:')) return url;
  try {
    if (url.startsWith('media:')) {
      const { getMedia } = await import('../store/mediaVault');
      const resolved = await getMedia(url.slice(6));
      return resolved || undefined;
    }
    if (/^https?:\/\//i.test(url)) {
      const resp = await fetchWithTimeout(url, {}, 30000);
      if (!resp.ok) return undefined;
      const blob = await resp.blob();
      return await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    /* 解析失败就当没有参考图 */
  }
  return undefined;
}

/**
 * 生图
 * @param prompt 用户描述 (场景/动作/服装)
 * @param preset 预设 (正/负面提示词)
 * @param referenceImageBase64 参考图 (角色脸) base64, 可选
 */
export async function generateImage(
  prompt: string,
  preset: ImagePreset,
  settings: ImageGenSettings,
  referenceImageBase64?: string
): Promise<ImageGenResult> {
  if (!settings.apiKey.trim()) {
    return { ok: false, error: 'API Key 未设置' };
  }

  const fullPrompt = [
    preset.useReference && referenceImageBase64
      ? 'Keep the exact same face and identity from the reference image.'
      : '',
    prompt.trim(),
    preset.positive.trim(),
    preset.negative.trim() ? `Avoid: ${preset.negative.trim()}` : '',
  ].filter(Boolean).join(', ');

  try {
    const baseUrl = settings.baseUrl.replace(/\/$/, '');
    // 优先用 gpt-image-1 (支持参考图), 降级到 dall-e-3
    const model = settings.model || 'gpt-image-1';

    // 锁脸需要 gpt-image 系列模型：dall-e 不支持参考图，直接报错提示用户
    if (referenceImageBase64 && !model.includes('gpt-image')) {
      return { ok: false, error: '锁脸需要 gpt-image 系列模型，当前模型不支持参考图' };
    }

    let resp: Response;
    if (referenceImageBase64 && model.includes('gpt-image')) {
      // 带参考图: 用 edits 接口
      const refMatch = referenceImageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!refMatch) {
        return { ok: false, error: '参考图格式无效，无法锁脸' };
      }
      const formData = new FormData();
      const byteChars = atob(refMatch[2]);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNums)], { type: refMatch[1] });
      formData.append('image', blob, 'reference.png');
      formData.append('prompt', fullPrompt);
      formData.append('model', model);
      formData.append('size', '1024x1024');

      resp = await fetchWithTimeout(`${baseUrl}/v1/images/edits`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${settings.apiKey.trim()}` },
        body: formData,
      });
    } else {
      // 纯文生图
      resp = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          size: '1024x1024',
          n: 1,
        }),
      });
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { ok: false, error: `生图失败 (${resp.status}): ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return { ok: false, error: '返回数据异常' };
    }
    return { ok: true, imageBase64: b64 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
