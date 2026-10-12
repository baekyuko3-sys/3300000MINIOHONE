import { MEME_PROJECT_MAP, MEME_PROJECT_PRINCIPLES } from './projectMap';
import { generateCreativeText } from '../ai/aiEngine';
import type { ChatProvider } from '../store/appSettings';

export type MemeCodingMode = 'always-ask' | 'confirm-before-commit' | 'auto';

export type MemeAction =
  | { type: 'inspect'; path?: string }
  | { type: 'search'; query: string }
  | { type: 'read'; path: string }
  | { type: 'propose'; operation: 'create' | 'update' | 'delete'; path: string; content?: string; find: string; replace: string; reason?: string; risk?: 'low' | 'medium' | 'high' }
  | { type: 'message'; text: string }
  | { type: 'done'; text: string };

export type MemeValidation = {
  status: 'passed' | 'needs_revision' | 'needs_more_context';
  summary: string;
  checks: string[];
  concerns: string[];
  changedLines: number;
  removedLines: number;
};

export type MemeProposal = {
  id: string;
  operation: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
  originalContent?: string;
  validation?: MemeValidation;
};

export type MemeEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'validation'; path: string; validation: MemeValidation }
  | { type: 'proposal'; proposal: MemeProposal }
  | { type: 'message'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; text: string };

export type MemeTool = {
  name: string;
  description: string;
  run: (input: any) => Promise<any>;
};

type AgentOptions = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  provider?: ChatProvider;
  codingMode: MemeCodingMode;
  project: string;
  tools: MemeTool[];
  maxRounds?: number;
  maxValidationRounds?: number;
  onEvent?: (event: MemeEvent) => void;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

function endpoint(base: string) {
  const value = base.trim().replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(value) ? value : value + '/chat/completions';
}

function extractJson(raw: string) {
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Meme 返回的不是有效 JSON');
  return JSON.parse(match[0]);
}

function isDependencyVersionOnlyChange(path: string, before: string, after: string) {
  if (path.replace(/^\/+/, '') !== 'package.json') return false;
  try {
    const a = JSON.parse(before);
    const b = JSON.parse(after);
    const normalize = (value: any) => {
      const copy = { ...value };
      delete copy.dependencies;
      delete copy.devDependencies;
      return copy;
    };
    const aDeps = { ...(a.dependencies || {}), ...(a.devDependencies || {}) };
    const bDeps = { ...(b.dependencies || {}), ...(b.devDependencies || {}) };
    if (JSON.stringify(normalize(a)) !== JSON.stringify(normalize(b))) return false;
    const keys = Array.from(new Set([...Object.keys(aDeps), ...Object.keys(bDeps)]));
    let changed = false;
    for (const key of keys) {
      if (aDeps[key] !== bDeps[key]) {
        changed = true;
        if (aDeps[key] === undefined || bDeps[key] === undefined) return false;
      }
    }
    return changed;
  } catch {
    return false;
  }
}

function lineStats(before: string, after: string) {
  const a = before.split('\n');
  const b = after.split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return {
    changedLines: Math.max(0, b.length - prefix - suffix),
    removedLines: Math.max(0, a.length - prefix - suffix),
  };
}

