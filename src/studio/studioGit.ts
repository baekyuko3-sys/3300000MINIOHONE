export type GitFileChange = {
  path: string;
  content?: string;
  operation: 'create' | 'update' | 'delete';
};

export type GitCommitResult = {
  sha: string;
  branch: string;
};

function apiBase(owner: string, repo: string) {
  return 'https://api.github.com/repos/' + owner + '/' + repo;
}

async function request(url: string, token: string, init: RequestInit = {}) {
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
    let message = '';
    try { message = (await response.json())?.message || ''; } catch {}
    throw new Error('GitHub ' + response.status + (message ? ' · ' + message : ''));
  }
  return response.json();
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function getBranchHead(owner: string, repo: string, branch: string, token: string) {
  const data = await request(apiBase(owner, repo) + '/git/ref/heads/' + encodeURIComponent(branch), token);
  return data.object.sha as string;
}

export async function createBranch(owner: string, repo: string, branch: string, fromRef: string, token: string) {
  const sha = await getBranchHead(owner, repo, fromRef, token);
  return request(apiBase(owner, repo) + '/git/refs', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'refs/heads/' + branch, sha }),
  });
}

export async function applyAtomicChanges(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  changes: GitFileChange[],
  message: string,
): Promise<GitCommitResult> {
  if (!changes.length) throw new Error('没有可提交的 Changes');
  const normalizedPaths = changes.map(change => String(change.path || '').replace(/^\/+|\/+$/g, ''));
  if (normalizedPaths.some(path => !path)) throw new Error('存在空的 Change 路径');
  const duplicatePaths = normalizedPaths.filter((path, index) => normalizedPaths.indexOf(path) !== index);
  if (duplicatePaths.length) {
    throw new Error('存在重复的 Change 路径：' + Array.from(new Set(duplicatePaths)).join(', '));
  }
  const head = await getBranchHead(owner, repo, branch, token);
  const commit = await request(apiBase(owner, repo) + '/git/commits/' + head, token);
  const baseTree = commit.tree.sha as string;

  const tree = [];
  for (const change of changes) {
    const safePath = String(change.path).replace(/^\/+|\/+$/g, '');
    tree.push({
      path: safePath,
      mode: '100644',
      type: 'blob',
      ...(change.operation === 'delete'
        ? { sha: null }
        : { content: change.content || '' }),
    });
  }

  const createdTree = await request(apiBase(owner, repo) + '/git/trees', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });

  const createdCommit = await request(apiBase(owner, repo) + '/git/commits', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: createdTree.sha, parents: [head] }),
  });

  await request(apiBase(owner, repo) + '/git/refs/heads/' + encodeURIComponent(branch), token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: createdCommit.sha, force: false }),
  });

  return { sha: createdCommit.sha, branch };
}

export async function compare(owner: string, repo: string, base: string, head: string, token: string) {
  return request(apiBase(owner, repo) + '/compare/' + encodeURIComponent(base) + '...' + encodeURIComponent(head), token);
}

export async function createPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
  token: string,
  draft = true,
) {
  return request(apiBase(owner, repo) + '/pulls', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, head, base, draft }),
  });
}

export async function rollbackBranch(owner: string, repo: string, branch: string, targetSha: string, token: string) {
  return request(apiBase(owner, repo) + '/git/refs/heads/' + encodeURIComponent(branch), token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: targetSha, force: true }),
  });
}

export async function getWorkflowRunsForCommit(owner: string, repo: string, sha: string, token: string) {
  const data = await request(
    apiBase(owner, repo) + '/actions/runs?head_sha=' + encodeURIComponent(sha) + '&per_page=100',
    token,
  );
  const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  return {
    ...data,
    workflow_runs: runs.filter((run: any) => run?.head_sha === sha),
  };
}

export async function getWorkflowJobs(owner: string, repo: string, runId: number, token: string) {
  return request(apiBase(owner, repo) + '/actions/runs/' + runId + '/jobs', token);
}

export async function getJobLog(owner: string, repo: string, jobId: number, token: string) {
  const response = await fetch(apiBase(owner, repo) + '/actions/jobs/' + jobId + '/logs', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error('GitHub ' + response.status);
  return response.text();
}
