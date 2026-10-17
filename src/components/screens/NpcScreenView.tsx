import { useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronRight, Sparkles, Trash2, UserRound, Link2,
  Users, Wand2, FolderOpen, Pause, Play,
} from 'lucide-react';
import type { ScreenType, WorldBook } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import { getCharacterMemory } from '../../store/characterMemory';
import { getProjectManifest } from '../../store/projectManifest';
import { buildNpcAllContentContext, serializeNpcAllContentContext } from '../../store/npcContext';
import { deleteNpc, getNpcs, removeNpcReferences, type SaneNpc, upsertNpc, getActivePersona } from '../../store/npcs';
import { NpcAvatar } from '../NpcAvatar';
import { putMedia } from '../../store/mediaVault';

type ScreenMode = 'home' | 'generate' | 'manage' | 'character-archive' | 'npc-profile';
type RelCategory = 'family' | 'friend' | 'coworker' | 'other';

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function buildFocus(
  source: 'project' | 'worldbook' | 'character',
  project: ReturnType<typeof getProjectManifest>,
  worldbooks: WorldBook[],
  character: ImportedCharacter,
  extra: string,
) {
  const sourceText = source === 'project'
    ? [project.name, project.description, project.genre, project.tone, project.globalPrompt].join('\n')
    : source === 'worldbook'
      ? worldbooks.map(book => {
          const entries = book.entries.filter(e => e.enabled).slice(0, 16);
          return [book.name, book.description, ...entries.map(entry => entry.name + ': ' + entry.content)].join('\n');
        }).join('\n\n') || '未勾选任何世界书条目'
      : [character.name, character.description, character.personality, character.scenario].join('\n');
  return [sourceText, extra ? '【用户补充】\n' + extra : ''].filter(Boolean).join('\n\n');
}

/** 把用户勾选的「书:条目」收成只含选中条目的世界书副本 */
function booksFromSelectedEntries(
  options: Array<{ key: string; book: WorldBook; entry: WorldBook['entries'][number]; origin: string }>,
  selectedKeys: string[],
): WorldBook[] {
  const byBook = new Map<string, WorldBook>();
  for (const option of options) {
    if (!selectedKeys.includes(option.key)) continue;
    const existing = byBook.get(option.book.id);
    if (existing) {
      existing.entries.push(option.entry);
    } else {
      byBook.set(option.book.id, {
        ...option.book,
        entries: [option.entry],
      });
    }
  }
  return [...byBook.values()];
}

function inferCategory(item: SaneNpc): RelCategory {
  if (item.relationshipCategory) return item.relationshipCategory;
  const relation = (item.relationship + ' ' + item.identity + ' ' + item.tags.join(' ')).toLowerCase();
  if (/家人|父亲|母亲|爸爸|妈妈|兄弟|姐妹|哥哥|姐姐|弟弟|妹妹|亲戚|family|sister|brother|mother|father|cousin|uncle|aunt/i.test(relation)) return 'family';
  if (/同事|上司|老板|经纪人|助理|同学|coworker|colleague|manager|assistant/i.test(relation)) return 'coworker';
  if (/朋友|好友|挚友|发小|竹马|闺蜜|死党|friend|best friend/i.test(relation)) return 'friend';
  return 'other';
}

const CATEGORY_LABEL: Record<RelCategory | 'all', string> = {
  all: '全部',
  family: '家人',
  friend: '朋友',
  coworker: '同事',
  other: '其他',
};

function parseNpcPayload(parsed: any, defaults: {
  genderChoice: string;
  identityCategory: RelCategory;
  source: SaneNpc['settingSource'];
  boundCharacter: ImportedCharacter;
  selectedWorldbooks: WorldBook[];
  index: number;
}): SaneNpc {
  const now = new Date().toISOString();
  const { genderChoice, identityCategory, source, boundCharacter, selectedWorldbooks, index } = defaults;
  return {
    id: 'npc-' + Date.now().toString(36) + '-' + index.toString(36),
    name: typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : '未命名 NPC',
    gender: genderChoice === '随机' ? (typeof parsed?.gender === 'string' ? parsed.gender : '') : genderChoice,
    age: typeof parsed?.age === 'string' ? parsed.age : '',
    identity: typeof parsed?.identity === 'string' ? parsed.identity : '世界居民',
    appearance: typeof parsed?.appearance === 'string' ? parsed.appearance : '',
    personality: typeof parsed?.personality === 'string' ? parsed.personality : '',
    background: typeof parsed?.background === 'string' ? parsed.background : '',
    relationship: typeof parsed?.relationship === 'string' ? parsed.relationship : '',
    relationToMe: typeof parsed?.relationToMe === 'string' ? parsed.relationToMe : '',
    relationToMeName: typeof parsed?.relationToMe === 'string' && parsed.relationToMe.trim() ? getActivePersona()?.name || '' : '',
    settingSource: source,
    relationshipCategory: (['family', 'friend', 'coworker', 'other'].includes(parsed?.relationshipCategory)
      ? parsed.relationshipCategory
      : identityCategory) as RelCategory,
    worldBookIds: selectedWorldbooks.map(book => book.id),
    worldBookNames: selectedWorldbooks.map(book => book.name),
    boundCharacterId: boundCharacter.id,
    boundCharacterName: boundCharacter.name,
    sourceCharacterId: boundCharacter.id,
    sourceCharacterName: boundCharacter.name,
    tags: Array.isArray(parsed?.tags) ? parsed.tags.filter((v: unknown): v is string => typeof v === 'string').slice(0, 8) : [],
    statusMessage: typeof parsed?.statusMessage === 'string' ? parsed.statusMessage : '',
    bio: typeof parsed?.bio === 'string' ? parsed.bio : '',
    interests: Array.isArray(parsed?.interests) ? parsed.interests.filter((v: unknown): v is string => typeof v === 'string').slice(0, 8) : [],
    recentLife: typeof parsed?.recentLife === 'string' ? parsed.recentLife : '',
    createdAt: now,
    updatedAt: now,
    memory: typeof parsed?.memory === 'string' ? parsed.memory : '',
    active: true,
    canCommentMoments: parsed?.canCommentMoments !== false,
    canPostMoments: parsed?.canPostMoments !== false,
  };
}

