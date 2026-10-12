export type MemorySection =
  | 'stage'
  | 'about-you'
  | 'relationship'
  | 'understanding'
  | 'confirm'
  | 'todo'
  | 'done';

export type MemorySummaryLength = 'minimal' | 'short' | 'standard' | 'detailed' | 'very-detailed';
export type MemorySummaryFocus = 'facts' | 'events' | 'relationship' | 'emotion' | 'details' | 'character-style';

export interface MemoryStylePreset {
  length: MemorySummaryLength;
  maxChars: number;
  focus: MemorySummaryFocus;
}

export interface CharacterMemoryStyleSettings {
  personality: 'balanced' | 'observant' | 'diary' | 'analytical' | 'warm' | 'character-style';
  sections: Record<MemorySection, MemoryStylePreset>;
}

export interface CharacterMemoryItem {
  id: string;
  content: string;
  source: 'manual' | 'ai-summary' | 'conversation';
  createdAt: string;
  updatedAt: string;
  importance: number;
  kind?: 'fact' | 'diary' | 'relationship' | 'preference' | 'event';
  /** New Memory UI section. Optional so all existing saved memories remain compatible. */
  section?: MemorySection;
}

export interface RecentMemorySummary {
  id: string;
  content: string;
  source: 'line' | 'offline' | 'manual';
  createdAt: string;
  importance: number;
}
export interface CharacterMemory {

  characterId: string;
  characterName: string;
  summary: string;
  items: CharacterMemoryItem[];
  updatedAt: string;
  recentSummaries?: RecentMemorySummary[];
  lastMergedAt?: string;
  /** The user persona explicitly chosen for this character. */
  personaId?: string;
  personaName?: string;
  memoryStyle?: CharacterMemoryStyleSettings;
}

const keyFor = (characterId: string) => `phone:character-memory:${characterId}`;

const DEFAULT_MEMORY_STYLE: CharacterMemoryStyleSettings = {
  personality: 'character-style',
  sections: {
    stage: { length: 'standard', maxChars: 120, focus: 'events' },
    'about-you': { length: 'detailed', maxChars: 180, focus: 'facts' },
    relationship: { length: 'standard', maxChars: 140, focus: 'relationship' },
    understanding: { length: 'detailed', maxChars: 200, focus: 'character-style' },
    confirm: { length: 'short', maxChars: 90, focus: 'facts' },
    todo: { length: 'standard', maxChars: 120, focus: 'events' },
    done: { length: 'minimal', maxChars: 70, focus: 'events' },
  },
};

export function getDefaultMemoryStyle(): CharacterMemoryStyleSettings {
  return JSON.parse(JSON.stringify(DEFAULT_MEMORY_STYLE)) as CharacterMemoryStyleSettings;
}



