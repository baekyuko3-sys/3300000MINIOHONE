import { bareIdentityId } from './lineRuntime';
/**
 * 手机体检：扫描本地 LINE / 角色数据，找出异常项。
 * 只读诊断，不删除、不修改任何数据；修复走 repairBlankChats / fixMisalignedSenders。
 */

export interface PhoneDiagnosisIssue {
  kind: 'blank-chat' | 'orphan-conversation' | 'corrupt-key' | 'duplicate-chat' | 'ghost-friend' | 'misaligned-message' | 'empty-message';
  title: string;
  detail: string;
}

export interface PhoneStorageEntry {
  key: string;
  label: string;
  bytes: number;
}

export interface PhoneDiagnosis {
  checkedAt: string;
  storageKeys: number;
  storageBytes: number;
  chatCount: number;
  conversationCount: number;
  messageCount: number;
  largestKeys: PhoneStorageEntry[];
  issues: PhoneDiagnosisIssue[];
  counts: {
    blankChats: number;
    orphanConversations: number;
    corruptKeys: number;
    duplicateChats: number;
    ghostFriends: number;
    misalignedMessages: number;
    emptyMessages: number;
  };
}

function safeParse(raw: string | null): { ok: boolean; value: any } {
  if (raw === null) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

/** 显示用量：长度按字符计，约数（与浏览器实际字节数略有出入，仅用于找大头）。 */
export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function looksLikeJson(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith('{') || t.startsWith('[');
}

function visibleMsgs(messages: unknown): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m: any) => m && typeof m === 'object' && !m.deletedAt && !m.isDeleted);
}

