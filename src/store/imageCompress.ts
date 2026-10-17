/**
 * 图片自动压缩工具
 * 所有上传的图片都经过这里，统一压缩到合理尺寸
 */

/** 读取文件为 dataURL */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 压缩图片 dataURL，默认最大 1024px，JPEG 0.82 */
export async function compressImageDataUrl(
  dataUrl: string,
  maxDim = 1024,
  quality = 0.82,
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    if (scale >= 1) return dataUrl; // 已经够小，不压缩
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl; // 压缩失败返回原图
  }
}

/** 读取文件并自动压缩，一步到位 */
export async function readAndCompressImage(
  file: File,
  maxDim = 1024,
  quality = 0.82,
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  return compressImageDataUrl(dataUrl, maxDim, quality);
}
