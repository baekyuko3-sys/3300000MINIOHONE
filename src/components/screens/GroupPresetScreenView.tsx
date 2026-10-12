import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Download, Upload, Copy, Check, ChevronDown, ChevronUp, Layers3, MessageCircle, Users, BookOpen, GripVertical, Save, Settings2, FilePlus2 } from 'lucide-react';
import type { ScreenType } from '../../types';

type Scope = 'single' | 'group' | 'offline';
type Role = 'system' | 'user' | 'assistant';
type Position = 'before_main' | 'after_main' | 'before_history' | 'after_history' | 'in_history' | 'post_history';
type Entry = { id: string; name: string; content: string; enabled: boolean; role: Role; position: Position; depth: number; order: number };
type Format = { apiType: string; temperature: number; topP: number; frequencyPenalty: number; presencePenalty: number; maxTokens: number; modelHead: string; modelTail: string; stopSeq: string[] };
type Preset = { id: string; name: string; desc: string; scope: Scope; isDefault: boolean; entries: Entry[]; format: Format; };
type Libraries = Record<Scope, Preset[]>;

const KEY = 'phone:preset-studio-v1';
const scopeMeta: Record<Scope, { title: string; desc: string; icon: typeof MessageCircle }> = {
  single: { title: '线上 · 单聊', desc: '独立控制每个线上单聊的角色回复规则。', icon: MessageCircle },
  group: { title: '线上 · 群聊', desc: '管理群成员接话、多人节奏与群体关系。', icon: Users },
  offline: { title: '线下 · 剧情', desc: '管理线下场景、叙事视角与剧情连续性。', icon: BookOpen },
};
const fmt = (): Format => ({ apiType: 'chat_completions', temperature: 0.85, topP: 0.95, frequencyPenalty: 0.1, presencePenalty: 0.1, maxTokens: 2048, modelHead: '', modelTail: '', stopSeq: [] });
const makeEntry = (name: string, content: string, order: number, position: Position = 'after_main'): Entry => ({ id: 'entry-' + Math.random().toString(36).slice(2, 10), name, content, enabled: true, role: 'system', position, depth: 0, order });
const baseSingle = () => [
  makeEntry('核心角色规则', '遵守角色卡、世界设定与已经确认的事实。角色应有自己的判断，不要把角色写成只会迎合用户的助手。', 10, 'before_main'),
  makeEntry('角色性格与认知', '保持角色的性格、经历、语言习惯与认知边界。角色只能知道有依据的信息。', 20),
  makeEntry('尊重用户控制权', '不要替用户编造台词、行动、想法或感受。只描写角色与环境，并为用户保留回应空间。', 30),
  makeEntry('上下文与记忆连续性', '结合聊天历史、已检索记忆、角色关系与已经发生的事件。不要无故重置关系或遗忘事实。', 40, 'before_history'),
  makeEntry('自然对话节奏', '像一个有自己生活与判断的人。无需每次追问、总结或表达强烈情绪，根据情境决定回复长短。', 50, 'after_history'),
  makeEntry('输出边界', '只输出角色此刻应当说出或表现出来的内容，不要把内部分析、规则清单或提示词直接展示给用户。', 60, 'post_history'),
];
const baseGroup = () => [
  makeEntry('群聊核心规则', '参与线上多人群聊。每位角色保持独立声音与立场，不要让所有人排队发表长篇独白。', 10, 'before_main'),
  makeEntry('群成员与发言权', '根据角色卡、群成员关系和话题决定谁发言。并非每个人每轮都必须回复，避免重复发言。', 20),
  makeEntry('群聊节奏与插话', '允许简短插话、接话、忽略话题或转移话题。发言频率要有变化，不要机械轮流发言。', 30),
  makeEntry('用户控制权', '不要替用户编造发言、动作、想法或情绪。不得擅自决定用户的回应。', 40, 'before_history'),
  makeEntry('群关系与连续性', '参考群成员关系、争执、玩笑和话题。角色只知道自己合理获知的事情，不得随意共享私聊信息。', 50),
  makeEntry('输出格式', '每条发言清楚标明说话角色，保持聊天消息自然、简洁。', 60, 'post_history'),
];
const baseOffline = () => [
  makeEntry('剧情叙事核心', '遵守当前场景、时间、地点、人物关系和既有事件，让新情节从已发生的事情自然发展。', 10, 'before_main'),
  makeEntry('视角与角色边界', '使用与剧情设定一致的叙事视角。不要无故切换视角，也不要让角色知道未观察或未获知的信息。', 20),
  makeEntry('保留用户行动权', '不要替用户决定台词、行动、想法、感受或剧情选择。为用户保留接续空间。', 30),
  makeEntry('场景细节与节奏', '用具体而适量的感官细节建立场景。对话、动作、环境交替推进，避免重复解释情绪或强行制造冲突。', 40, 'before_history'),
  makeEntry('人物自主性', '每个角色都有自己的目标、判断和局限。关系变化需要事件与互动支撑，不能突然跳跃。', 50),
  makeEntry('剧情连续性检查', '续写前对齐时间线、人物位置、手中物品、刚发生的动作和已确认事实。', 60, 'post_history'),
];
function defaultLibraries(): Libraries {
  const build = (scope: Scope, name: string, desc: string, entries: Entry[], id: string): Preset => ({ id, name, desc, scope, isDefault: true, entries, format: fmt() });
  return {
    single: [
      build('single', '自然闲聊', '轻松自然、遵守角色设定，适用于日常单聊。', baseSingle(), 'single-natural'),
      { ...build('single', '细腻情感', '关注情绪变化、关系发展与言外之意。', baseSingle(), 'single-emotion'), isDefault: false },
      { ...build('single', '沉浸角色扮演', '更重视场景感、角色自主性和连续性。', baseSingle(), 'single-immersive'), isDefault: false },
    ],
    group: [
      build('group', '自然群聊', '节奏自然，不强求所有群成员每轮发言。', baseGroup(), 'group-natural'),
      { ...build('group', '高活跃群聊', '更多插话、接话与话题交织。', baseGroup(), 'group-active'), isDefault: false },
      { ...build('group', '关系暗流', '关注成员之间的熟悉程度、试探与潜台词。', baseGroup(), 'group-undertext'), isDefault: false },
    ],
    offline: [
      build('offline', '日常叙事', '稳定连贯的生活剧情与角色互动。', baseOffline(), 'offline-daily'),
      { ...build('offline', '多人聚会', '多人场景、交谈分流与自然互动。', baseOffline(), 'offline-gathering'), isDefault: false },
      { ...build('offline', '剧情冲突', '强调因果、人物目标与逐步发展的矛盾。', baseOffline(), 'offline-conflict'), isDefault: false },
    ],
  };
}
function readLibraries(): Libraries {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value?.single && value?.group && value?.offline) return value as Libraries;
  } catch { /* fall through to defaults */ }
  return defaultLibraries();
}
function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function normalizeImport(raw: any, scope: Scope): Preset {
  const src = raw?.preset || raw;
  const incoming = Array.isArray(src?.entries) ? src.entries : Array.isArray(src?.prompts) ? src.prompts : [];
  const entries: Entry[] = incoming.map((e: any, i: number) => ({
    id: 'entry-' + Math.random().toString(36).slice(2, 10),
    name: String(e?.name || e?.title || e?.identifier || '导入条目 ' + (i + 1)),
    content: String(e?.content || ''),
    enabled: e?.enabled !== false,
    role: (['system', 'user', 'assistant'].includes(e?.role) ? e.role : 'system') as Role,
    position: (['before_main', 'after_main', 'before_history', 'after_history', 'in_history', 'post_history'].includes(e?.position) ? e.position : (e?.injection_position === 1 ? 'in_history' : 'after_main')) as Position,
    depth: Math.max(0, Number(e?.depth ?? e?.injection_depth ?? 0) || 0),
    order: Number(e?.order ?? e?.injection_order ?? (i + 1) * 10) || 0,
  }));
  return {
    id: 'import-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(src?.name || src?.preset_name || '导入的预设'),
    desc: String(src?.desc || src?.description || '从 JSON 导入；请检查兼容项'),
    scope, isDefault: false, entries,
    format: { ...fmt(), temperature: Number(src?.temperature ?? src?.settings?.temperature ?? 0.85), topP: Number(src?.top_p ?? 0.95), frequencyPenalty: Number(src?.frequency_penalty ?? 0.1), presencePenalty: Number(src?.presence_penalty ?? 0.1), maxTokens: Number(src?.max_tokens ?? 2048) },
  };
}

