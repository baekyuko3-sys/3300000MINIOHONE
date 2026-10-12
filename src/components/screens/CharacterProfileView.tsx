import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Brain, Download, Edit3, FileDown, FilePlus2, Folder, Plus, ShieldCheck, Trash2, UserRound, X, Settings2, Upload } from 'lucide-react';
import { ScreenType } from '../../types';
import { usePersistentState } from '../../store/usePersistentState';
import {
  ImportedCharacter,
  exportCharacterJson,
  exportCharacterCardV2,
  parseCharacterFile,
} from '../../data/characterImport';
import type { CharacterMemory } from '../../store/characterMemory';
import type { WorldBook } from '../../types';
import { getWorldRuntime, removeCharacterRuntime } from '../../store/worldRuntime';
import {
  addCharacterMemoryItem,
  deleteCharacterMemoryItem,
  getCharacterMemory,
  saveCharacterMemory,
  clearCharacterMemory,
} from '../../store/characterMemory';
import { removeLineConversationData } from '../../store/lineRuntime';
import { removeCharacterOfflineEvents } from '../../store/offlineEvents';

interface CharacterProfileViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

async function compressCharacterAvatar(avatar: string): Promise<string> {
  if (!avatar || !avatar.startsWith('data:image/')) return avatar;
  // PNG character cards can carry very large embedded avatars. Storing that raw
  // base64 in localStorage can silently exceed the browser quota, which makes the
  // whole character list disappear after leaving this screen.
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = avatar;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('角色头像读取失败'));
    });

    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || maxSize) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || maxSize) * scale));
    const context = canvas.getContext('2d');
    if (!context) return avatar;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.82);
  } catch {
    return avatar;
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CharacterProfileView({ onNavigate }: CharacterProfileViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [worldBooks, setWorldBooks] = usePersistentState<WorldBook[]>('phone:worldbooks', []);
  const [groups, setGroups] = usePersistentState<Array<{ id: string; name: string }>>('phone:character-groups', []);
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [selectedId, setSelectedId] = usePersistentState<string | null>(
    'phone:active-character',
    null,
  );
  const [notice, setNotice] = useState('');
  const [importConfirmation, setImportConfirmation] = useState<{
    name: string;
    avatar: string;
    sourceFormat: string;
    creator: string;
    version: string;
    firstMessage: string;
    alternateGreetings: string[];
    worldBookCount: number;
    description: string;
  } | null>(null);
  const [runtimeTick, setRuntimeTick] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteWorldBooks, setDeleteWorldBooks] = useState(false);
  const [deleteChatHistory, setDeleteChatHistory] = useState(false);
  const [worldBookPickerOpen, setWorldBookPickerOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const visibleCharacters = selectedGroupId === 'all'
    ? characters
    : characters.filter(character => (character.groupId || 'ungrouped') === selectedGroupId);
  const selected = selectedId
    ? characters.find(character => character.id === selectedId) || null
    : null;
  const runtimeState = selected ? getWorldRuntime().characters[selected.id] : null;

  const characterSections = useMemo(() => {
    if (selectedGroupId !== 'all') {
      const group = groups.find(item => item.id === selectedGroupId);
      return [{ id: selectedGroupId, name: group?.name || '未分组', characters: visibleCharacters }];
    }

    const sections: Array<{ id: string; name: string; characters: ImportedCharacter[] }> = [];
    groups.forEach(group => {
      const items = characters.filter(character => character.groupId === group.id);
      if (items.length) sections.push({ id: group.id, name: group.name, characters: items });
    });
    const ungrouped = characters.filter(character => !character.groupId || !groups.some(group => group.id === character.groupId));
    if (ungrouped.length) sections.push({ id: 'ungrouped', name: 'UNSORTED · 未分组', characters: ungrouped });
    return sections;
  }, [characters, groups, selectedGroupId, visibleCharacters]);

  useEffect(() => {
    const refresh = () => setRuntimeTick(value => value + 1);
    window.addEventListener('sane333:world-state-changed', refresh);
    window.addEventListener('sane333:world-event', refresh);
    return () => {
      window.removeEventListener('sane333:world-state-changed', refresh);
      window.removeEventListener('sane333:world-event', refresh);
    };
  }, []);
  const [memory, setMemory] = useState<CharacterMemory>(
    () => selected ? getCharacterMemory(selected.id, selected.name) : {
      characterId: 'none',
      characterName: '',
      summary: '',
      items: [],
      updatedAt: new Date().toISOString(),
    },
  );

  useEffect(() => {
    setMemory(
      selected
        ? getCharacterMemory(selected.id, selected.name)
        : {
            characterId: 'none',
            characterName: '',
            summary: '',
            items: [],
            updatedAt: new Date().toISOString(),
          },
    );
  }, [selected?.id, selected?.name]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const patchSelected = (patch: Partial<ImportedCharacter>) => {
    if (!selected) return;
    setCharacters(prev =>
      prev.map(item => item.id === selected.id ? { ...item, ...patch } : item)
    );
  };

  const patchMemory = (patch: Partial<CharacterMemory>) => {
    if (!selected) return;
    const next = saveCharacterMemory({
      ...memory,
      ...patch,
      characterId: selected.id,
      characterName: selected.name,
    });
    setMemory(next);
  };

  const addMemory = () => {
    if (!selected) return;
    const content = window.prompt('写入一条会长期影响角色回复的记忆：');
    if (!content?.trim()) return;
    setMemory(addCharacterMemoryItem(selected.id, selected.name, content, { source: 'manual', importance: 70 }));
    showNotice('长期记忆已保存');
  };

  const removeMemory = (itemId: string) => {
    if (!selected) return;
    const next = deleteCharacterMemoryItem(selected.id, itemId);
    if (next) setMemory(next);
    showNotice('记忆条目已删除');
  };

  const createGroup = () => {
    const name = window.prompt('新建角色分组名称：');
    if (!name?.trim()) return;
    const group = { id: `group-${Date.now()}`, name: name.trim() };
    setGroups(prev => [...prev, group]);
    setSelectedGroupId(group.id);
    showNotice(`已创建分组「${group.name}」`);
  };

  const renameGroup = (groupId: string) => {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;
    const name = window.prompt('修改分组名称：', group.name);
    if (!name?.trim()) return;
    setGroups(prev => prev.map(item => item.id === groupId ? { ...item, name: name.trim() } : item));
    showNotice('分组名称已更新');
  };

  const deleteGroup = (groupId: string) => {
    const group = groups.find(item => item.id === groupId);
    if (!group || !window.confirm(`删除「${group.name}」？角色不会删除，只会移到“未分组”。`)) return;
    setGroups(prev => prev.filter(item => item.id !== groupId));
    setCharacters(prev => prev.map(character => character.groupId === groupId ? { ...character, groupId: null } : character));
    setSelectedGroupId('all');
    showNotice('分组已删除，角色已保留');
  };

  const createBlankCharacter = () => {
    const now = new Date().toISOString();
    const character: ImportedCharacter = {
      id: `char-manual-${Date.now()}`,
      name: '',
      variantLabel: '',
      avatar: '',
      description: '',
      personality: '',
      scenario: '',
      firstMessage: '',
      exampleDialogue: '',
      creatorNotes: '',
      systemPrompt: '',
      postHistoryInstructions: '',
      alternateGreetings: [],
      tags: [],
      creator: '',
      characterVersion: '',
      extensions: {},
      embeddedWorldBook: undefined,
      groupId: selectedGroupId === 'all' ? null : selectedGroupId,
      sourceFormat: 'manual',
      importedAt: now,
    };
    setCharacters(prev => [character, ...prev]);
    setSelectedId(character.id);
    setIsEditing(true);
    showNotice('已创建空白角色，请填写角色卡内容');
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseCharacterFile(file);
      const normalizedParsed = {
        ...parsed,
        avatar: await compressCharacterAvatar(parsed.avatar || ''),
      };
      setCharacters(prev => {
        const existing = prev.findIndex(item => item.id === normalizedParsed.id);
        const groupId = normalizedParsed.groupId || (selectedGroupId !== 'all' ? selectedGroupId : null);
        const nextCharacter = { ...normalizedParsed, groupId };
        if (existing >= 0) {
          const old = prev[existing];
          return prev.map(item => item.id === normalizedParsed.id ? { ...nextCharacter, groupId: groupId || old.groupId || null } : item);
        }
        return [nextCharacter, ...prev];
      });
      const embeddedWorldBooks = normalizedParsed.embeddedWorldBooks?.length
        ? normalizedParsed.embeddedWorldBooks
        : (normalizedParsed.embeddedWorldBook ? [normalizedParsed.embeddedWorldBook] : []);
      if (embeddedWorldBooks.length) {
        const importedBooks = embeddedWorldBooks.map(book => ({
          ...book,
          sourceCharacterId: normalizedParsed.id,
          sourceCharacterName: normalizedParsed.name,
          sourceType: 'character-card' as const,
        }));
        setWorldBooks(prev => [
          ...importedBooks,
          ...prev.filter(book => !embeddedWorldBooks.some(imported => imported.id === book.id)),
        ]);
        setCharacters(prev => prev.map(item =>
          item.id === normalizedParsed.id
            ? { ...item, worldBookIds: Array.from(new Set([...(item.worldBookIds || []), ...importedBooks.map(book => book.id)])) }
            : item
        ));
      }
      setSelectedId(normalizedParsed.id);
      setIsEditing(false);
      setImportConfirmation({
        name: normalizedParsed.name,
        avatar: normalizedParsed.avatar || '',
        sourceFormat: normalizedParsed.sourceFormat.toUpperCase(),
        creator: normalizedParsed.creator || '未填写',
        version: normalizedParsed.variantLabel || normalizedParsed.characterVersion || '未填写',
        firstMessage: normalizedParsed.firstMessage || '',
        alternateGreetings: normalizedParsed.alternateGreetings || [],
        worldBookCount: embeddedWorldBooks.length,
        description: normalizedParsed.description || '',
      });
      showNotice(
        embeddedWorldBooks.length
          ? `已导入「${normalizedParsed.name}」 · 同步导入 ${embeddedWorldBooks.length} 本世界书`
          : `已导入「${normalizedParsed.name}」 · ${normalizedParsed.sourceFormat.toUpperCase()}`,
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '角色卡解析失败');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openDeleteDialog = () => {
    if (!selected) return;
    setDeleteWorldBooks(false);
    setDeleteChatHistory(false);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!selected) return;

    const characterId = selected.id;
    const characterName = selected.name;
    const embeddedWorldBooks = selected.embeddedWorldBooks?.length
      ? selected.embeddedWorldBooks
      : (selected.embeddedWorldBook ? [selected.embeddedWorldBook] : []);
    const embeddedWorldBookIds = new Set(embeddedWorldBooks.map(book => book.id));

    // Character-owned runtime data.
    clearCharacterMemory(characterId);
    removeCharacterRuntime(characterId);
    removeCharacterOfflineEvents(characterId);
    removeLineConversationData(characterId, { removeChatItem: deleteChatHistory });

    // Remove character-specific settings and generated contact data.
    try {
      for (const key of [
        `line:schedule:${characterName}`,
        `phone:memory-active-character`,
      ]) {
        if (key === 'phone:memory-active-character') {
          if (window.localStorage.getItem(key) === characterId) window.localStorage.removeItem(key);
        } else {
          window.localStorage.removeItem(key);
        }
      }

      const friendsRaw = window.localStorage.getItem('line:friends-list');
      if (friendsRaw) {
        const friends = JSON.parse(friendsRaw);
        if (Array.isArray(friends)) {
          window.localStorage.setItem(
            'line:friends-list',
            JSON.stringify(friends.filter((friend: any) => friend.characterId !== characterId)),
          );
        }
      }

      const aiProfilesRaw = window.localStorage.getItem('phone:character-ai-profiles');
      if (aiProfilesRaw) {
        const profiles = JSON.parse(aiProfilesRaw);
        if (Array.isArray(profiles)) {
          window.localStorage.setItem(
            'phone:character-ai-profiles',
            JSON.stringify(profiles.filter((profile: any) => profile.characterId !== characterId)),
          );
        }
      }

      const playlistsRaw = window.localStorage.getItem('phone:music-character-playlists');
      if (playlistsRaw) {
        const playlists = JSON.parse(playlistsRaw);
        if (Array.isArray(playlists)) {
          window.localStorage.setItem(
            'phone:music-character-playlists',
            JSON.stringify(playlists.filter((playlist: any) => playlist.characterId !== characterId)),
          );
        }
      }
    } catch {
      // Secondary character data cleanup is best-effort.
    }

    if (deleteWorldBooks && embeddedWorldBookIds.size) {
      setWorldBooks(prev => prev.filter(book => !embeddedWorldBookIds.has(book.id)));
    }

    const nextId = characters.find(item => item.id !== characterId)?.id || null;
    setCharacters(prev => prev.filter(item => item.id !== characterId));
    setSelectedId(nextId);
    setIsEditing(false);
    setDeleteDialogOpen(false);

    const deletedParts = [
      '角色档案',
      deleteChatHistory ? '聊天记录' : '聊天记录已保留',
      deleteWorldBooks
        ? (embeddedWorldBookIds.size ? '关联世界书' : '无关联世界书')
        : '世界书已保留',
    ];
    showNotice(`已移除「${characterName}」 · ${deletedParts.join(' · ')}`);
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
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">
              CHARACTER ARCHIVE · IMPORTABLE CARDS
            </div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">
              角色档案 · {selected ? selected.name : '我的角色'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setManagementOpen(true)} className="w-8 h-8 rounded-full bg-white/55 border border-[rgba(40,36,31,.12)] text-[#655f59] grid place-items-center" title="角色档案管理"><Settings2 className="w-3.5 h-3.5" /></button>
          <button
            onClick={createBlankCharacter}
            className="w-8 h-8 rounded-full bg-white/55 border border-[rgba(40,36,31,.12)] text-[#655f59] grid place-items-center"
            title="新建空白角色"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {selected && (
            <button
              onClick={() => {
                try { window.localStorage.setItem('phone:memory-active-character', selected.id); } catch {}
                onNavigate('memory');
              }}
              className="w-8 h-8 rounded-full bg-white/55 border border-[rgba(40,36,31,.12)] text-[#655f59] grid place-items-center"
              title="打开这个角色的长期记忆"
            >
              <Brain className="w-3.5 h-3.5" />
            </button>
          )}
          {selected && (
            <button
              onClick={() => setIsEditing(prev => !prev)}
              className="w-8 h-8 rounded-full bg-white/55 border border-[rgba(40,36,31,.12)] text-[#655f59] grid place-items-center"
              title={isEditing ? '关闭编辑' : '编辑角色卡'}
            >
              {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-8 h-8 rounded-full bg-[#292724] text-white grid place-items-center hover:bg-black active:scale-95 transition-all"
            title="导入角色卡"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.json,.yaml,.yml"
          className="hidden"
          onChange={event => handleImport(event.target.files?.[0])}
        />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar">
        {characters.length === 0 ? (
          <div className="p-5 h-full flex items-center justify-center">
            <div className="w-full rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.14)] shadow-[0_8px_25px_rgba(45,37,30,.08)] p-5">
              <div className="flex items-center gap-2 text-[8px] tracking-[2px] font-mono text-[#8b8782]">
                <ShieldCheck className="w-3 h-3" />
                NO CHARACTER LOADED
              </div>
              <h3 className="mt-3 font-serif font-bold text-xl text-[#242323]">
                先把你的角色带进来。
              </h3>
              <p className="mt-2 font-serif-sc text-xs leading-relaxed text-[#5b554f]">
                支持 PNG 角色卡、JSON、YAML / YML。导入后会保存在本机；当前项目不会预置任何角色数据。
              </p>
              <button
                onClick={createBlankCharacter}
                className="mt-5 w-full py-2.5 rounded-xl bg-[#292724] text-white text-xs font-serif tracking-wider flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                新建空白角色
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-2 w-full py-2.5 rounded-xl bg-white border border-[#ddd6cd] text-[#5f5952] text-xs font-serif tracking-wider flex items-center justify-center gap-2"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                导入我的角色卡
              </button>
              <div className="mt-3 text-[9px] text-[#8b8782] font-mono text-center">
                PNG · JSON · YAML · YML
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="p-3 rounded-2xl bg-white/50 border border-[rgba(40,36,31,.1)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782]"><Folder className="w-3 h-3" /> CHARACTER GROUPS</div>
                <button onClick={createGroup} className="w-6 h-6 rounded-full bg-[#292724] text-white grid place-items-center"><Plus className="w-3 h-3" /></button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button onClick={() => setSelectedGroupId('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-[9px] border ${selectedGroupId === 'all' ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/55 text-[#655f59] border-[rgba(40,36,31,.12)]'}`}>全部 · {characters.length}</button>
                {groups.map(group => (
                  <div key={group.id} className="shrink-0 flex items-center rounded-full border border-[rgba(40,36,31,.12)] bg-white/55 overflow-hidden">
                    <button onClick={() => setSelectedGroupId(group.id)} className={`px-3 py-1.5 text-[9px] ${selectedGroupId === group.id ? 'bg-[#292724] text-white' : 'text-[#655f59]'}`}>{group.name} · {characters.filter(c => c.groupId === group.id).length}</button>
                    <button onClick={() => renameGroup(group.id)} className="px-1.5 py-1.5 text-[8px] text-[#8b7560]" title="重命名">✎</button>
                    <button onClick={() => deleteGroup(group.id)} className="px-1.5 py-1.5 text-[8px] text-[#9b625b]" title="删除分组">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {characterSections.map(section => (
                <section key={section.id}>
                  <div className="flex items-end justify-between px-1 mb-2">
                    <div>
                      <div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">YEARBOOK SECTION</div>
                      <h3 className="mt-0.5 text-[13px] font-serif font-bold text-[#242323]">{section.name}</h3>
                    </div>
                    <span className="text-[8px] font-mono text-[#9b625b]">{section.characters.length} CARDS</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {section.characters.map(character => (
                      <button
                        key={character.id}
                        onClick={() => { setSelectedId(character.id); setIsEditing(false); }}
                        className={"text-left overflow-hidden rounded-2xl border transition-all active:scale-[.98] " + (
                          selected?.id === character.id
                            ? 'bg-[#292724] text-white border-[#292724] shadow-[0_10px_26px_rgba(40,35,30,.16)]'
                            : 'bg-white/65 text-[#242323] border-[rgba(40,36,31,.1)] shadow-[0_6px_18px_rgba(40,35,30,.05)]'
                        )}
                      >
                        <div className="aspect-[4/3] bg-[#ded7cc] overflow-hidden">
                          {character.avatar ? (
                            <img src={character.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full grid place-items-center">
                              <UserRound className="w-8 h-8 text-[#8b8782]" />
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <div className="font-serif font-bold text-[13px] truncate">{character.name || '未命名角色'}</div>
                          <div className={selected?.id === character.id ? 'mt-1 text-[8px] text-white/55 font-mono truncate' : 'mt-1 text-[8px] text-[#8b8782] font-mono truncate'}>
                            {character.variantLabel || character.characterVersion || 'DEFAULT VERSION'}
                          </div>
                          <div className={selected?.id === character.id ? 'mt-2 text-[7px] tracking-[1.2px] text-white/45 font-mono' : 'mt-2 text-[7px] tracking-[1.2px] text-[#9b625b] font-mono'}>
                            {selected?.id === character.id ? 'OPEN · PROFILE' : 'TAP TO OPEN'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full min-h-[120px] rounded-2xl border border-dashed border-[#8b7560]/45 bg-white/35 text-[#8b7560] grid place-items-center text-[9px]"
              >
                <span><Plus className="w-4 h-4 mx-auto mb-1" />导入角色卡</span>
              </button>
            </div>

            {selected && (
              <>
                <div className="flex items-center justify-between px-1">
                  <div className="text-[8px] font-mono tracking-[1.6px] text-[#8b8782]">YEARBOOK PROFILE · SELECTED</div>
                  <button onClick={() => { setSelectedId(null); setIsEditing(false); }} className="px-2 py-1 rounded-full bg-white/60 text-[8px] text-[#8b7560]">收起</button>
                </div>

                <div className="relative p-3 pb-5 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.14)] shadow-[0_8px_25px_rgba(45,37,30,.12)] rotate-[0.7deg]">
                  <div className="absolute right-4 top-4 border-2 border-[#9b625b]/60 text-[#9b625b] text-[8px] font-mono tracking-widest px-2 py-0.5 rounded -rotate-[10deg]">
                    IMPORTED
                  </div>
                  <div className="flex gap-3.5 items-center">
                    <div className="w-20 h-24 rounded-xl overflow-hidden bg-[#ded7cc] border border-black/10 shrink-0 grid place-items-center">

                      {selected.avatar ? (
                        <img src={selected.avatar} alt={selected.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserRound className="w-10 h-10 text-[#8b8782]" />
                      )}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="font-serif font-bold text-lg leading-tight text-[#242323] truncate">
                        {selected.name}.
                      </div>
                      <div className="text-[10px] text-[#8b8782] font-mono truncate">
                        SOURCE · {selected.sourceFormat.toUpperCase()} · {selected.creator || 'UNKNOWN CREATOR'}
                      </div>
                      <div className="text-[10px] text-[#55504a] font-mono pt-1">
                        VERSION · {selected.variantLabel || selected.characterVersion || 'unspecified'}
                      </div>
                    </div>
                  </div>

                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selected) return;
                      try {
                        const avatar = await readImageFileAsDataUrl(file);
                        patchSelected({ avatar });
                        showNotice('角色头像已更新');
                      } catch {
                        showNotice('头像读取失败');
                      } finally {
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => avatarFileRef.current?.click()}
                      className="flex-1 py-2 rounded-xl bg-white/75 border border-[rgba(40,36,31,.12)] text-[9px] text-[#5f5952]"
                    >上传本地头像</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selected) return;
                        const url = window.prompt('粘贴角色头像图片链接：', selected.avatar || '');
                        if (url !== null) {
                          patchSelected({ avatar: url.trim() });
                          showNotice('角色头像链接已更新');
                        }
                      }}
                      className="flex-1 py-2 rounded-xl bg-white/75 border border-[rgba(40,36,31,.12)] text-[9px] text-[#5f5952]"
                    >使用图片链接</button>
                  </div>

                  <div className="mt-2 text-[8px] text-[#8b8782]">
                    角色头像只来自你上传的图片或你提供的链接；不再自动替换成预设人物图。
                  </div>

                  <div className="mt-3 pt-2 border-t border-[rgba(40,36,31,.1)] text-[9px] text-[#8b8782] font-mono">
                    IMPORTED {new Date(selected.importedAt).toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/60 border border-[rgba(40,36,31,.1)]">
                  <div className="text-[8px] tracking-[1.5px] font-mono text-[#8b8782] mb-2">LIVE WORLD STATUS</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div><span className="text-[8px] font-mono text-[#8b8782]">LOCATION</span><div className="mt-1 font-serif-sc">{runtimeState?.location || '未知'}</div></div>
                    <div><span className="text-[8px] font-mono text-[#8b8782]">ACTIVITY</span><div className="mt-1 font-serif-sc">{runtimeState?.activity || '空闲'}</div></div>
                    <div><span className="text-[8px] font-mono text-[#8b8782]">MOOD</span><div className="mt-1 font-serif-sc">{runtimeState?.mood || '平静'}</div></div>
                    <div><span className="text-[8px] font-mono text-[#8b8782]">UNREAD</span><div className="mt-1 font-mono text-[#9b625b]">{runtimeState?.unread || 0}</div></div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[8px] tracking-[1.5px] font-mono text-[#8b8782]">
                      CHARACTER ESSENCE
                    </div>
                    {isEditing && (
                      <span className="text-[8px] font-mono text-[#9b625b]">EDIT MODE · 自动保存</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2.5 text-[10px]">
                      {([
                        ['description', 'DESCRIPTION', '角色整体描述'],
                        ['personality', 'PERSONALITY', '性格 / 说话方式'],
                        ['scenario', 'SCENARIO', '当前世界 / 场景背景'],
                        ['firstMessage', 'FIRST MESSAGE', '首次开场白'],
                        ['exampleDialogue', 'EXAMPLE DIALOGUE', '示例对话'],
                        ['creatorNotes', 'CREATOR NOTES', '创作者注释'],
                        ['systemPrompt', 'SYSTEM PROMPT', '角色专属系统指令'],
                        ['postHistoryInstructions', 'POST HISTORY', '历史消息后的额外指令'],
                      ] as Array<[keyof ImportedCharacter, string, string]>).map(([key, label, placeholder]) => (
                        <label key={String(key)} className="block">
                          <span className="text-[8px] font-mono text-[#8b8782]">{label}</span>
                          <textarea
                            value={String(selected[key] ?? '')}
                            onChange={e => patchSelected({ [key]: e.target.value } as Partial<ImportedCharacter>)}
                            placeholder={placeholder}
                            className="w-full mt-1 min-h-[54px] bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl p-2.5 outline-none resize-y font-serif-sc leading-relaxed"
                          />
                        </label>
                      ))}
                      <label className="block">
                        <span className="text-[8px] font-mono text-[#8b8782]">VERSION LABEL</span>
                        <input
                          value={selected.variantLabel}
                          onChange={e => patchSelected({ variantLabel: e.target.value })}
                          placeholder="高中生 / 研究生 / 成年人"
                          className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[8px] font-mono text-[#8b8782]">GROUP</span>
                        <select
                          value={selected.groupId || ''}
                          onChange={e => patchSelected({ groupId: e.target.value || null })}
                          className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none"
                        >
                          <option value="">未分组</option>
                          {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[8px] font-mono text-[#8b8782]">TAGS</span>
                        <input
                          value={selected.tags.join(', ')}
                          onChange={e => patchSelected({ tags: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                          placeholder="标签1, 标签2"
                          className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none"
                        />
                      </label>
                      <div className="mt-4 pt-4 border-t border-[rgba(40,36,31,.1)] space-y-2.5">
                        <div>
                          <div className="text-[8px] tracking-[1.5px] font-mono text-[#8b8782]">CHARACTER LANGUAGE · 语言指纹</div>
                          <div className="mt-1 text-[9px] text-[#8b8782] leading-relaxed">不是“人设标签”，而是这个角色长期形成的真实聊天习惯。</div>
                        </div>
                        {(() => {
                          const profile = selected.languageProfile || {
                            language: 'zh-CN', bilingualMode: 'off', bilingualLayout: 'below-bubble',
                            bilingualTranslationDirection: 'original-first', punctuationStyle: 'natural',
                            sentenceLength: 'natural', lineBreakStyle: 'natural', colloquialLevel: 'natural',
                            fillerWords: [], emojiStyle: 'light', capitalizationStyle: 'standard',
                            numberStyle: 'standard', preferredSpaces: false, messageGrouping: 'natural', examples: []
                          };
                          const updateLanguage = (patch: Partial<typeof profile>) =>
                            patchSelected({ languageProfile: { ...profile, ...patch } } as Partial<ImportedCharacter>);
                          return <>
                            <div className="grid grid-cols-1 gap-2 mb-2">
                              <label><span className="text-[8px] font-mono text-[#8b8782]">ONLINE PERSONA · 线上人设</span>
                                <textarea value={selected.onlinePersona || ''} onChange={e => patchSelected({ onlinePersona: e.target.value } as Partial<ImportedCharacter>)} placeholder="这个角色在线上聊天时呈现出来的身份、气质、状态……" className="w-full mt-1 min-h-[58px] bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none resize-none" />
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">TYPING HABIT · 打字习惯</span>
                                <textarea value={selected.typingHabit || ''} onChange={e => patchSelected({ typingHabit: e.target.value } as Partial<ImportedCharacter>)} placeholder="例如：少用标点；一句一句发；偶尔用“…”；不喜欢句号……" className="w-full mt-1 min-h-[58px] bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none resize-none" />
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label><span className="text-[8px] font-mono text-[#8b8782]">LANGUAGE</span>
                                <select value={profile.language} onChange={e => {
                                  const language = e.target.value as any;
                                  updateLanguage({ language, bilingualMode: language === 'zh-CN' ? 'off' : 'auto' });
                                }} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="yue">粤语</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="en">English</option>
                                </select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">BILINGUAL</span>
                                <select value={profile.bilingualMode} onChange={e => updateLanguage({ bilingualMode: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="off">关闭</option><option value="auto">非普通话自动双语</option>
                                </select>
                              </label>
                            </div>
                            {profile.bilingualMode === 'auto' && <div className="grid grid-cols-2 gap-2">
                              <label><span className="text-[8px] font-mono text-[#8b8782]">TRANSLATION</span>
                                <select value={profile.bilingualLayout} onChange={e => updateLanguage({ bilingualLayout: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="below-bubble">气泡下方 · 推荐</option><option value="inside-bubble">气泡内部</option>
                                </select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">ORDER</span>
                                <select value={profile.bilingualTranslationDirection} onChange={e => updateLanguage({ bilingualTranslationDirection: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="original-first">原文 → 中文</option><option value="translation-first">中文 → 原文</option>
                                </select>
                              </label>
                            </div>}
                            <div className="grid grid-cols-2 gap-2">
                              <label><span className="text-[8px] font-mono text-[#8b8782]">PUNCTUATION</span>
                                <select value={profile.punctuationStyle} onChange={e => updateLanguage({ punctuationStyle: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="natural">自然变化</option><option value="spaces">偏空格</option><option value="tight">紧凑少标点</option><option value="mixed">混合</option>
                                </select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">SENTENCE</span>
                                <select value={profile.sentenceLength} onChange={e => updateLanguage({ sentenceLength: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="short">短句</option><option value="natural">自然</option><option value="long">偏长</option><option value="mixed">长短混合</option>
                                </select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">MESSAGE GROUPING · 消息分组</span>
                                <select value={profile.messageGrouping || 'natural'} onChange={e => updateLanguage({ messageGrouping: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="single">一句一句发</option><option value="double">两句一起发</option><option value="natural">自然决定</option>
                                </select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">LINE BREAKS</span>
                                <select value={profile.lineBreakStyle} onChange={e => updateLanguage({ lineBreakStyle: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="natural">自然</option><option value="every-sentence">一句一行</option><option value="compact">紧凑</option><option value="mixed">混合</option>
                                </select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">COLLOQUIAL</span>
                                <select value={profile.colloquialLevel} onChange={e => updateLanguage({ colloquialLevel: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none">
                                  <option value="formal">正式</option><option value="natural">自然口语</option><option value="casual">随意</option><option value="very-casual">很口语</option>
                                </select>
                              </label>
                            </div>
                            <input value={profile.fillerWords.join(', ')} onChange={e => updateLanguage({ fillerWords: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} placeholder="常用语气词：嗯, 啊, 哈哈, 哦" className="w-full bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none" />
                            <div className="grid grid-cols-2 gap-2">
                              <label><span className="text-[8px] font-mono text-[#8b8782]">EMOJI</span>
                                <select value={profile.emojiStyle} onChange={e => updateLanguage({ emojiStyle: e.target.value as any })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none"><option value="none">不用</option><option value="light">少量</option><option value="frequent">频繁</option><option value="mixed">自然混用</option></select>
                              </label>
                              <label><span className="text-[8px] font-mono text-[#8b8782]">SPACING</span>
                                <select value={profile.preferredSpaces ? 'yes' : 'no'} onChange={e => updateLanguage({ preferredSpaces: e.target.value === 'yes' })} className="w-full mt-1 bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none"><option value="no">按自然习惯</option><option value="yes">偏好空格</option></select>
                              </label>
                            </div>
                            <input value={(profile.examples || []).join(' / ')} onChange={e => updateLanguage({ examples: e.target.value.split(' / ').map(v => v.trim()).filter(Boolean) })} placeholder="语言示例：你吃了 我也是 / im here lol" className="w-full bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl px-2.5 py-2 outline-none" />
                          </>;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs leading-relaxed text-[#443f3a] font-serif-sc">
                      <section>
                        <div className="text-[8px] font-mono text-[#8b8782] mb-1">DESCRIPTION</div>
                        <p className="whitespace-pre-wrap">{selected.description || '未填写'}</p>
                      </section>
                      <section>
                        <div className="text-[8px] font-mono text-[#8b8782] mb-1">PERSONALITY</div>
                        <p className="whitespace-pre-wrap">{selected.personality || '未填写'}</p>
                      </section>
                      <section>
                        <div className="text-[8px] font-mono text-[#8b8782] mb-1">SCENARIO</div>
                        <p className="whitespace-pre-wrap">{selected.scenario || '未填写'}</p>
                      </section>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => downloadText(`${selected.name}.json`, exportCharacterJson(selected))}
                    className="py-2.5 rounded-xl bg-[#292724] text-white text-xs font-serif flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    导出 JSON
                  </button>
                  <button
                    onClick={() => downloadText(`${selected.name}.card.json`, exportCharacterCardV2(selected))}
                    className="py-2.5 rounded-xl bg-white border border-[rgba(40,36,31,.15)] text-[#5f5952] text-xs font-serif flex items-center justify-center gap-1.5"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    导出 Tavern V2
                  </button>
                  <button
                    onClick={openDeleteDialog}
                    className="py-2.5 rounded-xl bg-[#ebe7df] border border-[rgba(40,36,31,.15)] text-[#9b625b] text-xs font-serif flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    移除角色
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-white/60 border border-[rgba(40,36,31,.1)]">
                  <button
                    onClick={() => setWorldBookPickerOpen(value => !value)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div>
                      <div className="text-[8px] tracking-[1.5px] font-mono text-[#8b8782]">CHARACTER LOREBOOKS</div>
                      <div className="mt-1 text-[11px] font-serif font-bold text-[#302d29]">
                        专属世界书 · {(selected?.worldBookIds || []).length} 本已选择
                      </div>
                      <div className="mt-0.5 text-[9px] text-[#8b847d]">
                        像酒馆一样，为这个角色勾选要使用的世界书
                      </div>
                    </div>
                    <span className="text-[9px] text-[#8b847d]">{worldBookPickerOpen ? '收起' : '选择'}</span>
                  </button>
                  {worldBookPickerOpen && (
                    <div className="mt-3 space-y-1.5 max-h-[240px] overflow-y-auto">
                      {worldBooks.length === 0 && (
                        <div className="py-4 text-center text-[9px] text-[#8b847d]">还没有世界书</div>
                      )}
                      {worldBooks.map(book => {
                        const selectedIds = selected?.worldBookIds || [];
                        const checked = selectedIds.includes(book.id);
                        const toggle = () => {
                          if (!selected) return;
                          const next = checked
                            ? selectedIds.filter(id => id !== book.id)
                            : [...selectedIds, book.id];
                          patchSelected({ worldBookIds: next });
                        };
                        return (
                          <button
                            key={book.id}
                            onClick={toggle}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${checked ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white/65 text-[#4f4943] border-[rgba(40,36,31,.1)]'}`}
                          >
                            <span className={`w-4 h-4 rounded-md border grid place-items-center shrink-0 ${checked ? 'bg-white text-[#292724] border-white' : 'border-[#bdb5ab]'}`}>
                              {checked ? '✓' : ''}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[10px] font-serif font-bold truncate">{book.name || '未命名世界书'}</span>
                              <span className={`block mt-0.5 text-[8px] truncate ${checked ? 'text-white/60' : 'text-[#918980]'}`}>
                                {book.entries.length} 条 · {book.sourceType === 'character-card' ? `角色卡 · ${book.sourceCharacterName || '角色'}` : '全局世界书'}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[8px] tracking-[1.5px] font-mono text-[#8b8782]">LONG-TERM MEMORY</div>
                    <button
                      onClick={addMemory}
                      className="px-2 py-1 rounded-full bg-[#292724] text-white text-[9px]"
                    >
                      ＋ 记忆
                    </button>
                  </div>
                  <textarea
                    value={memory.summary}
                    onChange={e => patchMemory({ summary: e.target.value })}
                    placeholder="角色长期记忆摘要：重要经历、共同约定、关系转折、不能忘记的事实……"
                    className="w-full min-h-[82px] bg-white/65 border border-[rgba(40,36,31,.1)] rounded-xl p-2.5 text-[10.5px] leading-relaxed outline-none resize-y font-serif-sc"
                  />
                  {memory.items.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {memory.items.slice(0, 12).map(item => (
                        <div key={item.id} className="flex items-start gap-2 bg-white/50 rounded-xl p-2">
                          <div className="flex-1 text-[10px] leading-relaxed text-[#4f4943]">{item.content}</div>
                          <button onClick={() => removeMemory(item.id)} className="shrink-0 text-[#9b625b] text-[9px]">删除</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[8px] text-[#8b8782] font-mono">
                    AI 每次回复都会读取这里；刷新页面也会保留。
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/55 border border-[rgba(40,36,31,.1)]">
                  <div className="text-[8px] tracking-[1.5px] font-mono text-[#8b8782] mb-2">CARD CONTENT · AI MEMORY INPUTS</div>
                  <div className="space-y-2 text-[10.5px] text-[#5a544e]">
                    <div><span className="font-mono text-[#8b8782]">FIRST MESSAGE</span><p className="mt-1 whitespace-pre-wrap font-serif-sc">{selected.firstMessage || '未填写'}</p></div>
                    <div><span className="font-mono text-[#8b8782]">ALTERNATE GREETINGS</span><p className="mt-1 font-serif-sc">{selected.alternateGreetings.length || 0} 条</p></div>
                    <div><span className="font-mono text-[#8b8782]">TAGS</span><p className="mt-1 font-serif-sc">{selected.tags.join(' · ') || '无'}</p></div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 p-3 text-center text-[9px] text-[#8b8782] font-mono border-t border-[rgba(40,36,31,.1)]">
        {selectedGroupId === 'all' ? 'CHARACTER ARCHIVE · LOCAL ONLY' : 'CHARACTER GROUP · LOCAL ONLY'}
      </div>

      {managementOpen && (
        <div className="absolute inset-0 z-[80] bg-black/25 flex items-end" onClick={() => setManagementOpen(false)}>
          <div className="w-full max-h-[82%] overflow-y-auto bg-white rounded-t-[24px] p-5 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">CHARACTERS · MANAGEMENT</div><div className="text-[15px] font-semibold mt-1">角色档案管理</div></div><button onClick={() => setManagementOpen(false)} className="text-xl text-[#aaa]">×</button></div>
            <div className="p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-[9px] text-[#777]">当前 {characters.length} 个角色 · {groups.length} 个分组。导入、导出、分组和删除都从这里管理。</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { const data=characters.map(character=>({ ...character, avatar: '' })); downloadText('sane333-characters.json', JSON.stringify({ type:'sane333-characters', version:1, characters:data, groups }, null, 2)); showNotice('角色档案已导出'); }} className="p-3 rounded-xl bg-[#292724] text-white text-[9px] flex items-center justify-center gap-1"><Download className="w-3 h-3"/>导出全部</button>
              <button onClick={() => fileRef.current?.click()} className="p-3 rounded-xl bg-[#f7f5f1] border border-[#eee] text-[#555] text-[9px] flex items-center justify-center gap-1"><Upload className="w-3 h-3"/>导入角色卡</button>
            </div>
            <div className="space-y-1.5">
              {characters.map(character => <div key={character.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-[#fafafa] border border-[#eee]"><div className="w-8 h-8 rounded-lg overflow-hidden bg-[#eee] shrink-0">{character.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover"/> : null}</div><div className="min-w-0 flex-1"><div className="text-[10px] font-medium truncate">{character.name}</div><div className="text-[8px] text-[#aaa] truncate">{character.sourceFormat} · {character.groupId || '未分组'}</div></div><button onClick={() => { setSelectedId(character.id); setManagementOpen(false); }} className="text-[9px] text-[#8b7560] px-1.5">打开</button><button onClick={() => { setSelectedId(character.id); setManagementOpen(false); window.setTimeout(() => setDeleteDialogOpen(true), 0); }} className="text-[9px] text-[#9b625b] px-1.5">删除</button></div>)}
            </div>
          </div>
        </div>
      )}

      {deleteDialogOpen && selected && (
        <div className="absolute inset-0 z-[60] bg-black/25 backdrop-blur-[2px] flex items-end justify-center">
          <div className="w-full rounded-t-[28px] bg-[#f8f5ef] border-t border-white/70 shadow-[0_-16px_50px_rgba(35,30,25,.18)] p-5 pb-7">
            <div className="w-10 h-1 rounded-full bg-[#c9c2b9] mx-auto mb-4" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[8px] tracking-[2px] font-mono text-[#9b625b]">REMOVE CHARACTER CARD</div>
                <h3 className="mt-1 text-lg font-serif font-bold text-[#242323]">删除「{selected.name || '未命名角色'}」？</h3>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#777068] font-serif-sc">
                  角色专属长期记忆、运行状态、线下剧情数据和角色 AI 设置会随角色一起清理。
                </p>
              </div>
              <button
                onClick={() => setDeleteDialogOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-[#ded7ce] text-[#777068] grid place-items-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-white/75 border border-[#e2dcd3] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-serif font-bold text-[#302d29]">关联世界书</div>
                    <div className="mt-0.5 text-[9px] text-[#8b847d]">
                      {(() => {
                        const count = selected.embeddedWorldBooks?.length || (selected.embeddedWorldBook ? 1 : 0);
                        return count ? `这张角色卡带入了 ${count} 本世界书` : '这张角色卡没有检测到内置世界书';
                      })()}
                    </div>
                  </div>
                  <div className="flex rounded-full bg-[#eee9df] p-0.5">
                    <button
                      onClick={() => setDeleteWorldBooks(false)}
                      className={`px-3 py-1.5 rounded-full text-[9px] ${!deleteWorldBooks ? 'bg-[#292724] text-white' : 'text-[#777068]'}`}
                    >保留</button>
                    <button
                      onClick={() => setDeleteWorldBooks(true)}
                      className={`px-3 py-1.5 rounded-full text-[9px] ${deleteWorldBooks ? 'bg-[#9b625b] text-white' : 'text-[#777068]'}`}
                    >删除</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white/75 border border-[#e2dcd3] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-serif font-bold text-[#302d29]">LINE 聊天记录</div>
                    <div className="mt-0.5 text-[9px] text-[#8b847d]">
                      {deleteChatHistory ? '聊天记录和联系人入口都会删除' : '聊天记录保留，并作为已归档聊天保存'}
                    </div>
                  </div>
                  <div className="flex rounded-full bg-[#eee9df] p-0.5">
                    <button
                      onClick={() => setDeleteChatHistory(false)}
                      className={`px-3 py-1.5 rounded-full text-[9px] ${!deleteChatHistory ? 'bg-[#292724] text-white' : 'text-[#777068]'}`}
                    >保留</button>
                    <button
                      onClick={() => setDeleteChatHistory(true)}
                      className={`px-3 py-1.5 rounded-full text-[9px] ${deleteChatHistory ? 'bg-[#9b625b] text-white' : 'text-[#777068]'}`}
                    >删除</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setDeleteDialogOpen(false)}
                className="py-3 rounded-xl bg-white border border-[#ddd6cd] text-[#625c55] text-xs font-serif"
              >取消</button>
              <button
                onClick={confirmDelete}
                className="py-3 rounded-xl bg-[#292724] text-white text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                确认删除角色
              </button>
            </div>
          </div>
        </div>
      )}

      {importConfirmation && (
        <div
          className="absolute inset-0 z-[120] bg-black/30 backdrop-blur-[2px] flex items-center justify-center px-5"
          onClick={() => setImportConfirmation(null)}
        >
          <div
            className="w-full max-h-[78%] overflow-y-auto rounded-[24px] bg-[#f8f5ef] border border-white/70 shadow-2xl p-5"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[8px] font-mono tracking-[2px] text-[#9b625b]">IMPORT COMPLETE · CHARACTER CARD</div>
                <div className="mt-1.5 text-[20px] font-serif font-bold text-[#242323]">角色卡已成功导入</div>
                <div className="mt-1 text-[9px] text-[#8b8782]">已保存到本机角色档案。下面是这次实际读入的内容。</div>
              </div>
              <button onClick={() => setImportConfirmation(null)} className="w-8 h-8 rounded-full bg-black/5 text-[#777]">×</button>
            </div>

            <div className="mt-5 flex gap-3.5 items-center">
              <div className="w-16 h-16 rounded-2xl bg-[#ded7cc] overflow-hidden border border-black/10 shrink-0 grid place-items-center">
                {importConfirmation.avatar ? (
                  <img src={importConfirmation.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserRound className="w-7 h-7 text-[#8b8782]" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[17px] font-serif font-bold text-[#242323] truncate">{importConfirmation.name || '未命名角色'}</div>
                <div className="mt-1 text-[8px] font-mono text-[#8b8782]">SOURCE · {importConfirmation.sourceFormat} · {importConfirmation.creator}</div>
                <div className="mt-1 text-[8px] font-mono text-[#8b8782]">VERSION · {importConfirmation.version}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/70 border border-black/5 p-2.5">
                <div className="text-[8px] font-mono text-[#9b625b]">FIRST MESSAGE</div>
                <div className="mt-1 text-[15px] font-semibold text-[#292724]">{importConfirmation.firstMessage ? '已读取' : '未填写'}</div>
              </div>
              <div className="rounded-xl bg-white/70 border border-black/5 p-2.5">
                <div className="text-[8px] font-mono text-[#9b625b]">ALTERNATE</div>
                <div className="mt-1 text-[15px] font-semibold text-[#292724]">{importConfirmation.alternateGreetings.length} 条</div>
              </div>
              <div className="rounded-xl bg-white/70 border border-black/5 p-2.5">
                <div className="text-[8px] font-mono text-[#9b625b]">WORLD BOOK</div>
                <div className="mt-1 text-[15px] font-semibold text-[#292724]">{importConfirmation.worldBookCount} 本</div>
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-white/70 border border-black/5 p-3">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">DESCRIPTION</div>
              <div className="mt-1.5 text-[10px] leading-5 text-[#55504a] whitespace-pre-wrap">
                {importConfirmation.description || '角色卡没有填写 description。'}
              </div>
            </div>

            {importConfirmation.firstMessage && (
              <div className="mt-3 rounded-xl bg-white/70 border border-black/5 p-3">
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">FIRST MESSAGE · 已读取</div>
                <div className="mt-1.5 max-h-24 overflow-y-auto text-[10px] leading-5 text-[#55504a] whitespace-pre-wrap">{importConfirmation.firstMessage}</div>
              </div>
            )}

            <button
              onClick={() => setImportConfirmation(null)}
              className="mt-5 w-full py-3 rounded-2xl bg-[#292724] text-white text-xs font-semibold"
            >
              确认 · 我看到了
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px] shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
}
