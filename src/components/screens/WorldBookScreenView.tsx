import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Download, Plus, Trash2, ChevronDown, ChevronUp, ChevronRight, ToggleRight, ToggleLeft, Settings2 } from 'lucide-react';
import { ScreenType, WorldBook, WorldBookEntry } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import { exportNativeWorldBook, importWorldBooksFromFile } from '../../store/worldbookFormats';
import { coalesceGlobalIds, syncBooksGlobalScopes } from '../../store/worldbookRuntime';
import { selectWorldBookEntries } from '../../ai/contextEngine';

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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [books, setBooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [screenMode, setScreenMode] = useState<'home' | 'library' | 'online-global' | 'offline-global' | 'character-books'>('home');
  const [innerView, setInnerView] = useState<'list' | 'detail'>('list');
  const [selectedBookId, setSelectedBookId] = useState(books[0]?.id || '');
  const [selectedEntryId, setSelectedEntryId] = useState(books[0]?.entries[0]?.id || '');
  const [search, setSearch] = useState('');
  const [bookSearch, setBookSearch] = useState('');
  const [bindFilter, setBindFilter] = useState<'all' | 'bound' | 'unbound'>('bound');
  const [listEditMode, setListEditMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [bookInfoOpen, setBookInfoOpen] = useState(false);
  const [activeNowText, setActiveNowText] = useState('');
  const [activeNowOpen, setActiveNowOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [onlineGlobalIds, setOnlineGlobalIds] = usePersistentState<string[]>('phone:worldbook:global-online-ids', []);
  const [offlineGlobalIds, setOfflineGlobalIds] = usePersistentState<string[]>('phone:worldbook:global-offline-ids', []);

  // Migrate: merge book.globalScopes into ID lists once, then keep both in sync.
  useEffect(() => {
    const nextOnline = coalesceGlobalIds(books, onlineGlobalIds, 'online-chat');
    const nextOffline = coalesceGlobalIds(books, offlineGlobalIds, 'offline-story');
    if (nextOnline.length !== onlineGlobalIds.length || nextOnline.some((id, i) => id !== onlineGlobalIds[i])) {
      setOnlineGlobalIds(nextOnline);
    }
    if (nextOffline.length !== offlineGlobalIds.length || nextOffline.some((id, i) => id !== offlineGlobalIds[i])) {
      setOfflineGlobalIds(nextOffline);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot migration from book.globalScopes
  }, []);

  useEffect(() => {
    setBooks(prev => syncBooksGlobalScopes(prev, onlineGlobalIds, offlineGlobalIds));
  }, [onlineGlobalIds, offlineGlobalIds, setBooks]);

  const setOnlineGlobal = (bookId: string, enabled: boolean) => {
    setOnlineGlobalIds(prev => enabled ? Array.from(new Set([...prev, bookId])) : prev.filter(id => id !== bookId));
  };
  const setOfflineGlobal = (bookId: string, enabled: boolean) => {
    setOfflineGlobalIds(prev => enabled ? Array.from(new Set([...prev, bookId])) : prev.filter(id => id !== bookId));
  };

  const onlineGlobals = books.filter(item => onlineGlobalIds.includes(item.id));
  const offlineGlobals = books.filter(item => offlineGlobalIds.includes(item.id));
  const characterBooks = books.filter(item => item.sourceType === 'character-card');
  // 每个分类页各自的「全部世界书」：线上 / 线下 / 角色 / 资料库互不混装
  const scopePool = screenMode === 'online-global' || screenMode === 'offline-global'
    ? books
    : screenMode === 'character-books'
      ? characterBooks
      : books;
  const bookQuery = bookSearch.trim().toLowerCase();
  const matchBook = (item: WorldBook) => !bookQuery
    || item.name.toLowerCase().includes(bookQuery)
    || (item.description || '').toLowerCase().includes(bookQuery)
    || (item.sourceCharacterName || '').toLowerCase().includes(bookQuery)
    || (item.tags || []).some(tag => tag.toLowerCase().includes(bookQuery));
  const isBoundInCurrentScope = (item: WorldBook) =>
    screenMode === 'online-global' ? onlineGlobalIds.includes(item.id)
      : screenMode === 'offline-global' ? offlineGlobalIds.includes(item.id)
        : true;
  const scopeBooks = scopePool.filter(item => {
    if (!matchBook(item)) return false;
    if (screenMode === 'online-global' || screenMode === 'offline-global') {
      if (bindFilter === 'bound') return isBoundInCurrentScope(item);
      if (bindFilter === 'unbound') return !isBoundInCurrentScope(item);
    }
    return true;
  });
  const boundCount = screenMode === 'online-global' ? onlineGlobals.length
    : screenMode === 'offline-global' ? offlineGlobals.length
      : screenMode === 'character-books' ? characterBooks.length
        : books.length;
  const book = books.find(item => item.id === selectedBookId) || null;
  const isOnlineGlobal = !!book && onlineGlobalIds.includes(book.id);
  const isOfflineGlobal = !!book && offlineGlobalIds.includes(book.id);
  const selectedEntry = book?.entries.find(item => item.id === selectedEntryId) || book?.entries[0] || null;
  const enabledCount = book?.entries.filter(entry => entry.enabled).length || 0;
  const modeTitle =
    screenMode === 'online-global' ? '线上世界书'
      : screenMode === 'offline-global' ? '线下世界书'
        : screenMode === 'character-books' ? '角色世界书'
          : '我的世界书';
  const isScopePage = screenMode === 'online-global' || screenMode === 'offline-global';
  const scopeLabel = screenMode === 'online-global' ? '线上' : screenMode === 'offline-global' ? '线下' : '';
  const modeSub =
    screenMode === 'online-global' ? '管理线上全局世界书；点编辑后可勾选加入或删除'
      : screenMode === 'offline-global' ? '管理线下全局世界书；点编辑后可勾选加入或删除'
        : screenMode === 'character-books' ? '查看随角色卡导入的专属设定'
          : '导入、创建、编辑与绑定资料库';
  const listTitle =
    screenMode === 'online-global' ? '线上全部世界书'
      : screenMode === 'offline-global' ? '线下全部世界书'
        : screenMode === 'character-books' ? '角色全部世界书'
          : '全部世界书';
  const globalChipLabel = screenMode === 'online-global' ? '线上全局' : screenMode === 'offline-global' ? '线下全局' : '全局世界书';

  useEffect(() => {
    if (screenMode === 'home') return;
    setInnerView('list');
    setBookSearch('');
    setBindFilter(isScopePage ? 'bound' : 'all');
    setListEditMode(false);
    setCheckedIds([]);
    setExpandedEntryId(null);
    setBookInfoOpen(false);
    setActiveNowOpen(false);
  }, [screenMode, isScopePage]);

  useEffect(() => {
    if (innerView !== 'detail' || !selectedBookId) return;
    const activeBook = books.find(item => item.id === selectedBookId);
    if (!activeBook) {
      setInnerView('list');
      setSelectedBookId('');
      setSelectedEntryId('');
      return;
    }
    const activeEntry = activeBook.entries.find(item => item.id === selectedEntryId) || activeBook.entries[0];
    const nextEntryId = activeEntry?.id || '';
    if (nextEntryId !== selectedEntryId) setSelectedEntryId(nextEntryId);
  }, [books, innerView, selectedBookId, selectedEntryId]);

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

  const matchingEntries = useMemo(() => {
    if (!book || !activeNowText.trim()) return [];
    return selectWorldBookEntries([book], activeNowText).map(item => item.entry);
  }, [book, activeNowText]);

  const openBookDetail = (bookId: string) => {
    const next = books.find(item => item.id === bookId);
    if (!next) return;
    setSelectedBookId(next.id);
    setSelectedEntryId(next.entries[0]?.id || '');
    setExpandedEntryId(null);
    setAdvancedOpen(false);
    setBookInfoOpen(false);
    setActiveNowOpen(false);
    setInnerView('detail');
  };

  const toggleChecked = (bookId: string) => {
    setCheckedIds(prev => prev.includes(bookId) ? prev.filter(id => id !== bookId) : [...prev, bookId]);
  };

  const startPickForGlobal = () => {
    setBindFilter('all');
    setListEditMode(true);
    setCheckedIds([]);
    showNotice(`勾选要放入${scopeLabel}全局的世界书，再点「加入全局」`);
  };

  const applyCheckedToGlobal = (enabled: boolean) => {
    if (!checkedIds.length) {
      showNotice('请先勾选世界书');
      return;
    }
    if (screenMode === 'online-global') {
      checkedIds.forEach(id => setOnlineGlobal(id, enabled));
    } else if (screenMode === 'offline-global') {
      checkedIds.forEach(id => setOfflineGlobal(id, enabled));
    }
    showNotice(enabled ? `已将 ${checkedIds.length} 本加入${scopeLabel}全局` : `已将 ${checkedIds.length} 本移出${scopeLabel}全局`);
    setCheckedIds([]);
    setListEditMode(false);
    setBindFilter('bound');
  };

  const deleteCheckedBooks = () => {
    if (!checkedIds.length) {
      showNotice('请先勾选世界书');
      return;
    }
    if (!window.confirm(`删除勾选的 ${checkedIds.length} 本世界书？其中的设定条目也会一起删除。`)) return;
    const removeSet = new Set(checkedIds);
    setBooks(prev => prev.filter(item => !removeSet.has(item.id)));
    setOnlineGlobalIds(prev => prev.filter(id => !removeSet.has(id)));
    setOfflineGlobalIds(prev => prev.filter(id => !removeSet.has(id)));
    if (selectedBookId && removeSet.has(selectedBookId)) {
      setSelectedBookId('');
      setSelectedEntryId('');
    }
    showNotice(`已删除 ${checkedIds.length} 本世界书`);
    setCheckedIds([]);
    setListEditMode(false);
  };

  const handleBack = () => {
    if (expandedEntryId) {
      setExpandedEntryId(null);
      setAdvancedOpen(false);
      return;
    }
    if (listEditMode) {
      setListEditMode(false);
      setCheckedIds([]);
      return;
    }
    if (screenMode !== 'home' && innerView === 'detail') {
      setInnerView('list');
      setExpandedEntryId(null);
      setBookInfoOpen(false);
      setActiveNowOpen(false);
      return;
    }
    if (screenMode !== 'home') {
      setScreenMode('home');
      setInnerView('list');
      setExpandedEntryId(null);
      setBookInfoOpen(false);
      setActiveNowOpen(false);
      setBookSearch('');
      setListEditMode(false);
      setCheckedIds([]);
      return;
    }
    onNavigate('home');
  };

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

  const toggleEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setAdvancedOpen(false);
    setExpandedEntryId(current => (current === entryId ? null : entryId));
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
      sourceType: 'manual',
      updatedAt: new Date().toISOString(),
    };
    setBooks(prev => [next, ...prev]);
    if (screenMode === 'online-global') setOnlineGlobal(id, true);
    if (screenMode === 'offline-global') setOfflineGlobal(id, true);
    setSelectedBookId(id);
    setSelectedEntryId('');
    setExpandedEntryId(null);
    setInnerView('detail');
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
    setOnlineGlobalIds(prev => prev.filter(id => id !== bookId));
    setOfflineGlobalIds(prev => prev.filter(id => id !== bookId));
    if (selectedBookId === bookId) {
      setSelectedBookId(next[0]?.id || '');
      setSelectedEntryId(next[0]?.entries[0]?.id || '');
    }
    showNotice('世界书已删除');
  };

  const importBook = async (file?: File) => {
    if (!file) return;
    try {
      const normalized = await importWorldBooksFromFile(file);
      setBooks(prev => [
        ...normalized.map(item => ({
          ...item,
          sourceType: item.sourceType || 'imported',
          enabled: screenMode === 'library' ? item.enabled : true,
        })),
        ...prev.filter(existing => !normalized.some(item => item.id === existing.id)),
      ]);
      if (screenMode === 'online-global') {
        setOnlineGlobalIds(prev => Array.from(new Set([...prev, ...normalized.map(item => item.id)])));
      }
      if (screenMode === 'offline-global') {
        setOfflineGlobalIds(prev => Array.from(new Set([...prev, ...normalized.map(item => item.id)])));
      }
      setSelectedBookId(normalized[0]?.id || '');
      setSelectedEntryId(normalized[0]?.entries?.[0]?.id || '');
      setInnerView(normalized[0] ? 'detail' : 'list');
      showNotice(`已识别并导入 ${normalized.length} 本世界书`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '世界书导入失败');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div
      className="relative w-full h-full min-w-0 flex flex-col overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
      onTouchStart={event => {
        const touch = event.touches[0];
        touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={event => {
        const start = touchStartRef.current;
        const touch = event.changedTouches[0];
        touchStartRef.current = null;
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (dx > 85 && Math.abs(dy) < 70) handleBack();
      }}
    >
      <input
        ref={importRef}
        type="file"
        accept=".json,.yaml,.yml,.txt,.md,.docx,application/json,text/yaml,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={e => importBook(e.target.files?.[0])}
      />

      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      {screenMode === 'home' && <div className="absolute inset-0 z-30 overflow-y-auto px-5 pt-12 pb-8" style={{ background: 'var(--paper)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72]">LOREBOOK · CONTEXT</div>
            <h2 className="mt-2 font-serif font-bold text-2xl tracking-tight text-[#242323]">世界书</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[#817a72]">管理故事背景、角色设定与聊天上下文</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="w-8 h-8 shrink-0 rounded-full bg-white/40 border border-white/60 grid place-items-center text-[#242323]"
            aria-label="返回桌面"
            title="返回桌面"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-6 space-y-3">
          <button type="button" onClick={() => setScreenMode('online-global')} className="w-full rounded-2xl border border-[rgba(40,36,31,.1)] bg-white/65 p-4 text-left"><div className="flex items-center justify-between"><span className="text-sm font-serif font-bold text-[#302d29]">线上世界书</span><BookOpen className="w-4 h-4 text-[#8b7560]" /></div><p className="mt-1 text-[10px] text-[#8b847d]">管理线上全局；编辑后勾选加入或删除</p><div className="mt-3 text-[9px] text-[#8b7560]">{onlineGlobals.length} 本线上全局　→</div></button>
          <button type="button" onClick={() => setScreenMode('offline-global')} className="w-full rounded-2xl border border-[rgba(40,36,31,.1)] bg-white/65 p-4 text-left"><div className="flex items-center justify-between"><span className="text-sm font-serif font-bold text-[#302d29]">线下世界书</span><BookOpen className="w-4 h-4 text-[#8b7560]" /></div><p className="mt-1 text-[10px] text-[#8b847d]">管理线下全局；编辑后勾选加入或删除</p><div className="mt-3 text-[9px] text-[#8b7560]">{offlineGlobals.length} 本线下全局　→</div></button>
          <button type="button" onClick={() => setScreenMode('library')} className="w-full rounded-2xl border border-[rgba(40,36,31,.1)] bg-white/65 p-4 text-left"><div className="flex items-center justify-between"><span className="text-sm font-serif font-bold text-[#302d29]">我的世界书</span><BookOpen className="w-4 h-4 text-[#8b7560]" /></div><p className="mt-1 text-[10px] text-[#8b847d]">导入、创建、编辑和管理世界书资料库</p><div className="mt-3 text-[9px] text-[#8b7560]">{books.length} 本资料　→</div></button>
          <button type="button" onClick={() => setScreenMode('character-books')} className="w-full rounded-2xl border border-[rgba(40,36,31,.1)] bg-white/65 p-4 text-left"><div className="flex items-center justify-between"><span className="text-sm font-serif font-bold text-[#302d29]">角色世界书</span><BookOpen className="w-4 h-4 text-[#8b7560]" /></div><p className="mt-1 text-[10px] text-[#8b847d]">查看从角色卡导入的专属设定</p><div className="mt-3 text-[9px] text-[#8b7560]">{characterBooks.length} 本角色设定　→</div></button>
        </div>
        <div className="mt-5 rounded-xl bg-white/40 border border-[rgba(40,36,31,.08)] p-3 text-[9px] leading-relaxed text-[#8b847d]">线上 / 线下页默认看全局世界书；点编辑后勾选，可批量加入全局或删除。真正注入仍需在 LINE 或线下剧情里再勾选。</div>
      </div>}
      <header className={`${screenMode === 'home' ? 'hidden' : 'relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[color-mix(in_srgb,var(--paper)_92%,white_8%)] backdrop-blur-xl flex items-center justify-between'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleBack}
            className="w-8 h-8 shrink-0 rounded-full bg-white/40 border border-white/60 grid place-items-center text-xs text-[#242323]"
            aria-label="返回"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">
              {innerView === 'detail' ? 'WORLD BOOK · DETAIL' : screenMode === 'online-global' ? 'ONLINE' : screenMode === 'offline-global' ? 'OFFLINE' : screenMode === 'character-books' ? 'CHARACTER' : 'LIBRARY'}
            </div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323] truncate">
              {innerView === 'detail' ? (book?.name || modeTitle) : modeTitle}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {screenMode !== 'character-books' && innerView === 'list' && (
            <>
              <button onClick={addBook} className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center" aria-label="新建世界书" title="新建世界书"><Plus className="w-3.5 h-3.5" /></button>
              <button onClick={() => importRef.current?.click()} className="w-8 h-8 rounded-full bg-white/60 border border-[rgba(40,36,31,.12)] text-[#514b45] grid place-items-center" aria-label="导入世界书" title="导入世界书"><BookOpen className="w-3.5 h-3.5" /></button>
            </>
          )}
          {innerView === 'detail' && book && (
            <span className="px-2.5 py-1 rounded-full border border-[rgba(40,36,31,.12)] bg-white/60 text-[9px] text-[#716a63]">
              {book.entries.length} 条
            </span>
          )}
        </div>
      </header>

      <div className={`${screenMode === 'home' ? 'hidden' : 'relative z-10 flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden'}`}>
        {innerView === 'list' && (
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 pt-3 pb-2 space-y-2 border-b border-[rgba(40,36,31,.06)]">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif font-bold text-lg text-[#302d29]">{modeTitle}</h3>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[#8b847d]">{modeSub}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-full border border-[rgba(40,36,31,.12)] bg-white/65 text-[9px] text-[#716a63]">
                    {boundCount} 本
                  </span>
                  {screenMode !== 'character-books' && (
                    <button
                      type="button"
                      onClick={() => {
                        setListEditMode(value => {
                          if (value) setCheckedIds([]);
                          return !value;
                        });
                      }}
                      className={`h-8 px-2.5 rounded-xl border text-[9px] inline-flex items-center gap-1 ${listEditMode ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/80 text-[#655f59] border-[rgba(40,36,31,.12)]'}`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />{listEditMode ? '完成' : '编辑'}
                    </button>
                  )}
                </div>
              </div>

              {screenMode !== 'character-books' && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addBook} className="px-3 py-2 rounded-full bg-[#292724] text-white text-[10px]">新建</button>
                  <button type="button" onClick={() => importRef.current?.click()} className="px-3 py-2 rounded-full border border-[rgba(40,36,31,.15)] bg-white/70 text-[10px]">导入</button>
                  {isScopePage && (
                    <button type="button" onClick={startPickForGlobal} className="px-3 py-2 rounded-full border border-[#d5dccd] bg-[#e9ede5] text-[#5f6d57] text-[10px]">
                      选择加入全局
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(40,36,31,.1)] bg-white/70">
                <input
                  value={bookSearch}
                  onChange={e => setBookSearch(e.target.value)}
                  placeholder="搜索已导入的世界书…"
                  aria-label="搜索世界书"
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none text-[#444]"
                />
                <span className="shrink-0 text-[9px] text-[#9a9289]">{scopeBooks.length}</span>
              </div>

              {isScopePage && (
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: 'all' as const, label: '全部已导入' },
                    { id: 'bound' as const, label: globalChipLabel },
                    { id: 'unbound' as const, label: '未加入' },
                  ]).map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setBindFilter(chip.id)}
                      className={`px-2.5 py-1.5 rounded-full border text-[9px] ${bindFilter === chip.id ? 'bg-[#e9ede5] text-[#5f6d57] border-[#d5dccd]' : 'bg-white/65 text-[#777268] border-[rgba(40,36,31,.12)]'}`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between px-0.5">
                <div className="font-serif font-bold text-[13px] text-[#302d29]">{listTitle}</div>
                <div className="text-[9px] text-[#9a9289]">
                  {listEditMode
                    ? (isScopePage ? `已选 ${checkedIds.length} · 灰勾=已在全局` : `已选 ${checkedIds.length}`)
                    : isScopePage ? '先点编辑再勾选' : '纵向列表'}
                </div>
              </div>
            </div>

            <div className={`flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pt-2 ${listEditMode ? 'pb-28' : 'pb-20'} space-y-2`}>
              {scopeBooks.map(item => {
                const bound = screenMode === 'online-global'
                  ? onlineGlobalIds.includes(item.id)
                  : screenMode === 'offline-global'
                    ? offlineGlobalIds.includes(item.id)
                    : onlineGlobalIds.includes(item.id) || offlineGlobalIds.includes(item.id);
                const checked = checkedIds.includes(item.id);
                const badgeLabel = screenMode === 'library'
                  ? ([onlineGlobalIds.includes(item.id) ? '线上' : '', offlineGlobalIds.includes(item.id) ? '线下' : '', item.sourceType === 'character-card' ? '角色' : ''].filter(Boolean).join(' · ') || '资料')
                  : (item.sourceCharacterName || '角色卡');
                return (
                  <div key={item.id} className={`rounded-2xl border bg-white/70 flex items-center gap-2 px-3 py-3 ${checked ? 'border-[#292724]/35 bg-white/90' : bound && isScopePage ? 'border-[#d5dccd]' : 'border-[rgba(40,36,31,.1)]'}`}>
                    {listEditMode && (
                      <button
                        type="button"
                        onClick={() => toggleChecked(item.id)}
                        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
                        aria-label={
                          isScopePage && bound
                            ? (checked ? '取消选中（已在全局）' : '已在全局，点按可选中后移出或删除')
                            : (checked ? '取消勾选' : '勾选')
                        }
                        title={isScopePage && bound ? '灰色勾 = 已在全局' : undefined}
                      >
                        {/* 已在全局：灰色勾；未加入：可勾选的正常勾 */}
                        <span
                          className={`grid place-items-center w-4.5 h-4.5 rounded-[4px] border text-[10px] leading-none ${
                            isScopePage && bound
                              ? 'border-[#b7c0b0] bg-[#e4e8e0] text-[#8a9483]'
                              : checked
                                ? 'border-[#5f6d57] bg-[#6d7b68] text-white'
                                : 'border-[#c4bfb6] bg-white text-transparent'
                          }`}
                          style={{ width: 18, height: 18 }}
                        >
                          {(isScopePage && bound) || checked ? '✓' : ''}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => listEditMode ? toggleChecked(item.id) : openBookDetail(item.id)}
                      className="min-w-0 flex-1 flex items-center gap-2.5 text-left"
                    >
                      <div className="w-9 h-10 shrink-0 rounded-lg bg-[#eeece4] grid place-items-center text-[#8c887d]">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-[#302d29] truncate">{item.name}</div>
                        <div className="mt-1 text-[9px] text-[#8b847d]">
                          {item.entries.length} 个条目 · {item.enabled ? '已启用' : '已停用'}
                          {isScopePage && !listEditMode && (
                            <span className={bound ? ' text-[#65715d]' : ''}> · {bound ? `已在${scopeLabel}全局` : '未加入'}</span>
                          )}
                          {isScopePage && listEditMode && bound && (
                            <span className="text-[#8a9483]"> · 已在全局</span>
                          )}
                        </div>
                      </div>
                    </button>
                    {!isScopePage && (
                      <span className="shrink-0 px-2 py-1 rounded-md text-[8px] bg-[#edf0e9] text-[#65715d]">{badgeLabel}</span>
                    )}
                    {!listEditMode && (
                      <button type="button" onClick={() => openBookDetail(item.id)} aria-label="打开世界书" className="shrink-0">
                        <ChevronRight className="w-4 h-4 text-[#a29d93]" />
                      </button>
                    )}
                  </div>
                );
              })}
              {scopeBooks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[rgba(40,36,31,.14)] bg-white/40 px-4 py-8 text-center text-[10px] text-[#8b847d]">
                  {bookQuery
                    ? '没有匹配的世界书'
                    : bindFilter === 'bound' && isScopePage
                      ? `还没有${scopeLabel}全局世界书。可点上方「选择加入全局」。`
                      : screenMode === 'character-books'
                        ? '还没有角色卡专属世界书。'
                        : books.length === 0
                          ? '还没有世界书，请先新建或导入。'
                          : '当前筛选下没有世界书。'}
                </div>
              )}
            </div>

            {listEditMode && (
              <div className="shrink-0 px-4 py-2.5 border-t border-[rgba(40,36,31,.08)] bg-[color-mix(in_srgb,var(--paper)_94%,white_6%)] flex flex-wrap items-center gap-2">
                <span className="text-[9px] text-[#8b847d]">已选 {checkedIds.length}</span>
                {isScopePage && (
                  <>
                    <button type="button" onClick={() => applyCheckedToGlobal(true)} className="px-2.5 py-1.5 rounded-full bg-[#292724] text-white text-[9px]">加入全局</button>
                    <button type="button" onClick={() => applyCheckedToGlobal(false)} className="px-2.5 py-1.5 rounded-full border border-[rgba(40,36,31,.12)] text-[9px] text-[#655f59]">移出全局</button>
                  </>
                )}
                {screenMode === 'library' && (
                  <>
                    <button type="button" onClick={() => { checkedIds.forEach(id => setOnlineGlobal(id, true)); showNotice(`已将 ${checkedIds.length} 本加入线上全局`); setCheckedIds([]); setListEditMode(false); }} className="px-2.5 py-1.5 rounded-full bg-[#292724] text-white text-[9px]">加入线上</button>
                    <button type="button" onClick={() => { checkedIds.forEach(id => setOfflineGlobal(id, true)); showNotice(`已将 ${checkedIds.length} 本加入线下全局`); setCheckedIds([]); setListEditMode(false); }} className="px-2.5 py-1.5 rounded-full border border-[rgba(40,36,31,.12)] text-[9px] text-[#655f59]">加入线下</button>
                  </>
                )}
                <button type="button" onClick={deleteCheckedBooks} className="px-2.5 py-1.5 rounded-full border border-[#e7d0cc] text-[9px] text-[#9b625b]">删除</button>
              </div>
            )}
          </div>
        )}

        {innerView === 'detail' && book && <div className="shrink-0 px-4 pt-3 pb-2">
          <button
            onClick={() => setBookInfoOpen(value => !value)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] text-[9px] text-[#6d665f]"
          >
            <span className="inline-flex items-center gap-1.5"><BookOpen className="w-3 h-3" />基本信息与绑定</span>
            {bookInfoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {bookInfoOpen && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
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
              <div className="space-y-2 px-1">
                <label className="flex items-center justify-between text-[10px] text-[#655f59]">
                  <span>启用这本世界书</span>
                  <input
                    type="checkbox"
                    checked={book.enabled}
                    onChange={() => setBooks(prev => prev.map(item => item.id === book.id ? { ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() } : item))}
                    className="h-3.5 w-3.5 accent-[#6d7b68]"
                  />
                </label>
                <label className="flex items-center justify-between text-[10px] text-[#655f59]">
                  <span>勾选加入线上全局</span>
                  <input
                    type="checkbox"
                    checked={isOnlineGlobal}
                    onChange={() => { setOnlineGlobal(book.id, !isOnlineGlobal); showNotice(isOnlineGlobal ? '已取消线上全局' : '已勾选加入线上全局'); }}
                    className="h-3.5 w-3.5 accent-[#6d7b68]"
                  />
                </label>
                <label className="flex items-center justify-between text-[10px] text-[#655f59]">
                  <span>勾选加入线下全局</span>
                  <input
                    type="checkbox"
                    checked={isOfflineGlobal}
                    onChange={() => { setOfflineGlobal(book.id, !isOfflineGlobal); showNotice(isOfflineGlobal ? '已取消线下全局' : '已勾选加入线下全局'); }}
                    className="h-3.5 w-3.5 accent-[#6d7b68]"
                  />
                </label>
                <button type="button" onClick={() => { removeBook(book.id); setInnerView('list'); }} className="text-[10px] text-[#9b625b]">删除世界书</button>
              </div>
            </div>
          )}
        </div>}

        {innerView === 'detail' && book && <div className="shrink-0 px-4 pb-2 space-y-2">
          <div className="rounded-2xl bg-[#292724] text-white overflow-hidden">
            <button onClick={() => setActiveNowOpen(value => !value)} className="w-full p-3 flex items-center justify-between text-left">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-white/45">WORLD BOOK · STATUS</div>
                <div className="mt-1 text-[12px] font-serif font-bold">
                  {enabledCount} / {book?.entries.length || 0} 条目已启用
                  {isOnlineGlobal ? ' · 可供 LINE 勾选' : ''}
                  {isOfflineGlobal ? ' · 可供线下勾选' : ''}
                  {!isOnlineGlobal && !isOfflineGlobal ? ' · 未绑定全局' : ''}
                </div>
              </div>
              {activeNowOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/50" /> : <ChevronDown className="w-3.5 h-3.5 text-white/50" />}
            </button>
            {activeNowOpen && <div className="px-3 pb-3">
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <div className="text-[8px] text-white/45">用于检查当前文字会命中哪些条目</div>
                <button onClick={() => { const next = window.prompt('输入一段文字测试世界书触发'); if (next !== null) setActiveNowText(next); }} className="px-2.5 py-1.5 rounded-full bg-white/10 text-[8px]">测试触发</button>
              </div>
              {activeNowText ? <div className="mt-2"><div className="text-[8px] text-white/45 truncate">SCAN · {activeNowText}</div><div className="mt-2 flex flex-wrap gap-1.5">{matchingEntries.length ? matchingEntries.map(entry => <button key={entry.id} onClick={() => toggleEntry(entry.id)} className="px-2 py-1 rounded-full bg-white/10 text-[8px]">● {entry.name}</button>) : <span className="text-[8px] text-white/45">当前没有命中已启用条目</span>}</div></div> : null}
            </div>}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center min-w-0">
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
              className="min-w-0 flex-1 basis-[120px] bg-white/60 border border-[rgba(40,36,31,.12)] rounded-xl px-3 py-2 text-xs outline-none text-[#444]"
            />
            <button
              onClick={() => importRef.current?.click()}
              className="shrink-0 px-2.5 py-2 rounded-xl bg-[#292724] text-white text-[9px]"
              title="导入世界书（含 SillyTavern 等格式）"
            >
              导入
            </button>
            <button
              onClick={() => book && downloadJson(`${book.name}.json`, JSON.parse(exportNativeWorldBook(book)))}
              className="shrink-0 px-2.5 py-2 rounded-xl bg-[color-mix(in_srgb,var(--paper)_82%,white_18%)] border border-[rgba(40,36,31,.12)] text-[9px] text-[#5d5751]"
            >
              <Download className="w-3 h-3 inline mr-1" />导出
            </button>
          </div>
        </div>}

        {innerView === 'detail' && !book && (
          <div className="flex-1 grid place-items-center px-6 text-center text-[10px] text-[#8b847d]">
            这本世界书不存在或已被删除
            <button type="button" onClick={() => setInnerView('list')} className="mt-3 text-[#8b7560]">返回列表</button>
          </div>
        )}

        {innerView === 'detail' && book && <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar px-4 pb-24 space-y-1.5">
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
                <div className="flex items-start gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntryId(entry.id);
                      patchEntry({ enabled: !entry.enabled }, entry.id);
                    }}
                    className={`mt-0.5 shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] border ${
                      expanded
                        ? entry.enabled
                          ? 'bg-[#edf0e9] text-[#65715d] border-[#d5dccd]'
                          : 'bg-[#f3eee5] text-[#9a8156] border-[#e7dcc8]'
                        : selectedEntry?.id === entry.id
                          ? entry.enabled
                            ? 'bg-white/15 text-white border-white/25'
                            : 'bg-white/10 text-white/70 border-white/20'
                          : entry.enabled
                            ? 'bg-[#edf0e9] text-[#65715d] border-[#d5dccd]'
                            : 'bg-[#f3eee5] text-[#9a8156] border-[#e7dcc8]'
                    }`}
                    aria-label={entry.enabled ? '停用条目' : '启用条目'}
                  >
                    {entry.enabled ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                    {entry.enabled ? '启用' : '停用'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleEntry(entry.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={expanded}
                  >
                    <div className="text-[10px] font-semibold break-words">{entry.name}</div>
                    <div className={`mt-1 text-[8px] font-mono ${expanded ? 'text-[#8b847d]' : 'opacity-70'}`}>
                      {entry.priority} · {entry.keywords.length} key · {entry.enabled ? 'ON' : 'OFF'}
                    </div>
                  </button>
                  <button type="button" onClick={() => toggleEntry(entry.id)} aria-label={expanded ? '收起条目' : '查看并编辑条目'} className="shrink-0 mt-0.5">
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
                  </button>
                </div>
                {expanded && (
                  <div className="px-2.5 pb-2.5 space-y-2 border-t border-[rgba(40,36,31,.08)] pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => patchEntry({ enabled: !entry.enabled }, entry.id)}
                        className="inline-flex items-center gap-1.5 text-[10px] text-[#655f59]"
                      >
                        {entry.enabled ? <ToggleRight className="w-4 h-4 text-[#8b7560]" /> : <ToggleLeft className="w-4 h-4" />}
                        条目 {entry.enabled ? '启用中' : '已停用'}
                      </button>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => toggleEntry(entry.id)} className="text-[10px] text-[#8b7560]">收起</button>
                        <button type="button" onClick={removeEntry} className="inline-flex items-center gap-1 text-[10px] text-[#9b625b]">
                          <Trash2 className="w-3.5 h-3.5" />删除
                        </button>
                      </div>
                    </div>
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
                        <label className="flex items-center justify-between text-[9px] py-1">
                          <span>Use Regex · 关键词按正则</span>
                          <input type="checkbox" checked={Boolean(entry.useRegex)} onChange={e => patchEntry({ useRegex: e.target.checked }, entry.id)} />
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

      {notice && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px]">
          {notice}
        </div>
      )}
      <button
        type="button"
        aria-label="返回上一级"
        title="返回上一级"
        onClick={handleBack}
        className="absolute z-[60] bottom-0 left-1/2 -translate-x-1/2 w-32 h-6 flex items-center justify-center bg-transparent"
      >
        <span aria-hidden="true" className="block w-28 h-1 rounded-full bg-[#292724]/75" />
      </button>
    </div>
  );
}
