import { useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarClock, Check, ChevronRight, MapPin, Play, Plus, Send,
  Sparkles, Trash2, UserRound, Settings2, Download, Upload, GitBranch, Palette, BookOpen, Brain, X
} from 'lucide-react';
import type { OfflineEvent, ScreenType } from '../../types';
import { getOfflineEvents, updateOfflineEvent, upsertOfflineEvent, deleteOfflineEvent } from '../../store/offlineEvents';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import type { WorldBook } from '../../types';
import { getProjectManifest } from '../../store/projectManifest';
import { getCharacterMemory, addRecentMemorySummary } from '../../store/characterMemory';
import { getCharacterProfile } from '../../data/characterProfiles';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import { setCurrentScene, setCharacterRuntime } from '../../store/worldRuntime';
import { emitWorldEvent } from '../../store/worldRuntime';
import { recordOfflineEventInLine } from '../../store/lineRuntime';
import { getCotForTarget } from '../../store/cotPresets';
import { buildPromptPresetInstructions } from '../../store/promptPresets';
import { getOfflinePersonas, getOfflineStyle, saveOfflineStyle, exportOfflineEvent, importOfflineEvent, cloneOfflineBranch, type OfflinePersona, type OfflineStyleSettings } from '../../store/offlineStory';

const statusLabel: Record<OfflineEvent['status'], string> = {
  draft: '草稿',
  pending: '待确认',
  accepted: '已赴约',
  declined: '已暂缓',
  'in-progress': '剧情进行中',
  completed: '已完成',
};

function nowIso() {
  return new Date().toISOString();
}

