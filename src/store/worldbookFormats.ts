import YAML from 'yaml';
import type { WorldBook, WorldBookEntry } from '../types';

function id(prefix: string, index: number) {
  return prefix + '-' + Date.now().toString(36) + '-' + index.toString(36);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

function mapPosition(value: unknown, depth: number): WorldBookEntry['insertion'] {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized.includes('depth') || normalized === 'in_chat') return 'depth';
    if (normalized.includes('after')) return 'after';
    return 'before';
  }
  if (Number(value) === 4 || depth > 0) return 'depth';
  if (Number(value) === 1 || Number(value) === 3 || Number(value) === 5) return 'after';
  return 'before';
}

function normalizeEntry(raw: any, index: number): WorldBookEntry {
  const depth = Number(raw?.depth ?? raw?.extensions?.depth ?? 0) || 0;
  const keys = asStringArray(raw?.keys ?? raw?.key ?? raw?.keywords);
  const secondary = asStringArray(raw?.secondary_keys ?? raw?.keysecondary ?? raw?.secondaryKeywords);
  const scanDepthRaw = raw?.scanDepth ?? raw?.scan_depth;

  return {
    id: String(raw?.id ?? raw?.uid ?? id('entry', index)),
    name: String(raw?.comment ?? raw?.name ?? keys[0] ?? '未命名条目'),
    keywords: keys,
    content: String(raw?.content ?? ''),
    enabled: raw?.enabled !== false && raw?.disable !== true,
    priority: Number(raw?.order ?? raw?.insertion_order ?? raw?.priority ?? 100) || 0,
    weight: Number(raw?.weight ?? raw?.groupWeight ?? 100) || 0,
    insertion: mapPosition(raw?.position ?? raw?.extensions?.position, depth),
    depth,
    secondaryKeywords: secondary,
    selective: Boolean(raw?.selective ?? secondary.length > 0),
    selectiveLogic: Number(raw?.selectiveLogic ?? 0) as 0 | 1 | 2 | 3,
    constant: Boolean(raw?.constant),
    useProbability: Boolean(raw?.useProbability ?? raw?.probability != null),
    probability: Math.max(0, Math.min(100, Number(raw?.probability ?? 100) || 0)),
    scanDepth: scanDepthRaw == null ? undefined : Math.max(0, Math.min(50, Number(scanDepthRaw) || 0)),
    caseSensitive: raw?.caseSensitive ?? raw?.case_sensitive,
    matchWholeWords: raw?.matchWholeWords ?? raw?.match_whole_words,
    order: Number(raw?.order ?? raw?.insertion_order ?? 100) || 0,
    role: raw?.role === 'user' || raw?.role === 'assistant' ? raw.role : 'system',
    outletName: String(raw?.outletName ?? raw?.outlet_name ?? ''),
    group: String(raw?.group ?? ''),
    groupWeight: Number(raw?.groupWeight ?? raw?.group_weight ?? 100) || 0,
    preventRecursion: Boolean(raw?.preventRecursion ?? raw?.prevent_recursion),
    excludeRecursion: Boolean(raw?.excludeRecursion ?? raw?.exclude_recursion),
  };
}

function entriesFromRaw(raw: any): any[] {
  if (Array.isArray(raw?.entries)) return raw.entries;
  if (raw?.entries && typeof raw.entries === 'object') return Object.values(raw.entries);
  return [];
}

function normalizeBook(raw: any, index: number): WorldBook {
  const embedded = raw?.data?.character_book ?? raw?.character_book;
  const source = embedded || raw;
  const entries = entriesFromRaw(source);

  return {
    id: String(raw?.id ?? raw?.name ?? id('worldbook', index)),
    name: String(source?.name ?? raw?.name ?? '导入世界书'),
    description: String(source?.description ?? raw?.description ?? ''),
    category: String(source?.category ?? raw?.category ?? ''),
    tags: asStringArray(source?.tags ?? raw?.tags),
    enabled: raw?.enabled !== false && raw?.disable !== true,
    updatedAt: new Date().toISOString(),
    entries: entries.map((entry, entryIndex) => normalizeEntry(entry, entryIndex)),
  };
}

export function parseWorldBookText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('世界书文件为空。');
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return YAML.parse(trimmed);
    } catch {
      throw new Error('无法识别世界书 JSON / YAML。');
    }
  }
}

export function importWorldBooks(text: string): WorldBook[] {
  const parsed = parseWorldBookText(text);
  const rawBooks =
    Array.isArray(parsed) ? parsed :
    Array.isArray((parsed as any)?.worldbooks) ? (parsed as any).worldbooks :
    [parsed];

  const books = rawBooks
    .map((raw: unknown, index: number) => normalizeBook(raw, index))
    .filter((book: WorldBook) => book.entries.length || book.name);

  if (!books.length) throw new Error('没有找到可导入的世界书。');
  return books;
}

export function exportNativeWorldBook(book: WorldBook): string {
  return JSON.stringify(book, null, 2);
}

export function exportSillyTavernWorldBook(book: WorldBook): string {
  const entries: Record<string, any> = {};
  book.entries.forEach((entry, index) => {
    entries[String(index)] = {
      uid: index,
      key: entry.keywords,
      keysecondary: entry.secondaryKeywords || [],
      comment: entry.name,
      content: entry.content,
      constant: Boolean(entry.constant),
      selective: Boolean(entry.selective),
      selectiveLogic: entry.selectiveLogic ?? 0,
      order: entry.order ?? entry.priority,
      position: entry.insertion === 'depth' ? 4 : entry.insertion === 'after' ? 1 : 0,
      depth: entry.depth || 0,
      disable: !entry.enabled,
      probability: entry.probability ?? 100,
      useProbability: Boolean(entry.useProbability),
      scanDepth: entry.scanDepth || 0,
      caseSensitive: entry.caseSensitive,
      matchWholeWords: entry.matchWholeWords,
      group: entry.group || '',
      groupWeight: entry.groupWeight ?? entry.weight ?? 100,
      preventRecursion: Boolean(entry.preventRecursion),
      excludeRecursion: Boolean(entry.excludeRecursion),
      role: entry.role === 'user' ? 1 : entry.role === 'assistant' ? 2 : 0,
    };
  });

  return JSON.stringify({
    name: book.name,
    category: book.category || '',
    tags: book.tags || [],
    entries,
  }, null, 2);
}
