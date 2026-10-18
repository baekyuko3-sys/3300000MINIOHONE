import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  addSticker,
  addStickerPack,
  batchImportStickers,
  deleteSticker,
  deleteStickerPack,
  getStickerPacks,
  moveStickerToPack,
  renameStickerPack,
  updateSticker,
  type Sticker,
  type StickerPack,
} from '../../store/stickers';
import { readAndCompressImage } from '../../store/imageCompress';

interface StickerManagerPanelProps {
  onClose: () => void;
  showToast: (text: string) => void;
}

export default function StickerManagerPanel({ onClose, showToast }: StickerManagerPanelProps) {
  const [version, setVersion] = useState(0);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [showAddPack, setShowAddPack] = useState(false);
  const [newPackName, setNewPackName] = useState('');
  const [showAddSticker, setShowAddSticker] = useState(false);
  const [stickerName, setStickerName] = useState('');
  const [stickerUrl, setStickerUrl] = useState('');
  const [stickerPreview, setStickerPreview] = useState('');
  const [showBatch, setShowBatch] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [editingSticker, setEditingSticker] = useState<Sticker | null>(null);
  const [editName, setEditName] = useState('');
  const [moveTarget, setMoveTarget] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const packs = useMemo(() => getStickerPacks(), [version]);
  const refresh = () => setVersion(v => v + 1);

  const activePack: StickerPack | null =
    packs.find(p => p.id === activePackId) || packs[0] || null;
  const activeId = activePack?.id || null;
  if (activeId && activeId !== activePackId) setActivePackId(activeId);

  const handleCreatePack = () => {
    const name = newPackName.trim();
    if (!name) { showToast('请输入分组名'); return; }
    const pack = addStickerPack(name);
    setNewPackName('');
    setShowAddPack(false);
    setActivePackId(pack.id);
    refresh();
    showToast(`已创建分组「${pack.name}」`);
  };

  const handleDeletePack = (pack: StickerPack) => {
    if (!window.confirm(`删除分组「${pack.name}」？其中的 ${pack.stickers.length} 个表情也会被删除。`)) return;
    deleteStickerPack(pack.id);
    if (activePackId === pack.id) setActivePackId(null);
    refresh();
    showToast('已删除分组');
  };

  const handleRenamePack = (pack: StickerPack) => {
    const name = window.prompt('重命名分组', pack.name);
    if (name === null) return;
    if (!name.trim()) { showToast('名称不能为空'); return; }
    renameStickerPack(pack.id, name.trim());
    refresh();
    showToast('已重命名');
  };

  const handleFileSelect = async (file: File | undefined, forEdit: boolean) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); return; }
    try {
      const dataUrl = await readAndCompressImage(file, 512, 0.85);
      if (forEdit) {
        if (editingSticker && activeId) {
          updateSticker(activeId, editingSticker.id, { imageUrl: dataUrl });
          setEditingSticker({ ...editingSticker, imageUrl: dataUrl });
          refresh();
          showToast('已更换图片');
        }
      } else {
        setStickerPreview(dataUrl);
        setStickerUrl('');
      }
    } catch {
      showToast('图片读取失败');
    }
  };

  const handleAddSticker = () => {
    if (!activeId) { showToast('请先创建分组'); return; }
    const imageUrl = stickerPreview || stickerUrl.trim();
    if (!imageUrl) { showToast('请上传图片或填写图片 URL'); return; }
    addSticker(activeId, stickerName.trim() || '未命名表情', imageUrl);
    setStickerName('');
    setStickerUrl('');
    setStickerPreview('');
    setShowAddSticker(false);
    refresh();
    showToast('已添加表情');
  };

  const handleBatchImport = () => {
    if (!activeId) { showToast('请先创建分组'); return; }
    if (!batchText.trim()) { showToast('请粘贴导入内容'); return; }
    const { imported, skipped } = batchImportStickers(activeId, batchText);
    setBatchText('');
    setShowBatch(false);
    refresh();
    showToast(`导入 ${imported} 个${skipped ? `，跳过 ${skipped} 行` : ''}`);
  };

  const handleDeleteSticker = (sticker: Sticker) => {
    if (!activeId) return;
    if (!window.confirm(`删除表情「${sticker.name}」？`)) return;
    deleteSticker(activeId, sticker.id);
    refresh();
    showToast('已删除');
  };

  const handleSaveEditName = () => {
    if (!activeId || !editingSticker) return;
    const name = editName.trim();
    if (!name) { showToast('名称不能为空'); return; }
    updateSticker(activeId, editingSticker.id, { name });
    setEditingSticker(null);
    refresh();
    showToast('已保存');
  };

  const handleMoveSticker = () => {
    if (!activeId || !editingSticker || !moveTarget) return;
    if (moveStickerToPack(activeId, moveTarget, editingSticker.id)) {
      setEditingSticker(null);
      setMoveTarget('');
      setActivePackId(moveTarget);
      refresh();
      showToast('已移动到新分组');
    }
  };

  const totalCount = packs.reduce((n, p) => n + p.stickers.length, 0);

  return (
    <div className="absolute inset-0 z-[95] bg-[#f7f7f8] flex flex-col animate-in slide-in-from-right">
      <div className="h-[60px] bg-white border-b border-[#ededee] flex items-center justify-between px-3 shrink-0">
        <button type="button" onClick={onClose} className="text-2xl text-[#555] px-2 cursor-pointer">‹</button>
        <span className="font-semibold text-sm text-[#333]">表情包管理{totalCount ? ` · ${totalCount}` : ''}</span>
        <button
          type="button"
          onClick={() => setShowAddPack(true)}
          className="flex items-center gap-1 text-[11px] text-[#ae7e89] px-2 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />分组
        </button>
      </div>

      {/* 分组 tab */}
      <div className="bg-white border-b border-[#ededee] px-3 py-2 flex gap-2 overflow-x-auto shrink-0">
        {packs.map(pack => (
          <div
            key={pack.id}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap border cursor-pointer ${
              pack.id === activeId
                ? 'bg-[#292724] text-white border-[#292724]'
                : 'bg-[#f7f7f8] text-[#666] border-[#eee]'
            }`}
            onClick={() => setActivePackId(pack.id)}
          >
            <span>{pack.name} ({pack.stickers.length})</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRenamePack(pack); }}
              className="opacity-60 hover:opacity-100 cursor-pointer"
              title="重命名"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDeletePack(pack); }}
              className="opacity-60 hover:opacity-100 hover:text-red-500 cursor-pointer"
              title="删除分组"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {packs.length === 0 && (
          <span className="text-[11px] text-[#aaa] py-1.5">还没有分组，点右上角创建</span>
        )}
      </div>

      {/* 表情网格 */}
      <div className="flex-1 overflow-y-auto p-3">
        {!activePack ? (
          <div className="text-center text-[#aaa] text-xs mt-16">创建分组后开始添加表情</div>
        ) : activePack.stickers.length === 0 ? (
          <div className="text-center text-[#aaa] text-xs mt-16">这个分组还没有表情<br />点下方按钮添加</div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {activePack.stickers.map(sticker => (
              <div key={sticker.id} className="relative group">
                <button
                  type="button"
                  onClick={() => { setEditingSticker(sticker); setEditName(sticker.name); setMoveTarget(''); }}
                  className="w-full aspect-square rounded-[12px] bg-white border border-[#eee] overflow-hidden cursor-pointer hover:border-[#d4aab5]"
                >
                  <img src={sticker.imageUrl} alt={sticker.name} className="w-full h-full object-contain" loading="lazy" />
                </button>
                <div className="mt-1 text-[9px] text-[#888] text-center truncate">{sticker.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="bg-white border-t border-[#ededee] p-3 flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => { setShowAddSticker(true); setStickerName(''); setStickerUrl(''); setStickerPreview(''); }}
          disabled={!activeId}
          className="flex-1 py-2.5 rounded-[12px] bg-[#292724] text-white text-xs font-medium disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
        >
          <ImagePlus className="w-4 h-4" />添加表情
        </button>
        <button
          type="button"
          onClick={() => { setShowBatch(true); setBatchText(''); }}
          disabled={!activeId}
          className="flex-1 py-2.5 rounded-[12px] bg-[#f7f7f8] text-[#666] text-xs font-medium disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Upload className="w-4 h-4" />批量导入
        </button>
      </div>

      {/* 新建分组弹窗 */}
      {showAddPack && (
        <div className="absolute inset-0 z-10 bg-black/30 flex items-center justify-center p-6" onClick={() => setShowAddPack(false)}>
          <div className="bg-white rounded-[16px] p-4 w-full max-w-[280px]" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-[#333] mb-3">新建分组</div>
            <input
              value={newPackName}
              onChange={e => setNewPackName(e.target.value)}
              placeholder="如：猫猫组"
              className="w-full px-3 py-2 rounded-[10px] border border-[#e8e8e9] text-xs outline-none focus:border-[#d4aab5]"
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setShowAddPack(false)} className="flex-1 py-2 rounded-[10px] bg-[#f7f7f8] text-xs text-[#666] cursor-pointer">取消</button>
              <button type="button" onClick={handleCreatePack} className="flex-1 py-2 rounded-[10px] bg-[#292724] text-xs text-white cursor-pointer">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 添加表情弹窗 */}
      {showAddSticker && (
        <div className="absolute inset-0 z-10 bg-black/30 flex items-center justify-center p-6" onClick={() => setShowAddSticker(false)}>
          <div className="bg-white rounded-[16px] p-4 w-full max-w-[300px] max-h-[85%] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-[#333] mb-3">添加表情{activePack ? ` · ${activePack.name}` : ''}</div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-28 rounded-[12px] bg-[#f7f7f8] border border-dashed border-[#ddd] flex items-center justify-center overflow-hidden cursor-pointer"
            >
              {stickerPreview ? (
                <img src={stickerPreview} alt="预览" className="h-full object-contain" />
              ) : (
                <span className="text-[11px] text-[#aaa]">点击上传图片</span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { handleFileSelect(e.target.files?.[0], false); e.target.value = ''; }}
            />
            <input
              value={stickerName}
              onChange={e => setStickerName(e.target.value)}
              placeholder="表情名称（如：开心）"
              className="w-full mt-3 px-3 py-2 rounded-[10px] border border-[#e8e8e9] text-xs outline-none focus:border-[#d4aab5]"
            />
            <input
              value={stickerUrl}
              onChange={e => { setStickerUrl(e.target.value); setStickerPreview(''); }}
              placeholder="或填写图片 URL（选填）"
              className="w-full mt-2 px-3 py-2 rounded-[10px] border border-[#e8e8e9] text-xs outline-none focus:border-[#d4aab5]"
            />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setShowAddSticker(false)} className="flex-1 py-2 rounded-[10px] bg-[#f7f7f8] text-xs text-[#666] cursor-pointer">取消</button>
              <button type="button" onClick={handleAddSticker} className="flex-1 py-2 rounded-[10px] bg-[#292724] text-xs text-white cursor-pointer">添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 批量导入弹窗 */}
      {showBatch && (
        <div className="absolute inset-0 z-10 bg-black/30 flex items-center justify-center p-6" onClick={() => setShowBatch(false)}>
          <div className="bg-white rounded-[16px] p-4 w-full max-w-[300px]" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-[#333] mb-1">批量导入{activePack ? ` · ${activePack.name}` : ''}</div>
            <div className="text-[10px] text-[#aaa] mb-2">每行一个，格式：名称:URL</div>
            <textarea
              value={batchText}
              onChange={e => setBatchText(e.target.value)}
              rows={6}
              placeholder={'开心:https://example.com/happy.gif\n哭泣:https://example.com/cry.png'}
              className="w-full px-3 py-2 rounded-[10px] border border-[#e8e8e9] text-xs outline-none focus:border-[#d4aab5] resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setShowBatch(false)} className="flex-1 py-2 rounded-[10px] bg-[#f7f7f8] text-xs text-[#666] cursor-pointer">取消</button>
              <button type="button" onClick={handleBatchImport} className="flex-1 py-2 rounded-[10px] bg-[#292724] text-xs text-white cursor-pointer">开始导入</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑表情弹窗 */}
      {editingSticker && (
        <div className="absolute inset-0 z-10 bg-black/30 flex items-center justify-center p-6" onClick={() => setEditingSticker(null)}>
          <div className="bg-white rounded-[16px] p-4 w-full max-w-[300px]" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-[#333] mb-3">编辑表情</div>
            <div className="flex gap-3 items-center">
              <button
                type="button"
                onClick={() => editFileInputRef.current?.click()}
                className="w-20 h-20 rounded-[12px] bg-[#f7f7f8] border border-[#eee] overflow-hidden shrink-0 cursor-pointer"
                title="点击更换图片"
              >
                <img src={editingSticker.imageUrl} alt={editingSticker.name} className="w-full h-full object-contain" />
              </button>
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { handleFileSelect(e.target.files?.[0], true); e.target.value = ''; }}
              />
              <div className="flex-1">
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="表情名称"
                  className="w-full px-3 py-2 rounded-[10px] border border-[#e8e8e9] text-xs outline-none focus:border-[#d4aab5]"
                />
                <div className="text-[9px] text-[#aaa] mt-1">点击左侧图片可更换</div>
              </div>
            </div>
            {packs.length > 1 && (
              <div className="mt-3">
                <div className="text-[10px] text-[#888] mb-1">移动到分组</div>
                <div className="flex gap-2">
                  <select
                    value={moveTarget}
                    onChange={e => setMoveTarget(e.target.value)}
                    className="flex-1 px-2 py-2 rounded-[10px] border border-[#e8e8e9] text-xs outline-none"
                  >
                    <option value="">选择分组…</option>
                    {packs.filter(p => p.id !== activeId).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleMoveSticker}
                    disabled={!moveTarget}
                    className="px-3 py-2 rounded-[10px] bg-[#f7f7f8] text-xs text-[#666] disabled:opacity-40 cursor-pointer"
                  >
                    移动
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => handleDeleteSticker(editingSticker)}
                className="flex-1 py-2 rounded-[10px] bg-[#fff1f1] text-xs text-[#c96e7d] cursor-pointer flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />删除
              </button>
              <button type="button" onClick={() => setEditingSticker(null)} className="flex-1 py-2 rounded-[10px] bg-[#f7f7f8] text-xs text-[#666] cursor-pointer">取消</button>
              <button type="button" onClick={handleSaveEditName} className="flex-1 py-2 rounded-[10px] bg-[#292724] text-xs text-white cursor-pointer">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
