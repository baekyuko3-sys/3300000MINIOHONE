import { readPersistentState } from './usePersistentState';

export interface GitHubSyncConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  lastSyncedAt?: string;
}

export const DEFAULT_GITHUB_SYNC: GitHubSyncConfig = {
  enabled: false,
  owner: '',
  repo: '',
  branch: 'main',
  path: 'sane333/data.json',
};

const CONFIG_KEY = 'phone:github-sync';
const TOKEN_KEY = 'sane333:github-token';

export function getGitHubSyncConfig(): GitHubSyncConfig {
  const saved = readPersistentState<Partial<GitHubSyncConfig>>(CONFIG_KEY, {});
  return { ...DEFAULT_GITHUB_SYNC, ...saved };
}

export function saveGitHubSyncConfig(patch: Partial<GitHubSyncConfig>): GitHubSyncConfig {
  const next = { ...getGitHubSyncConfig(), ...patch };
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function getGitHubToken(): string {
  return typeof window === 'undefined' ? '' : window.localStorage.getItem(TOKEN_KEY) || '';
}

export function saveGitHubToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (token.trim()) window.localStorage.setItem(TOKEN_KEY, token.trim());
  else window.localStorage.removeItem(TOKEN_KEY);
}

function apiUrl(config: GitHubSyncConfig): string {
  if (!config.owner.trim() || !config.repo.trim()) throw new Error('GITHUB_REPO_MISSING');
  return 'https://api.github.com/repos/' + encodeURIComponent(config.owner.trim()) + '/' + encodeURIComponent(config.repo.trim()) + '/contents/' + config.path.split('/').map(encodeURIComponent).join('/');
}

function encodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function githubRequest(url: string, token: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = '';
    try { const data = await response.json(); detail = data?.message || ''; } catch { /* ignore */ }
    throw new Error('GITHUB_' + response.status + (detail ? ': ' + detail : ''));
  }
  return response.status === 204 ? null : response.json();
}

export async function testGitHubSync(config = getGitHubSyncConfig(), token = getGitHubToken()): Promise<string> {
  const cleanToken = token.trim();
  const cleanOwner = config.owner.trim();
  const cleanRepo = config.repo.trim();
  const cleanBranch = (config.branch || 'main').trim() || 'main';
  if (!cleanToken) throw new Error('GITHUB_TOKEN_MISSING');
  if (!cleanOwner || !cleanRepo) throw new Error('GITHUB_REPO_MISSING');

  // A token can be valid while still having no access to the configured repo.
  // Do not report "connected" until the exact repository and branch are readable.
  const data = await githubRequest('https://api.github.com/user', cleanToken);
  const repository = await githubRequest(
    'https://api.github.com/repos/' + encodeURIComponent(cleanOwner) + '/' + encodeURIComponent(cleanRepo),
    cleanToken,
  );
  const targetBranch = cleanBranch || repository.default_branch || 'main';
  await githubRequest(
    'https://api.github.com/repos/' + encodeURIComponent(cleanOwner) + '/' + encodeURIComponent(cleanRepo) +
      '/contents/?ref=' + encodeURIComponent(targetBranch),
    cleanToken,
  );

  saveGitHubSyncConfig({
    ...config,
    enabled: true,
    owner: cleanOwner,
    repo: cleanRepo,
    branch: targetBranch,
  });
  return data?.login || 'GitHub 已连接';
}

export async function syncSnapshotToGitHub(snapshot: unknown, config = getGitHubSyncConfig(), token = getGitHubToken()): Promise<{ sha: string; syncedAt: string }> {
  if (!token.trim()) throw new Error('GITHUB_TOKEN_MISSING');
  const url = apiUrl(config);
  let existingSha: string | undefined;
  try {
    const existing = await githubRequest(url + '?ref=' + encodeURIComponent(config.branch), token);
    existingSha = typeof existing?.sha === 'string' ? existing.sha : undefined;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('GITHUB_404')) throw error;
  }

  const syncedAt = new Date().toISOString();
  const response = await githubRequest(url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'chore(sane333): sync private phone data ' + syncedAt,
      content: encodeUtf8(JSON.stringify({ version: 1, syncedAt, data: snapshot }, null, 2)),
      branch: config.branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  saveGitHubSyncConfig({ ...config, enabled: true, lastSyncedAt: syncedAt });
  return { sha: response?.content?.sha || '', syncedAt };
}

export async function pullSnapshotFromGitHub(config = getGitHubSyncConfig(), token = getGitHubToken()): Promise<{ data: unknown; syncedAt?: string }> {
  if (!token.trim()) throw new Error('GITHUB_TOKEN_MISSING');
  const existing = await githubRequest(apiUrl(config) + '?ref=' + encodeURIComponent(config.branch), token);
  if (!existing?.content) throw new Error('GITHUB_DATA_EMPTY');
  const binary = atob(existing.content.replace(/\\s/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  return { data: parsed?.data, syncedAt: parsed?.syncedAt };
}