const system = (project: string, mode: MemeCodingMode) => `
You are MEME, the coding agent inside Studio for the 小手机 project.
Project: ${project}
Coding mode: ${mode}

You are a real coding agent for this repository, not a generic chatbot.
Your first priority is to understand the ACTUAL repository before suggesting anything.
For every non-trivial request, inspect the relevant directory first, then read the exact files that control the behavior. Search for symbols/usages when the path is uncertain.
Never claim you read a file, tested a change, or connected to GitHub unless the tool result proves it.
Do not tell the user to connect GitHub merely because you lack context: use the supplied repository tools first.
If inspect/read/search returns real repository data, GitHub is connected for this task. NEVER claim the repository is disconnected after successful tool evidence.
Do not give generic advice when you can inspect the code yourself.
You have three levels of intelligence:
1. FACTS: what the repository/tool results actually prove.
2. REASONING: connect those facts to the user's requested behavior and identify the real implementation path.
3. ACTION: inspect the smallest relevant set of files, then propose concrete changes when a fix is requested.
Never skip from the user's sentence directly to a generic answer when repository evidence is available.
For a repository question, do not answer from the project map alone. The project map is orientation only; real GitHub tool results are authoritative.
If the user asks "can you change/fix this", inspect the implementation before answering. If the user asks for an explanation only, still use the repository when the answer depends on current code.
After a successful repository inspection, summarize what you actually found in the repository in plain language. Do not merely repeat the user's request. For any request mentioning a repository, GitHub URL, code, source file, project structure, bug, build, or configuration, your FIRST action must be inspect, search, or read. Never answer with a generic statement that you cannot access GitHub when Studio has repository tools.
When the user asks whether something can be changed, answer briefly and then inspect the implementation.
When the user asks for a fix, keep working until you have either staged an evidence-based proposal or can clearly explain the concrete blocker.
Prefer small, surgical changes over broad rewrites.
For existing files, NEVER rewrite the whole file when a small edit is enough. Prefer a propose update with exact "find" and "replace" snippets; Studio will apply that patch to the real current file before it enters Changes.
For new files, use "content". For deleting files, omit content/find/replace.
A proposal must contain enough context to be applied safely. Do not invent current file text. Read the target file first.
After inspection, explain only the useful conclusion; never dump internal reasoning or tool chatter. For multi-file work, inspect all relevant files before proposing changes.
You may work on main or another branch; branch choice is controlled by the user.
Never pretend a change was applied when it is only a proposal.
The Studio Changes layer is the human approval boundary.
Do not expose chain-of-thought. Give concise user-facing reasoning.

When repairing CI/build failures, identify the root cause rather than merely reacting to the last log line. The proposed fix must be minimal, relevant to the failure, and checked for regressions.

Return JSON with exactly one action:
{"action":{"type":"inspect","path":""}}
{"action":{"type":"search","query":"..."}}
{"action":{"type":"read","path":"..."}}
{"action":{"type":"propose","operation":"update","path":"...","find":"EXACT OLD TEXT","replace":"EXACT NEW TEXT","reason":"...","risk":"low"}}
{"action":{"type":"message","text":"..."}}
{"action":{"type":"done","text":"..."}}

After every tool result, continue working. Do not ask the user to copy code manually when Studio can stage it.
`;

async function callModel(options: AgentOptions, messages: any[], temperature = 0.1, primaryUserPrompt?: string) {
  const systemPrompt = String(messages.find(message => message.role === 'system')?.content || '');
  const history: Array<{ role: 'assistant' | 'user'; content: string }> = messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: (message.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: String(message.content || ''),
    }));
  const userPrompt = primaryUserPrompt ?? String([...messages].reverse().find(message => message.role === 'user')?.content || '');

  // Use the same model transport as the rest of the app, including Gemini.
  // Studio must not depend on the character/roleplay engine.
  const raw = await generateCreativeText({
    settings: {
      provider: options.provider || 'openai-compatible',
      apiBaseUrl: options.apiBaseUrl,
      apiKey: options.apiKey,
      model: options.model,
      streaming: false,
      contextLength: 32,
      maxOutputTokens: 5000,
      autoSave: false,
      temperature,
      topP: 1,
      topK: 40,
      frequencyPenalty: 0,
      presencePenalty: 0,
      seed: null,
    },
    systemPrompt: systemPrompt + '\n\nReturn JSON only. No Markdown fences.',
    history,
    userPrompt,
    temperature,
  });
  return { raw, parsed: extractJson(raw) };
}

