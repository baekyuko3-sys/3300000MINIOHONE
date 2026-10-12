import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Brain, Clock3, Heart, Plus, Trash2, BookOpen, Sparkles, UserRound, HelpCircle, CheckCircle2, ListTodo, Settings2, ChevronRight, X } from 'lucide-react';
import type { ScreenType } from '../../types';
import type { ImportedCharacter } from '../../data/characterImport';
import {
  addCharacterMemoryItem,
  deleteCharacterMemoryItem,
  getCharacterMemory,
  saveCharacterMemory,
  addRecentMemorySummary,
  mergeRecentMemorySummaries,
  type CharacterMemory,
  type MemorySection,
  type CharacterMemoryStyleSettings,
  type MemorySummaryLength,
  type MemorySummaryFocus,
  getDefaultMemoryStyle,
} from '../../store/characterMemory';

const ACTIVE_MEMORY_KEY = 'phone:memory-active-character';
const MEMORY_SETTINGS_KEY = 'phone:memory-settings';
type MemorySettings = {
  enabled: boolean;
  trigger: 'after-chat' | 'important-only' | 'manual';
  sources: { line: boolean; offline: boolean };
  categories: Record<MemorySection, boolean>;
  autoMerge: boolean;
  autoUpdate: boolean;
  autoDelete: boolean;
  requireApproval: boolean;
};
const defaultMemorySettings: MemorySettings = {
  enabled: true,
  trigger: 'after-chat',
  sources: { line: true, offline: true },
  categories: { stage:true, 'about-you':true, relationship:true, understanding:true, confirm:true, todo:true, done:true },
  autoMerge: true, autoUpdate: true, autoDelete: false, requireApproval: false,
};
function loadMemorySettings(): MemorySettings {
  try { return { ...defaultMemorySettings, ...JSON.parse(window.localStorage.getItem(MEMORY_SETTINGS_KEY) || '{}') }; } catch { return defaultMemorySettings; }
}


const sections: Array<{ id: MemorySection; label: string; en: string; hint: string; icon: typeof Brain }> = [
  { id:'stage', label:'阶段记忆', en:'STORY', hint:'你们最近真正经历过的事情', icon:BookOpen },
  { id:'about-you', label:'关于你', en:'ABOUT YOU', hint:'角色已经知道的你的事实、习惯与偏好', icon:UserRound },
  { id:'relationship', label:'关系记忆', en:'RELATIONSHIP', hint:'你们关系中已经发生、确认或改变的事', icon:Heart },
  { id:'understanding', label:'对你的看法', en:'UNDERSTANDING', hint:'这个角色对你的主观理解，不是通用模板', icon:Brain },
  { id:'confirm', label:'想确认的事', en:'TO CONFIRM', hint:'角色还不确定、以后想从你这里确认的事', icon:HelpCircle },
  { id:'todo', label:'想做的事', en:'TO DO', hint:'角色或你们共同想做、还没完成的事', icon:ListTodo },
  { id:'done', label:'已完成的事', en:'DONE', hint:'已经完成并值得保留的事情', icon:CheckCircle2 },
];

function fallbackSection(item: CharacterMemory['items'][number]): MemorySection {
  if (item.section) return item.section;
  if (item.kind === 'event' || item.kind === 'diary') return 'stage';
  if (item.kind === 'relationship') return 'relationship';
  if (item.kind === 'preference' || item.kind === 'fact') return 'about-you';
  return 'stage';
}

function sectionKind(section: MemorySection): CharacterMemory['items'][number]['kind'] {
  if (section === 'stage' || section === 'done') return 'event';
  if (section === 'relationship') return 'relationship';
  if (section === 'about-you') return 'fact';
  if (section === 'understanding') return 'fact';
  return 'fact';
}

