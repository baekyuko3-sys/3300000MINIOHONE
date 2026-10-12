import { useRef, useState } from 'react';
import { Download, Plus, Save, Trash2, Upload, Copy, Check } from 'lucide-react';
import type { CotPreset, CotPresetTarget } from '../../store/cotPresets';
import { exportCotPresets, importCotPresets, saveCotPresets, getCotAssignments, saveCotAssignment } from '../../store/cotPresets';
import type { StatusBarPreset, StatusBarTarget } from '../../store/statusBarPresets';
import { exportStatusBarPresets, importStatusBarPresets, saveStatusBarPresets, getStatusBarAssignments, saveStatusBarAssignment, getCharacterStatusBarAssignments, saveCharacterStatusBarAssignment, renderStatusBarHtml } from '../../store/statusBarPresets';

const STATUS_TARGETS: Array<[StatusBarTarget,string]> = [
  ['line','LINE 聊天'], ['offline','线下剧情'], ['character-profile','角色主页'], ['moments','动态 / Moments'], ['threads','Threads'],
];
const COT_TARGETS: Array<[CotPresetTarget,string]> = [
  ['line','LINE 聊天'], ['offline','线下剧情'], ['group','群聊'],
];

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  kind: 'status' | 'cot';
  statusPresets: StatusBarPreset[];
  setStatusPresets: (value: StatusBarPreset[]) => void;
  cotPresets: CotPreset[];
  setCotPresets: (value: CotPreset[]) => void;
  activeStatusId?: string;
  activeCotId?: string;
  onApplyStatus?: (preset: StatusBarPreset) => void;
  onApplyCot?: (preset: CotPreset) => void;
  characterId?: string;
  characterName?: string;
  onClose: () => void;
}

