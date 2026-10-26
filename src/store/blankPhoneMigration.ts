const CLEANUP_MARKER = 'sane333:blank-phone-demo-cleanup-v1';

function parseStored(key: string): any {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function removeOnlyIfIdsMatch(key: string, ids: string[]): void {
  const value = parseStored(key);
  if (!Array.isArray(value) || !value.length) return;
  const allowed = new Set(ids);
  if (value.every(item => item && allowed.has(String(item.id)))) {
    window.localStorage.removeItem(key);
  }
}

export function cleanupOldDemoData(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(CLEANUP_MARKER) === 'done') return;

  // These are only the old hard-coded demo stores. Real imported roles are never touched.
  removeOnlyIfIdsMatch('line:chat-items', ['1', '2', '3', '4', '5', '6', '7']);
  removeOnlyIfIdsMatch('line:global-favorites', ['1', '2']);
  removeOnlyIfIdsMatch('phone:threads', ['t1', 't2', 't3']);

  // Do not delete a user's friend list based only on display names. Common names
  // such as Emma or Aki are not reliable evidence that records are demo data.
  // The original migration has no stable demo IDs for these friend records.
  const moments = parseStored('line:moments-screen-posts');
  const demoMomentIds = new Set(['p1', 'p2']);
  if (Array.isArray(moments) && moments.length && moments.every(item => item && demoMomentIds.has(String(item.id)))) {
    window.localStorage.removeItem('line:moments-screen-posts');
  }

  window.localStorage.setItem(CLEANUP_MARKER, 'done');
}