export function NpcScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [npcs, setNpcs] = usePersistentState<SaneNpc[]>('phone:npcs', () => getNpcs());
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);

  const [screenMode, setScreenMode] = useState<ScreenMode>('home');
  const [archiveCharacterId, setArchiveCharacterId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [source, setSource] = useState<'project' | 'worldbook' | 'character'>('character');
  const [boundCharacterId, setBoundCharacterId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [genderChoice, setGenderChoice] = useState('随机');
  const [identityCategory, setIdentityCategory] = useState<RelCategory>('friend');
  const [relationshipDetail, setRelationshipDetail] = useState('');
  const [selectedEntryKeys, setSelectedEntryKeys] = useState<string[]>([]);
  const [expandedBooks, setExpandedBooks] = useState<string[]>([]);
  const [batchCount, setBatchCount] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<'all' | RelCategory>('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const selected = npcs.find(item => item.id === selectedId) || null;
  const project = getProjectManifest();
  const boundCharacter = characters.find(c => c.id === boundCharacterId) || null;
  const archiveCharacter = characters.find(c => c.id === archiveCharacterId) || null;

  const worldbookGroups = useMemo(() => {
    const embedded = boundCharacter?.embeddedWorldBooks?.length
      ? boundCharacter.embeddedWorldBooks
      : boundCharacter?.embeddedWorldBook
        ? [boundCharacter.embeddedWorldBook]
        : [];
    const groups = [
      ...worldbooks.map(book => ({ bookKey: 'global:' + book.id, book, origin: '手机世界书' as const })),
      ...embedded.map((book, index) => ({ bookKey: 'embedded:' + index + ':' + book.id, book, origin: '角色卡内嵌' as const })),
    ];
    return groups.map(group => ({
      ...group,
      entries: (group.book.entries || [])
        .filter(entry => entry.enabled !== false)
        .map(entry => ({
          key: group.bookKey + ':entry:' + entry.id,
          book: group.book,
          entry,
          origin: group.origin,
        })),
    }));
  }, [worldbooks, boundCharacter]);
  const entryOptions = useMemo(
    () => worldbookGroups.flatMap(group => group.entries),
    [worldbookGroups],
  );
  const selectedWorldbooks = useMemo(
    () => booksFromSelectedEntries(entryOptions, selectedEntryKeys),
    [entryOptions, selectedEntryKeys],
  );

  const activeCount = useMemo(() => npcs.filter(item => item.active).length, [npcs]);

  const charactersWithNpcs = useMemo(() => {
    return characters.map(character => {
      const related = npcs.filter(n => (n.boundCharacterId || n.sourceCharacterId) === character.id);
      return { character, related, active: related.filter(n => n.active).length };
    }).filter(row => row.related.length > 0);
  }, [characters, npcs]);

  const orphanNpcs = useMemo(() => {
    const ids = new Set(characters.map(c => c.id));
    return npcs.filter(n => {
      const bound = n.boundCharacterId || n.sourceCharacterId || '';
      return bound && !ids.has(bound);
    });
  }, [characters, npcs]);

  const archiveNpcs = useMemo(() => {
    if (!archiveCharacterId) return [];
    return npcs.filter(n => (n.boundCharacterId || n.sourceCharacterId) === archiveCharacterId);
  }, [npcs, archiveCharacterId]);

  const visibleArchiveNpcs = archiveNpcs.filter(
    item => categoryFilter === 'all' || inferCategory(item) === categoryFilter,
  );

  const notify = (message: string, ms = 3200) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), ms);
  };

  const handleBack = () => {
    if (screenMode === 'npc-profile') {
      setSelectedId(null);
      setScreenMode(archiveCharacterId ? 'character-archive' : 'manage');
      return;
    }
    if (screenMode === 'character-archive') {
      setArchiveCharacterId('');
      setCategoryFilter('all');
      setScreenMode('manage');
      return;
    }
    if (screenMode === 'generate' || screenMode === 'manage') {
      setScreenMode('home');
      return;
    }
    onNavigate('home');
  };

  const openCharacterArchive = (characterId: string) => {
    setArchiveCharacterId(characterId);
    setBoundCharacterId(characterId);
    setSelectedId(null);
    setCategoryFilter('all');
    setScreenMode('character-archive');
  };

  const openNpcProfile = (npcId: string) => {
    const npc = npcs.find(item => item.id === npcId);
    if (!npc) return;
    setSelectedId(npcId);
    setArchiveCharacterId(npc.boundCharacterId || npc.sourceCharacterId || archiveCharacterId);
    setScreenMode('npc-profile');
  };

  const createNpcs = async () => {
    if (busy) return;
    if (!boundCharacter) {
      notify('请先选择要绑定的角色');
      return;
    }
    if (source === 'worldbook' && !selectedEntryKeys.length) {
      notify('已选「世界书」重点：请至少勾选一条世界书条目');
      return;
    }
    const count = Math.max(1, Math.min(8, Math.floor(batchCount) || 1));
    setBusy(true);
    notify(count > 1 ? `正在批量生成 ${count} 份 NPC 主页…` : '正在生成 NPC 主页…', 20000);
    try {
      const memory = getCharacterMemory(boundCharacter.id, boundCharacter.name);
      const allContext = buildNpcAllContentContext(boundCharacter, memory, project, selectedWorldbooks);
      const contextText = serializeNpcAllContentContext(allContext);
      const existingNames = npcs
        .filter(n => (n.boundCharacterId || n.sourceCharacterId) === boundCharacter.id)
        .map(n => n.name)
        .slice(0, 24);
      const selectedEntryLines = entryOptions
        .filter(option => selectedEntryKeys.includes(option.key))
        .map(option => '世界书「' + option.book.name + '」· 条目「' + option.entry.name + '」\n' + option.entry.content);

      const raw = await generateCreativeText({
        settings: readStoredAiSettings(boundCharacter.id, boundCharacter.name),
        systemPrompt: [
          '你是 Sane333 的 NPC 主页生成器。',
          '你要为绑定角色生成关联人物的「主页档案」：姓名、身份、性格、关系，以及主页签名、简介、兴趣与近况。',
          'NPC 必须绑定到指定角色，是该角色世界中真实存在的关联人物。',
          '不要复制绑定角色，不要抢夺用户主角位置。',
          '严格遵守用户指定的性别与关系类别。',
          '若用户只勾选了部分世界书条目，只根据这些条目生成，不要编造未勾选条目的内容。',
          count === 1
            ? '严格输出一个 JSON 对象，不要 Markdown。'
            : `严格输出长度为 ${count} 的 JSON 数组，每人一个对象，彼此姓名与人设必须不同，不要 Markdown。`,
        ].join('\n'),
        userPrompt: [
          '【必须绑定角色】' + boundCharacter.name + '（' + boundCharacter.id + '）',
          (() => { const persona = getActivePersona(); return persona ? '【用户人设】' + persona.name + (persona.setting ? '：' + persona.setting : '') + '；relationToMe 必须相对这位用户来写' : ''; })(),
          '【生成数量】' + count,
          '【生成要求】指定性别：' + genderChoice + '；关系分类：' + identityCategory + '；具体关系：' + (relationshipDetail.trim() || '根据角色档案合理决定') + '。',
          existingNames.length ? '【已有关联人物，避免重名】' + existingNames.join('、') : '',
          '【本次生成重点】\n' + buildFocus(source, project, selectedWorldbooks, boundCharacter, prompt.trim()),
          '【用户勾选的世界书条目】\n' + (selectedEntryLines.length
            ? selectedEntryLines.join('\n\n')
            : '未勾选条目，不要假设全局世界书已启用。'),
          '【跨 App 手机世界上下文】\n' + contextText,
          '【每个 NPC 的 JSON 字段】' + JSON.stringify({
            name: 'NPC姓名',
            gender: '性别',
            age: '年龄段',
            identity: '身份/职业',
            appearance: '外貌',
            personality: '性格',
            background: '完整背景',
            relationship: '与绑定角色的关系',
            relationToMe: '与用户本人的关系（一句话，如：用户的大学室友，单方面嫉妒用户；若无交集写陌生人）',
            relationshipCategory: 'family|friend|coworker|other',
            statusMessage: '主页个性签名（短）',
            bio: '主页简介（2～4句）',
            interests: ['兴趣'],
            recentLife: '最近在忙什么',
            tags: ['标签'],
            memory: 'NPC自己的重要记忆',
            canCommentMoments: true,
          }),
        ].filter(Boolean).join('\n\n'),
        temperature: 0.9,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanJson(raw));
      } catch {
        throw new Error('AI 返回格式不对，无法解析成 NPC，请再点一次生成');
      }
      const list = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, count);
      if (!list.length) throw new Error('没有解析到 NPC，请重试');

      const created = list.map((item, index) => parseNpcPayload(item, {
        genderChoice,
        identityCategory,
        source,
        boundCharacter,
        selectedWorldbooks,
        index,
      }));

      created.forEach(upsertNpc);
      setNpcs(prev => [...created, ...prev]);
      setPrompt('');
      setArchiveCharacterId(boundCharacter.id);
      setCategoryFilter(identityCategory);
      setSelectedId(created[0].id);
      setScreenMode(created.length === 1 ? 'npc-profile' : 'character-archive');
      notify(created.length === 1
        ? `已生成 ${created[0].name} 的主页 ✦`
        : `已批量生成 ${created.length} 份 NPC 主页 ✦`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'NPC 生成失败';
      notify(message.includes('AI_') || message.includes('fetch') || message.includes('network')
        ? '无法生成 NPC：' + message
        : message.startsWith('无法生成') ? message : '无法生成 NPC：' + message);
    } finally {
      setBusy(false);
    }
  };

  const editSelected = (patch: Partial<SaneNpc>) => {
    if (!selected) return;
    const updated = { ...selected, ...patch, updatedAt: new Date().toISOString() };
    upsertNpc(updated);
    setNpcs(prev => prev.map(item => item.id === updated.id ? updated : item));
  };

  const rebindSelected = (characterId: string) => {
    const character = characters.find(item => item.id === characterId);
    if (!selected || !character) return;
    editSelected({
      boundCharacterId: character.id,
      boundCharacterName: character.name,
      sourceCharacterId: character.id,
      sourceCharacterName: character.name,
    });
    setArchiveCharacterId(character.id);
  };

  const headerTitle =
    screenMode === 'generate' ? '生成 NPC 主页'
      : screenMode === 'manage' ? '管理 NPC'
        : screenMode === 'character-archive' ? (archiveCharacter?.name || '角色档案') + ' 的 NPC'
          : screenMode === 'npc-profile' ? (selected?.name || 'NPC 主页')
            : 'NPC';

  const headerSub =
    screenMode === 'generate' ? 'GENERATE · HOMEPAGE'
      : screenMode === 'manage' ? 'MANAGE · BY CHARACTER'
        : screenMode === 'character-archive' ? 'ARCHIVE · CHARACTER'
          : screenMode === 'npc-profile' ? 'PROFILE · HOMEPAGE'
            : 'WORLD PEOPLE · NPC';

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#f6f3ee] text-[#343538]">
      {/* 主页 */}
      {screenMode === 'home' && (
        <div className="absolute inset-0 z-30 overflow-y-auto px-5 pt-12 pb-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">WORLD PEOPLE · NPC</div>
              <h2 className="mt-2 font-serif font-bold text-2xl tracking-tight text-[#242323]">NPC</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[#817a72]">为角色生成关联人物主页，并按角色管理档案</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="w-8 h-8 shrink-0 rounded-full bg-white/70 border border-[#e6e1da] grid place-items-center text-[#242323]"
              aria-label="返回桌面"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => setScreenMode('generate')}
              className="w-full rounded-2xl border border-[rgba(40,36,31,.1)] bg-white/80 p-4 text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-serif font-bold text-[#302d29]">生成</span>
                <Wand2 className="w-4 h-4 text-[#8b7560]" />
              </div>
              <p className="mt-1 text-[10px] text-[#8b847d]">为选定角色生成 NPC 主页，支持批量</p>
              <div className="mt-3 text-[9px] text-[#8b7560]">可一次生成 1～8 人　→</div>
            </button>

            <button
              type="button"
              onClick={() => setScreenMode('manage')}
              className="w-full rounded-2xl border border-[rgba(40,36,31,.1)] bg-white/80 p-4 text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-serif font-bold text-[#302d29]">管理</span>
                <FolderOpen className="w-4 h-4 text-[#8b7560]" />
              </div>
              <p className="mt-1 text-[10px] text-[#8b847d]">按角色查看已生成的 NPC 档案</p>
              <div className="mt-3 text-[9px] text-[#8b7560]">
                {charactersWithNpcs.length} 个角色有档案 · {activeCount} 人活跃　→
              </div>
            </button>
          </div>

          <div className="mt-5 rounded-xl bg-white/50 border border-[rgba(40,36,31,.08)] p-3 text-[9px] leading-relaxed text-[#8b847d]">
            生成 = 产出 NPC 主页（签名、简介、近况等）。管理 = 按角色进入档案，再点开每个人的主页编辑。
          </div>
        </div>
      )}

      {/* 子页顶栏 */}
      {screenMode !== 'home' && (
        <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[#ece9e5] bg-white/90 backdrop-blur flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBack}
              className="w-8 h-8 rounded-full border border-[#e6e3df] grid place-items-center text-[#555] hover:bg-[#faf8f5] shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[8px] font-mono tracking-[2px] text-[#9b958f]">{headerSub}</div>
              <h2 className="font-serif font-bold text-base text-[#242323] truncate">{headerTitle}</h2>
            </div>
          </div>
          <div className="text-[9px] font-mono text-[#8b7560] border border-[#dfd5ca] px-2 py-1 rounded-full shrink-0">
            {activeCount} ACTIVE
          </div>
        </div>
      )}

      {screenMode !== 'home' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {/* 生成 */}
          {screenMode === 'generate' && (
            <section className="p-3.5 rounded-[18px] bg-white border border-[#e8e2d9] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#a27762]" />
                  <span className="text-[10px] font-semibold">生成 NPC 主页</span>
                </div>
                <span className="text-[8px] text-[#8e606b]">必须绑定角色</span>
              </div>
              <div className="text-[9px] text-[#8b817a]">选角色 → 设关系与数量 → 生成主页档案。</div>

              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {characters.map(character => (
                  <button
                    key={character.id}
                    onClick={() => {
                      setBoundCharacterId(character.id);
                      setSelectedEntryKeys([]);
                      setExpandedBooks([]);
                    }}
                    className={boundCharacterId === character.id
                      ? 'shrink-0 w-[68px] flex flex-col items-center gap-1 p-1 rounded-[13px] bg-[#f8edef] border border-[#d8b7be]'
                      : 'shrink-0 w-[68px] flex flex-col items-center gap-1 p-1 rounded-[13px] border border-transparent'}
                  >
                    {character.avatar
                      ? <img src={character.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-[#e4ddd7]" />
                      : <span className="w-10 h-10 rounded-full bg-[#efebe6] border border-[#e2ddd7] grid place-items-center"><UserRound className="w-4 h-4 text-[#9b958f]" /></span>}
                    <span className="w-full text-[9px] text-center truncate">{character.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-[11px] bg-[#faf8f5] border border-[#e7e2dc]">
                <Link2 className="w-3.5 h-3.5 text-[#9a6c78] shrink-0" />
                <select
                  value={boundCharacterId}
                  onChange={e => {
                    setBoundCharacterId(e.target.value);
                    setSelectedEntryKeys([]);
                    setExpandedBooks([]);
                  }}
                  className="flex-1 bg-transparent outline-none text-[10px] text-[#444]"
                >
                  <option value="">先选择角色…</option>
                  {characters.map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="text-[9px] text-[#777] space-y-1">
                  <span className="block">性别</span>
                  <select value={genderChoice} onChange={e => setGenderChoice(e.target.value)} className="w-full p-2 rounded-[9px] border border-[#e7e2dc] bg-white text-[10px]">
                    <option>随机</option><option>男</option><option>女</option><option>非二元</option>
                  </select>
                </label>
                <label className="text-[9px] text-[#777] space-y-1">
                  <span className="block">关系分类</span>
                  <select value={identityCategory} onChange={e => setIdentityCategory(e.target.value as RelCategory)} className="w-full p-2 rounded-[9px] border border-[#e7e2dc] bg-white text-[10px]">
                    <option value="friend">朋友</option>
                    <option value="family">家人</option>
                    <option value="coworker">同事</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label className="text-[9px] text-[#777] space-y-1">
                  <span className="block">批量数量</span>
                  <select value={batchCount} onChange={e => setBatchCount(Number(e.target.value))} className="w-full p-2 rounded-[9px] border border-[#e7e2dc] bg-white text-[10px]">
                    {[1, 2, 3, 4, 5, 6, 8].map(n => (
                      <option key={n} value={n}>{n === 1 ? '1 人' : `${n} 人`}</option>
                    ))}
                  </select>
                </label>
              </div>

              <input
                value={relationshipDetail}
                onChange={e => setRelationshipDetail(e.target.value)}
                placeholder="具体关系（选填，如：童年好友、表姐、经纪人）"
                className="w-full p-2.5 rounded-[10px] border border-[#e7e2dc] bg-white text-[10px] outline-none"
              />

              <div className="rounded-[12px] border border-[#e7e2dc] bg-[#faf8f5] p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold">参考世界书条目</span>
                  <span className="text-[8px] text-[#999]">
                    {selectedEntryKeys.length ? `已选 ${selectedEntryKeys.length} 条` : '点开书勾选条目'}
                  </span>
                </div>
                {worldbookGroups.length === 0 ? (
                  <div className="text-[9px] text-[#9a948e]">暂无世界书。可先去世界书 App 导入。</div>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-1.5 no-scrollbar">
                    {worldbookGroups.map(group => {
                      const entryKeys = group.entries.map(e => e.key);
                      const selectedCount = entryKeys.filter(k => selectedEntryKeys.includes(k)).length;
                      const expanded = expandedBooks.includes(group.bookKey);
                      const allSelected = entryKeys.length > 0 && selectedCount === entryKeys.length;
                      return (
                        <div key={group.bookKey} className="rounded-[8px] border border-[#ebe6e0] bg-white overflow-hidden">
                          <div className="flex items-center gap-1.5 p-1.5">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              disabled={!entryKeys.length}
                              onChange={e => {
                                setSelectedEntryKeys(prev => {
                                  if (e.target.checked) {
                                    return [...new Set([...prev, ...entryKeys])];
                                  }
                                  return prev.filter(k => !entryKeys.includes(k));
                                });
                                if (e.target.checked && !expanded) {
                                  setExpandedBooks(prev => [...prev, group.bookKey]);
                                }
                              }}
                              className="accent-[#a27783] shrink-0"
                              title="全选/取消本书条目"
                            />
                            <button
                              type="button"
                              onClick={() => setExpandedBooks(prev =>
                                prev.includes(group.bookKey)
                                  ? prev.filter(k => k !== group.bookKey)
                                  : [...prev, group.bookKey],
                              )}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block text-[10px] text-[#484440] truncate">{group.book.name}</span>
                              <span className="block text-[8px] text-[#a19a93]">
                                {group.origin} · {group.entries.length} 条
                                {selectedCount ? ` · 已选 ${selectedCount}` : ''}
                              </span>
                            </button>
                            <ChevronRight className={`w-3.5 h-3.5 text-[#c4bbb2] shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          </div>
                          {expanded && (
                            <div className="border-t border-[#f0ebe4] px-1.5 py-1 space-y-0.5">
                              {group.entries.length === 0 ? (
                                <div className="text-[8px] text-[#aaa] px-1 py-1">这本书没有启用中的条目</div>
                              ) : (
                                group.entries.map(option => (
                                  <label key={option.key} className="flex items-start gap-2 rounded-[6px] px-1.5 py-1 hover:bg-[#faf8f5] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedEntryKeys.includes(option.key)}
                                      onChange={e => setSelectedEntryKeys(prev =>
                                        e.target.checked
                                          ? [...prev, option.key]
                                          : prev.filter(id => id !== option.key),
                                      )}
                                      className="mt-0.5 accent-[#a27783]"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-[9.5px] text-[#484440] truncate">{option.entry.name || '未命名条目'}</span>
                                      <span className="block text-[8px] text-[#a19a93] line-clamp-2">
                                        {(option.entry.content || '').slice(0, 80) || '（无内容）'}
                                      </span>
                                    </span>
                                  </label>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-[8px] text-[#a19a93]">生成时只会用你勾选的条目，不会整本塞进提示词。</div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                {([['character', '角色 / 记忆'], ['worldbook', '世界书'], ['project', '项目设定']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSource(id)}
                    className={source === id
                      ? 'py-2 rounded-[10px] border bg-[#eadfe0] border-[#d5b8bd] text-[#8e606b]'
                      : 'py-2 rounded-[10px] border bg-white border-[#e9e5df] text-[#777]'}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="例如：生成会在书店偶遇 TA 的老店员，并有一段旧交"
                className="w-full h-16 p-2.5 bg-white border border-[#e7e2dc] rounded-[11px] text-[10px] outline-none resize-none"
              />

              <button
                onClick={createNpcs}
                disabled={busy || characters.length === 0}
                className="w-full py-2.5 rounded-[11px] bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {busy
                  ? (batchCount > 1 ? `正在批量生成 ${batchCount} 份主页…` : '正在生成主页…')
                  : characters.length === 0
                    ? '先导入一个角色'
                    : batchCount > 1
                      ? `批量生成 ${batchCount} 份 NPC 主页`
                      : '生成 NPC 主页'}
              </button>
            </section>
          )}

          {/* 管理：按角色 */}
          {screenMode === 'manage' && (
            <>
              <div className="text-[9px] text-[#8b817a] px-0.5">点进角色，查看该角色相关的全部 NPC 档案。</div>
              {charactersWithNpcs.length === 0 ? (
                <div className="py-12 text-center text-[#aaa] text-[10px] space-y-2">
                  <Users className="w-6 h-6 mx-auto text-[#cfc8c0]" />
                  <div>还没有生成任何 NPC</div>
                  <button
                    type="button"
                    onClick={() => setScreenMode('generate')}
                    className="text-[#8e606b] underline"
                  >
                    去生成 →
                  </button>
                </div>
              ) : (
                charactersWithNpcs.map(({ character, related, active }) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => openCharacterArchive(character.id)}
                    className="w-full text-left p-3.5 rounded-[17px] border border-[#ece8e2] bg-white hover:bg-[#faf8f5] flex items-center gap-3"
                  >
                    {character.avatar
                      ? <img src={character.avatar} alt="" className="w-11 h-11 rounded-full object-cover border border-[#e4ddd7] shrink-0" />
                      : <span className="w-11 h-11 rounded-full bg-[#efebe6] border border-[#e2ddd7] grid place-items-center shrink-0"><UserRound className="w-4 h-4 text-[#9b958f]" /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-[#302e2c] truncate">{character.name}</div>
                      <div className="text-[9px] text-[#9a948e] mt-0.5">{related.length} 位 NPC · {active} 活跃</div>
                      <div className="text-[8px] text-[#b0a8a0] mt-1 truncate">
                        {related.slice(0, 4).map(n => n.name).join(' · ')}
                        {related.length > 4 ? ' …' : ''}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#c4bbb2] shrink-0" />
                  </button>
                ))
              )}
              {orphanNpcs.length > 0 && (
                <div className="pt-2 space-y-2">
                  <div className="text-[9px] text-[#b36b68]">绑定角色已不存在的 NPC（{orphanNpcs.length}）</div>
                  {orphanNpcs.map(npc => (
                    <button
                      key={npc.id}
                      type="button"
                      onClick={() => openNpcProfile(npc.id)}
                      className="w-full text-left p-3 rounded-[14px] border border-[#f0dfe3] bg-[#fcf6f7] text-[10px]"
                    >
                      {npc.name} · 原绑定 {npc.boundCharacterName || '未知'}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 角色 NPC 档案列表 */}
          {screenMode === 'character-archive' && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-[16px] bg-white border border-[#e8e2d9]">
                {archiveCharacter?.avatar
                  ? <img src={archiveCharacter.avatar} alt="" className="w-12 h-12 rounded-full object-cover border border-[#e4ddd7]" />
                  : <span className="w-12 h-12 rounded-full bg-[#efebe6] grid place-items-center"><UserRound className="w-5 h-5 text-[#9b958f]" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{archiveCharacter?.name || '角色'}</div>
                  <div className="text-[9px] text-[#9a948e] mt-0.5">关联 NPC 档案 · {archiveNpcs.length} 位</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBoundCharacterId(archiveCharacterId);
                    setScreenMode('generate');
                  }}
                  className="shrink-0 px-2.5 py-1.5 rounded-full bg-[#292724] text-white text-[9px] flex items-center gap-1"
                >
                  <Wand2 className="w-3 h-3" />再生成
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {([['all', '全部'], ['family', '家人'], ['friend', '朋友'], ['coworker', '同事'], ['other', '其他']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCategoryFilter(key)}
                    className={categoryFilter === key
                      ? 'py-2 rounded-[9px] bg-[#eadfe0] border border-[#d5b8bd] text-[#8e606b] text-[9px]'
                      : 'py-2 rounded-[9px] bg-white border border-[#e9e5df] text-[#777] text-[9px]'}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {visibleArchiveNpcs.length === 0 ? (
                <div className="py-10 text-center text-[#aaa] text-[10px]">
                  这个分类还没有 NPC。<br />可以为 {archiveCharacter?.name || 'TA'} 生成一位。
                </div>
              ) : (
                visibleArchiveNpcs.map(npc => (
                  <button
                    key={npc.id}
                    type="button"
                    onClick={() => openNpcProfile(npc.id)}
                    className="w-full text-left p-3.5 rounded-[17px] border border-[#ece8e2] bg-white hover:bg-[#faf8f5]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-2.5 min-w-0">
                        <NpcAvatar name={npc.name} avatar={npc.avatar} className="w-10 h-10 rounded-full border border-[#e2ddd7] shrink-0 overflow-hidden text-[15px]" />
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-[#302e2c] truncate">{npc.name}</div>
                          <div className="text-[9px] text-[#9a948e] truncate mt-0.5">{npc.identity}</div>
                          <div className="text-[9px] text-[#8c6a72] mt-1 truncate">
                            {CATEGORY_LABEL[inferCategory(npc)]} · {npc.statusMessage || npc.relationship || '未写签名'}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#faf1f3] border border-[#f0dfe3] text-[#9a6c78]">
                          {npc.active ? '活跃' : '暂停'}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#c4bbb2]" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {/* NPC 主页详情 */}
          {screenMode === 'npc-profile' && selected && (
            <section className="space-y-3">
              <div className="rounded-[20px] overflow-hidden border border-[#e8e2d9] bg-white">
                <div className="h-20 bg-gradient-to-br from-[#e8dfd4] via-[#f0e6e8] to-[#ddd6ce]" />
                <div className="px-4 pb-4 -mt-8">
                  <div className="flex items-end gap-3">
                    <NpcAvatar name={selected.name} avatar={selected.avatar} className="w-16 h-16 rounded-full border-4 border-white shadow-sm overflow-hidden text-2xl" />
                    <div className="pb-1 flex items-center gap-2">
                      <label className="px-2.5 py-1.5 rounded-full bg-[#292724] text-white text-[9px] cursor-pointer">
                        上传头像
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            if (file.size > 8 * 1024 * 1024) { notify('图片太大，请选 8MB 以内的'); event.currentTarget.value = ''; return; }
                            const reader = new FileReader();
                            reader.onload = async () => {
                              try {
                                const dataUrl = String(reader.result || '');
                                if (!dataUrl) return;
                                const id = await putMedia(dataUrl);
                                editSelected({ avatar: 'media:' + id });
                                notify('头像已更新');
                              } catch { notify('头像保存失败'); }
                            };
                            reader.onerror = () => notify('头像读取失败');
                            reader.readAsDataURL(file);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {selected.avatar && (
                        <button type="button" onClick={() => { editSelected({ avatar: '' }); notify('已恢复首字头像'); }} className="px-2.5 py-1.5 rounded-full bg-[#f1efeb] text-[#777] text-[9px]">
                          移除
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <input
                        value={selected.name}
                        onChange={e => editSelected({ name: e.target.value })}
                        className="w-full font-serif font-bold text-lg text-[#242323] bg-transparent outline-none"
                      />
                      <input
                        value={selected.identity}
                        onChange={e => editSelected({ identity: e.target.value })}
                        className="w-full mt-0.5 text-[10px] text-[#8b817a] bg-transparent outline-none"
                        placeholder="身份 / 职业"
                      />
                      <input
                        value={selected.relationToMe || ""}
                        onChange={e => editSelected({ relationToMe: e.target.value, relationToMeName: e.target.value.trim() ? (getActivePersona()?.name || "") : "" })}
                        className="w-full mt-0.5 text-[10px] text-[#8c6a72] bg-transparent outline-none"
                        placeholder="与我的人设关系（一句话，如：我的大学室友）"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!window.confirm(`确定删除 NPC「${selected.name}」吗？将同时从群聊和好友列表中移除。`)) return;
                        deleteNpc(selected.id);
                        removeNpcReferences(selected.id);
                        setNpcs(prev => prev.filter(item => item.id !== selected.id));
                        setSelectedId(null);
                        setScreenMode('character-archive');
                        notify('NPC 已移除');
                      }}
                      className="text-[#b36b68] p-1.5"
                      aria-label="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={selected.statusMessage || ''}
                    onChange={e => editSelected({ statusMessage: e.target.value })}
                    placeholder="个性签名"
                    className="w-full mt-2 p-2 rounded-[10px] bg-[#faf8f5] border border-[#ece8e2] text-[10px] outline-none"
                  />
                  <div className="mt-2 text-[9px] text-[#8c6a72]">
                    绑定角色：{selected.boundCharacterName || '未绑定'}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-[18px] bg-white border border-[#e8e4df] space-y-2.5">
                <div className="text-[10px] font-semibold">主页简介</div>
                <textarea
                  value={selected.bio || ''}
                  onChange={e => editSelected({ bio: e.target.value })}
                  className="w-full h-20 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="主页简介"
                />
                <div className="text-[10px] font-semibold">近况</div>
                <textarea
                  value={selected.recentLife || ''}
                  onChange={e => editSelected({ recentLife: e.target.value })}
                  className="w-full h-14 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="最近在忙什么"
                />
                <div className="text-[10px] font-semibold">兴趣（逗号分隔）</div>
                <input
                  value={(selected.interests || []).join('，')}
                  onChange={e => editSelected({
                    interests: e.target.value.split(/[,，]/).map(v => v.trim()).filter(Boolean),
                  })}
                  className="w-full p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none"
                  placeholder="咖啡，旧书，夜跑"
                />
              </div>

              <div className="p-3.5 rounded-[18px] bg-white border border-[#e8e4df] space-y-2.5">
                <div className="text-[10px] font-semibold">人物设定</div>
                <select
                  value={selected.boundCharacterId || ''}
                  onChange={e => rebindSelected(e.target.value)}
                  className="w-full p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none"
                >
                  <option value="">选择绑定角色</option>
                  {characters.map(character => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
                <textarea
                  value={selected.personality}
                  onChange={e => editSelected({ personality: e.target.value })}
                  className="w-full h-16 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="性格"
                />
                <textarea
                  value={selected.background}
                  onChange={e => editSelected({ background: e.target.value })}
                  className="w-full h-20 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="背景"
                />
                <textarea
                  value={selected.relationship}
                  onChange={e => editSelected({ relationship: e.target.value })}
                  className="w-full h-14 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="与绑定角色的关系"
                />
                <textarea
                  value={selected.appearance || ''}
                  onChange={e => editSelected({ appearance: e.target.value })}
                  className="w-full h-14 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="外貌"
                />
                <textarea
                  value={selected.memory || ''}
                  onChange={e => editSelected({ memory: e.target.value })}
                  className="w-full h-14 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none"
                  placeholder="NPC 记忆"
                />

                <div className="flex items-center justify-between py-1">
                  <span className="text-[9px] text-[#777]">朋友圈评论</span>
                  <button
                    onClick={() => editSelected({ canCommentMoments: selected.canCommentMoments === false })}
                    className="text-[9px] font-mono text-[#956a74]"
                  >
                    {selected.canCommentMoments !== false ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[9px] text-[#777]">朋友圈发帖</span>
                  <button
                    onClick={() => editSelected({ canPostMoments: selected.canPostMoments === false })}
                    className="text-[9px] font-mono text-[#956a74]"
                  >
                    {selected.canPostMoments !== false ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[9px] text-[#777]">人物活跃</span>
                  <button
                    onClick={() => editSelected({ active: !selected.active })}
                    className="text-[9px] font-mono text-[#956a74] flex items-center gap-1"
                  >
                    {selected.active ? <><Play className="w-3 h-3" />ACTIVE</> : <><Pause className="w-3 h-3" />PAUSED</>}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {notice && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 bg-[#292724] text-white px-3 py-2 rounded-full text-[9px] z-40">
          {notice}
        </div>
      )}
    </div>
  );
}