async function validateProposal(options: AgentOptions, userRequest: string, proposal: MemeProposal, originalContent: string, validationContext: string, toolEvidence: string) {
  const stats = lineStats(originalContent, proposal.content || '');
  const validationSystem = `
You are MEME's pre-approval code reviewer.
Your job is to validate a proposed change BEFORE it reaches the user's Changes queue.

Check four things:
1. ROOT CAUSE: Does the proposed diff directly address the requested task or CI/build failure?
2. MINIMALITY: Is the change limited to what is necessary, or does it rewrite unrelated code?
3. REGRESSION RISK: Could it break imports, types, runtime behavior, existing features, config, or styling?
4. EVIDENCE: Do the inspected files and context actually support the proposed fix?

For CI repair, be strict: a proposal that merely hides an error, weakens checks, deletes unrelated code, or guesses without evidence must not pass.
If evidence is insufficient, return needs_more_context rather than guessing.
Do not expose chain-of-thought.

Return JSON only:
{
  "status":"passed"|"needs_revision"|"needs_more_context",
  "summary":"short explanation",
  "checks":["..."],
  "concerns":["..."]
}
`;
  const user = `
REQUEST:
${userRequest}

INCIDENT / TASK CONTEXT:
${validationContext || '(none)'}

PROPOSED FILE:
${proposal.path}
operation=${proposal.operation}
reason=${proposal.reason}

DIFF STATS:
added/changed lines ~= ${stats.changedLines}
removed lines ~= ${stats.removedLines}

ORIGINAL CONTENT:
${originalContent.slice(0, 30000)}

PROPOSED CONTENT:
${(proposal.content || '').slice(0, 30000)}

AVAILABLE TOOL EVIDENCE:
${toolEvidence.slice(-30000)}
`;
  const result = await callModel(options, [
    { role: 'system', content: validationSystem },
    { role: 'user', content: user },
  ], 0.05);
  const parsed = result.parsed || {};
  return {
    status: parsed.status === 'passed' || parsed.status === 'needs_revision' || parsed.status === 'needs_more_context'
      ? parsed.status
      : 'needs_revision',
    summary: String(parsed.summary || '验证器没有给出明确结论。'),
    checks: Array.isArray(parsed.checks) ? parsed.checks.map(String).slice(0, 8) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 8) : [],
    changedLines: stats.changedLines,
    removedLines: stats.removedLines,
  } as MemeValidation;
}

