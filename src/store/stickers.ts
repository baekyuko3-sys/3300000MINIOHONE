/**
 * 表情包数据层
 * 表情包 = 名称 + 分组 + 图片（URL 或上传压缩后的 dataURL）
 * 参考 uwu 手机的设计：单个添加（带预览）+ 批量导入（名称:URL）
 */

export interface Sticker {
  id: string;
  name: string;
  imageUrl: string; // URL 或 dataURL
  group: string; // 分组名
}

export interface StickerPack {
  id: string;
  name: string; // 分组/包名
  stickers: Sticker[];
}

const KEY = 'line:sticker-packs';

function readPacks(): StickerPack[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => p && typeof p === 'object' && typeof p.id === 'string' && Array.isArray(p.stickers));
  } catch {
    return [];
  }
}

function writePacks(packs: StickerPack[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(packs));
  } catch {
    // localStorage 满了就忽略，调用方可以 toast 提示
  }
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getStickerPacks(): StickerPack[] {
  return readPacks();
}

export function saveStickerPacks(packs: StickerPack[]): void {
  writePacks(packs);
}

/** 新建分组 */
export function addStickerPack(name: string): StickerPack {
  const packs = readPacks();
  const pack: StickerPack = { id: genId('pack'), name: name.trim() || '未命名分组', stickers: [] };
  packs.push(pack);
  writePacks(packs);
  return pack;
}

/** 删除分组（含其中的表情） */
export function deleteStickerPack(packId: string): void {
  writePacks(readPacks().filter(p => p.id !== packId));
}

/** 重命名分组 */
export function renameStickerPack(packId: string, name: string): void {
  const packs = readPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) return;
  const oldName = pack.name;
  pack.name = name.trim() || oldName;
  // 同步更新其中表情的 group 字段
  for (const s of pack.stickers) s.group = pack.name;
  writePacks(packs);
}

/** 添加单个表情到指定分组 */
export function addSticker(packId: string, name: string, imageUrl: string): Sticker | null {
  const packs = readPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) return null;
  const sticker: Sticker = {
    id: genId('sticker'),
    name: name.trim() || '未命名表情',
    imageUrl,
    group: pack.name,
  };
  pack.stickers.push(sticker);
  writePacks(packs);
  return sticker;
}

/** 删除表情 */
export function deleteSticker(packId: string, stickerId: string): void {
  const packs = readPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) return;
  pack.stickers = pack.stickers.filter(s => s.id !== stickerId);
  writePacks(packs);
}

/** 更新表情（改名 / 换图） */
export function updateSticker(packId: string, stickerId: string, patch: Partial<Pick<Sticker, 'name' | 'imageUrl'>>): void {
  const packs = readPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) return;
  const sticker = pack.stickers.find(s => s.id === stickerId);
  if (!sticker) return;
  if (typeof patch.name === 'string' && patch.name.trim()) sticker.name = patch.name.trim();
  if (typeof patch.imageUrl === 'string' && patch.imageUrl) sticker.imageUrl = patch.imageUrl;
  writePacks(packs);
}

/** 移动表情到其他分组 */
export function moveStickerToPack(fromPackId: string, toPackId: string, stickerId: string): boolean {
  if (fromPackId === toPackId) return false;
  const packs = readPacks();
  const from = packs.find(p => p.id === fromPackId);
  const to = packs.find(p => p.id === toPackId);
  if (!from || !to) return false;
  const idx = from.stickers.findIndex(s => s.id === stickerId);
  if (idx < 0) return false;
  const [sticker] = from.stickers.splice(idx, 1);
  sticker.group = to.name;
  to.stickers.push(sticker);
  writePacks(packs);
  return true;
}

/**
 * 批量导入：每行一个，格式 `名称:URL`
 * 返回 { imported, skipped }
 */
export function batchImportStickers(packId: string, text: string): { imported: number; skipped: number } {
  const packs = readPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) return { imported: 0, skipped: 0 };
  let imported = 0;
  let skipped = 0;
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) { skipped++; continue; }
    const name = line.slice(0, colonIdx).trim();
    const url = line.slice(colonIdx + 1).trim();
    if (!name || !url || !/^https?:\/\//i.test(url)) { skipped++; continue; }
    pack.stickers.push({ id: genId('sticker'), name, imageUrl: url, group: pack.name });
    imported++;
  }
  writePacks(packs);
  return { imported, skipped };
}

/** 按名称查找表情（AI 发表情包用） */
export function findStickerByName(name: string): Sticker | null {
  const q = String(name || '').trim();
  if (!q) return null;
  for (const pack of readPacks()) {
    const hit = pack.stickers.find(s => s.name === q);
    if (hit) return hit;
  }
  // 模糊匹配：包含关系
  for (const pack of readPacks()) {
    const hit = pack.stickers.find(s => s.name.includes(q) || q.includes(s.name));
    if (hit) return hit;
  }
  return null;
}

/** 所有表情总数 */
export function getStickerCount(): number {
  return readPacks().reduce((n, p) => n + p.stickers.length, 0);
}