export function MemoryScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [characters] = useState<ImportedCharacter[]>(() => {
    try {
      const raw = window.localStorage.getItem('phone:characters');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return window.localStorage.getItem(ACTIVE_MEMORY_KEY); } catch { return null; }
  });
  const selected = characters.find(c => c.id === activeId) || characters[0] || null;
  const [memory, setMemory] = useState<CharacterMemory>(() =>
    selected
      ? getCharacterMemory(selected.id, selected.name)
      : { characterId:'', characterName:'', summary:'', items:[], updatedAt:new Date().toISOString() }
  );
  const [activeSection, setActiveSection] = useState<MemorySection>('stage');
  const [showSettings, setShowSettings] = useState(false);
  const memoryStyle = memory.memoryStyle || getDefaultMemoryStyle();
  const updateMemoryStyle = (patch: Partial<CharacterMemoryStyleSettings>) => {
    if (!selected) return;
    const next = saveCharacterMemory({ ...memory, memoryStyle: { ...memoryStyle, ...patch, sections: patch.sections ? { ...memoryStyle.sections, ...patch.sections } : memoryStyle.sections }, characterId: selected.id, characterName: selected.name });
    notifyMemory(next);
  };
  const updateSectionStyle = (section: MemorySection, patch: Partial<CharacterMemoryStyleSettings['sections'][MemorySection]>) => updateMemoryStyle({ sections: { ...memoryStyle.sections, [section]: { ...memoryStyle.sections[section], ...patch } } });
  const [memorySettings, setMemorySettings] = useState<MemorySettings>(loadMemorySettings);
  const updateSettings = (patch: Partial<MemorySettings>) => {
    const next = { ...memorySettings, ...patch };
    setMemorySettings(next);
    try { window.localStorage.setItem(MEMORY_SETTINGS_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new CustomEvent('sane333:memory-settings-changed', { detail: next }));
  };
  const [personas] = useState<any[]>(() => {
    try {
      const raw = window.localStorage.getItem('line:user-personas');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const selectedPersona = personas.find(p => p.id === memory.personaId) || null;

  const choosePersona = (personaId: string) => {
    if (!selected) return;
    const persona = personas.find(p => p.id === personaId);
    notifyMemory(saveCharacterMemory({
      ...memory,
      personaId: persona?.id || undefined,
      personaName: persona?.name || undefined,
    }));
  };

  useEffect(() => {
    if (!selected) return;
    setMemory(getCharacterMemory(selected.id, selected.name));
    try { window.localStorage.setItem(ACTIVE_MEMORY_KEY, selected.id); } catch {}
  }, [selected?.id, selected?.name]);

  useEffect(() => {
    const refresh = () => {
      if (selected) setMemory(getCharacterMemory(selected.id, selected.name));
    };
    window.addEventListener('sane333:memory-changed', refresh);
    window.addEventListener('sane333:memory-updated', refresh);
    window.addEventListener('sane333:world-event', refresh);
    return () => {
      window.removeEventListener('sane333:memory-changed', refresh);
      window.removeEventListener('sane333:memory-updated', refresh);
      window.removeEventListener('sane333:world-event', refresh);
    };
  }, [selected?.id, selected?.name]);

  const notifyMemory = (next: CharacterMemory) => {
    setMemory(next);
    window.dispatchEvent(new CustomEvent('sane333:memory-changed', { detail:{ characterId:next.characterId } }));
  };

  const items = useMemo(() => {
    return [...memory.items]
      .filter(item => fallbackSection(item) === activeSection)
      .sort((a,b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt));
  }, [memory.items, activeSection]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(sections.map(section => [section.id, 0])) as Record<MemorySection, number>;
    memory.items.forEach(item => { result[fallbackSection(item)] += 1; });
    return result;
  }, [memory.items]);

  const addMemory = () => {
    if (!selected) return;
    const current = sections.find(section => section.id === activeSection)!;
    const content = window.prompt(`添加到「${current.label}」：\n\n${current.hint}\n\n写下这件事：`);
    if (!content?.trim()) return;
    const next = addCharacterMemoryItem(selected.id, selected.name, content, {
      source:'manual',
      importance:70,
      kind:sectionKind(activeSection),
      section:activeSection,
    });
    notifyMemory(next);
  };

  const recentSummaries = memory.recentSummaries || [];
  const addRecentSummary = () => {
    if (!selected) return;
    const content = window.prompt('添加一条最近聊天总结：');
    if (!content?.trim()) return;
    notifyMemory(addRecentMemorySummary(selected.id, selected.name, content, { source:'manual', importance:60 }));
  };
  const mergeRecent = () => {
    if (!selected || !recentSummaries.length) return;
    notifyMemory(mergeRecentMemorySummaries(selected.id, selected.name));
  };

  const removeMemory = (id: string) => {
    if (!selected) return;
    const next = deleteCharacterMemoryItem(selected.id, id);
    if (next) notifyMemory(next);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background:'var(--paper)', color:'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-11 pb-3 border-b border-[rgba(40,36,31,.10)] bg-[rgba(247,244,238,.94)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/70 border border-[rgba(40,36,31,.10)] grid place-items-center text-[#292724]">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[8px] font-mono tracking-[2.2px] text-[#8b847c]">PRIVATE MEMORY / LOCAL</div>
              <h2 className="mt-0.5 font-serif font-bold text-[18px] leading-tight">Memory</h2>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-full bg-white/75 border border-[rgba(40,36,31,.10)] text-[#292724] grid place-items-center"><Settings2 className="w-4 h-4" /></button><button onClick={addMemory} disabled={!selected} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center disabled:opacity-30">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {selected && (
          <div className="mt-3 rounded-2xl border border-[rgba(40,36,31,.10)] bg-white/70 px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[8px] font-mono tracking-[1.4px] text-[#918a82]">USER PERSONA · 当前角色使用的我的人设</div>
                <div className="mt-1 text-[11px] font-semibold truncate">{selectedPersona?.name || '尚未选择'}</div>
                <div className="mt-0.5 text-[8px] text-[#9a938b]">这不是 Memory，而是这名角色对应的固定“我是谁”。</div>
              </div>
              <select value={memory.personaId || ''} onChange={e => choosePersona(e.target.value)} className="max-w-[130px] rounded-full border border-[#ddd7cf] bg-white px-2.5 py-1.5 text-[9px] outline-none">
                <option value="">不指定</option>
                {personas.map(p => <option key={p.id} value={p.id}>{p.name || '未命名人设'}</option>)}
              </select>
            </div>
          </div>
        )}
        {selected && (
          <div className="mt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#ddd6cc] border border-white shadow-sm shrink-0">
              {selected.avatar
                ? <img src={selected.avatar} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full grid place-items-center font-serif text-sm">{selected.name?.slice(0,1) || '?'}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold truncate">{selected.name || '未命名角色'} · 对你的记忆</div>
              <div className="mt-0.5 text-[8px] font-mono tracking-[1px] text-[#8d867e]">{memory.items.length} MEMORIES · UPDATED {new Date(memory.updatedAt).toLocaleDateString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[17px] font-serif font-semibold">{memory.items.length}</div>
              <div className="text-[7px] font-mono tracking-[1px] text-[#999189]">ENTRIES</div>
            </div>
          </div>
        )}
      </header>

      {characters.length > 0 && (
        <div className="relative z-10 px-4 pt-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {characters.map(c => {
              const active = selected?.id === c.id;
              const count = getCharacterMemory(c.id, c.name).items.length;
              return (
                <button key={c.id} onClick={() => setActiveId(c.id)} className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-full border text-[9px] transition ${active ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/65 text-[#655f59] border-[rgba(40,36,31,.10)]'}`}>
                  <span className="w-5 h-5 rounded-full overflow-hidden bg-[#d8d0c6] grid place-items-center font-serif">
                    {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.name?.slice(0,1) || '?')}
                  </span>
                  {c.name || '未命名'} <span className={active ? 'text-white/55' : 'text-[#aaa29a]'}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-4 pt-3 pb-5">
        {characters.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-full rounded-3xl bg-[#ebe7df] border border-[rgba(40,36,31,.10)] p-7 text-center">
              <Brain className="w-8 h-8 mx-auto text-[#8b7560]" strokeWidth={1.25} />
              <h3 className="mt-3 font-serif text-lg">还没有角色记忆</h3>
              <p className="mt-2 text-[10px] leading-relaxed text-[#777069]">导入角色并发生对话后，这里会保存真正值得长期保留的内容。</p>
            </div>
          </div>
        ) : selected && (
          <>
            <section className="grid grid-cols-2 gap-2.5">
              {sections.map(section => {
                const active = activeSection === section.id;
                const Icon = section.icon;
                return (
                  <button key={section.id} onClick={() => setActiveSection(section.id)} className={`text-left rounded-2xl border p-3.5 transition ${active ? 'bg-[#292724] text-white border-[#292724] shadow-[0_8px_24px_rgba(40,36,31,.12)]' : 'bg-white/58 border-[rgba(40,36,31,.09)] text-[#403b36]'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-7 h-7 rounded-full grid place-items-center ${active ? 'bg-white/10' : 'bg-[#eee9e1]'}`}><Icon className="w-3.5 h-3.5" /></div>
                      <span className={`text-[18px] font-serif leading-none ${active ? 'text-white' : 'text-[#4b4640]'}`}>{counts[section.id]}</span>
                    </div>
                    <div className="mt-3 font-serif text-[13px]">{section.label}</div>
                    <div className={`mt-0.5 text-[7px] font-mono tracking-[1.1px] ${active ? 'text-white/45' : 'text-[#9a9289]'}`}>{section.en}</div>
                  </button>
                );
              })}
            </section>

            <section className="mt-3 rounded-3xl bg-[#ebe7df] border border-[rgba(40,36,31,.10)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[8px] font-mono tracking-[1.7px] text-[#8b847c]">{sections.find(s => s.id === activeSection)?.en}</div>
                  <div className="mt-1 font-serif text-[15px]">{sections.find(s => s.id === activeSection)?.label}</div>
                </div>
                <button onClick={addMemory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#292724] text-white text-[8px]">
                  <Plus className="w-3 h-3" /> 记一件事
                </button>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-[#777069]">{sections.find(s => s.id === activeSection)?.hint}</p>
            </section>

            <section className="mt-2.5 space-y-2.5">
              {activeSection === 'relationship' && memory.summary.trim() && (
                <article className="rounded-2xl bg-white/72 border border-[rgba(40,36,31,.09)] p-4">
                  <div className="text-[7px] font-mono tracking-[1.5px] text-[#9a9289]">RELATIONSHIP SUMMARY</div>
                  <textarea
                    value={memory.summary}
                    onChange={e => notifyMemory(saveCharacterMemory({ ...memory, summary:e.target.value, characterId:selected.id, characterName:selected.name }))}
                    className="mt-2 w-full min-h-[72px] bg-transparent outline-none resize-y text-[10.5px] leading-relaxed font-serif-sc"
                    placeholder="记录你们关系目前最重要的状态……"
                  />
                </article>
              )}

              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[rgba(40,36,31,.16)] bg-white/35 p-8 text-center">
                  <div className="text-[10px] font-serif text-[#777069]">这里暂时没有记忆</div>
                  <div className="mt-1 text-[8px] text-[#a09890]">这不是假的模板数据；当聊天、线下剧情或你手动记录产生对应内容后，它会出现在这里。</div>
                  <button onClick={addMemory} className="mt-4 px-4 py-2 rounded-full bg-[#292724] text-white text-[9px]">＋ 添加到「{sections.find(s => s.id === activeSection)?.label}」</button>
                </div>
              ) : items.map(item => (
                <article key={item.id} className="rounded-2xl bg-white/72 border border-[rgba(40,36,31,.08)] p-4">
                  <div className="flex gap-3">
                    <div className="mt-0.5 w-7 h-7 rounded-full bg-[#eee9e1] text-[#8b7560] grid place-items-center shrink-0"><Clock3 className="w-3.5 h-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] leading-[1.75] text-[#443f3a] whitespace-pre-wrap font-serif-sc">{item.content}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-1 rounded-full bg-[#eee9e1] text-[7px] font-mono text-[#766f67]">{item.source === 'manual' ? '手动' : item.source === 'ai-summary' ? 'AI' : '聊天'}</span>
                        <span className="px-2 py-1 rounded-full bg-[#f4f0ea] text-[7px] font-mono text-[#8e877f]">重要度 {item.importance}</span>
                        <span className="text-[7px] font-mono text-[#aaa199]">{new Date(item.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button onClick={() => removeMemory(item.id)} className="self-start w-7 h-7 rounded-full grid place-items-center text-[#a46b64] hover:bg-[#f3e8e5]" title="删除记忆"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </article>
              ))}
            </section>

            <section className="mt-3 rounded-3xl bg-[#292724] text-white p-4">
  <div className="flex items-center justify-between">
    <div><div className="text-[7px] font-mono tracking-[1.6px] text-white/45">MEMORY PIPELINE</div><div className="mt-1 font-serif text-[16px]">Recent → Merge → Memory</div></div>
    <button onClick={mergeRecent} disabled={!recentSummaries.length} className="px-3 py-1.5 rounded-full bg-white text-[#292724] text-[8px] disabled:opacity-30">立即整理</button>
  </div>
  <div className="mt-3 grid grid-cols-3 gap-2">
    <div className="rounded-xl bg-white/8 p-2.5"><div className="text-[17px] font-serif">{recentSummaries.length}</div><div className="text-[7px] text-white/45">RECENT / 100</div></div>
    <div className="rounded-xl bg-white/8 p-2.5"><div className="text-[17px] font-serif">{memory.items.length}</div><div className="text-[7px] text-white/45">LONG-TERM</div></div>
    <div className="rounded-xl bg-white/8 p-2.5"><div className="text-[11px] font-mono mt-1.5">{memory.lastMergedAt ? new Date(memory.lastMergedAt).toLocaleDateString() : '—'}</div><div className="text-[7px] text-white/45 mt-0.5">LAST MERGE</div></div>
  </div>
  <div className="mt-3 text-[8px] leading-relaxed text-white/55">100 条是角色最近值得保留的记忆材料，不等于最终 Memory。达到设置阈值后再由合并引擎整理、更新或吸收。</div>
  <div className="mt-3 flex justify-between items-center"><span className="text-[8px] text-white/45">RECENT MEMORY LOG</span><button onClick={addRecentSummary} className="text-[8px] underline underline-offset-2">＋ 添加测试总结</button></div>
</section>
{recentSummaries.length > 0 && <section className="mt-2.5 space-y-2">{recentSummaries.slice(0,5).map(item => <article key={item.id} className="rounded-2xl bg-white/65 border border-[rgba(40,36,31,.08)] p-3"><div className="flex items-center justify-between"><span className="text-[7px] font-mono tracking-[1px] text-[#9a9289]">{item.source.toUpperCase()} · {item.importance}</span><span className="text-[7px] text-[#aaa199]">{new Date(item.createdAt).toLocaleDateString()}</span></div><div className="mt-1.5 text-[9.5px] leading-relaxed text-[#443f3a]">{item.content}</div></article>)}</section>}
            <section className="mt-3 rounded-2xl bg-white/45 border border-[rgba(40,36,31,.08)] p-4">
              <div className="flex items-center gap-2 text-[7px] font-mono tracking-[1.5px] text-[#9a9289]"><Sparkles className="w-3 h-3" /> MEMORY ENGINE</div>
              <p className="mt-1.5 text-[8.5px] leading-relaxed text-[#8a837b]">这里展示的是这个角色自己的长期记忆。聊天与线下剧情写入后会自动刷新；「对你的看法」与「关系记忆」不会被当成通用人格模板。</p>
            </section>
          </>
        )}
      </div>

      {showSettings && <div className="absolute inset-0 z-50 bg-[#292724]/20 backdrop-blur-[2px] flex items-end">
        <div className="w-full max-h-[88%] overflow-y-auto rounded-t-[28px] bg-[#f7f4ee] border-t border-white/70 px-5 pt-4 pb-7 shadow-[0_-18px_50px_rgba(40,36,31,.18)]">
          <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.8px] text-[#918a82]">MEMORY CONTROL</div><h3 className="mt-1 font-serif text-[20px]">Memory Settings</h3></div><button onClick={()=>setShowSettings(false)} className="w-8 h-8 rounded-full bg-white border border-[#ddd7cf] grid place-items-center"><X className="w-4 h-4"/></button></div>
          <div className="mt-4 rounded-2xl bg-white border border-[#e2ddd5] p-4 flex items-center justify-between"><div><div className="text-[11px] font-semibold">角色记忆</div><div className="mt-1 text-[8.5px] text-[#918a82]">关闭后继续聊天，但不产生新的长期 Memory。</div></div><button onClick={()=>updateSettings({enabled:!memorySettings.enabled})} className={`w-11 h-6 rounded-full p-1 transition ${memorySettings.enabled?'bg-[#292724]':'bg-[#d7d1c8]'}`}><span className={`block w-4 h-4 rounded-full bg-white transition ${memorySettings.enabled?'translate-x-5':'translate-x-0'}`}/></button></div>
          <div className="mt-3 rounded-2xl bg-white border border-[#e2ddd5] p-4"><div className="text-[9px] font-mono tracking-[1.3px] text-[#8d867e]">WHEN TO REMEMBER</div><div className="mt-2 space-y-2">{[['after-chat','每次对话结束后判断'],['important-only','只有出现重要信息才判断'],['manual','仅手动记录']].map(([id,label])=><button key={id} onClick={()=>updateSettings({trigger:id as MemorySettings['trigger']})} className={`w-full flex items-center justify-between py-2 text-left text-[10px] ${memorySettings.trigger===id?'font-semibold':'text-[#6f6962]'}`}><span>{label}</span><span className={`w-4 h-4 rounded-full border ${memorySettings.trigger===id?'bg-[#292724] border-[#292724]':'border-[#cfc8be]'}`}/></button>)}</div></div>
          <div className="mt-3 rounded-2xl bg-white border border-[#e2ddd5] p-4"><div className="text-[9px] font-mono tracking-[1.3px] text-[#8d867e]">MEMORY SOURCES</div><div className="mt-2 grid grid-cols-2 gap-2">{[['line','LINE CHAT'],['offline','OFFLINE STORY']].map(([id,label])=><button key={id} onClick={()=>updateSettings({sources:{...memorySettings.sources,[id]:!memorySettings.sources[id as 'line'|'offline']}})} className={`rounded-xl border p-3 text-left text-[9px] ${memorySettings.sources[id as 'line'|'offline']?'bg-[#292724] text-white border-[#292724]':'bg-[#f5f1ea] border-[#e2ddd5] text-[#777069]'}`}>{label}<div className="mt-1 text-[7px] opacity-60">{memorySettings.sources[id as 'line'|'offline']?'允许写入':'不写入 Memory'}</div></button>)}</div></div>
          <div className="mt-3 rounded-2xl bg-white border border-[#e2ddd5] p-4"><div className="text-[9px] font-mono tracking-[1.3px] text-[#8d867e]">WHAT CAN BE REMEMBERED</div><div className="mt-2 grid grid-cols-2 gap-x-4">{sections.map(sec=><label key={sec.id} className="flex items-center gap-2 py-2 text-[9px] text-[#625c55]"><input type="checkbox" checked={memorySettings.categories[sec.id]} onChange={e=>updateSettings({categories:{...memorySettings.categories,[sec.id]:e.target.checked}})} />{sec.label}</label>)}</div></div>
          <div className="mt-3 rounded-2xl bg-white border border-[#e2ddd5] p-4">
            <div className="text-[9px] font-mono tracking-[1.3px] text-[#8d867e]">HOW THIS CHARACTER REMEMBERS</div>
            <div className="mt-1 text-[8px] leading-relaxed text-[#9a9289]">控制这个角色“怎么总结”，不改变 Memory 的七层结构。</div>
            <select value={memoryStyle.personality} onChange={e=>updateMemoryStyle({personality:e.target.value as CharacterMemoryStyleSettings['personality']})} className="w-full mt-2.5 p-2.5 rounded-xl bg-[#f5f1ea] border border-[#e2ddd5] text-[9px] outline-none">
              <option value="balanced">平衡型</option><option value="observant">观察型</option><option value="diary">日记型</option><option value="analytical">分析型</option><option value="warm">温柔型</option><option value="character-style">角色自己的风格</option>
            </select>
            <div className="mt-3 space-y-2">
              {sections.map(sec => {
                const p=memoryStyle.sections[sec.id];
                return <div key={sec.id} className="rounded-xl bg-[#f7f4ee] border border-[#e8e2da] p-3">
                  <div className="flex items-center justify-between"><div className="text-[9px] font-semibold">{sec.label}</div><span className="text-[7px] font-mono text-[#aaa29a]">{p.maxChars} 字</span></div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <select value={p.length} onChange={e=>updateSectionStyle(sec.id,{length:e.target.value as MemorySummaryLength})} className="p-2 rounded-lg bg-white border border-[#e2ddd5] text-[8px] outline-none"><option value="minimal">极简</option><option value="short">简短</option><option value="standard">标准</option><option value="detailed">详细</option><option value="very-detailed">很详细</option></select>
                    <input type="number" min={20} max={600} step={10} value={p.maxChars} onChange={e=>updateSectionStyle(sec.id,{maxChars:Math.max(20,Math.min(600,Number(e.target.value)||20))})} className="p-2 rounded-lg bg-white border border-[#e2ddd5] text-[8px] font-mono outline-none"/>
                    <select value={p.focus} onChange={e=>updateSectionStyle(sec.id,{focus:e.target.value as MemorySummaryFocus})} className="p-2 rounded-lg bg-white border border-[#e2ddd5] text-[8px] outline-none"><option value="facts">偏事实</option><option value="events">偏事件</option><option value="relationship">偏关系</option><option value="emotion">偏情绪</option><option value="details">偏细节</option><option value="character-style">角色自己的风格</option></select>
                  </div>
                  <div className="mt-1 grid grid-cols-3 text-[6.5px] text-[#aaa29a]"><span>总结长度</span><span>字数上限</span><span>总结重点</span></div>
                </div>;
              })}
            </div>
            <div className="mt-3 p-2.5 rounded-xl bg-[#ebe7df] text-[7.5px] leading-relaxed text-[#817a72]">“角色自己的风格”只决定取舍、语气和细节，不允许编造事实；事实可靠性始终优先。</div>
          </div>

          <div className="mt-3 rounded-2xl bg-white border border-[#e2ddd5] p-4"><div className="text-[9px] font-mono tracking-[1.3px] text-[#8d867e]">MAINTENANCE</div><div className="mt-2 space-y-2 text-[9px]">{[['autoMerge','自动合并重复记忆'],['autoUpdate','发现新信息时更新旧记忆'],['autoDelete','自动删除低价值记忆'],['requireApproval','保存前先让我确认']].map(([id,label])=><label key={id} className="flex items-center justify-between py-2"><span>{label}</span><input type="checkbox" checked={!!memorySettings[id as keyof MemorySettings]} onChange={e=>updateSettings({[id]:e.target.checked} as Partial<MemorySettings>)} /></label>)}</div><div className="mt-3 pt-3 border-t border-[#eee9e1] text-[8px] leading-relaxed text-[#9a9289]">「我的人设」永远由你控制，不属于 Memory，也不会被自动修改。</div></div>
        </div>
      </div>}    </div>
  );
}
