import { useMemo, useState } from 'react';
import { Pencil, Star, Trash2 } from 'lucide-react';
import {
  deleteCharacterMemoryItem,
  deleteRecentMemorySummary,
  getCharacterMemory,
  updateCharacterMemory,
  updateCharacterMemoryItem,
  type CharacterMemoryItem,
} from '../../store/characterMemory';

interface MemoryManagerPanelProps {
  characterId: string;
  characterName: string;
  personaId?: string | null;
  onClose: () => void;
  showToast: (text: string) => void;
}

const starsFor = (importance: number) => Math.max(1, Math.min(5, Math.round(Number(importance || 0) / 20)));

export default function MemoryManagerPanel({ characterId, characterName, personaId, onClose, showToast }: MemoryManagerPanelProps) {
  const [version, setVersion] = useState(0);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const memory = useMemo(
    () => getCharacterMemory(characterId, characterName, personaId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, characterName, personaId, version],
  );

  const refresh = () => setVersion(v => v + 1);

  const handleSaveSummary = () => {
    updateCharacterMemory(characterId, characterName, { summary: (summaryDraft ?? '').trim() }, personaId);
    setSummaryDraft(null);
    refresh();
    showToast('长期记忆摘要已保存');
  };

  const handleDeleteItem = (item: CharacterMemoryItem) => {
    if (!window.confirm('删除这条记忆？')) return;
    deleteCharacterMemoryItem(characterId, item.id, personaId);
    refresh();
    showToast('已删除');
  };

  const handleSaveItemEdit = (item: CharacterMemoryItem) => {
    const content = editingContent.trim();
    if (!content) {
      showToast('内容不能为空');
      return;
    }
    updateCharacterMemoryItem(characterId, characterName, item.id, { content }, personaId);
    setEditingItemId(null);
    setEditingContent('');
    refresh();
    showToast('已保存');
  };

  const handleSetImportance = (item: CharacterMemoryItem, stars: number) => {
    updateCharacterMemoryItem(characterId, characterName, item.id, { importance: stars * 20 }, personaId);
    refresh();
  };

  const handleDeleteRecent = (summaryId: string) => {
    if (!window.confirm('删除这条近期摘要？')) return;
    deleteRecentMemorySummary(characterId, summaryId, personaId);
    refresh();
    showToast('已删除');
  };

  const recentSummaries = memory.recentSummaries || [];

  return (
    <div className="absolute inset-0 z-[95] bg-[#f7f7f8] flex flex-col animate-in slide-in-from-right">
      <div className="h-[60px] bg-white border-b border-[#ededee] flex items-center justify-between px-3 shrink-0">
        <button type="button" onClick={onClose} className="text-2xl text-[#555] px-2 cursor-pointer">‹</button>
        <span className="font-semibold text-sm text-[#333]">记忆管理</span>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs pb-10">
        {/* 长期记忆摘要 */}
        <section className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5">
          <div className="font-medium text-[#333] text-[12px]">长期记忆摘要</div>
          <div className="text-[10px] text-[#999] mt-0.5 mb-2">角色对你的整体印象，可直接改写</div>
          <textarea
            value={summaryDraft ?? memory.summary ?? ''}
            onChange={e => setSummaryDraft(e.target.value)}
            rows={5}
            placeholder="还没有长期摘要"
            className="w-full rounded-[10px] border border-[#eee] p-2.5 text-[12px] leading-relaxed text-[#333] focus:outline-none focus:border-[#d4aab5] resize-y"
          />
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleSaveSummary}
              className="px-3.5 py-1.5 rounded-full bg-[#f7eef0] text-[#8c5f6b] border border-[#ead6dc] text-[11px] font-medium"
            >
              保存摘要
            </button>
          </div>
        </section>

        {/* 长期记忆条目 */}
        <section className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5">
          <div className="font-medium text-[#333] text-[12px]">长期记忆条目</div>
          <div className="text-[10px] text-[#999] mt-0.5 mb-2">{memory.items.length ? `${memory.items.length} 条 · 点星星调重要度` : '暂无'}</div>
          <div className="space-y-2.5">
            {memory.items.map(item => (
              <div key={item.id} className="rounded-[10px] border border-[#f2f2f3] p-2.5">
                {editingItemId === item.id ? (
                  <>
                    <textarea
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-[8px] border border-[#eee] p-2 text-[12px] leading-relaxed text-[#333] focus:outline-none focus:border-[#d4aab5] resize-y"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => { setEditingItemId(null); setEditingContent(''); }}
                        className="px-3 py-1.5 rounded-full bg-[#f5f5f5] text-[#777] text-[11px]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveItemEdit(item)}
                        className="px-3 py-1.5 rounded-full bg-[#f7eef0] text-[#8c5f6b] border border-[#ead6dc] text-[11px] font-medium"
                      >
                        保存
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[12px] leading-relaxed text-[#333] whitespace-pre-wrap break-words">{item.content}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleSetImportance(item, star)}
                            className="p-0.5 cursor-pointer"
                            title={`重要度 ${star} 星`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${star <= starsFor(item.importance) ? 'text-[#d4a017] fill-[#d4a017]' : 'text-[#ddd]'}`}
                            />
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setEditingItemId(item.id); setEditingContent(item.content); }}
                          className="p-1.5 text-[#888] hover:text-[#ae7e89] cursor-pointer"
                          title="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 text-[#888] hover:text-[#c0392b] cursor-pointer"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 近期记忆摘要 */}
        <section className="bg-white rounded-[14px] border border-[#f0f0f1] p-3.5">
          <div className="font-medium text-[#333] text-[12px]">近期记忆摘要</div>
          <div className="text-[10px] text-[#999] mt-0.5 mb-2">{recentSummaries.length ? `${recentSummaries.length} 条 · 待整理进长期记忆` : '暂无'}</div>
          <div className="space-y-2">
            {recentSummaries.map(item => (
              <div key={item.id} className="rounded-[10px] border border-[#f2f2f3] p-2.5 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] leading-relaxed text-[#333] whitespace-pre-wrap break-words">{item.content}</div>
                  <div className="text-[9px] text-[#bbb] mt-1">{item.source === 'line' ? 'LINE 聊天' : item.source === 'offline' ? '离线剧情' : '手动'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRecent(item.id)}
                  className="p-1.5 text-[#888] hover:text-[#c0392b] cursor-pointer shrink-0"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