export function diagnosePhone(): PhoneDiagnosis {
  const now = new Date().toISOString();
  const empty: PhoneDiagnosis = {
    checkedAt: now,
    storageKeys: 0,
    storageBytes: 0,
    chatCount: 0,
    conversationCount: 0,
    messageCount: 0,
    largestKeys: [],
    issues: [],
    counts: {
      blankChats: 0,
      orphanConversations: 0,
      corruptKeys: 0,
      duplicateChats: 0,
      ghostFriends: 0,
      misalignedMessages: 0,
      emptyMessages: 0,
    },
  };
  if (typeof window === 'undefined') return empty;

  const issues: PhoneDiagnosisIssue[] = [];
  let storageBytes = 0;
  const convKeys: string[] = [];
  const corruptKeys: string[] = [];
  const keySizes: Array<{ key: string; bytes: number }> = [];

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const raw = window.localStorage.getItem(key) || '';
    storageBytes += key.length + raw.length;
    keySizes.push({ key, bytes: key.length + raw.length });
    if (key.startsWith('line:conversation:')) convKeys.push(key);
    // 只把“看起来是 JSON 但解析失败”的 key 算损坏，纯文本值不算
    if ((key.startsWith('line:') || key.startsWith('phone:')) && looksLikeJson(raw)) {
      if (!safeParse(raw).ok) corruptKeys.push(key);
    }
  }
  empty.storageKeys = window.localStorage.length;
  empty.storageBytes = storageBytes;
  empty.conversationCount = convKeys.length;

  const chats: any[] = (() => {
    const { value } = safeParse(window.localStorage.getItem('line:chat-items'));
    return Array.isArray(value) ? value : [];
  })();
  const characters: any[] = (() => {
    const { value } = safeParse(window.localStorage.getItem('phone:characters'));
    return Array.isArray(value) ? value : [];
  })();
  const npcs: any[] = (() => {
    const { value } = safeParse(window.localStorage.getItem('phone:npcs'));
    return Array.isArray(value) ? value : [];
  })();
  const friends: any[] = (() => {
    const { value } = safeParse(window.localStorage.getItem('line:friends-list'));
    return Array.isArray(value) ? value : [];
  })();
  empty.chatCount = chats.length;

  // 最占地方：按原始长度排前 10，只读统计，不碰内容。会话按聊天名显示，其余按常见键给中文名。
  const chatNameById = new Map<string, string>();
  for (const item of chats) {
    if (item && typeof item.id === 'string' && typeof item.name === 'string') chatNameById.set(item.id, item.name);
  }
  const friendlyKeyName: Record<string, string> = {
    'line:chat-items': '聊天列表',
    'line:groups': '群资料',
    'line:friends-list': '好友列表',
    'phone:characters': '角色卡',
    'phone:npcs': 'NPC',
    'phone:worldbooks': '世界书',
    'line:moments-posts': '朋友圈',
  };
  empty.largestKeys = keySizes
    .map(({ key, bytes }) => {
      let label: string;
      if (key.startsWith('line:conversation:')) {
        const suffix = key.slice('line:conversation:'.length);
        const name = chatNameById.get(suffix);
        label = name ? `聊天：${name}` : `会话：${suffix}`;
      } else {
        label = friendlyKeyName[key] || key;
      }
      return { key, label, bytes };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const charIds = new Set(characters.map((c: any) => c?.id).filter(Boolean));
  const charNames = new Set(characters.map((c: any) => c?.name).filter(Boolean));
  const npcIds = new Set(npcs.map((n: any) => n?.id).filter(Boolean));

  // 会话消息统计 + 错位/空消息统计
  const convMsgs = new Map<string, any[]>();
  let totalMsgs = 0;
  let misaligned = 0;
  let emptyMsgs = 0;
  for (const key of convKeys) {
    const { value } = safeParse(window.localStorage.getItem(key));
    const msgs = visibleMsgs(value);
    convMsgs.set(key, msgs);
    totalMsgs += msgs.length;
    for (const m of msgs) {
      if (m.kind === 'ai-reply' && m.role === 'user') misaligned++;
      if (!String(m.text || m.content || m.desc || '').trim() && !m.kind && !m.mediaRef && !m.imageData) emptyMsgs++;
    }
  }
  empty.messageCount = totalMsgs;

  // 空白聊天：聊天项在、直接会话无真实对话消息（只有系统问候也算空白）
  const chatIds = new Set<string>();
  for (const item of chats) {
    if (!item || typeof item.id !== 'string') continue;
    chatIds.add(item.id);
    const msgs = (convMsgs.get('line:conversation:' + item.id) || []).filter((m: any) => m.role !== 'system' && m.kind !== 'system');
    if (msgs.length === 0) {
      empty.counts.blankChats++;
      if (issues.length < 200) {
        issues.push({
          kind: 'blank-chat',
          title: `空白聊天：${item.name || item.id}`,
          detail: '聊天项还在，但里面没有消息。可能是清空记录后留下的空壳，或会话 key 对不上。',
        });
      }
    }
  }

  // 孤儿会话：有真实消息、无聊天项
  for (const key of convKeys) {
    const msgs = (convMsgs.get(key) || []).filter((m: any) => m.role !== 'system' && m.kind !== 'system');
    if (msgs.length === 0) continue;
    const suffix = key.slice('line:conversation:'.length);
    if (!chatIds.has(suffix)) {
      empty.counts.orphanConversations++;
      if (issues.length < 200) {
        issues.push({
          kind: 'orphan-conversation',
          title: `孤儿会话：${suffix}（${msgs.length} 条消息）`,
          detail: '有消息记录，但在聊天列表里没有对应的聊天项，可能是 id 变更后脱节。',
        });
      }
    }
  }

  // 损坏的 key
  for (const key of corruptKeys) {
    empty.counts.corruptKeys++;
    if (issues.length < 200) {
      issues.push({
        kind: 'corrupt-key',
        title: `损坏的数据：${key}`,
        detail: '内容解析失败，读取时会回退为空值。原始内容可能已被备份到 sane333:recovery:corrupt:*。',
      });
    }
  }

  // 重复聊天：同一角色/ NPC 在同一人设下有多个单聊项
  const seen = new Map<string, string[]>();
  for (const item of chats) {
    if (!item || item.isGroup) continue;
    // Owner keys are grouping keys only: strip id prefixes so pre- and
    // post-migration rows for the same owner still group together.
    const ownerKey = item.npcId
      ? `npc:${bareIdentityId(item.npcId)}:${item.personaId || ''}`
      : item.characterId
        ? `char:${bareIdentityId(item.characterId)}:${item.personaId || ''}`
        : '';
    if (!ownerKey) continue;
    const list = seen.get(ownerKey) || [];
    list.push(item.name || item.id);
    seen.set(ownerKey, list);
  }
  for (const [, names] of seen) {
    if (names.length > 1) {
      empty.counts.duplicateChats++;
      if (issues.length < 200) {
        issues.push({
          kind: 'duplicate-chat',
          title: `重复聊天：${names[0]} 有 ${names.length} 个聊天项`,
          detail: '同一角色/NPC 出现多个单聊入口，消息可能被分流到不同会话。',
        });
      }
    }
  }

  // 幽灵好友：好友指向已不存在的角色/NPC
  for (const f of friends) {
    if (!f || typeof f !== 'object') continue;
    if (f.characterId && !charIds.has(f.characterId) && !charNames.has(f.name)) {
      empty.counts.ghostFriends++;
      if (issues.length < 200) {
        issues.push({
          kind: 'ghost-friend',
          title: `幽灵好友：${f.note || f.name || f.characterId}`,
          detail: '好友指向的角色已不存在，点开发起聊天可能建出空白会话。',
        });
      }
    } else if (f.npcId && !npcIds.has(f.npcId)) {
      empty.counts.ghostFriends++;
      if (issues.length < 200) {
        issues.push({
          kind: 'ghost-friend',
          title: `幽灵好友：${f.note || f.name || f.npcId}`,
          detail: '好友指向的 NPC 已不存在，点开发起聊天可能建出空白会话。',
        });
      }
    }
  }

  if (misaligned > 0) {
    empty.counts.misalignedMessages = misaligned;
    issues.push({
      kind: 'misaligned-message',
      title: `疑似错位消息：${misaligned} 条`,
      detail: 'AI 回复（ai-reply）却存成 role=user，会跑到右边。',
    });
  }
  if (emptyMsgs > 0) {
    empty.counts.emptyMessages = emptyMsgs;
    issues.push({
      kind: 'empty-message',
      title: `空内容消息：${emptyMsgs} 条`,
      detail: '既无文字也无媒体的消息残留，可能是流式占位或生成失败后没清理。',
    });
  }

  empty.issues = issues;
  return empty;
}

/**
 * 全局修复错位消息：所有会话里 kind=ai-reply 但 role=user 的消息翻回 assistant。
 * ai-reply 按定义就是 AI 发的，不可能是用户消息，安全。
 */
export function fixMisalignedSenders(): number {
  if (typeof window === 'undefined') return 0;
  let fixed = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith('line:conversation:')) continue;
    const { ok, value } = safeParse(window.localStorage.getItem(key));
    if (!ok || !Array.isArray(value)) continue;
    let changed = false;
    for (const m of value) {
      if (m && m.kind === 'ai-reply' && m.role === 'user') {
        m.role = 'assistant';
        changed = true;
        fixed++;
      }
    }
    if (changed) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // 忽略写入失败
      }
    }
  }
  if (fixed > 0) window.dispatchEvent(new CustomEvent('sane333:line-runtime-changed'));
  return fixed;
}
