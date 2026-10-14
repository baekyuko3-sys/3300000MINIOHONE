import { readPersistentState } from './usePersistentState';
import type { CharacterMemory } from './characterMemory';
import type { ImportedCharacter } from '../data/characterImport';
import type { ProjectManifest, WorldBook } from '../types';

export interface NpcAllContentContext {
  project: ProjectManifest;
  boundCharacter?: ImportedCharacter | null;
  boundCharacterMemory?: CharacterMemory | null;
  worldbooks: WorldBook[];
  appData: Record<string, unknown>;
}

const SECRET_KEY_PARTS = ['apiKey', 'token', 'password', 'secret', 'authorization', 'github-sync'];
const EXCLUDED_EXACT_KEYS = new Set(['phone:settings', 'sane333:github-token']);

function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PARTS.some(part => key.toLowerCase().includes(part.toLowerCase()))) continue;
    output[key] = scrubSecrets(child);
  }
  return output;
}

function readAllLocalContent(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const result: Record<string, unknown> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || EXCLUDED_EXACT_KEYS.has(key)) continue;
    // NPC generation receives only the worldbooks explicitly selected in its dedicated context.
    if (key === 'phone:worldbooks' || key === 'phone:characters') continue;
    if (!key.startsWith('phone:') && !key.startsWith('line:')) continue;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      result[key] = scrubSecrets(raw);
    } catch {
      const raw = localStorage.getItem(key);
      if (raw) result[key] = raw.slice(0, 4000);
    }
  }
  return result;
}

export function buildNpcAllContentContext(
  boundCharacter?: ImportedCharacter | null,
  boundCharacterMemory?: CharacterMemory | null,
  project?: ProjectManifest,
  worldbooks: WorldBook[] = [],
): NpcAllContentContext {
  const safeProject = project || readPersistentState<ProjectManifest>('phone:project-manifest', {
    id: 'sane333-project', name: 'Sane333', subtitle: '', description: '', genre: '', language: '中文', tone: '', globalPrompt: '',
    activeCharacterId: null, activeWorldBookId: null, createdAt: '', updatedAt: '',
  });
  return {
    project: safeProject,
    boundCharacter: boundCharacter || null,
    boundCharacterMemory: boundCharacterMemory || null,
    worldbooks,
    appData: readAllLocalContent(),
  };
}

export function serializeNpcAllContentContext(context: NpcAllContentContext, maxChars = 70000): string {
  const boundCharacter = context.boundCharacter;
  const characterBlock = boundCharacter ? {
    id: boundCharacter.id,
    name: boundCharacter.name,
    description: boundCharacter.description,
    personality: boundCharacter.personality,
    scenario: boundCharacter.scenario,
    firstMessage: boundCharacter.firstMessage,
    exampleDialogue: boundCharacter.exampleDialogue,
    creatorNotes: boundCharacter.creatorNotes,
    systemPrompt: boundCharacter.systemPrompt,
    postHistoryInstructions: boundCharacter.postHistoryInstructions,
    alternateGreetings: boundCharacter.alternateGreetings,
    tags: boundCharacter.tags,
  } : null;

  const payload = JSON.stringify({
    project: context.project,
    boundCharacter: characterBlock,
    boundCharacterMemory: context.boundCharacterMemory,
    worldbooks: context.worldbooks,
    allPhoneContent: context.appData,
  }, null, 2);

  if (payload.length <= maxChars) return payload;
  return payload.slice(0, maxChars) + '\n...[NPC 上下文达到安全长度上限；其余本机内容仍保存在本地]';
}


/**
 * Build the persistent identity context for an NPC at runtime.
 * The NPC's own memory/personality remain authoritative; the bound character is
 * only a link/reference and must never silently replace the NPC's identity.
 */
export function buildNpcRuntimeContext(
  npc: import('./npcs').SaneNpc,
  scope: 'online-chat' | 'offline-story' = 'online-chat',
): string {
  const books = readPersistentState<WorldBook[]>('phone:worldbooks', []);
  const selectedBooks = collectNpcRuntimeWorldBooks(npc, books, scope);
  const enabledEntries = selectedBooks.flatMap(book =>
    book.enabled
      ? book.entries
          .filter(entry => entry.enabled)
          .map(entry => '【' + book.name + ' / ' + entry.name + '】\\n' + entry.content)
      : [],
  );
  const relationToMe = getNpcRuntimeRelation(npc);
  return [
    '【NPC 独立身份】' + npc.name,
    'NPC ID：' + npc.id,
    '身份：' + (npc.identity || '未设定'),
    '性别/年龄：' + [npc.gender, npc.age].filter(Boolean).join(' / '),
    '性格：' + (npc.personality || '未设定'),
    '外貌：' + (npc.appearance || ''),
    '背景：' + (npc.background || ''),
    '与用户的关系：' + [npc.relationship, relationToMe].filter(Boolean).join('；'),
    '兴趣：' + (npc.interests || []).join('、'),
    '个性签名：' + (npc.statusMessage || ''),
    '简介：' + (npc.bio || ''),
    'NPC 自己的长期记忆（不得与绑定角色记忆混为一谈）：' + (npc.memory || '暂无'),
    'NPC 最近生活：' + (npc.recentLife || '未记录'),
    '绑定角色仅用于关联，不代表 NPC 与其拥有相同人格或经历：' + (npc.boundCharacterName || '未绑定'),
    '【NPC 专属/当前场景适用世界书】\\n' + (enabledEntries.join('\\n\\n') || '暂无适用条目'),
    '【身份边界】必须以 NPC 自己的身份、性格、关系、记忆和生活为准。不得把绑定角色的第一人称经历、记忆或关系直接当成 NPC 自己的经历。只使用当前场景可见的信息。',
  ].filter(Boolean).join('\\n');
}

function collectNpcRuntimeWorldBooks(
  npc: import('./npcs').SaneNpc,
  books: WorldBook[],
  scope: 'online-chat' | 'offline-story',
): WorldBook[] {
  // An explicit empty selection means no NPC-specific books; global books
  // for the current scene may still apply.
  return collectScopedWorldBooks({
    books,
    scope,
    character: {
      id: npc.id,
      name: npc.name,
      worldBookIds: Array.isArray(npc.worldBookIds) ? npc.worldBookIds : [],
    },
  });
}

function getNpcRuntimeRelation(npc: import('./npcs').SaneNpc): string {
  const text = String(npc.relationToMe || '').trim();
  if (!text) return '';
  if (!npc.relationToMeName) return text;
  const persona = readPersistentState<Array<{ id: string; name?: string; isDefault?: boolean }>>('line:user-personas', []);
  const activeId = readPersistentState<string | null>('line:active-persona', null);
  const active = persona.find(item => item.id === activeId) || persona.find(item => item.isDefault) || persona[0];
  return !active || active.name === npc.relationToMeName ? text : '';
}

import { collectScopedWorldBooks } from './worldbookRuntime';
