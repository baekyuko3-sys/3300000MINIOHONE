export type StudioTab = 'build' | 'files' | 'crafted' | 'changes' | 'git' | 'settings';

export type StudioChangeStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export type StudioDiffLine = { type: 'context' | 'add' | 'remove'; text: string };

export type StudioChange = {
  id: string;
  operation: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  originalContent?: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  status: StudioChangeStatus;
  createdAt: number;
  diff?: StudioDiffLine[];
  approvedAt?: number;
  appliedCommit?: string;
};

export type StudioCodingMode = 'always-ask' | 'confirm-before-commit' | 'auto';

export type StudioSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{ role: 'user' | 'meme' | 'system'; text: string; createdAt: number }>;
};

export type StudioTask = {
  id: string;
  title: string;
  request: string;
  status: 'planning' | 'working' | 'review' | 'done' | 'failed';
  steps: Array<{
    id: string;
    title: string;
    status: 'todo' | 'working' | 'done' | 'blocked';
  }>;
  createdAt: number;
  updatedAt: number;
};

export type StudioOperationLog = {
  id: string;
  at: number;
  type: 'agent' | 'tool' | 'change' | 'git' | 'error' | 'system';
  text: string;
};

export type StudioCraftedArtifact = {
  id: string;
  name: string;
  kind: 'app' | 'feature' | 'module' | 'fix';
  summary: string;
  files: string[];
  commitSha?: string;
  createdAt: number;
};

export type StudioGitTarget = {
  owner: string;
  repo: string;
  branch: string;
};