export function OfflineStoryScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [events, setEvents] = usePersistentState<OfflineEvent[]>('phone:offline-events-cache', getOfflineEvents());
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [actionText, setActionText] = useState('');
  const [notice, setNotice] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<'session' | 'beauty' | 'data'>('session');
  const [personas, setPersonas] = useState<OfflinePersona[]>(getOfflinePersonas());
  const [style, setStyle] = useState<OfflineStyleSettings>(getOfflineStyle());

  const selected = events.find(event => event.id === selectedId) || null;
  const activeEvents = useMemo(
    () => events.filter(event => ['pending', 'accepted', 'in-progress'].includes(event.status)),
    [events],
  );

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2000);
  };

  const sync = () => setEvents(getOfflineEvents());

  const getCharacterForEvent = (event: OfflineEvent) => {
    return characters.find(character => character.id === event.characterId)
      || characters.find(character => character.name === event.characterName)
      || null;
  };

  const patchEvent = (patch: Partial<OfflineEvent>) => {
    if (!selected) return;
    const updated = updateOfflineEvent(selected.id, { ...patch, updatedAt: nowIso() });
    if (updated) setEvents(getOfflineEvents());
  };

  const createDraft = () => {
    const defaultCharacter = characters[0];
    const event: OfflineEvent = {
      id: 'offline-' + Date.now(),
      characterId: defaultCharacter?.id || 'unassigned',
      characterName: defaultCharacter?.name || '未指定角色',
      title: '新的线下剧情',
      location: '待设置地点',
      time: '待设置时间',
      theme: '未定主题',
      letter: '写下这次相遇为什么值得发生……',
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      sceneLog: [],
      worldBookIds: worldbooks.filter(book => book.enabled).map(book => book.id),
      personaId: personas[0]?.id,
      cotPresetId: getCotForTarget('offline')?.id,
      branchId: 'branch-root-' + Date.now(),
      branchName: '主线',
    };
    upsertOfflineEvent(event);
    sync();
    setSelectedId(event.id);
  };

  const acceptInvite = (event: OfflineEvent) => {
    const updated = updateOfflineEvent(event.id, { status: 'accepted', updatedAt: nowIso() });
    if (updated) {
      recordOfflineEventInLine(updated);
      emitWorldEvent('offline.accepted', {
        characterId: updated.characterId,
        characterName: updated.characterName,
        data: { offlineEventId: updated.id, status: updated.status },
      });
    }
    sync();
    notify('已接受邀约，可以开始这条线下剧情');
  };

  const startScene = async (event: OfflineEvent) => {
    if (!event.characterId || event.characterId === 'unassigned') {
      notify('请先为剧情选择一个角色');
      return;
    }

    setSelectedId(event.id);
    setSceneBusy(true);
    const character = getCharacterForEvent(event);
    const profile = getCharacterProfile(character?.name || event.characterName);
    const memory = character ? getCharacterMemory(character.id, character.name) : null;
    const project = getProjectManifest();
    const settings = readStoredAiSettings();
    const presetInstructions = buildPromptPresetInstructions('offline');
    const selectedBooks = worldbooks.filter(book => event.worldBookIds?.length ? event.worldBookIds.includes(book.id) : book.enabled);
    const persona = personas.find(item => item.id === event.personaId);

    try {
      const systemPrompt = [
        '你是一个沉浸式线下剧情引擎。',
        '你需要把即时通讯中的线下邀约，真正变成一个可以持续玩的场景。',
        '输出环境、角色当前可观察的状态、角色说的话和自然的现场细节。',
        '绝对不要替用户说话、替用户行动、替用户决定情绪或选择。',
        '不要写成游戏规则说明，不要输出选择菜单，保持文学化但可继续互动的节奏。',
        '',
        '【项目】',
        project.name + ' · ' + project.genre,
        project.tone,
        project.globalPrompt,
        '',
        '【角色】',
        character ? [
          '姓名：' + character.name,
          '描述：' + character.description,
          '性格：' + character.personality,
          '场景：' + character.scenario,
          '开场习惯：' + character.firstMessage,
        ].join('\n') : '角色档案：' + profile.nickname + '；关系：' + profile.relationship,
        '',
        memory ? [
          '【长期记忆】',
          memory.summary,
          ...memory.items.slice(0, 12).map(item => '- ' + item.content),
        ].join('\n') : '【长期记忆】无。',
        '',
        '【当前 Persona】',
        persona ? [persona.name, persona.title || '', persona.bio || ''].filter(Boolean).join('\n') : '未指定 Persona。',
        '',
        '【世界书】',
        selectedBooks.flatMap(book => book.entries.filter(entry => entry.enabled).slice(0, 10).map(entry => '- ' + entry.name + ': ' + entry.content)).join('\n') || '无。',
        '',
        presetInstructions,
        event.authorNote ? '【Author\'s Note】\n' + event.authorNote : '',
        event.systemPrompt ? '【本剧情 System Prompt】\n' + event.systemPrompt : '',
      ].join('\n');

      const prompt = [
        '现在开始线下剧情。',
        '时间：' + event.time,
        '地点：' + event.location,
        '主题：' + event.theme,
        '邀约信：' + event.letter,
        event.openingGreeting ? '【本次选择的角色卡开场白】\n' + event.openingGreeting : '【本次开场白】不使用角色卡开场白，只依据当前场景开始。',
        '',
        '请写出这一幕的正式开场。让角色先出现，并给用户留下明确的可回应空间。',
      ].join('\n');

      const text = await generateCreativeText({
        settings,
        systemPrompt,
        userPrompt: prompt,
        temperature: settings.temperature,
      });

      const updated = updateOfflineEvent(event.id, {
        status: 'in-progress',
        sceneIntro: text,
        sceneLog: [{ id: 'scene-' + Date.now(), speaker: 'narrator', text, createdAt: nowIso() }],
        updatedAt: nowIso(),
      });
      if (updated) {
        addRecentMemorySummary(updated.characterId, updated.characterName, `线下剧情开始：${updated.title} · ${updated.location} · ${updated.theme}`, { source: 'offline', importance: 65 });
        recordOfflineEventInLine(updated);
        emitWorldEvent('offline.started', {
          characterId: updated.characterId,
          characterName: updated.characterName,
          data: { offlineEventId: updated.id, status: updated.status },
        });
        setEvents(getOfflineEvents());
        setCurrentScene(event.id);
        setCharacterRuntime(event.characterId, {
          location: event.location,
          activity: '正在与你见面',
          mood: '在等你',
          lastInteractionAt: nowIso(),
        }, event.characterName);
      }
      notify('线下场景已生成');
    } catch (error) {
      notify(error instanceof Error ? error.message : '线下场景生成失败');
    } finally {
      setSceneBusy(false);
    }
  };

  const continueScene = async () => {
    if (!selected || !actionText.trim() || sceneBusy) return;
    const character = getCharacterForEvent(selected);
    const profile = getCharacterProfile(character?.name || selected.characterName);
    const memory = character ? getCharacterMemory(character.id, character.name) : null;
    const project = getProjectManifest();
    const settings = readStoredAiSettings();
    const presetInstructions = buildPromptPresetInstructions('offline');
    const selectedBooks = worldbooks.filter(book => selected.worldBookIds?.length ? selected.worldBookIds.includes(book.id) : book.enabled);
    const persona = personas.find(item => item.id === selected.personaId);

    setSceneBusy(true);
    const history = (selected.sceneLog || []).map(item => ({
      role: item.speaker === 'me' ? 'user' as const : 'assistant' as const,
      content: item.text,
    }));

    try {
      const systemPrompt = [
        '继续一条沉浸式线下剧情。',
        '绝对不能替用户说话或替用户做出未明确的动作、决定和感受。',
        '你只负责环境变化、NPC/角色反应和角色台词。',
        '保持地点、时间、人物关系、长期记忆和世界书连续。',
        '',
        '【项目】' + project.name + ' / ' + project.tone,
        character ? '【角色】' + character.name + '\n' + character.description + '\n' + character.personality + '\n' + character.scenario : '【角色】' + profile.nickname,
        memory ? '【长期记忆】' + memory.summary + '\n' + memory.items.slice(0, 12).map(item => '- ' + item.content).join('\n') : '【长期记忆】无。',
        persona ? '【当前 Persona】\n' + [persona.name, persona.title || '', persona.bio || ''].filter(Boolean).join('\n') : '',
        selectedBooks.flatMap(book => book.entries.filter(entry => entry.enabled).slice(0, 10).map(entry => '- ' + entry.name + ': ' + entry.content)).join('\n') || '【世界书】无。',
        presetInstructions,
        selected.authorNote ? '【Author\'s Note】\n' + selected.authorNote : '',
        selected.systemPrompt ? '【本剧情 System Prompt】\n' + selected.systemPrompt : '',
      ].join('\n');

      const userText = actionText.trim();
      const generated = await generateCreativeText({
        settings,
        systemPrompt,
        history,
        userPrompt: '用户刚刚在现场做了 / 说了：\n' + userText + '\n\n请自然继续这一幕，给用户留下下一步回应空间。',
        temperature: settings.temperature,
      });

      updateOfflineEvent(selected.id, {
        status: 'in-progress',
        sceneLog: [
          ...(selected.sceneLog || []),
          { id: 'me-' + Date.now(), speaker: 'me', text: userText, createdAt: nowIso() },
          { id: 'role-' + Date.now(), speaker: 'role', text: generated, createdAt: nowIso() },
        ],
        updatedAt: nowIso(),
      });
      addRecentMemorySummary(selected.characterId, selected.characterName, '线下剧情互动：用户：' + userText.slice(0, 240) + '；角色：' + generated.slice(0, 420), { source: 'offline', importance: 60 });
      sync();
      setActionText('');
    } catch (error) {
      notify(error instanceof Error ? error.message : '剧情继续失败');
    } finally {
      setSceneBusy(false);
    }
  };

  const completeScene = () => {
    if (!selected) return;
    const completed = updateOfflineEvent(selected.id, { status: 'completed', updatedAt: nowIso() });
    if (completed) {
      recordOfflineEventInLine(completed);
      emitWorldEvent('offline.completed', {
        characterId: completed.characterId,
        characterName: completed.characterName,
        data: { offlineEventId: completed.id, status: completed.status },
      });
    }
    setCurrentScene(null);
    setCharacterRuntime(selected.characterId, { activity: '刚结束一次见面' }, selected.characterName);
    sync();
    notify('这一幕已存档');
  };

  const removeEvent = () => {
    if (!selected || !window.confirm('删除这条线下剧情存档？')) return;
    deleteOfflineEvent(selected.id);
    sync();
    setSelectedId(null);
    notify('剧情存档已删除');
  };

  const createBranch = () => {
    if (!selected || !selected.sceneLog?.length) return notify('先进入剧情，再从当前位置创建分支');
    const branch = cloneOfflineBranch(selected);
    upsertOfflineEvent(branch);
    sync();
    setSelectedId(branch.id);
    notify('已创建剧情分支');
  };
  const handleExport = () => {
    if (!selected) return;
    const url = URL.createObjectURL(new Blob([exportOfflineEvent(selected)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = (selected.title || 'offline-story') + '.json'; a.click(); URL.revokeObjectURL(url);
  };
  const handleImport = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const event = importOfflineEvent(String(reader.result || '')); upsertOfflineEvent(event); sync(); setSelectedId(event.id); notify('剧情已导入'); } catch (error) { notify(error instanceof Error ? error.message : '导入失败'); } };
    reader.readAsText(file);
  };
  const saveStyle = (patch: Partial<OfflineStyleSettings>) => { const next = { ...style, ...patch }; setStyle(next); saveOfflineStyle(patch); };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.88)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center text-[#242323] shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">OFFLINE STORY · SCENE ENGINE</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">线下剧情 · Story</h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setManagementOpen(true)} className="w-8 h-8 rounded-full bg-white/55 border border-black/5 grid place-items-center text-[#5e5852]"><Settings2 className="w-3.5 h-3.5" /></button>
          <button onClick={createDraft} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center">
          <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {selected && (selected.status === 'in-progress' || selected.status === 'completed') && (
        <div className="relative z-10 flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-black/5 bg-white/35">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedId(null)} className="text-[9px] text-[#8b7560]">← 返回剧情库</button>
              <div className="flex gap-1">
                <button onClick={createBranch} className="px-2 py-1 rounded-full bg-white/60 border border-black/5 text-[8px]"><GitBranch className="w-3 h-3 inline mr-1" />分支</button>
                <button onClick={() => setManagementOpen(true)} className="px-2 py-1 rounded-full bg-white/60 border border-black/5 text-[8px]"><Settings2 className="w-3 h-3 inline mr-1" />管理</button>
              </div>
            </div>
            <div className="mt-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">NOW PLAYING</div>
                <h3 className="mt-1 font-serif font-bold text-lg text-[#242323]">{selected.title}</h3>
                <div className="mt-1 text-[9px] text-[#7a736b]">{selected.characterName} · {selected.location} · {selected.time}</div>
              </div>
              <span className="px-2 py-1 rounded-full bg-[#eee9df] text-[8px] font-mono text-[#8b7560]">{statusLabel[selected.status]}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3" style={{ fontSize: style.fontSize, lineHeight: style.lineHeight }}>
            {(selected.sceneLog || []).map(item => (
              <div key={item.id} className={item.speaker === 'me' ? 'flex justify-end' : item.speaker === 'role' ? 'flex justify-start' : 'flex justify-center'}>
                <div className={
                  item.speaker === 'me'
                    ? 'max-w-[80%] rounded-2xl bg-[#292724] text-white px-3 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap'
                    : item.speaker === 'role'
                    ? 'max-w-[86%] rounded-2xl bg-white/72 border border-[rgba(40,36,31,.1)] px-3.5 py-3 text-[11px] leading-[1.8] text-[#423d38] whitespace-pre-wrap font-serif-sc'
                    : 'w-full rounded-2xl bg-[#ebe7df]/70 border border-black/5 px-3.5 py-3 text-[11px] leading-[1.9] text-[#4d4741] whitespace-pre-wrap font-serif-sc'
                }>
                  {item.text}
                </div>
              </div>
            ))}

            {sceneBusy && (
              <div className="flex items-center justify-center py-3 text-[9px] font-mono text-[#8b8782]">
                <Sparkles className="w-3 h-3 mr-1.5 animate-pulse" /> SCENE ENGINE · GENERATING
              </div>
            )}
          </div>

          <div className="relative z-10 p-3 border-t border-black/5 bg-[rgba(247,244,238,.88)] backdrop-blur-xl">
            <div className="flex gap-2">
              <textarea
                value={selected.status === 'completed' ? '' : actionText}
                disabled={selected.status === 'completed' || sceneBusy}
                onChange={e => setActionText(e.target.value)}
                placeholder={selected.status === 'completed' ? '本幕已完成 · 可回到剧情库继续管理' : '写下你此刻说的话 / 做的动作……'}
                className="flex-1 min-h-[44px] max-h-[100px] bg-white/70 border border-black/5 rounded-2xl px-3 py-2 text-[10.5px] outline-none resize-none"
              />
              <button
                onClick={continueScene}
                disabled={selected.status === 'completed' || sceneBusy || !actionText.trim()}
                className="w-11 rounded-2xl bg-[#292724] text-white disabled:opacity-30 grid place-items-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <button onClick={completeScene} disabled={selected.status === 'completed'} className="mt-2 w-full py-2 rounded-xl bg-[#ebe7df] border border-black/5 text-[9px] text-[#5d5751] disabled:opacity-40">
              <Check className="w-3 h-3 inline mr-1" />结束本幕并存档
            </button>
            {selected.status === 'completed' && (
              <button onClick={() => onNavigate('chat')} className="mt-2 w-full py-2 rounded-xl bg-white/70 border border-black/5 text-[9px] text-[#8b7560]">
                回到 LINE · 留下这次见面的记录
              </button>
            )}
          </div>
        </div>
      )}

      {selected && !['in-progress', 'completed'].includes(selected.status) && (
        <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-4">
          <button onClick={() => setSelectedId(null)} className="text-[9px] text-[#8b7560]">← 返回剧情库</button>
          <section className="mt-3 p-4 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.13)] space-y-2.5">
            <div className="flex items-center gap-2"><UserRound className="w-4 h-4 text-[#8b7560]" /><span className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">SCENE SETUP</span></div>
            <label className="block text-[9px] text-[#7e7770]">角色
              <select value={selected.characterId} onChange={e => {
                const c = characters.find(item => item.id === e.target.value);
                patchEvent({ characterId: e.target.value, characterName: c?.name || '未指定角色' });
              }} className="w-full mt-1 bg-white/70 rounded-xl p-2.5 text-xs outline-none">
                <option value="unassigned">选择角色</option>
                {characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
            </label>
            {(() => {
              const character = characters.find(item => item.id === selected.characterId);
              const greetings = character ? [character.firstMessage, ...character.alternateGreetings].filter(Boolean) : [];
              if (!character || !greetings.length) return null;
              const current = selected.openingGreeting || '';
              return (
                <div className="rounded-2xl bg-white/60 border border-[rgba(40,36,31,.08)] p-3">
                  <div className="text-[9px] text-[#7e7770]">角色卡开场白 · 选择这次故事的起点</div>
                  <div className="mt-2 space-y-1.5 max-h-[210px] overflow-y-auto">
                    <button onClick={() => patchEvent({ openingGreeting: undefined })} className={`w-full text-left rounded-xl p-2.5 border text-[9px] ${!current ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/70 border-[rgba(40,36,31,.1)] text-[#666]'}`}>不使用开场白</button>
                    {greetings.map((greeting, index) => (
                      <button key={index} onClick={() => patchEvent({ openingGreeting: greeting })} className={`w-full text-left rounded-xl p-2.5 border text-[9px] leading-5 ${current === greeting ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/70 border-[rgba(40,36,31,.1)] text-[#666]'}`}>
                        <span className="font-mono opacity-60">OPENING {index + 1}</span>
                        <div className="mt-1 whitespace-pre-wrap">{greeting}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {(['title', 'location', 'time', 'theme', 'letter'] as const).map(key => (
              <label key={key} className="block text-[9px] text-[#7e7770]">
                {key === 'title' ? '剧情标题' : key === 'location' ? '地点' : key === 'time' ? '时间' : key === 'theme' ? '主题' : '邀约 / 开场文字'}
                {key === 'letter' ? (
                  <textarea value={selected[key]} onChange={e => patchEvent({ [key]: e.target.value })} className="w-full mt-1 min-h-[80px] bg-white/70 rounded-xl p-2.5 text-[10.5px] outline-none resize-y" />
                ) : (
                  <input value={selected[key]} onChange={e => patchEvent({ [key]: e.target.value })} className="w-full mt-1 bg-white/70 rounded-xl p-2.5 text-xs outline-none" />
                )}
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {selected.status === 'pending' ? (
                <button onClick={() => acceptInvite(selected)} className="py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5" />接受邀约</button>
              ) : (
                <button onClick={() => startScene(selected)} disabled={sceneBusy} className="py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-40"><Play className="w-3.5 h-3.5" />生成线下场景</button>
              )}
              <button onClick={removeEvent} className="py-2.5 rounded-xl bg-white/65 border border-[rgba(40,36,31,.1)] text-[#9b625b] text-[10px] flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />删除存档</button>
            </div>
          </section>
        </div>
      )}

      {!selected && (
        <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
          <section className="p-4 rounded-2xl bg-white/65 border border-[rgba(40,36,31,.1)] overflow-hidden relative">
            <div className="absolute -right-8 -bottom-10 text-[90px] font-serif text-[#d4aab5]/10">STORY</div>
            <div className="relative text-[8px] font-mono tracking-[2px] text-[#aaa]">OFFLINE / SCENE ENGINE</div>
            <div className="relative mt-2 text-[17px] font-serif font-bold text-[#292724]">角色发来的邀约，现在真的可以走进去了。</div>
            <p className="relative mt-2 text-[10px] leading-relaxed text-[#817a72]">LINE 负责“邀约发生”，这里负责“见面发生什么”。角色卡、长期记忆、项目设定与 World Book 会一起进入线下场景。</p>
            <button onClick={() => onNavigate('chat')} className="relative mt-3 text-[10px] text-[#ae7e89]">← 去 LINE 看角色的邀约</button>
          </section>

          {activeEvents.map(event => (
            <button key={event.id} onClick={() => setSelectedId(event.id)} className="w-full text-left p-4 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.13)] shadow-xs hover:bg-[#e8e2d9] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">{statusLabel[event.status]}</span>
                <ChevronRight className="w-4 h-4 text-[#8b7560]" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#9b625b]" />
                <div className="min-w-0">
                  <div className="font-serif font-bold text-sm text-[#242323] truncate">{event.title}</div>
                  <div className="mt-1 text-[10px] text-[#746d66] truncate">{event.characterName} · {event.location}</div>
                </div>
              </div>
            </button>
          ))}

          {events.filter(event => !activeEvents.includes(event)).map(event => (
            <button key={event.id} onClick={() => setSelectedId(event.id)} className="w-full text-left p-4 rounded-2xl bg-white/50 border border-[rgba(40,36,31,.1)]">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-serif font-bold text-sm text-[#242323] truncate">{event.title}</div>
                  <div className="mt-1 text-[9px] text-[#8b8782] truncate">{event.characterName} · {statusLabel[event.status]}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#8b7560]" />
              </div>
            </button>
          ))}

          {!events.length && (
            <div className="h-[330px] rounded-2xl border border-dashed border-[rgba(40,36,31,.18)] bg-white/30 grid place-items-center text-center p-6 text-[#8b8782]">
              <div>
                <div className="text-3xl mb-2">✦</div>
                <div className="font-serif text-sm">还没有线下剧情存档。</div>
                <div className="mt-1 text-[9px]">先让角色在 LINE 发一个邀约，或者自己创建一条。</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">OFFLINE STORY ARCHIVE · PRIVATE DEVICE</div>
      {managementOpen && (
        <div className="absolute inset-0 z-[60] bg-black/20 backdrop-blur-[2px] flex items-end">
          <div className="w-full max-h-[82%] overflow-y-auto rounded-t-[26px] bg-[#f7f4ee] border-t border-black/10 shadow-2xl p-4">
            <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.5px] text-[#96908a]">OFFLINE / TAVERN</div><div className="mt-1 text-[15px] font-serif font-bold">管理</div></div><button onClick={() => setManagementOpen(false)} className="w-7 h-7 rounded-full bg-black/5 grid place-items-center"><X className="w-3.5 h-3.5" /></button></div>
            <div className="mt-3 flex gap-1.5">
              {([['session','剧情'],['beauty','美化'],['data','导入导出']] as const).map(([id,label]) => <button key={id} onClick={() => setManagementTab(id)} className={'flex-1 py-2 rounded-xl text-[9px] border ' + (managementTab===id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/60 text-[#716b64] border-black/5')}>{label}</button>)}
            </div>
            {managementTab === 'session' && selected && <div className="mt-3 space-y-2">
              <label className="block p-3 rounded-2xl bg-white/60 border border-black/5 text-[9px]">角色<select value={selected.characterId} onChange={e=>{const c=characters.find(x=>x.id===e.target.value);patchEvent({characterId:e.target.value,characterName:c?.name||'未指定角色'});}} className="w-full mt-1 bg-transparent text-xs outline-none">{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block p-3 rounded-2xl bg-white/60 border border-black/5 text-[9px]">用户身份<select value={selected.personaId||''} onChange={e=>patchEvent({personaId:e.target.value||undefined})} className="w-full mt-1 bg-transparent text-xs outline-none"><option value="">不指定</option>{personas.map(p=><option key={p.id} value={p.id}>{p.name}{p.title?' · '+p.title:''}</option>)}</select></label>
              <div className="p-3 rounded-2xl bg-white/60 border border-black/5"><div className="text-[9px] mb-2">世界书</div>{worldbooks.map(book=><label key={book.id} className="flex items-center justify-between text-[9px] py-1"><span>{book.name}</span><input type="checkbox" checked={selected.worldBookIds?.includes(book.id) ?? book.enabled} onChange={e=>{const ids=new Set(selected.worldBookIds?.length?selected.worldBookIds:worldbooks.filter(b=>b.enabled).map(b=>b.id));e.target.checked?ids.add(book.id):ids.delete(book.id);patchEvent({worldBookIds:[...ids]});}} /></label>)}<button onClick={()=>onNavigate('world-book')} className="mt-2 text-[9px] text-[#8b7560]">打开世界书管理 →</button></div>
              <label className="block p-3 rounded-2xl bg-white/60 border border-black/5 text-[9px]">Author's Note<textarea value={selected.authorNote||''} onChange={e=>patchEvent({authorNote:e.target.value})} className="w-full mt-1 h-16 bg-transparent outline-none resize-none text-[10px]" placeholder="当前剧情的短提示" /></label>
              <label className="block p-3 rounded-2xl bg-white/60 border border-black/5 text-[9px]">System Prompt<textarea value={selected.systemPrompt||''} onChange={e=>patchEvent({systemPrompt:e.target.value})} className="w-full mt-1 h-20 bg-transparent outline-none resize-none text-[10px]" placeholder="可选" /></label>
              <div className="p-3 rounded-2xl bg-white/60 border border-black/5 text-[9px]"><Brain className="w-3 h-3 inline mr-1" />预设流程：{buildPromptPresetInstructions('offline').split('\n')[2]?.replace('预设：','') || '默认预设'}<div className="mt-1 text-[#777]">直接使用「预设」App 中当前选定的线下剧情预设。</div></div>
            </div>}
            {managementTab === 'beauty' && <div className="mt-3 p-3 rounded-2xl bg-white/60 border border-black/5 space-y-3"><div className="text-[9px]"><Palette className="w-3 h-3 inline mr-1" />正文美化</div><label className="block text-[9px]">字号 <input type="range" min="10" max="16" step=".5" value={style.fontSize} onChange={e=>saveStyle({fontSize:Number(e.target.value)})} className="w-full" /></label><label className="block text-[9px]">行距 <input type="range" min="1.4" max="2.3" step=".05" value={style.lineHeight} onChange={e=>saveStyle({lineHeight:Number(e.target.value)})} className="w-full" /></label><label className="flex justify-between text-[9px]">显示头像<input type="checkbox" checked={style.showAvatars} onChange={e=>saveStyle({showAvatars:e.target.checked})} /></label><label className="flex justify-between text-[9px]">显示时间/元数据<input type="checkbox" checked={style.showMetadata} onChange={e=>saveStyle({showMetadata:e.target.checked})} /></label><label className="flex justify-between text-[9px]">紧凑正文<input type="checkbox" checked={style.compact} onChange={e=>saveStyle({compact:e.target.checked})} /></label></div>}
            {managementTab === 'data' && <div className="mt-3 space-y-2"><button onClick={handleExport} disabled={!selected} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-30"><Download className="w-3 h-3 inline mr-1" />导出当前剧情 JSON</button><label className="w-full py-2.5 rounded-xl bg-white/70 border border-black/5 text-center text-[9px] block cursor-pointer"><Upload className="w-3 h-3 inline mr-1" />导入剧情 JSON<input type="file" accept=".json" className="hidden" onChange={e=>handleImport(e.target.files?.[0])} /></label><div className="p-3 rounded-xl bg-white/50 border border-black/5 text-[9px] text-[#777]">世界书继续使用现有 World Book 的导入/导出。</div></div>}
          </div>
        </div>
      )}
      {notice && <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px] shadow-lg">{notice}</div>}
    </div>
  );
}