function emptyMemory(characterId: string, characterName: string): CharacterMemory {
  return {
    characterId,
    characterName,
    summary: '',
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export function clearCharacterMemory(characterId: string) {
  if (typeof window === 'undefined' || !characterId) return;
  window.localStorage.removeItem(keyFor(characterId));
}

export function getCharacterMemory(characterId: string, characterName: string): CharacterMemory {
  if (typeof window === 'undefined') return emptyMemory(characterId, characterName);
  try {
    const raw = window.localStorage.getItem(keyFor(characterId));
    if (!raw) return emptyMemory(characterId, characterName);
    const parsed = JSON.parse(raw) as Partial<CharacterMemory>;
    return {
      ...emptyMemory(characterId, characterName || parsed.characterName || ''),
      ...parsed,
      characterId,
      characterName: characterName || parsed.characterName || '',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      recentSummaries: Array.isArray(parsed.recentSummaries) ? parsed.recentSummaries : [],
      memoryStyle: parsed.memoryStyle ? { ...getDefaultMemoryStyle(), ...parsed.memoryStyle, sections: { ...getDefaultMemoryStyle().sections, ...(parsed.memoryStyle as CharacterMemoryStyleSettings).sections } } : getDefaultMemoryStyle(),
    };
  } catch {
    return emptyMemory(characterId, characterName);
  }
}

export function saveCharacterMemory(memory: CharacterMemory): CharacterMemory {
  const next = { ...memory, updatedAt: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(keyFor(memory.characterId), JSON.stringify(next));
    } catch {}
  }
  return next;
}

export function updateCharacterMemory(
  characterId: string,
  characterName: string,
  patch: Partial<CharacterMemory>,
): CharacterMemory {
  return saveCharacterMemory({
    ...getCharacterMemory(characterId, characterName),
    ...patch,
    characterId,
    characterName,
  });
}

export function addRecentMemorySummary(
  characterId: string,
  characterName: string,
  content: string,
  options?: { source?: RecentMemorySummary['source']; importance?: number },
): CharacterMemory {
  const trimmed = content.trim();
  if (!trimmed) return getCharacterMemory(characterId, characterName);
  const current = getCharacterMemory(characterId, characterName);
  const now = new Date().toISOString();
  const summary: RecentMemorySummary = {
    id: `recent-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    content: trimmed,
    source: options?.source || 'line',
    createdAt: now,
    importance: Math.max(0, Math.min(100, Number(options?.importance ?? 50) || 50)),
  };
  return saveCharacterMemory({ ...current, recentSummaries: [summary, ...(current.recentSummaries || [])] });
}

export function mergeRecentMemorySummaries(characterId: string, characterName: string): CharacterMemory {
  const current = getCharacterMemory(characterId, characterName);
  const recent = current.recentSummaries || [];
  if (!recent.length) return current;
  // Automatic maintenance is batch-based: every 100 pending summaries is one cycle.
  // The caller/UI may also invoke this manually before the threshold.
  const batch = recent.slice(-100);
  if (batch.length < 100) return current;
  const unique = batch.filter((item, index, arr) => {
    const n = normalizeMemoryText(item.content);
    return arr.findIndex(other => normalizeMemoryText(other.content) === n) === index;
  });
  // This local merge keeps the batch compact; the AI merge engine can later replace
  // these candidates with classified long-term memories. Crucially, only the processed
  // 100-record batch is removed; newer records remain pending for the next cycle.
  const processedIds = new Set(batch.map(item => item.id));
  return saveCharacterMemory({
    ...current,
    recentSummaries: recent.filter(item => !processedIds.has(item.id)),
    lastMergedAt: new Date().toISOString(),
    items: [
      ...unique.map(item => ({
        id: `memory-${item.id}`,
        content: item.content,
        source: 'ai-summary' as const,
        createdAt: item.createdAt,
        updatedAt: new Date().toISOString(),
        importance: item.importance,
        kind: 'event' as const,
        section: 'stage' as const,
      })),
      ...current.items,
    ].slice(0, 120),
  });
}


export function applyMemoryMergeResult(
  characterId: string,
  characterName: string,
  batchIds: string[],
  result: {
    summary: string;
    updates: Array<{
      action: 'add' | 'update' | 'delete';
      id?: string;
      content?: string;
      section?: MemorySection;
      kind?: CharacterMemoryItem['kind'];
      importance?: number;
    }>;
  },
): CharacterMemory {
  const current = getCharacterMemory(characterId, characterName);
  const now = new Date().toISOString();
  let items = [...current.items];
  const deleteIds = new Set<string>();
  const updateMap = new Map<string, typeof items[number]>();

  for (const update of result.updates || []) {
    if (update.action === 'delete' && update.id) {
      deleteIds.add(update.id);
      continue;
    }
    if (!update.content?.trim()) continue;

    if (update.action === 'update' && update.id) {
      const existing = items.find(item => item.id === update.id);
      if (existing) {
        updateMap.set(update.id, {
          ...existing,
          content: update.content.trim(),
          section: update.section || existing.section,
          kind: update.kind || existing.kind,
          importance: Math.max(0, Math.min(100, Number(update.importance ?? existing.importance) || 0)),
          updatedAt: now,
        });
        continue;
      }
    }

    const normalized = normalizeMemoryText(update.content);
    const duplicate = items.find(item => normalizeMemoryText(item.content) === normalized);
    if (duplicate) {
      updateMap.set(duplicate.id, {
        ...duplicate,
        content: update.content.trim(),
        section: update.section || duplicate.section,
        kind: update.kind || duplicate.kind,
        importance: Math.max(duplicate.importance, Number(update.importance ?? duplicate.importance) || 0),
        updatedAt: now,
      });
    } else {
      const item: CharacterMemoryItem = {
        id: 'memory-merge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        content: update.content.trim(),
        source: 'ai-summary',
        createdAt: now,
        updatedAt: now,
        importance: Math.max(0, Math.min(100, Number(update.importance) || 50)),
        kind: update.kind || 'fact',
        section: update.section || 'stage',
      };
      items.unshift(item);
    }
  }

  items = items
    .filter(item => !deleteIds.has(item.id))
    .map(item => updateMap.get(item.id) || item)
    .slice(0, 160);

  const processed = new Set(batchIds);
  return saveCharacterMemory({
    ...current,
    summary: result.summary?.trim() || current.summary,
    items,
    recentSummaries: (current.recentSummaries || []).filter(item => !processed.has(item.id)),
    lastMergedAt: now,
  });
}

export function addCharacterMemoryItem(
  characterId: string,
  characterName: string,
  content: string,
  options?: {
    source?: CharacterMemoryItem['source'];
    importance?: number;
    kind?: CharacterMemoryItem['kind'];
    section?: CharacterMemoryItem['section'];
  },
): CharacterMemory {
  const trimmed = content.trim();
  if (!trimmed) return getCharacterMemory(characterId, characterName);

  const now = new Date().toISOString();
  const current = getCharacterMemory(characterId, characterName);
  const importance = Math.max(0, Math.min(100, Number(options?.importance ?? 50) || 50));
  const normalized = normalizeMemoryText(trimmed);

  const duplicate = current.items.find(item => {
    const existing = normalizeMemoryText(item.content);
    return existing === normalized || existing.includes(normalized) || normalized.includes(existing);
  });

  if (duplicate) {
    const mergedContent = trimmed.length > duplicate.content.length ? trimmed : duplicate.content;
    const updatedItems = current.items.map(item =>
      item.id === duplicate.id
        ? {
            ...item,
            content: mergedContent,
            updatedAt: now,
            importance: Math.max(item.importance, importance),
            source: options?.source || item.source,
            kind: options?.kind || item.kind,
            section: options?.section || item.section,
          }
        : item
    );
    return saveCharacterMemory({ ...current, items: updatedItems });
  }

  const item: CharacterMemoryItem = {
    id: `memory-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    content: trimmed,
    source: options?.source || 'manual',
    createdAt: now,
    updatedAt: now,
    importance,
    kind: options?.kind || 'fact',
    section: options?.section,
  };

  return saveCharacterMemory({ ...current, items: [item, ...current.items].slice(0, 120) });
}

function normalizeMemoryText(value: string): string {
  return value.toLowerCase().replace(/[“”‘’]/g, '').replace(/[，。！？、；：,.!?;:]/g, '').replace(/\s+/g, '').trim();
}

export function updateCharacterMemoryItem(
  characterId: string,
  characterName: string,
  itemId: string,
  patch: Partial<Pick<CharacterMemoryItem, 'content' | 'importance' | 'kind' | 'section'>>,
): CharacterMemory {
  const current = getCharacterMemory(characterId, characterName);
  const now = new Date().toISOString();
  return saveCharacterMemory({
    ...current,
    items: current.items.map(item => item.id === itemId ? {
      ...item,
      ...patch,
      content: patch.content?.trim() || item.content,
      importance: patch.importance === undefined ? item.importance : Math.max(0, Math.min(100, Number(patch.importance) || 0)),
      updatedAt: now,
    } : item),
  });
}

export function mergeCharacterMemoryItems(
  characterId: string,
  characterName: string,
  itemIds: string[],
): CharacterMemory {
  const current = getCharacterMemory(characterId, characterName);
  const selected = current.items.filter(item => itemIds.includes(item.id));
  if (selected.length < 2) return current;

  const merged = selected.map(item => item.content).filter(Boolean).join('；');
  const keep = selected.slice().sort((a, b) => b.importance - a.importance)[0];
  const ids = new Set(selected.map(item => item.id));
  const nextItems = current.items.filter(item => !ids.has(item.id));
  nextItems.unshift({
    ...keep,
    content: merged,
    importance: Math.max(...selected.map(item => item.importance)),
    updatedAt: new Date().toISOString(),
  });
  return saveCharacterMemory({ ...current, items: nextItems.slice(0, 120) });
}

export function deleteCharacterMemoryItem(characterId: string, itemId: string): CharacterMemory | null {
  if (typeof window === 'undefined') return null;
  const current = getCharacterMemory(characterId, '');
  const next = { ...current, items: current.items.filter(item => item.id !== itemId) };
  return saveCharacterMemory(next);
}

function memoryQueryTerms(query: string): string[] {
  const text = query.toLocaleLowerCase().trim();
  if (!text) return [];
  const terms = new Set<string>();
  for (const match of text.matchAll(/[a-z0-9][a-z0-9'-]*/g)) {
    if (match[0].length >= 2) terms.add(match[0]);
  }
  const cjkRuns = text.match(/[\u3400-\u9fff]+/g) || [];
  for (const run of cjkRuns) {
    if (run.length === 2) terms.add(run);
    else for (let index = 0; index < run.length - 1; index += 1) terms.add(run.slice(index, index + 2));
  }
  return [...terms].slice(0, 48);
}

function memoryRelevance(content: string, terms: string[]): number {
  const normalized = content.toLocaleLowerCase();
  let score = 0;
  for (const term of terms) if (normalized.includes(term)) score += term.length >= 4 ? 2 : 1;
  return score;
}

export function buildMemoryContext(memory: CharacterMemory, maxItems = 20, query = ''): string {
  const sections: string[] = [];
  if (memory.summary?.trim()) sections.push('【长期记忆摘要】\n' + memory.summary.trim());
  const terms = memoryQueryTerms(query);

  const items = [...(memory.items || [])]
    .map(item => ({ item, relevance: memoryRelevance(item.content || '', terms) }))
    .sort((a, b) => Number(b.relevance > 0) - Number(a.relevance > 0)
      || b.relevance - a.relevance
      || b.item.importance - a.item.importance
      || b.item.updatedAt.localeCompare(a.item.updatedAt))
    .slice(0, maxItems)
    .map(entry => entry.item);

  const recent = [...(memory.recentSummaries || [])]
    .map(item => ({ item, relevance: memoryRelevance(item.content || '', terms) }))
    .sort((a, b) => Number(b.relevance > 0) - Number(a.relevance > 0)
      || b.relevance - a.relevance
      || b.item.importance - a.item.importance
      || b.item.createdAt.localeCompare(a.item.createdAt))
    .slice(0, 10)
    .map(entry => entry.item);
  if (recent.length) sections.push('【待整理的近期记忆摘要】\n' + recent.map(item => `- [${item.source}] ${item.content}`).join('\n'));

  if (items.length) {
    sections.push('【长期记忆条目】\n' + items.map(item => `- [重要度 ${item.importance}] ${item.content}`).join('\n'));
  }

  return sections.join('\n\n') || '当前没有已保存的长期记忆。';
}
