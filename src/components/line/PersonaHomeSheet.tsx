import { useEffect, useRef, useState } from 'react';
import { readAndCompressImage } from '../../store/imageCompress';

export const MACARON_COLORS = ['#ffffff', '#fff7f5', '#fef6ec', '#fdf9ef', '#f3f8f2', '#eef6f8', '#f1f2fa', '#f7f0f7', '#fdeef0', '#eef3fd'];
export const MORANDI_COLORS = ['#e8e3dd', '#d9d3cc', '#c9c2b8', '#b6c4c0', '#a8b5c4', '#b4aebd', '#c4b2a8', '#9aa88f', '#8fa3a8', '#6f7d7c'];

function readImageFile(file: File, cb: (data: string) => void) {
  readAndCompressImage(file, 512).then(cb).catch(() => cb(''));
}

function characterAvatar(c: any) {
  return c?.avatar || c?.image || c?.cover || c?.portrait || c?.data?.avatar || '';
}

export function PersonaHomeSheet({ userPersonas, effectivePersonaId, initialIndex = 0, importedCharacters = [], onClose, onSelect, onSave, onDelete, onCreate }: any) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, userPersonas.length - 1)));
  const [draft, setDraft] = useState<any>(userPersonas[Math.min(initialIndex, Math.max(0, userPersonas.length - 1))] || null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = userPersonas[index];
    if (p) setDraft({ ...p });
    else if (userPersonas.length === 0) setDraft(null);
  }, [index, userPersonas.length]);

  useEffect(() => {
    if (scrollRef.current && userPersonas.length) {
      const el = scrollRef.current;
      const step = el.clientWidth * 0.78;
      el.scrollTo({ left: index * step });
    }
  }, []);

  const current = userPersonas[index];
  const cardBg = draft?.themeColor || current?.themeColor || '#ffffff';
  const boundIds: string[] = Array.isArray(draft?.boundCharacterIds) ? draft.boundCharacterIds : [];

  const selectCardForEdit = (i: number) => {
    setIndex(i);
    requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const toggleBound = (characterId: string) => {
    setDraft((d: any) => {
      const ids = Array.isArray(d.boundCharacterIds) ? d.boundCharacterIds : [];
      return {
        ...d,
        boundCharacterIds: ids.includes(characterId)
          ? ids.filter((x: string) => x !== characterId)
          : [...ids, characterId],
      };
    });
  };

  return (
    <div className="absolute inset-0 z-[95] flex flex-col bg-white">
      <div className="pt-11 px-5 pb-3 flex items-center justify-between border-b border-[#f1f1f2] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#f6f6f7] grid place-items-center text-[#555] text-lg leading-none">‹</button>
        <div className="text-center">
          <div className="text-[8px] font-mono tracking-[2px] text-[#bbb]">MY PERSONA</div>
          <div className="font-bold text-[16px] text-[#202124]">我的人设</div>
        </div>
        <button onClick={onCreate} className="px-3 py-2 rounded-full bg-[#202124] text-white text-[10px]">＋ 新建</button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="px-6 pt-3 text-[9px] text-[#999]">点头像圈圈切换身份 · 点卡片编辑下方资料</div>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const step = el.clientWidth * 0.78;
            const i = Math.round(el.scrollLeft / step);
            if (i !== index && i >= 0 && i < userPersonas.length) setIndex(i);
          }}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar px-6 pt-3 pb-2"
        >
          {userPersonas.map((p: any, i: number) => {
            const bg = i === index ? cardBg : (p.themeColor || '#ffffff');
            const active = p.id === effectivePersonaId;
            const editing = i === index;
            const boundCount = (p.boundCharacterIds || []).length;
            const boundPreview = importedCharacters
              .filter((c: any) => (p.boundCharacterIds || []).includes(c.id))
              .slice(0, 4);

            return (
              <div
                key={p.id}
                onClick={() => selectCardForEdit(i)}
                className={`snap-center shrink-0 w-[76%] text-left rounded-[22px] border p-4 transition-all cursor-pointer ${
                  editing ? 'border-[#202124] shadow-md' : 'border-[#eeeeef] shadow-sm'
                }`}
                style={{ background: bg }}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIndex(i);
                      onSelect?.(p, i);
                    }}
                    title={`切换成 ${p.name || '未命名'}`}
                    className={`w-14 h-14 rounded-full overflow-hidden bg-white/80 grid place-items-center shrink-0 active:scale-95 border-2 ${
                      active ? 'border-[#202124]' : 'border-white/80'
                    }`}
                  >
                    {p.avatar ? <img src={p.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-lg text-[#999]">○</span>}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[16px] text-[#202124] truncate">{p.name || '未命名'}</div>
                    <div className="text-[10px] text-[#666] truncate">{[p.age ? `${p.age}岁` : '', p.profession].filter(Boolean).join(' · ') || 'プロフィール'}</div>
                  </div>
                  {active && <span className="text-[9px] bg-[#202124] text-white px-2 py-0.5 rounded-full shrink-0">使用中</span>}
                </div>

                <div className="mt-3 text-[11px] text-[#444] leading-5 line-clamp-2 min-h-[32px]">
                  {p.setting || '还没有写自我介绍，点这张卡下方直接编辑。'}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {boundPreview.map((c: any) => {
                      const av = characterAvatar(c);
                      return (
                        <div key={c.id} className="w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-[#f1f1f2] grid place-items-center">
                          {av ? <img src={av} alt="" className="w-full h-full object-cover" /> : <span className="text-[9px] text-[#999]">{(c.name || '?')[0]}</span>}
                        </div>
                      );
                    })}
                    {boundCount === 0 && (
                      <div className="w-7 h-7 rounded-full border border-dashed border-[#ccc] bg-white/50 grid place-items-center text-[10px] text-[#bbb]">＋</div>
                    )}
                  </div>
                  <div className="text-[9px] text-[#666]">
                    {boundCount > 0 ? `${boundCount} 位绑定好友` : '尚未绑定好友'}
                  </div>
                </div>
              </div>
            );
          })}
          {userPersonas.length === 0 && <div className="w-full text-center text-xs text-[#999] py-8">还没有人设卡 · 点右上新建</div>}
        </div>

        <div className="flex items-center justify-center gap-1.5 pb-2">
          {userPersonas.map((p: any, i: number) => (
            <span
              key={p.id}
              onClick={() => selectCardForEdit(i)}
              className={`h-1.5 rounded-full cursor-pointer ${i === index ? 'w-5 bg-[#333]' : 'w-1.5 bg-[#ddd]'}`}
            />
          ))}
        </div>

        {draft && (
          <div ref={editPanelRef} className="mx-4 mb-10 p-4 rounded-[20px] border border-[#eeeeef] bg-[#fafafa] space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-bold text-[#333]">编辑 · {draft.name || '未命名'}</div>
              <button onClick={() => onDelete?.(draft.id)} className="text-[10px] text-[#c66]">删除</button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white border border-[#e5e5e6] grid place-items-center shrink-0">
                {draft.avatar ? <img src={draft.avatar} className="w-full h-full object-cover" alt="" /> : <span>○</span>}
              </div>
              <label className="text-[10px] px-3 py-2 rounded-full bg-white border border-[#e3e3e5] cursor-pointer">
                换头像
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) readImageFile(f, data => setDraft((d: any) => ({ ...d, avatar: data })));
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <span className="text-[9px] text-[#999]">点卡片上的头像圈可切换身份</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input value={draft.name || ''} onChange={e => setDraft((d: any) => ({ ...d, name: e.target.value }))} placeholder="名字" className="h-10 px-3 bg-white border border-[#e7e7e8] rounded-[12px] text-xs outline-none" />
              <input value={draft.age || ''} onChange={e => setDraft((d: any) => ({ ...d, age: e.target.value }))} placeholder="年龄" className="h-10 px-3 bg-white border border-[#e7e7e8] rounded-[12px] text-xs outline-none" />
            </div>
            <input value={draft.profession || ''} onChange={e => setDraft((d: any) => ({ ...d, profession: e.target.value }))} placeholder="职业" className="h-10 px-3 bg-white border border-[#e7e7e8] rounded-[12px] text-xs outline-none w-full" />
            <textarea value={draft.setting || ''} onChange={e => setDraft((d: any) => ({ ...d, setting: e.target.value }))} placeholder="自我介绍 / 性格 / 说话方式…" className="w-full min-h-[84px] p-3 bg-white border border-[#e7e7e8] rounded-[12px] text-xs leading-relaxed outline-none resize-y" />

            <div>
              <div className="text-[10px] font-bold text-[#555]">卡片颜色 · 马卡龙</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MACARON_COLORS.map(c => (
                  <button key={c} onClick={() => setDraft((d: any) => ({ ...d, themeColor: c }))} className={`w-8 h-8 rounded-full border ${draft.themeColor === c ? 'border-[#202124] ring-2 ring-[#202124]/20' : 'border-black/10'}`} style={{ background: c }} />
                ))}
              </div>
              <div className="mt-3 text-[10px] font-bold text-[#555]">莫兰迪</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MORANDI_COLORS.map(c => (
                  <button key={c} onClick={() => setDraft((d: any) => ({ ...d, themeColor: c }))} className={`w-8 h-8 rounded-full border ${draft.themeColor === c ? 'border-[#202124] ring-2 ring-[#202124]/20' : 'border-black/10'}`} style={{ background: c }} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.themeColor || '') ? draft.themeColor : '#ffffff'} onChange={e => setDraft((d: any) => ({ ...d, themeColor: e.target.value }))} className="w-10 h-10 rounded-full border border-[#e3e3e5] bg-white cursor-pointer" />
                <input value={draft.themeColor || '#ffffff'} onChange={e => setDraft((d: any) => ({ ...d, themeColor: e.target.value }))} placeholder="#ffffff" className="h-9 px-3 bg-white border border-[#e7e7e8] rounded-[10px] text-[11px] w-28 outline-none" />
                <span className="text-[9px] text-[#999]">自定义任意颜色</span>
              </div>
            </div>

            <div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold text-[#555]">绑定好友</div>
                  <div className="text-[9px] text-[#999] mt-0.5">切到这个身份时，只显示已勾选的好友</div>
                </div>
                <div className="text-[9px] text-[#888]">{boundIds.length} / {importedCharacters.length}</div>
              </div>

              {boundIds.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {importedCharacters.filter((c: any) => boundIds.includes(c.id)).map((c: any) => {
                    const av = characterAvatar(c);
                    return (
                      <button
                        key={`bound-${c.id}`}
                        type="button"
                        onClick={() => toggleBound(c.id)}
                        title="点击取消绑定"
                        className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white border border-[#202124] shadow-sm"
                      >
                        <span className="w-6 h-6 rounded-full overflow-hidden bg-[#f1f1f2] grid place-items-center shrink-0">
                          {av ? <img src={av} alt="" className="w-full h-full object-cover" /> : <span className="text-[9px] text-[#888]">{(c.name || '?')[0]}</span>}
                        </span>
                        <span className="text-[10px] text-[#333] max-w-[72px] truncate">{c.name}</span>
                        <span className="text-[9px] text-[#aaa]">×</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 max-h-[220px] overflow-y-auto no-scrollbar">
                {importedCharacters.length === 0 ? (
                  <div className="text-[10px] text-[#aaa] py-6 text-center rounded-[14px] border border-dashed border-[#e5e5e6] bg-white">还没有可绑定的角色，先去导入角色卡</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {importedCharacters.map((c: any) => {
                      const checked = boundIds.includes(c.id);
                      const av = characterAvatar(c);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleBound(c.id)}
                          className={`relative rounded-[16px] overflow-hidden border text-left transition-all active:scale-[0.98] ${
                            checked ? 'border-[#202124] shadow-sm bg-white' : 'border-[#ececed] bg-white'
                          }`}
                        >
                          <div className="aspect-square bg-[#f4f4f5] overflow-hidden">
                            {av ? (
                              <img src={av} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full grid place-items-center text-[22px] text-[#bbb]" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
                                {(c.name || '?')[0]}
                              </div>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="text-[10px] text-[#333] truncate font-medium">{c.name || '未命名'}</div>
                          </div>
                          <span
                            className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center text-[10px] ${
                              checked ? 'bg-[#202124] text-white' : 'bg-white/90 text-[#ccc] border border-[#e5e5e6]'
                            }`}
                          >
                            {checked ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => onSave?.({ ...draft, id: draft.id })} className="w-full py-3 rounded-[14px] bg-[#202124] text-white text-xs font-bold">保存这张卡</button>
          </div>
        )}
      </div>
    </div>
  );
}