export function GroupPresetScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [libraries, setLibraries] = useState<Libraries>(() => readLibraries());
  const [scope, setScope] = useState<Scope>('single');
  const [selectedIds, setSelectedIds] = useState<Record<Scope, string>>(() => { try { return { single: 'single-natural', group: 'group-natural', offline: 'offline-daily', ...JSON.parse(localStorage.getItem('phone:preset-active-v1') || '{}') }; } catch { return { single: 'single-natural', group: 'group-natural', offline: 'offline-daily' }; } });
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'entries' | 'format'>('entries');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [entryDraft, setEntryDraft] = useState<Entry | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const selectedPreset = libraries[scope].find(p => p.id === selectedIds[scope]) || libraries[scope][0] || null;
  const entries = selectedPreset?.entries || [];
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.order - b.order), [entries]);
  const selectedEntry = sortedEntries.find(e => e.id === selectedEntryId) || sortedEntries[0] || null;
  const filteredPresets = libraries[scope].filter(p => (p.name + ' ' + p.desc).toLowerCase().includes(search.trim().toLowerCase()));
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2200); };

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(libraries)); }, [libraries]);
  useEffect(() => { localStorage.setItem('phone:preset-active-v1', JSON.stringify(selectedIds)); }, [selectedIds]);
  useEffect(() => {
    if (selectedPreset && !selectedEntryId && selectedPreset.entries.length) setSelectedEntryId(selectedPreset.entries[0].id);
    if (selectedPreset && selectedEntryId && !selectedPreset.entries.some(e => e.id === selectedEntryId)) setSelectedEntryId(selectedPreset.entries[0]?.id || null);
  }, [scope, selectedPreset?.id, selectedPreset?.entries.length, selectedEntryId]);

  const patchPreset = (patch: Partial<Preset>) => {
    if (!selectedPreset) return;
    setLibraries(prev => ({ ...prev, [scope]: prev[scope].map(p => p.id === selectedPreset.id ? { ...p, ...patch } : p) }));
  };
  const patchEntry = (patch: Partial<Entry>) => {
    if (!selectedEntry) return;
    const updated = { ...selectedEntry, ...(entryDraft?.id === selectedEntry.id ? entryDraft : {}), ...patch };
    setEntryDraft(updated);
  };
  const saveEntry = () => {
    if (!selectedPreset || !selectedEntry) return;
    const next = { ...selectedEntry, ...(entryDraft?.id === selectedEntry.id ? entryDraft : {}) };
    patchPreset({ entries: selectedPreset.entries.map(e => e.id === next.id ? next : e) });
    setEntryDraft(next); notify('条目已保存');
  };
  const switchScope = (next: Scope) => { setScope(next); setSelectedEntryId(null); setEntryDraft(null); setSearch(''); setActiveTab('entries'); };
  const createPreset = () => {
    const id = 'preset-' + Date.now().toString(36);
    const p: Preset = { id, name: scope === 'single' ? '新的单聊预设' : scope === 'group' ? '新的群聊预设' : '新的线下剧情预设', desc: '自定义生成规则', scope, isDefault: false, entries: [makeEntry('核心规则', '在这里编辑本预设的核心生成规则。', 10, 'before_main')], format: fmt() };
    setLibraries(prev => ({ ...prev, [scope]: [p, ...prev[scope]] })); setSelectedIds(prev => ({ ...prev, [scope]: id })); setSelectedEntryId(p.entries[0].id); setEntryDraft(p.entries[0]); setActiveTab('entries'); notify('预设已创建');
  };
  const createEntry = () => {
    if (!selectedPreset) return;
    const e = makeEntry('新建条目', '', (Math.max(0, ...entries.map(x => x.order)) + 10));
    patchPreset({ entries: [...entries, e] }); setSelectedEntryId(e.id); setEntryDraft(e); setActiveTab('entries'); notify('条目已添加，请编辑后保存');
  };
  const moveEntry = (delta: number) => {
    if (!selectedPreset || !selectedEntry) return;
    const list = [...sortedEntries]; const i = list.findIndex(e => e.id === selectedEntry.id); const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    patchPreset({ entries: list.map((e, idx) => ({ ...e, order: (idx + 1) * 10 })) }); setEntryDraft(null);
  };
  const removeEntry = () => {
    if (!selectedPreset || !selectedEntry || !window.confirm('确定删除这个条目吗？')) return;
    const next = entries.filter(e => e.id !== selectedEntry.id); patchPreset({ entries: next }); setSelectedEntryId(next[0]?.id || null); setEntryDraft(null); notify('条目已删除');
  };
  const removePreset = () => {
    if (!selectedPreset || libraries[scope].length <= 1 || !window.confirm('确定删除当前预设吗？')) return;
    const next = libraries[scope].filter(p => p.id !== selectedPreset.id);
    setLibraries(prev => ({ ...prev, [scope]: next })); setSelectedIds(prev => ({ ...prev, [scope]: next[0].id })); setSelectedEntryId(null); setEntryDraft(null); notify('预设已删除');
  };
  const duplicatePreset = () => {
    if (!selectedPreset) return;
    const copy = JSON.parse(JSON.stringify(selectedPreset)) as Preset; copy.id = 'preset-' + Date.now().toString(36); copy.name += ' · 副本'; copy.isDefault = false; copy.entries = copy.entries.map(e => ({ ...e, id: 'entry-' + Math.random().toString(36).slice(2, 9) }));
    setLibraries(prev => ({ ...prev, [scope]: [copy, ...prev[scope]] })); setSelectedIds(prev => ({ ...prev, [scope]: copy.id })); setSelectedEntryId(copy.entries[0]?.id || null); setEntryDraft(null); notify('已复制预设');
  };
  const setDefault = () => { if (!selectedPreset) return; setLibraries(prev => ({ ...prev, [scope]: prev[scope].map(p => ({ ...p, isDefault: p.id === selectedPreset.id })) })); setSelectedIds(prev => ({ ...prev, [scope]: selectedPreset.id })); notify('已设为此分类默认预设并立即生效'); };
  const exportSelected = () => selectedPreset && downloadJson(selectedPreset.name.replace(/[\\/:*?"<>|]/g, '_') + '.json', { format: 'sane333-preset', version: 1, preset: selectedPreset });
  const exportAll = () => downloadJson('sane333-preset-libraries.json', { format: 'sane333-preset-libraries', version: 1, libraries });
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (raw?.libraries && typeof raw.libraries === 'object') {
        const incoming = raw.libraries as Partial<Libraries>;
        setLibraries(prev => ({ single: [...prev.single, ...(incoming.single || []).map(p => ({ ...p, scope: 'single' as const, isDefault: false }))], group: [...prev.group, ...(incoming.group || []).map(p => ({ ...p, scope: 'group' as const, isDefault: false }))], offline: [...prev.offline, ...(incoming.offline || []).map(p => ({ ...p, scope: 'offline' as const, isDefault: false }))] }));
        notify('已导入预设库；请检查各条目的兼容性');
      } else {
        const p = normalizeImport(raw, scope);
        setLibraries(prev => ({ ...prev, [scope]: [p, ...prev[scope]] })); setSelectedIds(prev => ({ ...prev, [scope]: p.id })); setSelectedEntryId(p.entries[0]?.id || null); setEntryDraft(null); notify('已导入预设；请检查酒馆宏与注入位置的兼容性');
      }
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败，请检查 JSON 格式'); }
    if (importRef.current) importRef.current.value = '';
  };
  const activeCount = (p: Preset) => p.entries.filter(e => e.enabled).length;
  const effectiveEntry = selectedEntry ? (entryDraft?.id === selectedEntry.id ? entryDraft : selectedEntry) : null;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#f4f5f2] text-[#202824]">
      <header className="shrink-0 px-4 pt-11 pb-3 bg-white border-b border-[#e4e8e2] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 shrink-0 rounded-xl border border-[#e4e8e2] grid place-items-center text-[#52645a]"><ArrowLeft className="w-4 h-4"/></button>
          <div className="min-w-0"><div className="text-[8px] tracking-[2px] font-bold text-[#8a968e]">SANE333 · STUDIO</div><h2 className="text-[17px] font-semibold tracking-tight">预设工坊</h2></div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => importRef.current?.click()} title="导入预设" className="w-8 h-8 rounded-xl border border-[#e4e8e2] grid place-items-center"><Upload className="w-3.5 h-3.5"/></button>
          <button onClick={exportSelected} title="导出当前预设" className="w-8 h-8 rounded-xl border border-[#e4e8e2] grid place-items-center"><Download className="w-3.5 h-3.5"/></button>
          <button onClick={createPreset} title="新建预设" className="w-8 h-8 rounded-xl bg-[#244a3c] text-white grid place-items-center"><Plus className="w-4 h-4"/></button>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={e => importFile(e.target.files?.[0])}/>
        </div>
      </header>
      <div className="shrink-0 p-3 pb-2 bg-white">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#f1f4f0]">
          {(Object.keys(scopeMeta) as Scope[]).map(key => { const Icon = scopeMeta[key].icon; return <button key={key} onClick={() => switchScope(key)} className={scope === key ? 'rounded-lg bg-white shadow-sm px-1.5 py-2 text-[#244a3c] text-[10px] font-semibold' : 'rounded-lg px-1.5 py-2 text-[#7d8981] text-[10px]'}><Icon className="w-3.5 h-3.5 mx-auto mb-1"/>{scopeMeta[key].title}</button>; })}
        </div>
        <p className="mt-2 text-[9px] text-[#8a948d]">{scopeMeta[scope].desc} 当前分类的数据独立保存。</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-3 space-y-3">
        <section className="rounded-2xl bg-white border border-[#e4e8e2] p-3 shadow-[0_5px_20px_rgba(37,55,43,.04)]">
          <div className="flex items-center justify-between mb-2"><div className="text-[11px] font-bold">预设列表 <span className="ml-1 text-[#9aa39c] font-normal">{filteredPresets.length}</span></div><button onClick={exportAll} className="text-[9px] text-[#467458] flex items-center gap-1"><Download className="w-3 h-3"/>导出全部</button></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索预设名称或说明…" className="w-full rounded-xl border border-[#e4e8e2] bg-[#fafbf9] px-3 py-2 text-[10px] outline-none focus:border-[#9dbba5]"/>
          <div className="mt-2 space-y-2">
            {filteredPresets.map(p => <button key={p.id} onClick={() => { setSelectedIds(prev => ({ ...prev, [scope]: p.id })); setSelectedEntryId(p.entries[0]?.id || null); setEntryDraft(null); setActiveTab('entries'); }} className={selectedPreset?.id === p.id ? 'w-full text-left p-3 rounded-xl border border-[#80a78d] bg-[#f5faf6]' : 'w-full text-left p-3 rounded-xl border border-[#e7ebe6] bg-white'}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">{p.name}{p.isDefault && <span className="text-[8px] bg-[#e6f0e9] text-[#427158] rounded px-1.5 py-0.5">默认</span>}</div><div className="mt-1 text-[9px] leading-relaxed text-[#879188]">{p.desc}</div></div><span className="shrink-0 text-[8px] text-[#8b968e]">{activeCount(p)}/{p.entries.length} 启用</span></div>
            </button>)}
            {!filteredPresets.length && <div className="p-5 text-center text-[10px] text-[#8a948d]">没有匹配的预设。可以新建一套。</div>}
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            <button onClick={duplicatePreset} className="py-2 rounded-lg border border-[#e4e8e2] text-[9px] flex items-center justify-center gap-1"><Copy className="w-3 h-3"/>复制</button>
            <button onClick={setDefault} className="py-2 rounded-lg bg-[#e8f1eb] text-[#3f735f] text-[9px] flex items-center justify-center gap-1"><Check className="w-3 h-3"/>设默认</button>
            <button onClick={removePreset} disabled={libraries[scope].length <= 1} className="py-2 rounded-lg border border-[#f0deda] text-[#ad574d] disabled:opacity-40 text-[9px] flex items-center justify-center gap-1"><Trash2 className="w-3 h-3"/>删除</button>
          </div>
        </section>

        {selectedPreset && <>
          <section className="rounded-2xl bg-white border border-[#e4e8e2] p-3 shadow-[0_5px_20px_rgba(37,55,43,.04)]">
            <div className="flex items-center justify-between gap-2"><div><div className="text-[8px] tracking-[1.5px] text-[#8a968e] font-bold">PRESET EDITOR</div><h3 className="text-[14px] font-bold mt-0.5">预设信息</h3></div><button onClick={() => { const name = window.prompt('修改预设名称', selectedPreset.name); if (name?.trim()) patchPreset({ name: name.trim() }); }} className="text-[9px] px-2.5 py-1.5 rounded-lg border border-[#e4e8e2]">改名</button></div>
            <input value={selectedPreset.name} onChange={e => patchPreset({ name: e.target.value })} className="mt-2 w-full rounded-lg border border-[#e4e8e2] px-3 py-2 text-[11px] font-semibold outline-none"/>
            <textarea value={selectedPreset.desc} onChange={e => patchPreset({ desc: e.target.value })} placeholder="说明这套预设适合什么场景" className="mt-2 w-full h-14 resize-y rounded-lg border border-[#e4e8e2] px-3 py-2 text-[10px] outline-none"/>
            <div className="flex gap-1.5 mt-3 p-1 rounded-xl bg-[#f1f4f0]"><button onClick={() => setActiveTab('entries')} className={activeTab === 'entries' ? 'flex-1 rounded-lg bg-white shadow-sm py-2 text-[10px] font-semibold text-[#244a3c]' : 'flex-1 py-2 text-[10px] text-[#7d8981]'}>条目管理</button><button onClick={() => setActiveTab('format')} className={activeTab === 'format' ? 'flex-1 rounded-lg bg-white shadow-sm py-2 text-[10px] font-semibold text-[#244a3c]' : 'flex-1 py-2 text-[10px] text-[#7d8981]'}>格式与参数</button></div>
          </section>

          {activeTab === 'entries' ? <section className="rounded-2xl bg-white border border-[#e4e8e2] p-3 shadow-[0_5px_20px_rgba(37,55,43,.04)]">
            <div className="flex items-center justify-between mb-2"><div><h3 className="text-[12px] font-bold">提示词条目</h3><p className="text-[9px] text-[#879188] mt-0.5">点选条目后编辑完整配置</p></div><span className="text-[9px] text-[#879188]">{entries.length} 条</span></div>
            <div className="space-y-1.5">
              {sortedEntries.map(e => <div key={e.id} className={selectedEntry?.id === e.id ? 'p-2.5 rounded-xl border border-[#80a78d] bg-[#f5faf6]' : 'p-2.5 rounded-xl border border-[#e7ebe6] bg-white'}>
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-[#a1aaa4] shrink-0"/>
                  <button onClick={() => { setSelectedEntryId(e.id); setEntryDraft(null); }} className="text-left flex-1 min-w-0"><div className="text-[10px] font-bold truncate">{e.name || '未命名条目'}</div><div className="mt-0.5 text-[8px] text-[#879188] truncate">{e.position} · {e.role.toUpperCase()} · Order {e.order}</div></button>
                  <button onClick={() => { const next = { ...e, enabled: !e.enabled }; patchPreset({ entries: entries.map(x => x.id === e.id ? next : x) }); if (entryDraft?.id === e.id) setEntryDraft(next); }} className={e.enabled ? 'w-8 h-[18px] rounded-full bg-[#54866a] p-[3px] shrink-0' : 'w-8 h-[18px] rounded-full bg-[#d9ded9] p-[3px] shrink-0'} aria-label={e.enabled ? '禁用条目' : '启用条目'}><span className={e.enabled ? 'block w-3 h-3 rounded-full bg-white ml-auto' : 'block w-3 h-3 rounded-full bg-white'}/></button>
                  <div className="flex gap-0.5"><button onClick={() => { const i=sortedEntries.findIndex(x=>x.id===e.id); if(i>0){setSelectedEntryId(e.id); setEntryDraft(null); const list=[...sortedEntries]; [list[i-1],list[i]]=[list[i],list[i-1]]; patchPreset({entries:list.map((x,j)=>({...x,order:(j+1)*10}))});} }} className="w-5 text-[#8a948d]" title="上移">↑</button><button onClick={() => { const i=sortedEntries.findIndex(x=>x.id===e.id); if(i<sortedEntries.length-1){setSelectedEntryId(e.id); setEntryDraft(null); const list=[...sortedEntries]; [list[i+1],list[i]]=[list[i],list[i+1]]; patchPreset({entries:list.map((x,j)=>({...x,order:(j+1)*10}))});} }} className="w-5 text-[#8a948d]" title="下移">↓</button></div>
                </div>
              </div>)}
            </div>
            <button onClick={createEntry} className="w-full mt-2.5 py-2.5 rounded-xl border border-dashed border-[#b9c8bc] bg-[#fafcf9] text-[#467458] text-[10px] font-semibold flex items-center justify-center gap-1.5"><FilePlus2 className="w-3.5 h-3.5"/>添加条目</button>
            {effectiveEntry && <div className="mt-3 pt-3 border-t border-[#e4e8e2] space-y-2.5">
              <div className="flex items-center justify-between"><h4 className="text-[11px] font-bold">编辑条目 · {effectiveEntry.name || '未命名条目'}</h4><button onClick={() => setEntryDraft({ ...effectiveEntry, enabled: !effectiveEntry.enabled })} className={effectiveEntry.enabled ? 'text-[9px] text-[#3f735f] font-semibold' : 'text-[9px] text-[#ad574d] font-semibold'}>{effectiveEntry.enabled ? '● 已启用' : '○ 已禁用'}</button></div>
              <label className="block text-[9px] text-[#5d6a61] font-semibold">条目名称<input value={effectiveEntry.name} onChange={e => patchEntry({ name: e.target.value })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-3 py-2 text-[10px] outline-none"/></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[9px] text-[#5d6a61] font-semibold">消息角色 Role<select value={effectiveEntry.role} onChange={e => patchEntry({ role: e.target.value as Role })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-2 py-2 text-[10px]"><option value="system">System</option><option value="user">User</option><option value="assistant">Assistant</option></select></label>
                <label className="block text-[9px] text-[#5d6a61] font-semibold">注入位置<select value={effectiveEntry.position} onChange={e => patchEntry({ position: e.target.value as Position })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-2 py-2 text-[10px]"><option value="before_main">主提示词之前</option><option value="after_main">主提示词之后</option><option value="before_history">聊天历史之前</option><option value="after_history">聊天历史之后</option><option value="in_history">插入历史（Depth）</option><option value="post_history">历史之后指令</option></select></label>
                <label className="block text-[9px] text-[#5d6a61] font-semibold">Depth<input type="number" min="0" value={effectiveEntry.depth} onChange={e => patchEntry({ depth: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-3 py-2 text-[10px]"/></label>
                <label className="block text-[9px] text-[#5d6a61] font-semibold">Order<input type="number" value={effectiveEntry.order} onChange={e => patchEntry({ order: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-3 py-2 text-[10px]"/></label>
              </div>
              <label className="block text-[9px] text-[#5d6a61] font-semibold">提示词内容<textarea value={effectiveEntry.content} onChange={e => patchEntry({ content: e.target.value })} className="mt-1 w-full min-h-[150px] resize-y rounded-lg border border-[#dfe5df] px-3 py-2 text-[10px] leading-relaxed outline-none" placeholder="编辑真正希望注入模型请求的提示词…"/></label>
              <div className="flex items-center justify-between gap-2"><button onClick={removeEntry} className="px-3 py-2 rounded-lg border border-[#f0deda] text-[#ad574d] text-[9px] flex items-center gap-1"><Trash2 className="w-3 h-3"/>删除条目</button><button onClick={saveEntry} className="px-4 py-2 rounded-lg bg-[#244a3c] text-white text-[9px] font-semibold flex items-center gap-1"><Save className="w-3 h-3"/>保存条目</button></div>
            </div>}
          </section> : <section className="rounded-2xl bg-white border border-[#e4e8e2] p-3 shadow-[0_5px_20px_rgba(37,55,43,.04)] space-y-3">
            <div className="text-[11px] font-bold flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5"/>格式与模型参数</div>
            <p className="text-[9px] leading-relaxed text-[#879188]">设置会保存在这套预设中。真正发送请求时，仍需按当前 API 类型转换并验证兼容性。</p>
            <label className="block text-[9px] font-semibold">接口类型<select value={selectedPreset.format.apiType} onChange={e => patchPreset({ format: { ...selectedPreset.format, apiType: e.target.value } })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-3 py-2 text-[10px]"><option value="chat_completions">Chat Completion</option><option value="text_completions">Text Completion</option><option value="custom">自定义 / 兼容接口</option></select></label>
            <div className="grid grid-cols-2 gap-2">{([{key:'temperature',label:'Temperature',min:0,max:2,step:0.05},{key:'topP',label:'Top P',min:0,max:1,step:0.01},{key:'frequencyPenalty',label:'Frequency penalty',min:-2,max:2,step:0.05},{key:'presencePenalty',label:'Presence penalty',min:-2,max:2,step:0.05},{key:'maxTokens',label:'最大输出 tokens',min:1,max:200000,step:1}] as const).map(field => <label key={field.key} className="block text-[9px] font-semibold">{field.label}<input type="number" min={field.min} max={field.max} step={field.step} value={selectedPreset.format[field.key]} onChange={e => patchPreset({ format: { ...selectedPreset.format, [field.key]: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-[#dfe5df] px-3 py-2 text-[10px]"/></label>)}</div>
            <label className="block text-[9px] font-semibold">模型专用头部 / 前缀<textarea value={selectedPreset.format.modelHead} onChange={e => patchPreset({ format: { ...selectedPreset.format, modelHead: e.target.value } })} className="mt-1 w-full min-h-[60px] rounded-lg border border-[#dfe5df] p-2 text-[10px] font-mono"/></label>
            <label className="block text-[9px] font-semibold">模型专用尾部 / 后缀<textarea value={selectedPreset.format.modelTail} onChange={e => patchPreset({ format: { ...selectedPreset.format, modelTail: e.target.value } })} className="mt-1 w-full min-h-[60px] rounded-lg border border-[#dfe5df] p-2 text-[10px] font-mono"/></label>
            <label className="block text-[9px] font-semibold">停止序列（每行一个）<textarea value={selectedPreset.format.stopSeq.join('\n')} onChange={e => patchPreset({ format: { ...selectedPreset.format, stopSeq: e.target.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) } })} className="mt-1 w-full min-h-[60px] rounded-lg border border-[#dfe5df] p-2 text-[10px] font-mono"/></label>
          </section>}
        </>}
        <div className="px-1 pb-3 text-center text-[8px] leading-relaxed text-[#98a199]">条目和预设设置会保存到本机。导入酒馆 JSON 后请复核宏、注入位置及模型专用格式兼容性。</div>
      </div>
      {notice && <div role="status" className="absolute z-30 left-1/2 -translate-x-1/2 bottom-7 max-w-[90%] px-4 py-2.5 rounded-xl bg-[#244a3c] text-white text-[10px] shadow-lg">{notice}</div>}
    </div>
  );
}
