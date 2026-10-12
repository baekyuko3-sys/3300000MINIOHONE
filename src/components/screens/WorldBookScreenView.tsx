import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Download, Plus, Trash2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { ScreenType, WorldBook, WorldBookEntry } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import { exportNativeWorldBook, exportSillyTavernWorldBook, importWorldBooks } from '../../store/worldbookFormats';

const starterBook: WorldBook = {
  id: 'worldbook-template',
  name: '新世界书',
  description: '',
  category: '未分类',
  tags: [],
  enabled: true,
  updatedAt: new Date().toISOString(),
  entries: [],
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createEntry(): WorldBookEntry {
  return {
    id: `entry-${Date.now()}`,
    name: '新条目',
    keywords: [],
    content: '',
    enabled: true,
    priority: 10,
    weight: 100,
    insertion: 'before',
    depth: 0,
  };
}

export function WorldBookScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const importRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [screenMode, setScreenMode] = useState<'library' | 'online-global' | 'offline-global'>('library');
  const [selectedBookId, setSelectedBookId] = useState(books[0]?.id || '');
  const [selectedEntryId, setSelectedEntryId] = useState(books[0]?.entries[0]?.id || '');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [manageBooks, setManageBooks] = useState(false);
  const [bookInfoOpen, setBookInfoOpen] = useState(false);
  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [activeNowText, setActiveNowText] = useState('');
  const [activeNowOpen, setActiveNowOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [onlineGlobalIds, setOnlineGlobalIds] = usePersistentState<string[]>('phone:worldbook:global-online-ids', []);
  const [offlineGlobalIds, setOfflineGlobalIds] = usePersistentState<string[]>('phone:worldbook:global-offline-ids', []);

  const onlineGlobals = books.filter(item => onlineGlobalIds.includes(item.id));
  const offlineGlobals = books.filter(item => offlineGlobalIds.includes(item.id));
  const scopedBooks = screenMode === 'online-global' ? onlineGlobals : screenMode === 'offline-global' ? offlineGlobals : books;
  const book = scopedBooks.find(item => item.id === selectedBookId) || scopedBooks[0] || null;
  const isOnlineGlobal = !!book && onlineGlobalIds.includes(book.id);
  const isOfflineGlobal = !!book && offlineGlobalIds.includes(book.id);
  const selectedEntry = book?.entries.find(item => item.id === selectedEntryId) || book?.entries[0] || null;

  useEffect(() => {
    if (!books.length) {
      setSelectedBookId('');
      setSelectedEntryId('');
      return;
    }
    const activeBook = books.find(item => item.id === selectedBookId) || books[0];
    if (activeBook.id !== selectedBookId) setSelectedBookId(activeBook.id);
    const activeEntry = activeBook.entries.find(item => item.id === selectedEntryId) || activeBook.entries[0];
    const nextEntryId = activeEntry?.id || '';
    if (nextEntryId !== selectedEntryId) setSelectedEntryId(nextEntryId);
  }, [books, selectedBookId, selectedEntryId]);

  const filteredEntries = useMemo(() => {
    if (!book) return [];
    const q = search.trim().toLowerCase();
    return book.entries.filter(entry =>
      (!q ||
        entry.name.toLowerCase().includes(q) ||
        entry.keywords.some(keyword => keyword.toLowerCase().includes(q)) ||
        entry.content.toLowerCase().includes(q)) &&
      (categoryFilter === 'all' || (book.category || '未分类') === categoryFilter)
    );
  }, [book, search, categoryFilter]);

  const enabledCount = book?.entries.filter(entry => entry.enabled).length || 0;
  const globalIds = new Set([...onlineGlobalIds, ...offlineGlobalIds]);
  const localBooks = screenMode === 'library' ? books.filter(item => !globalIds.has(item.id)) : scopedBooks;

  const matchingEntries = useMemo(() => {
    if (!book) return [];
    const text = activeNowText.trim().toLowerCase();
    if (!text) return [];
    return book.entries.filter(entry => entry.enabled && (Boolean(entry.constant) || entry.keywords.some(keyword => keyword.trim() && text.includes(keyword.trim().toLowerCase()))));
  }, [book, activeNowText]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 1800);
  };

  const patchBook = (patch: Partial<WorldBook>) => {
    if (!book) return;
    setBooks(prev => prev.map(item =>
      item.id === book.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
    ));
  };

  const patchEntry = (patch: Partial<WorldBookEntry>, entryId = selectedEntry?.id) => {
    if (!book || !entryId) return;
    patchBook({
      entries: book.entries.map(entry =>
        entry.id === entryId ? { ...entry, ...patch } : entry
      ),
    });
  };

  const openEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setExpandedEntryId(current => current === entryId ? null : entryId);
    setAdvancedOpen(false);
  };

  const addBook = () => {
    const id = `worldbook-${Date.now()}`;
    const next: WorldBook = {
      ...starterBook,
      id,
      name: '新世界书',
      description: '',
      category: '未分类',
      tags: [],
      entries: [],
      updatedAt: new Date().toISOString(),
    };
    setBooks(prev => [next, ...prev]);
    if (screenMode === 'online-global') setOnlineGlobalIds(prev => Array.from(new Set([...prev, id])));
    if (screenMode === 'offline-global') setOfflineGlobalIds(prev => Array.from(new Set([...prev, id])));
    setSelectedBookId(id);
    setSelectedEntryId('');
    setExpandedEntryId(null);
    showNotice('已创建世界书');
  };

  const addEntry = () => {
    if (!book) return;
    const entry = createEntry();
    patchBook({ entries: [...book.entries, entry] });
    setSelectedEntryId(entry.id);
    setExpandedEntryId(entry.id);
    setAdvancedOpen(false);
    showNotice('已新增条目');
  };

  const removeEntry = () => {
    if (!book || !selectedEntry) return;
    const nextEntries = book.entries.filter(entry => entry.id !== selectedEntry.id);
    patchBook({ entries: nextEntries });
    setSelectedEntryId(nextEntries[0]?.id || '');
    setExpandedEntryId(current => current === selectedEntry.id ? null : current);
    showNotice('条目已删除');
  };

  const removeBook = (bookId = book?.id) => {
    if (!bookId) return;
    const target = books.find(item => item.id === bookId);
    if (!target) return;
    if (!window.confirm(`删除世界书「${target.name}」？其中 ${target.entries.length} 条世界设定也会一起删除。`)) return;
    const next = books.filter(item => item.id !== bookId);
    setBooks(next);
    if (selectedBookId === bookId) {
      setSelectedBookId(next[0]?.id || '');
      setSelectedEntryId(next[0]?.entries[0]?.id || '');
    }
    showNotice('世界书已删除');
  };

  const importBook = async (file?: File) => {
    if (!file) return;
    try {
      const normalized = importWorldBooks(await file.text());
      setBooks(prev => [
        ...normalized.map(item => ({ ...item, enabled: screenMode === 'library' ? item.enabled : true })),
        ...prev.filter(existing => !normalized.some(item => item.id === existing.id)),
      ]);
      if (screenMode === 'online-global') setOnlineGlobalIds(prev => Array.from(new Set([...prev, ...normalized.map(item => item.id)])));
      if (screenMode === 'offline-global') setOfflineGlobalIds(prev => Array.from(new Set([...prev, ...normalized.map(item => item.id)])));
      setSelectedBookId(normalized[0]?.id || '');
      setSelectedEntryId(normalized[0]?.entries?.[0]?.id || '');
      showNotice(`已识别并导入 ${normalized.length} 本世界书`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '世界书导入失败');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="relative w-full h-full min-w-0 flex flex-col overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[color-mix(in_srgb,var(--paper)_92%,white_8%)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => screenMode === 'library' ? onNavigate('home') : setScreenMode('library')}
            className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center text-xs text-[#242323]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">LOREBOOK · CONTEXT</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">{screenMode === 'online-global' ? '线上全局世界书' : screenMode === 'offline-global' ? '线下全局世界书' : '世界书'}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addBook} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center" aria-label="新建世界书" title="新建世界书"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={() => importRef.current?.click()} className="w-8 h-8 rounded-full bg-white/60 border border-[rgba(40,36,31,.12)] text-[#514b45] grid place-items-center" aria-label="导入世界书" title="导入世界书"><BookOpen className="w-3.5 h-3.5" /></button>
        </div>
      </header>

      <div className="relative z-10 flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="text-[8px] tracking-[1.8px] font-mono text-[#8b847d]">WORLD BOOKS</div>
              <div className="mt-1 text-sm font-serif font-bold text-[#302d29] truncate">{screenMode === 'online-global' ? '线上全局世界书' : screenMode === 'offline-global' ? '线下全局世界书' : '我的世界书'}</div>
            </div>
            {screenMode === 'library' ? <div className="grid grid-cols-3 gap-1.5 shrink-0">
              <button
                onClick={() => { setScreenMode('online-global'); setSelectedBookId(onlineGlobals[0]?.id || ''); setSelectedEntryId(onlineGlobals[0]?.entries[0]?.id || ''); setManageBooks(false); setExpandedEntryId(null); }}
                className="h-7 min-w-[48px] px-2 rounded-full border border-[rgba(40,36,31,.12)] bg-white/65 text-[#655f59] text-[8px] inline-flex items-center justify-center gap-1"
              >
                <BookOpen className="w-3 h-3" />线上
              </button>
              <button
                onClick={() => { setScreenMode('offline-global'); setSelectedBookId(offlineGlobals[0]?.id || ''); setSelectedEntryId(offlineGlobals[0]?.entries[0]?.id || ''); setManageBooks(false); setExpandedEntryId(null); }}
                className="h-7 min-w-[48px] px-2 rounded-full border border-[rgba(40,36,31,.12)] bg-white/65 text-[#655f59] text-[8px] inline-flex items-center justify-center gap-1"
              >
                <BookOpen className="w-3 h-3" />线下
              </button>
              <button
                onClick={() => setManageBooks(value => !value)}
                className={`h-7 min-w-[48px] px-2 rounded-full border text-[8px] inline-flex items-center justify-center gap-1 ${manageBooks ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/65 text-[#655f59] border-[rgba(40,36,31,.12)]'}`}
              >
                <Settings2 className="w-3 h-3" />{manageBooks ? '完成' : '管理'}
              </button>
            </div> : <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setManageBooks(value => !value)} className={`h-7 px-2.5 rounded-full border text-[8px] inline-flex items-center gap-1 ${manageBooks ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/65 text-[#655f59] border-[rgba(40,36,31,.12)]'}`}><Settings2 className="w-3 h-3" />{manageBooks ? '完成管理' : '管理'}</button>
            </div>}
          </div>
          <div className="space-y-2">
            {localBooks.map(item => (
              <div key={item.id} className={`w-full rounded-xl border p-3 transition-all ${item.id === book?.id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/60 text-[#4f4943] border-[rgba(40,36,31,.12)]'}`}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setSelectedBookId(item.id); setSelectedEntryId(item.entries[0]?.id || ''); setManageBooks(false); setExpandedEntryId(null); }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-[12px] font-serif font-bold break-words">{item.name || '未命名世界书'}</div>
                    <div className={`mt-1 text-[9px] ${item.id === book?.id ? 'text-white/65' : 'text-[#918980]'}`}>
                      {item.entries.length} 条设定 · {item.enabled ? '启用' : '停用'}
                      {item.sourceType === 'character-card' ? ` · 来自角色卡：${item.sourceCharacterName || '角色'}` : ''}
                    </div>
                  </button>
                  <BookOpen className={`w-4 h-4 shrink-0 ${item.id === book?.id ? 'text-white/65' : 'text-[#8b847d]'}`} />
                </div>
                {manageBooks && (
                  <div className="mt-3 pt-2 border-t border-[rgba(40,36,31,.12)] flex flex-wrap items-center gap-3">
                    <button onClick={() => setBooks(prev => prev.map(bookItem => bookItem.id === item.id ? { ...bookItem, enabled: !bookItem.enabled, updatedAt: new Date().toISOString() } : bookItem))} className="text-[10px]">
                      {item.enabled ? '停用' : '启用'}
                    </button>
                    {screenMode !== 'library' && <button onClick={() => {
                      if (screenMode === 'online-global') setOnlineGlobalIds(prev => prev.filter(id => id !== item.id));
                      else setOfflineGlobalIds(prev => prev.filter(id => id !== item.id));
                      if (selectedBookId === item.id) setSelectedBookId('');
                      setManageBooks(false);
                      showNotice('已移出当前全局，不会删除世界书');
                    }} className="text-[10px] text-[#a37d45]">移出全局</button>}
                    {screenMode === 'library' && <button onClick={() => {
                      setOnlineGlobalIds(prev => Array.from(new Set([...prev, item.id])));
                      showNotice('已加入线上全局');
                    }} className="text-[10px]">加入线上</button>}
                    {screenMode === 'library' && <button onClick={() => {
                      setOfflineGlobalIds(prev => Array.from(new Set([...prev, item.id])));
                      showNotice('已加入线下全局');
                    }} className="text-[10px]">加入线下</button>}
                    <button onClick={() => removeBook(item.id)} className="text-[10px] text-[#9b625b]">删除</button>
                  </div>
                )}
              </div>
            ))}
            {localBooks.length === 0 && (
              <div className="w-full py-8 text-center rounded-2xl border border-dashed border-[rgba(40,36,31,.18)] text-[10px] text-[#8b847d]">
                {screenMode === 'online-global' ? '还没有加入线上全局的世界书。可以新建一本，或导入现有世界书。' : screenMode === 'offline-global' ? '还没有加入线下全局的世界书。可以新建一本，或导入现有世界书。' : '还没有世界书 · 可以从角色卡自动导入，或右上角 ＋ 新建'}
                <div className="mt-3 flex justify-center gap-2"><button onClick={addBook} className="px-3 py-2 rounded-full bg-[#292724] text-white text-[10px]">新建世界书</button><button onClick={() => importRef.current?.click()} className="px-3 py-2 rounded-full border border-[rgba(40,36,31,.15)] text-[10px]">导入世界书</button></div>
              </div>
            )}
          </div>
          {screenMode === 'library' && <div className="mt-2 rounded-xl border border-[rgba(40,36,31,.1)] bg-white/45 overflow-hidden">
            <button
              onClick={() => setGlobalPanelOpen(value => !value)}
              className="w-full px-3 py-2 flex items-center justify-between text-left"
            >
              <div className="min-w-0">
                <div className="text-[7px] font-mono tracking-[1.2px] text-[#8b847d]">GLOBAL SCOPE</div>
                <div className="mt-0.5 text-[9px] text-[#716a63]">
                  线上 {onlineGlobals.length} 本 · 线下 {offlineGlobals.length} 本
                </div>
              </div>
              {globalPanelOpen ? <ChevronUp className="w-3 h-3 shrink-0 text-[#8b847d]" /> : <ChevronDown className="w-3 h-3 shrink-0 text-[#8b847d]" />}
            </button>
            {globalPanelOpen && (
              <div className="px-2.5 pb-2.5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setScreenMode('online-global'); setSelectedBookId(onlineGlobals[0]?.id || ''); setSelectedEntryId(onlineGlobals[0]?.entries[0]?.id || ''); setExpandedEntryId(null); }} className="rounded-xl bg-white/55 p-2 text-left hover:bg-white/80 transition-colors">
                  <div className="text-[7px] font-mono text-[#8b847d]">ONLINE CHAT · 打开页面 ↗</div>
                  <div className="mt-1 text-[8px] text-[#716a63]">{onlineGlobals.length ? '已加入全局' : '暂无'}</div>
                  {onlineGlobals.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{onlineGlobals.map(item => <span key={item.id} className="max-w-full truncate px-2 py-1 rounded-full bg-[#292724] text-white text-[7px]">{item.name}</span>)}</div>}
                </button>
                <button type="button" onClick={() => { setScreenMode('offline-global'); setSelectedBookId(offlineGlobals[0]?.id || ''); setSelectedEntryId(offlineGlobals[0]?.entries[0]?.id || ''); setExpandedEntryId(null); }} className="rounded-xl bg-white/55 p-2 text-left hover:bg-white/80 transition-colors">
                  <div className="text-[7px] font-mono text-[#8b847d]">OFFLINE STORY · 打开页面 ↗</div>
                  <div className="mt-1 text-[8px] text-[#716a63]">{offlineGlobals.length ? '已加入全局' : '暂无'}</div>
                  {offlineGlobals.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{offlineGlobals.map(item => <span key={item.id} className="max-w-full truncate px-2 py-1 rounded-full bg-[#292724] text-white text-[7px]">{item.name}</span>)}</div>}
                </button>
              </div>
            )}
          </div>}
          </div>

        {book && <div className="shrink-0 px-4 pb-2">
          <button
            onClick={() => setBookInfoOpen(value => !value)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[9px] text-[#6d665f]"
          >
            <span className="inline-flex items-center gap-1.5"><BookOpen className="w-3 h-3" />全局设置与世界书信息</span>
            {bookInfoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {bookInfoOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="p-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[8px] font-mono text-[#8b8782]">
            RESOURCE NAME
            <input
              value={book?.name || ''}
              onChange={e => patchBook({ name: e.target.value })}
              className="w-full mt-1 bg-transparent text-[10px] font-serif font-semibold text-[#242323] outline-none"
              placeholder="世界书名称"
            />
          </label>
          <label className="p-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[8px] font-mono text-[#8b8782]">
            CATEGORY
            <input
              value={book?.category || ''}
              onChange={e => patchBook({ category: e.target.value })}
              className="w-full mt-1 bg-transparent text-[10px] text-[#444] outline-none"
              placeholder="人物 / 世界 / 剧情"
            />
          </label>
          <label className="col-span-2 p-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[8px] font-mono text-[#8b8782]">
            DESCRIPTION · TAGS
            <input
              value={book ? (book.description || '') + (book.tags?.length ? ' · ' + book.tags.join(', ') : '') : ''}
              onChange={e => {
                const [description, ...tags] = e.target.value.split('·');
                patchBook({
                  description: description.trim(),
                  tags: tags.join('·').split(',').map(v => v.trim()).filter(Boolean),
                });
              }}
              className="w-full mt-1 bg-transparent text-[9px] text-[#444] outline-none"
              placeholder="描述 · tag1, tag2"
            />
              </label>
            </div>
          )}
        </div>}

        {book && <div className="shrink-0 px-4 pb-2 space-y-2">
          <div className="rounded-2xl bg-[#292724] text-white overflow-hidden">
            <button onClick={() => setActiveNowOpen(value => !value)} className="w-full p-3 flex items-center justify-between text-left">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-white/45">WORLD BOOK · STATUS</div>
                <div className="mt-1 text-[12px] font-serif font-bold">{(isOnlineGlobal || isOfflineGlobal) ? `${enabledCount} / ${book?.entries.length || 0} 条目参与全局检索` : `${enabledCount} / ${book?.entries.length || 0} 条目 · 仅在被选中的场景使用`}</div>
              </div>
              {activeNowOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/50" /> : <ChevronDown className="w-3.5 h-3.5 text-white/50" />}
            </button>
            {activeNowOpen && <div className="px-3 pb-3">
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <div className="text-[8px] text-white/45">用于检查当前文字会命中哪些条目</div>
                <button onClick={() => { const next = window.prompt('输入一段文字测试世界书触发'); if (next !== null) setActiveNowText(next); }} className="px-2.5 py-1.5 rounded-full bg-white/10 text-[8px]">测试触发</button>
              </div>
              {activeNowText ? <div className="mt-2"><div className="text-[8px] text-white/45 truncate">SCAN · {activeNowText}</div><div className="mt-2 flex flex-wrap gap-1.5">{matchingEntries.length ? matchingEntries.map(entry => <button key={entry.id} onClick={() => openEntry(entry.id)} className="px-2 py-1 rounded-full bg-white/10 text-[8px]">● {entry.name}</button>) : <span className="text-[8px] text-white/45">当前没有命中已启用条目</span>}</div></div> : null}
            </div>}
          </div>

          <div className="flex gap-1.5 items-center min-w-0">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-[72px] shrink-0 bg-white/60 border border-[rgba(40,36,31,.12)] rounded-xl px-2 py-2 text-[9px] outline-none text-[#444]"
            >
              <option value="all">全部资源</option>
              {[...new Set(books.map(item => item.category || '未分类'))].map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索条目 / 关键词"
              className="min-w-0 flex-1 bg-white/60 border border-[rgba(40,36,31,.12)] rounded-xl px-3 py-2 text-xs outline-none text-[#444]"
            />
            <button onClick={() => importRef.current?.click()} className="shrink-0 px-2.5 py-2 rounded-xl bg-[color-mix(in_srgb,var(--paper)_82%,white_18%)] border border-[rgba(40,36,31,.12)] text-[9px] text-[#5d5751]">
              导入
            </button>
            <button
              onClick={() => book && downloadJson(`${book.name}.json`, JSON.parse(exportNativeWorldBook(book)))}
              className="px-3 py-2 rounded-xl bg-[color-mix(in_srgb,var(--paper)_82%,white_18%)] border border-[rgba(40,36,31,.12)] text-[10px] text-[#5d5751]"
            >
              <Download className="w-3 h-3 inline mr-1" />导出
            </button>
            <button
              onClick={() => book && downloadJson(`${book.name}-tavern.json`, JSON.parse(exportSillyTavernWorldBook(book)))}
              className="px-3 py-2 rounded-xl bg-[#292724] text-white text-[10px]"
              title="导出为 SillyTavern World Info 格式"
            >
              Tavern
            </button>
            <input ref={importRef} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={e => importBook(e.target.files?.[0])} />
          </div>
        </div>}

        {book && <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar px-4 pb-24 space-y-1.5">
          <div className="sticky top-0 z-10 px-2 py-1.5 rounded-xl bg-[color-mix(in_srgb,var(--paper)_95%,white_5%)] backdrop-blur text-[8px] font-mono tracking-[1.2px] text-[#8b847d] border border-[rgba(40,36,31,.08)]">
            <div className="flex items-center justify-between">
              <span>条目 · {filteredEntries.length} · 点开即可修改</span>
              <span className="tracking-normal font-sans text-[7px]">☑ 启用 · ☐ 停用</span>
            </div>
          </div>

          {filteredEntries.map(entry => {
            const expanded = expandedEntryId === entry.id;
            return (
              <div
                key={entry.id}
                className={`rounded-xl border transition-all ${
                  expanded
                    ? 'bg-white/80 text-[#2f2c28] border-[#292724]/25'
                    : selectedEntry?.id === entry.id
                      ? 'bg-[#292724] text-white border-[#292724]'
                      : 'bg-white/55 text-[#5e5852] border-[rgba(40,36,31,.12)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openEntry(entry.id)}
                  className="w-full text-left p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={() => {
                        setSelectedEntryId(entry.id);
                        patchEntry({ enabled: !entry.enabled }, entry.id);
                      }}
                      onClick={event => event.stopPropagation()}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#8b7560]"
                      aria-label={entry.enabled ? '停用条目' : '启用条目'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold truncate">{entry.name}</div>
                      <div className={`mt-1 text-[8px] font-mono ${expanded ? 'text-[#8b847d]' : 'opacity-70'}`}>
                        {entry.priority} · {entry.keywords.length} key · {entry.enabled ? 'ON' : 'OFF'}
                      </div>
                    </div>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />}
                  </div>
                </button>
                {expanded && (
                  <div className="px-2.5 pb-2.5 space-y-2 border-t border-[rgba(40,36,31,.08)] pt-2">
                    <input
                      value={entry.name}
                      onChange={e => patchEntry({ name: e.target.value }, entry.id)}
                      className="w-full bg-white rounded-xl px-3 py-2 text-sm font-serif font-bold outline-none text-[#242323] border border-[rgba(40,36,31,.1)]"
                    />
                    <div>
                      <label className="text-[8px] font-mono text-[#8b8782]">KEYWORDS</label>
                      <input
                        value={entry.keywords.join(', ')}
                        onChange={e => patchEntry({ keywords: e.target.value.split(',').map(v => v.trim()).filter(Boolean) }, entry.id)}
                        className="w-full mt-1 bg-white border border-[rgba(40,36,31,.1)] rounded-xl px-3 py-2 text-[10px] outline-none"
                        placeholder="人物, 地点, 物件"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-mono text-[#8b8782]">CONTENT</label>
                      <textarea
                        value={entry.content}
                        onChange={e => patchEntry({ content: e.target.value }, entry.id)}
                        className="w-full mt-1 h-[150px] bg-white border border-[rgba(40,36,31,.1)] rounded-xl p-3 text-[10.5px] leading-relaxed outline-none resize-none"
                        placeholder="世界规则 / 触发内容 / 人物设定……"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="bg-white rounded-xl p-2 text-[9px] border border-[rgba(40,36,31,.08)]">
                        Priority
                        <input type="number" value={entry.priority} onChange={e => patchEntry({ priority: Number(e.target.value) || 0 }, entry.id)} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                      </label>
                      <label className="bg-white rounded-xl p-2 text-[9px] border border-[rgba(40,36,31,.08)]">
                        Weight
                        <input type="number" value={entry.weight} onChange={e => patchEntry({ weight: Number(e.target.value) || 0 }, entry.id)} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                      </label>
                      <label className="bg-white rounded-xl p-2 text-[9px] border border-[rgba(40,36,31,.08)]">
                        Insertion
                        <select value={entry.insertion} onChange={e => patchEntry({ insertion: e.target.value as WorldBookEntry['insertion'] }, entry.id)} className="w-full mt-1 bg-transparent outline-none text-xs">
                          <option value="before">Before</option>
                          <option value="after">After</option>
                          <option value="depth">Depth</option>
                        </select>
                      </label>
                      <label className="bg-white rounded-xl p-2 text-[9px] border border-[rgba(40,36,31,.08)]">
                        Depth
                        <input type="number" value={entry.depth} onChange={e => patchEntry({ depth: Number(e.target.value) || 0 }, entry.id)} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                      </label>
                    </div>
                    <div className="rounded-xl bg-white border border-[rgba(40,36,31,.08)] overflow-hidden">
                      <button type="button" onClick={() => setAdvancedOpen(value => !value)} className="w-full p-2.5 flex items-center justify-between text-left">
                        <span className="text-[8px] font-mono tracking-[1.2px] text-[#8b8782]">高级触发与递归设置</span>
                        {advancedOpen ? <ChevronUp className="w-3 h-3 text-[#8b8782]" /> : <ChevronDown className="w-3 h-3 text-[#8b8782]" />}
                      </button>
                      {advancedOpen && <div className="px-2.5 pb-2.5 space-y-2">
                        <label className="text-[9px] block">
                          Secondary Keys
                          <input
                            value={(entry.secondaryKeywords || []).join(', ')}
                            onChange={e => patchEntry({ secondaryKeywords: e.target.value.split(',').map(v => v.trim()).filter(Boolean) }, entry.id)}
                            className="w-full mt-1 bg-white border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 text-[9px] outline-none"
                            placeholder="可选：额外条件关键词"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="bg-[#f7f4f0] rounded-xl p-2 text-[9px]">
                            Probability %
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={entry.probability ?? 100}
                              onChange={e => patchEntry({ probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)), useProbability: true }, entry.id)}
                              className="w-full mt-1 bg-transparent outline-none font-mono text-xs"
                            />
                          </label>
                          <label className="bg-[#f7f4f0] rounded-xl p-2 text-[9px]">
                            Scan Depth
                            <input
                              type="number"
                              min="0"
                              max="50"
                              value={entry.scanDepth ?? 0}
                              onChange={e => patchEntry({ scanDepth: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }, entry.id)}
                              className="w-full mt-1 bg-transparent outline-none font-mono text-xs"
                            />
                          </label>
                        </div>
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Constant · 常驻</span>
                          <input type="checkbox" checked={Boolean(entry.constant)} onChange={e => patchEntry({ constant: e.target.checked }, entry.id)} />
                        </label>
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Selective · 使用 Secondary Keys</span>
                          <input type="checkbox" checked={Boolean(entry.selective)} onChange={e => patchEntry({ selective: e.target.checked }, entry.id)} />
                        </label>
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Case Sensitive · 区分大小写</span>
                          <input type="checkbox" checked={Boolean(entry.caseSensitive)} onChange={e => patchEntry({ caseSensitive: e.target.checked }, entry.id)} />
                        </label>
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Whole Words · 完整单词</span>
                          <input type="checkbox" checked={Boolean(entry.matchWholeWords)} onChange={e => patchEntry({ matchWholeWords: e.target.checked }, entry.id)} />
                        </label>
                        {entry.selective && (
                          <label className="text-[9px] block">
                            Selective Logic
                            <select
                              value={entry.selectiveLogic ?? 0}
                              onChange={e => patchEntry({ selectiveLogic: Number(e.target.value) as 0 | 1 | 2 | 3 }, entry.id)}
                              className="w-full mt-1 bg-white rounded-xl px-2.5 py-2 text-[9px] outline-none border border-[rgba(40,36,31,.1)]"
                            >
                              <option value="0">AND ANY</option>
                              <option value="1">NOT ALL</option>
                              <option value="2">NOT ANY</option>
                              <option value="3">AND ALL</option>
                            </select>
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="bg-[#f7f4f0] rounded-xl p-2 text-[9px]">
                            Role · Depth
                            <select
                              value={entry.role || 'system'}
                              onChange={e => patchEntry({ role: e.target.value as WorldBookEntry['role'] }, entry.id)}
                              className="w-full mt-1 bg-transparent outline-none text-[9px]"
                            >
                              <option value="system">SYSTEM</option>
                              <option value="user">USER</option>
                              <option value="assistant">ASSISTANT</option>
                            </select>
                          </label>
                          <label className="bg-[#f7f4f0] rounded-xl p-2 text-[9px]">
                            Group
                            <input
                              value={entry.group || ''}
                              onChange={e => patchEntry({ group: e.target.value }, entry.id)}
                              className="w-full mt-1 bg-transparent outline-none text-[9px]"
                              placeholder="例如：school"
                            />
                          </label>
                          <label className="bg-[#f7f4f0] rounded-xl p-2 text-[9px]">
                            Group Weight
                            <input
                              type="number"
                              min="0"
                              value={entry.groupWeight ?? 100}
                              onChange={e => patchEntry({ groupWeight: Math.max(0, Number(e.target.value) || 0) }, entry.id)}
                              className="w-full mt-1 bg-transparent outline-none font-mono text-[9px]"
                            />
                          </label>
                          <label className="bg-[#f7f4f0] rounded-xl p-2 text-[9px]">
                            Outlet
                            <input
                              value={entry.outletName || ''}
                              onChange={e => patchEntry({ outletName: e.target.value }, entry.id)}
                              className="w-full mt-1 bg-transparent outline-none text-[9px]"
                              placeholder="可选"
                            />
                          </label>
                        </div>
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Prevent Recursion · 阻止继续递归</span>
                          <input type="checkbox" checked={Boolean(entry.preventRecursion)} onChange={e => patchEntry({ preventRecursion: e.target.checked }, entry.id)} />
                        </label>
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Exclude Recursion · 不被递归触发</span>
                          <input type="checkbox" checked={Boolean(entry.excludeRecursion)} onChange={e => patchEntry({ excludeRecursion: e.target.checked }, entry.id)} />
                        </label>
                      </div>}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => patchEntry({ enabled: !entry.enabled }, entry.id)}
                        className="inline-flex items-center gap-1.5 text-[10px] text-[#655f59]"
                      >
                        {entry.enabled ? <ToggleRight className="w-4 h-4 text-[#8b7560]" /> : <ToggleLeft className="w-4 h-4" />}
                        条目 {entry.enabled ? '启用' : '停用'}
                      </button>
                      <button type="button" onClick={removeEntry} className="inline-flex items-center gap-1.5 text-[10px] text-[#9b625b]">
                        <Trash2 className="w-3.5 h-3.5" />删除条目
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredEntries.length === 0 && (
            <div className="px-2 py-8 text-center text-[8px] leading-relaxed text-[#9a9289]">
              {book ? (book.entries.length ? '没有匹配的条目' : '这本世界书还没有条目') : '请先创建或导入一本世界书'}
              {book && !book.entries.length && (
                <button type="button" onClick={addEntry} className="mt-2 block mx-auto text-[10px] text-[#8b7560]">创建第一条</button>
              )}
            </div>
          )}
          <button type="button" onClick={addEntry} className="w-full p-2.5 rounded-xl border border-dashed border-[#8b7560]/40 text-[10px] text-[#8b7560]">
            ＋ 新条目
          </button>
        </div>}
      </div>

      {book && books.length > 1 && (
        <button
          onClick={() => removeBook()}
          className="absolute z-30 right-4 bottom-12 px-3 py-1.5 rounded-full bg-[#292724] text-white text-[9px]"
        >
          删除当前世界书
        </button>
      )}

      {notice && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px]">
          {notice}
        </div>
      )}
    </div>
  );
}
