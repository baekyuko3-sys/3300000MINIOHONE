import { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Trash2, UserRound, Link2 } from 'lucide-react';
import type { ScreenType, WorldBook } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import { generateCreativeText, readStoredAiSettings } from '../../ai/aiEngine';
import { getCharacterMemory } from '../../store/characterMemory';
import { getProjectManifest } from '../../store/projectManifest';
import { buildNpcAllContentContext, serializeNpcAllContentContext } from '../../store/npcContext';
import { deleteNpc, getNpcs, type SaneNpc, upsertNpc } from '../../store/npcs';

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

function buildFocus(source: 'project' | 'worldbook' | 'character', project: ReturnType<typeof getProjectManifest>, worldbooks: WorldBook[], character: ImportedCharacter, extra: string) {
  const sourceText = source === 'project'
    ? [project.name, project.description, project.genre, project.tone, project.globalPrompt].join('\n')
    : source === 'worldbook'
    ? worldbooks.map(book => [book.name, book.description, ...book.entries.slice(0, 16).map(entry => entry.name + ': ' + entry.content)].join('\n')).join('\n\n')
    : [character.name, character.description, character.personality, character.scenario].join('\n');
  return [sourceText, extra ? '【用户补充】\n' + extra : ''].filter(Boolean).join('\n\n');
}

