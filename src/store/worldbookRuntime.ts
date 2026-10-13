import type { WorldBook } from '../types';

export const WORLDBOOK_STORAGE = {
  books: 'phone:worldbooks',
  onlineGlobalIds: 'phone:worldbook:global-online-ids',
  offlineGlobalIds: 'phone:worldbook:global-offline-ids',
  globalEnabled: 'phone:worldbook:global-enabled',
} as const;

export type WorldBookScope = 'online-chat' | 'offline-story';

type CharacterLike = {
  id?: string;
  name?: string;
  worldBookIds?: string[];
  embeddedWorldBooks?: WorldBook[];
  embeddedWorldBook?: WorldBook;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readOnlineGlobalIds(): string[] {
  const ids = readJson<string[]>(WORLDBOOK_STORAGE.onlineGlobalIds, []);
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

export function readOfflineGlobalIds(): string[] {
  const ids = readJson<string[]>(WORLDBOOK_STORAGE.offlineGlobalIds, []);
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

export function isCharacterOwnedBook(book: WorldBook): boolean {
  return book.sourceType === 'character-card' || Boolean(book.sourceCharacterId);
}

export function bookMatchesCharacter(book: WorldBook, character?: CharacterLike | null): boolean {
  if (!character?.id && !character?.name) return false;
  return (
    book.sourceCharacterId === character.id ||
    (!book.sourceCharacterId && Boolean(book.sourceCharacterName) && book.sourceCharacterName === character.name)
  );
}

export function bookHasScope(
  book: WorldBook,
  scope: WorldBookScope,
  onlineIds: string[] = readOnlineGlobalIds(),
  offlineIds: string[] = readOfflineGlobalIds(),
): boolean {
  if (scope === 'online-chat') {
    return onlineIds.includes(book.id) || (book.globalScopes || []).includes('online-chat');
  }
  return offlineIds.includes(book.id) || (book.globalScopes || []).includes('offline-story');
}

/** Keep book.globalScopes in sync with the online/offline ID lists. */
export function withSyncedGlobalScopes(book: WorldBook, onlineIds: string[], offlineIds: string[]): WorldBook {
  const scopes: WorldBookScope[] = [];
  if (onlineIds.includes(book.id)) scopes.push('online-chat');
  if (offlineIds.includes(book.id)) scopes.push('offline-story');
  const prev = book.globalScopes || [];
  const same = scopes.length === prev.length && scopes.every(scope => prev.includes(scope));
  if (same) return book;
  return { ...book, globalScopes: scopes.length ? scopes : undefined };
}

export function syncBooksGlobalScopes(books: WorldBook[], onlineIds: string[], offlineIds: string[]): WorldBook[] {
  let changed = false;
  const next = books.map(book => {
    const synced = withSyncedGlobalScopes(book, onlineIds, offlineIds);
    if (synced !== book) changed = true;
    return synced;
  });
  return changed ? next : books;
}

/** Merge persisted ID lists with scopes already stored on books (migration). */
export function coalesceGlobalIds(books: WorldBook[], storedIds: string[], scope: WorldBookScope): string[] {
  const fromBooks = books
    .filter(book => (book.globalScopes || []).includes(scope))
    .map(book => book.id);
  return Array.from(new Set([...(Array.isArray(storedIds) ? storedIds : []), ...fromBooks].filter(Boolean)));
}

function embeddedBooksOf(character?: CharacterLike | null): WorldBook[] {
  if (!character) return [];
  if (character.embeddedWorldBooks?.length) return character.embeddedWorldBooks;
  return character.embeddedWorldBook ? [character.embeddedWorldBook] : [];
}

/**
 * Resolve which world books apply for online chat or offline story.
 * Online/offline globals stay independent; character-owned books never leak across characters.
 */
export function collectScopedWorldBooks(options: {
  books: WorldBook[];
  scope: WorldBookScope;
  character?: CharacterLike | null;
  onlineGlobalIds?: string[];
  offlineGlobalIds?: string[];
  extraBookIds?: string[];
}): WorldBook[] {
  const {
    books,
    scope,
    character,
    onlineGlobalIds = readOnlineGlobalIds(),
    offlineGlobalIds = readOfflineGlobalIds(),
    extraBookIds = [],
  } = options;

  const characterIds = new Set(character?.worldBookIds || []);
  const hasExplicitCharacterSelection = Array.isArray(character?.worldBookIds);
  const extra = new Set(extraBookIds);
  const pool = [...embeddedBooksOf(character), ...(Array.isArray(books) ? books : [])];
  const seen = new Set<string>();
  const result: WorldBook[] = [];

  for (const book of pool) {
    if (!book || typeof book !== 'object' || !Array.isArray(book.entries)) continue;
    const key = book.id || `book:${book.name}`;
    if (seen.has(key)) continue;

    let include = false;
    if (extra.has(book.id)) include = true;
    else if (bookHasScope(book, scope, onlineGlobalIds, offlineGlobalIds)) include = true;
    else if (hasExplicitCharacterSelection && characterIds.has(book.id)) include = true;
    else if (!hasExplicitCharacterSelection && isCharacterOwnedBook(book) && bookMatchesCharacter(book, character)) {
      include = true;
    }

    if (include && isCharacterOwnedBook(book) && character) {
      const allowedBySelection = hasExplicitCharacterSelection && characterIds.has(book.id);
      if (!allowedBySelection && !bookMatchesCharacter(book, character)) include = false;
    }

    if (!include) continue;
    seen.add(key);
    result.push(book);
  }

  return result;
}

/** Final AI-side privacy filter after the caller has already scoped the pool. */
export function filterWorldBooksForCharacter(
  books: WorldBook[],
  character?: CharacterLike | null,
): WorldBook[] {
  const selectedIds = new Set(character?.worldBookIds || []);
  const hasExplicitSelection = Array.isArray(character?.worldBookIds);

  return (books || []).filter(book => {
    if (!isCharacterOwnedBook(book)) return true;
    if (hasExplicitSelection && selectedIds.has(book.id)) return true;
    return bookMatchesCharacter(book, character);
  });
}