export function PresetResourceManager({
  kind, statusPresets, setStatusPresets, cotPresets, setCotPresets,
  activeStatusId, activeCotId, onApplyStatus, onApplyCot, characterId, characterName, onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState(kind === 'status' ? (activeStatusId || statusPresets[0]?.id) : (activeCotId || cotPresets[0]?.id));
  const [notice, setNotice] = useState('');
  const [regexTestInput, setRegexTestInput] = useState('');
  const statuses = kind === 'status';
  const list = statuses ? statusPresets : cotPresets;
  const selected = list.find(item => item.id === selectedId) || list[0];

  const notify = (text:string) => { setNotice(text); window.setTimeout(() => setNotice(''), 1800); };

  const updateSelected = (patch:any) => {
    if (!selected) return;
    if (statuses) {
      const next = { ...selected, ...patch, updatedAt: new Date().toISOString() } as StatusBarPreset;
      const nextList = statusPresets.map(item => item.id === selected.id ? next : item);
      setStatusPresets(nextList); saveStatusBarPresets(nextList);
    } else {
      const next = { ...selected, ...patch, updatedAt: new Date().toISOString() } as CotPreset;
      const nextList = cotPresets.map(item => item.id === selected.id ? next : item);
      setCotPresets(nextList); saveCotPresets(nextList);
    }
  };

  const create = () => {
    const now = new Date().toISOString();
    if (statuses) {
      const item: StatusBarPreset = {
        id: 'status-' + Date.now().toString(36), name:'新的状态栏', description:'',
        html:'<div class="sane-status"><div class="sane-status__content">{{status}}</div></div>',
        promptSuffix:'请回复一个简洁的当前状态栏，只描述此刻角色的地点、时间、正在做什么和心情。状态必须基于刚刚的聊天，不要解释，不要输出状态栏标签。',
        regex:'', targets:['line'], createdAt:now, updatedAt:now,
      };
      const next=[item,...statusPresets]; setStatusPresets(next); saveStatusBarPresets(next); setSelectedId(item.id);
    } else {
      const item: CotPreset = {
        id:'cot-'+Date.now().toString(36), title:'COT', displayTitle:'COT', displayStyle:'minimal', tag:'<think>...</think>',
        description:'', template:'', exampleThinking:'', targets:['line'], createdAt:now, updatedAt:now,
      };
      const next=[item,...cotPresets]; setCotPresets(next); saveCotPresets(next); setSelectedId(item.id);
    }
  };

  const remove = () => {
    if (!selected) return;
    const next = list.filter(item => item.id !== selected.id);
    if (statuses) { setStatusPresets(next as StatusBarPreset[]); saveStatusBarPresets(next as StatusBarPreset[]); }
    else { setCotPresets(next as CotPreset[]); saveCotPresets(next as CotPreset[]); }
    setSelectedId(next[0]?.id || '');
  };

  const toggleTarget = (target:string) => {
    if (!selected) return;
    const targets = (selected.targets || []) as string[];
    updateSelected({ targets: targets.includes(target) ? targets.filter(x => x !== target) : [...targets, target] });
  };

  const assignToApp = (target: string) => {
    if (!selected) return;
    if (statuses) {
      saveStatusBarAssignment(target as StatusBarTarget, selected.id);
      const targets = (selected.targets || []) as StatusBarTarget[];
      if (!targets.includes(target as StatusBarTarget)) updateSelected({ targets: [...targets, target as StatusBarTarget] });
      notify(`已指定「${(selected as StatusBarPreset).name}」→ ${STATUS_TARGETS.find(x=>x[0]===target)?.[1] || target}`);
    } else {
      saveCotAssignment(target as CotPresetTarget, selected.id);
      const targets = (selected.targets || []) as CotPresetTarget[];
      if (!targets.includes(target as CotPresetTarget)) updateSelected({ targets: [...targets, target as CotPresetTarget] });
      notify(`已指定「${(selected as CotPreset).title}」→ ${COT_TARGETS.find(x=>x[0]===target)?.[1] || target}`);
    }
  };

  const exportAll = () => download(statuses ? 'sane333-status-bars.json' : 'sane333-cot-presets.json', statuses ? exportStatusBarPresets(statusPresets) : exportCotPresets(cotPresets));

  const importFile = async (fileList?: FileList | null) => {
    if (!fileList?.length) return;
    try {
      if (statuses) {
        const incoming = (await Promise.all(Array.from(fileList).map(async file => importStatusBarPresets(await file.text())))).flat();
        const byId = new Map(statusPresets.map(x => [x.id, x]));
        incoming.forEach(x => byId.set(x.id, x));
        const next = [...byId.values()];
        setStatusPresets(next); saveStatusBarPresets(next);
        setSelectedId(incoming[0]?.id || selectedId);
        notify(`已批量导入 ${incoming.length} 个状态栏`);
      } else {
        const file = fileList[0];
        const incoming = importCotPresets(await file.text());
        const byId=new Map(cotPresets.map(x=>[x.id,x]));
        incoming.forEach(x=>byId.set(x.id,x));
        const next=[...byId.values()]; setCotPresets(next); saveCotPresets(next);
        setSelectedId(incoming[0]?.id || selectedId); notify(`已导入 ${incoming.length} 个思维链预设`);
      }
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败'); }
    if (inputRef.current) inputRef.current.value='';
  };

  return (
    <div className="absolute inset-0 z-[70] bg-white flex flex-col">
      <div className="h-[58px] shrink-0 border-b border-[#eee] flex items-center justify-between px-4">
        <button onClick={onClose} className="text-2xl text-[#555]">‹</button>
        <div className="text-center">
          <div className="font-semibold text-[13px] text-[#252525]">{statuses ? '正则脚本管理' : '生成摘要预设库'}</div>
          <div className="text-[8px] text-[#aaa] tracking-[1.5px] uppercase">{statuses ? 'REGEX SCRIPTS · FIND → REPLACE → HTML' : 'GENERATION SUMMARY PRESETS'}</div>
        </div>
        <button onClick={create} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center"><Plus className="w-4 h-4"/></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={exportAll} className="flex-1 py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1"><Download className="w-3.5 h-3.5"/>{statuses ? '一键导出全部状态栏' : '导出全部'}</button>
          <button onClick={()=>inputRef.current?.click()} className="flex-1 py-2.5 rounded-xl bg-[#f4f1ec] border border-[#e8e3dc] text-[10px] flex items-center justify-center gap-1"><Upload className="w-3.5 h-3.5"/>{statuses ? '批量导入状态栏' : '导入预设'}</button>
          <input ref={inputRef} type="file" accept=".json,application/json" multiple={statuses} className="hidden" onChange={e=>importFile(e.target.files)}/>
        </div>

        {notice && <div className="text-center text-[9px] text-[#9a6c78]">{notice}</div>}

        <div className="grid grid-cols-[0.82fr_1.18fr] gap-3">
          <div className="space-y-1.5">
            {list.map(item => (
              <button key={item.id} onClick={()=>setSelectedId(item.id)} className={item.id===selected?.id ? 'w-full text-left p-3 rounded-[13px] bg-[#faf3f5] border border-[#e0c4ca]' : 'w-full text-left p-3 rounded-[13px] bg-[#fafafa] border border-[#eee]'}>
                <div className="text-[10px] font-semibold text-[#333] truncate">{statuses ? (item as StatusBarPreset).name : (item as CotPreset).title}</div>
                <div className="text-[8px] text-[#aaa] mt-1">{(item.targets || []).length} 个应用</div>
              </button>
            ))}
          </div>

          {selected && <div className="space-y-3">
            <div className="bg-[#fafafa] rounded-[14px] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-[#999]">资源信息</span>
                <div className="flex gap-1">
                  <button onClick={()=>download((statuses ? (selected as StatusBarPreset).name : (selected as CotPreset).title)+'.json', statuses ? JSON.stringify(selected,null,2) : JSON.stringify(selected,null,2))} className="p-1.5 rounded-lg bg-white border border-[#eee]"><Download className="w-3 h-3"/></button>
                  <button onClick={remove} className="p-1.5 rounded-lg bg-white border border-[#eee] text-[#b46d73]"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
              {statuses ? <>
                <div className="text-[8px] font-mono tracking-[1.4px] text-[#aaa] uppercase">REGEX SCRIPT</div>
                <label className="block text-[8px] text-[#999]">Name
                  <input value={(selected as StatusBarPreset).name} onChange={e=>updateSelected({name:e.target.value})} placeholder="例如：状态栏 / Status Card" className="w-full mt-1 p-2.5 rounded-lg bg-white border border-[#e8e8e8] text-[10px]"/>
                </label>
                <label className="block text-[8px] text-[#999]">状态栏 Prompt · 生成指令
                  <textarea value={(selected as StatusBarPreset).promptSuffix} onChange={e=>updateSelected({promptSuffix:e.target.value})} placeholder="请严格按照状态栏输入格式输出，不要添加解释。" className="w-full mt-1 h-20 p-2.5 rounded-lg bg-white border border-[#e8e8e8] text-[10px] leading-relaxed resize-none"/>
                </label>
                <label className="block text-[8px] text-[#999]">提取正则 · Find Regex
                  <input value={(selected as StatusBarPreset).regex} onChange={e=>updateSelected({regex:e.target.value})} placeholder="/\\{\\{status:(.*?)\\}\\}/gs" className="w-full mt-1 p-2.5 rounded-lg bg-white border border-[#e8e8e8] text-[10px] font-mono"/>
                </label>
                <label className="block text-[8px] text-[#999]">HTML 模板 · Replace With
                  <textarea value={(selected as StatusBarPreset).html} onChange={e=>updateSelected({html:e.target.value})} placeholder="<div class=&quot;status&quot;>{{match}}</div>" className="w-full mt-1 h-32 p-2.5 rounded-lg bg-white border border-[#e8e8e8] text-[10px] font-mono"/>
                </label>

                <div className="rounded-xl bg-[#f5f7fa] border border-[#e5e8ed] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[9px] font-semibold text-[#444]">实时渲染预览</div>
                      <div className="text-[8px] text-[#aaa]">输入符合上方格式的状态原文，直接查看最终 HTML</div>
                    </div>
                    <span className="text-[8px] font-mono text-[#aaa]">RENDER PREVIEW</span>
                  </div>
                  <textarea
                    value={regexTestInput}
                    onChange={e=>setRegexTestInput(e.target.value)}
                    placeholder="直接输入 AI 生成的状态内容，查看最终渲染效果"
                    className="w-full h-20 p-2.5 rounded-lg bg-white border border-[#e8e8e8] text-[9px] outline-none resize-none"
                  />
                  <div className="min-h-[70px] flex items-start justify-center py-3 overflow-visible">
                    {regexTestInput
                      ? renderStatusBarHtml(selected as StatusBarPreset, regexTestInput)
                        ? (
                          <div className="w-full max-w-[420px] rounded-[18px] border border-[#dedfe3] bg-white shadow-[0_8px_28px_rgba(0,0,0,0.10)] overflow-visible">
                            <div className="w-full min-h-0 px-4 py-4 text-[10px] leading-relaxed text-[#333] break-words [&_*]:max-w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:object-contain [&_table]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:break-words" style={{ height: 'auto', minHeight: 0 }} dangerouslySetInnerHTML={{__html: renderStatusBarHtml(selected as StatusBarPreset, regexTestInput)}} />
                          </div>
                        )
                        : <div className="text-[9px] text-[#b36f78] py-8 text-center">格式不匹配：只有完整符合提取正则的文字才会渲染。</div>
                      : <span className="text-[8px] text-[#aaa] py-8">这里显示最终 HTML 渲染效果</span>}
                  </div>
                </div>
              </> : <>
                <label className="block text-[8px] text-[#999]">预设名称
                  <input value={(selected as CotPreset).title} onChange={e=>updateSelected({title:e.target.value})} className="w-full mt-1 p-2 rounded-lg bg-white border border-[#eee] text-[10px]"/>
                </label>
                <label className="block text-[8px] text-[#999]">聊天里显示的 COT 名称
                  <input value={(selected as CotPreset).displayTitle || (selected as CotPreset).title || 'COT'} onChange={e=>updateSelected({displayTitle:e.target.value})} placeholder="例如：COT / 角色判断 / 内心记录" className="w-full mt-1 p-2 rounded-lg bg-white border border-[#eee] text-[10px]"/>
                </label>
                <label className="block text-[8px] text-[#999]">COT 显示样式
                  <select value={(selected as CotPreset).displayStyle || 'minimal'} onChange={e=>updateSelected({displayStyle:e.target.value})} className="w-full mt-1 p-2 rounded-lg bg-white border border-[#eee] text-[10px]">
                    <option value="minimal">iMessage · 极简</option>
                    <option value="soft">Soft · 柔和卡片</option>
                    <option value="mono">Mono · 编辑器</option>
                    <option value="outline">Outline · 细线框</option>
                  </select>
                </label>
                <label className="block text-[8px] text-[#999]">COT Prompt · 决策规则
                  <textarea value={(selected as CotPreset).template} onChange={e=>updateSelected({template:e.target.value})} className="w-full mt-1 h-44 p-2 rounded-lg bg-white border border-[#eee] text-[10px] leading-relaxed font-mono"/>
                </label>
                <input value={(selected as CotPreset).tag} onChange={e=>updateSelected({tag:e.target.value})} className="w-full p-2 rounded-lg bg-white border border-[#eee] text-[10px] font-mono"/>
                <input value={(selected as CotPreset).description} onChange={e=>updateSelected({description:e.target.value})} placeholder="描述" className="w-full p-2 rounded-lg bg-white border border-[#eee] text-[10px]"/>
                <textarea value={(selected as CotPreset).template} onChange={e=>updateSelected({template:e.target.value})} className="w-full h-32 p-2 rounded-lg bg-white border border-[#eee] text-[10px] font-mono"/>
                <textarea value={(selected as CotPreset).exampleThinking} onChange={e=>updateSelected({exampleThinking:e.target.value})} placeholder="示例思考" className="w-full h-20 p-2 rounded-lg bg-white border border-[#eee] text-[10px] font-mono"/>
              </>}

              {statuses && characterId && (
                <div className="pt-2 border-t border-[#eee]">
                  <div className="text-[9px] text-[#999] mb-1.5">角色专属绑定</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        saveCharacterStatusBarAssignment(characterId, selected.id);
                        notify(`已绑定「${(selected as StatusBarPreset).name}」→ ${characterName || '当前角色'}`);
                      }}
                      className={getCharacterStatusBarAssignments()[characterId] === selected.id ? 'flex-1 px-2.5 py-2 rounded-xl bg-[#292724] text-white text-[9px]' : 'flex-1 px-2.5 py-2 rounded-xl bg-[#f5eef0] text-[#8b606a] border border-[#ead8dc] text-[9px]'}
                    >
                      {getCharacterStatusBarAssignments()[characterId] === selected.id ? '✓ 当前角色已绑定' : '绑定给当前角色'}
                    </button>
                  </div>
                  <div className="text-[8px] text-[#aaa] mt-1.5">绑定后，该角色优先使用这个状态栏，不会被 LINE 默认预设覆盖。</div>
                </div>
              )}
              <div className="pt-2 border-t border-[#eee]">
                <div className="text-[9px] text-[#999] mb-1.5">这个预设可以应用到哪些应用？</div>
                <div className="flex flex-wrap gap-1.5">
                  {(statuses ? STATUS_TARGETS : COT_TARGETS).map(([id,label]) => {
                    const active=(selected.targets || []).includes(id as any);
                    const assigned = statuses ? getStatusBarAssignments()[id as StatusBarTarget] === selected.id : getCotAssignments()[id as CotPresetTarget] === selected.id;
                    return <div key={id} className="flex items-center gap-1">
                      <button onClick={()=>toggleTarget(id)} className={active ? 'px-2 py-1 rounded-full bg-[#ead5da] text-[#7d5962] text-[8px]' : 'px-2 py-1 rounded-full bg-white border border-[#e8e5e1] text-[#999] text-[8px]'}>{active ? '✓ ' : ''}{label}</button>
                      <button onClick={()=>assignToApp(id)} className={assigned ? 'px-1.5 py-1 rounded-full bg-[#292724] text-white text-[7px]' : 'px-1.5 py-1 rounded-full bg-white border border-[#e8e5e1] text-[#aaa] text-[7px]'}>{assigned ? '默认' : '设为'}</button>
                    </div>;
                  })}
                </div>
              </div>

              <button onClick={()=>{ if(statuses) onApplyStatus?.(selected as StatusBarPreset); else onApplyCot?.(selected as CotPreset); notify('已应用到当前聊天'); }} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5"/>应用到当前聊天</button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
