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
  ].filter(Boolean).join(', ');

  try {
    const baseUrl = settings.baseUrl.replace(/\/$/, '');
    // 优先用 gpt-image-1 (支持参考图), 降级到 dall-e-3
    const model = settings.model || 'gpt-image-1';

    let resp: Response;
    if (referenceImageBase64 && model.includes('gpt-image')) {
      // 带参考图: 用 edits 接口
      const formData = new FormData();
      const byteChars = atob(referenceImageBase64.split(',').pop() || '');
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNums)], { type: 'image/png' });
      formData.append('image', blob, 'reference.png');
      formData.append('prompt', fullPrompt);
      formData.append('model', model);
      formData.append('size', '1024x1024');

      resp = await fetch(`${baseUrl}/v1/images/edits`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${settings.apiKey.trim()}` },
        body: formData,
      });
    } else {
      // 纯文生图
      resp = await fetch(`${baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          prompt: fullPrompt + (preset.negative ? ` Avoid: ${preset.negative}` : ''),
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
