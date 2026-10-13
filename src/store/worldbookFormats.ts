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

function readExtension(raw: any, ...keys: string[]): unknown {
  const extensions = raw?.extensions && typeof raw.extensions === 'object' ? raw.extensions : null;
  for (const key of keys) {
    if (raw?.[key] != null) return raw[key];
    if (extensions && extensions[key] != null) return extensions[key];
  }
  return undefined;
}

function mapPosition(value: unknown, depth: number): WorldBookEntry['insertion'] {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized.includes('depth') || normalized === 'in_chat') return 'depth';
    if (normalized.includes('after')) return 'after';
    return 'before';
  }
  if (value !== undefined && value !== null && value !== '') {
    const pos = Number(value);
    if (pos === 4 || pos === 6) return 'depth';
    if (pos === 1 || pos === 3 || pos === 5) return 'after';
    return 'before';
  }
  // Only fall back to depth when position is missing and a depth value is present.
  return depth > 0 ? 'depth' : 'before';
}

function normalizeSelectiveLogic(raw: any): 0 | 1 | 2 | 3 {
  const value = Number(
    readExtension(raw, 'selectiveLogic', 'selective_logic') ?? 0,
  );
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

function normalizeEntry(raw: any, index: number): WorldBookEntry {
  const depth = Number(readExtension(raw, 'depth') ?? 0) || 0;
  const keys = asStringArray(raw?.keys ?? raw?.key ?? raw?.keywords);
  const secondary = asStringArray(raw?.secondary_keys ?? raw?.keysecondary ?? raw?.secondaryKeywords);
  const scanDepthRaw = readExtension(raw, 'scanDepth', 'scan_depth');
  const useRegex = Boolean(readExtension(raw, 'useRegex', 'use_regex'));

  return {
    id: String(raw?.id ?? raw?.uid ?? id('entry', index)),
    name: String(raw?.comment ?? raw?.name ?? keys[0] ?? '未命名条目'),
    keywords: keys,
    content: String(raw?.content ?? ''),
    enabled: raw?.enabled !== false && raw?.disable !== true,
    priority: Number(raw?.order ?? raw?.insertion_order ?? raw?.priority ?? 100) || 0,
    weight: Number(raw?.weight ?? raw?.groupWeight ?? readExtension(raw, 'group_weight') ?? 100) || 0,
    insertion: mapPosition(readExtension(raw, 'position'), depth),
    depth,
    secondaryKeywords: secondary,
    selective: Boolean(raw?.selective ?? secondary.length > 0),
    selectiveLogic: normalizeSelectiveLogic(raw),
    constant: Boolean(raw?.constant),
    useProbability: Boolean(raw?.useProbability ?? raw?.use_probability ?? raw?.probability != null),
    probability: Math.max(0, Math.min(100, Number(raw?.probability ?? 100) || 0)),
    scanDepth: scanDepthRaw == null ? undefined : Math.max(0, Math.min(50, Number(scanDepthRaw) || 0)),
    caseSensitive: raw?.caseSensitive ?? raw?.case_sensitive,
    matchWholeWords: raw?.matchWholeWords ?? raw?.match_whole_words,
    useRegex,
    order: Number(raw?.order ?? raw?.insertion_order ?? 100) || 0,
    role: raw?.role === 'user' || raw?.role === 'assistant'
      ? raw.role
      : Number(raw?.role) === 1 ? 'user'
      : Number(raw?.role) === 2 ? 'assistant'
      : 'system',
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

export type NormalizeBookOptions = {
  sourceCharacterId?: string;
  sourceCharacterName?: string;
  forceCharacterCard?: boolean;
};

function normalizeBook(raw: any, index: number, options: NormalizeBookOptions = {}): WorldBook {
  const embedded = raw?.data?.character_book ?? raw?.character_book;
  const source = embedded || raw;
  const entries = entriesFromRaw(source);
  const isCharacterCardBook = Boolean(embedded) || Boolean(options.forceCharacterCard);

  const cardId = String(
    options.sourceCharacterId
    || raw?.sourceCharacterId
    || raw?.data?.id
    || (isCharacterCardBook ? raw?.id : '')
    || '',
  ).trim();
  const cardName = String(
    options.sourceCharacterName
    || raw?.sourceCharacterName
    || raw?.data?.name
    || (isCharacterCardBook ? raw?.name : '')
    || '',
  ).trim();

  // Never fall back to display name as id — names collide across imports.
  const bookId = String(
    raw?.id
    || source?.id
    || (cardId ? `${cardId}-lore-${index}` : id('worldbook', index)),
  );

  return {
    id: bookId,
    name: String(source?.name || raw?.name || (cardName ? `${cardName} 的世界书` : '导入世界书')),
    description: String(source?.description ?? raw?.description ?? ''),
    category: String(source?.category ?? raw?.category ?? ''),
    tags: asStringArray(source?.tags ?? raw?.tags),
    enabled: raw?.enabled !== false && raw?.disable !== true,
    updatedAt: new Date().toISOString(),
    sourceType: raw?.sourceType ?? (isCharacterCardBook ? 'character-card' : 'imported'),
    sourceCharacterId: cardId || undefined,
    sourceCharacterName: cardName || undefined,
    globalScopes: Array.isArray(raw?.globalScopes) ? raw.globalScopes : undefined,
    entries: entries.map((entry, entryIndex) => normalizeEntry(entry, entryIndex)),
  };
}

function looksLikeStructuredData(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || /^[\w.-]+\s*:/m.test(trimmed.slice(0, 400));
}

/** 纯文本 / Markdown 世界书：按标题或分隔符拆成条目。 */
function parsePlainTextWorldBook(text: string, fallbackName = '导入世界书'): unknown {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) throw new Error('世界书文件为空。');

  let bookName = fallbackName;
  let body = normalized;

  if (body.startsWith('# ')) {
    const lineEnd = body.indexOf('\n');
    bookName = (lineEnd === -1 ? body.slice(2) : body.slice(2, lineEnd)).trim() || fallbackName;
    body = lineEnd === -1 ? '' : body.slice(lineEnd + 1).trim();
  }

  type Draft = { name: string; keywords: string[]; content: string };
  const drafts: Draft[] = [];

  const pushDraft = (name: string, lines: string[]) => {
    const raw = lines.join('\n').trim();
    if (!raw && !name) return;
    let keywords: string[] = [];
    let content = raw;
    const keywordLine = raw.match(/^(?:关键词|关键字|keys?|keywords?|触发)\s*[:：]\s*(.+)$/im);
    if (keywordLine) {
      keywords = keywordLine[1].split(/[,，、|/]/).map(v => v.trim()).filter(Boolean);
      content = raw.replace(keywordLine[0], '').trim();
    }
    // 【条目名】xxx 或 [条目名]
    const bracketName = name.match(/^[【\[](.+?)[】\]]$/);
    const entryName = (bracketName?.[1] || name || keywords[0] || content.slice(0, 16) || '未命名条目').trim();
    drafts.push({ name: entryName, keywords, content: content || raw || entryName });
  };

  // 1) Markdown ## 标题分段
  if (/^#{2,3}\s+/m.test(body)) {
    const parts = body.split(/^#{2,3}\s+/m).filter(Boolean);
    for (const part of parts) {
      const nl = part.indexOf('\n');
      const name = (nl === -1 ? part : part.slice(0, nl)).trim();
      const rest = nl === -1 ? '' : part.slice(nl + 1);
      pushDraft(name, rest ? [rest] : []);
    }
  } else {
    // 2) --- / === / *** 或连续空行分段
    const chunks = body
      .split(/\n(?:-{3,}|={3,}|\*{3,})\n|\n{2,}/)
      .map(chunk => chunk.trim())
      .filter(Boolean);

    if (chunks.length <= 1) {
      // 单段：整篇作为一条
      pushDraft(bookName, [body]);
    } else {
      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        const first = lines[0]?.trim() || '';
        // 首行短且像标题时拆开
        if (first && first.length <= 40 && !/[:：]/.test(first) && lines.length > 1) {
          pushDraft(first.replace(/^[#*\-\d.\s]+/, ''), lines.slice(1));
        } else if (/^[【\[].+[】\]]$/.test(first)) {
          pushDraft(first, lines.slice(1));
        } else {
          pushDraft(first.slice(0, 24) || '未命名条目', lines);
        }
      }
    }
  }

  if (!drafts.length) {
    pushDraft(bookName, [normalized]);
  }

  return {
    name: bookName,
    description: '从文本导入',
    category: '文本导入',
    tags: ['txt'],
    enabled: true,
    entries: drafts.map((draft, index) => ({
      id: id('entry', index),
      comment: draft.name,
      name: draft.name,
      keys: draft.keywords,
      keywords: draft.keywords,
      content: draft.content,
      enabled: true,
      order: (index + 1) * 10,
      priority: (index + 1) * 10,
      weight: 100,
      position: 0,
      depth: 0,
    })),
  };
}

export function parseWorldBookText(text: string, fallbackName = '导入世界书'): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('世界书文件为空。');
  try {
    return JSON.parse(trimmed);
  } catch {
    // JSON 失败后再试 YAML；像纯散文的文本不要硬套 YAML
    if (looksLikeStructuredData(trimmed)) {
      try {
        const yamlParsed = YAML.parse(trimmed);
        if (yamlParsed != null && typeof yamlParsed === 'object') return yamlParsed;
      } catch {
        // fall through to plain text
      }
    }
    return parsePlainTextWorldBook(trimmed, fallbackName);
  }
}

export function importWorldBooks(text: string, options: NormalizeBookOptions & { fallbackName?: string } = {}): WorldBook[] {
  const parsed = parseWorldBookText(text, options.fallbackName || '导入世界书');
  const rawBooks =
    Array.isArray(parsed) ? parsed :
    Array.isArray((parsed as any)?.worldbooks) ? (parsed as any).worldbooks :
    [parsed];

  const books = rawBooks
    .map((raw: unknown, index: number) => normalizeBook(raw, index, options))
    .filter((book: WorldBook) => book.entries.length || book.name);

  if (!books.length) throw new Error('没有找到可导入的世界书。');
  return books;
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '导入世界书';
}

async function extractDocxText(file: File): Promise<string> {
  const mod = await import('mammoth');
  const mammoth = (mod as any).default ?? mod;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = String(result?.value || '').trim();
  if (!text) throw new Error('Word 文档里没有可读文字。');
  return text;
}

/** 统一入口：支持 JSON / YAML / TXT / Markdown / Word(.docx)。旧版 .doc 请另存为 .docx。 */
export async function importWorldBooksFromFile(file: File, options: NormalizeBookOptions = {}): Promise<WorldBook[]> {
  const name = file.name || 'import';
  const lower = name.toLowerCase();
  const fallbackName = fileBaseName(name);
  const merged = { ...options, fallbackName };

  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    throw new Error('暂不支持旧版 .doc，请在 Word 里另存为 .docx 或导出为 .txt 后再导入。');
  }

  if (lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const text = await extractDocxText(file);
    return importWorldBooks(text, merged).map(book => ({
      ...book,
      tags: Array.from(new Set([...(book.tags || []), 'word'])),
      category: book.category || 'Word导入',
      description: book.description || '从 Word 文档导入',
    }));
  }

  const text = await file.text();
  return importWorldBooks(text, merged);
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
      useRegex: Boolean(entry.useRegex),
      group: entry.group || '',
      groupWeight: entry.groupWeight ?? entry.weight ?? 100,
      preventRecursion: Boolean(entry.preventRecursion),
      excludeRecursion: Boolean(entry.excludeRecursion),
      role: entry.role === 'user' ? 1 : entry.role === 'assistant' ? 2 : 0,
      extensions: {
        position: entry.insertion === 'depth' ? 4 : entry.insertion === 'after' ? 1 : 0,
        depth: entry.depth || 0,
        selectiveLogic: entry.selectiveLogic ?? 0,
        useRegex: Boolean(entry.useRegex),
      },
    };
  });

  return JSON.stringify({
    name: book.name,
    category: book.category || '',
    tags: book.tags || [],
    entries,
  }, null, 2);
}
