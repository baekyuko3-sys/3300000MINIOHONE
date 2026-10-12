import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Film, ImagePlus, Trash2, Settings2, Download, Upload } from 'lucide-react';
import { ScreenType } from '../../types';

interface GalleryScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

interface GalleryPhoto {
  id: string;
  src: string;
  title: string;
  date: string;
}

const STORAGE_KEY = 'phone:gallery';

export function GalleryScreenView({ onNavigate }: GalleryScreenViewProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setPhotos(raw ? JSON.parse(raw) : []);
    } catch {
      setPhotos([]);
    }
  }, []);

  const save = (next: GalleryPhoto[]) => {
    setPhotos(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const importPhoto = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next: GalleryPhoto = {
        id: 'photo-' + Date.now().toString(36),
        src: String(reader.result || ''),
        title: file.name.replace(/.[^.]+$/, ''),
        date: new Date().toLocaleDateString('zh-CN'),
      };
      save([next, ...photos]);
    };
    reader.readAsDataURL(file);
  };

  const exportGallery = () => {
    const blob = new Blob([JSON.stringify({ type: 'sane333-gallery', version: 1, exportedAt: new Date().toISOString(), photos }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='sane333-gallery.json'; a.click(); URL.revokeObjectURL(url);
  };

  const importGallery = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed?.photos;
      if (!Array.isArray(incoming)) throw new Error('相册文件格式不正确');
      const map = new Map(photos.map(photo => [photo.id, photo]));
      incoming.forEach((photo: GalleryPhoto) => {
        if (photo?.id && photo?.src) map.set(String(photo.id), { ...photo });
      });
      save([...map.values()]);
      setManageOpen(true);
    } catch { window.alert('相册导入失败：文件格式不正确'); }
    if (importRef.current) importRef.current.value = '';
  };

  const remove = (id: string) => {
    if (!window.confirm('删除这张照片？')) return;
    save(photos.filter(photo => photo.id !== id));
  };

  return (
    <div
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.85)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-white/40 border border-white/60 backdrop-blur-md grid place-items-center text-xs hover:bg-white/70 active:scale-95 transition-all text-[#242323]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">CONTACT SHEET · LOCAL ARCHIVE</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">底片相册 · 胶片印相</h2>
          </div>
        </div>

        <label className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center cursor-pointer active:scale-95">
          <ImagePlus className="w-3.5 h-3.5" />
          <input type="file" accept="image/*" className="hidden" onChange={e => importPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 no-scrollbar">
        {photos.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-full rounded-2xl bg-[#eee9df] border border-dashed border-[rgba(40,36,31,.18)] p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-white/70 border border-white grid place-items-center text-[#8b7560]">
                <Film className="w-6 h-6 stroke-[1.3]" />
              </div>
              <div className="mt-4 font-serif font-bold text-[17px] text-[#242323]">相册是空的</div>
              <p className="mt-2 text-[10px] leading-relaxed text-[#8b8782]">
                不预置任何照片。<br />从本机导入后，这里会变成你的私人胶片档案。
              </p>
              <label className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#292724] text-white text-[10px] cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5" />
                导入照片
                <input type="file" accept="image/*" className="hidden" onChange={e => importPhoto(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map(photo => (
              <div key={photo.id} className="p-2 pb-2.5 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.12)] shadow-sm group">
                <div className="flex justify-between items-center text-[7px] text-[#8b8782] font-mono mb-1">
                  <span>FRAME</span>
                  <span>{photo.date}</span>
                </div>
                <div className="aspect-[4/5] rounded-xl overflow-hidden bg-white/70">
                  <img src={photo.src} alt={photo.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[8px] font-semibold text-[#36332f] truncate">{photo.title}</span>
                  <button onClick={() => remove(photo.id)} className="text-[#9b625b] shrink-0" title="删除">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {manageOpen && (
        <div className="absolute inset-0 z-[80] bg-black/25 flex items-end" onClick={() => setManageOpen(false)}>
          <div className="w-full max-h-[82%] overflow-y-auto bg-white rounded-t-[24px] p-5 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">GALLERY · MANAGEMENT</div><div className="text-[15px] font-semibold mt-1">相册管理</div></div><button onClick={() => setManageOpen(false)} className="text-xl text-[#aaa]">×</button></div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportGallery} className="p-3 rounded-xl bg-[#292724] text-white text-[9px] flex items-center justify-center gap-1"><Download className="w-3 h-3"/>导出全部相册</button>
              <label className="p-3 rounded-xl bg-[#f7f5f1] border border-[#eee] text-[#555] text-[9px] flex items-center justify-center gap-1 cursor-pointer"><Upload className="w-3 h-3"/>导入相册 JSON<input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={e => importGallery(e.target.files?.[0])}/></label>
            </div>
            <div className="p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-[9px] text-[#777]">共 {photos.length} 张照片 · 本机保存</div>
            <button onClick={() => { if (!window.confirm('清空全部相册照片？')) return; save([]); }} className="w-full py-2.5 rounded-xl bg-rose-50 text-rose-500 text-xs">清空全部照片</button>
          </div>
        </div>
      )}

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">
        LOCAL FILM ARCHIVE · {photos.length} FRAME{photos.length === 1 ? '' : 'S'}
      </div>
    </div>
  );
}
