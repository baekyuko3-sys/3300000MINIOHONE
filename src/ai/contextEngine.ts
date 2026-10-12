import type { ImportedCharacter } from '../data/characterImport';
import type { ProjectManifest, WorldBook } from '../types';
import type { CharacterMemory } from '../store/characterMemory';
import { buildMemoryContext } from '../store/characterMemory';
import { getWorldRuntime } from '../store/worldRuntime';

export interface ContextEngineInput {
  character?: ImportedCharacter | null;
  characterProfile?: { relationship?: string; callMe?: string; bio?: string; canCharacterSelfJudge?: boolean } | null;
  persona?: { name?: string; identity?: string; gender?: string; traits?: string; background?: string; setting?: string; region?: string; timezone?: string; birthday?: string; profession?: string; age?: string } | null;
  memory?: CharacterMemory | null;
  project?: ProjectManifest | null;
  worldbooks?: WorldBook[];
  userMessage: string;
  worldBookScanForEntry?: (entry: WorldBook['entries'][number]) => string;
  includeCharacterGreeting?: boolean;
}

export interface ResolvedContext {
  character: string;
  persona: string;
  relationship: string;
  memory: string;
  world: string;
  project: string;
  worldBook: string;
  worldBookBefore: string;
  worldBookAfter: string;
}

export function getGlobalWorldBookEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem('phone:worldbook:global-enabled');
    return raw === null ? true : raw !== 'false';
  } catch {
    return true;
  }
}

