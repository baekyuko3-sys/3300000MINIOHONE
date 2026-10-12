import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScreenType, OfflineEvent, WorldBook } from '../../types';
import type { ImportedCharacter } from '../../data/characterImport';
import { usePersistentState } from '../../store/usePersistentState';
import { getOfflineEvents, updateOfflineEvent } from '../../store/offlineEvents';
import { getCotPresets } from '../../store/cotPresets';
import { ensureDefaultOfflinePromptPresets } from '../../store/promptPresets';
import {
  addRecentMemorySummary,
  buildMemoryContext,
  getCharacterMemory,
} from '../../store/characterMemory';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import offlineHtml from '../../offline/offline-story.html?raw';

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function readLinePersonas() {
  const stored = readStoredJson<unknown>('line:user-personas', []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((persona: any) => persona && typeof persona === 'object' && persona.id)
    .map((persona: any) => {
      const profession = String(persona.profession || persona.identity || '').trim();
      const metadata = [
        persona.age ? '年龄：' + persona.age : '',
        profession ? '职业：' + profession : '',
        persona.region ? '地区：' + persona.region : '',
        persona.timezone ? '时区：' + persona.timezone : '',
        persona.birthday ? '生日：' + persona.birthday : '',
      ].filter(Boolean);
      const setting = String(persona.setting || persona.bio || persona.description || '').trim();
      return {
        ...persona,
        id: String(persona.id),
        name: String(persona.name || '未命名人设'),
        tag: [profession, persona.age ? '年龄 ' + persona.age : '', persona.region]
          .filter(Boolean).join(' · '),
        desc: [setting, ...metadata].filter(Boolean).join('\n'),
        av: String(persona.avatar || persona.av || ''),
      };
    });
}

function readActivePersonaId(): string {
  const active = readStoredJson<unknown>('line:active-persona', '');
  return typeof active === 'string' ? active : '';
}

function buildData(
  characters: ImportedCharacter[],
  books: WorldBook[],
  events: OfflineEvent[],
) {
  ensureDefaultOfflinePromptPresets();
  return {
    bridge: true,
    embedded: true,
    now: Date.now(),
    chars: characters.map(character => ({
      id: character.id,
      name: character.name,
      tag: (character.tags && character.tags[0]) || character.variantLabel || '',
      desc: character.description,
      personality: character.personality,
      scenario: character.scenario,
      onlinePersona: character.onlinePersona,
      typingHabit: character.typingHabit,
      creatorNotes: character.creatorNotes,
      systemPrompt: character.systemPrompt,
      postHistoryInstructions: character.postHistoryInstructions,
      mes_example: character.exampleDialogue,
      av: character.avatar || '',
      cover: '',
      first_mes: character.firstMessage,
      alts: character.alternateGreetings || [],
      wb: Array.from(new Set([
        ...(character.worldBookIds || []),
        ...books.filter(book => book.sourceCharacterId === character.id).map(book => book.id),
      ])),
    })),
    books: books.map(book => ({
      id: book.id,
      name: book.name,
      on: book.enabled !== false,
      scopes: (book.globalScopes || []).includes('offline-story') ? ['offline'] : [],
      es: (book.entries || []).map(entry => ({
        uid: entry.id,
        key: entry.keywords || [],
        keysecondary: entry.secondaryKeywords || [],
        comment: entry.name,
        content: entry.content,
        constant: !!entry.constant,
        disable: !entry.enabled,
        position: entry.insertion === 'before' ? 0 : entry.insertion === 'after' ? 1 : 4,
        depth: entry.depth || 4,
        order: entry.priority ?? entry.order ?? 100,
      })),
    })),
    // Pass a read-only projection of LINE invites; offlineRP9 remains independent.
    invites: events
      .filter(event => ['accepted', 'in-progress', 'completed'].includes(event.status))
      .map(event => {
        const time = Date.parse(event.time);
        const at = Date.parse(event.createdAt) || Date.now();
        return {
          id: event.id,
          cid: event.characterId,
          at,
          ts: Number.isNaN(time) ? at : time,
          place: event.location,
          why: event.title,
          opening: event.openingGreeting || event.sceneIntro || '',
          status: event.status === 'completed' ? 'accepted' : 'new',
          done: event.status === 'completed' ? 1 : 0,
        };
      }),
    personas: readLinePersonas(),
    activePersonaId: readActivePersonaId(),
    cots: getCotPresets().filter(preset =>
      !preset.targets || preset.targets.includes('offline'),
    ),
    // Personas are read from LINE's existing keys; no separate offline persona list is created.
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '生成失败，请检查 AI 配置或网络后重试。';
}

export function OfflineStoryHtmlView(_props: {
  onNavigate: (screen: ScreenType) => void;
}) {
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [books] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [events, setEvents] = usePersistentState<OfflineEvent[]>(
    'phone:offline-events-cache',
    getOfflineEvents(),
  );
  const frame = useRef<HTMLIFrameElement>(null);
  const [presetRevision, setPresetRevision] = useState(0);
  const data = useMemo(
    () => buildData(characters, books, events),
    [characters, books, events, presetRevision],
  );

  // The authoritative store is phone:offline-events; refresh the older cache on mount.
  useEffect(() => {
    setEvents(getOfflineEvents());
  }, [setEvents]);

  useEffect(() => {
    const refreshPresets = () => setPresetRevision(value => value + 1);
    window.addEventListener('sane333:cot-presets-changed', refreshPresets);
    window.addEventListener('sane333:cot-assignments-changed', refreshPresets);
    return () => {
      window.removeEventListener('sane333:cot-presets-changed', refreshPresets);
      window.removeEventListener('sane333:cot-assignments-changed', refreshPresets);
    };
  }, []);

  // Embed the user's exact HTML for first paint. Later data changes use postMessage.
  const srcDoc = useMemo(() => {
    const initialData = JSON.stringify(data).replace(/</g, '\\u003c');
    return offlineHtml.replace(
      '<body>',
      '<body><script>window.PHONE_DATA=' + initialData + ';</script>',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'data', data },
      window.location.origin,
    );
  }, [data]);

  useEffect(() => {
    let disposed = false;
    const postToFrame = (message: object) => {
      if (disposed) return;
      frame.current?.contentWindow?.postMessage(message, window.location.origin);
    };
    const refreshEventCache = () => setEvents(getOfflineEvents());

    const onMessage = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (!message || typeof message.type !== 'string') return;

      if (message.type === 'gen') {
        const id = typeof message.id === 'string' ? message.id : '';
        if (!id) return;
        try {
          const payload = message.payload && typeof message.payload === 'object'
            ? message.payload
            : {};
          const {
            kind = 'reply',
            guidance = '',
            cid = '',
            items = [],
            history = [],
            len = 1200,
          } = payload;
          if (typeof cid !== 'string' || !cid) {
            throw new Error('这段剧情还没有绑定角色，请先选择已导入的角色。');
          }
          const character = characters.find(item => item.id === cid);
          if (!character) {
            throw new Error('找不到这段剧情绑定的角色，请重新选择角色后再生成。');
          }

          const settings = readStoredAiSettings(cid, character.name);
          const promptItems = Array.isArray(items)
            ? items
                .filter((item: unknown) => Array.isArray(item) && item.length >= 2)
                .map((item: any) => '【' + String(item[0]) + '】\n' + String(item[1]))
            : [];
          const safeHistory = Array.isArray(history)
            ? history.filter((item: any) =>
                item && (item.role === 'user' || item.role === 'assistant')
                && typeof item.content === 'string',
              )
            : [];
          const historyText = safeHistory
            .slice(-8)
            .map((item: { role: string; content: string }) =>
              (item.role === 'assistant' ? character.name : '用户') + '：' + item.content,
            )
            .join('\n');
          const memory = getCharacterMemory(cid, character.name);
          const memoryContext = buildMemoryContext(memory, 24, historyText);
          const recentSummaries = (memory.recentSummaries || [])
            .slice(0, 8)
            .map(item => '- ' + item.content)
            .join('\n');

          const systemPrompt = [
            '继续一条沉浸式线下剧情。',
            '绝对不能替用户说话，不能替用户做出未明确的动作、决定或感受；你只负责环境变化、NPC/角色反应和角色台词。',
            kind === 'impersonate'
              ? '现在请替用户起草下一句台词或动作，只输出用户会说或做的内容，不要写角色的反应。'
              : '',
            ...promptItems,
            memoryContext ? '【项目现有角色长期记忆】\n' + memoryContext : '',
            recentSummaries ? '【项目近期记忆摘要】\n' + recentSummaries : '',
            '【篇幅】本则约 ' + Math.max(100, Math.min(12000, Number(len) || 1200)) + ' 字。',
          ].filter(Boolean).join('\n\n');

          let modelHistory = safeHistory;
          let userPrompt = '';
          if (kind === 'reply') {
            let index = safeHistory.length - 1;
            while (index >= 0 && safeHistory[index].role !== 'user') index -= 1;
            modelHistory = safeHistory.slice(0, Math.max(index, 0));
            userPrompt = '用户刚刚在现场做了 / 说了：\n'
              + (index >= 0 ? safeHistory[index].content : '（开场）')
              + '\n\n请自然继续这一幕，给用户留下下一步回应空间。';
          } else if (kind === 'cont') {
            userPrompt = '请顺着上面最后一段自然接着写，不要重复已写内容。';
          } else if (kind === 'impersonate') {
            userPrompt = '请以用户的口吻，起草用户接下来要说的话或做的动作。';
          } else {
            userPrompt = '请自然继续当前线下剧情，并给用户留下下一步回应空间。';
          }
          if (typeof guidance === 'string' && guidance.trim()) {
            userPrompt += '\n本次指导：' + guidance.trim().slice(0, 5000);
          }

          const text = await generateCreativeText({
            settings,
            systemPrompt,
            history: modelHistory,
            userPrompt,
            temperature: settings.temperature,
          });
          if (!text || !text.trim()) {
            throw new Error('模型返回了空内容，请重试或检查当前模型。');
          }
          postToFrame({ type: 'gen-result', id, text });
        } catch (error) {
          console.error('[SANE333 OFFLINE STORY] generation failed', error);
          postToFrame({ type: 'gen-result', id, error: errorMessage(error) });
        }
      } else if (message.type === 'start') {
        try {
          if (typeof message.invId === 'string' && message.invId) {
            updateOfflineEvent(message.invId, {
              status: 'in-progress',
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('[SANE333 OFFLINE STORY] failed to update invite status', error);
        } finally {
          refreshEventCache();
        }
      } else if (message.type === 'done') {
        try {
          const payload = message.payload && typeof message.payload === 'object'
            ? message.payload
            : {};
          const characterId = typeof payload.cid === 'string' ? payload.cid : '';
          const characterName = typeof payload.name === 'string' ? payload.name : '';
          const summary = typeof payload.text === 'string' ? payload.text.trim() : '';
          if (characterId && characterName && summary) {
            const currentMemory = getCharacterMemory(characterId, characterName);
            const alreadyStored = (currentMemory.recentSummaries || [])
              .some(item => item.content.trim() === summary);
            if (!alreadyStored) {
              addRecentMemorySummary(characterId, characterName, summary, {
                source: 'offline',
                importance: 70,
              });
            }
          }
          if (typeof payload.invId === 'string' && payload.invId) {
            updateOfflineEvent(payload.invId, {
              status: 'completed',
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('[SANE333 OFFLINE STORY] failed to sync completion', error);
        } finally {
          refreshEventCache();
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      disposed = true;
      window.removeEventListener('message', onMessage);
    };
  }, [characters, setEvents]);

  return (
    <iframe
      ref={frame}
      title="线下剧情"
      srcDoc={srcDoc}
      className="block h-full w-full min-h-0 min-w-0 overflow-hidden border-0 bg-transparent"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
      style={{ display: 'block' }}
    />
  );
}
