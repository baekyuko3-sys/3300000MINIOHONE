import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Clock3, FileCode2, Folder, Github, KeyRound, Loader2, MessageCircle, Plus, Save, Send, Settings2, Copy, RotateCcw, ShieldAlert, Sparkles, Trash2, Upload, X } from 'lucide-react';
import type { ScreenType } from '../../types';
import { generateCreativeText, listOpenAiCompatibleModels } from '../../ai/aiEngine';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../store/appSettings';
import { runMemeAgent, type MemeCodingMode } from '../../studio/memeAgent';
import { studioStorage } from '../../studio/studioStorage';
import { applyAtomicChanges, compare, createBranch, createPullRequest, getWorkflowRunsForCommit, getWorkflowJobs, getJobLog, rollbackBranch } from '../../studio/studioGit';
import type { StudioOperationLog, StudioSession, StudioTask } from '../../studio/studioTypes';

type Tab = 'chat' | 'files' | 'changes' | 'crafted' | 'admin' | 'git' | 'settings';
const MEME_MODE_STORE = 'studio:meme-coding-mode';
type Item = { name: string; path: string; type: 'file' | 'dir'; sha?: string };
type Change = { path: string; content: string; reason?: string; risk?: 'low' | 'medium' | 'high'; operation?: 'create' | 'update' | 'delete'; originalContent?: string; validation?: { status: 'passed' | 'needs_revision' | 'needs_more_context'; summary: string; checks: string[]; concerns: string[]; changedLines: number; removedLines: number } };

const STORE = {
  base: 'studio:ai-base',
  key: 'studio:ai-key',
  model: 'studio:model',
  owner: 'studio:github-owner',
  repo: 'studio:github-repo',
  branch: 'studio:github-branch',
  token: 'studio:github-token',
};

function readStore(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function writeStore(key: string, value: string) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}


const STUDIO_AI_SETTINGS_STORE = 'studio:ai-settings';
const STUDIO_API_PROFILES_STORE = 'studio:api-profiles';
const STUDIO_GITHUB_PROFILES_STORE = 'studio:github-profiles';
const STUDIO_GITHUB_ACTIVE_STORE = 'studio:github-active';

type StudioApiProfile = {
  id: string;
  name: string;
  settings: Pick<AppSettings, 'provider' | 'apiBaseUrl' | 'apiKey' | 'model' | 'streaming' | 'contextLength' | 'maxOutputTokens' | 'temperature' | 'topP' | 'topK' | 'frequencyPenalty' | 'presencePenalty' | 'seed'>;
  createdAt: string;
  updatedAt: string;
};

type StudioGithubProfile = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  createdAt: string;
  updatedAt: string;
};

function readStudioAiSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STUDIO_AI_SETTINGS_STORE);
    return raw ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } : DEFAULT_APP_SETTINGS;
  } catch { return DEFAULT_APP_SETTINGS; }
}

function saveStudioAiSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...readStudioAiSettings(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STUDIO_AI_SETTINGS_STORE, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sane333:studio-settings-changed'));
  }
  return next;
}