export async function runMemeAgent(options: AgentOptions, userRequest: string, validationContext = '') {
  const maxRounds = options.maxRounds ?? 12;
  const maxValidationRounds = options.maxValidationRounds ?? 2;
  const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system(options.project, options.codingMode) },
    ...(options.conversation || []).map(message => ({ role: message.role, content: message.content })),
    ...(options.conversation?.some(message => message.role === 'user' && message.content.trim() === userRequest.trim())
      ? []
      : [{ role: 'user' as const, content: userRequest }]),
  ];
  const fileSnapshots = new Map<string, string>();
  const requestNeedsRepository = /github|仓库|repo|repository|代码|源码|文件|项目|bug|报错|lint|build|构建|修改|修复|连接|链接|commit|提交/i.test(userRequest);
  const requestNeedsCodeChange = /修改|修复|改一下|改成|增加|删除|重构|实现|实现一下|fix|change|update|edit|remove|refactor|implement|commit|提交/i.test(userRequest);

  const proposals: MemeProposal[] = [];
  let lastValidationContext = validationContext;
  let repositoryEvidenceAvailable = false;
  let forcedRepositoryRetry = false;

  // Preflight the real repository once before asking the model to reason.
  // This prevents MEME from falling back to generic "please connect GitHub"
  // replies when the Studio connection is already valid.
  const inspectTool = options.tools.find(tool => tool.name === 'inspect');
  if (inspectTool) {
    try {
      options.onEvent?.({ type: 'tool', name: inspectTool.name, input: { path: '' } });
      const root = await inspectTool.run({ path: '' });
      const evidence = JSON.stringify(root).slice(0, 50000);
      history.push({
        role: 'assistant',
        content:
          'STUDIO PREFLIGHT — REAL GITHUB REPOSITORY ACCESS IS ACTIVE FOR THIS TASK. ' +
          'The following result came directly from the repository tool. Treat it as authoritative. ' +
          'Do NOT ask the user to reconnect GitHub unless a later GitHub request actually fails:\n' + evidence,
      });
      history[0].content +=
        '\n\n[VERIFIED GITHUB REPOSITORY ACCESS]\n' +
        'The Studio repository connection has already succeeded for this request. ' +
        'The following data is real repository data. Never claim that GitHub is inaccessible. ' +
        'Use repository tools to inspect/read/search as needed and act on the user request.\n' +
        evidence;
      repositoryEvidenceAvailable = true;
      lastValidationContext = (lastValidationContext ? lastValidationContext + '\n\n' : '') +
        'Repository preflight succeeded. GitHub access is active. Root listing: ' + evidence;
    } catch (error) {
      history.push({
        role: 'assistant',
        content: '[STUDIO PREFLIGHT FAILED] repository inspection failed with ' + String(error) + '. Do not pretend access exists.',
      });
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    options.onEvent?.({ type: 'thinking', text: round === 0 ? '正在理解项目…' : '正在继续检查…' });
    const { raw, parsed } = await callModel(options, history, 0.12, userRequest);
    const action = parsed.action as MemeAction;
    const directText = action?.type === 'message' || action?.type === 'done';
    const accessRefusal = directText && /无法(?:直接)?访问|不能(?:直接)?访问|没有(?:实时)?(?:浏览|访问)网页|没有.*github.*能力|请.*(?:粘贴|提供).*(?:代码|文件)|把.*(?:代码|源码).*给我/i.test(String(action.text || ''));

    // Repository/coding tasks must produce real tool evidence before a final
    // answer. This is deterministic: the model cannot skip straight to chat.
    if (round === 0 && requestNeedsRepository && directText && repositoryEvidenceAvailable && !forcedRepositoryRetry) {
      if (accessRefusal && !requestNeedsCodeChange) {
        const verified = '可以。Studio 已经实际连接到 GitHub，并完成了真实仓库检查。';
        options.onEvent?.({ type: 'message', text: verified });
        options.onEvent?.({ type: 'done', text: verified });
        return { status: 'done' as const, text: verified, proposals };
      }

      forcedRepositoryRetry = true;
      history.push({ role: 'assistant', content: raw });
      history.push({
        role: 'assistant',
        content:
          '[STUDIO CONTROL] 不允许在没有真实仓库工具证据的情况下结束。仓库已经成功连接。现在必须使用 inspect/search/read 定位真实源码；如果用户要求修改/修复，必须继续到 propose，让修改进入 Changes。不要给出泛化的“无法访问 GitHub”或“请粘贴代码”回答。'
      });
      continue;
    }

    // A coding request that somehow reaches a direct answer after the forced
    // first retry still gets one final hard gate before returning to the user.
    if (requestNeedsCodeChange && requestNeedsRepository && directText && repositoryEvidenceAvailable && !accessRefusal && round < 2 && !proposals.length) {
      history.push({ role: 'assistant', content: raw });
      history.push({
        role: 'assistant',
        content:
          '[STUDIO CONTROL] 这是明确的代码修改任务。不要结束对话。继续 inspect/search/read，并在确认根因后生成 propose action；任何实际修改都必须进入 Changes 等待批准。'
      });
      continue;
    }
    if (!action?.type) throw new Error('Meme 返回了未知 action');

    if (action.type === 'message') {
      // MEME is a coding agent. When repository tools are available, a direct
      // refusal about GitHub access is never an acceptable final answer.
      const accessRefusal = /无法(?:直接)?访问|不能(?:直接)?访问|没有(?:实时)?(?:浏览|访问)网页|没有.*github.*能力|请.*(?:粘贴|提供).*(?:代码|文件)|把.*(?:代码|源码).*给我/i.test(String(action.text || ''));
      if (inspectTool && accessRefusal) {
        options.onEvent?.({ type: 'tool', name: inspectTool.name, input: { path: '' } });
        try {
          const root = await inspectTool.run({ path: '' });
          const evidence = JSON.stringify(root).slice(0, 50000);
          history.push({ role: 'assistant', content: raw });
          history.push({
            role: 'assistant',
            content: '[REAL REPOSITORY TOOL RESULT] GitHub access is confirmed. You MUST use the repository tools and must not claim that GitHub is inaccessible. Repository root: ' + evidence,
          });
          continue;
        } catch (error) {
          throw new Error('GitHub 仓库读取失败：' + String(error));
        }
      }
      options.onEvent?.({ type: 'message', text: action.text });
      history.push({ role: 'assistant', content: raw });
      return { status: 'done' as const, text: action.text, proposals };
    }

    if (action.type === 'done') {
      options.onEvent?.({ type: 'done', text: action.text });
      return { status: 'done' as const, text: action.text, proposals };
    }

    if (action.type === 'propose') {
      // A proposal must be validated against the real current file, not an
      // empty placeholder when MEME forgot to read the target first.
      let originalContent = fileSnapshots.get(action.path) || '';
      if (action.operation !== 'create' && !fileSnapshots.has(action.path)) {
        const readTool = options.tools.find(tool => tool.name === 'read');
        if (!readTool) throw new Error('Meme read tool unavailable for proposal validation');
        options.onEvent?.({ type: 'tool', name: readTool.name, input: { path: action.path } });
        const target = await readTool.run({ path: action.path });
        if (target && typeof target.content === 'string') {
          originalContent = target.content;
          fileSnapshots.set(action.path, originalContent);
          history.push({ role: 'assistant', content: '[STUDIO TOOL RESULT] AUTO-READ PROPOSAL TARGET (' + action.path + '):\\n' + JSON.stringify(target).slice(0, 50000) });
        } else {
          throw new Error('Meme 无法读取待修改文件：' + action.path);
        }
      }

      let proposalContent = action.content;
      if (action.operation === 'update' && !proposalContent && typeof action.find === 'string' && typeof action.replace === 'string') {
        let baseContent: string | undefined = fileSnapshots.get(action.path);
        if (baseContent == null) {
          const readTool = options.tools.find(tool => tool.name === 'read');
          if (!readTool) throw new Error('Meme read tool unavailable for patch proposal');
          options.onEvent?.({ type: 'tool', name: readTool.name, input: { path: action.path } });
          const target = await readTool.run({ path: action.path });
          if (!target || typeof target.content !== 'string') throw new Error('Meme 无法读取待修改文件：' + action.path);
          baseContent = target.content;
          fileSnapshots.set(action.path, String(baseContent));
          history.push({ role: 'assistant', content: '[STUDIO TOOL RESULT] read ' + action.path + ':\\n' + JSON.stringify(target).slice(0, 50000) });
        }
        if (typeof baseContent !== 'string') throw new Error('Meme patch 没有获得原文件内容：' + action.path);
        const patchFind: string = action.find ?? '';
        const patchReplace: string = action.replace ?? '';
        const findText: string = patchFind;
        const replaceText: string = patchReplace;
        const matches = baseContent.split(patchFind).length - 1;
        if (matches === 0) throw new Error('Meme patch find 在文件中不存在：' + action.path);
        if (matches > 1) throw new Error('Meme patch find 匹配了 ' + matches + ' 处，请提供更长的上下文以确保唯一匹配：' + action.path);
        proposalContent = baseContent.replace(patchFind, patchReplace);
      }

      const explicitDependencyIntent = /依赖|package(?:\\.json)?|typescript|npm|pnpm|yarn|版本|升级(?:依赖|软件包|包)|dependency|devDependencies/i.test(userRequest);
      const dependencyVersionOnly = isDependencyVersionOnlyChange(action.path, originalContent, proposalContent || '');
      if (dependencyVersionOnly && !explicitDependencyIntent && !/CI|TypeScript check|typecheck|build|lint|构建|报错|error/i.test(validationContext + '\n' + userRequest)) {
        const blockMessage = 'Meme 暂不把 package.json 的依赖版本变更放进 Changes：当前任务没有要求升级依赖，也没有 CI / 构建错误证据支持这次版本修改。';
        options.onEvent?.({ type: 'message', text: blockMessage });
        options.onEvent?.({ type: 'validation', path: action.path, validation: {
          status: 'needs_more_context',
          summary: '依赖版本修改缺少任务意图或 CI/构建证据，已拦截。',
          checks: ['保留原始任务范围', '避免无依据的依赖升级'],
          concerns: ['模型不能仅凭“最新稳定版本”推断当前版本是错误的'],
          changedLines: lineStats(originalContent, proposalContent || '').changedLines,
          removedLines: lineStats(originalContent, proposalContent || '').removedLines,
        }});
        history.push({ role: 'assistant', content: raw });
        history.push({ role: 'assistant', content: '[STUDIO CONTROL] 这次 package.json 只是无依据的依赖版本变更，不能进入 Changes。只有用户明确要求依赖升级，或 CI/构建证据直接支持时才允许继续。' });
        continue;
      }

      const proposal: MemeProposal = {
        id: 'meme-' + Date.now() + '-' + round,
        operation: action.operation,
        path: action.path,
        content: proposalContent,
        reason: action.reason || 'Meme proposes this project change.',
        risk: action.risk || (action.operation === 'delete' ? 'high' : 'medium'),
        status: 'pending',
        originalContent,
      };

      let validation: MemeValidation | null = null;
      let validationRound = 0;
      let evidence = Array.from(fileSnapshots.entries()).map(([path, content]) => path + '\\n' + content.slice(0, 10000)).join('\\n\\n');

      while (validationRound < maxValidationRounds) {
        validationRound++;
        options.onEvent?.({ type: 'thinking', text: '正在验证 ' + proposal.path + ' · diff / 根因 / 回归风险…' });
        validation = await validateProposal(options, userRequest, proposal, proposal.originalContent || '', lastValidationContext, evidence);
        options.onEvent?.({ type: 'validation', path: proposal.path, validation });

        if (validation.status === 'passed') {
          proposal.validation = validation;
          proposals.push(proposal);
          options.onEvent?.({ type: 'proposal', proposal });
          history.push({ role: 'assistant', content: raw });
          history.push({ role: 'assistant', content: '[STUDIO] Validation PASSED for ' + proposal.path + '. The proposal is staged in Changes. Continue checking the original user request for related files or remaining work.' });
          break;
        }

        history.push({ role: 'assistant', content: raw });
        history.push({
          role: 'assistant',
          content: '[STUDIO VALIDATION FAILED] ' + proposal.path + ':\\n' + JSON.stringify(validation) + '\\nDo not stage this proposal. Inspect/read/search the relevant code and produce a smaller, evidence-based corrected proposal.',
        });
        if (validation.status === 'needs_more_context' && validationRound >= maxValidationRounds) {
          options.onEvent?.({ type: 'message', text: 'Meme 暂不把 ' + proposal.path + ' 交给 Changes：证据不足，正在保留当前检查结果。' });
        }
      }

      if (validation?.status !== 'passed') {
        continue;
      }
      continue;
    }

    const tool = action.type === 'inspect'
      ? options.tools.find(t => t.name === 'inspect')
      : action.type === 'search'
        ? options.tools.find(t => t.name === 'search')
        : options.tools.find(t => t.name === 'read');

    if (!tool) throw new Error('Meme tool unavailable: ' + action.type);
    const input = action.type === 'search'
      ? { query: action.query }
      : action.type === 'read'
        ? { path: action.path }
        : { path: action.path || '' };
    options.onEvent?.({ type: 'tool', name: tool.name, input });
    const resultText = await tool.run(input);

    if (action.type === 'read' && resultText && typeof resultText.content === 'string') {
      fileSnapshots.set(String(action.path), resultText.content);
    }

    history.push({ role: 'assistant', content: raw });
    history.push({ role: 'assistant', content: '[STUDIO TOOL RESULT] ' + tool.name + ':\\n' + JSON.stringify(resultText).slice(0, 50000) });
  }

  const text = 'Meme 达到本轮 Agent 步数上限，已停止并保留当前已通过验证的 Changes。';
  options.onEvent?.({ type: 'done', text });
  return { status: 'limit' as const, text, proposals };
}