function stableRoll(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function worldBookKeyMatches(keyword: string, haystack: string, entry: WorldBook['entries'][number]): boolean {
  const raw = keyword.trim();
  if (!raw) return false;

  const caseSensitive = Boolean(entry.caseSensitive);

  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    const lastSlash = raw.lastIndexOf('/');
    try {
      const pattern = raw.slice(1, lastSlash);
      const flags = raw.slice(lastSlash + 1) || (caseSensitive ? '' : 'i');
      return new RegExp(pattern, flags).test(haystack);
    } catch {
      // Invalid regex keys fall back to literal matching.
    }
  }

  const source = caseSensitive ? haystack : haystack.toLowerCase();
  const key = caseSensitive ? raw : raw.toLowerCase();

  if (entry.matchWholeWords) {
    const escaped = key.replace(/[.*+?^()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|\\b)' + escaped + '(?:$|\\b)', caseSensitive ? '' : 'i').test(source);
  }

  return source.includes(key);
}

export function selectWorldBookEntries(worldbooks: WorldBook[], inputText: string, scanTextForEntry?: (entry: WorldBook['entries'][number]) => string) {
  if (!getGlobalWorldBookEnabled()) return [];

  const candidates = worldbooks.flatMap(book => {
    if (!book.enabled) return [];

    return book.entries
      .filter(entry => entry.enabled && !entry.outletName)
      .map(entry => {
        const matchText = scanTextForEntry ? scanTextForEntry(entry) : inputText;
        const matchedKeywords = entry.constant
          ? ['[constant]']
          : entry.keywords.filter(keyword => worldBookKeyMatches(keyword, matchText, entry));

        if (!entry.constant && !matchedKeywords.length) return null;

        const secondary = entry.secondaryKeywords || [];
        if (entry.selective && secondary.length) {
          const matchedSecondary = secondary.filter(keyword => worldBookKeyMatches(keyword, matchText, entry));
          const logic = entry.selectiveLogic ?? 0;
          const passes =
            logic === 1 ? matchedSecondary.length < secondary.length :
            logic === 2 ? matchedSecondary.length === 0 :
            logic === 3 ? matchedSecondary.length === secondary.length :
            matchedSecondary.length > 0;
          if (!passes) return null;
        }

        if (entry.useProbability || entry.probability !== undefined) {
          const probability = Math.max(0, Math.min(100, Number(entry.probability ?? 100)));
          if (probability <= 0 || stableRoll(entry.id + '|' + matchText) >= probability) return null;
        }

        return { book, entry, matchedKeywords };
      })
      .filter(Boolean) as Array<{
        book: WorldBook;
        entry: WorldBook['entries'][number];
        matchedKeywords: string[];
      }>;
  });

  const blocked = new Set<string>();
  const groups = new Map<string, typeof candidates>();
  candidates.forEach(candidate => {
    const labels = String(candidate.entry.group || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    labels.forEach(label => {
      const group = groups.get(label) || [];
      group.push(candidate);
      groups.set(label, group);
    });
  });

  groups.forEach((groupCandidates, groupName) => {
    const available = groupCandidates.filter(candidate => !blocked.has(candidate.entry.id));
    if (available.length <= 1) return;

    const totalWeight = available.reduce((sum, candidate) => sum + Math.max(0, Number(candidate.entry.groupWeight ?? candidate.entry.weight ?? 100)), 0);
    if (totalWeight <= 0) {
      available.slice(1).forEach(candidate => blocked.add(candidate.entry.id));
      return;
    }

    let cursor = (stableRoll(groupName + '|' + inputText) / 100) * totalWeight;
    let winner = available[0];
    for (const candidate of available) {
      cursor -= Math.max(0, Number(candidate.entry.groupWeight ?? candidate.entry.weight ?? 100));
      if (cursor <= 0) {
        winner = candidate;
        break;
      }
    }

    const winnerGroups = String(winner.entry.group || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    groupCandidates.forEach(candidate => {
      if (candidate.entry.id !== winner.entry.id && winnerGroups.some(label => String(candidate.entry.group || '').split(',').map(value => value.trim()).includes(label))) {
        blocked.add(candidate.entry.id);
      }
    });
  });

  return candidates
    .filter(candidate => !blocked.has(candidate.entry.id))
    .sort((a, b) =>
      Number(Boolean(b.entry.constant)) - Number(Boolean(a.entry.constant)) ||
      (b.entry.order ?? b.entry.priority ?? 0) - (a.entry.order ?? a.entry.priority ?? 0) ||
      (b.entry.weight ?? 0) - (a.entry.weight ?? 0) ||
      b.matchedKeywords.length - a.matchedKeywords.length
    );
}

function resolveWorldBook(worldbooks: WorldBook[], scannedText: string, scanTextForEntry?: (entry: WorldBook['entries'][number]) => string) {
  const selected = selectWorldBookEntries(worldbooks, scannedText, scanTextForEntry)
    .filter(({ entry }) => entry.insertion !== 'depth');

  const before = selected.filter(({ entry }) => entry.insertion === 'before');
  const after = selected.filter(({ entry }) => entry.insertion === 'after');

  const render = (items: typeof selected, position: string) => items.map(({ book, entry, matchedKeywords }) => [
    '[WORLD BOOK · ' + position + ']',
    '书名：' + book.name,
    '条目：' + entry.name,
    '命中关键词：' + matchedKeywords.join('、'),
    '常驻：' + (entry.constant ? '是' : '否') + '；优先级：' + (entry.order ?? entry.priority ?? 0) + '；权重：' + (entry.weight ?? 0),
    '内容：',
    entry.content,
  ].join('\n')).join('\n\n');

  return {
    before: before.length ? render(before, 'before · 角色定义前') : '',
    after: after.length ? render(after, 'after · 角色定义后') : '',
  };
}

export function resolveCharacterContext(input: ContextEngineInput): ResolvedContext {
  const p = input.characterProfile || {};
  const character = input.character
    ? [
        '姓名：' + input.character.name,
        '描述：' + (input.character.description || '未填写'),
        '性格：' + (input.character.personality || '未填写'),
        '场景：' + (input.character.scenario || '未填写'),
        '创作者注释：' + (input.character.creatorNotes || '未填写'),
        '角色系统提示：' + (input.character.systemPrompt || '未填写'),
        '历史指令：' + (input.character.postHistoryInstructions || '未填写'),
        input.includeCharacterGreeting !== false ? '首条消息：' + (input.character.firstMessage || '未填写') : '首条消息：已作为首次开场白发送；本轮不重复注入。',
        input.includeCharacterGreeting !== false && input.character.alternateGreetings?.length ? '备用开场白：' + input.character.alternateGreetings.join('\\n---\\n') : '备用开场白：已作为首次开场白选项处理；本轮不重复注入。',
        '示例对话：' + (input.character.exampleDialogue || '未填写'),
        '备用开场白：' + (input.character.alternateGreetings?.length ? input.character.alternateGreetings.join('\n---\n') : '未填写'),
        '角色语言指纹：' + (input.character.languageProfile ? JSON.stringify(input.character.languageProfile) : '未填写'),
        '角色线上人设：' + (input.character.onlinePersona || '未填写'),
        '角色打字习惯：' + (input.character.typingHabit || '未填写'),
      ].join('\n')
    : [
        '角色姓名：' + (p.bio ? '见角色档案' : '未设置'),
        '当前关系记录：' + (p.relationship || '未设置'),
        '角色对用户的称呼：' + (p.callMe || '尚未形成；不要自行套用默认昵称'),
        '角色简介补充：' + (p.bio || '未填写'),
      ].join('\n');

  const persona = input.persona
    ? [
        '姓名：' + (input.persona.name || '未命名'),
        '身份：' + (input.persona.identity || '未填写'),
        '性别：' + (input.persona.gender || '未设置'),
        '特质：' + (input.persona.traits || '未填写'),
        '背景：' + (input.persona.background || '未填写'),
        '职业：' + (input.persona.profession || '未填写'),
        '年龄：' + (input.persona.age || '未填写'),
        '个人设定：' + (input.persona.setting || '未填写'),
        '地区：' + (input.persona.region || '未填写'),
        '时区：' + (input.persona.timezone || '未填写'),
        '生日：' + (input.persona.birthday || '未填写'),
      ].join('\n')
    : '未设置。';

  const runtime = getWorldRuntime();
  const id = input.character?.id;
  const live = id ? runtime.characters[id] : undefined;
  const world = live
    ? [
        '当前地点：' + live.location,
        '当前活动：' + live.activity,
        '当前情绪：' + live.mood,
        '当前日程：' + (live.currentScheduleTitle || '无'),
        '下一行动：' + (live.nextActionTitle || '无') + (live.nextActionAt ? '（' + live.nextActionAt + '）' : ''),
        '最近互动：' + (live.lastInteractionAt || '暂无'),
        '刚才的线上动作：' + (live.lastAction || '无；不要强行编造动作'),
        '刚才的角色决策摘要：' + (live.lastThinkingSummary || '无；不要把隐藏思维当作聊天内容'),
        '刚才的状态栏：' + (live.lastStatusRaw || '无'),
        '当前场景：' + (runtime.currentScene || '无'),
      ].join('\n')
    : '当前没有可用的角色实时世界状态。';

  const relationship = [
    '当前关系记录：' + (p.relationship || '未设置'),
    '角色对用户的称呼：' + (p.callMe || '尚未形成；只有在角色卡、用户资料或真实互动有依据时才使用；不要套用固定昵称'),
    live ? '当前未读：' + live.unread : '',
  ].filter(Boolean).join('\n');

  const project = input.project
    ? [
        '项目名称：' + input.project.name,
        '类型：' + input.project.genre,
        '语言：' + input.project.language,
        '整体风格：' + input.project.tone,
        input.project.globalPrompt ? '项目级 AI 指令：\n' + input.project.globalPrompt : '项目级 AI 指令：无。',
      ].join('\n')
    : '使用默认项目规则。';

  const lore = resolveWorldBook(input.worldbooks || [], input.userMessage, input.worldBookScanForEntry);

  return {
    character,
    persona,
    relationship,
    memory: input.memory ? buildMemoryContext(input.memory, 20, input.userMessage) : '当前没有已保存的长期记忆。',
    world,
    project,
    worldBook: [lore.before, lore.after].filter(Boolean).join('\n\n') || '当前没有命中的世界书条目。',
    worldBookBefore: lore.before,
    worldBookAfter: lore.after,
  };
}
