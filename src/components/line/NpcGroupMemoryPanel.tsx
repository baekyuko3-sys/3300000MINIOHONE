import { useState } from 'react';
import { getCharacterMemory, updateCharacterMemoryItem, deleteCharacterMemoryItem, clearCharacterMemory } from '../../store/characterMemory';

/**
 * NPC 群聊记忆面板：只出现在群聊设定里。
 * 总开关关 = 空白，NPC 在本群不写入、不读取任何记忆。
 */
export default function NpcGroupMemoryPanel({
  enabled,
  onToggle,
  npcMembers,
  personaId,
  showToast,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  npcMembers: Array<{ id: string; name: string }>;
  personaId?: string | null;
  showToast: (msg: string) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const refresh = () => setRefreshKey(k => k + 1);

  const handleDelete = (npcId: string, itemId: string) => {
    if (!window.confirm('删除这条记忆？')) return;
    deleteCharacterMemoryItem(npcId, itemId, personaId);
    refresh();
    showToast('已删除');
  };

  const handleClear = (npcId: string, npcName: string) => {
    if (!window.confirm(`清空 ${npcName} 在本群的全部记忆？`)) return;
    clearCharacterMemory(npcId, personaId);
    refresh();
    showToast(`已清空 ${npcName} 的记忆`);
  };

  const startEdit = (itemId: string, content: string) => {
    setEditingId(itemId);
    setEditingText(content);
  };

  const saveEdit = (npcId: string, npcName: string, itemId: string) => {
    const text = editingText.trim();
    if (!text) { showToast('内容不能为空'); return; }
    updateCharacterMemoryItem(npcId, npcName, itemId, { content: text }, personaId);
    setEditingId(null);
    setEditingText('');
    refresh();
    showToast('已保存');
  };

  return (
    <details className="rounded-[10px] border border-[#f0f0f1] overflow-hidden">
      <summary className="list-none cursor-pointer p-3 flex items-center justify-between [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold text-[#444]">NPC 群聊记忆</span>
        <span className="text-[9px] text-[#aaa]">{enabled ? '开' : '关'}</span>
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-[#555]">NPC 在本群记东西</span>
          <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} className="accent-[#ae7e89]" />
        </label>
        <div className="text-[9px] text-[#999] leading-relaxed">
          关 = 空白：NPC 在本群不写入、不读取任何记忆。开 = NPC 发言时自动记录，可在这里查看、编辑、删除。
        </div>
        {!enabled ? (
          <div className="text-[10px] text-[#aaa] text-center py-4">空白</div>
        ) : npcMembers.length === 0 ? (
          <div className="text-[10px] text-[#aaa] text-center py-4">群里没有 NPC 成员</div>
        ) : (
          <div className="space-y-2" key={refreshKey}>
            {npcMembers.map(npc => {
              const mem = getCharacterMemory(npc.id, npc.name, personaId);
              const items = [...(mem.recentSummaries || []), ...(mem.items || [])];
              return (
                <div key={npc.id} className="rounded-[10px] border border-[#f0edef] bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-2 bg-[#faf9fa]">
                    <span className="text-[11px] font-semibold text-[#333]">{npc.name}</span>
                    <button
                      type="button"
                      onClick={() => handleClear(npc.id, npc.name)}
                      className="text-[9px] text-[#c66] px-2 py-1 rounded-full bg-[#fdf0f0]"
                    >
                      清空
                    </button>
                  </div>
                  <div className="p-2.5 space-y-2">
                    {mem.summary ? (
                      <div className="text-[10px] text-[#666] leading-relaxed bg-[#fafafa] rounded-lg p-2">
                        <div className="font-semibold text-[9px] text-[#999] mb-1">长期总结</div>
                        {mem.summary}
                      </div>
                    ) : null}
                    {items.length === 0 ? (
                      <div className="text-[9px] text-[#aaa] text-center py-2">暂无记忆</div>
                    ) : (
                      items.map(item => (
                        <div key={item.id} className="text-[10px] bg-[#fafafa] rounded-lg p-2">
                          {editingId === item.id ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={editingText}
                                onChange={e => setEditingText(e.target.value)}
                                className="w-full min-h-[60px] p-1.5 rounded-md bg-white border border-[#e8e8e8] text-[10px] outline-none resize-y"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveEdit(npc.id, npc.name, item.id)}
                                  className="px-2 py-1 rounded-md bg-[#ae7e89] text-white text-[9px]"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingId(null); setEditingText(''); }}
                                  className="px-2 py-1 rounded-md bg-white border border-[#e5e5e5] text-[#666] text-[9px]"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-[#444] leading-relaxed whitespace-pre-wrap">{item.content}</div>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="text-[8px] text-[#aaa]">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</span>
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => startEdit(item.id, item.content)}
                                    className="text-[9px] text-[#6b829f] px-2 py-0.5 rounded-full bg-[#eef3f9]"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(npc.id, item.id)}
                                    className="text-[9px] text-[#c66] px-2 py-0.5 rounded-full bg-[#fdf0f0]"
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
