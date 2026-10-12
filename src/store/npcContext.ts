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
