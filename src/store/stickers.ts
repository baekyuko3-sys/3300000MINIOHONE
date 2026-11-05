import { reportPersistenceIssue } from './usePersistentState';

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
let stickerPacksWriteBlocked = false;

function readPacks(): StickerPack[] {
  stickerPacksWriteBlocked = false;
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some(p => !p || typeof p !== 'object' || typeof p.id !== 'string' || !Array.isArray(p.stickers))) {
      throw new Error('STICKER_PACKS_SCHEMA_INVALID');
    }
    return parsed as StickerPack[];
  } catch (error) {
    stickerPacksWriteBlocked = true;
    reportPersistenceIssue('read:' + KEY, '表情包数据损坏或格式不符；已锁定写入以保留原始内容', error);
    return [];
  }
}

function writePacks(packs: StickerPack[]): boolean {
  if (typeof window === 'undefined' || stickerPacksWriteBlocked) return false;
  try {
    const serialized = JSON.stringify(packs);
    window.localStorage.setItem(KEY, serialized);
    if (window.localStorage.getItem(KEY) !== serialized) throw new Error('STICKER_PACKS_WRITE_VERIFY_FAILED');
    return true;
  } catch (error) {
    reportPersistenceIssue('write:' + KEY, '表情包数据写入失败；原始内容已保留', error);
    return false;
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
 * 批量导入：每行一个，宽泛格式（照 uwu 的解析）：
 * 先在行里找 http(s):// 链接，名字就是链接前面那段，末尾分隔符去掉。
 * 认 `名称:URL`、`名称：URL`、`名称 URL`、`名称URL`；`#` 或 `//` 开头的行当注释跳过；
 * 链接后面多余的标点去掉；同一个链接只导一次；Windows 换行也能读。
 * 返回 { imported, skipped }
 */
export function batchImportStickers(packId: string, text: string): { imported: number; skipped: number } {
  const packs = readPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) return { imported: 0, skipped: 0 };
  let imported = 0;
  let skipped = 0;
  const seenUrls = new Set<string>();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[#/]/.test(line)) { skipped++; continue; }
    const urlMatch = line.match(/(https?:\/\/[^\s]+)/i);
    if (!urlMatch) { skipped++; continue; }
    const url = urlMatch[0].replace(/[.,;:：，、。？！]+$/, '').trim();
    if (!/^https?:\/\//i.test(url)) { skipped++; continue; }
    const urlIndex = line.indexOf(urlMatch[0]);
    const name = line.slice(0, urlIndex).trim().replace(/[:：\-|,，、\s]+$/, '').trim();
    if (!name) { skipped++; continue; }
    if (seenUrls.has(url)) { skipped++; continue; }
    seenUrls.add(url);
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
/** 从现有表情包中按输入关键词提供联想。 */
export function getStickerSuggestions(query: string, limit = 5): Sticker[] {
  const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const all = readPacks().flatMap(pack => pack.stickers);
  const matches = all.filter(sticker => {
    const haystack = (sticker.name + ' ' + sticker.group).toLowerCase();
    return terms.some(term => haystack.includes(term));
  });
  return matches.slice(0, Math.max(0, Math.min(20, Math.floor(limit))));
}

export function getStickerCount(): number {
  return readPacks().reduce((n, p) => n + p.stickers.length, 0);
}
