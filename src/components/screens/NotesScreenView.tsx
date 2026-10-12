import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { ScreenType } from '../../types';

interface NotesScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
}

const STORAGE_KEY = 'phone:notes';

export function NotesScreenView({ onNavigate }: NotesScreenViewProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setNotes(raw ? JSON.parse(raw) : []);
    } catch {
      setNotes([]);
    }
  }, []);

  const saveNotes = (next: Note[]) => {
    setNotes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const createNote = () => {
    setEditing({
      id: 'note-' + Date.now().toString(36),
      title: '',
      content: '',
      date: new Date().toLocaleDateString('zh-CN'),
    });
  };

  const save = () => {
    if (!editing || !editing.title.trim()) return;
    const next = notes.some(note => note.id === editing.id)
      ? notes.map(note => note.id === editing.id ? editing : note)
      : [editing, ...notes];
    saveNotes(next);
    setEditing(null);
  };

  const remove = (id: string) => {
    if (!window.confirm('删除这条备忘录？')) return;
    saveNotes(notes.filter(note => note.id !== id));
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
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">KRAFT NOTEBOOK · PRIVATE</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">备忘录 · 手写手记</h2>
          </div>
        </div>

        <button onClick={createNote} className="w-7 h-7 rounded-full bg-[#36332f] text-white grid place-items-center active:scale-95" title="新建备忘录">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {notes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-full rounded-2xl bg-[#eee9df] border border-dashed border-[rgba(40,36,31,.18)] p-6 text-center">
              <div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">EMPTY NOTEBOOK</div>
              <div className="mt-3 font-serif font-bold text-[17px] text-[#242323]">还没有任何笔记</div>
              <div className="mt-2 text-[10px] leading-relaxed text-[#8b8782]">这里不会预置你的私人内容。<br />从第一条记录开始建立自己的档案。</div>
              <button onClick={createNote} className="mt-5 px-4 py-2.5 rounded-full bg-[#292724] text-white text-[10px]">
                写第一条
              </button>
            </div>
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="p-4 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)] shadow-[0_4px_16px_rgba(45,37,30,.05)]">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setEditing(note)} className="text-left min-w-0 flex-1">
                  <div className="text-[12px] font-serif font-bold text-[#242323] truncate">{note.title}</div>
                  <div className="mt-1 text-[8px] font-mono text-[#8b8782]">{note.date}</div>
                </button>
                <button onClick={() => remove(note.id)} className="text-[#9b625b]" title="删除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mt-2 font-serif-sc text-[11px] leading-relaxed text-[#55504a] whitespace-pre-wrap line-clamp-4">
                {note.content || '（空白笔记）'}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">
        PRIVATE NOTEBOOK · {notes.length} NOTE{notes.length === 1 ? '' : 'S'}
      </div>

      {editing && (
        <div className="absolute inset-0 z-30 bg-black/25 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[78%] overflow-y-auto rounded-t-[28px] bg-[#f4f0e9] p-5 pb-7 no-scrollbar">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">PRIVATE NOTE</div>
                <h3 className="font-serif font-bold text-[16px]">{notes.some(note => note.id === editing.id) ? '编辑备忘录' : '新建备忘录'}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="text-[#8b8782]"><X className="w-4 h-4" /></button>
            </div>
            <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="标题" className="mt-4 w-full h-10 rounded-xl border border-[#d8d0c5] bg-white px-3 text-[11px] outline-none" />
            <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} placeholder="写下今天、一个想法、一段剧情草稿……" rows={8} className="mt-2 w-full rounded-xl border border-[#d8d0c5] bg-white p-3 text-[11px] outline-none resize-none" />
            <button onClick={save} disabled={!editing.title.trim()} className="mt-3 w-full h-10 rounded-xl bg-[#292724] text-white text-[11px] disabled:opacity-35">
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