function readStudioApiProfiles(): StudioApiProfile[] {
  if (typeof window === 'undefined') return [];
  try { const value = JSON.parse(window.localStorage.getItem(STUDIO_API_PROFILES_STORE) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeStudioApiProfiles(value: StudioApiProfile[]) { if (typeof window !== 'undefined') window.localStorage.setItem(STUDIO_API_PROFILES_STORE, JSON.stringify(value)); }
function readStudioGithubProfiles(): StudioGithubProfile[] {
  if (typeof window === 'undefined') return [];
  try { const value = JSON.parse(window.localStorage.getItem(STUDIO_GITHUB_PROFILES_STORE) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeStudioGithubProfiles(value: StudioGithubProfile[]) { if (typeof window !== 'undefined') window.localStorage.setItem(STUDIO_GITHUB_PROFILES_STORE, JSON.stringify(value)); }

function aiUrl(base: string) {
  const value = base.trim().replace(/\/+$/, '');
  if (!value) throw new Error('AI Base URL 未填写');
  return /\/chat\/completions$/i.test(value) ? value : value + '/chat/completions';
}

async function github(url: string, token: string, init: RequestInit = {}) {
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
    try {
      const data = await response.json();
      message = data?.message || '';
    } catch {}
    throw new Error('GitHub ' + response.status + (message ? ' · ' + message : ''));
  }
  return response.json();
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

export function ProjectStudioScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AppSettings>(() => readStudioAiSettings());
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [githubVerified, setGithubVerified] = useState(() => {
    const active = readStore(STUDIO_GITHUB_ACTIVE_STORE);
    const current = readStore(STORE.owner).trim() + '/' + readStore(STORE.repo).trim() + '@' + (readStore(STORE.branch, 'main').trim() || 'main');
    return Boolean(active && active === current);
  });
  const [githubError, setGithubError] = useState('');
  const [owner, setOwner] = useState(() => readStore(STORE.owner));
  const [repo, setRepo] = useState(() => readStore(STORE.repo));
  const [branch, setBranch] = useState(() => readStore(STORE.branch, 'main'));
  const [token, setToken] = useState(() => readStore(STORE.token));
  const [githubBranches, setGithubBranches] = useState<string[]>([]);
  const [studioApiProfiles, setStudioApiProfiles] = useState<StudioApiProfile[]>(() => readStudioApiProfiles());
  const [studioApiProfileName, setStudioApiProfileName] = useState('');
  const [studioGithubProfiles, setStudioGithubProfiles] = useState<StudioGithubProfile[]>(() => readStudioGithubProfiles());
  const [studioGithubProfileName, setStudioGithubProfileName] = useState('');

  const [items, setItems] = useState<Item[]>([]);
  const [path, setPath] = useState('');
  const [file, setFile] = useState<Item | null>(null);
  const [code, setCode] = useState('');
  const [original, setOriginal] = useState('');
  const [prompt, setPrompt] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; kind: 'image' | 'file'; size: number }>>([]);
  const [message, setMessage] = useState('hey ✦ 我是 Studio。你告诉我想改什么，我们一起改这个小手机。');
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [newPath, setNewPath] = useState('');
  const [newContent, setNewContent] = useState('');
  const [deletePath, setDeletePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [memeMode, setMemeMode] = useState<MemeCodingMode>(() => readStore(MEME_MODE_STORE, 'always-ask') as MemeCodingMode);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState<string[]>([]);
  const [tasks, setTasks] = useState<StudioTask[]>(() => studioStorage.tasks());
  const [logs, setLogs] = useState<StudioOperationLog[]>(() => studioStorage.logs());
  const [gitCommits, setGitCommits] = useState<any[]>([]);
  const [prUrl, setPrUrl] = useState('');
  const [ciText, setCiText] = useState('');
  type StudioCiStatus =
    | 'idle' | 'analyzing' | 'changes' | 'committing' | 'running'
    | 'failed' | 'repairing' | 'success' | 'timeout';
  const [ciStatus, setCiStatus] = useState<StudioCiStatus>('idle');
  const [ciStatusMessage, setCiStatusMessage] = useState('');
  const [ciStatusSha, setCiStatusSha] = useState('');
  const STUDIO_CI_STATUS_STORE = 'studio:ci-status:';
  const [crafted, setCrafted] = useState<any[]>(() => { try { return JSON.parse(readStore('studio:crafted','[]')); } catch { return []; } });
  const [sessions, setSessions] = useState<StudioSession[]>(() => studioStorage.sessions());
  const [sessionId, setSessionId] = useState(() => {
    const existing = studioStorage.sessions()[0];
    return existing?.id || 'session-' + Date.now();
  });
  const [currentTask, setCurrentTask] = useState<StudioTask | null>(null);
  const [taskSteps, setTaskSteps] = useState<string[]>([]);
  const [sessionTitle, setSessionTitle] = useState(() => studioStorage.sessions()[0]?.title || 'New build session');
  useEffect(() => {
    const first = studioStorage.sessions()[0];
    if (!first) return;
    setSessionId(first.id);
    setSessionTitle(first.title || 'New build session');
    setConversation(first.messages.map(message => ({
      role: message.role === 'meme' ? 'assistant' as const : 'user' as const,
      content: message.text,
    })).slice(-24));
    const savedStatus = readSavedCiStatus(first.id);
    if (savedStatus) {
      setCiStatus(savedStatus.status);
      setCiStatusMessage(savedStatus.message);
      setCiStatusSha(savedStatus.sha || '');
    }
    const savedTask = studioStorage.tasks().find(task => task.request.includes(first.title));
    if (savedTask) setCurrentTask(savedTask);
  }, []);

  const startNewSession = () => {
    const id = 'session-' + Date.now();
    const now = Date.now();
    const nextSession: StudioSession = {
      id,
      title: 'New build session',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    const nextSessions = [nextSession, ...studioStorage.sessions()].slice(0, 30);
    studioStorage.saveSessions(nextSessions);
    setSessions(nextSessions);
    setSessionId(id);
    setSessionTitle('New build session');
    setConversation([]);
    setMessage('hey ✦ 告诉我你想改什么，我们一起改这个小手机。');
    setCurrentTask(null);
    setAgentEvents([]);
    updateChanges(() => []);
    try {
      window.localStorage.removeItem('studio:changes:' + id);
      window.localStorage.removeItem(STUDIO_CI_STATUS_STORE + id);
    } catch {}
    setCiStatus('idle');
    setCiStatusMessage('');
    setCiStatusSha('');
    setHistoryOpen(false);
    setTab('chat');
  };

  const persistChanges = (nextChanges: Change[]) => {
    try { window.localStorage.setItem('studio:changes:' + sessionId, JSON.stringify(nextChanges)); } catch {}
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('studio:changes:' + sessionId);
      setChanges(raw ? JSON.parse(raw) : []);
    } catch { setChanges([]); }
  }, [sessionId]);

  const updateChanges = (updater: (previous: Change[]) => Change[]) => {
    setChanges(previous => {
      const next = updater(previous);
      persistChanges(next);
      return next;
    });
  };

  const persistSession = (nextConversation: Array<{ role: 'user' | 'assistant'; content: string }>, title: string) => {
    const now = Date.now();
    const previous = studioStorage.sessions();
    const existing = previous.find(session => session.id === sessionId);
    const session: StudioSession = {
      id: sessionId,
      title: title || 'New build session',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      messages: nextConversation.map(message => ({
        role: message.role === 'assistant' ? 'meme' : 'user',
        text: message.content,
        createdAt: now,
      })),
    };
    const next = [session, ...previous.filter(item => item.id !== sessionId)].slice(0, 30);
    setSessions(next);
    studioStorage.saveSessions(next);
  };

  // Studio repository is user-configurable. It never falls back to the
  // phone-wide GitHub repository; only the PAT is read from Studio's own store.
  const sharedOwner = owner.trim();
  const sharedRepo = repo.trim();
  const sharedBranch = branch.trim() || 'main';
  // Studio owns its GitHub PAT. Do not silently substitute the phone-wide
  // GitHub token: this workspace must use the PAT entered in Studio Settings.
  const sharedToken = token.trim();
  const hasGithubCredentials = Boolean(sharedOwner && sharedRepo && sharedToken);
  const ready = githubVerified && hasGithubCredentials;

  const aiReady = Boolean(aiSettings.apiBaseUrl.trim() && aiSettings.apiKey.trim() && aiSettings.model.trim());
  const dirty = Boolean(file && code !== original);
  const activeTaskRequest = currentTask?.request
    || [...conversation].reverse().find(item => item.role === 'user')?.content
    || sessionTitle
    || '未记录任务';

  const log = (type: StudioOperationLog['type'], text: string) => { const item={id:'log-'+Date.now(),at:Date.now(),type,text}; setLogs(v=>[item,...v].slice(0,100)); studioStorage.addLog(item); };

  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const saveSettings = () => {
    const next = saveStudioAiSettings(aiSettings);
    setAiSettings(next);
    writeStore(STORE.owner, owner.trim());
    writeStore(STORE.repo, repo.trim());
    writeStore(STORE.branch, branch.trim() || 'main');
    writeStore(STORE.token, token.trim());
    notify('Studio 当前设置已保存');
  };

  const updateAi = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = saveStudioAiSettings({ [key]: value });
    setAiSettings(next);
  };

  const saveStudioApiProfile = () => {
    const name = studioApiProfileName.trim() || window.prompt('给这个 Studio API 方案起个名字')?.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const profile: StudioApiProfile = {
      id: 'studio-api-' + Date.now(), name,
      settings: { provider: aiSettings.provider, apiBaseUrl: aiSettings.apiBaseUrl, apiKey: aiSettings.apiKey, model: aiSettings.model, streaming: aiSettings.streaming, contextLength: aiSettings.contextLength, maxOutputTokens: aiSettings.maxOutputTokens, temperature: aiSettings.temperature, topP: aiSettings.topP, topK: aiSettings.topK, frequencyPenalty: aiSettings.frequencyPenalty, presencePenalty: aiSettings.presencePenalty, seed: aiSettings.seed },
      createdAt: now, updatedAt: now,
    };
    const next = [profile, ...studioApiProfiles.filter(item => item.name !== name)].slice(0, 30);
    writeStudioApiProfiles(next); setStudioApiProfiles(next); setStudioApiProfileName('');
    notify('Studio API 方案已保存：' + name);
  };

  const applyStudioApiProfile = (profile: StudioApiProfile) => {
    const next = saveStudioAiSettings(profile.settings);
    setAiSettings(next);
    notify('已应用 Studio API：' + profile.name);
  };

  const deleteStudioApiProfile = (id: string) => {
    if (!window.confirm('删除这个 Studio API 方案？')) return;
    const next = studioApiProfiles.filter(item => item.id !== id);
    writeStudioApiProfiles(next); setStudioApiProfiles(next);
    notify('Studio API 方案已删除');
  };

  const saveStudioGithubProfile = () => {
    const name = studioGithubProfileName.trim() || window.prompt('给这个仓库方案起个名字')?.trim();
    const ownerText = owner.trim(); const repoText = repo.trim(); const branchText = branch.trim() || 'main'; const tokenText = token.trim();
    if (!name) return;
    if (!ownerText || !repoText || !tokenText) { notify('请先填写 Owner、Repository 和 PAT'); return; }
    const now = new Date().toISOString();
    const profile: StudioGithubProfile = { id: 'studio-github-' + Date.now(), name, owner: ownerText, repo: repoText, branch: branchText, token: tokenText, createdAt: now, updatedAt: now };
    const next = [profile, ...studioGithubProfiles.filter(item => item.name !== name)].slice(0, 30);
    writeStudioGithubProfiles(next); setStudioGithubProfiles(next); setStudioGithubProfileName('');
    notify('仓库方案已保存：' + name);
  };

  const applyStudioGithubProfile = (profile: StudioGithubProfile) => {
    setOwner(profile.owner); setRepo(profile.repo); setBranch(profile.branch || 'main'); setToken(profile.token);
    setGithubBranches([]); setGithubVerified(false); setGithubError('');
    writeStore(STORE.owner, profile.owner); writeStore(STORE.repo, profile.repo); writeStore(STORE.branch, profile.branch || 'main'); writeStore(STORE.token, profile.token);
    window.localStorage.removeItem(STUDIO_GITHUB_ACTIVE_STORE);
    notify('已应用仓库方案：' + profile.name + ' · 请点击“连接 GitHub”');
  };

  const deleteStudioGithubProfile = (id: string) => {
    if (!window.confirm('删除这个仓库方案？')) return;
    const next = studioGithubProfiles.filter(item => item.id !== id);
    writeStudioGithubProfiles(next); setStudioGithubProfiles(next);
    notify('仓库方案已删除');
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const models = await listOpenAiCompatibleModels(aiSettings);
      setAvailableModels(models);
      notify(models.length ? '已拉取 ' + models.length + ' 个模型' : '接口没有返回模型列表');
    } catch (error) {
      notify(error instanceof Error ? error.message : '模型拉取失败');
    } finally {
      setLoadingModels(false);
    }
  };

  const testAi = async () => {
    setTestingAi(true);
    try {
      // Studio 的连接测试必须走“普通模型对话”，不能进入角色卡/角色聊天引擎。
      const text = await generateCreativeText({
        settings: { ...aiSettings, streaming: false },
        systemPrompt: '你是 Studio 内置的 Meme 助手。这里是普通助手对话，不存在角色卡、角色人设或世界书。请自然、简洁地回答用户。',
        userPrompt: '请回复：你好，有什么可以帮到你？',
        temperature: 0.2,
        timeoutMs: 60000,
      });
      notify(text || 'AI 连接成功');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI 连接失败');
    } finally {
      setTestingAi(false);
    }
  };

  const list = async (folder = '') => {
    const effectiveOwner = owner.trim();
    const effectiveRepo = repo.trim();
    const effectiveBranch = branch.trim() || 'main';
    const effectiveToken = token.trim();
    const effectiveReady = Boolean(effectiveOwner && effectiveRepo && effectiveBranch && effectiveToken);
    if (!effectiveReady) {
      setTab('settings');
      notify('先在 Settings 连接 GitHub');
      return;
    }
    setBusy(true);
    try {
      const clean = folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      const url = 'https://api.github.com/repos/' + effectiveOwner + '/' + effectiveRepo + '/contents/' + clean + '?ref=' + encodeURIComponent(effectiveBranch);
      const data = await github(url, sharedToken);
      const array = Array.isArray(data) ? data : [data];
      setItems(array.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        sha: item.sha,
      })));
      setGithubVerified(true);
      setPath(folder);
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取 GitHub 失败');
    } finally {
      setBusy(false);
    }
  };

  const open = async (item: Item) => {
    if (item.type === 'dir') {
      await list(item.path);
      return;
    }
    const effectiveOwner = owner.trim();
    const effectiveRepo = repo.trim();
    const effectiveBranch = branch.trim() || 'main';
    const effectiveToken = token.trim();
    if (!effectiveOwner || !effectiveRepo || !effectiveBranch || !effectiveToken) return;
    setBusy(true);
    try {
      const url = 'https://api.github.com/repos/' + effectiveOwner + '/' + effectiveRepo + '/contents/' + item.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(effectiveBranch);
      const data = await github(url, sharedToken);
      setFile(item);
      setCode(decodeBase64(data.content));
      setOriginal(decodeBase64(data.content));
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取文件失败');
    } finally {
      setBusy(false);
    }
  };

  const saveFile = async () => {
    const effectiveOwner = owner.trim();
    const effectiveRepo = repo.trim();
    const effectiveBranch = branch.trim() || 'main';
    const effectiveToken = token.trim();
    if (!file || !effectiveOwner || !effectiveRepo || !effectiveBranch || !effectiveToken) return;
    setSaving(true);
    try {
      const url = 'https://api.github.com/repos/' + effectiveOwner + '/' + effectiveRepo + '/contents/' + file.path.split('/').map(encodeURIComponent).join('/');
      await github(url, sharedToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Studio: update ' + file.path,
          content: encodeBase64(code),
          sha: file.sha,
          branch: effectiveBranch,
        }),
      });
      setOriginal(code);
      await list(path);
      notify('已保存到 GitHub');
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const ask = async (overrideRequest?: string, overrideConversation?: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    const sourceRequest = overrideRequest ?? prompt;
    if (!sourceRequest.trim()) return;
    // Studio must use the same linked GitHub credentials as the rest of the app.
    const effectiveOwner = owner.trim();
    const effectiveRepo = repo.trim();
    const effectiveBranch = branch.trim() || 'main';
    const effectiveToken = token.trim();
    if (!aiSettings.apiKey.trim() || !aiSettings.model.trim() || !aiSettings.apiBaseUrl.trim()) {
      setTab('settings');
      notify('先填写 AI API Base URL、Key 和 Model');
      return;
    }
    const request = sourceRequest.trim();
    const attachedContext = attachments.length
      ? `\\n\\n[附件：${attachments.map(item => item.name).join('、')}]`
      : '';
    const requestWithAttachments = request + attachedContext;
    setPrompt('');
    setAttachments([]);
    setMessage('你：' + request);
    // React state updates are asynchronous. Build the history synchronously so
    // Meme receives the message that was just submitted on its first round.
    const baseConversation = overrideConversation ?? conversation;
    const nextConversation = [...baseConversation, { role: 'user' as const, content: requestWithAttachments }].slice(-24);
    setConversation(nextConversation);
    persistSession(nextConversation, request.slice(0, 32));
    setAiBusy(true);
    setAgentRunning(true);
    const task: StudioTask = { id:'task-'+Date.now(), title:request.slice(0,50), request, status:'working', steps:[{id:'inspect',title:'Inspect project',status:'working'},{id:'plan',title:'Plan changes',status:'todo'},{id:'review',title:'Review Changes',status:'todo'},{id:'apply',title:'Apply approved changes',status:'todo'}],createdAt:Date.now(),updatedAt:Date.now() };
    setCurrentTask(task); setTasks(v=>{const next=[task,...v].slice(0,30); studioStorage.saveTasks(next); return next;});
    log('agent', 'Started task: ' + request);
    setAgentEvents([]);
    setTaskSteps(['理解需求', '检查相关文件', '准备修改', '等待 Changes 审批']);
    setSessionTitle(request.slice(0, 32));
    try {
      const project = effectiveOwner + '/' + effectiveRepo + '@' + effectiveBranch;
      const result = await runMemeAgent({
        apiBaseUrl: aiSettings.apiBaseUrl,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        provider: aiSettings.provider,
        conversation: nextConversation,
        codingMode: memeMode,
        maxRounds: 8,
        maxValidationRounds: 1,
        project: effectiveOwner + '/' + effectiveRepo + '@' + effectiveBranch,
        tools: [
          {
            name: 'inspect',
            description: 'Inspect a repository directory.',
            run: async ({ path: target = '' }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const url = 'https://api.github.com/repos/' + effectiveOwner + '/' + effectiveRepo + '/contents/' + clean + '?ref=' + encodeURIComponent(effectiveBranch);
              const data = await github(url, sharedToken);
              return Array.isArray(data)
                ? data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha }))
                : { name: data.name, path: data.path, type: data.type, sha: data.sha };
            },
          },
          {
            name: 'read',
            description: 'Read a repository file.',
            run: async ({ path: target }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const url = 'https://api.github.com/repos/' + effectiveOwner + '/' + effectiveRepo + '/contents/' + clean + '?ref=' + encodeURIComponent(effectiveBranch);
              const data = await github(url, sharedToken);
              if (Array.isArray(data)) return { error: 'Path is a directory', items: data.map((item: any) => item.path) };
              return { path: data.path, sha: data.sha, content: decodeBase64(data.content).slice(0, 60000) };
            },
          },
          {
            name: 'search',
            description: 'Search the repository code.',
            run: async ({ query }) => {
              const q = encodeURIComponent(String(query) + ' repo:' + sharedOwner + '/' + sharedRepo);
              const data = await github('https://api.github.com/search/code?q=' + q, sharedToken);
              return (data.items || []).slice(0, 20).map((item: any) => ({ path: item.path, name: item.name, sha: item.sha }));
            },
          },
        ],
        onEvent: event => {
          if (event.type === 'proposal') {
            stageMemeProposal(event.proposal);
          } else if (event.type === 'validation') {
            setAgentEvents(previous => [...previous.slice(-7), 'validation · ' + event.path + ' · ' + event.validation.status]);
            log('agent', 'Validation ' + event.validation.status + ' · ' + event.path);
          } else if (event.type === 'message' || event.type === 'done') {
            setMessage(event.text);
          } else if (event.type === 'tool') {
            setAgentEvents(previous => [...previous.slice(-7), event.name + ' · ' + JSON.stringify(event.input)]);
            log('tool', event.name);
          }
        },
      }, request);
      if (result.text) {
        setMessage(result.text);
        const completedConversation = [...nextConversation, { role: 'assistant' as const, content: result.text }].slice(-24);
        setConversation(completedConversation);
        persistSession(completedConversation, request.slice(0, 32));
      }
      if (/修改|修复|改成|增加|删除|重构|实现|fix|change|update|edit|remove|refactor|implement/i.test(request) && !result.proposals.length) {
        const blocked = 'Meme 尚未生成可审核的 Changes，因此不会把代码任务标记为完成。请继续检查仓库或修复模型输出。';
        setMessage(blocked);
        setCurrentTask(v => v ? {...v,status:'failed',updatedAt:Date.now(),steps:v.steps.map(step => ({...step,status:'blocked'} as any))} : v);
        updateCiStatus('failed', '代码任务没有产生 Changes，未执行任何 GitHub 写入。');
        log('error', 'Coding task ended without Changes');
      } else {
        log('agent', 'Finished current pass');
        setCurrentTask(v => v ? {...v,status:'review',updatedAt:Date.now(),steps:v.steps.map((step,i)=>({...step,status:i<2?'done':i===2?'working':'todo'} as any))} : v);
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Meme Agent 请求失败';
      const isCodeTask = /github|仓库|repo|repository|代码|源码|文件|项目|bug|报错|lint|build|构建|修改|修复|连接|链接|commit|提交|重构|实现|implement|refactor/i.test(request);
      if (isCodeTask) {
        const reply = 'Meme 开发 Agent 执行失败：' + failure + '\n\n没有执行普通聊天 fallback，也没有写入 GitHub。请查看上面的 MEME · ACTIVITY / Workflow Status。';
        setMessage(reply);
        const failedConversation = [...nextConversation, { role: 'assistant' as const, content: reply }].slice(-24);
        setConversation(failedConversation);
        persistSession(failedConversation, request.slice(0, 32));
        setCurrentTask(v => v ? {...v,status:'failed',updatedAt:Date.now()} : v);
        updateCiStatus('failed', 'Meme 开发 Agent 执行失败，未写入 GitHub。');
        log('error', 'Meme coding agent failed without fallback');
      } else {
        // Only non-coding conversation may use a normal text fallback.
        try {
          const fallback = await generateCreativeText({
            settings: { ...aiSettings, streaming: false },
            systemPrompt: '你是 Studio 内置的 Meme 助手。普通闲聊可以直接回答。',
            userPrompt: request,
            temperature: 0.35,
          });
          const reply = fallback || '你好，有什么可以帮到你？';
          setMessage(reply);
          const fallbackConversation = [...nextConversation, { role: 'assistant' as const, content: reply }].slice(-24);
          setConversation(fallbackConversation);
          persistSession(fallbackConversation, request.slice(0, 32));
          log('agent', 'Meme non-coding fallback');
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Meme 请求失败';
          setMessage(fallbackMessage);
          log('error', fallbackMessage);
        }
      }
    } finally {
      setAiBusy(false);
      setAgentRunning(false);
    }
  };

  const copyMessage = async (content: string) => {
    try { await navigator.clipboard.writeText(content); notify('已复制'); }
    catch { notify('复制失败，请检查浏览器权限'); }
  };

  const deleteMessage = (index: number) => {
    const next = conversation.filter((_, i) => i !== index);
    setConversation(next);
    persistSession(next, sessionTitle);
    notify('已删除');
  };

  const rerollMessage = async (index: number) => {
    const target = conversation[index];
    if (!target || target.role !== 'assistant' || aiBusy) return;
    const previousUser = [...conversation.slice(0, index)].reverse().find(item => item.role === 'user');
    if (!previousUser) { notify('找不到对应的用户消息'); return; }
    const baseConversation = conversation.slice(0, index);
    setConversation(baseConversation);
    persistSession(baseConversation, sessionTitle);
    await ask(previousUser.content, baseConversation);
  };

  const approveChange = async (change: Change) => {
    const effectiveOwner = sharedOwner;
    const effectiveRepo = sharedRepo;
    const effectiveBranch = sharedBranch;
    const effectiveToken = sharedToken;
    if (!effectiveToken) { setTab('settings'); notify('请先在 Studio Settings 填写 GitHub PAT'); return; }
    setSaving(true);
    updateCiStatus('committing', '正在把已批准的 Change 写入 GitHub…');
    try {
      const result = await applyAtomicChanges(effectiveOwner, effectiveRepo, effectiveBranch, effectiveToken, [{ path: change.path, content: change.content, operation: change.operation || 'update' }], 'Studio: apply Meme change ' + change.path);
      updateChanges(previous => previous.filter(item => item.path !== change.path));
      log('git', 'Applied ' + change.path + ' · ' + result.sha.slice(0,8));
      notify('已批准并写入：' + change.path);
      await list(path);
      await waitForCIAndRepair(result.sha);
    } catch (error) { notify(error instanceof Error ? error.message : '应用修改失败'); }
    finally { setSaving(false); }
  };

  const approveAllChanges = async () => {
    const effectiveOwner = sharedOwner;
    const effectiveRepo = sharedRepo;
    const effectiveBranch = sharedBranch;
    const effectiveToken = sharedToken;
    if (!effectiveToken || !changes.length) {
      setTab('settings');
      notify('请先在 Studio Settings 填写 GitHub PAT');
      return;
    }
    if (!window.confirm('确认把 ' + changes.length + ' 个文件作为一个原子 commit 写入 ' + effectiveBranch + '？')) return;
    setSaving(true);
    try {
      const result = await applyAtomicChanges(
        effectiveOwner,
        effectiveRepo,
        effectiveBranch,
        effectiveToken,
        changes.map(change => ({ path: change.path, content: change.content, operation: change.operation || 'update' })),
        'Studio: apply Meme task · ' + sessionTitle,
      );
      const artifact = {
        id:'crafted-'+Date.now(),
        name:sessionTitle,
        kind:'feature',
        summary:'Meme completed an approved multi-file change.',
        files:changes.map(change=>change.path),
        commitSha:result.sha,
        createdAt:Date.now(),
      };
      const next=[artifact,...crafted].slice(0,50);
      setCrafted(next);
      writeStore('studio:crafted',JSON.stringify(next));
      updateChanges(() => []);
      try { window.localStorage.removeItem('studio:changes:' + sessionId); } catch {}
      setCurrentTask(v => v ? {...v,status:'working',updatedAt:Date.now(),steps:v.steps.map(step => ({...step,status:'done'}))} : v);
      log('git','Atomic commit '+result.sha);
      notify('已一次性写入 '+artifact.files.length+' 个文件，正在等待 CI…');
      await waitForCIAndRepair(result.sha);
    } catch (error) {
      notify(error instanceof Error ? error.message : '批量提交失败');
    } finally {
      setSaving(false);
    }
  };

  const createStudioBranch = async () => {
    if (!ready) return;
    const name=window.prompt('新分支名称','meme/'+Date.now());
    if (!name) return;
    try { await createBranch(sharedOwner,sharedRepo,name,sharedBranch,sharedToken); notify('已创建分支：'+name); log('git','Created branch '+name); }
    catch(error){ notify(error instanceof Error ? error.message : '创建分支失败'); }
  };

  const openPullRequest = async () => {
    if (!ready || sharedBranch === 'main') { notify('PR 需要一个非 main 分支'); return; }
    try { const result=await createPullRequest(sharedOwner,sharedRepo,sharedBranch,'main','Studio · '+sessionTitle,'Created by Meme Studio.',sharedToken,true); setPrUrl(result.html_url || result.url || ''); notify('Draft PR 已创建'); }
    catch(error){ notify(error instanceof Error ? error.message : 'PR 创建失败'); }
  };

  const loadDiff = async () => {
    try {
      const data=await compare(sharedOwner,sharedRepo,'main',sharedBranch,sharedToken);
      const files=(data.files||[]).map((item:any)=>item.filename+' · '+item.status+' · +'+item.additions+' -'+item.deletions).join('\\n');
      setCiText(files || '没有差异'); setTab('changes');
    } catch(error){ notify(error instanceof Error ? error.message : 'Diff 获取失败'); }
  };

  const rollbackToCommit = async (sha: string) => {
    if (!ready || !sha) return;
    if (!window.confirm('确认把当前分支恢复到这个 commit？\\n' + sha.slice(0,8) + '\\n此操作会改变远端分支指向。')) return;
    try {
      await rollbackBranch(sharedOwner, sharedRepo, sharedBranch, sha, sharedToken);
      notify('已恢复到 ' + sha.slice(0,8));
      log('git', 'Rollback ' + branch + ' -> ' + sha.slice(0,8));
      setGitCommits([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : '恢复失败');
    }
  };

  const stageMemeProposal = (p: any) => {
    const validation = p.validation;
    updateChanges(previous => [
      ...previous.filter(change => change.path !== p.path),
      {
        path: p.path,
        content: p.content || '',
        reason: p.reason,
        risk: p.risk,
        operation: p.operation || 'update',
        originalContent: p.originalContent || '',
        validation,
      },
    ]);
    setTaskSteps(previous => previous.map((step, index) =>
      index === 2 ? '修复已通过 Meme 自检' : index === 3 ? '等待你的批准' : step
    ));
    setMessage('Meme 已完成修复前后验证：' + p.path + '\\n' + (validation?.summary || p.reason));
    log('change', p.operation + ' ' + p.path + ' · validation passed');
    updateCiStatus('changes', 'Meme 已生成并通过自检的 Changes，等待你的批准。');
    // Keep the conversation visible like the reference workbench: the user
    // should still see the original request while Changes are waiting below.
    // Changes remain a separate review surface opened explicitly by the user.
  };

  const readSavedCiStatus = (id: string) => {
    try {
      const raw = window.localStorage.getItem(STUDIO_CI_STATUS_STORE + id);
      return raw ? JSON.parse(raw) as { status: StudioCiStatus; message: string; sha: string } : null;
    } catch {
      return null;
    }
  };

  const updateCiStatus = (status: StudioCiStatus, message: string, sha = '') => {
    setCiStatus(status);
    setCiStatusMessage(message);
    if (sha) setCiStatusSha(sha);
    try {
      window.localStorage.setItem(STUDIO_CI_STATUS_STORE + sessionId, JSON.stringify({
        status,
        message,
        sha: sha || ciStatusSha,
      }));
    } catch {}
  };

  const buildCIRepairContext = async (ciError: string, failedSha: string) => {
    const effectiveOwner = sharedOwner;
    const effectiveRepo = sharedRepo;
    const effectiveBranch = sharedBranch;
    const effectiveToken = sharedToken;
    const base = 'https://api.github.com/repos/' + effectiveOwner + '/' + effectiveRepo;
    const errorText = String(ciError || '').slice(-16000);
    const changePaths = changes.map(change => change.path);
    const errorPaths = Array.from(errorText.matchAll(/(?:src|app|lib|components|pages|public|tests?|packages?)\/[A-Za-z0-9_./-]+/g))
      .map(match => match[0].replace(/[),:;]+$/, ''));
    const guessedPaths = Array.from(new Set([...changePaths, ...errorPaths])).filter(Boolean).slice(0, 10);

    let commitInfo: any = {};
    let recentCommits: any[] = [];
    let commitFiles: any[] = [];

    try {
      commitInfo = await github(base + '/commits/' + encodeURIComponent(failedSha), effectiveToken);
      commitFiles = (commitInfo.files || []).slice(0, 20).map((item: any) => ({
        path: item.filename,
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      }));
    } catch (error) {
      log('error', 'Could not load failed commit metadata');
    }

    try {
      const data = await github(base + '/commits?sha=' + encodeURIComponent(effectiveBranch) + '&per_page=6', effectiveToken);
      recentCommits = (data || []).slice(0, 6).map((item: any) => ({
        sha: item.sha,
        message: item.commit?.message?.split('\\n')[0],
        author: item.commit?.author?.name,
      }));
    } catch (error) {
      log('error', 'Could not load recent commits');
    }

    const relevantPaths = Array.from(new Set([
      ...guessedPaths,
      ...commitFiles.map(item => item.path),
    ])).slice(0, 8);

    const relevantFiles: Array<{ path: string; sha: string; content: string }> = [];
    for (const filePath of relevantPaths) {
      try {
        const data = await github(
          base + '/contents/' + filePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(failedSha),
          effectiveToken
        );
        if (!Array.isArray(data) && data.content) {
          relevantFiles.push({
            path: filePath,
            sha: data.sha,
            content: decodeBase64(data.content).slice(0, 24000),
          });
        }
      } catch {
        // A deleted/renamed file is still useful through commit metadata.
      }
    }

    return {
      failedCommit: {
        sha: failedSha,
        message: commitInfo.commit?.message || '',
        parentSha: commitInfo.parents?.[0]?.sha || '',
        files: commitFiles,
      },
      recentCommits,
      currentChanges: changes.map(change => ({
        path: change.path,
        operation: change.operation || 'update',
        reason: change.reason || '',
        risk: change.risk || 'medium',
        proposedContent: change.content?.slice(0, 24000) || '',
      })),
      relevantFiles,
      ciError: errorText,
    };
  };

  const runRepairAgent = async (ciError: string, failedSha: string, sourceLabel = 'CI') => {
    if (!aiReady || !ready) {
      setTab('settings');
      notify('CI 已失败，但 Meme 还没有准备好：请检查 AI / GitHub 设置');
      return;
    }

    const context = await buildCIRepairContext(ciError, failedSha);
    const errorText = context.ciError;
    const repairRequest =
      'CI 自动修复任务。' +
      '\\n来源：' + sourceLabel +
      '\\n失败 commit：' + failedSha +
      '\\n\\n你现在拿到的是一次真实的事故现场。必须综合下面全部证据判断根因：CI 错误、失败 commit、最近提交、当前未批准 Changes、以及失败 commit 对应的相关源码。' +
      '\\n不要只根据错误最后一行猜测，也不要重复上一轮已经存在的错误修改。先确认根因，再提出最小修复。' +
      '\\n\\n--- INCIDENT CONTEXT ---\\n' + JSON.stringify(context) +
      '\\n--- END INCIDENT CONTEXT ---' +
      '\\n\\n工作要求：' +
      '\\n1. 优先定位真正失败点，而不是机械修改报错文字。' +
      '\\n2. 检查相关文件之间的依赖、import、类型、配置和构建脚本。' +
      '\\n3. 如果当前 Changes 已经包含可能导致失败的修改，优先审查并修正它。' +
      '\\n4. 只提出能解释 CI 错误的最小必要改动。' +
      '\\n5. 如果证据不足，继续使用 inspect/read/search，不要猜。' +
      '\\n6. 所有实际文件修改必须进入 Studio Changes，等待用户批准；不要直接写 GitHub。';

    setPrompt('');
    updateCiStatus('repairing', 'CI 已失败，Meme 正在读取真实错误日志并准备修复 Changes。', failedSha);
    setMessage('Meme 正在分析 CI 错误…');
    setAgentRunning(true);
    setAiBusy(true);
    updateCiStatus('analyzing', 'Meme 正在检查仓库、定位问题并准备修改…');
    setAgentEvents([]);
    setTaskSteps(['读取 CI 错误', '定位失败原因', '检查相关文件', '准备修复 Changes']);
    const task: StudioTask = {
      id: 'task-ci-' + Date.now(),
      title: 'Repair CI · ' + failedSha.slice(0, 8),
      request: repairRequest,
      status: 'working',
      steps: [
        { id: 'ci', title: 'Read CI failure', status: 'done' },
        { id: 'inspect', title: 'Inspect root cause', status: 'working' },
        { id: 'repair', title: 'Prepare repair', status: 'todo' },
        { id: 'review', title: 'Review Changes', status: 'todo' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCurrentTask(task);
    setTasks(v => {
      const next = [task, ...v].slice(0, 30);
      studioStorage.saveTasks(next);
      return next;
    });
    log('agent', 'Started automatic CI repair for ' + failedSha.slice(0, 8));

    try {
      const project = sharedOwner + '/' + sharedRepo + '@' + sharedBranch;
      const result = await runMemeAgent({
        apiBaseUrl: aiSettings.apiBaseUrl,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        codingMode: memeMode,
        project,
        tools: [
          {
            name: 'inspect',
            description: 'Inspect a repository directory.',
            run: async ({ path: target = '' }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const data = await github(
                'https://api.github.com/repos/' + sharedOwner + '/' + sharedRepo + '/contents/' + clean + '?ref=' + encodeURIComponent(sharedBranch),
                sharedToken
              );
              return Array.isArray(data)
                ? data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha }))
                : { name: data.name, path: data.path, type: data.type, sha: data.sha };
            },
          },
          {
            name: 'read',
            description: 'Read a repository file.',
            run: async ({ path: target }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const data = await github(
                'https://api.github.com/repos/' + sharedOwner + '/' + sharedRepo + '/contents/' + clean + '?ref=' + encodeURIComponent(sharedBranch),
                sharedToken
              );
              if (Array.isArray(data)) return { error: 'Path is a directory', items: data.map((item: any) => item.path) };
              return { path: data.path, sha: data.sha, content: decodeBase64(data.content).slice(0, 60000) };
            },
          },
          {
            name: 'search',
            description: 'Search repository code for symbols, imports, error messages, or related implementation.',
            run: async ({ query }) => {
              const q = encodeURIComponent(String(query) + ' repo:' + sharedOwner + '/' + sharedRepo);
              const data = await github('https://api.github.com/search/code?q=' + q, sharedToken);
              return (data.items || []).slice(0, 20).map((item: any) => ({ path: item.path, name: item.name, sha: item.sha }));
            },
          },
        ],
        onEvent: event => {
          if (event.type === 'proposal') {
            stageMemeProposal(event.proposal);
          } else if (event.type === 'validation') {
            setAgentEvents(previous => [...previous.slice(-7), 'validation · ' + event.path + ' · ' + event.validation.status]);
            log('agent', 'Validation ' + event.validation.status + ' · ' + event.path);
          } else if (event.type === 'message' || event.type === 'done') {
            setMessage(event.text);
          } else if (event.type === 'tool') {
            setAgentEvents(previous => [...previous.slice(-7), event.name + ' · ' + JSON.stringify(event.input)]);
            log('tool', event.name);
          } else if (event.type === 'error') {
            log('error', event.text);
          }
        },
      }, repairRequest, JSON.stringify(context));

      if (result.text) setMessage(result.text);
      if (result.proposals.length === 0) {
        const failure = 'Meme 已读取 CI 失败信息，但没有生成任何修复 Changes，因此不能进入批准阶段。';
        setMessage(failure);
        updateCiStatus('failed', failure, failedSha);
        setCurrentTask(v => v ? {
          ...v,
          status: 'failed',
          updatedAt: Date.now(),
          steps: v.steps.map(step => ({ ...step, status: 'blocked' } as any)),
        } : v);
        log('error', 'CI repair produced no Changes; approval blocked');
      } else {
        setCurrentTask(v => v ? {
          ...v,
          status: 'review',
          updatedAt: Date.now(),
          steps: v.steps.map((step, i) => ({ ...step, status: i < 2 ? 'done' : i === 2 ? 'working' : 'todo' } as any)),
        } : v);
        log('agent', 'CI repair analysis finished; Changes awaiting approval');
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Meme CI 修复失败';
      setMessage(text);
      log('error', text);
      setCurrentTask(v => v ? { ...v, status: 'failed', updatedAt: Date.now() } : v);
    } finally {
      setAiBusy(false);
      setAgentRunning(false);
    }
  };

  const checkCI = async (sha: string, autoRepair = false) => {
    try {
      const effectiveToken = token.trim();
      if (!effectiveToken) throw new Error('请先在 Studio Settings 填写 GitHub PAT');
      const runs = await getWorkflowRunsForCommit(owner.trim(), repo.trim(), sha, effectiveToken);
      const workflowRuns = Array.isArray(runs.workflow_runs) ? runs.workflow_runs : [];
      const run =
        workflowRuns.find((item: any) => item.name === 'TypeScript check') ||
        workflowRuns.find((item: any) => String(item.path || '').endsWith('/typecheck.yml')) ||
        workflowRuns.find((item: any) => /typescript|typecheck|lint/i.test(String(item.name || '')));
      if (!run) {
        setCiText('暂时没有找到 TypeScript CI run');
        return;
      }

      if (run.conclusion === 'failure') {
        const jobs = await getWorkflowJobs(owner.trim(), repo.trim(), run.id, effectiveToken);
        const failed = jobs.jobs?.find((job: any) =>
          job.conclusion === 'failure' || job.status === 'failure'
        );
        const text = failed ? await getJobLog(owner.trim(), repo.trim(), failed.id, effectiveToken) : 'CI failed';
        const errorText = String(text).slice(-16000);
        setCiText(errorText);
        updateCiStatus('failed', 'TypeScript CI 失败，Meme 将读取错误现场准备修复。', sha);
        log('error', 'CI failure returned to Studio · ' + sha.slice(0, 8));

        if (autoRepair) {
          await runRepairAgent(errorText, sha, 'GitHub Actions');
        }
      } else {
        setCiText('CI · ' + run.status + ' · ' + (run.conclusion || 'running'));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'CI 检查失败');
    }
  };

  const waitForCIAndRepair = async (sha: string) => {
    setCiText('TypeScript CI 正在运行…');
    updateCiStatus('running', '已提交，正在等待 TypeScript CI。', sha);
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const effectiveToken = token.trim();
        if (!effectiveToken) throw new Error('请先在 Studio Settings 填写 GitHub PAT');
        const runs = await getWorkflowRunsForCommit(owner.trim(), repo.trim(), sha, effectiveToken);
        const workflowRuns = Array.isArray(runs.workflow_runs) ? runs.workflow_runs : [];
        const run =
          workflowRuns.find((item: any) => item.name === 'TypeScript check') ||
          workflowRuns.find((item: any) => String(item.path || '').endsWith('/typecheck.yml')) ||
          workflowRuns.find((item: any) => /typescript|typecheck|lint/i.test(String(item.name || '')));
        if (run && run.status === 'completed') {
          if (run.conclusion === 'success') {
            setCiText('CI · success · ' + sha.slice(0, 8));
            updateCiStatus('success', 'TypeScript CI 已通过，修改完成。', sha);
            log('git', 'CI passed · ' + sha.slice(0, 8));
            setCurrentTask(v => v ? { ...v, status: 'done', updatedAt: Date.now(), steps: v.steps.map(step => ({ ...step, status: 'done' })) } : v);
            notify('CI 通过 ✓');
            return;
          }
          await checkCI(sha, true);
          return;
        }
      } catch (error) {
        log('error', 'CI poll failed: ' + (error instanceof Error ? error.message : 'unknown'));
      }
      await new Promise(resolve => window.setTimeout(resolve, 5000));
    }
    setCiText('CI 仍在运行。可以稍后在 Git 页面再次检查。');
    updateCiStatus('timeout', 'CI 等待超时，可稍后在 Git 页面重新检查。', sha);
    log('system', 'CI polling timed out · ' + sha.slice(0, 8));
  };


  const createFile = async () => {
    const target = newPath.trim().replace(/^\/+|\/+$/g, '');
    if (!target || !ready) return;
    setSaving(true);
    try {
      const url = 'https://api.github.com/repos/' + owner.trim() + '/' + repo.trim() + '/contents/' + target.split('/').map(encodeURIComponent).join('/');
      await github(url, sharedToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Studio: create ' + target, content: encodeBase64(newContent), branch: sharedBranch }),
      });
      setNewPath('');
      setNewContent('');
      await list(path);
      notify('文件已创建');
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (targetPath: string) => {
    if (!ready || !targetPath.trim()) return;
    setSaving(true);
    try {
      const target = targetPath.trim().replace(/^\/+|\/+$/g, '');
      const url = 'https://api.github.com/repos/' + sharedOwner + '/' + sharedRepo + '/contents/' + target.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(sharedBranch);
      const data = await github(url, sharedToken);
      if (Array.isArray(data)) throw new Error('这是目录，请使用递归删除');
      await github(url.split('?')[0], sharedToken, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Studio: delete ' + target, sha: data.sha, branch: sharedBranch }),
      });
      await list(path);
      notify('文件已删除');
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteTree = async (root: string): Promise<void> => {
    const target = root.trim().replace(/^\/+|\/+$/g, '');
    if (!target || !ready) return;
    const url = 'https://api.github.com/repos/' + sharedOwner + '/' + sharedRepo + '/contents/' + target.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(sharedBranch);
    const data = await github(url, sharedToken);
    if (!Array.isArray(data)) {
      await github(url.split('?')[0], sharedToken, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Studio: delete ' + target, sha: data.sha, branch: sharedBranch }),
      });
      return;
    }
    for (const item of data) {
      await deleteTree(item.path);
    }
  };

  const removeTree = async () => {
    if (!deletePath.trim() || !ready) return;
    if (!window.confirm('确定递归删除这个 App / 目录吗？GitHub 上的文件会被删除。')) return;
    setSaving(true);
    try {
      await deleteTree(deletePath);
      await list(path);
      setDeletePath('');
      notify('目录已删除');
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除目录失败');
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (value: Tab, label: string, Icon: any) => (
    <button
      onClick={() => setTab(value)}
      className={tab === value ? 'py-2 rounded-xl bg-[#292724] text-white text-[8px]' : 'py-2 text-[#777069] text-[8px]'}
    >
      <Icon className="w-3.5 h-3.5 mx-auto" />
      {label}
    </button>
  );

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <header className="pt-10 px-3 pb-2 bg-[#f7f4ee]/92">
        <div className="flex items-center gap-2">
          <button onClick={() => tab === 'chat' ? onNavigate('home') : setTab('chat')} className="w-9 h-9 rounded-full bg-white/80 border border-black/5 grid place-items-center shadow-sm"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[7px] font-mono tracking-[2px] text-[#8b8782]">MEME · DEVELOPMENT STUDIO</div>
            <div className="flex items-center justify-center gap-1.5"><b className="text-[19px] font-serif">Studio</b><span className="text-[6px] px-1.5 py-0.5 rounded-full bg-[#292724] text-white">{ready ? 'GITHUB READY' : 'LOCAL MODE'}</span></div>
            <div className="text-[7px] text-[#9b958d] truncate">{owner} / {repo} · {branch}</div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setHistoryOpen(true)} className="w-9 h-9 rounded-full bg-white/80 border border-black/5 grid place-items-center shadow-sm" aria-label="History"><Clock3 className="w-4 h-4" /></button>
            <button onClick={() => setWorkspaceOpen(true)} className="w-9 h-9 rounded-full bg-white/80 border border-black/5 grid place-items-center shadow-sm" aria-label="Workspace"><Settings2 className="w-4 h-4" /></button>
          </div>
        </div>
      </header>
      <main className="h-[calc(100%-100px)] overflow-y-auto no-scrollbar pb-20">
        {tab === 'chat' && (
          <section className="px-4 pb-28">
            {agentEvents.length > 0 && (
              <div className="mb-3 p-3 rounded-2xl bg-white/65 border border-black/5">
                <div className="flex items-center justify-between">
                  <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">MEME · ACTIVITY</div>
                  <span className="text-[7px] text-[#999]">{agentRunning ? 'LIVE' : 'LAST RUN'}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {agentEvents.slice(-8).map((event, index) => (
                    <div key={index} className="text-[8px] leading-4 text-[#6f6962] truncate">› {event}</div>
                  ))}
                </div>
              </div>
            )}
            {ciStatus !== 'idle' && (
              <div className="mb-3 p-3 rounded-2xl bg-white/75 border border-black/5 shadow-sm">
                <div className="flex items-center gap-2">
                  {ciStatus === 'success'
                    ? <Check className="w-4 h-4" />
                    : ciStatus === 'failed'
                      ? <ShieldAlert className="w-4 h-4" />
                      : ciStatus === 'running' || ciStatus === 'repairing' || ciStatus === 'committing' || ciStatus === 'analyzing'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Clock3 className="w-4 h-4" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">
                      {ciStatus === 'analyzing' ? 'MEME · ANALYZING'
                        : ciStatus === 'changes' ? 'MEME · CHANGES READY'
                        : ciStatus === 'committing' ? 'GIT · COMMITTING'
                        : ciStatus === 'running' ? 'CI · RUNNING'
                        : ciStatus === 'failed' ? 'CI · FAILED'
                        : ciStatus === 'repairing' ? 'MEME · REPAIRING'
                        : ciStatus === 'success' ? 'CI · PASSED'
                        : 'CI · WAITING'}
                    </div>
                    <div className="mt-1 text-[9px] leading-4">{ciStatusMessage}</div>
                    {ciStatusSha && <div className="mt-1 text-[7px] font-mono text-[#999]">commit {ciStatusSha.slice(0, 8)}</div>}
                  </div>
                  {(ciStatus === 'changes' || ciStatus === 'failed') && (
                    <button onClick={() => setTab('changes')} className="px-2.5 py-2 rounded-xl bg-[#292724] text-white text-[8px]">查看 Changes</button>
                  )}
                </div>
              </div>
            )}
            {changes.length > 0 && (
              <div className="mb-3 p-3 rounded-2xl bg-[#ebe6de] border border-black/5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">MEME · CHANGES READY</div>
                  <span className="text-[7px] text-[#777069]">{changes.length} file{changes.length > 1 ? 's' : ''}</span>
                </div>
                <div className="mt-2 text-[8px] font-medium">本次任务</div>
                <div className="mt-1 text-[9px] leading-4 text-[#5f5a54] whitespace-pre-wrap">{activeTaskRequest}</div>
                <div className="mt-2 space-y-1">
                  {changes.slice(0, 4).map(change => (
                    <div key={change.path} className="flex items-center gap-2 text-[8px]">
                      <span className="text-[#8b8782]">›</span>
                      <span className="font-mono truncate flex-1">{change.path}</span>
                      <span className="text-[#777069]">{change.operation || 'update'}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setTab('changes')} className="mt-3 w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">
                  查看 / 审批 Changes
                </button>
              </div>
            )}
            <div className="w-full pt-2 pb-4">
              {!conversation.length ? (
                <div className="flex flex-col items-center justify-start text-center pt-8 pb-5">
                  <div className="w-12 h-12 rounded-[16px] bg-[#292724] text-white grid place-items-center shadow-sm mb-4"><Sparkles className="w-5 h-5" /></div>
                  <div className="text-[21px] font-serif">有什么问题？</div>
                  <p className="mt-3 max-w-[290px] text-[10px] leading-6 text-[#777069]">我是 Meme，你的小手机开发助手。检查代码、找 Bug、设计 UI、读取仓库、准备 Changes，我都会先看清楚再动手。</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-[310px]">
                    {[
                      ['检查代码', '检查当前项目的问题并给最小修复方案'],
                      ['优化 UI', '把当前页面做得更高级、更干净，不删除已有功能'],
                      ['找 Bug', '帮我找可能的构建错误'],
                      ['看看仓库', '先读取项目结构，告诉我现在的 Studio 是怎么工作的'],
                    ].map(([label, value]) => <button key={label} onClick={() => setPrompt(value)} className="px-3.5 py-2 rounded-full bg-white/85 border border-black/5 shadow-sm text-[8px] text-[#625d57]">{label}</button>)}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 py-3">
                  {conversation.map((item, index) => <div key={index} className={item.role === 'user' ? 'ml-8 group' : 'mr-5 group'}>
                    <div className={item.role === 'user' ? 'p-3.5 rounded-2xl rounded-br-md bg-[#292724] text-white text-[10px] leading-5 whitespace-pre-wrap' : 'p-3.5 rounded-2xl rounded-bl-md bg-white/80 border border-black/5 text-[10px] leading-5 whitespace-pre-wrap'}>
                      <div className="mb-1 text-[6px] font-mono tracking-[1.5px] opacity-45">{item.role === 'user' ? 'YOU' : 'MEME'}</div>{item.content}
                    </div>
                    <div className="flex justify-end gap-1 mt-1 opacity-70">
                      <button onClick={() => void copyMessage(item.content)} className="w-7 h-7 rounded-full bg-white/70 border border-black/5 grid place-items-center" aria-label="复制"><Copy className="w-3 h-3" /></button>
                      {item.role === 'assistant' && <button onClick={() => void rerollMessage(index)} disabled={aiBusy} className="w-7 h-7 rounded-full bg-white/70 border border-black/5 grid place-items-center disabled:opacity-30" aria-label="重新生成"><RotateCcw className="w-3 h-3" /></button>}
                      <button onClick={() => deleteMessage(index)} className="w-7 h-7 rounded-full bg-white/70 border border-black/5 grid place-items-center" aria-label="删除"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>)}
                  {aiBusy && <div className="mr-5 p-3.5 rounded-2xl rounded-bl-md bg-[#292724] text-white text-[9px]"><Loader2 className="w-3 h-3 inline mr-1 animate-spin" /> Meme 正在理解项目…</div>}
                </div>
              )}
            </div>
            {!ready && <div className="mx-1 mb-2 px-3 py-2 rounded-xl bg-[#fff4f1] text-[8px] leading-relaxed text-[#8f6f68]"><b>GitHub 尚未验证</b><div className="mt-0.5">Studio：{sharedOwner || '未填写 Owner'}/{sharedRepo || '未填写 Repository'} · {sharedBranch || 'main'}</div><div className="mt-0.5">{githubError ? '原因：' + githubError : '请在 Settings 填写 Studio PAT 并测试 GitHub。'}</div></div>}
          </section>
        )}
        {tab === 'git' && (
          <section className="p-3.5 space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de]"><div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">GIT WORKSPACE</div><b className="text-[17px]">History & Recovery</b><div className="mt-1 text-[9px] text-[#777069]">{owner}/{repo} · {branch}</div></div>
            <button onClick={async () => { try { const data=await github('https://api.github.com/repos/'+sharedOwner+'/'+sharedRepo+'/commits?sha='+encodeURIComponent(sharedBranch)+'&per_page=20',sharedToken); setGitCommits(data || []); log('git','Loaded commit history'); } catch(e){ notify(e instanceof Error ? e.message : 'Git 历史读取失败'); } }} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">刷新提交历史</button>
            {gitCommits.map((c:any)=><div key={c.sha} className="p-3 rounded-2xl bg-white/65"><div className="text-[9px]">{c.commit?.message?.split('\n')[0]}</div><div className="mt-1 text-[7px] font-mono text-[#888]">{c.sha?.slice(0,8)}</div></div>)}
            {!gitCommits.length && <div className="py-10 text-center text-[9px] text-[#888]">刷新后查看最近提交。</div>}
            <div className="p-3 rounded-2xl bg-[#fff4f1] text-[8px] text-[#8f6f68]">回滚入口会要求二次确认；不会让 Meme 悄悄改写历史。</div>
          </section>
        )}

        {tab === 'files' && (
          <section className="p-3.5 space-y-2.5">
            <div className="flex gap-1.5">
              <button onClick={() => void list(path)} className="flex-1 py-2 rounded-xl bg-[#292724] text-white text-[9px]">刷新</button>
              <button onClick={() => void list('')} className="py-2 px-3 rounded-xl bg-white text-[9px]">根目录</button>
            </div>
            {file && (
              <div className="rounded-2xl bg-[#252422] text-white overflow-hidden">
                <div className="p-2.5 flex items-center gap-2 text-[9px] border-b border-white/10">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span className="flex-1 truncate">{file.path}</span>
                  <button onClick={() => setFile(null)}><X className="w-3 h-3" /></button>
                </div>
                <textarea value={code} onChange={event => setCode(event.target.value)} spellCheck={false} className="w-full h-[310px] bg-transparent p-3 text-[8px] leading-[1.55] font-mono outline-none resize-none" />
                <div className="p-2 border-t border-white/10">
                  <button disabled={!dirty || saving} onClick={() => void saveFile()} className="w-full py-2 rounded-lg bg-white text-[#292724] text-[9px] disabled:opacity-30">
                    <Save className="w-3 h-3 inline mr-1" />{saving ? '保存中…' : '保存到 GitHub'}
                  </button>
                </div>
              </div>
            )}
            <div className="p-2.5 rounded-2xl bg-white/60 text-[9px] text-[#777069]">当前：{path || '/'}</div>
            <div className="rounded-2xl bg-white/60 overflow-hidden">
              {busy ? <div className="p-6 text-center"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div> : items.map(item => (
                <button key={item.path} onClick={() => void open(item)} className="w-full p-2.5 flex gap-2 items-center border-b border-black/5 text-left">
                  {item.type === 'dir' ? <Folder className="w-3.5 h-3.5 text-[#9b8068]" /> : <FileCode2 className="w-3.5 h-3.5" />}
                  <span className="flex-1 text-[9px] truncate">{item.name}</span>
                  <ChevronRight className="w-3 h-3 text-[#aaa]" />
                </button>
              ))}
              {!busy && !items.length && <div className="p-8 text-center text-[9px] text-[#888]">点击“刷新”读取 GitHub。</div>}
            </div>
          </section>
        )}

        {tab === 'changes' && (
          <section className="p-3.5 space-y-3">
            {ciStatus !== 'idle' && (
              <div className="p-3 rounded-2xl bg-[#ebe6de] border border-black/5">
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">WORKFLOW STATUS</div>
                <div className="mt-1 text-[10px]">{ciStatusMessage}</div>
                {ciStatusSha && <div className="mt-1 text-[7px] font-mono text-[#999]">commit {ciStatusSha.slice(0, 8)}</div>}
                {ciText && (ciStatus === 'failed' || ciStatus === 'timeout') && (
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[7px] text-[#777069]">{ciText.slice(-6000)}</pre>
                )}
              </div>
            )}
            <div className="p-3 rounded-2xl bg-[#ebe6de] text-[9px]">
              <b>Changes</b>
              <div className="mt-1 text-[#777069]">AI 的修改先预览；可以逐文件批准，也可以作为一个原子 commit 一次写入。</div>
              <div className="mt-3 p-3 rounded-xl bg-white/75 border border-black/5">
                <div className="text-[7px] font-mono tracking-[1.5px] text-[#8b8782]">本次任务</div>
                <div className="mt-1 text-[9px] leading-4 whitespace-pre-wrap">{activeTaskRequest}</div>
                <div className="mt-1 text-[7px] text-[#999]">你的原始请求会一直保留在 Changes 页面。先确认这条修改是否真的在解决你的任务，再决定是否提交。</div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2"><button onClick={() => void loadDiff()} className="py-2 rounded-xl bg-white text-[8px]">Diff</button><button disabled={!changes.length||saving} onClick={() => void approveAllChanges()} className="py-2 rounded-xl bg-[#292724] text-white text-[8px] disabled:opacity-40">Atomic Commit</button></div>
            </div>
            {ciText && <pre className="p-3 rounded-2xl bg-[#252422] text-[#ddd] text-[7px] whitespace-pre-wrap max-h-40 overflow-auto">{ciText}</pre>}
            {changes.map(change => <div key={change.path} className="p-3 rounded-2xl bg-white/65 border border-black/5"><div className="flex gap-2"><div className="text-[9px] font-mono flex-1 truncate">{change.path}</div><span className="text-[7px]">{change.operation||'update'}</span></div>{change.validation && <div className="mt-2 p-2 rounded-xl bg-[#eef5ef] text-[7px]"><b>✓ Meme self-check passed</b><div className="mt-1">{change.validation.summary}</div><div className="mt-1 text-[#777]">Diff: +{change.validation.changedLines} / -{change.validation.removedLines} · risk {change.risk || 'medium'}</div>{change.validation.concerns.length > 0 && <div className="mt-1 text-[#8f6f68]">注意：{change.validation.concerns.join(' · ')}</div>}</div>}{change.reason&&<div className="mt-2 p-2.5 rounded-xl bg-[#f6f2ec] text-[8px] leading-4">
                <div><b>为什么改</b></div>
                <div className="mt-0.5 text-[#777069]">{change.reason}</div>
                <div className="mt-2"><b>提交判断</b></div>
                <div className="mt-0.5 text-[#777069]">Meme 自检：{change.validation?.status === 'passed' ? '通过' : '未通过'} · GitHub CI：批准并提交后才会运行。不要把“自检通过”当成“CI 已证明”。</div>
              </div>}<pre className="mt-2 max-h-24 overflow-hidden rounded-xl bg-[#252422] text-[#ddd] p-2 text-[7px] whitespace-pre-wrap">+ {change.content.slice(0,1000)}</pre><div className="grid grid-cols-2 gap-1.5 mt-2"><button onClick={() => {setFile({name:change.path.split('/').pop()||change.path,path:change.path,type:'file'});setCode(change.content);setOriginal(change.originalContent||'');setTab('files')}} className="py-2 rounded-lg bg-white text-[9px]">查看 / 编辑</button><button disabled={saving} onClick={() => void approveChange(change)} className="py-2 rounded-lg bg-[#292724] text-white text-[9px] disabled:opacity-40">批准</button></div></div>)}
            {!changes.length&&<div className="py-12 text-center text-[9px] text-[#888]">暂无 AI 修改草案。</div>}
          </section>
        )}


        {tab === 'crafted' && (
          <section className="p-3.5 space-y-3"><div className="p-4 rounded-2xl bg-[#ebe6de]"><div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">CRAFTED BY MEME</div><b className="text-[18px]">作品档案</b><div className="mt-1 text-[9px] text-[#777069]">只有真正批准并写入 Git 的工作才会进入这里。</div></div>
          {crafted.map(item=><div key={item.id} className="p-3 rounded-2xl bg-white/65 border border-black/5"><div className="text-[10px] font-semibold">{item.name}</div><div className="mt-1 text-[8px] text-[#777069]">{item.summary}</div><div className="mt-2 text-[7px] font-mono text-[#999]">{item.files.length} files · {item.commitSha?.slice(0,8)}</div></div>)}
          {!crafted.length&&<div className="py-14 text-center text-[9px] text-[#888]">Nothing here yet.<br/>等 Meme 完成第一个真正作品。</div>}</section>
        )}

        {tab === 'admin' && (
          <section className="p-3.5 space-y-2.5">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /><b>Studio Admin</b></div>
              <div className="mt-1 text-[9px] text-[#777069]">完整项目维护权限：创建、修改、删除文件，也可以递归删除 App / 目录。</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">CREATE FILE</div>
              <input value={newPath} onChange={event => setNewPath(event.target.value)} placeholder="例如 src/components/screens/MyApp.tsx" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <textarea value={newContent} onChange={event => setNewContent(event.target.value)} placeholder="文件内容" className="w-full h-28 p-2.5 rounded-xl text-[8px] font-mono outline-none resize-none" />
              <button disabled={saving} onClick={() => void createFile()} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-40"><Plus className="w-3 h-3 inline mr-1" />{saving ? '处理中…' : '创建文件'}</button>
            </div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">DELETE</div>
              <input value={deletePath} onChange={event => setDeletePath(event.target.value)} placeholder="输入文件或 App / 目录路径" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <div className="grid grid-cols-2 gap-1.5">
                <button disabled={saving} onClick={() => void deleteFile(deletePath)} className="py-2.5 rounded-xl bg-[#8d4e4e] text-white text-[9px] disabled:opacity-40"><Trash2 className="w-3 h-3 inline mr-1" />删除文件</button>
                <button disabled={saving} onClick={() => void removeTree()} className="py-2.5 rounded-xl bg-[#9b625b] text-white text-[9px] disabled:opacity-40"><Trash2 className="w-3 h-3 inline mr-1" />删除 App / 目录</button>
              </div>
              <div className="text-[8px] leading-relaxed text-[#8f6f68]">递归删除属于最高权限操作，会逐个删除 GitHub 中的文件，并需要你确认。</div>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="p-3.5 space-y-2.5">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] text-[9px] flex items-center gap-2">
              <button onClick={() => setTab('chat')} className="w-8 h-8 rounded-full bg-white/75 border border-black/5 grid place-items-center shrink-0" aria-label="返回 Studio">
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <div>
                <b>Studio Settings</b>
                <div className="mt-1 text-[#777069]">这里是 Studio 自己的配置中心。离开设置只回 Studio，不会跳回手机首页。</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">AI · MEME PROVIDER</div>
                  <div className="text-[8px] text-[#999] mt-1">Studio API 与 LINE API 分开管理。</div>
                </div>
                <span className="text-[8px] text-[#8b7560]">{studioApiProfiles.length} 套</span>
              </div>
              <div className="flex gap-1.5">
                <input value={studioApiProfileName} onChange={event => setStudioApiProfileName(event.target.value)} placeholder="API 方案名称" className="flex-1 p-2.5 rounded-xl bg-white text-[9px] outline-none" />
                <button onClick={saveStudioApiProfile} className="px-3 rounded-xl bg-[#292724] text-white text-[8px]">保存方案</button>
              </div>
              {studioApiProfiles.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {studioApiProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center gap-1.5 rounded-xl bg-white/75 p-2">
                      <button onClick={() => applyStudioApiProfile(profile)} className="flex-1 min-w-0 text-left">
                        <div className="text-[9px] font-semibold truncate">{profile.name}</div>
                        <div className="text-[7px] text-[#999] truncate">{profile.settings.provider} · {profile.settings.model || '未选模型'} · {profile.settings.apiBaseUrl || 'Gemini default'}</div>
                      </button>
                      <button onClick={() => deleteStudioApiProfile(profile.id)} className="px-1.5 text-[8px] text-[#b47783]">删除</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="text-[9px] block">Provider
                <select value={aiSettings.provider} onChange={event => updateAi('provider', event.target.value as AppSettings['provider'])} className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none">
                  <option value="gemini">Gemini</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="text-[9px] block">API Base URL
                <input value={aiSettings.apiBaseUrl} onChange={event => updateAi('apiBaseUrl', event.target.value)} placeholder={aiSettings.provider === 'gemini' ? '留空 = Google Gemini 官方 v1beta' : 'https://api.openai.com/v1'} className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" />
              </label>
              <label className="text-[9px] block">API Key
                <input type="password" value={aiSettings.apiKey} onChange={event => updateAi('apiKey', event.target.value)} placeholder="sk-..." className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" />
              </label>
              <div className="flex gap-1.5">
                <select value={aiSettings.model} onChange={event => updateAi('model', event.target.value)} className="flex-1 p-2.5 rounded-xl bg-white/80 text-[9px] outline-none">
                  <option value="">选择模型</option>
                  {availableModels.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <button onClick={() => void loadModels()} disabled={loadingModels} className="px-3 rounded-xl bg-white border border-black/5 text-[8px]">{loadingModels ? '拉取中…' : '拉取模型'}</button>
              </div>
              <button onClick={() => void testAi()} disabled={testingAi || !aiReady} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-40">{testingAi ? '测试中…' : '测试 AI 连接'}</button>
            </div>

            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">GITHUB · REPOSITORY</div>
                  <div className="text-[8px] text-[#999] mt-1">多个仓库可以保存成方案，应用后手动连接。</div>
                </div>
                <span className="text-[8px] text-[#8b7560]">{studioGithubProfiles.length} 套</span>
              </div>
              <div className="flex gap-1.5">
                <input value={studioGithubProfileName} onChange={event => setStudioGithubProfileName(event.target.value)} placeholder="仓库方案名称" className="flex-1 p-2.5 rounded-xl bg-white text-[9px] outline-none" />
                <button onClick={saveStudioGithubProfile} className="px-3 rounded-xl bg-[#292724] text-white text-[8px]">保存方案</button>
              </div>
              {studioGithubProfiles.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {studioGithubProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center gap-1.5 rounded-xl bg-white/75 p-2">
                      <button onClick={() => applyStudioGithubProfile(profile)} className="flex-1 min-w-0 text-left">
                        <div className="text-[9px] font-semibold truncate">{profile.name}</div>
                        <div className="text-[7px] text-[#999] truncate">{profile.owner}/{profile.repo} · {profile.branch || 'main'}</div>
                      </button>
                      <button onClick={() => deleteStudioGithubProfile(profile.id)} className="px-1.5 text-[8px] text-[#b47783]">删除</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <input value={owner} onChange={event => { setOwner(event.target.value); setGithubVerified(false); setGithubError(''); window.localStorage.removeItem(STUDIO_GITHUB_ACTIVE_STORE); }} placeholder="Owner" className="p-2.5 rounded-xl text-[9px] outline-none" />
                <input value={repo} onChange={event => { setRepo(event.target.value); setGithubVerified(false); setGithubError(''); window.localStorage.removeItem(STUDIO_GITHUB_ACTIVE_STORE); }} placeholder="Repository" className="p-2.5 rounded-xl text-[9px] outline-none" />
              </div>
              <input type="password" value={token} onChange={event => { setToken(event.target.value); setGithubVerified(false); setGithubError(''); window.localStorage.removeItem(STUDIO_GITHUB_ACTIVE_STORE); }} placeholder="GitHub PAT" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <div className="grid grid-cols-2 gap-1.5">
                <select value={branch || 'main'} onChange={event => { setBranch(event.target.value); setGithubVerified(false); setGithubError(''); window.localStorage.removeItem(STUDIO_GITHUB_ACTIVE_STORE); }} disabled={!githubBranches.length} className="w-full p-2.5 rounded-xl text-[9px] outline-none bg-white/80 disabled:opacity-50">
                  {githubBranches.length ? githubBranches.map(name => <option key={name} value={name}>{name === 'main' ? 'main · 提交目标' : name}</option>) : <option value={branch || 'main'}>{branch || 'main'} · 连接后读取</option>}
                </select>
                <button onClick={() => {
                  const ownerText = owner.trim(); const repoText = repo.trim();
                  if (!ownerText || !repoText) return notify('请先填写 Owner 和 Repository');
                  window.open('https://github.com/' + encodeURIComponent(ownerText) + '/' + encodeURIComponent(repoText), '_blank', 'noopener,noreferrer');
                }} className="py-2.5 rounded-xl bg-white border border-black/5 text-[9px]"><Github className="w-3 h-3 inline mr-1" />网页测试</button>
              </div>
              <button onClick={async () => {
                const ownerText = owner.trim(); const repoText = repo.trim(); const studioPat = token.trim();
                if (!ownerText || !repoText || !studioPat) { setGithubVerified(false); setGithubError('请填写 Owner、Repository 和 GitHub PAT'); notify('请填写 Owner、Repository 和 GitHub PAT'); return; }
                setGithubVerified(false); setGithubError('正在连接 GitHub 仓库…');
                try {
                  const base = 'https://api.github.com/repos/' + encodeURIComponent(ownerText) + '/' + encodeURIComponent(repoText);
                  const repository = await github(base, studioPat);
                  if (repository?.permissions && repository.permissions.push === false) throw new Error('PAT 可以读取仓库，但没有写权限');
                  const branches = await github(base + '/branches?per_page=100', studioPat);
                  const names = Array.isArray(branches) ? branches.map((item: any) => String(item?.name || '')).filter(Boolean) : [];
                  setGithubBranches(names);
                  const chosenBranch = names.includes(branch.trim()) ? branch.trim() : names.includes('main') ? 'main' : String(repository?.default_branch || names[0] || 'main');
                  const rootData = await github(base + '/contents/?ref=' + encodeURIComponent(chosenBranch), studioPat);
                  const rootItems = Array.isArray(rootData) ? rootData : [rootData];
                  setItems(rootItems.map((item: any) => ({ name: item.name, path: item.path, type: item.type === 'dir' ? 'dir' : 'file', sha: item.sha })));
                  setPath('');
                  setOwner(ownerText); setRepo(repoText); setBranch(chosenBranch); setToken(studioPat);
                  writeStore(STORE.owner, ownerText); writeStore(STORE.repo, repoText); writeStore(STORE.branch, chosenBranch); writeStore(STORE.token, studioPat);
                  setGithubVerified(true);
                  window.localStorage.setItem(STUDIO_GITHUB_ACTIVE_STORE, ownerText + '/' + repoText + '@' + chosenBranch);
                  setGithubError('');
                  notify('GitHub 已连接：' + ownerText + '/' + repoText + ' · ' + chosenBranch);
                } catch (error) {
                  setGithubVerified(false);
                  const detail = error instanceof Error ? error.message : 'GitHub 仓库连接失败';
                  setGithubError(detail);
                  notify(detail);
                }
              }} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]"><Github className="w-3 h-3 inline mr-1" />连接 GitHub</button>
              {githubError && <div className="text-[8px] leading-relaxed text-[#8f6f68]">原因：{githubError}</div>}
              {ready && <div className="text-[8px] leading-relaxed text-[#66705f]">GITHUB READY · 提交到 {owner}/{repo} · {branch || 'main'}</div>}
            </div>

            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">MEME · CODING MODE</div>
              <select value={memeMode} onChange={event => { const value = event.target.value as MemeCodingMode; setMemeMode(value); writeStore(MEME_MODE_STORE, value); }} className="w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none">
                <option value="always-ask">Always ask · 每次修改都确认</option>
                <option value="confirm-before-commit">Confirm before commit · 修改可准备，提交前确认</option>
                <option value="auto">Auto · 允许 Agent 自动执行</option>
              </select>
              <div className="text-[8px] leading-relaxed text-[#777069]">推荐 Always ask。Meme 会先检查项目、生成 Changes，再由你决定是否落库。</div>
            </div>

            <button onClick={saveSettings} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]"><Check className="w-3 h-3 inline mr-1" />保存当前 Studio 设置</button>
          </section>
        )}

      </main>

      {historyOpen && (
        <div className="absolute inset-0 z-[70]"><button onClick={() => setHistoryOpen(false)} className="absolute inset-0 bg-black/15" aria-label="Close history" />
          <aside className="absolute top-0 bottom-0 left-0 w-[82%] max-w-[310px] bg-[#f7f4ee] shadow-2xl border-r border-black/10 flex flex-col">
            <div className="pt-11 px-4 pb-4 border-b border-black/10"><div className="flex items-center justify-between"><div><div className="text-[7px] font-mono tracking-[2px] text-[#8b8782]">STUDIO SESSIONS</div><div className="mt-1 text-[22px] font-serif">History</div></div><button onClick={() => setHistoryOpen(false)} className="w-8 h-8 rounded-full bg-white grid place-items-center"><X className="w-4 h-4" /></button></div>
              <button onClick={startNewSession} className="mt-4 w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]"><Plus className="w-3.5 h-3.5 inline mr-1" /> New session</button></div>
            <div className="flex-1 overflow-auto p-3 space-y-1.5">{sessions.map(session => <button key={session.id} onClick={() => { const restored=session.messages.map(message=>({role:message.role==='meme'?'assistant' as const:'user' as const,content:message.text})); setSessionId(session.id);setSessionTitle(session.title);setConversation(restored.slice(-24));setPrompt('');setMessage('');setCurrentTask(null);setHistoryOpen(false);setTab('chat'); }} className={'w-full text-left p-3 rounded-2xl border '+(session.id===sessionId?'bg-[#292724] text-white border-[#292724]':'bg-white/75 border-black/5')}><div className="text-[10px] truncate">{session.title||'Untitled session'}</div><div className={'mt-1 text-[7px] '+(session.id===sessionId?'text-white/50':'text-[#999]')}>{new Date(session.updatedAt||session.createdAt).toLocaleString()} · {session.messages.length} messages</div></button>)}{!sessions.length&&<div className="py-16 text-center text-[9px] text-[#888]">还没有历史会话。<br/>开始第一次创作吧。</div>}</div>
          </aside>
        </div>
      )}
      {workspaceOpen && (
        <div className="absolute inset-0 z-[70]"><button onClick={() => setWorkspaceOpen(false)} className="absolute inset-0 bg-black/15" aria-label="Close workspace" />
          <aside className="absolute top-0 bottom-0 right-0 w-[78%] max-w-[290px] bg-[#f7f4ee] shadow-2xl border-l border-black/10 flex flex-col">
            <div className="pt-11 px-4 pb-4 border-b border-black/10"><div className="flex items-center justify-between"><div><div className="text-[7px] font-mono tracking-[2px] text-[#8b8782]">WORKSPACE</div><div className="mt-1 text-[22px] font-serif">Tools</div></div><button onClick={() => setWorkspaceOpen(false)} className="w-8 h-8 rounded-full bg-white grid place-items-center"><X className="w-4 h-4" /></button></div></div>
            <div className="p-3 space-y-1.5 overflow-auto">{[
              ['files','Files',FileCode2,'查看 / 编辑 GitHub 源码'],['changes','Changes',Upload,'审核 Meme 提出的修改'],['crafted','Crafted',Sparkles,'查看已经完成的工作'],['admin','Admin',ShieldAlert,'管理 Studio 操作记录'],['git','Git',Github,'查看 commit / CI / recovery'],['settings','Settings',KeyRound,'AI 与 GitHub 连接']
            ].map(([value,label,Icon,desc])=><button key={String(value)} onClick={()=>{setTab(value as Tab);setWorkspaceOpen(false)}} className="w-full p-3 rounded-2xl bg-white/75 border border-black/5 text-left flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-[#ebe6de] grid place-items-center"><Icon className="w-3.5 h-3.5" /></div><div className="min-w-0 flex-1"><div className="text-[10px]">{String(label)}</div><div className="mt-0.5 text-[7px] text-[#999]">{String(desc)}</div></div><ChevronRight className="w-3 h-3 text-[#aaa]" /></button>)}</div>
          </aside>
        </div>
      )}
      {notice && <div className="absolute z-50 bottom-20 left-4 right-4 p-2.5 rounded-xl bg-[#292724] text-white text-[9px] text-center">{notice}</div>}

      {tab === 'chat' && (
        <div className="absolute z-40 left-3 right-3 bottom-3">
          <div className="rounded-2xl bg-white/92 border border-black/8 shadow-lg p-2 flex items-end gap-2">
            <div className="relative shrink-0">
              <button onClick={() => setAttachmentMenuOpen(value => !value)} className="w-9 h-9 rounded-full bg-[#f0ede7] grid place-items-center" aria-label="添加照片或文件"><Plus className="w-4 h-4" /></button>
              {attachmentMenuOpen && <div className="absolute bottom-11 left-0 w-36 rounded-2xl bg-white border border-black/8 shadow-xl p-1.5 z-50">
                <label className="flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-[#f3f0ea] text-[9px] cursor-pointer">
                  <span className="w-6 h-6 rounded-lg bg-[#eee9df] grid place-items-center">▧</span>
                  照片
                  <input type="file" accept="image/*" className="hidden" multiple onChange={event => {
                    const files = Array.from(event.target.files || []);
                    if (files.length) {
                      setAttachments(current => [...current, ...files.map(file => ({ name: file.name, kind: 'image' as const, size: file.size }))].slice(-4));
                      setAttachmentMenuOpen(false);
                    }
                    event.currentTarget.value = '';
                  }} />
                </label>
                <label className="flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-[#f3f0ea] text-[9px] cursor-pointer">
                  <span className="w-6 h-6 rounded-lg bg-[#eee9df] grid place-items-center">□</span>
                  文件
                  <input type="file" className="hidden" multiple onChange={event => {
                    const files = Array.from(event.target.files || []);
                    if (files.length) {
                      setAttachments(current => [...current, ...files.map(file => ({ name: file.name, kind: 'file' as const, size: file.size }))].slice(-4));
                      setAttachmentMenuOpen(false);
                    }
                    event.currentTarget.value = '';
                  }} />
                </label>
              </div>}
            </div>
            {attachments.length > 0 && <div className="absolute bottom-14 left-0 right-0 flex gap-1.5 overflow-x-auto px-1 pb-1">{attachments.map((item, index) => <button key={item.name + index} onClick={() => setAttachments(current => current.filter((_, i) => i !== index))} className="shrink-0 max-w-40 px-2.5 py-1.5 rounded-xl bg-[#f0ede7] text-[8px] truncate">{item.kind === 'image' ? '照片 · ' : '文件 · '}{item.name} ×</button>)}</div>}
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="告诉 MEME 你想改什么…" rows={1} className="flex-1 min-h-9 max-h-24 py-2.5 px-1 bg-transparent text-[10px] outline-none resize-none" />
            <button onClick={() => void ask()} disabled={aiBusy || !prompt.trim()} className="w-9 h-9 rounded-full bg-[#292724] text-white grid place-items-center disabled:opacity-25 shrink-0">{aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}</button>
          </div>
        </div>
      )}
    </div>
  );
}