export function NpcScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [npcs, setNpcs] = usePersistentState<SaneNpc[]>('phone:npcs', () => getNpcs());
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [worldbooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [source, setSource] = useState<'project' | 'worldbook' | 'character'>('character');
  const [boundCharacterId, setBoundCharacterId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [genderChoice, setGenderChoice] = useState('随机');
  const [identityCategory, setIdentityCategory] = useState<'family' | 'friend' | 'coworker' | 'other'>('friend');
  const [relationshipDetail, setRelationshipDetail] = useState('');
  const [selectedWorldBookIds, setSelectedWorldBookIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'family' | 'friend' | 'coworker' | 'other'>('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = npcs.find(item => item.id === selectedId) || null;
  const relatedNpcs = npcs.filter(item => (item.boundCharacterId || item.sourceCharacterId) === boundCharacterId);
  const inferCategory = (item: SaneNpc): 'family' | 'friend' | 'coworker' | 'other' => {
    if (item.relationshipCategory) return item.relationshipCategory;
    const relation = (item.relationship + ' ' + item.identity + ' ' + item.tags.join(' ')).toLowerCase();
    if (/家人|父亲|母亲|爸爸|妈妈|兄弟|姐妹|哥哥|姐姐|弟弟|妹妹|表哥|表姐|表弟|表妹|堂哥|堂姐|堂弟|堂妹|叔叔|阿姨|舅舅|姑姑|祖父|祖母|爷爷|奶奶|儿子|女儿|亲戚|family|sister|brother|mother|father|cousin|uncle|aunt/i.test(relation)) return 'family';
    if (/同事|上司|老板|经纪人|助理|同部门|搭档|合作伙伴|同学|同门|coworker|colleague|manager|assistant/i.test(relation)) return 'coworker';
    if (/朋友|好友|挚友|发小|竹马|闺蜜|死党|旧识|青梅竹马|friend|best friend/i.test(relation)) return 'friend';
    return 'other';
  };
  const visibleNpcs = relatedNpcs.filter(item => categoryFilter === 'all' || inferCategory(item) === categoryFilter);
  const project = getProjectManifest();
  const boundCharacter = characters.find(character => character.id === boundCharacterId) || null;
  const embeddedWorldbooks = boundCharacter?.embeddedWorldBooks?.length ? boundCharacter.embeddedWorldBooks : boundCharacter?.embeddedWorldBook ? [boundCharacter.embeddedWorldBook] : [];
  const worldbookOptions = [
    ...worldbooks.map(book => ({ key: 'global:' + book.id, book, origin: '手机世界书' })),
    ...embeddedWorldbooks.map((book, index) => ({ key: 'embedded:' + index + ':' + book.id, book, origin: '角色卡内嵌' })),
  ];
  const selectedWorldbooks = worldbookOptions.filter(option => selectedWorldBookIds.includes(option.key)).map(option => option.book);
  const activeCount = useMemo(() => npcs.filter(item => item.active).length, [npcs]);
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2200); };

  const createNpc = async () => {
    if (busy) return;
    if (!boundCharacter) { notify('请先选择 NPC 必须绑定的角色'); return; }
    setBusy(true);
    try {
      const memory = getCharacterMemory(boundCharacter.id, boundCharacter.name);
      const allContext = buildNpcAllContentContext(boundCharacter, memory, project, selectedWorldbooks);
      const contextText = serializeNpcAllContentContext(allContext);
      const raw = await generateCreativeText({
        settings: readStoredAiSettings(boundCharacter.id, boundCharacter.name),
        systemPrompt: [
          '你是 Sane333 的 NPC 世界人物生成器。',
          '这个 NPC 必须绑定到指定角色，是该角色所在世界中真实存在的关联人物。',
          '你收到的是这个手机项目的跨 App 世界上下文，包括角色卡、记忆、世界书、项目以及其他本机内容。不要声称看到了 API 密钥。',
          'NPC 需要有自己的生活、职业、性格、欲望和缺点，并与绑定角色建立自然、可持续的关系。',
          '严格遵守用户指定的性别和关系类别。关系类别必须从 family、friend、coworker、other 中选一个，写入 relationshipCategory。',
          '人物必须依据绑定角色档案中的已知事实生成；若档案提及具体亲友或同事，优先补全而不是与既有设定冲突。',
          '不要复制绑定角色，不要抢夺用户主角位置。',
          '严格输出 JSON，不要 Markdown。',
        ].join('\n'),
        userPrompt: [
          '【必须绑定角色】' + boundCharacter.name + '（' + boundCharacter.id + '）',
          '【生成要求】指定性别：' + genderChoice + '；关系分类：' + identityCategory + '；具体关系：' + (relationshipDetail.trim() || '根据角色档案合理决定') + '。必须严格按指定性别与分类生成。',
          '【本次生成重点】\n' + buildFocus(source, project, selectedWorldbooks, boundCharacter, prompt.trim()),
          '【用户明确勾选的世界书】\n' + (selectedWorldbooks.length ? selectedWorldbooks.map(book => '世界书：' + book.name + '\n' + book.description + '\n' + book.entries.filter(entry => entry.enabled).map(entry => '[' + entry.name + '] ' + entry.content).join('\n')).join('\n\n') : '用户没有勾选世界书，不要假设任何全局世界书内容已经启用。'),
          '【跨 App 手机世界上下文】\n' + contextText,
          '【JSON 字段】' + JSON.stringify({ name:'NPC姓名', gender:'性别', age:'年龄段', identity:'身份/职业', appearance:'外貌', personality:'性格', background:'完整背景', relationship:'与绑定角色的关系', relationshipCategory:'family|friend|coworker|other', tags:['标签'], memory:'NPC自己的重要记忆', canCommentMoments:true }),
          '只生成一个 NPC。',
        ].join('\n\n'),
        temperature: 0.9,
      });
      const parsed = JSON.parse(cleanJson(raw));
      const now = new Date().toISOString();
      const npc: SaneNpc = {
        id: 'npc-' + Date.now().toString(36),
        name: typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : '未命名 NPC',
        gender: genderChoice === '随机' ? (typeof parsed?.gender === 'string' ? parsed.gender : '') : genderChoice,
        age: typeof parsed?.age === 'string' ? parsed.age : '',
        identity: typeof parsed?.identity === 'string' ? parsed.identity : '世界居民',
        appearance: typeof parsed?.appearance === 'string' ? parsed.appearance : '',
        personality: typeof parsed?.personality === 'string' ? parsed.personality : '',
        background: typeof parsed?.background === 'string' ? parsed.background : '',
        relationship: typeof parsed?.relationship === 'string' ? parsed.relationship : '',
        settingSource: source,
        relationshipCategory: identityCategory,
        worldBookIds: selectedWorldbooks.map(book => book.id),
        worldBookNames: selectedWorldbooks.map(book => book.name),
        boundCharacterId: boundCharacter.id,
        boundCharacterName: boundCharacter.name,
        sourceCharacterId: boundCharacter.id,
        sourceCharacterName: boundCharacter.name,
        tags: Array.isArray(parsed?.tags) ? parsed.tags.filter((value: unknown): value is string => typeof value === 'string').slice(0, 8) : [],
        createdAt: now,
        updatedAt: now,
        memory: typeof parsed?.memory === 'string' ? parsed.memory : '',
        active: true,
        canCommentMoments: parsed?.canCommentMoments !== false,
      };
      setNpcs(prev => [npc, ...prev]);
      setSelectedId(npc.id);
      setPrompt('');
      setCategoryFilter(identityCategory);
      notify('NPC 已生成，并绑定到 ' + boundCharacter.name + ' ✦');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'NPC 生成失败');
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
    editSelected({ boundCharacterId: character.id, boundCharacterName: character.name, sourceCharacterId: character.id, sourceCharacterName: character.name });
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-white text-[#343538]">
      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[#ece9e5] bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full border border-[#e6e3df] grid place-items-center text-[#555] hover:bg-[#faf8f5]"><ArrowLeft className="w-4 h-4" /></button>
          <div><div className="text-[8px] font-mono tracking-[2px] text-[#9b958f]">WORLD PEOPLE · NPC</div><h2 className="font-serif font-bold text-base text-[#242323]">NPC 人物池</h2></div>
        </div>
        <div className="text-[9px] font-mono text-[#8b7560] border border-[#dfd5ca] px-2 py-1 rounded-full">{activeCount} ACTIVE</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        <section className="p-3.5 rounded-[18px] bg-[#f7f4ee] border border-[#e8e2d9] space-y-2.5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-[#a27762]" /><span className="text-[10px] font-semibold">从绑定角色的世界里长出一个人</span></div><span className="text-[8px] text-[#8e606b]">必须绑定角色</span></div>
          <div className="text-[9px] text-[#8b817a]">先点选角色头像，下面就只显示与 TA 有关联的 NPC。</div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {characters.map(character => <button key={character.id} onClick={() => { setBoundCharacterId(character.id); setSelectedId(null); setCategoryFilter('all'); setSelectedWorldBookIds([]) }} className={boundCharacterId === character.id ? 'shrink-0 w-[68px] flex flex-col items-center gap-1 p-1 rounded-[13px] bg-[#f8edef] border border-[#d8b7be]' : 'shrink-0 w-[68px] flex flex-col items-center gap-1 p-1 rounded-[13px] border border-transparent'}>
              {character.avatar ? <img src={character.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-[#e4ddd7]" /> : <span className="w-10 h-10 rounded-full bg-[#efebe6] border border-[#e2ddd7] grid place-items-center"><UserRound className="w-4 h-4 text-[#9b958f]" /></span>}
              <span className="w-full text-[9px] text-center truncate">{character.name}</span>
            </button>)}
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-[11px] bg-white border border-[#e7e2dc]"><Link2 className="w-3.5 h-3.5 text-[#9a6c78] shrink-0" /><select value={boundCharacterId} onChange={e => {setBoundCharacterId(e.target.value);setSelectedId(null);setCategoryFilter('all');setSelectedWorldBookIds([]);}} className="flex-1 bg-transparent outline-none text-[10px] text-[#444]"><option value="">先选择角色…</option>{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] text-[#777] space-y-1"><span className="block">NPC 性别</span><select value={genderChoice} onChange={e => setGenderChoice(e.target.value)} className="w-full p-2 rounded-[9px] border border-[#e7e2dc] bg-white text-[10px]"><option>随机</option><option>男</option><option>女</option><option>非二元</option></select></label>
            <label className="text-[9px] text-[#777] space-y-1"><span className="block">关系分类</span><select value={identityCategory} onChange={e => setIdentityCategory(e.target.value as typeof identityCategory)} className="w-full p-2 rounded-[9px] border border-[#e7e2dc] bg-white text-[10px]"><option value="friend">朋友</option><option value="family">家人</option><option value="coworker">同事</option><option value="other">其他关系</option></select></label>
          </div>
          <input value={relationshipDetail} onChange={e => setRelationshipDetail(e.target.value)} placeholder="具体关系（选填，如：童年好友、表姐、经纪人）" className="w-full p-2.5 rounded-[10px] border border-[#e7e2dc] bg-white text-[10px] outline-none" />
          <div className="rounded-[12px] border border-[#e7e2dc] bg-white p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold">生成时参考的世界书</span><span className="text-[8px] text-[#999]">可多选 · 不勾选则不启用</span></div>
            {worldbookOptions.length === 0 ? <div className="text-[9px] text-[#9a948e] leading-relaxed">目前没有可选世界书。你可以先去世界书 App 导入，或选择含有内嵌世界书的角色卡。</div> : <div className="max-h-32 overflow-y-auto space-y-1.5 no-scrollbar">
              {worldbookOptions.map(option => <label key={option.key} className="flex items-start gap-2 rounded-[8px] p-1.5 hover:bg-[#faf8f5] cursor-pointer">
                <input type="checkbox" checked={selectedWorldBookIds.includes(option.key)} onChange={e => setSelectedWorldBookIds(prev => e.target.checked ? [...prev, option.key] : prev.filter(id => id !== option.key))} className="mt-0.5 accent-[#a27783]" />
                <span className="min-w-0 flex-1"><span className="block text-[10px] text-[#484440]">{option.book.name}</span><span className="block text-[8px] text-[#a19a93]">{option.origin} · {option.book.entries.filter(entry => entry.enabled).length} 个启用条目</span></span>
              </label>)}
            </div>}
            {selectedWorldbooks.length > 0 && <div className="text-[8px] text-[#8e606b]">已选 {selectedWorldbooks.length} 本：{selectedWorldbooks.map(book => book.name).join('、')}</div>}
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[9px]">
            {([['character','角色 / 记忆'],['worldbook','世界书'],['project','项目设定']] as const).map(([id, label]) => <button key={id} onClick={() => setSource(id)} className={source === id ? 'py-2 rounded-[10px] border bg-[#eadfe0] border-[#d5b8bd] text-[#8e606b]' : 'py-2 rounded-[10px] border bg-white border-[#e9e5df] text-[#777]'}>{label}</button>)}
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：生成一个会在书店偶遇TA的老店员，并和TA有一段旧交" className="w-full h-16 p-2.5 bg-white border border-[#e7e2dc] rounded-[11px] text-[10px] outline-none resize-none" />
          <div className="text-[8px] leading-relaxed text-[#918a84]">NPC 会默认读取本机项目里的非敏感跨 App 内容；角色卡、记忆、世界书、聊天、动态、线下剧情等都可作为背景。</div>
          <button onClick={createNpc} disabled={busy || characters.length === 0} className="w-full py-2.5 rounded-[11px] bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-50"><Sparkles className="w-3.5 h-3.5" />{busy ? '正在生成人物…' : characters.length === 0 ? '先导入一个角色' : 'AI 生成 NPC'}</button>
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between"><div className="text-[11px] font-semibold">{boundCharacter ? boundCharacter.name + ' 的关联人物' : '先选择一个角色'}</div><span className="text-[9px] text-[#999]">{relatedNpcs.length} 位</span></div>
          <div className="grid grid-cols-5 gap-1">
            {([['all','全部'],['family','家人'],['friend','朋友'],['coworker','同事'],['other','其他']] as const).map(([key,label]) => <button key={key} onClick={() => setCategoryFilter(key)} className={categoryFilter === key ? 'py-2 rounded-[9px] bg-[#eadfe0] border border-[#d5b8bd] text-[#8e606b] text-[9px]' : 'py-2 rounded-[9px] bg-white border border-[#e9e5df] text-[#777] text-[9px]'}>{label}</button>)}
          </div>
        </section>
        {!boundCharacter ? <div className="py-10 text-center text-[#aaa] text-[10px]">点选上方角色头像，查看与 TA 相关的 NPC。</div> : visibleNpcs.length === 0 ? <div className="py-10 text-center text-[#aaa] text-[10px]">这个分类还没有 NPC。<br />可以为 {boundCharacter.name} 生成一位。</div> : visibleNpcs.map(npc => (
          <button key={npc.id} onClick={() => { setSelectedId(npc.id); setBoundCharacterId(npc.boundCharacterId || npc.sourceCharacterId || ''); }} className={selectedId === npc.id ? 'w-full text-left p-3.5 rounded-[17px] border border-[#d7b7be] bg-[#fcf6f7]' : 'w-full text-left p-3.5 rounded-[17px] border border-[#ece8e2] bg-white hover:bg-[#faf8f5]'}>
            <div className="flex items-start justify-between gap-3"><div className="flex gap-2.5 min-w-0"><div className="w-10 h-10 rounded-full bg-[#efebe6] border border-[#e2ddd7] grid place-items-center shrink-0"><UserRound className="w-4 h-4 text-[#9b958f]" /></div><div className="min-w-0"><div className="text-[12px] font-semibold text-[#302e2c] truncate">{npc.name}</div><div className="text-[9px] text-[#9a948e] truncate mt-0.5">{npc.identity}</div><div className="text-[9px] text-[#8c6a72] mt-1 truncate">关联：{npc.boundCharacterName || '未绑定'}</div></div></div><span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#faf1f3] border border-[#f0dfe3] text-[#9a6c78]">{npc.canCommentMoments ? '可评论' : '静默'}</span></div>
          </button>
        ))}
        {selected && <section className="p-3.5 rounded-[18px] bg-white border border-[#e8e4df] shadow-[0_6px_18px_rgba(50,40,30,.04)] space-y-2.5">
          <div className="flex items-center justify-between"><div className="text-[10px] font-semibold flex items-center gap-1.5"><UserRound className="w-3 h-3 text-[#9a6c78]" />人物详情</div><button onClick={() => { deleteNpc(selected.id); setNpcs(prev => prev.filter(item => item.id !== selected.id)); setSelectedId(null); notify('NPC 已移除'); }} className="text-[#b36b68]"><Trash2 className="w-3.5 h-3.5" /></button></div>
          <div className="text-[9px] text-[#8c6a72]">绑定角色：{selected.boundCharacterName || '未绑定'}</div>
          <select value={selected.boundCharacterId || ''} onChange={e => rebindSelected(e.target.value)} className="w-full p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none"><option value="">选择绑定角色</option>{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select>
          <input value={selected.name} onChange={e => editSelected({ name: e.target.value })} className="w-full p-2 bg-[#f8f7f5] rounded-[9px] text-[11px] outline-none font-semibold" />
          <input value={selected.identity} onChange={e => editSelected({ identity: e.target.value })} className="w-full p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none" placeholder="身份 / 职业" />
          <textarea value={selected.personality} onChange={e => editSelected({ personality: e.target.value })} className="w-full h-16 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none" placeholder="性格" />
          <textarea value={selected.background} onChange={e => editSelected({ background: e.target.value })} className="w-full h-20 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none" placeholder="背景" />
          <textarea value={selected.relationship} onChange={e => editSelected({ relationship: e.target.value })} className="w-full h-14 p-2 bg-[#f8f7f5] rounded-[9px] text-[10px] outline-none resize-none" placeholder="与绑定角色的关系" />
          <div className="flex items-center justify-between py-1"><span className="text-[9px] text-[#777]">朋友圈评论</span><button onClick={() => editSelected({ canCommentMoments: !selected.canCommentMoments })} className="text-[9px] font-mono text-[#956a74]">{selected.canCommentMoments ? 'ON' : 'OFF'}</button></div>
          <div className="flex items-center justify-between py-1"><span className="text-[9px] text-[#777]">人物活跃</span><button onClick={() => editSelected({ active: !selected.active })} className="text-[9px] font-mono text-[#956a74]">{selected.active ? 'ACTIVE' : 'PAUSED'}</button></div>
        </section>}
      </div>
      {notice && <div className="absolute left-1/2 -translate-x-1/2 bottom-6 bg-[#292724] text-white px-3 py-2 rounded-full text-[9px] z-30">{notice}</div>}
    </div>
  );
}