import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { usePersistentState } from '../../store/usePersistentState';
import type { ImportedCharacter } from '../../data/characterImport';
import { getCharacterMemory } from '../../store/characterMemory';
import { ScreenType } from '../../types';
import { LineConversationView } from './LineConversationView';
import { PersonaHomeSheet } from './PersonaHomeSheet';
import {
  TEXT_CARD_STYLES,
  TEXT_CARD_STYLE_KEY,
  VIDEO_CARD_STYLE_KEY,
  TEXT_CARD_LOADING_KEY,
  VIDEO_CARD_DURATION_KEY,
  TextCardView,
  VideoCardView,
  TextCardStylePicker,
  ImageLoadingLabelPicker,
  VideoDurationSetter,
  IMAGE_LOADING_LABELS,
} from './TextMediaCards';
import { LineConversationErrorBoundary } from './LineConversationErrorBoundary';
import { createLineGroup, getLineGroupById } from '../../store/lineGroups';
import { getNpcs, updateNpc, type SaneNpc } from '../../store/npcs';
import { getNpcFriendRequests, respondToNpcFriendRequest, setNpcFriendship } from '../../store/npcSocial';
import { NpcAvatar } from '../NpcAvatar';
import { VroomImage } from '../VroomImage';
import { putMedia } from '../../store/mediaVault';
import { markCharacterRead } from '../../store/worldRuntime';
import { getLineConversationMeta, markLineConversationRead, markLineNotificationsReadForConversation, touchLineConversation } from '../../store/lineRuntime';
import { reportPersistenceIssue } from '../../store/usePersistentState';
import { generateCreativeText, listOpenAiCompatibleModels, resolveChannelAiSettings, testAiConnection, type AiSettings } from '../../ai/aiEngine';
import { readAppSettings, saveAppSettings, type ChannelAiSettings } from '../../store/appSettings';
import { fetchLineWeather, formatLineWeather, type LineWeatherSnapshot } from '../../store/lineReality';
import {
  DEFAULT_MOMENTS_SETTINGS,
  MOMENTS_POSTS_KEY,
  appendMomentComment,
  countMomentComments,
  flattenMomentComments,
  generateCommentsForPost,
  listPostableNpcs,
  normalizeMomentComments,
  spawnBatchCommentsForPost,
  spawnInstantReply,
  tryAutonomousMomentComment,
  type MomentComment,
  type MomentsCommentSettings,
} from '../../store/momentsComments';
import { generateNpcMomentNow, refreshMomentsFeed } from '../../store/momentsAfterChat';
import { edgePair, isAllowedEdge as isVroomAllowedEdge, isBlockedEdge as isVroomBlockedEdge, readVroomScopeSettings, setFriendEdge as setVroomFriendEdge } from '../../store/vroomScope';
import {
  Pin, Bell, BellOff, Bookmark, Heart, MessageCircle, Share2, Plus, Search,
  Check, Trash2, X, Sliders, SlidersHorizontal, ChevronRight, UserCheck, Shield, Volume2,
  Smartphone, Settings
} from 'lucide-react';

function getCharacterStoryAge(character: any): string {
  const direct = character?.age ?? character?.extensions?.age ?? character?.extensions?.characterAge;
  if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
  const text = [character?.description, character?.personality, character?.scenario, character?.onlinePersona].filter(Boolean).join('\n');
  const match = text.match(/(?:年龄|age)\s*[:：=]?\s*(\d{1,3})\s*(?:岁|years?\s*old)?/i) || text.match(/(\d{1,3})\s*岁/);
  return match?.[1] || '';
}

interface LineAppViewProps {
  onNavigateHome: () => void;
  onNavigateScreen?: (screen: ScreenType) => void;
}

interface LineChatItem {
  id: string;
  name: string;
  characterId?: string;
  /** NPC App 人物 id；有值时私聊按 NPC 发言 */
  npcId?: string;
  variantLabel?: string;
  chatLabel?: string;
  relationship?: 'new-friend' | 'old-friend' | 'readded';
  readdedReason?: 'deleted' | 'blocked' | 'mutual-delete';
  friendStatus?: 'friend' | 'not-friend';
  relationshipContext?: string;
  openingMode?: 'none' | 'context';
  openingGreeting?: string;
  groupId?: string;
  personaId?: string;
  time: string;
  preview: string;
  unread: number;
  isPinned: boolean;
  isMuted: boolean;
  draft: string;
  isGroup: boolean;
}

interface LineFriend {
  name: string;
  characterId?: string;
  /** NPC 好友关系归属的人设；不同人设不能共享好友入口 */
  personaId?: string;
  /** NPC App 人物；characterId 存其绑定角色，用于人设过滤 */
  npcId?: string;
  kind?: 'character' | 'npc';
  variantLabel?: string;
  note: string;
  online: boolean;
  pinyin: string;
  relationship?: 'new-friend' | 'old-friend' | 'readded';
  deleted?: boolean;
  deletionVisibility?: 'visible' | 'hidden';
}

/** VROOM 可见/屏蔽/@ 用的稳定 key；NPC 必须用 npc:，不能落成绑定角色 id */
function friendAudienceKey(f: { npcId?: string; characterId?: string; name?: string }): string {
  if (f.npcId) return 'npc:' + f.npcId;
  if (f.characterId) return 'character:' + f.characterId;
  return String(f.name || '');
}

function friendMatchesAudienceKey(
  f: { npcId?: string; characterId?: string; name?: string },
  key: string,
): boolean {
  if (!key) return false;
  if (friendAudienceKey(f) === key) return true;
  // 兼容旧帖：裸 id / 名字
  if (f.npcId) return key === f.npcId || key === f.name;
  if (f.characterId) return key === f.characterId || key === f.name;
  return key === f.name;
}

function resolveAudienceLabel(
  key: string,
  friends: Array<{ npcId?: string; characterId?: string; name?: string }>,
  npcs: Array<{ id: string; name: string }>,
): string {
  const hit = friends.find(f => friendMatchesAudienceKey(f, key));
  if (hit?.name) return hit.name;
  if (key.startsWith('npc:')) {
    const npc = npcs.find(n => n.id === key.slice(4));
    if (npc) return npc.name;
  }
  if (key.startsWith('character:')) return key.slice('character:'.length);
  return key;
}

interface LineUserProfile {
  name: string;
  id: string;
  desc: string;
  avatar?: string;
  background?: string;
  region?: string;
  timezone?: string;
  birthday?: string;
}

function momentLikerNames(post: { likers?: string[]; liked?: boolean; likes?: number }, meName: string) {
  const me = String(meName || '').trim();
  const seen = new Set<string>();
  const list: string[] = [];
  for (const name of Array.isArray(post.likers) ? post.likers : []) {
    const n = String(name || '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    list.push(n);
  }
  if (post.liked && me && !seen.has(me)) list.unshift(me);
  if (!post.liked && me) {
    const i = list.indexOf(me);
    if (i >= 0) list.splice(i, 1);
  }
  const count = Math.max(Number(post.likes) || 0, list.length);
  return { list, count };
}

function formatMomentLikers(list: string[], count: number) {
  if (count <= 0) return '';
  const shown = list.slice(0, 3);
  if (!shown.length) return `${count} 人`;
  const names = shown.join('、');
  return count > shown.length ? `${names} 等 ${count} 人` : names;
}

function toggleMomentLike(post: Record<string, any>, meName: string) {
  const me = String(meName || '').trim() || '我';
  const nextLiked = !post.liked;
  const prev = Array.isArray(post.likers) ? post.likers.map((n: unknown) => String(n || '').trim()).filter(Boolean) : [];
  const withoutMe = prev.filter((n: string) => n !== me);
  return {
    ...post,
    liked: nextLiked,
    likes: nextLiked ? (Number(post.likes) || 0) + 1 : Math.max(0, (Number(post.likes) || 0) - 1),
    likers: nextLiked ? [me, ...withoutMe] : withoutMe,
  };
}

export function LineAppView({ onNavigateHome, onNavigateScreen }: LineAppViewProps) {
  // Tabs: 'chat' | 'friends' | 'moments' | 'me'
  const [activeTab, setActiveTab] = useState<'chat' | 'friends' | 'moments' | 'me'>('chat');
  const [lineLocale, setLineLocale] = usePersistentState<'zh-CN' | 'ja-JP'>('line:locale', 'zh-CN');
  const ja = lineLocale === 'ja-JP';
  const tx = (zh: string, jp: string) => ja ? jp : zh;
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Search queries
  const [chatSearch, setChatSearch] = useState('');
  const [friendSearch, setFriendSearch] = useState('');

  // Toast
  const updateChannelSettings = (channel: 'chat' | 'moments', patch: Partial<ChannelAiSettings>) => {
    setChannelSettings(prev => {
      const next = { ...prev, [channel]: { ...prev[channel], ...patch } };
      saveAppSettings(channel === 'chat' ? { chatApiOverride: next.chat } : { momentsApiOverride: next.moments });
      return next;
    });
  };

  const channelAsAiSettings = (channel: 'chat' | 'moments'): AiSettings => {
    const base = readAppSettings();
    const s = channelSettings[channel];
    return {
      provider: s.provider,
      apiBaseUrl: s.apiBaseUrl,
      apiKey: s.apiKey,
      model: s.model,
      streaming: s.streaming,
      contextLength: s.contextLength,
      maxOutputTokens: s.maxOutputTokens,
      autoSave: base.autoSave,
      temperature: s.temperature,
      topP: s.topP ?? base.topP,
      topK: s.topK ?? base.topK,
      frequencyPenalty: s.frequencyPenalty ?? base.frequencyPenalty,
      presencePenalty: s.presencePenalty ?? base.presencePenalty,
      seed: s.seed ?? base.seed,
    };
  };

  const downloadJson = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const readImageFile = (file: File, onDone: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => onDone(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const exportMomentsData = () => {
    downloadJson('vroom-backup.json', {
      version: 2,
      exportedAt: new Date().toISOString(),
      posts: momentsPosts,
      settings: momentsSettings,
      style: momentsStyle,
    });
    showToast('VROOM 已导出');
  };

  const exportCharacterProfileData = (characterId: string) => {
    downloadJson('line-character-profile.json', {
      version: 1,
      characterId,
      profile: generatedCharacterProfiles[characterId] || { profileId: characterId, followers: 0, following: 0, signature: '', updatedAt: '' },
      style: characterProfileStyles[characterId] || {},
    });
    showToast('角色主页已导出');
  };

  const importMomentsData = (file: File) => {
    readImageFile(file, () => {});
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'));
        if (!Array.isArray(data.posts)) throw new Error('invalid');
        setMomentsPosts(data.posts);
        if (data.settings) setMomentsSettings(data.settings);
        if (data.style) setMomentsStyle(prev => ({ ...prev, ...data.style }));
        showToast('VROOM 已导入');
      } catch {
        showToast('VROOM 文件格式不正确');
      }
    };
    reader.readAsText(file);
  };

  const meNameForMoments = () =>
    (activePersona?.name || currentUser.name || '').trim() || currentUser.name || '我';

  const applyBatchCommentsAfterPost = (post: { id: string; name?: string; text?: string; characterId?: string }) => {
    void (async () => {
      try {
        const { comments, skippedReason } = await spawnBatchCommentsForPost({
          post,
          meName: meNameForMoments(),
          settings: momentsSettings,
        });
        if (comments.length) {
          setMomentsPosts(prev =>
            prev.map(p => {
              if (p.id !== post.id) return p;
              const tree = normalizeMomentComments(p.commentsList);
              return { ...p, commentsList: [...tree, ...comments] };
            }),
          );
        } else if (skippedReason) {
          showToast(skippedReason);
        }
      } catch {
        // batch comments are best-effort
      }
    })();
  };

  const generateMomentsPost = async () => {
    const allowed = importedCharacters.filter(character => momentsSettings.enabledCharacterIds.length === 0 || momentsSettings.enabledCharacterIds.includes(character.id));
    const allowedNpcs = listPostableNpcs(momentsSettings);
    if (!allowed.length && !allowedNpcs.length) {
      showToast('请先在 VROOM 设置里允许至少一个角色或 NPC 发动态');
      return;
    }
    const useNpc = allowedNpcs.length > 0 && (allowed.length === 0 || Math.random() < 0.4);
    if (useNpc) {
      setIsRefreshingMoments(true);
      showToast('正在让 NPC 发朋友圈…');
      try {
        const msg = await generateNpcMomentNow();
        try { setMomentsPosts(JSON.parse(window.localStorage.getItem(MOMENTS_POSTS_KEY) || '[]')); } catch { /* ignore */ }
        showToast(msg);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'NPC 朋友圈生成失败');
      } finally {
        setIsRefreshingMoments(false);
      }
      return;
    }
    const source = allowed[Math.floor(Math.random() * allowed.length)];
    if (!source) { showToast('请先在朋友圈设置里允许至少一个角色发动态'); return; }
    setIsRefreshingMoments(true);
    showToast('正在生成朋友圈…');
    try {
      const settings = channelSettings.moments.enabled ? channelAsAiSettings('moments') : resolveChannelAiSettings('moments');
      const text = await generateCreativeText({
        settings,
        systemPrompt: [
          '你正在一个私人虚拟手机的朋友圈中扮演角色。',
          '只写一条自然的朋友圈动态，不要解释自己是 AI。',
          '不要替用户行动，也不要编造不存在的聊天经历。',
          '可以根据角色卡、当前状态与日常生活写一点真实的小事，长度适中。',
          '',
          '【角色卡】',
          source.description,
          source.personality,
          source.scenario,
        ].join('\n'),
        userPrompt: '请为“' + source.name + '”写一条今天的朋友圈动态。',
        temperature: settings.temperature,
      });
      if (text.trim()) {
        const newAiPost = {
          id: 'moment-ai-' + Date.now().toString(36),
          name: source.name,
          text: text.trim(),
          time: '刚刚',
          tag: '#AI动态',
          liked: false,
          likes: 0,
          commentsList: [] as MomentComment[],
          likers: [] as string[],
          characterId: source.id,
        };
        setMomentsPosts(prev => [newAiPost, ...prev]);
        showToast('生成成功：' + source.name + ' 发布了一条朋友圈');
        applyBatchCommentsAfterPost(newAiPost);
      } else {
        showToast('生成失败：AI 返回空内容');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '朋友圈 AI 请求失败');
    } finally {
      setIsRefreshingMoments(false);
    }
  };

  const generateNpcMomentsPost = async () => {
    setIsRefreshingMoments(true);
    showToast('正在让 NPC 发朋友圈…');
    try {
      const msg = await generateNpcMomentNow();
      try { setMomentsPosts(JSON.parse(window.localStorage.getItem(MOMENTS_POSTS_KEY) || '[]')); } catch { /* ignore */ }
      showToast(msg);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'NPC 朋友圈生成失败');
    } finally {
      setIsRefreshingMoments(false);
    }
  };

  const onGenerateCommentsForPost = async (post: Record<string, any>) => {
    if (generatingCommentsPostId) return;
    setGeneratingCommentsPostId(post.id);
    showToast('正在生成评论…');
    try {
      const caption = String(post.text || '').trim();
      const { comments, skippedReason } = await generateCommentsForPost({
        post: {
          id: post.id,
          name: post.name,
          text: caption,
          characterId: post.characterId,
          npcId: post.npcId,
          personaId: post.personaId,
          isMine: post.isMine,
          visibility: post.visibility,
          allowedIds: post.allowedIds,
          blockedIds: post.blockedIds,
        },
        meName: meNameForMoments(),
        settings: momentsSettings,
      });
      if (comments.length) {
        setMomentsPosts(prev =>
          prev.map(p => {
            if (p.id !== post.id) return p;
            const tree = normalizeMomentComments(p.commentsList);
            return { ...p, commentsList: [...tree, ...comments] };
          }),
        );
        showToast('已生成 ' + comments.length + ' 条评论');
      } else {
        showToast(skippedReason || '没有生成出评论');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '评论生成失败');
    } finally {
      setGeneratingCommentsPostId(null);
    }
  };

  const fetchChannelModels = async (channel: 'chat' | 'moments') => {
    const s = channelSettings[channel];
    if (!s.apiBaseUrl.trim() || !s.apiKey.trim()) { showToast('请先填写 API 地址和 API Key'); return; }
    setChannelBusy(channel + '-models' as any);
    try {
      const models = await listOpenAiCompatibleModels(channelAsAiSettings(channel));
      setChannelModels(prev => ({ ...prev, [channel]: models }));
      showToast(models.length ? '模型列表已更新' : '接口没有返回模型列表');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '拉取模型失败');
    } finally { setChannelBusy(null); }
  };

  const testChannel = async (channel: 'chat' | 'moments') => {
    const s = channelSettings[channel];
    if (!s.apiBaseUrl.trim() || !s.apiKey.trim() || !s.model.trim()) { showToast('请先填写 API、Key 和模型'); return; }
    setChannelBusy(channel + '-test' as any);
    try {
      await testAiConnection(channelAsAiSettings(channel));
      showToast('AI 连接测试成功 ✓');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '连接测试失败');
    } finally { setChannelBusy(null); }
  };

  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1800);
  };

  // Modals state
  const [showMaskModal, setShowMaskModal] = useState(false);
  const [showCreateMaskDrawer, setShowCreateMaskDrawer] = useState(false);
  const [newMaskName, setNewMaskName] = useState('');
  const [newMaskDesc, setNewMaskDesc] = useState('');

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupFriends, setSelectedGroupFriends] = useState<string[]>([]);
  /** 建群时从 NPC App 直选（尚未是好友也可），id 列表 */
  const [selectedGroupNpcIds, setSelectedGroupNpcIds] = useState<string[]>([]);
  const [groupModalExpandedChars, setGroupModalExpandedChars] = useState<string[]>([]);

  const [showFriendModal, setShowFriendModal] = useState(false);
  const [showNpcRequests, setShowNpcRequests] = useState(false);
  const [, setNpcRequestRevision] = useState(0);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendModalExpandedChars, setFriendModalExpandedChars] = useState<string[]>([]);
  const [showCreateFriendDrawer, setShowCreateFriendDrawer] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendNote, setNewFriendNote] = useState('');

  const [showPostModal, setShowPostModal] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostTag, setNewPostTag] = useState('#日常');
  const [showMomentsSettings, setShowMomentsSettings] = useState(false);
  const [momentsSettings, setMomentsSettings] = usePersistentState<MomentsCommentSettings>(
    'line:moments-settings',
    DEFAULT_MOMENTS_SETTINGS,
  );
  const [vroomScope, setVroomScope] = useState(() => readVroomScopeSettings());
  const [vroomFriendPersonaId, setVroomFriendPersonaId] = useState<string>('');
  const [vroomRev, setVroomRev] = useState(0);
  const [isPublishingPost, setIsPublishingPost] = useState(false);

  // Moments interactive comments drawer
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentInputText, setCommentInputText] = useState('');
  const [commentReplyTo, setCommentReplyTo] = useState<{ id: string; user: string } | null>(null);

  // Me tab drawers
  const [showMyMomentsModal, setShowMyMomentsModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showGlobalChatSettingsModal, setShowGlobalChatSettingsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showGeneralSettingsModal, setShowGeneralSettingsModal] = useState(false);
  const [channelSettings, setChannelSettings] = useState(() => {
    const settings = readAppSettings();
    return { chat: settings.chatApiOverride, moments: settings.momentsApiOverride };
  });
  const [channelModels, setChannelModels] = useState<{ chat: string[]; moments: string[] }>({ chat: [], moments: [] });
  const [channelBusy, setChannelBusy] = useState<'chat-models' | 'chat-test' | 'moments-models' | 'moments-test' | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showCharacterProfileGenerator, setShowCharacterProfileGenerator] = useState(false);
  const [profileGeneratorMode, setProfileGeneratorMode] = useState<'character' | 'memory'>('character');
  const [profileGeneratorBusy, setProfileGeneratorBusy] = useState(false);
  const [generatedCharacterProfiles, setGeneratedCharacterProfiles] = usePersistentState<Record<string, { profileId?: string; followers: number; following: number; signature: string; updatedAt: string }>>('line:character-generated-profiles', {});
  const [characterProfileStyles, setCharacterProfileStyles] = usePersistentState<Record<string, { avatar?: string; background?: string; accent?: string; fontScale?: number; radius?: number; cardStyle?: 'clean' | 'paper' | 'soft'; customCss?: string }>>('line:character-profile-styles', {});
  const [characterProfileStyleOpen, setCharacterProfileStyleOpen] = useState(false);
  const [characterProfileManageOpen, setCharacterProfileManageOpen] = useState(false);
  const [momentsStyle, setMomentsStyle] = usePersistentState<{ banner?: string; bannerColor?: string; pageColor?: string; colorScope?: 'all' | 'top' | 'bottom'; accent: string; cardStyle: 'clean' | 'paper' | 'soft'; fontScale: number; showTags: boolean }>('line:moments-style', {
    banner: '',
    bannerColor: '',
    pageColor: '',
    colorScope: 'all',
    accent: '#ae7e89',
    cardStyle: 'clean',
    fontScale: 1,
    showTags: true,
  });
  const [momentsBeautyOpen, setMomentsBeautyOpen] = useState(false);
  const [momentsManageOpen, setMomentsManageOpen] = useState(false);
  const [momentsMoreOpen, setMomentsMoreOpen] = useState(false);
  const [momentsDeleteSelectedIds, setMomentsDeleteSelectedIds] = useState<string[]>([]);
  const [momentsDeleteAuthorKey, setMomentsDeleteAuthorKey] = useState<string>('all');
  const [momentsPostMenu, setMomentsPostMenu] = useState<Record<string, any> | null>(null);
  const momentsLongPressTimer = useRef<number | null>(null);
  const momentsLongPressFired = useRef(false);

  const clearMomentsLongPress = () => {
    if (momentsLongPressTimer.current != null) {
      window.clearTimeout(momentsLongPressTimer.current);
      momentsLongPressTimer.current = null;
    }
  };
  const [friendProfile, setFriendProfile] = useState<LineFriend | null>(null);
  const [friendSettingsOpen, setFriendSettingsOpen] = useState(false);
  const [friendEditing, setFriendEditing] = useState(false);
  const [addCharacterChatFriend, setAddCharacterChatFriend] = useState<LineFriend | null>(null);
  const [newChatRelationship, setNewChatRelationship] = useState<'new-friend' | 'old-friend' | 'readded'>('new-friend');
  const [readdedReason, setReaddedReason] = useState<'deleted' | 'blocked' | 'mutual-delete'>('deleted');
  const [relationshipContext, setRelationshipContext] = useState('');
  const [openingMode, setOpeningMode] = useState<'none' | 'context'>('none');
  const [openingGreetingIndex, setOpeningGreetingIndex] = useState(0);
  const [postDetail, setPostDetail] = useState<any | null>(null);
  const [characterMomentsProfile, setCharacterMomentsProfile] = useState<{ characterId: string; name: string } | null>(null);
  const [showMyProfilePage, setShowMyProfilePage] = useState(false);
  const [newPostImage, setNewPostImage] = useState('');
  const [newPostImages, setNewPostImages] = useState<string[]>([]);
  const [newPostVisibility, setNewPostVisibility] = useState<'public' | 'group' | 'self' | 'partial'>('public');
  const [newPostAllowedIds, setNewPostAllowedIds] = useState<string[]>([]);
  const [newPostBlockedIds, setNewPostBlockedIds] = useState<string[]>([]);
  const [newPostMentionIds, setNewPostMentionIds] = useState<string[]>([]);
  /** 文字图片卡正文；最多 1 张；与普通正文、真实图、视频卡可叠加 */
  const [newPostTextCards, setNewPostTextCards] = useState<string[]>([]);
  /** 文字视频卡正文；null = 未添加，最多 1 张 */
  const [newPostVideoText, setNewPostVideoText] = useState<string | null>(null);
  /** 正文里输入 @ 时的下滑好友列表 */
  const [mentionSuggest, setMentionSuggest] = useState<{ start: number; query: string } | null>(null);
  const postTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 图片/视频卡片设置（ME → 聊天设置）：LINE 聊天文字图片/视频和朋友圈共用这一套
  const [textCardStyleId, setTextCardStyleId] = usePersistentState<string>(TEXT_CARD_STYLE_KEY, 'a');
  const [videoCardStyleId, setVideoCardStyleId] = usePersistentState<string>(VIDEO_CARD_STYLE_KEY, 'a');
  const [imageLoadingLabel, setImageLoadingLabel] = usePersistentState<string>(TEXT_CARD_LOADING_KEY, IMAGE_LOADING_LABELS[0].text);
  const [videoCardDuration, setVideoCardDuration] = usePersistentState<number>(VIDEO_CARD_DURATION_KEY, 12);
  const [imgCardOpen, setImgCardOpen] = useState(false);
  const [vidCardOpen, setVidCardOpen] = useState(false);

  // Notification toggles
  const [notifSound, setNotifSound] = useState(true);
  const [notifVibrate, setNotifVibrate] = useState(true);
  const [notifPreview, setNotifPreview] = useState(true);

  // Chat item long-press / context action
  const [chatContextMenu, setChatContextMenu] = useState<any | null>(null);
  const [swipedChatId, setSwipedChatId] = useState<string | null>(null);
  const chatSwipeStart = useRef<{ id: string; x: number; y: number } | null>(null);

  // Moments refresh state
  const [isRefreshingMoments, setIsRefreshingMoments] = useState(false);
  const [isRefreshingComments, setIsRefreshingComments] = useState(false);
  const [generatingCommentsPostId, setGeneratingCommentsPostId] = useState<string | null>(null);

  const handleRefreshComments = async () => {
    if (isRefreshingComments) return;
    setIsRefreshingComments(true);
    try {
      const result = await refreshMomentsFeed();
      try { setMomentsPosts(JSON.parse(window.localStorage.getItem(MOMENTS_POSTS_KEY) || '[]')); } catch { /* ignore */ }
      showToast(result || '刷新完成');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '刷新失败');
    } finally {
      setIsRefreshingComments(false);
    }
  };

  // User / Mask State
  const [importedCharactersRaw, setImportedCharacters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const importedCharacters = Array.isArray(importedCharactersRaw) ? importedCharactersRaw : [];

  const [currentUser, setCurrentUser] = usePersistentState<LineUserProfile>('line:current-user', {
    name: '',
    id: '',
    desc: '',
    avatar: '',
    background: '',
    region: '',
    timezone: '',
    birthday: '',
  });
  const [profileDraft, setProfileDraft] = useState<LineUserProfile>(currentUser);
  const [userPersonasRaw, setUserPersonas] = usePersistentState<any[]>('line:user-personas', []);
  const userPersonas = (Array.isArray(userPersonasRaw) ? userPersonasRaw : []).map((persona: any) => ({
    ...persona,
    boundCharacterIds: Array.isArray(persona?.boundCharacterIds)
      ? persona.boundCharacterIds
      : (persona?.boundCharacterId ? [persona.boundCharacterId] : []),
  }));
  const [activePersonaId, setActivePersonaId] = usePersistentState<string | null>('line:active-persona', null);
  const [personaEditorOpen, setPersonaEditorOpen] = useState(false);
  const [personaEditorIndex, setPersonaEditorIndex] = useState(0);
  const [personaDraft, setPersonaDraft] = useState<any>({ name: '', age: '', ageMode: 'manual', ageReferenceCharacterId: '', ageOffset: 0, profession: '', region: '', timezone: '', birthday: '', setting: '', avatar: '', boundCharacterIds: [] });
  const [personaWeather, setPersonaWeather] = useState<LineWeatherSnapshot | null>(null);
  const [personaWeatherBusy, setPersonaWeatherBusy] = useState(false);
  const activePersona = userPersonas.find((p) => p.id === activePersonaId) || userPersonas[0] || null;
  // Always derive the effective persona from the validated active persona object.
  // This prevents a stale/deleted activePersonaId from becoming a phantom persona.
  const effectivePersonaId = activePersona?.id || null;
  const [personaHomeOpen, setPersonaHomeOpen] = useState(false);
  const [personaSwitchOpen, setPersonaSwitchOpen] = useState(false);
  const [personaHomeIndex, setPersonaHomeIndex] = useState(0);

  const [masks, setMasks] = usePersistentState<Array<{ name: string; id: string; desc: string }>>('line:masks', []);
  // Chat Data with Pin, Mute, Draft, and Group capabilities
  const [chatItemsRaw, setChatItems] = usePersistentState<LineChatItem[]>('line:chat-items', []);

  // Legacy chats without personaId are intentionally NOT reassigned on every
  // persona switch. Reassigning them here would make A/B personas leak into
  // each other's history. New chats always receive the currently selected persona.
  useEffect(() => {
    if (!activePersonaId && activePersona?.id) {
      setActivePersonaId(activePersona.id);
    }
  }, [activePersona?.id, activePersonaId]);
  const chatItems = Array.isArray(chatItemsRaw)
    ? chatItemsRaw.filter((c): c is LineChatItem => !!c && typeof c === 'object' && typeof c.id === 'string')
      .map(c => ({
        ...c,
        name: typeof c.name === 'string' ? c.name : '未命名聊天',
        preview: typeof c.preview === 'string' ? c.preview : '',
        draft: typeof c.draft === 'string' ? c.draft : '',
        time: typeof c.time === 'string' ? c.time : '',
        unread: Number.isFinite(c.unread) ? c.unread : 0,
      }))
    : [];

  // Repair legacy chat-list records in place. Keep each conversation's existing
  // storage ID so its messages/settings are not orphaned; repair display identity
  // from stable character/group/NPC associations instead of replacing IDs.
  useEffect(() => {
    try {
      const rawFriends = window.localStorage.getItem('line:friends-list');
      const storedFriends = rawFriends ? JSON.parse(rawFriends) : [];
      const friends: LineFriend[] = Array.isArray(storedFriends) ? storedFriends : [];
      const rawMeta = window.localStorage.getItem('line:runtime:conversations');
      const runtimeMeta = rawMeta ? JSON.parse(rawMeta) : {};
      const metaById = runtimeMeta && typeof runtimeMeta === 'object' ? runtimeMeta : {};
      const looksLikeInternalId = (value: unknown, id: string) => {
        if (typeof value !== 'string' || !value.trim()) return true;
        const text = value.trim();
        return text === id || /^(?:c_\d+|group-[a-z0-9]+|member-.+|line-msg-\d+)$/.test(text);
      };

      setChatItems(prev => {
        if (!Array.isArray(prev) || !prev.length) return prev;
        let changed = false;
        const next = prev.map(item => {
          const meta = metaById[item.id] && typeof metaById[item.id] === 'object' ? metaById[item.id] : {};
          const groupId = item.groupId || (item.isGroup || item.id.startsWith('group-') ? item.id : '');
          const group = groupId ? getLineGroupById(groupId) : null;
          const friend = friends.find(f =>
            (item.npcId && f.npcId === item.npcId) ||
            (item.characterId && f.characterId === item.characterId && (!item.npcId || f.npcId === item.npcId)) ||
            (looksLikeInternalId(item.name, item.id) && f.name && (
              (meta.characterId && f.characterId === meta.characterId) ||
              (item.npcId && f.npcId === item.npcId)
            ))
          );
          const characterId = item.characterId || meta.characterId || friend?.characterId || undefined;
          const character = importedCharacters.find(c => c.id === characterId) ||
            (!looksLikeInternalId(item.name, item.id) ? importedCharacters.find(c => c.name === item.name) : undefined);
          const resolvedName =
            (group?.name && group.name.trim()) ||
            (friend?.name && friend.name.trim()) ||
            (character?.name && character.name.trim()) ||
            (typeof meta.name === 'string' && !looksLikeInternalId(meta.name, item.id) ? meta.name.trim() : '') ||
            item.name;
          const resolvedGroup = Boolean(item.isGroup || group);
          const patch: LineChatItem = {
            ...item,
            name: resolvedName,
            ...(characterId ? { characterId } : {}),
            ...(group ? { groupId: group.id } : {}),
            isGroup: resolvedGroup,
          };
          if (patch.name !== item.name || patch.characterId !== item.characterId || patch.groupId !== item.groupId || patch.isGroup !== item.isGroup) changed = true;
          if (patch.name && patch.name !== item.id) {
            const existingMeta = metaById[item.id];
            if (!existingMeta || existingMeta.name !== patch.name || existingMeta.isGroup !== patch.isGroup || existingMeta.characterId !== patch.characterId) {
              touchLineConversation(item.id, { name: patch.name, isGroup: patch.isGroup, ...(patch.characterId ? { characterId: patch.characterId } : {}) });
            }
          }
          return patch;
        });
        return changed ? next : prev;
      });
    } catch (error) {
      reportPersistenceIssue('line-chat-migration', 'LINE 聊天条目关联修复失败', error);
    }
  }, [chatItemsRaw, importedCharacters]);


  // 恢复已经存在但 Chat 入口丢失的聊天。只从真实 conversation 数据恢复。
  useEffect(() => {
    try {
      const recovered: LineChatItem[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith('line:conversation:')) continue;
        const id = key.slice('line:conversation:'.length);
        if (!id) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const stored = JSON.parse(raw);
        if (!Array.isArray(stored) || !stored.length) continue;
        const realMessages = stored.filter((message: any) => message && typeof message === 'object' && message.type !== 'system-nudge');
        if (!realMessages.length) continue;
        const latest = realMessages[realMessages.length - 1];
        const existing = chatItems.find(item => item.id === id);
        const runtimeMeta = getLineConversationMeta(id);
        const group = getLineGroupById(existing?.groupId || (runtimeMeta?.isGroup || id.startsWith('group-') ? id : ''));
        const character = importedCharacters.find(item => item.id === existing?.characterId || item.id === runtimeMeta?.characterId || item.id === id);
        const existingName = typeof existing?.name === 'string' ? existing.name.trim() : '';
        const runtimeName = typeof runtimeMeta?.name === 'string' ? runtimeMeta.name.trim() : '';
        const name = (existingName && existingName !== id ? existingName : '') ||
          (group?.name && group.name !== id ? group.name : '') ||
          (runtimeName && runtimeName !== id ? runtimeName : '') ||
          character?.name || id;
        if (name !== id && (!runtimeMeta || runtimeMeta.name !== name || runtimeMeta.isGroup !== Boolean(group))) {
          touchLineConversation(id, { name, isGroup: Boolean(group), ...(group ? {} : { characterId: existing?.characterId || character?.id }) });
        }
        const latestType = String(latest?.type || latest?.kind || '');
        const latestCategory = String(latest?.category || latest?.metadata?.category || '');
        const isVoice =
          latestType === 'voice' ||
          latestCategory === 'voice' ||
          String(latest?.metadata?.mediaType || latest?.mediaType || '') === 'voice' ||
          latest?.title === '文字语音';
        const voiceText = String(
          latest?.transcript ||
          latest?.desc ||
          latest?.metadata?.transcript ||
          latest?.metadata?.desc ||
          ''
        ).trim();
        const preview = String(
          (isVoice ? (voiceText ? '[语音] ' + voiceText : '[语音]') : '') ||
          latest?.text ||
          latest?.transcript ||
          (latestType === 'offline-invite' ? '💌 线下剧情邀约' : '') ||
          (latestType === 'real-media' ? '[媒体] ' + (latest?.fileName || '附件') : '') ||
          (latestType === 'ai-card' ? '[' + (latest?.title || '多媒体') + ']' : '') ||
          '新消息'
        ).replace(/\s+/g, ' ').slice(0, 80);
        recovered.push({
          id,
          name,
          characterId: existing?.characterId || runtimeMeta?.characterId || (!group ? character?.id : undefined),
          variantLabel: existing?.variantLabel || '默认版本',
          relationship: existing?.relationship || 'new-friend',
          relationshipContext: existing?.relationshipContext || '',
          openingMode: existing?.openingMode || 'none',
          openingGreeting: existing?.openingGreeting || '',
           // Do not attach an orphaned legacy transcript to whichever persona happens to be active during recovery.
          // Only preserve the persona explicitly stored on the exact matching chat item.
          personaId: existing?.personaId || undefined,
          groupId: existing?.groupId || group?.id,
          time: latest?.time || '刚刚',
          preview,
          unread: existing?.unread || 0,
          isPinned: existing?.isPinned || false,
          isMuted: existing?.isMuted || false,
          draft: existing?.draft || '',
          isGroup: Boolean(existing?.isGroup || runtimeMeta?.isGroup || group),
        });
      }
      if (!recovered.length) return;
      setChatItems(prev => {
        let next = [...prev];
        for (const item of recovered) {
          const existingIndex = next.findIndex(chat => chat.id === item.id);
          if (existingIndex >= 0) next[existingIndex] = { ...next[existingIndex], ...item, unread: next[existingIndex].unread };
          else next.unshift(item);
        }
        return next;
      });
    } catch {}
  }, [importedCharacters, effectivePersonaId]);

  // Background proactive messages can update the chat list without reopening LINE.
  useEffect(() => {
    const refreshFromRuntime = () => {
      try {
        const raw = window.localStorage.getItem('line:chat-items');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return;
          // Runtime events can fire while a conversation is marking itself read.
          // Preserve the existing array reference when persisted chat data is unchanged,
          // preventing a parent rerender loop from repeatedly refreshing the same list.
          setChatItems(prev => JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed);
        }
      } catch {
        // Keep current in-memory list.
      }
    };

    const openChatId = (chatId: string) => {
      if (!chatId) return;
      setActiveChatId(chatId);
    };

    const handleMusicInvite = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{
          conversationId?: string;
          open?: boolean;
          session?: {
            id: string;
            characterId: string;
            characterName: string;
            variantLabel?: string;
            track: { name: string };
            mode: 'direct' | 'stranger';
          };
        }>).detail;
        const session = detail?.session;
        if (!session?.characterId && !detail?.conversationId) return;
        refreshFromRuntime();
        setChatItems(prev => {
          const list = Array.isArray(prev) ? prev : [];
          const byConversation = detail?.conversationId
            ? list.find((item) => item.id === detail.conversationId)
            : null;
          const byCharacter = session?.characterId
            ? list.find((item) => !item.isGroup && item.characterId === session.characterId)
            : null;
          const existing = byConversation || byCharacter;
          const preview = session?.track?.name
            ? `♪ 邀请一起听《${session.track.name}》`
            : '♪ 邀请一起听';
          if (existing) {
            return list.map((item) =>
              item.id === existing.id
                ? { ...item, time: '刚刚', preview, unread: 0 }
                : item
            );
          }
          if (!session) return list;
          const item: LineChatItem = {
            id: detail?.conversationId || `c_${Date.now().toString(36)}`,
            name: session.characterName,
            characterId: session.characterId,
            variantLabel: session.variantLabel || '默认版本',
            chatLabel: session.mode === 'stranger' ? '音乐陌生人' : '一起听歌',
            time: '刚刚',
            preview,
            unread: 0,
            isPinned: false,
            isMuted: false,
            draft: '',
            isGroup: false,
          };
          return [item, ...list];
        });
        if (detail?.open) {
          const id = detail.conversationId || session?.characterId || '';
          if (id) window.setTimeout(() => openChatId(id), 0);
        }
      } catch {
        // Ignore malformed invite events.
      }
    };
    window.addEventListener('sane333:proactive-message', refreshFromRuntime);
    window.addEventListener('sane333:music-invite-created', handleMusicInvite);
    window.addEventListener('sane333:line-runtime-changed', refreshFromRuntime);
    window.addEventListener('sane333:line-runtime-message', refreshFromRuntime);
    return () => {
      window.removeEventListener('sane333:proactive-message', refreshFromRuntime);
      window.removeEventListener('sane333:music-invite-created', handleMusicInvite);
      window.removeEventListener('sane333:line-runtime-changed', refreshFromRuntime);
      window.removeEventListener('sane333:line-runtime-message', refreshFromRuntime);
    };
  }, []);

  // 从音乐 App 邀请后切回 LINE：打开对应会话
  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem('line:pending-open-chat');
      if (!pending) return;
      window.sessionStorage.removeItem('line:pending-open-chat');
      try {
        const raw = window.localStorage.getItem('line:chat-items');
        if (raw) setChatItems(JSON.parse(raw));
      } catch {
        /* keep */
      }
      setActiveChatId(pending);
    } catch {
      /* ignore */
    }
  }, []);

  // Imported character cards are candidates for adding, not automatically friends.
  // The Add Friend flow must be the only place that creates a friendship.
  useEffect(() => {
    // Migrate the old auto-friend behavior once: those rows were created with
    // online=false. Real Add Friend rows use online=true.
    if (importedCharacters.length) {
      setFriendsList(prev => {
        if (!Array.isArray(prev)) return [];
        const importedIds = new Set(importedCharacters.map(character => character.id));
        return prev.filter(friend =>
          // NPC 好友用绑定角色 id 占 characterId，不能按「未导入角色卡」清掉
          Boolean(friend.npcId) ||
          !friend.characterId ||
          !importedIds.has(friend.characterId) ||
          friend.online !== false
        );
      });
    }

    // Remove legacy chats that were created automatically just because a card was imported.
    // Explicitly created chats use their own generated id and are left untouched.
    if (importedCharacters.length) {
      setChatItems(prev => {
        if (!Array.isArray(prev)) return [];
        const importedIds = new Set(importedCharacters.map(character => character.id));
        const hasConversation = (id: string) => {
          try {
            const raw = window.localStorage.getItem('line:conversation:' + id);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) && parsed.length > 0;
          } catch {
            return false;
          }
        };
        const next = prev.filter(item =>
          !(item.characterId && importedIds.has(item.characterId) && item.id === item.characterId && !hasConversation(item.id))
        );
        return next.length === prev.length ? prev : next;
      });
    }
  }, [importedCharacters]);

  // Global Favorites start empty; favorites are created by the user.
  const [globalFavoritesRaw, setGlobalFavorites] = usePersistentState<any[]>('line:global-favorites', []);
  const globalFavorites = Array.isArray(globalFavoritesRaw) ? globalFavoritesRaw : [];

  // Friends Data
  const [friendsListRaw, setFriendsList] = usePersistentState<LineFriend[]>('line:friends-list', []);
  const friendsList = Array.isArray(friendsListRaw)
    ? friendsListRaw.filter((f): f is LineFriend => !!f && typeof f === 'object' && typeof f.name === 'string')
      .map(f => ({ ...f, note: typeof f.note === 'string' ? f.note : '', pinyin: typeof f.pinyin === 'string' ? f.pinyin : '' }))
    : [];

  useEffect(() => {
    const refreshRequests = () => setNpcRequestRevision(value => value + 1);
    window.addEventListener('sane333:npc-friend-requests-updated', refreshRequests);
    return () => window.removeEventListener('sane333:npc-friend-requests-updated', refreshRequests);
  }, []);

    // Moments Posts are created by the user and imported characters; start empty.
  const [momentsPostsRaw, setMomentsPosts] = usePersistentState<any[]>('line:moments-posts', []);
  const momentsPosts = Array.isArray(momentsPostsRaw)
    ? momentsPostsRaw.filter((p): p is Record<string, any> => !!p && typeof p === 'object')
    : [];

  // Proactive / autonomous writers touch localStorage directly — refresh React state.
  useEffect(() => {
    const reload = () => {
      try {
        const raw = window.localStorage.getItem(MOMENTS_POSTS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMomentsPosts(parsed);
      } catch {
        // ignore corrupt payloads
      }
    };
    window.addEventListener('sane333:moments-updated', reload);
    return () => window.removeEventListener('sane333:moments-updated', reload);
  }, [setMomentsPosts]);

  // Filtered & Sorted Chats (Pinned items always float to the top)
  const chatQuery = chatSearch.trim().toLowerCase();
  const activePersonaForFilter = userPersonas.find((p: any) => p.id === effectivePersonaId) || null;
  const boundIds: string[] = Array.isArray((activePersonaForFilter as any)?.boundCharacterIds)
    ? (activePersonaForFilter as any).boundCharacterIds
    : [];
  const hasBounds = boundIds.length > 0;
  const boundSet = new Set(boundIds);
  // 核心规则：切换用户 = 整个 LINE 只剩这个人设绑定的好友。
  // 私聊：personaId 必须匹配，且 characterId 必须在绑定集合里（无绑定时不过滤）。
  // NPC 好友的 characterId = 绑定角色 id，因此同样走人设连接过滤。
  // 群聊：不过滤绑定，只跟随 persona。
  // 好友 / 朋友圈同样只显示绑定角色。
  const allLineNpcs = getNpcs();
  const personaChats = chatItems.filter((c) => {
    // A group or NPC chat without a persona binding is legacy data: do not
    // silently expose it inside every persona's LINE inbox.
    if (effectivePersonaId && c.npcId && c.personaId !== effectivePersonaId) return false;
    if (c.isGroup) {
      if (!effectivePersonaId) return true;
      return c.personaId === effectivePersonaId;
    }
    if (effectivePersonaId && c.personaId && c.personaId !== effectivePersonaId) return false;
    if (effectivePersonaId && !c.personaId && !c.npcId && hasBounds && c.characterId && !boundSet.has(c.characterId)) return false;
    // NPC is its own LINE identity; a bound character is optional metadata only.
    if (!c.npcId && hasBounds && c.characterId && !boundSet.has(c.characterId)) return false;
    return true;
  });
  const visibleFriends = friendsList.filter((f) => {
    // NPC 好友必须具有明确的人设绑定；缺失绑定的旧记录不跨人设显示。
    if (effectivePersonaId && f.npcId && f.personaId !== effectivePersonaId) return false;
    if (hasBounds) {
      // NPC friendship belongs to this persona and NPC ID, not to a bound card.
      if (f.npcId) return true;
      return f.characterId ? boundSet.has(f.characterId) : true;
    }
    return true;
  });

  const resolveFriendAvatar = (friend: LineFriend) => {
    if (friend.npcId) {
      const npc = allLineNpcs.find(item => item && item.id === friend.npcId);
      if (npc?.avatar) return npc.avatar;
      const bound = importedCharacters.find(c => c.id === (npc?.boundCharacterId || friend.characterId));
      return bound?.avatar || '';
    }
    return importedCharacters.find(c => c.id === friend.characterId)?.avatar
      || importedCharacters.find(c => c.name === friend.name)?.avatar
      || '';
  };

  const resolveChatAvatar = (item: LineChatItem) => {
    if (item.isGroup) {
      const group = getLineGroupById(item.groupId || '');
      if (group?.avatar) return group.avatar;
      return '';
    }
    if (item.npcId) {
      const npc = allLineNpcs.find(n => n && n.id === item.npcId);
      if (npc?.avatar) return npc.avatar;
      const bound = importedCharacters.find(c => c.id === (npc?.boundCharacterId || item.characterId));
      return bound?.avatar || '';
    }
    return importedCharacters.find(c => c.id === item.characterId)?.avatar
      || importedCharacters.find(c => c.name === item.name)?.avatar
      || '';
  };

  const addableNpcsForPersona = (() => {
    const q = friendSearchQuery.trim().toLowerCase();
    return allLineNpcs
      .filter(npc => npc.active !== false)
      .filter(npc => !friendsList.some(f => f.npcId === npc.id && (!f.personaId || f.personaId === effectivePersonaId)))
      .filter(npc => {
        if (!q) return true;
        return [npc.name, npc.boundCharacterName, npc.identity, npc.relationship]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q));
      });
  })();

  const addableNpcGroups = (() => {
    const map = new Map<string, { characterId: string; characterName: string; avatar: string; npcs: SaneNpc[] }>();
    for (const npc of addableNpcsForPersona) {
      const bound = importedCharacters.find(c => c.id === npc.boundCharacterId);
      const characterName = npc.boundCharacterName || bound?.name || '未命名角色';
      const existing = map.get(npc.boundCharacterId);
      if (existing) existing.npcs.push(npc);
      else map.set(npc.boundCharacterId, {
        characterId: npc.boundCharacterId,
        characterName,
        avatar: bound?.avatar || '',
        npcs: [npc],
      });
    }
    return Array.from(map.values()).sort((a, b) => a.characterName.localeCompare(b.characterName, 'zh'));
  })();

  /** 建群：人设已连接角色下的 NPC（含已是好友的，避免漏选；好友区勾选过的会去重） */
  const creatableNpcsForPersona = allLineNpcs
    .filter(npc => npc.active !== false);

  const creatableNpcGroups = (() => {
    const map = new Map<string, { characterId: string; characterName: string; avatar: string; npcs: SaneNpc[] }>();
    for (const npc of creatableNpcsForPersona) {
      const bound = importedCharacters.find(c => c.id === npc.boundCharacterId);
      const characterName = npc.boundCharacterName || bound?.name || '未命名角色';
      const existing = map.get(npc.boundCharacterId);
      if (existing) existing.npcs.push(npc);
      else map.set(npc.boundCharacterId, {
        characterId: npc.boundCharacterId,
        characterName,
        avatar: bound?.avatar || '',
        npcs: [npc],
      });
    }
    return Array.from(map.values()).sort((a, b) => a.characterName.localeCompare(b.characterName, 'zh'));
  })();

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setSelectedGroupFriends([]);
    setSelectedGroupNpcIds([]);
    setGroupModalExpandedChars([]);
    setNewGroupName('');
  };

  const selectNpcAsFriendCandidate = (npc: SaneNpc) => {
    setAddCharacterChatFriend({
      name: npc.name,
      characterId: npc.boundCharacterId,
      npcId: npc.id,
      kind: 'npc',
      note: 'NPC · 绑定 ' + (npc.boundCharacterName || '角色'),
      variantLabel: npc.boundCharacterName || 'NPC',
      online: true,
      pinyin: npc.name[0] || '',
    });
    setShowFriendModal(false);
    setOpeningMode('none');
    setOpeningGreetingIndex(0);
  };
  const isOwnMoment = (p: Record<string, any>) => {
    if (p?.npcId) return false;
    if (p?.characterId) return false;
    if (p?.isMine === true) return true;
    if (p?.personaId && effectivePersonaId && p.personaId === effectivePersonaId) return true;
    const myNames = new Set([activePersonaForFilter?.name, currentUser.name].filter(Boolean));
    return myNames.has(p?.name);
  };
  const resolveMomentAvatar = (p: Record<string, any>) => {
    if (p?.npcId) {
      const npc = allLineNpcs.find(n => n && n.id === p.npcId);
      if (npc?.avatar) return npc.avatar;
      const bound = importedCharacters.find(c => c.id === (npc?.boundCharacterId || p.characterId));
      return bound?.avatar || '';
    }
    if (p?.characterId) {
      return importedCharacters.find(c => c.id === p.characterId)?.avatar || '';
    }
    return (
      p?.avatar
      || userPersonas.find((persona: any) => persona.id === p?.personaId)?.avatar
      || (p?.name === activePersona?.name ? activePersona?.avatar : '')
      || currentUser.avatar
      || ''
    );
  };
  const visibleMoments = momentsPosts.filter((p) => {
    // 数据完整性兜底：坏掉的帖子（无 id）直接过滤，不进渲染，避免整屏崩溃。
    // 注意：不要校验 text 字段，图片/卡片帖的 text 可能为空，渲染层已做 String() 兜底。
    if (!p || typeof p !== 'object' || !p.id) return false;
    if (isOwnMoment(p)) return true;
    const authorKey = p.npcId ? 'npc:' + p.npcId : p.characterId ? 'character:' + p.characterId : p.name ? 'character-name:' + p.name : '';
    const viewerKey = 'persona:' + (effectivePersonaId || 'default');
    if (authorKey && isVroomBlockedEdge(viewerKey, authorKey)) return false;
    if (p.visibility === 'self') return false;
    const allowedIds = Array.isArray(p.allowedIds) ? p.allowedIds.map(String) : [];
    const blockedIds = Array.isArray(p.blockedIds) ? p.blockedIds.map(String) : [];
    const viewerIds = [effectivePersonaId || '', 'persona:' + (effectivePersonaId || 'default'), activePersonaForFilter?.name || '', currentUser.name || '', 'user'].filter(Boolean);
    if (blockedIds.some(id => viewerIds.includes(id))) return false;
    if (['group', 'partial', 'custom'].includes(String(p.visibility || '')) && allowedIds.length && !allowedIds.some(id => viewerIds.includes(id))) return false;
    // Only LINE friends (or explicitly allowed VROOM edges) appear in the phone's feed.
    // A public post does not turn an unadded stranger into a LINE friend.
    if (authorKey) {
      const isFriend = p.npcId
        ? friendsList.some(f => !f.deleted && f.npcId === p.npcId && (!f.personaId || f.personaId === effectivePersonaId))
        : friendsList.some(f => !f.deleted && !f.npcId && ((p.characterId && f.characterId === p.characterId) || (p.name && f.name === p.name)));
      if (!isFriend && !isVroomAllowedEdge(viewerKey, authorKey)) return false;
    }
    if (hasBounds) {
      if (p.npcId) {
        const npc = allLineNpcs.find(n => n && n.id === p.npcId);
        const bound = npc?.boundCharacterId || p.characterId;
        return !bound || boundSet.has(bound);
      }
      if (p.characterId && !boundSet.has(p.characterId)) return false;
    }
    return true;
  });
  const myMoments = visibleMoments.filter(isOwnMoment);

  /** 兼容旧帖：单 textCard 时正文在 post.text；新帖 caption / 卡片正文分开 */
  const getPostCaption = (post: Record<string, any>) => {
    if (Array.isArray(post.textCards) || (post.videoCard && typeof post.videoCard?.text === 'string')) {
      return String(post.text || '');
    }
    if (post.textCard || post.videoCard) return '';
    return String(post.text || '');
  };
  const getPostTextCards = (post: Record<string, any>): Array<{ text: string; style?: string }> => {
    if (Array.isArray(post.textCards) && post.textCards.length) {
      return post.textCards
        .map((c: any) => ({ text: String(c?.text || ''), style: c?.style as string | undefined }))
        .filter((c: { text: string }) => c.text.trim());
    }
    if (post.textCard && !post.videoCard) {
      const body = String(post.textCard?.text || post.text || '').trim();
      return body ? [{ text: body, style: post.textCard?.style }] : [];
    }
    return [];
  };
  const getPostVideoCard = (post: Record<string, any>): { text: string; style?: string; duration?: number } | null => {
    if (!post.videoCard) return null;
    const legacy = !Array.isArray(post.textCards) && typeof post.videoCard?.text !== 'string';
    const body = String(post.videoCard?.text ?? (legacy ? post.text : '') ?? '').trim();
    if (!body) return null;
    return {
      text: body,
      style: post.videoCard?.style,
      duration: post.videoCard?.duration ?? post.duration,
    };
  };

  const syncMentionSuggest = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = before.match(/@([^\s@]*)$/);
    if (match) setMentionSuggest({ start: caret - match[0].length, query: match[1] || '' });
    else setMentionSuggest(null);
  };

  const applyMentionPick = (friend: { name: string; characterId?: string; npcId?: string }) => {
    if (!mentionSuggest) return;
    const key = friendAudienceKey(friend);
    const el = postTextareaRef.current;
    const caret = el?.selectionStart ?? newPostText.length;
    const before = newPostText.slice(0, mentionSuggest.start);
    const after = newPostText.slice(caret);
    const next = `${before}@${friend.name} ${after}`;
    setNewPostText(next);
    setNewPostMentionIds(prev => (prev.includes(key) ? prev : [...prev, key]));
    setMentionSuggest(null);
    requestAnimationFrame(() => {
      const pos = before.length + friend.name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  /** 发帖「谁可以看 / 不给谁看 / @」：LINE 好友 + 尚未加好友的 NPC 都可选 */
  const vroomAudienceFriends: LineFriend[] = (() => {
    const base = friendsList.filter(f => !f.deleted);
    const haveNpc = new Set(base.map(f => f.npcId).filter(Boolean) as string[]);
    const extras: LineFriend[] = allLineNpcs
      .filter(n => !haveNpc.has(n.id))
      .map(n => ({
        name: n.name,
        characterId: n.boundCharacterId,
        npcId: n.id,
        kind: 'npc' as const,
        note: 'NPC',
        online: true,
        pinyin: '',
      }));
    return [...base, ...extras];
  })();

  const mentionCandidates = mentionSuggest
    ? vroomAudienceFriends.filter(f => {
        const q = mentionSuggest.query.trim().toLowerCase();
        if (!q) return true;
        return (
          f.name.toLowerCase().includes(q)
          || (f.characterId || '').toLowerCase().includes(q)
          || (f.npcId || '').toLowerCase().includes(q)
        );
      })
    : [];
  const filteredChats = personaChats.filter((c) =>
    !chatQuery ||
    c.name.toLowerCase().includes(chatQuery) ||
    c.preview.toLowerCase().includes(chatQuery) ||
    c.draft.toLowerCase().includes(chatQuery)
  );

  const sortedChats = [...filteredChats].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  // If a chat is open, render the detail view
  if (activeChatId) {
    const activeItem = chatItems.find((c) => c.id === activeChatId);
    if (!activeItem) {
      // Only an actually missing/deleted chat should send us back.
      queueMicrotask(() => setActiveChatId(null));
      return (
        <div className="w-full h-full pt-[30px] bg-white flex items-center justify-center">
          <div className="text-center px-8">
            <div className="text-sm font-semibold text-[#333]">聊天暂时无法打开</div>
            <div className="mt-2 text-xs text-[#aaa]">这个聊天入口当前无法正常打开，聊天数据没有被删除。</div>
            <button
              onClick={() => setActiveChatId(null)}
              className="mt-5 px-4 py-2 rounded-full bg-[#292724] text-white text-xs"
            >
              返回聊天
            </button>
          </div>
        </div>
      );
    }
    if (activeItem.characterId) markCharacterRead(activeItem.characterId);
    const activeChatName = activeItem?.name || activeChatId;
    const activeCharacterId = activeItem?.characterId || undefined;
    // The chat item itself is the conversation identity. Persona isolation is
    // enforced by the chat item's personaId, so separate chats for the same
    // character can still remain independent.
    const conversationId = activeItem.id;
    return (
      <div className="w-full h-full pt-[30px] bg-white">
        <LineConversationErrorBoundary key={activeChatId} onBack={() => setActiveChatId(null)}>
        <LineConversationView
          contactName={activeChatName}
          characterId={activeCharacterId}
          npcId={activeItem.npcId}
          conversationId={conversationId}
          personaId={activeItem.personaId || effectivePersonaId || undefined}
          personaOptions={userPersonas.map((p: any) => ({ id: p.id, name: p.name, avatar: p.avatar }))}
          onSelectPersona={(nextPersonaId) => {
            if (!nextPersonaId || nextPersonaId === (activeItem.personaId || effectivePersonaId)) return;
            const target = chatItems.find((chat) =>
              !chat.isGroup &&
              (activeItem.npcId
                ? chat.npcId === activeItem.npcId
                : activeItem.characterId
                  ? chat.characterId === activeItem.characterId && !chat.npcId
                  : chat.name === activeItem.name) &&
              chat.personaId === nextPersonaId
            );
            setActivePersonaId(nextPersonaId);
            if (target) {
              setActiveChatId(target.id);
              return;
            }
            const createdId = `c_${Date.now()}`;
            const cloned: LineChatItem = {
              ...activeItem,
              id: createdId,
              personaId: nextPersonaId,
              time: '刚刚',
              preview: '',
              unread: 0,
              draft: '',
            };
            setChatItems(prev => [cloned, ...prev]);
            setActiveChatId(createdId);
          }}
          onBack={(draft?: string) => {
            if (typeof draft === 'string') {
              setChatItems((prev) =>
                prev.map((c) => (c.id === activeChatId ? { ...c, draft } : c))
              );
            }
            setActiveChatId(null);
          }}
          onNavigateHome={onNavigateHome}
          onNavigateScreen={onNavigateScreen}
          initialDraft={activeItem?.draft || ''}
          isGroup={activeItem?.isGroup || activeChatName === '我们的小角落'}
          isPinned={activeItem?.isPinned || false}
          isMuted={activeItem?.isMuted || false}
          onGroupRenamed={(name) => {
            setChatItems((prev) =>
              prev.map((c) => (c.id === activeChatId ? { ...c, name } : c))
            );
          }}
          onConversationActivity={({ preview, time }) => {
            setChatItems((prev) =>
              prev.map((c) =>
                c.id === activeChatId
                  ? { ...c, preview, time, unread: 0 }
                  : c
              )
            );
          }}
          onTogglePin={() => {
            setChatItems((prev) =>
              prev.map((c) =>
                c.id === activeChatId ? { ...c, isPinned: !c.isPinned } : c
              )
            );
          }}
          relationshipContext={activeItem.relationshipContext}
          friendDeleted={activeItem.friendStatus === 'not-friend'}
          openingContext={activeItem.openingMode === 'context' ? activeItem.openingGreeting : ''}
          onToggleMute={() => {
            setChatItems((prev) =>
              prev.map((c) =>
                c.id === activeChatId ? { ...c, isMuted: !c.isMuted } : c
              )
            );
          }}
        />
        </LineConversationErrorBoundary>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col justify-between bg-white text-[#343538] select-none font-sans overflow-hidden pt-[30px]">
      
      {/* =====================================================
           PAGE 1: CHAT (聊天列表)
      ===================================================== */}
      {activeTab === 'chat' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 flex items-start justify-between bg-white">
            <div>
              <div className="text-[25px] font-bold tracking-[-0.8px] text-[#202124] leading-tight">
                {tx('聊天', 'トーク')}
              </div>
              <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
                {tx('トーク · 今日はゆっくり。', '今日はゆっくり。')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedGroupFriends([]);
                  setSelectedGroupNpcIds([]);
                  setGroupModalExpandedChars([]);
                  setNewGroupName('');
                  setShowGroupModal(true);
                }}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-lg text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title={tx('创建群聊', 'グループを作成')}
              >
                ＋
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mx-4 mb-3 h-[38px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5 text-[#aaa] text-[13px]">
            <span className="mr-2 text-base">⌕</span>
            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder={tx('搜索联系人或聊天记录', '連絡先・チャットを検索')}
              className="w-full bg-transparent outline-none text-xs text-[#555] font-sans"
            />
            {chatSearch && (
              <button onClick={() => setChatSearch('')} className="text-xs text-[#aaa] px-1">
                ×
              </button>
            )}
          </div>

          {/* Chat List */}
          <div className="divide-y divide-[#f1f1f1]">
            {sortedChats.map((item) => (
              <div
                key={item.id}
                className="relative h-[76px] overflow-hidden bg-white border-b border-[#f1f1f1]"
                onPointerDown={(e) => {
                  chatSwipeStart.current = { id: item.id, x: e.clientX, y: e.clientY };
                }}
                onPointerMove={(e) => {
                  const start = chatSwipeStart.current;
                  if (!start || start.id !== item.id) return;
                  const dx = e.clientX - start.x;
                  const dy = e.clientY - start.y;
                  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                    setSwipedChatId(dx < 0 ? item.id : null);
                  }
                }}
                onPointerUp={() => { chatSwipeStart.current = null; }}
                onPointerCancel={() => { chatSwipeStart.current = null; }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    if (swipedChatId === item.id) {
                      e.stopPropagation();
                      setSwipedChatId(null);
                      return;
                    }
                    setChatItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, unread: 0 } : c)));
                    markLineConversationRead(item.id);
                    markLineNotificationsReadForConversation(item.id);
                    setActiveChatId(item.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setChatContextMenu(item);
                  }}
                  className="absolute inset-y-0 left-0 z-10 w-full px-4 flex items-center text-left bg-white transition-transform duration-200 touch-pan-y"
                  style={{ transform: swipedChatId === item.id ? 'translateX(-76px)' : 'translateX(0)' }}
                >
                {/* Default Avatar SVG from template */}
                <div className="relative">
                  <div className="w-[49px] h-[49px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    <NpcAvatar name={item.name} avatar={resolveChatAvatar(item)} className="w-full h-full" textClassName="text-[18px]" />
                  </div>
                  {item.isPinned && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#ae7e89] text-white flex items-center justify-center text-[7px] shadow-2xs">
                      📌
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 ml-3">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[14px] font-semibold text-[#28292b]">{item.name}</span>
                      {item.variantLabel && !item.isGroup && <span className="text-[8px] text-[#a69da0] shrink-0">· {item.variantLabel}</span>}
                      {item.isMuted && (
                        <BellOff className="w-3 h-3 text-[#b2b2b4] shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#b5b5b6] shrink-0 ml-1">
                      {item.time}
                    </span>
                  </div>

                  <div className="text-[12px] text-[#999b9f] truncate pr-2">
                    {item.draft ? (
                      <span>
                        <span className="text-[#ae7e89] font-medium">[草稿] </span>
                        {item.draft}
                      </span>
                    ) : (
                      item.preview
                    )}
                  </div>
                </div>

                {item.unread > 0 && (
                  <div className="w-[17px] h-[17px] rounded-full bg-[#d7b0ba] text-white text-[9px] flex items-center justify-center shrink-0 ml-2 font-medium">
                    {item.unread}
                  </div>
                )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChatItems((prev) => prev.filter((chat) => chat.id !== item.id));
                    setSwipedChatId(null);
                    showToast('聊天已删除');
                  }}
                  className="absolute inset-y-0 right-0 z-0 w-[76px] bg-[#e96f73] text-white text-[11px] font-medium flex items-center justify-center"
                >
                  删除
                </button>
              </div>
            ))}

            {sortedChats.length === 0 && (
              <div className="py-16 text-center text-xs text-[#aaa]">
                未搜到相关记录
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
           PAGE 2: FRIENDS (通讯录好友)
      ===================================================== */}
      {activeTab === 'friends' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 flex items-start justify-between bg-white">
            <div>
              <div className="text-[25px] font-bold tracking-[-0.8px] text-[#202124] leading-tight">
                {tx('好友', '友だち')}
              </div>
              <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
                {tx('友だち · 大切な人たち', '大切な人たち')} · ({visibleFriends.length}){hasBounds ? ` · ${activePersona?.name}专属` : ''}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFriendModal(true)}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-lg text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title="添加好友"
              >
                ＋
              </button>
              <button
                onClick={() => { setShowNpcRequests(true); setNpcRequestRevision(value => value + 1); }}
                className="relative w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-[13px] text-[#555] hover:bg-[#f7f7f7] cursor-pointer"
                title="NPC 好友申请"
              >
                <UserCheck className="w-4 h-4" />
                {getNpcFriendRequests().filter(request => request.status === 'pending' && (!effectivePersonaId || request.personaId === effectivePersonaId)).length > 0 && <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-rose-400" />}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mx-4 mb-3 h-[38px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5 text-[#aaa] text-[13px]">
            <span className="mr-2 text-base">⌕</span>
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="搜索联系人"
              className="w-full bg-transparent outline-none text-xs text-[#555] font-sans"
            />
          </div>

          {/* Friends List */}
          <div className="divide-y divide-[#f2f2f2]">
            {hasBounds && (
              <button onClick={() => setPersonaHomeOpen(true)} className="w-full mx-4 my-2 p-3 rounded-2xl bg-white border border-[#eeeeef] text-left flex items-center gap-2">
                <span className="text-[13px] text-[#555]">○</span>
                <span className="text-[10px] text-[#777]">当前是「{activePersona?.name}」的 LINE · 只显示绑定的 {boundIds.length} 位好友 · 点我管理人设卡</span>
              </button>
            )}
            {visibleFriends
              .filter((f) =>
                f.name.toLowerCase().includes(friendSearch.toLowerCase()) ||
                f.note.toLowerCase().includes(friendSearch.toLowerCase())
              )
              .map((friend, idx) => (
                <div
                  key={friend.npcId || friend.characterId || friend.name + '-' + idx}
                  onClick={() => { setFriendSettingsOpen(false); setFriendEditing(false); setCharacterProfileStyleOpen(false); setCharacterProfileManageOpen(false); setFriendProfile(friend); }}
                  className="h-[67px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa] active:bg-[#f5f5f5] transition-colors"
                >
                  <div className="w-[49px] h-[49px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    <NpcAvatar name={friend.name} avatar={resolveFriendAvatar(friend)} className="w-full h-full" textClassName="text-[18px]" />
                  </div>

                  <div className="ml-3 flex-1 min-w-0">
                    <div className="text-[14px] text-[#303134] font-medium">
                      {friend.name} {friend.variantLabel && <span className="text-[8px] text-[#aaa]">· {friend.variantLabel}</span>}
                    </div>
                    <div className="text-[10px] text-[#aaa] mt-1 truncate">
                      {friend.note}
                    </div>
                  </div>

                  {friend.online && (
                    <div className="w-[6px] h-[6px] bg-[#b9d2c1] rounded-full ml-auto shrink-0" />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* =====================================================
           PAGE 3: MOMENTS (朋友圈)
      ===================================================== */}
      {activeTab === 'moments' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20" style={{ background: momentsStyle.colorScope !== 'top' && momentsStyle.pageColor ? momentsStyle.pageColor : undefined }}>
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 flex items-start justify-between bg-white">
            <div>
              <div className="text-[25px] font-serif italic tracking-[-0.5px] text-[#202124] leading-tight">
                Vroom
              </div>
              <div className="mt-1 text-[10px] text-[#b2b2b4] tracking-[0.7px]">
                {tx('记录一些小事', '小さなことを記録する')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMomentsMoreOpen(true)}
                className="w-[35px] h-[35px] border border-[#e7e7e8] rounded-full flex items-center justify-center text-[13px] tracking-[1px] text-[#555] hover:bg-[#f7f7f7]"
                title="更多"
              >
                ···
              </button>
              <button
                type="button"
                onClick={() => setShowPostModal(true)}
                className="w-[35px] h-[35px] rounded-full flex items-center justify-center text-lg text-white bg-[#202124] hover:bg-[#333] border border-[#202124]"
                title="发表动态"
              >
                ＋
              </button>
            </div>
          </div>

          {/* Moments Banner — 外层不裁剪，头像才能完整露出来 */}
          <div className="h-[185px] mb-11 relative" style={{ background: momentsStyle.banner ? undefined : (momentsStyle.colorScope !== 'bottom' && momentsStyle.pageColor ? momentsStyle.pageColor : (momentsStyle.bannerColor || '#eeeeed')) }}>
            <div className="absolute inset-0 overflow-hidden" style={{
              backgroundImage: momentsStyle.banner
                ? `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.2)), url(${momentsStyle.banner})`
                : undefined,
              backgroundColor: momentsStyle.banner ? undefined : (momentsStyle.bannerColor || undefined),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              ...(!momentsStyle.banner && !momentsStyle.bannerColor ? { backgroundImage: 'radial-gradient(circle at 78% 22%, rgba(255,255,255,.75), transparent 28%), radial-gradient(circle at 22% 80%, rgba(255,255,255,.48), transparent 30%), linear-gradient(135deg, #e8e8e6 0%, #f4f4f2 52%, #dededc 100%)' } : {}),
            }} />

            {/* Profile overlapping banner — 头像完整露出来，不被压住 */}
            <div className="absolute right-[18px] -bottom-[30px] z-10 flex items-end gap-[9px]">
              <span className="mb-3 text-[14px] font-semibold text-[#303134] drop-shadow-sm">
                {activePersona?.name || currentUser.name}
              </span>
              <div className="w-[64px] h-[64px] rounded-full bg-[#f1f1f2] border-[3px] border-white shadow-md flex items-center justify-center overflow-hidden shrink-0">
                {(activePersona?.avatar || currentUser.avatar) ? (
                  <img src={activePersona?.avatar || currentUser.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                <svg className="w-[39px] h-[39px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                  <circle cx="24" cy="17" r="8" />
                  <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                </svg>
                )}
              </div>
            </div>
          </div>

          {/* Posts List */}
          <div
            className={`pt-2 transition-opacity duration-300 ${
              isRefreshingMoments ? 'opacity-35' : 'opacity-100'
            }`}
          >
            {visibleMoments.map((post) => {
              const caption = getPostCaption(post);
              const textCards = getPostTextCards(post);
              const videoCard = getPostVideoCard(post);
              const mentionLabels = Array.isArray((post as any).mentionIds)
                ? (post as any).mentionIds
                    .map((id: string) => resolveAudienceLabel(id, vroomAudienceFriends, allLineNpcs))
                    .filter(Boolean)
                : [];
              const avatarSrc = resolveMomentAvatar(post);
              return (
              <div
                key={post.id}
                onClick={() => {
                  if (momentsLongPressFired.current) {
                    momentsLongPressFired.current = false;
                    return;
                  }
                  setPostDetail(post);
                }}
                onPointerDown={() => {
                  momentsLongPressFired.current = false;
                  clearMomentsLongPress();
                  momentsLongPressTimer.current = window.setTimeout(() => {
                    momentsLongPressFired.current = true;
                    momentsLongPressTimer.current = null;
                    setMomentsPostMenu(post);
                  }, 480);
                }}
                onPointerUp={clearMomentsLongPress}
                onPointerLeave={clearMomentsLongPress}
                onPointerCancel={clearMomentsLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  clearMomentsLongPress();
                  setMomentsPostMenu(post);
                }}
                className={`px-[18px] pb-5 mb-[18px] cursor-pointer rounded-[18px] transition-all select-none ${momentsStyle.cardStyle === 'paper' ? 'bg-[#fbfaf7] border border-[#eee9df]' : momentsStyle.cardStyle === 'soft' ? 'bg-[#faf7f8] border border-[#f0e5e8]' : 'border-b border-[#f0f0f0]'}`}
                style={{ fontSize: `${momentsStyle.fontScale}em` }}
              >
                <div className="flex items-center">
                  <div className="w-[49px] h-[49px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    {avatarSrc ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" /> : <span className="text-sm text-[#aaa]">{post.name?.[0] || '·'}</span>}
                  </div>
                  <span className="ml-2.5 text-[13px] font-semibold">
                    {post.name}
                    {post.npcId ? <span className="ml-1 text-[9px] font-normal text-[#ae7e89]">NPC</span> : null}
                  </span>
                  <span className="ml-auto text-[9px] text-[#aaa]">{post.time}</span>
                </div>

                {mentionLabels.length > 0 && (
                  <div className="ml-[59px] mt-2 text-[11px] leading-relaxed text-[#8c5f6b]">
                    {mentionLabels.map((n: string) => `@${n}`).join(' ')}
                  </div>
                )}
                {!!caption && (
                  <div className="ml-[59px] mt-2.5 text-[12px] leading-[1.8] text-[#555] whitespace-pre-wrap">
                    {caption}
                  </div>
                )}
                {textCards.map((card, idx) => (
                  <TextCardView key={`${post.id}-tc-${idx}`} text={card.text} cardStyle={card.style || textCardStyleId} />
                ))}
                {videoCard && (
                  <VideoCardView text={videoCard.text} cardStyle={videoCard.style || videoCardStyleId} duration={videoCard.duration} />
                )}
                {((post as any).images?.length ? (post as any).images : (post.image ? [post.image] : [])).length > 0 && (
                  <div className="ml-[59px] mt-3 max-w-[68%]">
                    <VroomImage
                      src={((post as any).images?.length ? (post as any).images : [post.image])[0]}
                      alt=""
                      className="w-full aspect-square rounded-[12px] object-cover border border-[#eeeeef]"
                    />
                  </div>
                )}
                {(post as any).visibilityLabel && (
                  <div className="ml-[59px] mt-2 text-[9px] text-[#aaa]">◌ {(post as any).visibilityLabel}</div>
                )}

                {momentsStyle.showTags && !!post.tag && <div className="ml-[59px] mt-2 inline-block text-[9px] px-2 py-0.5 rounded-[4px]" style={{ color: momentsStyle.accent, background: `${momentsStyle.accent}14` }}>
                  {post.tag}
                </div>}

                {/* L2 点赞名单 + C1 灰底评论 */}
                {(() => {
                  const meName = (activePersona?.name || currentUser.name || '').trim() || '我';
                  const { list, count } = momentLikerNames(post, meName);
                  const likerLine = formatMomentLikers(list, count);
                  const comments = flattenMomentComments(normalizeMomentComments(post.commentsList));
                  return (
                    <>
                      <div className="ml-[59px] mt-3 flex items-center gap-[18px] text-[#999] text-[11px]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const isLiking = !post.liked;
                            setMomentsPosts((prev) => prev.map((p) => (p.id === post.id ? toggleMomentLike(p, meName) : p)));
                            if (isLiking) void tryAutonomousMomentComment(String(post.id));
                          }}
                          className={`cursor-pointer flex items-center gap-1 hover:text-[#ae7e89] transition-colors ${
                            post.liked ? 'text-[#ae7e89]' : ''
                          }`}
                        >
                          <span>{post.liked ? '♥' : '♡'}</span>
                          <span>赞</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCommentReplyTo(null);
                            setCommentingPostId(post.id);
                            setCommentInputText('');
                          }}
                          className="hover:text-[#555] cursor-pointer"
                        >
                          评论
                        </button>
                        <button
                          type="button"
                          disabled={generatingCommentsPostId === post.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onGenerateCommentsForPost(post);
                          }}
                          className="hover:text-[#ae7e89] cursor-pointer disabled:opacity-50"
                        >
                          {generatingCommentsPostId === post.id ? '生成中…' : '生成评论'}
                        </button>
                      </div>
                      {count > 0 && likerLine && (
                        <div className="ml-[59px] mt-2 px-2.5 py-2 rounded-[8px] bg-[#f7f5f4] text-[11px] leading-[1.55] text-[#6a5e58]">
                          <span className="text-[#ae7e89] mr-1">♥</span>
                          {likerLine}
                        </div>
                      )}
                      {comments.length > 0 && (
                        <div className="ml-[59px] mt-2.5 bg-[#f8f8f9] rounded-[9px] p-2.5 space-y-1.5 text-[11px]">
                          {comments.map((c, idx) => (
                            <div key={c.id || idx} className="leading-snug">
                              <span className="font-semibold text-[#555]">{c.user}</span>
                              {c.replyTo ? <span className="font-semibold text-[#ae7e89]"> 回复 @{c.replyTo}</span> : null}
                              <span className="font-semibold text-[#555]">: </span>
                              <span className="text-[#444]">{c.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================
           PAGE 4: ME (个人中心)
      ===================================================== */}
      {activeTab === 'me' && (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-20 bg-white">
          {/* Header */}
          <div className="h-[78px] px-5 pt-4 pb-2.5 bg-white">
            <div
              className="text-[32px] leading-none text-[#202124] italic tracking-[-0.5px]"
              style={{ fontFamily: '"Cormorant Garamond", Georgia, "Noto Serif SC", serif', fontWeight: 600 }}
            >
              Me
            </div>
            <div
              className="mt-1.5 text-[10px] text-[#b2b2b4] tracking-[0.7px]"
              style={{ fontFamily: '"Plus Jakarta Sans", "SF Pro Text", sans-serif', fontWeight: 500 }}
            >
              {tx('个人主页 · 当前身份', 'プロフィール · いまの私')}
            </div>
          </div>

          {/* Profile Card — 随当前人设切换头像/名字；点进去是资料卡 */}
          <div onClick={() => setShowMyProfilePage(true)} className="p-5 border-b-[7px] border-[#fafafa] cursor-pointer hover:bg-[#fcfcfc]">
            <div className="flex items-center">
              <div className="w-[64px] h-[64px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                {(activePersona?.avatar || currentUser.avatar) ? (
                  <img src={activePersona?.avatar || currentUser.avatar} alt={(activePersona?.name || currentUser.name) || '我的头像'} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[20px] text-[#aaa]" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{(activePersona?.name || currentUser.name || '').trim() ? (activePersona?.name || currentUser.name).trim()[0] : '·'}</span>
                )}
              </div>

              <div className="ml-4 min-w-0 flex-1">
                <div
                  className="text-[19px] text-[#202124] truncate"
                  style={{ fontFamily: '"Plus Jakarta Sans", "SF Pro Text", sans-serif', fontWeight: 600 }}
                >
                  {(activePersona?.name || currentUser.name || '').trim() || '未设置昵称'}
                </div>
                <div
                  className="text-[10px] text-[#aaa] mt-1 truncate tracking-[0.3px]"
                  style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  {currentUser.id.trim() ? '@' + currentUser.id.replace(/^@/, '') : '尚未设置账号 ID'}
                </div>
                <div className="text-[10px] text-[#888] mt-1.5 line-clamp-2">
                  {currentUser.desc.trim() || '还没有个人简介'}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileDraft(currentUser);
                  setShowProfileEditor(true);
                }}
                className="ml-2 shrink-0 px-3 py-1.5 border border-[#dedcdf] rounded-full text-[10px] text-[#444] hover:bg-[#f7f7f8]"
                style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 500 }}
              >
                {tx('编辑主页', 'ホーム編集')}
              </button>
            </div>
          </div>

          {/* User Personas — 名字胶囊切换；旁边两个空圈进编辑；上方资料跟随当前人设 */}
          <div className="mx-4 my-3 w-[calc(100%-2rem)] p-4 rounded-[22px] border border-[#eeeeef] bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-left min-w-0 flex-1">
                <div className="text-[8px] font-mono tracking-[2px] text-[#bbb]">MY PERSONA プロフィール</div>
                <div
                  className="text-[15px] text-[#202124] mt-1"
                  style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700 }}
                >
                  {tx('我的人设卡', 'わたしの人設カード')}
                </div>
                <div className="text-[9px] text-[#999] mt-0.5">点名字切换 · 点圈圈编辑 · 当前：{activePersona?.name || '还没有人设'}</div>
              </div>
              <div className="relative shrink-0 h-9 w-[52px] mr-0.5">
                {[0, 1].map((slot) => {
                  const p = userPersonas[slot];
                  const isActive = p?.id === effectivePersonaId;
                  const openEdit = () => {
                    if (p) {
                      setPersonaHomeIndex(slot);
                      setPersonaHomeOpen(true);
                    } else {
                      setPersonaHomeIndex(Math.max(0, userPersonas.length - 1));
                      setPersonaHomeOpen(true);
                    }
                  };
                  return (
                    <button
                      key={slot}
                      type="button"
                      title={p ? tx(`编辑「${p.name || '未命名'}」`, `「${p.name || '未設定'}」を編集`) : tx('新建 / 编辑人设', '人設を作成・編集')}
                      onClick={openEdit}
                      className={`absolute top-0 w-9 h-9 rounded-full grid place-items-center active:scale-95 bg-white transition-all ${
                        slot === 0 ? 'left-0 z-10' : 'left-[18px] z-20 ring-2 ring-white'
                      } ${
                        p
                          ? isActive
                            ? 'border-2 border-[#202124] shadow-[0_1px_4px_rgba(0,0,0,0.06)]'
                            : 'border border-[#202124]/35'
                          : 'border border-dashed border-[#d8d8da]'
                      }`}
                    >
                      {p ? (
                        <span className={`rounded-full ${isActive ? 'w-1.5 h-1.5 bg-[#202124]' : 'w-1 h-1 bg-[#202124]/30'}`} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {userPersonas.map(p => (
                <button
                  key={p.id}
                  title={`切换成 ${p.name || '未命名'}`}
                  onClick={() => {
                    setActivePersonaId(p.id);
                    setActiveChatId(null);
                    const i = userPersonas.findIndex(x => x.id === p.id);
                    if (i >= 0) setPersonaHomeIndex(i);
                    showToast(`已切换为 ${p.name || '未命名'}`);
                  }}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] border active:scale-95 ${p.id === effectivePersonaId ? 'bg-[#202124] text-white border-[#202124]' : 'bg-white text-[#666] border-[#e3e3e5]'}`}
                >○ {p.name || '未命名'}</button>
              ))}
            </div>
          </div>
          <div className="mx-4 my-3 p-4 bg-[#fafafa] rounded-[16px] border border-[#eeeeef] hidden">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-[#333]">我的人设</div>
                <div className="text-[9px] text-[#aaa] mt-1">和不同角色聊天时，可以切换不同的“我”</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPersonaSwitchOpen(true)}
                  className="px-3 py-1.5 rounded-full border border-[#e7e1e3] bg-white text-[#8d6872] text-[10px] font-medium"
                >切换</button>
                <button
                onClick={() => {
                  setPersonaEditorIndex(userPersonas.length);
                  setPersonaDraft({ name: '', age: '', ageMode: 'manual', ageReferenceCharacterId: '', profession: '', region: '', timezone: '', birthday: '', setting: '', avatar: '', boundCharacterIds: [] });
                  setPersonaWeather(null);
                  setPersonaEditorOpen(true);
                }}
                className="px-3 py-1.5 rounded-full bg-[#292724] text-white text-[10px]"
              >＋ 新建</button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {userPersonas.length === 0 ? (
                <div className="text-[10px] text-[#aaa] py-3 text-center">还没有人设。先创建一个你的聊天身份。</div>
              ) : userPersonas.map((persona, index) => (
                <button
                  key={persona.id}
                  onClick={() => {
                    setPersonaEditorIndex(index);
                    setPersonaDraft({ ...persona, ageMode: persona.ageMode || 'manual', ageReferenceCharacterId: persona.ageReferenceCharacterId || persona.boundCharacterIds?.[0] || persona.boundCharacterId || '', ageOffset: Number(persona.ageOffset || 0), boundCharacterIds: Array.isArray(persona.boundCharacterIds) ? persona.boundCharacterIds : (persona.boundCharacterId ? [persona.boundCharacterId] : []) });
                    setPersonaWeather(null);
                    setPersonaEditorOpen(true);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 bg-white rounded-[12px] border border-[#eeeeef] text-left"
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[#f1f1f2] flex items-center justify-center shrink-0">
                    {persona.avatar ? <img src={persona.avatar} className="w-full h-full object-cover" /> : <span className="text-xs">{persona.name?.[0] || '◎'}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[#333] truncate">{persona.name || '未命名人设'} {persona.id === activePersonaId && <span className="text-[#ae7e89]">· 当前</span>}</div>
                    <div className="text-[9px] text-[#aaa] truncate">{[persona.age, persona.profession].filter(Boolean).join(' · ') || '未填写基本信息'} · {(Array.isArray(persona.boundCharacterIds) ? persona.boundCharacterIds.length : 0)} 个绑定角色</div>
                  </div>
                  <span className="text-[#ccc] text-lg">›</span>
                </button>
              ))}
            </div>
          </div>

          {/* Settings Rows — lucide icons, same stroke language as chat/moments UI */}
          <div className="divide-y divide-[#f1f1f1]">
            {([
              { key: 'moments', label: tx('我的朋友圈', 'マイモーメンツ'), Icon: Heart, onClick: () => setShowMyMomentsModal(true) },
              { key: 'fav', label: '收藏', Icon: Bookmark, onClick: () => setShowFavoritesModal(true) },
              { key: 'notif', label: '新消息通知', Icon: Bell, onClick: () => setShowNotificationModal(true) },
              { key: 'chat', label: '聊天设置', Icon: SlidersHorizontal, onClick: () => setShowGlobalChatSettingsModal(true) },
              { key: 'privacy', label: '隐私权限', Icon: Shield, onClick: () => setShowPrivacyModal(true) },
              { key: 'general', label: tx('系统通用设置', 'システム設定'), Icon: Settings, onClick: () => setShowGeneralSettingsModal(true) },
            ] as const).map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={row.onClick}
                className="w-full h-[57px] px-5 flex items-center cursor-pointer hover:bg-[#fafafa] text-left"
              >
                <span className="w-[31px] flex items-center justify-start text-[#ad7d88]">
                  <row.Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </span>
                <span
                  className="text-[13px] text-[#444]"
                  style={{ fontFamily: '"Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", sans-serif', fontWeight: 500 }}
                >
                  {row.label}
                </span>
                <ChevronRight className="ml-auto w-4 h-4 text-[#ccc]" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
      )}

      {personaEditorOpen && (
        <div className="absolute inset-0 z-[100] bg-[#f8f8f8] flex flex-col">
          <div className="h-[60px] bg-white border-b border-[#ededee] flex items-center justify-between px-4 shrink-0">
            <button onClick={() => setPersonaEditorOpen(false)} className="text-2xl text-[#555] px-2">‹</button>
            <div className="text-center">
              <div className="font-semibold text-sm text-[#333]">我的人设</div>
              <div className="text-[9px] text-[#aaa]">PERSONA · 你的聊天身份</div>
            </div>
            <button onClick={() => {
              const referenceId = personaDraft.ageReferenceCharacterId || (personaDraft.boundCharacterIds || [])[0] || '';
              const referenceCharacter = importedCharacters.find(character => character.id === referenceId);
              const characterAge = Number(getCharacterStoryAge(referenceCharacter));
              const offset = Number(personaDraft.ageOffset || 0);
              const resolvedAge = personaDraft.ageMode === 'relative-character' && Number.isFinite(characterAge)
                ? String(characterAge + offset)
                : personaDraft.ageMode === 'follow-character' && Number.isFinite(characterAge)
                  ? String(characterAge)
                  : String(personaDraft.age || '');
              const persona = {
                ...personaDraft,
                id: personaDraft.id || crypto.randomUUID(),
                age: resolvedAge,
                ageMode: personaDraft.ageMode || 'manual',
                ageOffset: Number(personaDraft.ageOffset || 0),
                ageReferenceCharacterId: referenceId,
                weather: personaWeather ? formatLineWeather(personaWeather) : (personaDraft.weather || ''),
                realRegion: personaDraft.realRegion || '', regionResolved: personaWeather?.location || personaDraft.regionResolved || '',
                boundCharacterIds: Array.isArray(personaDraft.boundCharacterIds) ? personaDraft.boundCharacterIds : [],
              };
              setUserPersonas(prev => prev.some(p => p.id === persona.id) ? prev.map(p => p.id === persona.id ? persona : p) : [persona, ...prev]);
              setActivePersonaId(persona.id);
              setPersonaEditorOpen(false);
            }} className="text-[10px] font-semibold text-[#ae7e89] px-2">保存</button>
          </div>

          <div className="flex-1 overflow-y-auto pb-8">
            <div className="px-4 pt-4">
              <div className="flex items-end justify-between mb-2">
                <div>
                  <div className="text-[12px] font-semibold text-[#333]">我的人设卡</div>
                  <div className="text-[9px] text-[#aaa] mt-0.5">左右滑动切换不同的“我”</div>
                </div>
                <div className="text-[9px] text-[#aaa]">{userPersonas.length ? Math.min(personaEditorIndex + 1, userPersonas.length) : 1} / {Math.max(userPersonas.length, 1)}</div>
              </div>
              <div
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2"
                style={{ touchAction: 'pan-x' }}
                onScroll={(event) => {
                  const target = event.currentTarget;
                  const first = target.firstElementChild as HTMLElement | null;
                  if (!first || !userPersonas.length) return;
                  const step = first.offsetWidth + 12;
                  const nextIndex = Math.max(0, Math.min(userPersonas.length - 1, Math.round(target.scrollLeft / step)));
                  if (nextIndex !== personaEditorIndex) {
                    setPersonaEditorIndex(nextIndex);
                    const nextPersona = userPersonas[nextIndex];
                    if (nextPersona) {
                      setPersonaDraft({
                        ...nextPersona,
                        boundCharacterIds: Array.isArray(nextPersona.boundCharacterIds)
                          ? nextPersona.boundCharacterIds
                          : (nextPersona.boundCharacterId ? [nextPersona.boundCharacterId] : []),
                      });
                    }
                  }
                }}
              >
                {userPersonas.map((persona, index) => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => {
                      setPersonaEditorIndex(index);
                      setPersonaDraft({ ...persona, boundCharacterIds: Array.isArray(persona.boundCharacterIds) ? persona.boundCharacterIds : (persona.boundCharacterId ? [persona.boundCharacterId] : []) });
                    }}
                    className={`snap-center shrink-0 w-[82%] min-h-[150px] rounded-[24px] p-5 text-left border transition-all ${index === personaEditorIndex ? 'bg-[#292724] text-white border-[#292724] shadow-lg' : 'bg-white text-[#333] border-[#e8e8e9]'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`w-14 h-14 rounded-full overflow-hidden flex items-center justify-center ${index === personaEditorIndex ? 'bg-white/10' : 'bg-[#f1f1f2]'}`}>
                        {persona.avatar ? <img src={persona.avatar} className="w-full h-full object-cover" /> : <span className="text-lg">{persona.name?.[0] || '◎'}</span>}
                      </div>
                      {index === personaEditorIndex && <span className="text-[8px] tracking-[1.5px] opacity-60">CURRENT</span>}
                    </div>
                    <div className="mt-5 text-[17px] font-semibold truncate">{persona.name || '未命名人设'}</div>
                    <div className={`mt-1 text-[9px] truncate ${index === personaEditorIndex ? 'text-white/55' : 'text-[#aaa]'}`}>
                      {[persona.age, persona.profession].filter(Boolean).join(' · ') || '还没有基本资料'} · {(Array.isArray(persona.boundCharacterIds) ? persona.boundCharacterIds.length : 0)} 个角色
                    </div>
                  </button>
                ))}
                {userPersonas.length === 0 && (
                  <div className="w-full min-h-[150px] rounded-[24px] bg-white border border-dashed border-[#ddd] grid place-items-center text-[10px] text-[#aaa]">这是你的第一张人设卡</div>
                )}
              </div>
            </div>

            <div className="mx-4 mt-4 bg-white rounded-[20px] border border-[#eeeeef] p-4">
              <div className="text-[12px] font-semibold text-[#333]">人设资料</div>
              <div className="text-[9px] text-[#aaa] mt-1 mb-4">这部分只描述“你是谁”，不会改变角色本身。</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['name','名字'], ['profession','职业'], ['birthday','生日']
                ].map(([key,label]) => (
                  <label key={key} className="text-[9px] text-[#999]">
                    {label}
                    <input
                      value={personaDraft[key] || ''}
                      onChange={e => setPersonaDraft((p:any) => ({ ...p, [key]: e.target.value }))}
                      className="mt-1 w-full h-9 px-3 bg-[#fafafa] border border-[#e7e7e8] rounded-[10px] text-xs text-[#333] outline-none"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 p-3 rounded-[14px] bg-[#fafafa] border border-[#eeeeef]">
                <div className="text-[10px] font-semibold text-[#555]">年龄</div>
                <div className="text-[8.5px] text-[#aaa] mt-1">年龄可以独立填写，也可以相对于绑定角色设定。比如角色 28 岁，你设定“小 5 岁”，就是 23 岁。</div>
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {[
                    ['manual','自己填写'],
                    ['follow-character','与角色同龄'],
                    ['relative-character','比角色大 / 小'],
                  ].map(([id,label]) => (
                    <button type="button" key={id} onClick={() => setPersonaDraft((p:any)=>({...p, ageMode:id}))} className={`py-2 rounded-[10px] border text-[8.5px] ${personaDraft.ageMode === id ? 'bg-white border-[#d4aab5] text-[#8c5f6b]' : 'bg-[#f5f5f5] border-[#eee] text-[#888]'}`}>{label}</button>
                  ))}
                </div>
                {personaDraft.ageMode === 'follow-character' ? (
                  <div className="mt-2 space-y-2">
                    <select
                      value={personaDraft.ageReferenceCharacterId || ''}
                      onChange={e => setPersonaDraft((p:any)=>({...p, ageReferenceCharacterId:e.target.value}))}
                      className="w-full h-9 px-3 bg-white border border-[#e7e7e8] rounded-[10px] text-[10px] text-[#555] outline-none"
                    >
                      <option value="">选择参考角色</option>
                      {importedCharacters.filter(c => (personaDraft.boundCharacterIds || []).includes(c.id)).map(character => (
                        <option key={character.id} value={character.id}>{character.name} · {getCharacterStoryAge(character) || '未设置故事年龄'}</option>
                      ))}
                    </select>
                    <div className="text-[8px] text-[#aaa]">
                      当前故事年龄：{getCharacterStoryAge(importedCharacters.find(c => c.id === personaDraft.ageReferenceCharacterId)) || '还无法从角色资料识别年龄'}
                    </div>
                  </div>
                ) : personaDraft.ageMode === 'relative-character' ? (
                  <div className="mt-2 space-y-2">
                    <select value={personaDraft.ageReferenceCharacterId || ''} onChange={e => setPersonaDraft((p:any)=>({...p, ageReferenceCharacterId:e.target.value}))} className="w-full h-9 px-3 bg-white border border-[#e7e7e8] rounded-[10px] text-[10px] text-[#555] outline-none">
                      <option value="">选择参考角色</option>
                      {importedCharacters.filter(c => (personaDraft.boundCharacterIds || []).includes(c.id)).map(character => (
                        <option key={character.id} value={character.id}>{character.name} · {getCharacterStoryAge(character) || '未设置故事年龄'}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <select value={Number(personaDraft.ageOffset || 0) < 0 ? 'younger' : Number(personaDraft.ageOffset || 0) > 0 ? 'older' : 'same'} onChange={e => setPersonaDraft((p:any)=>({...p, ageOffset: e.target.value === 'younger' ? -Math.abs(Number(p.ageOffset || 1)) : e.target.value === 'older' ? Math.abs(Number(p.ageOffset || 1)) : 0}))} className="h-9 px-2 bg-white border border-[#e7e7e8] rounded-[10px] text-[9px] text-[#555] outline-none">
                        <option value="younger">比角色小</option>
                        <option value="older">比角色大</option>
                        <option value="same">同龄</option>
                      </select>
                      <input type="number" min="0" max="100" value={Math.abs(Number(personaDraft.ageOffset || 0))} disabled={Number(personaDraft.ageOffset || 0) === 0} onChange={e => setPersonaDraft((p:any)=>({...p, ageOffset: Number(e.target.value || 0) * (Number(p.ageOffset || 0) < 0 ? -1 : 1)}))} placeholder="5" className="w-20 h-9 px-3 bg-white border border-[#e7e7e8] rounded-[10px] text-xs text-[#333] outline-none" />
                      <span className="text-[9px] text-[#999]">岁</span>
                    </div>
                  </div>
                ) : (
                  <input
                    value={personaDraft.age || ''}
                    onChange={e => setPersonaDraft((p:any) => ({ ...p, age: e.target.value }))}
                    placeholder="例如 28"
                    className="mt-2 w-full h-9 px-3 bg-white border border-[#e7e7e8] rounded-[10px] text-xs text-[#333] outline-none"
                  />
                )}
              </div>

              <label className="block mt-3 text-[9px] text-[#999]">
                虚拟地区
                <div className="text-[8px] text-[#aaa] mt-1">故事里显示虚拟地区；下面选择它对应的现实地区，天气会根据现实地区查询。</div>
                <input
                  value={personaDraft.region || ''}
                  onChange={e => setPersonaDraft((p:any) => ({ ...p, region: e.target.value }))}
                  placeholder="例如：维尔港 / 北境城 / 月湾"
                  className="mt-1 w-full h-9 px-3 bg-[#fafafa] border border-[#e7e7e8] rounded-[10px] text-xs text-[#333] outline-none"
                />
                <div className="text-[9px] text-[#999] mt-2">对应现实地区</div>
                <div className="flex gap-2 mt-1">
                  <input
                    value={personaDraft.realRegion || ''}
                    onChange={e => setPersonaDraft((p:any) => ({ ...p, realRegion: e.target.value }))}
                    placeholder="例如 London / Tokyo / 上海"
                    className="min-w-0 flex-1 h-9 px-3 bg-[#fafafa] border border-[#e7e7e8] rounded-[10px] text-xs text-[#333] outline-none"
                  />
                  <button
                    type="button"
                    disabled={personaWeatherBusy || !String(personaDraft.realRegion || '').trim()}
                    onClick={async () => {
                      setPersonaWeatherBusy(true);
                      const weather = await fetchLineWeather(String(personaDraft.realRegion || ''));
                      setPersonaWeather(weather);
                      if (weather) setPersonaDraft((p:any)=>({...p, regionResolved: weather.location, weather: formatLineWeather(weather)}));
                      setPersonaWeatherBusy(false);
                    }}
                    className="px-3 h-9 rounded-[10px] bg-[#292724] text-white text-[9px] disabled:opacity-40"
                  >{personaWeatherBusy ? '查询中…' : '查天气'}</button>
                </div>
                {personaWeather && <div className="mt-2 p-2.5 rounded-[10px] bg-[#f7eef0] text-[9px] text-[#8c5f6b]">📍 {formatLineWeather(personaWeather)}</div>}
                {personaDraft.regionResolved && !personaWeather && <div className="mt-1 text-[8px] text-[#aaa]">已解析地区：{personaDraft.regionResolved}</div>}
              </label>

              <label className="block mt-3 text-[9px] text-[#999]">
                时区
                <select value={personaDraft.timezone || ''} onChange={e => setPersonaDraft((p:any)=>({...p, timezone:e.target.value}))} className="mt-1 w-full h-9 px-3 bg-[#fafafa] border border-[#e7e7e8] rounded-[10px] text-[10px] text-[#555] outline-none">
                  <option value="">自动 / 跟随地区</option>
                  {[
                    ['Asia/Shanghai','中国 / 上海（UTC+8）'],['Asia/Tokyo','日本 / 东京（UTC+9）'],['Asia/Seoul','韩国 / 首尔（UTC+9）'],
                    ['Europe/London','英国 / 伦敦'],['Europe/Paris','欧洲中部 / 巴黎'],['America/Los_Angeles','美国 / 洛杉矶'],
                    ['America/New_York','美国 / 纽约'],['America/Toronto','加拿大 / 多伦多'],['Australia/Sydney','澳大利亚 / 悉尼'],
                    ['Pacific/Auckland','新西兰 / 奥克兰'],['Asia/Singapore','新加坡'],['Asia/Hong_Kong','中国香港'],['UTC','UTC']
                  ].map(([id,title])=><option key={id} value={id}>{title}</option>)}
                </select>
              </label>
              <label className="block mt-3 text-[9px] text-[#999]">
                设定
                <textarea
                  value={personaDraft.setting || ''}
                  onChange={e => setPersonaDraft((p:any) => ({ ...p, setting: e.target.value }))}
                  placeholder="你的性格、背景、职业、生活状态、与你聊天时的身份……"
                  className="mt-1 w-full min-h-[92px] p-3 bg-[#fafafa] border border-[#e7e7e8] rounded-[12px] text-xs text-[#333] outline-none resize-none"
                />
              </label>
              <div className="mt-3 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full overflow-hidden bg-[#f1f1f2] flex items-center justify-center shrink-0">
                  {personaDraft.avatar ? <img src={personaDraft.avatar} className="w-full h-full object-cover" /> : <span className="text-xs">{personaDraft.name?.[0] || '◎'}</span>}
                </div>
                <label className="text-[10px] text-[#777] cursor-pointer">
                  {personaDraft.avatar ? '更换头像' : '上传头像'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const file=e.target.files?.[0]; if(file) readImageFile(file, data => setPersonaDraft((p:any)=>({...p,avatar:data}))); }} />
                </label>
              </div>
            </div>

            <div className="mx-4 mt-4 bg-white rounded-[20px] border border-[#eeeeef] p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-[#333]">绑定角色</div>
                  <div className="text-[9px] text-[#aaa] mt-1">一个人设可以绑定多个角色。这里显示的是角色自己的备注名。</div>
                </div>
                <div className="text-[9px] text-[#aaa]">{(personaDraft.boundCharacterIds || []).length} 个</div>
              </div>

              <div className="mt-3 space-y-2">
                {importedCharacters.length === 0 ? (
                  <div className="py-6 text-center text-[10px] text-[#aaa]">还没有导入角色。</div>
                ) : importedCharacters.map(character => {
                  const ids = Array.isArray(personaDraft.boundCharacterIds) ? personaDraft.boundCharacterIds : [];
                  const checked = ids.includes(character.id);
                  const friend = friendsList.find(f => f.characterId === character.id);
                  const chat = chatItems.find(item => item.characterId === character.id);
                  const remarkName = friend?.note?.trim() || chat?.name?.trim() || character.name;
                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => setPersonaDraft((p:any) => {
                        const current = Array.isArray(p.boundCharacterIds) ? p.boundCharacterIds : [];
                        return { ...p, boundCharacterIds: current.includes(character.id) ? current.filter((id:string) => id !== character.id) : [...current, character.id] };
                      })}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-[14px] border text-left ${checked ? 'border-[#b28a93] bg-[#fbf7f8]' : 'border-[#eeeeef] bg-white'}`}
                    >
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-[#f1f1f2] flex items-center justify-center shrink-0">
                        {character.avatar ? <img src={character.avatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" /> : <span className="text-xs text-[#aaa]">{character.name?.[0] || '◎'}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-[#333] truncate">{remarkName}</div>
                        <div className="text-[9px] text-[#aaa] truncate">{remarkName !== character.name ? '角色名：' + character.name : '未设置备注名，使用角色名'}</div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border grid place-items-center ${checked ? 'bg-[#ae7e89] border-[#ae7e89] text-white' : 'border-[#d9d9da] text-transparent'}`}>✓</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {personaDraft.id && (
              <div className="mx-4 mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const id = personaDraft.id;
                    setUserPersonas(prev => prev.filter(p => p.id !== id));
                    if (activePersonaId === id) setActivePersonaId(null);
                    setPersonaEditorOpen(false);
                  }}
                  className="flex-1 py-2.5 rounded-[12px] bg-white border border-[#eeeeef] text-[10px] text-[#999]"
                >删除这个人设</button>
              </div>
            )}

            <button
              onClick={() => {
                const referenceCharacter = importedCharacters.find(character => character.id === personaDraft.ageReferenceCharacterId);
              const resolvedAge = personaDraft.ageMode === 'follow-character' ? getCharacterStoryAge(referenceCharacter) : String(personaDraft.age || '');
              const persona = {
                ...personaDraft,
                id: personaDraft.id || crypto.randomUUID(),
                age: resolvedAge,
                ageMode: personaDraft.ageMode || 'manual',
                ageReferenceCharacterId: personaDraft.ageReferenceCharacterId || '',
                weather: personaWeather ? formatLineWeather(personaWeather) : (personaDraft.weather || ''),
                regionResolved: personaWeather?.location || personaDraft.regionResolved || '',
                boundCharacterIds: Array.isArray(personaDraft.boundCharacterIds) ? personaDraft.boundCharacterIds : [],
              };
                setUserPersonas(prev => prev.some(p => p.id === persona.id) ? prev.map(p => p.id === persona.id ? persona : p) : [persona, ...prev]);
                setActivePersonaId(persona.id);
                setPersonaEditorOpen(false);
              }}
              className="mx-4 mt-4 w-[calc(100%-2rem)] py-3 rounded-[14px] bg-[#292724] text-white text-xs font-semibold"
            >保存并使用这个人设</button>
          </div>
        </div>
      )}

      {personaSwitchOpen && (
        <div className="absolute inset-0 z-[75] bg-black/20 flex items-end" onClick={() => setPersonaSwitchOpen(false)}>
          <div className="w-full bg-white rounded-t-[22px] p-5 pb-7 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div className="font-semibold text-sm">选择聊天人设</div><button onClick={() => setPersonaSwitchOpen(false)} className="text-[#aaa]">×</button></div>
            {userPersonas.map(persona => (
              <button key={persona.id} onClick={() => {
  if (persona.id === effectivePersonaId) {
    setPersonaSwitchOpen(false);
    return;
  }
  setActivePersonaId(persona.id);
  setActiveChatId(null);
  setPersonaSwitchOpen(false);
}} className="w-full flex items-center gap-3 p-3 rounded-[14px] border border-[#eeeeef] text-left">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#f1f1f2] flex items-center justify-center">{persona.avatar ? <img src={persona.avatar} className="w-full h-full object-cover" /> : <span>{persona.name?.[0] || '◎'}</span>}</div>
                <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{persona.name || '未命名人设'}</div><div className="text-[9px] text-[#aaa] truncate">{persona.setting || '暂无设定'}</div></div>
                {persona.id === activePersonaId && <span className="text-[#ae7e89] text-xs">✓</span>}
              </button>
            ))}
            {userPersonas.length === 0 && <div className="text-[10px] text-[#aaa] text-center py-5">请先在 ME 创建人设。</div>}
          </div>
        </div>
      )}

      {personaHomeOpen && (
        <PersonaHomeSheet
          userPersonas={userPersonas}
          effectivePersonaId={effectivePersonaId}
          initialIndex={personaHomeIndex}
          importedCharacters={importedCharacters}
          onClose={() => setPersonaHomeOpen(false)}
          onSelect={(p: any, i: number) => { setActivePersonaId(p.id); setActiveChatId(null); setPersonaHomeIndex(i); showToast(`已切换为 ${p.name || '未命名'}`); }}
          onSave={(persona: any) => { setUserPersonas((prev: any[]) => prev.some(x => x.id === persona.id) ? prev.map(x => x.id === persona.id ? persona : x) : [persona, ...prev]); setActivePersonaId(persona.id); showToast('已保存人设卡'); }}
          onDelete={(id: string) => { setUserPersonas((prev: any[]) => prev.filter(x => x.id !== id)); if (activePersonaId === id) setActivePersonaId(null); showToast('已删除人设卡'); }}
          onCreate={() => { setPersonaHomeOpen(false); setPersonaEditorIndex(userPersonas.length); setPersonaDraft({ name: '', age: '', ageMode: 'manual', ageReferenceCharacterId: '', profession: '', region: '', timezone: '', birthday: '', setting: '', avatar: '', themeColor: '#ffffff', boundCharacterIds: [] }); setPersonaEditorOpen(true); }}
        />
      )}

      {/* =====================================================
           BOTTOM NAVIGATION BAR
      ===================================================== */}
      <div className="absolute left-0 right-0 bottom-0 h-[68px] bg-white/98 border-t border-[#eeeeef] flex items-center z-20">
        {/* Tab 1: 聊天 */}
        <div
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'chat' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">◯</div>
          <div className="text-[9px]" >CHAT</div>
        </div>

        {/* Tab 2: 好友 */}
        <div
          onClick={() => setActiveTab('friends')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'friends' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">♧</div>
          <div className="text-[9px]" >FRIENDS</div>
        </div>

        {/* Tab 3: 朋友圈 */}
        <div
          onClick={() => setActiveTab('moments')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'moments' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">◎</div>
          <div className="text-[9px]" >VROOM</div>
        </div>

        {/* Tab 4: 我的 */}
        <div
          onClick={() => setActiveTab('me')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'me' ? 'text-[#ad7d88]' : 'text-[#aaa]'
          }`}
        >
          <div className="text-[19px] leading-none">○</div>
          <div className="text-[9px]" >ME</div>
        </div>
      </div>

      {/* =====================================================
           MODAL 1: MASK SWITCHER (切换面具)
      ===================================================== */}
      {showMaskModal && (
        <div
          onClick={() => setShowMaskModal(false)}
          className="absolute inset-0 bg-black/20 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 max-h-[75%] overflow-y-auto animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[17px] font-semibold text-[#202124]">切换面具</span>
              <button onClick={() => setShowMaskModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>
            <div className="text-[10px] text-[#aaa] mb-4">选择你现在使用的用户身份</div>

            <div className="space-y-2 mb-3">
              {masks.map((mask) => (
                <div
                  key={mask.id}
                  onClick={() => {
                    setCurrentUser(mask);
                    setShowMaskModal(false);
                    showToast(`已切换身份为 ${mask.name}`);
                  }}
                  className={`h-[64px] border rounded-[12px] flex items-center px-3 cursor-pointer transition-colors ${
                    currentUser.name === mask.name
                      ? 'border-[#d7b0ba] bg-[#fdf8f9]'
                      : 'border-[#ededee] hover:bg-neutral-50'
                  }`}
                >
                  <div className="w-[42px] h-[42px] rounded-full bg-[#f1f1f2] border border-[#e8e8e9] flex items-center justify-center shrink-0 overflow-hidden">
                    <svg className="w-[26px] h-[26px] text-[#b7b7b9]" viewBox="0 0 48 48" fill="currentColor">
                      <circle cx="24" cy="17" r="8" />
                      <path d="M10 40c1.8-8.1 6.8-12 14-12s12.2 3.9 14 12" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <div className="text-[13px] font-semibold text-[#202124]">{mask.name}</div>
                    <div className="text-[9px] text-[#aaa] mt-0.5">{mask.desc}</div>
                  </div>
                  {currentUser.name === mask.name && (
                    <span className="ml-auto text-[#b78792] font-bold">✓</span>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowMaskModal(false);
                setShowCreateMaskDrawer(true);
              }}
              className="w-full h-[45px] border border-dashed border-[#ddd] rounded-[10px] flex items-center justify-center text-[#999] text-[11px] cursor-pointer hover:border-[#ae7e89] hover:text-[#ae7e89]"
            >
              ＋ 创建新的用户身份
            </button>
          </div>
        </div>
      )}

      {momentsPostMenu && (
        <div
          className="absolute inset-0 z-[89] bg-black/25 flex items-end"
          onClick={() => setMomentsPostMenu(null)}
        >
          <div
            className="w-full bg-white rounded-t-[22px] p-4 pb-7 space-y-2 animate-in slide-in-from-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-1 pb-1">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">VROOM · POST</div>
              <div className="mt-1 text-[14px] font-semibold text-[#222] truncate">
                {momentsPostMenu.name || '动态'} · {momentsPostMenu.time || ''}
              </div>
              <div className="mt-1 text-[10px] text-[#999] line-clamp-2">
                {getPostCaption(momentsPostMenu)
                  || getPostTextCards(momentsPostMenu)[0]?.text
                  || getPostVideoCard(momentsPostMenu)?.text
                  || (momentsPostMenu.image || momentsPostMenu.images?.length ? '[图片]' : '这条动态')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const id = String(momentsPostMenu.id);
                setMomentsPosts(prev => prev.filter(p => String(p.id) !== id));
                if (postDetail && String(postDetail.id) === id) setPostDetail(null);
                setMomentsPostMenu(null);
                showToast('已删除这条动态');
              }}
              className="w-full py-3 rounded-[14px] bg-rose-50 text-rose-500 text-[13px] font-semibold"
            >
              删除这条动态
            </button>
            {(momentsPostMenu.characterId || momentsPostMenu.name) && (
              <button
                type="button"
                onClick={() => {
                  const cid = momentsPostMenu.characterId;
                  const name = momentsPostMenu.name;
                  const label = name || 'TA';
                  setMomentsPosts(prev => prev.filter(p => {
                    if (cid) return p.characterId !== cid;
                    return p.characterId || p.name !== name;
                  }));
                  if (postDetail && ((cid && postDetail.characterId === cid) || (!cid && postDetail.name === name))) {
                    setPostDetail(null);
                  }
                  setMomentsPostMenu(null);
                  showToast(`已删除「${label}」的全部动态`);
                }}
                className="w-full py-3 rounded-[14px] bg-[#fafafa] border border-[#eee] text-[#555] text-[12px]"
              >
                删除「{momentsPostMenu.name || 'TA'}」的全部动态
              </button>
            )}
            <button
              type="button"
              onClick={() => setMomentsPostMenu(null)}
              className="w-full py-3 rounded-[14px] bg-[#f5f5f6] text-[#666] text-[12px]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {momentsMoreOpen && (
        <div
          className="absolute inset-0 z-[87] bg-black/25 flex items-end animate-in fade-in"
          onClick={() => setMomentsMoreOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-[20px] px-4 pt-3 pb-6 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-1 bg-[#e5e5e6] rounded-full mx-auto mb-3" />
            <div className="text-[12px] font-semibold text-[#333] mb-2 px-1">更多</div>
            <button
              type="button"
              className="w-full flex items-center gap-3 py-3 px-1 border-b border-[#f3f3f4] text-left"
              onClick={() => {
                setMomentsMoreOpen(false);
                setMomentsDeleteSelectedIds([]);
                setMomentsDeleteAuthorKey('all');
                setMomentsManageOpen(true);
              }}
            >
              <span className="w-9 h-9 rounded-full border border-[#e7e7e8] grid place-items-center text-[13px] text-[#555] shrink-0">◫</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-[#333]">管理</span>
                <span className="block text-[10px] text-[#aaa] mt-0.5">批量整理动态</span>
              </span>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 py-3 px-1 border-b border-[#f3f3f4] text-left"
              onClick={() => {
                setMomentsMoreOpen(false);
                setMomentsBeautyOpen(true);
              }}
            >
              <span className="w-9 h-9 rounded-full border border-[#e7e7e8] grid place-items-center text-[13px] text-[#555] shrink-0">✧</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-[#333]">美化</span>
                <span className="block text-[10px] text-[#aaa] mt-0.5">封面与配色</span>
              </span>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 py-3 px-1 border-b border-[#f3f3f4] text-left"
              onClick={() => {
                setMomentsMoreOpen(false);
                setShowMomentsSettings(true);
              }}
            >
              <span className="w-9 h-9 rounded-full border border-[#e7e7e8] grid place-items-center text-[13px] tracking-[1px] text-[#555] shrink-0">···</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-[#333]">设置</span>
                <span className="block text-[10px] text-[#aaa] mt-0.5">AI 与发布偏好</span>
              </span>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 py-3 px-1 border-b border-[#f3f3f4] text-left"
              onClick={() => {
                setMomentsMoreOpen(false);
                void generateMomentsPost();
              }}
            >
              <span className="w-9 h-9 rounded-full border border-[#e7e7e8] grid place-items-center text-[13px] text-[#555] shrink-0">✦</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-[#333]">一键生成</span>
                <span className="block text-[10px] text-[#aaa] mt-0.5">随机角色/NPC 发一条</span>
              </span>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 py-3 px-1 text-left"
              onClick={() => {
                setMomentsMoreOpen(false);
                void handleRefreshComments();
              }}
            >
              <span className="w-9 h-9 rounded-full border border-[#e7e7e8] grid place-items-center text-[13px] text-[#555] shrink-0">↺</span>
              <span className="min-w-0">
                <span className="block text-[13px] text-[#333]">一键刷新</span>
                <span className="block text-[10px] text-[#aaa] mt-0.5">给现有动态补评论</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {momentsBeautyOpen && (
        <div className="absolute inset-0 z-[88] bg-black/25 flex items-end" onClick={() => setMomentsBeautyOpen(false)}>
          <div className="w-full max-h-[88%] overflow-y-auto bg-white rounded-t-[24px] p-5 pb-8 space-y-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">VROOM · BEAUTY</div><div className="font-semibold text-[15px] mt-1">朋友圈美化</div></div><button onClick={()=>setMomentsBeautyOpen(false)} className="text-xl text-[#aaa]">×</button></div>
            <div><div className="text-[9px] text-[#aaa] mb-2">颜色改哪里</div><div className="grid grid-cols-3 gap-2">{[['all','整体一起换'],['top','只改上面'],['bottom','只改下面']].map(([id,label])=><button key={id} onClick={()=>setMomentsStyle(p=>({...p,colorScope:id as any}))} className={`py-2.5 rounded-xl border text-[10px] ${(momentsStyle.colorScope||'all')===id?'bg-[#292724] text-white border-[#292724]':'bg-white border-[#eee] text-[#666]'}`}>{label}</button>)}</div><div className="mt-1 text-[8px] text-[#aaa]">上面 = 封面那块 · 下面 = 动态列表白底 · 整体 = 上下同色</div></div>
            <div><div className="text-[9px] text-[#aaa] mb-2">朋友圈颜色 {momentsStyle.pageColor || ''}</div><div className="flex flex-wrap gap-2">{['#ffffff','#fafafa','#fef6ec','#fdeef0','#eef3fd','#eef6f8','#f1f2fa','#e8e3dd','#b6c4c0','#a8b5c4','#c4b2a8','#292724','#ae7e89','#71849b','#7d8b72','#9b7d62'].map(color=><button key={color} onClick={()=>{setMomentsStyle(p=>({...p,pageColor:color,bannerColor:color}));showToast((momentsStyle.colorScope||'all')==='all'?'上下一起换好了':(momentsStyle.colorScope==='top'?'只换了上面封面':'只换了下面列表'));}} className={`w-8 h-8 rounded-full border shadow ${momentsStyle.pageColor===color?'border-[#202124] ring-2 ring-[#202124]/25':'border-white'}`} style={{background:color}} />)}</div></div>
            <label className="block p-4 rounded-2xl border border-dashed border-[#ddd] cursor-pointer"><div className="text-xs font-medium">更换朋友圈背景图</div><div className="text-[9px] text-[#aaa] mt-1">推荐横向照片、电影截图、风景图 · 也可以下面直接选颜色</div><input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)readImageFile(f,data=>{setMomentsStyle(p=>({...p,banner:data}));showToast('朋友圈背景已更换');})}} /></label>
            {momentsStyle.banner && <button onClick={()=>{setMomentsStyle(p=>({...p,banner:''}));showToast('已移除背景图，改用颜色');}} className="w-full py-2 rounded-xl bg-[#fafafa] border border-[#eee] text-[#888] text-[10px]">移除背景图，改用颜色</button>}
            <div className="hidden"><div className="text-[9px] text-[#aaa] mb-2">背景颜色 · 不用图就用它 {momentsStyle.bannerColor || ''}</div><div className="flex flex-wrap gap-2">{['#ffffff','#fef6ec','#fdeef0','#eef3fd','#eef6f8','#f1f2fa','#e8e3dd','#b6c4c0','#a8b5c4','#c4b2a8','#292724','#ae7e89','#71849b','#7d8b72','#9b7d62'].map(color=><button key={color} onClick={()=>{setMomentsStyle(p=>({...p,bannerColor:color}));showToast('朋友圈背景色已更换');}} className={`w-8 h-8 rounded-full border shadow ${momentsStyle.bannerColor===color?'border-[#202124] ring-2 ring-[#202124]/25':'border-white'}`} style={{background:color}} />)}</div></div>
            <div><div className="text-[9px] text-[#aaa] mb-2">内容卡片</div><div className="grid grid-cols-3 gap-2">{[['clean','极简'],['paper','纸张'],['soft','柔和']].map(([id,label])=><button key={id} onClick={()=>setMomentsStyle(p=>({...p,cardStyle:id as any}))} className={`py-2.5 rounded-xl border text-[10px] ${momentsStyle.cardStyle===id?'bg-[#292724] text-white border-[#292724]':'bg-white border-[#eee] text-[#666]'}`}>{label}</button>)}</div></div>
            <div><div className="text-[9px] text-[#aaa] mb-2">强调色 · 当前 {momentsStyle.accent}（点一下话题标签和点赞就会变色）</div><div className="flex gap-2">{['#292724','#ae7e89','#71849b','#7d8b72','#9b7d62'].map(color=><button key={color} onClick={()=>{setMomentsStyle(p=>({...p,accent:color}));showToast('强调色已换，看看话题标签的颜色');}} className={`w-8 h-8 rounded-full border shadow ${momentsStyle.accent===color?'border-[#202124] ring-2 ring-[#202124]/25':'border-white'}`} style={{background:color}} />)}</div></div>
            <div><div className="text-[9px] text-[#aaa] mb-2">文字大小</div><input type="range" min="0.9" max="1.15" step="0.05" value={momentsStyle.fontScale} onChange={e=>setMomentsStyle(p=>({...p,fontScale:Number(e.target.value)}))} className="w-full" /></div>
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#fafafa] text-xs"><span>显示话题标签</span><input type="checkbox" checked={momentsStyle.showTags} onChange={e=>setMomentsStyle(p=>({...p,showTags:e.target.checked}))} /></label>
            <button onClick={()=>setMomentsStyle({banner:'',bannerColor:'',pageColor:'',colorScope:'all',accent:'#ae7e89',cardStyle:'clean',fontScale:1,showTags:true})} className="w-full py-2.5 rounded-xl bg-[#f5f5f5] text-[#777] text-xs">恢复 VROOM 默认美化</button>
          </div>
        </div>
      )}

      {momentsManageOpen && (() => {
        const authorKeyOf = (post: Record<string, any>) =>
          post.characterId ? `c:${post.characterId}` : `n:${post.name || '未知'}`;
        const authorLabelOf = (post: Record<string, any>) => {
          if (post.characterId) {
            const char = importedCharacters.find(c => c.id === post.characterId);
            return char?.name || post.name || '角色';
          }
          return post.name || '我';
        };
        const authorOptions = (() => {
          const map = new Map<string, { key: string; label: string; count: number; avatar?: string }>();
          for (const post of momentsPosts) {
            const key = authorKeyOf(post);
            const prev = map.get(key);
            if (prev) {
              prev.count += 1;
            } else {
              const char = post.characterId
                ? importedCharacters.find(c => c.id === post.characterId)
                : null;
              map.set(key, {
                key,
                label: authorLabelOf(post),
                count: 1,
                avatar: char?.avatar || post.avatar || (!post.characterId ? (activePersona?.avatar || currentUser.avatar) : undefined),
              });
            }
          }
          return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'));
        })();
        const filteredPosts = momentsDeleteAuthorKey === 'all'
          ? momentsPosts
          : momentsPosts.filter(p => authorKeyOf(p) === momentsDeleteAuthorKey);
        const filteredIds = filteredPosts.map(p => String(p.id));
        const selectedInView = filteredIds.filter(id => momentsDeleteSelectedIds.includes(id));
        const allFilteredSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length;
        const toggleOne = (id: string) => {
          setMomentsDeleteSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
          );
        };
        const selectAllFiltered = () => {
          setMomentsDeleteSelectedIds(prev => {
            const set = new Set(prev);
            filteredIds.forEach(id => set.add(id));
            return Array.from(set);
          });
        };
        const clearFilteredSelection = () => {
          setMomentsDeleteSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
        };
        const deleteSelected = () => {
          if (!momentsDeleteSelectedIds.length) {
            showToast('先勾选要删的动态');
            return;
          }
          const remove = new Set(momentsDeleteSelectedIds);
          setMomentsPosts(prev => prev.filter(p => !remove.has(String(p.id))));
          setMomentsDeleteSelectedIds([]);
          showToast(`已删除 ${remove.size} 条动态`);
        };
        const deleteAuthorAll = (key: string, label: string) => {
          const ids = momentsPosts.filter(p => authorKeyOf(p) === key).map(p => String(p.id));
          if (!ids.length) return;
          const remove = new Set(ids);
          setMomentsPosts(prev => prev.filter(p => !remove.has(String(p.id))));
          setMomentsDeleteSelectedIds(prev => prev.filter(id => !remove.has(id)));
          if (momentsDeleteAuthorKey === key) setMomentsDeleteAuthorKey('all');
          showToast(`已删除「${label}」的全部动态（${ids.length}）`);
        };
        const previewOf = (post: Record<string, any>) => {
          const caption = getPostCaption(post);
          if (caption) return caption;
          const cards = getPostTextCards(post);
          if (cards[0]?.text) return cards[0].text;
          const video = getPostVideoCard(post);
          if (video?.text) return video.text;
          if (post.image || post.images?.length) return '[图片]';
          return '[动态]';
        };

        return (
        <div
          className="absolute inset-0 z-[88] bg-black/25 flex items-end"
          onClick={() => {
            setMomentsManageOpen(false);
            setMomentsDeleteSelectedIds([]);
            setMomentsDeleteAuthorKey('all');
          }}
        >
          <div className="w-full max-h-[90%] overflow-y-auto bg-white rounded-t-[24px] p-5 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between sticky top-0 bg-white z-10 pb-1">
              <div>
                <div className="font-semibold text-[15px]">朋友圈管理</div>
                <div className="text-[9px] text-[#aaa] mt-1">勾选删除 · 也可按角色清空全部动态</div>
              </div>
              <button
                onClick={() => {
                  setMomentsManageOpen(false);
                  setMomentsDeleteSelectedIds([]);
                  setMomentsDeleteAuthorKey('all');
                }}
                className="text-xl text-[#aaa]"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportMomentsData} className="p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-left text-xs">导出 VROOM 数据<div className="text-[9px] text-[#aaa] mt-1">动态 + 设置 + 美化</div></button>
              <label className="p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-left text-xs cursor-pointer">导入 VROOM 数据<div className="text-[9px] text-[#aaa] mt-1">JSON 备份</div><input type="file" accept=".json,application/json" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)importMomentsData(f)}} /></label>
            </div>

            {/* 按角色：一键删该角色全部 */}
            <div className="p-3 rounded-xl bg-[#fafafa] border border-[#eee]">
              <div className="text-xs font-medium text-[#333]">按角色删除全部动态</div>
              <div className="text-[9px] text-[#aaa] mt-1 mb-2">点角色右侧「全删」会删掉 TA 的所有动态</div>
              <div className="max-h-[140px] overflow-y-auto space-y-1.5">
                {authorOptions.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-[#aaa]">还没有动态</div>
                ) : (
                  authorOptions.map(author => (
                    <div key={author.key} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#f0f0f1]">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0 grid place-items-center">
                        {author.avatar
                          ? <img src={author.avatar} alt="" className="w-full h-full object-cover" />
                          : <span className="text-[11px] text-[#aaa]">{author.label[0] || '·'}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMomentsDeleteAuthorKey(author.key);
                          setMomentsDeleteSelectedIds([]);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-[11px] font-semibold text-[#333] truncate">{author.label}</div>
                        <div className="text-[9px] text-[#aaa]">{author.count} 条 · 点这里筛选勾选</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAuthorAll(author.key, author.label)}
                        className="shrink-0 px-2.5 py-1 rounded-full text-[10px] bg-rose-50 text-rose-500"
                      >
                        全删
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 勾选删除列表 */}
            <div className="p-3 rounded-xl bg-[#fafafa] border border-[#eee]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-[#333]">勾选删除 · {filteredPosts.length} 条</div>
                  <div className="text-[9px] text-[#aaa] mt-0.5">
                    {momentsDeleteAuthorKey === 'all'
                      ? '全部作者'
                      : `筛选：${authorOptions.find(a => a.key === momentsDeleteAuthorKey)?.label || ''}`}
                    {momentsDeleteSelectedIds.length ? ` · 已勾 ${momentsDeleteSelectedIds.length}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {momentsDeleteAuthorKey !== 'all' && (
                    <button type="button" onClick={() => { setMomentsDeleteAuthorKey('all'); setMomentsDeleteSelectedIds([]); }} className="text-[10px] text-[#888] px-2 py-1">看全部</button>
                  )}
                  <button
                    type="button"
                    onClick={() => (allFilteredSelected ? clearFilteredSelection() : selectAllFiltered())}
                    className="px-2.5 py-1 rounded-full text-[10px] border border-[#e3e3e5] bg-white text-[#444]"
                  >
                    {allFilteredSelected ? '取消全选' : '全选当前'}
                  </button>
                </div>
              </div>

              <div className="mt-2 max-h-[240px] overflow-y-auto space-y-1">
                {filteredPosts.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-[#aaa]">没有可勾选的动态</div>
                ) : (
                  filteredPosts.map(post => {
                    const id = String(post.id);
                    const checked = momentsDeleteSelectedIds.includes(id);
                    return (
                      <label
                        key={id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer ${
                          checked ? 'border-[#d4aab5] bg-[#fdf8f9]' : 'border-[#f0f0f1] bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleOne(id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-[#333] truncate">{authorLabelOf(post)}</span>
                            <span className="text-[9px] text-[#bbb] shrink-0">{post.time}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-[#888] line-clamp-2">{previewOf(post)}</div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={deleteSelected}
              disabled={!momentsDeleteSelectedIds.length}
              className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-xs disabled:opacity-40"
            >
              删除勾选的 {momentsDeleteSelectedIds.length || 0} 条
            </button>
            <button
              type="button"
              onClick={() => {
                if (!momentsPosts.length) return;
                setMomentsPosts([]);
                setMomentsDeleteSelectedIds([]);
                setMomentsDeleteAuthorKey('all');
                showToast('VROOM 动态已全部清空');
              }}
              className="w-full py-2.5 rounded-xl bg-rose-50 text-rose-500 text-xs"
            >
              清空全部动态
            </button>
          </div>
        </div>
        );
      })()}

      {/* 创建新身份抽屉 */}
      {showMomentsSettings && (
        <div className="absolute inset-0 z-[85] bg-black/25 flex items-end" onClick={() => setShowMomentsSettings(false)}>
          <div className="w-full max-h-[82%] overflow-y-auto bg-white rounded-t-[24px] p-5 pb-8 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">VROOM · SETTINGS</div><div className="mt-1 font-semibold text-[15px]">朋友圈设置</div></div><button onClick={() => setShowMomentsSettings(false)} className="text-xl text-[#aaa]">×</button></div>
            <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]"><div><div className="text-xs font-medium">允许角色自主发朋友圈</div><div className="text-[9px] text-[#aaa] mt-1">关闭后，角色不会通过主动生活事件发布动态。</div></div><input type="checkbox" checked={momentsSettings.allowCharacterAutoPost} onChange={e => setMomentsSettings(prev => ({...prev, allowCharacterAutoPost: e.target.checked}))} /></label>
            <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]"><div><div className="text-xs font-medium">允许 NPC 发朋友圈</div><div className="text-[9px] text-[#aaa] mt-1">关闭后，NPC 不会一键发帖 / 出现在刷新池里。</div></div><input type="checkbox" checked={momentsSettings.allowNpcAutoPost !== false} onChange={e => setMomentsSettings(prev => ({...prev, allowNpcAutoPost: e.target.checked}))} /></label>
            <div className="p-3 rounded-2xl bg-[#f8f8f9] space-y-2">
              <div className="text-xs font-medium">回复后发朋友圈</div>
              <div className="text-[9px] text-[#aaa]">角色单聊/群聊回复后，是否自动发朋友圈</div>
              <div className="flex gap-2">
                {([['off','关闭'],['decide','角色判定'],['always','每次都发']] as const).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setMomentsSettings(prev => ({ ...prev, postMomentsAfterChat: val }))} className={`flex-1 py-2 rounded-xl border text-[10px] font-medium ${momentsSettings.postMomentsAfterChat === val ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white border-[#eee] text-[#666]'}`}>{label}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#faf8f9] border border-[#f0e4e7]">
              <div>
                <div className="text-xs font-medium text-[#333]">图片卡 / 视频卡 · AI 润色</div>
                <div className="text-[9px] text-[#aaa] mt-1 leading-relaxed">开启后，发布「文字图片卡」「文字视频卡」时都会 AI 润色正文；普通正文与真实图片不受影响。可随时关闭。</div>
              </div>
              <input
                type="checkbox"
                checked={!!momentsSettings.aiPolishTextCard}
                onChange={e => setMomentsSettings(prev => ({ ...prev, aiPolishTextCard: e.target.checked }))}
              />
            </label>

            <div className="space-y-2.5 pt-1">
              <div className="text-[10px] font-semibold text-[#555]">好友与可见 · 角色 / NPC</div>
              <div className="text-[9px] text-[#aaa] leading-relaxed">勾选 = 与该人设互为好友，能看见动态、能评论。取消 = 屏蔽：看不见、也不能评。默认跟随 LINE 好友列表。</div>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]">
                <div><div className="text-xs font-medium">严格好友模式</div><div className="text-[9px] text-[#aaa] mt-1">开：角色/NPC 之间必须同群（或下面手动加为好友）才能互评；关：同为我的好友也能互评。</div></div>
                <input type="checkbox" checked={vroomScope.strictFriendsOnly} onChange={e => { const next = { ...vroomScope, strictFriendsOnly: e.target.checked }; try { window.localStorage.setItem('vroom:scope-settings', JSON.stringify(next)); } catch { /* ignore */ } setVroomScope(next); }} />
              </label>
              <div className="p-3 rounded-2xl bg-[#f8f8f9] space-y-2">
                <div className="text-[10px] font-medium text-[#555]">正在管理的人设</div>
                <div className="flex flex-wrap gap-1.5">
                  {(userPersonas.length ? userPersonas : [{ id: effectivePersonaId || 'default', name: activePersona?.name || currentUser.name || '我' }]).map((persona: any) => (
                    <button key={persona.id} type="button" onClick={() => setVroomFriendPersonaId(persona.id)} className={vroomFriendPersonaId === persona.id || (!vroomFriendPersonaId && persona.id === effectivePersonaId) ? 'px-2.5 py-1.5 rounded-full bg-[#292724] text-white text-[10px]' : 'px-2.5 py-1.5 rounded-full bg-white border border-[#e3e3e5] text-[#666] text-[10px]'}>
                      {persona.name || '未命名'}
                    </button>
                  ))}
                </div>
                <div className="text-[9px] font-medium text-[#666] pt-1">角色</div>
                <div className="max-h-[160px] overflow-y-auto space-y-1">
                  {importedCharacters.map(character => {
                    const personaId = vroomFriendPersonaId || effectivePersonaId || 'default';
                    const pkey = 'persona:' + personaId;
                    const ckey = 'character:' + (character.id || character.name);
                    const defaultFriend = friendsList.some(f => !f.npcId && (f.characterId === character.id || f.name === character.name));
                    const blocked = isVroomBlockedEdge(pkey, ckey);
                    const allowed = isVroomAllowedEdge(pkey, ckey);
                    const checked = blocked ? false : (allowed ? true : defaultFriend);
                    return (
                      <label key={character.id || character.name} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#eee] text-[11px] cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={e => { setVroomFriendEdge(pkey, ckey, e.target.checked); setVroomRev(v => v + 1); }} />
                        <span className="flex-1 truncate">{character.name}</span>
                        <span className="text-[8px] text-[#aaa]">{blocked ? '已屏蔽' : allowed ? '好友' : defaultFriend ? '默认好友' : '陌生人'}</span>
                      </label>
                    );
                  })}
                  {!importedCharacters.length && <div className="text-[10px] text-[#aaa] text-center py-2">还没有导入角色</div>}
                </div>
                <div className="text-[9px] font-medium text-[#666] pt-1">NPC</div>
                <div className="max-h-[160px] overflow-y-auto space-y-1">
                  {allLineNpcs.map(npc => {
                    const personaId = vroomFriendPersonaId || effectivePersonaId || 'default';
                    const pkey = 'persona:' + personaId;
                    const nkey = 'npc:' + npc.id;
                    const defaultFriend = friendsList.some(f => f.npcId === npc.id && (!f.personaId || f.personaId === personaId));
                    const blocked = isVroomBlockedEdge(pkey, nkey);
                    const allowed = isVroomAllowedEdge(pkey, nkey);
                    const checked = blocked ? false : (allowed ? true : defaultFriend);
                    return (
                      <label key={npc.id} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#eee] text-[11px] cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={e => { setVroomFriendEdge(pkey, nkey, e.target.checked); setVroomRev(v => v + 1); }} />
                        <span className="flex-1 truncate">{npc.name}</span>
                        <span className="text-[8px] text-[#ae7e89]">NPC</span>
                        <span className="text-[8px] text-[#aaa]">{blocked ? '已屏蔽' : allowed ? '好友' : defaultFriend ? '默认好友' : '陌生人'}</span>
                      </label>
                    );
                  })}
                  {!allLineNpcs.length && <div className="text-[10px] text-[#aaa] text-center py-2">还没有 NPC · 去 NPC App 生成</div>}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="text-[10px] font-semibold text-[#555]">评论</div>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]">
                <div>
                  <div className="text-xs font-medium">允许导入角色评论动态</div>
                  <div className="text-[9px] text-[#aaa] mt-1">关闭后，角色不会在朋友圈留下评论。</div>
                </div>
                <input type="checkbox" checked={momentsSettings.allowCharacterComment !== false} onChange={e => setMomentsSettings(prev => ({ ...prev, allowCharacterComment: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]">
                <div>
                  <div className="text-xs font-medium">角色评论可以 @我</div>
                  <div className="text-[9px] text-[#aaa] mt-1">开启后，评论里可能自然艾特当前身份名。</div>
                </div>
                <input type="checkbox" checked={momentsSettings.allowCharacterMentionMe !== false} onChange={e => setMomentsSettings(prev => ({ ...prev, allowCharacterMentionMe: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]">
                <div>
                  <div className="text-xs font-medium">允许 NPC 评论</div>
                  <div className="text-[9px] text-[#aaa] mt-1">总开关。下面还可按人开关每个 NPC。</div>
                </div>
                <input type="checkbox" checked={momentsSettings.allowNpcComment !== false} onChange={e => setMomentsSettings(prev => ({ ...prev, allowNpcComment: e.target.checked }))} />
              </label>
              {momentsSettings.allowNpcComment !== false && allLineNpcs.length > 0 && (
                <div className="p-3 rounded-2xl bg-[#f8f8f9] space-y-1.5">
                  <div className="text-[10px] font-medium text-[#555]">哪些 NPC 可以评论</div>
                  <div className="max-h-[140px] overflow-y-auto space-y-1">
                    {allLineNpcs.map(npc => (
                      <label key={'comment-' + npc.id} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#eee] text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={npc.active && npc.canCommentMoments !== false}
                          onChange={() => {
                            updateNpc(npc.id, {
                              canCommentMoments: !(npc.active && npc.canCommentMoments !== false),
                              active: true,
                            });
                            setVroomRev(v => v + 1);
                          }}
                        />
                        <span className="flex-1 truncate">{npc.name}</span>
                        <span className="text-[8px] text-[#ae7e89]">NPC</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-3 rounded-2xl bg-[#f8f8f9] space-y-2">
                <div className="text-xs font-medium">评论生成方式</div>
                <div className="text-[9px] text-[#aaa] leading-relaxed">批量：发帖后立刻生成几条；自主：仅后台偶尔来评；两者：都开。</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {([
                    { id: 'batch' as const, label: '仅批量' },
                    { id: 'autonomous' as const, label: '仅自主' },
                    { id: 'both' as const, label: '批量+自主' },
                  ]).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMomentsSettings(prev => ({ ...prev, commentSpawnMode: opt.id }))}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium ${(momentsSettings.commentSpawnMode || 'both') === opt.id ? 'bg-[#292724] text-white' : 'bg-white border border-[#eee] text-[#555]'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {(momentsSettings.commentSpawnMode || 'both') !== 'autonomous' && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div>
                      <div className="text-[10px] font-medium text-[#444]">批量条数</div>
                      <div className="text-[9px] text-[#aaa]">发帖后立刻生成 1–5 条</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="w-7 h-7 rounded-lg bg-white border border-[#eee] text-sm"
                        onClick={() => setMomentsSettings(prev => ({ ...prev, batchCommentCount: Math.max(1, (prev.batchCommentCount || 2) - 1) }))}
                      >−</button>
                      <span className="w-5 text-center text-xs font-semibold">{momentsSettings.batchCommentCount || 2}</span>
                      <button
                        type="button"
                        className="w-7 h-7 rounded-lg bg-white border border-[#eee] text-sm"
                        onClick={() => setMomentsSettings(prev => ({ ...prev, batchCommentCount: Math.min(5, (prev.batchCommentCount || 2) + 1) }))}
                      >+</button>
                    </div>
                  </div>
                )}
              </div>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]">
                <div>
                  <div className="text-xs font-medium">回复评论后立刻回敬</div>
                  <div className="text-[9px] text-[#aaa] mt-1">我回复某条角色/NPC 评论后，对方立刻再回一条。</div>
                </div>
                <input type="checkbox" checked={momentsSettings.instantReplyOnCommentReply !== false} onChange={e => setMomentsSettings(prev => ({ ...prev, instantReplyOnCommentReply: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-[#f8f8f9]">
                <div>
                  <div className="text-xs font-medium">新评后作者立刻回</div>
                  <div className="text-[9px] text-[#aaa] mt-1">我在别人动态下新评时，作者也可能立刻回我。</div>
                </div>
                <input type="checkbox" checked={!!momentsSettings.instantReplyOnPostComment} onChange={e => setMomentsSettings(prev => ({ ...prev, instantReplyOnPostComment: e.target.checked }))} />
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-[#555]">谁可以发朋友圈 · 角色</div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {importedCharacters.map(character => {
                  const checked = momentsSettings.enabledCharacterIds.length === 0 || momentsSettings.enabledCharacterIds.includes(character.id);
                  return (
                    <label key={character.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-[#eee] cursor-pointer">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0">
                        {character.avatar ? <img src={character.avatar} alt="" className="w-full h-full object-cover" /> : null}
                      </div>
                      <span className="flex-1 text-xs">{character.name}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setMomentsSettings(prev => {
                          const allIds = importedCharacters.map(item => item.id);
                          const current = prev.enabledCharacterIds.length === 0 ? allIds : prev.enabledCharacterIds;
                          const next = current.includes(character.id) ? current.filter(id => id !== character.id) : [...current, character.id];
                          return { ...prev, enabledCharacterIds: next.length === allIds.length ? [] : next };
                        })}
                      />
                    </label>
                  );
                })}
                {!importedCharacters.length && <div className="text-[10px] text-[#aaa] text-center py-2">还没有导入角色</div>}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-[#555]">谁可以发朋友圈 · NPC</div>
              <div className="text-[9px] text-[#aaa] leading-relaxed">需先打开上面的「允许 NPC 发朋友圈」。空勾选 = 全部可发帖的活跃 NPC。</div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {allLineNpcs.map(npc => {
                  const allowedByWhitelist = momentsSettings.enabledNpcIds.length === 0 || momentsSettings.enabledNpcIds.includes(npc.id);
                  const checked = npc.active && npc.canPostMoments !== false && allowedByWhitelist && momentsSettings.allowNpcAutoPost !== false;
                  return (
                    <label key={'post-npc-' + npc.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-[#eee] cursor-pointer">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0">
                        <NpcAvatar name={npc.name} avatar={npc.avatar} className="w-full h-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate">{npc.name}</div>
                        <div className="text-[8px] text-[#ae7e89]">NPC</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const turningOn = !checked;
                          updateNpc(npc.id, {
                            active: true,
                            canPostMoments: turningOn,
                          });
                          setMomentsSettings(prev => {
                            const allIds = allLineNpcs.filter(n => n).map(n => n.id);
                            const current = prev.enabledNpcIds.length === 0 ? allIds : prev.enabledNpcIds;
                            let next = turningOn
                              ? (current.includes(npc.id) ? current : [...current, npc.id])
                              : current.filter(id => id !== npc.id);
                            if (turningOn && next.length === allIds.length) next = [];
                            return {
                              ...prev,
                              allowNpcAutoPost: turningOn ? true : prev.allowNpcAutoPost,
                              enabledNpcIds: next,
                            };
                          });
                          setVroomRev(v => v + 1);
                        }}
                      />
                    </label>
                  );
                })}
                {!allLineNpcs.length && <div className="text-[10px] text-[#aaa] text-center py-2">还没有 NPC · 去 NPC App 生成</div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setShowMomentsSettings(false); void generateMomentsPost(); }}
                className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-xs"
              >
                角色/NPC 发一条
              </button>
              <button
                type="button"
                onClick={() => { setShowMomentsSettings(false); void generateNpcMomentsPost(); }}
                className="w-full py-2.5 rounded-xl bg-[#f6eef0] text-[#8c5f6b] text-xs font-medium"
              >
                专门让 NPC 发一条
              </button>
              <button
                type="button"
                onClick={() => { setShowMomentsSettings(false); void handleRefreshComments(); }}
                className="col-span-2 w-full py-2.5 rounded-xl bg-[#f8f8f9] text-[#555] text-xs border border-[#eee]"
              >
                {isRefreshingComments ? '刷新中…' : '↺ 一键刷新评论'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCharacterProfileGenerator && friendProfile && (() => {
        const character = importedCharacters.find(c => c.id === friendProfile.characterId) || importedCharacters.find(c => c.name === friendProfile.name);
        if (!character) return null;
        const profile = generatedCharacterProfiles[character.id] || { profileId: character.id, followers: 0, following: 0, signature: '', updatedAt: '' };
        return <div className="absolute inset-0 z-[90] bg-black/25 flex items-end" onClick={() => setShowCharacterProfileGenerator(false)}>
          <div className="w-full bg-white rounded-t-[24px] p-5 pb-8 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">CHARACTER PROFILE</div><div className="mt-1 font-semibold text-[15px]">生成 {character.name} 的个人主页</div></div>
              <button onClick={() => setShowCharacterProfileGenerator(false)} className="text-xl text-[#aaa]">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setProfileGeneratorMode('character')} className={`p-3 rounded-xl border text-left ${profileGeneratorMode === 'character' ? 'border-[#292724] bg-[#292724] text-white' : 'border-[#eee] bg-[#fafafa]'}`}>
                <div className="text-xs font-semibold">角色自主生成</div><div className="text-[8px] opacity-60 mt-1">角色自己决定签名</div>
              </button>
              <button onClick={() => setProfileGeneratorMode('memory')} className={`p-3 rounded-xl border text-left ${profileGeneratorMode === 'memory' ? 'border-[#292724] bg-[#292724] text-white' : 'border-[#eee] bg-[#fafafa]'}`}>
                <div className="text-xs font-semibold">根据记忆生成</div><div className="text-[8px] opacity-60 mt-1">从聊天长期记忆里找语气</div>
              </button>
            </div>
            <div className="p-4 rounded-2xl bg-[#faf8f8] border border-[#eee5e7]">
              <div className="text-[9px] text-[#aaa]">主页固定内容</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-[9px] text-[#aaa]">ID</div><div className="mt-1 font-medium">{character.id}</div></div>
                <div><div className="text-[9px] text-[#aaa]">姓名</div><div className="mt-1 font-medium">{character.name}</div></div>
                <div><div className="text-[9px] text-[#aaa]">粉丝量</div><input value={profile.followers} type="number" min="0" onChange={e => setGeneratedCharacterProfiles(prev => ({ ...prev, [character.id]: { ...profile, followers: Math.max(0, Number(e.target.value) || 0), updatedAt: new Date().toISOString() } }))} className="mt-1 w-full h-8 rounded-lg bg-white border border-[#eee] px-2 outline-none" /></div>
                <div><div className="text-[9px] text-[#aaa]">关注量</div><input value={profile.following} type="number" min="0" onChange={e => setGeneratedCharacterProfiles(prev => ({ ...prev, [character.id]: { ...profile, following: Math.max(0, Number(e.target.value) || 0), updatedAt: new Date().toISOString() } }))} className="mt-1 w-full h-8 rounded-lg bg-white border border-[#eee] px-2 outline-none" /></div>
              </div>
            </div>
            <button disabled={profileGeneratorBusy} onClick={async () => {
              setProfileGeneratorBusy(true);
              try {
                const memory = getCharacterMemory(character.id, character.name);
                const memoryText = memory.summary + '\n' + memory.items.slice(0, 20).map(item => item.content).join('\n');
                const prompt = profileGeneratorMode === 'memory'
                  ? `根据以下长期记忆，写一句最像这个角色的社交软件个性签名：\n${memoryText}`
                  : `请让角色 ${character.name} 根据自己的角色设定，写一句自然、克制、像本人会用的社交软件个性签名。`;
                const text = await generateCreativeText({
                  settings: channelAsAiSettings('moments'),
                  systemPrompt: [character.description, character.personality, character.scenario, character.creatorNotes].filter(Boolean).join('\n'),
                  userPrompt: prompt + '\n只输出签名本身，不要“签名：”前缀，不要解释，不要提AI。',
                  temperature: 0.8,
                });
                setGeneratedCharacterProfiles(prev => ({
                  ...prev,
                  [character.id]: { followers: profile.followers, following: profile.following, signature: text.trim().replace(/^["“”]|["“”]$/g, ''), updatedAt: new Date().toISOString() }
                }));
                showToast('角色个性签名已生成');
              } catch (e) {
                showToast(e instanceof Error ? e.message : '生成失败');
              } finally { setProfileGeneratorBusy(false); }
            }} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-xs disabled:opacity-40">
              {profileGeneratorBusy ? '正在生成…' : '✦ 让角色生成个性签名'}
            </button>
          </div>
        </div>;
      })()}

      {characterProfileStyleOpen && friendProfile && (() => {
        const character = importedCharacters.find(c => c.id === friendProfile.characterId) || importedCharacters.find(c => c.name === friendProfile.name);
        if (!character) return null;
        const style = characterProfileStyles[character.id] || {};
        return <div className="absolute inset-0 z-[96] bg-black/25 flex items-end" onClick={() => setCharacterProfileStyleOpen(false)}>
          <div className="w-full bg-white rounded-t-[24px] p-5 pb-8 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div><div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">PROFILE · BEAUTY</div><div className="font-semibold text-[15px] mt-1">个人主页美化</div></div><button onClick={() => setCharacterProfileStyleOpen(false)} className="text-xl text-[#aaa]">×</button></div>
            <label className="block p-3 rounded-2xl border border-dashed border-[#ddd] text-xs cursor-pointer">
              <div className="font-medium">更换头像</div><div className="text-[9px] text-[#aaa] mt-1">图片会用于这个角色的个人主页</div>
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f) readImageFile(f, data => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],avatar:data}}))); }} />
            </label>
            <label className="block p-3 rounded-2xl border border-dashed border-[#ddd] text-xs cursor-pointer">
              <div className="font-medium">更换背景图</div><div className="text-[9px] text-[#aaa] mt-1">支持任意本地图片</div>
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f) readImageFile(f, data => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],background:data}}))); }} />
            </label>
            <div>
              <div className="text-[9px] text-[#aaa] mb-2">强调色</div>
              <div className="flex gap-2 flex-wrap">{['#292724','#ae7e89','#71849b','#7d8b72','#9b7d62','#7b6d61','#4f6b67'].map(color => <button key={color} onClick={() => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],accent:color}}))} className="w-8 h-8 rounded-full border-2 border-white shadow" style={{background:color}} />)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#aaa] mb-2">卡片样式</div>
              <div className="grid grid-cols-3 gap-2">
                {(['clean','paper','soft'] as const).map(styleName => <button key={styleName} onClick={() => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],cardStyle:styleName}}))} className={`py-2 rounded-xl border text-[9px] ${style.cardStyle===styleName?'bg-[#292724] text-white border-[#292724]':'bg-white text-[#666] border-[#eee]'}`}>{styleName==='clean'?'Clean':styleName==='paper'?'Paper':'Soft'}</button>)}
              </div>
            </div>
            <label className="block">
              <div className="text-[9px] text-[#aaa] mb-1">字号 · {Math.round((style.fontScale || 1) * 100)}%</div>
              <input type="range" min="0.9" max="1.15" step="0.05" value={style.fontScale || 1} onChange={e => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],fontScale:Number(e.target.value)}}))} className="w-full" />
            </label>
            <label className="block">
              <div className="text-[9px] text-[#aaa] mb-1">圆角 · {style.radius ?? 22}px</div>
              <input type="range" min="8" max="32" step="1" value={style.radius ?? 22} onChange={e => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],radius:Number(e.target.value)}}))} className="w-full" />
            </label>
            <label className="block">
              <div className="text-[9px] text-[#aaa] mb-1">自定义 CSS</div>
              <textarea value={style.customCss || ''} onChange={e => setCharacterProfileStyles(prev => ({...prev,[character.id]:{...prev[character.id],customCss:e.target.value}}))} placeholder=".profile-card { letter-spacing: .02em; }" className="w-full h-24 rounded-xl bg-[#fafafa] border border-[#eee] p-3 text-[9px] font-mono resize-none outline-none" />
            </label>
            <button onClick={() => { setCharacterProfileStyles(prev => ({...prev,[character.id]:{}})); showToast('主页美化已重置'); }} className="w-full py-2.5 rounded-xl bg-[#f5f5f5] text-[#777] text-xs">恢复默认</button>
          </div>
        </div>;
      })()}

      {characterProfileManageOpen && friendProfile && (() => {
        const character = importedCharacters.find(c => c.id === friendProfile.characterId) || importedCharacters.find(c => c.name === friendProfile.name);
        if (!character) return null;
        const profile = generatedCharacterProfiles[character.id] || { followers: 0, following: 0, signature: '', updatedAt: '' };
        return <div className="absolute inset-0 z-[95] bg-black/25 flex items-end" onClick={() => setCharacterProfileManageOpen(false)}>
          <div className="w-full bg-white rounded-t-[24px] p-5 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div><div className="font-semibold text-[15px]">个人主页管理</div><div className="text-[9px] text-[#aaa] mt-1">编辑、导入、导出都在这里</div></div><button onClick={() => setCharacterProfileManageOpen(false)} className="text-xl text-[#aaa]">×</button></div>
            <label className="block p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-xs cursor-pointer"><div className="font-medium">导入主页 JSON</div><input type="file" accept=".json,application/json" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{try{const d=JSON.parse(String(reader.result||'{}')); if(d.profile) setGeneratedCharacterProfiles(prev=>({...prev,[character.id]:{...profile,...d.profile}})); if(d.style) setCharacterProfileStyles(prev=>({...prev,[character.id]:d.style})); showToast('角色主页已导入');}catch{showToast('主页文件格式不正确')}}; reader.readAsText(f); }} /></label>
            <button onClick={() => exportCharacterProfileData(character.id)} className="w-full p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-left text-xs">导出主页 JSON <span className="float-right text-[#aaa]">›</span></button>
            <label className="block p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-xs">
              <div className="font-medium">主页 ID</div>
              <div className="text-[9px] text-[#aaa] mt-1">这是主页显示 ID，不会修改角色卡内部 ID。</div>
              <input
                value={profile.profileId || character.id}
                onChange={e => setGeneratedCharacterProfiles(prev => ({...prev,[character.id]:{...profile,profileId:e.target.value.replace(/\s/g,'').slice(0,32)}}))}
                className="mt-2 w-full h-9 rounded-lg border border-[#eee] px-2 text-xs outline-none"
                placeholder="例如 rhys_333"
              />
            </label>
            <div className="grid grid-cols-2 gap-2"><label className="p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-xs">粉丝量<input type="number" min="0" value={profile.followers} onChange={e=>setGeneratedCharacterProfiles(prev=>({...prev,[character.id]:{...profile,followers:Math.max(0,Number(e.target.value)||0)}}))} className="mt-2 w-full h-8 rounded-lg border border-[#eee] px-2" /></label><label className="p-3 rounded-xl bg-[#fafafa] border border-[#eee] text-xs">关注量<input type="number" min="0" value={profile.following} onChange={e=>setGeneratedCharacterProfiles(prev=>({...prev,[character.id]:{...profile,following:Math.max(0,Number(e.target.value)||0)}}))} className="mt-2 w-full h-8 rounded-lg border border-[#eee] px-2" /></label></div>
            <textarea value={profile.signature} onChange={e=>setGeneratedCharacterProfiles(prev=>({...prev,[character.id]:{...profile,signature:e.target.value}}))} placeholder="个性签名" className="w-full h-20 rounded-xl bg-[#fafafa] border border-[#eee] p-3 text-xs resize-none outline-none" />
            <button onClick={() => { setGeneratedCharacterProfiles(prev=>{const next={...prev}; delete next[character.id]; return next;}); showToast('角色主页资料已清空'); setCharacterProfileManageOpen(false); }} className="w-full py-2.5 rounded-xl text-rose-500 bg-rose-50 text-xs">清空主页资料</button>
          </div>
        </div>;
      })()}

      {friendProfile && (() => {
        const profileNpc = friendProfile.npcId ? allLineNpcs.find(item => item.id === friendProfile.npcId) : null;
        const character = profileNpc
          ? null
          : (importedCharacters.find(c => c.id === friendProfile.characterId) || importedCharacters.find(c => c.name === friendProfile.name));
        const boundForProfileNpc = profileNpc
          ? importedCharacters.find(c => c.id === profileNpc.boundCharacterId)
          : null;
        const chat = chatItems.find(c =>
          friendProfile.npcId
            ? c.npcId === friendProfile.npcId && (!c.personaId || c.personaId === effectivePersonaId)
            : (!c.npcId && (c.characterId === friendProfile.characterId || c.name === friendProfile.name) && (c.isGroup || c.personaId === effectivePersonaId))
        );
        const profileAvatar = profileNpc
          ? (profileNpc.avatar || (boundForProfileNpc ? boundForProfileNpc.avatar : '') || '')
          : (characterProfileStyles[character?.id || friendProfile.characterId || '']?.avatar || character?.avatar || '');
        return (
          <div className="absolute inset-0 z-[70] bg-white animate-in slide-in-from-right">
            <div className="h-full overflow-y-auto no-scrollbar">
              <div className="h-[170px] relative overflow-visible" style={{ background: characterProfileStyles[character?.id || friendProfile.characterId || '']?.background ? undefined : '#f0efed' }}>
                <div className="absolute inset-0" style={{
                  backgroundImage: !profileNpc && characterProfileStyles[character?.id || friendProfile.characterId || '']?.background
                    ? `linear-gradient(180deg, rgba(0,0,0,.04), rgba(0,0,0,.18)), url(${characterProfileStyles[character?.id || friendProfile.characterId || '']?.background})`
                    : 'linear-gradient(135deg, #f1eeeb, #e8e5e1)',
                  backgroundSize: 'cover', backgroundPosition: 'center'
                }} />
                <button onClick={() => setFriendProfile(null)} className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/80 text-[#555] z-10">‹</button>
                {!profileNpc && <button onClick={() => setCharacterProfileStyleOpen(true)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/80 text-[#555] z-10">✦</button>}
                <div className="absolute -bottom-9 left-5 z-20 w-[78px] h-[78px] rounded-full border-4 border-white bg-[#f1f1f2] overflow-hidden grid place-items-center shadow-sm">
                  {profileAvatar ? <img src={profileAvatar} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-[#aaa]">{friendProfile.name[0] || '·'}</span>}
                </div>
              </div>
              <div className="px-5 pt-12 pb-8">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[21px] font-semibold text-[#222]">{friendProfile.name}</div>
                    <div className="text-[10px] text-[#aaa] mt-1">{friendProfile.online ? '● 在线' : '最近没有上线'} · {friendProfile.variantLabel || (profileNpc ? 'NPC' : '默认身份')}</div>
                  </div>
                  {friendProfile.online && <span className="text-[9px] px-2 py-1 rounded-full bg-[#f1f7f2] text-[#719178]">ONLINE</span>}
                </div>

                {profileNpc && (
                  <div className="mt-4 rounded-[22px] border border-[#e4e9f0] bg-[#f7f9fc] p-4 space-y-2">
                    <div className="text-[10px] text-[#7a8aa0]">NPC App 档案 · 绑定 {profileNpc.boundCharacterName || boundForProfileNpc?.name || '角色'}</div>
                    <div className="text-[12px] text-[#555] leading-5 whitespace-pre-wrap">{profileNpc.bio || profileNpc.personality || '暂无简介'}</div>
                    {profileNpc.relationship && <div className="text-[10px] text-[#888]">关系：{profileNpc.relationship}</div>}
                    {profileNpc.statusMessage && <div className="text-[10px] text-[#999]">签名：{profileNpc.statusMessage}</div>}
                  </div>
                )}

                {character && (() => {
                  const profile = generatedCharacterProfiles[character.id] || { followers: 0, following: 0, signature: '', updatedAt: '' };
                  return <div className="mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <button onClick={() => setShowCharacterProfileGenerator(true)} className="flex-1 py-2.5 rounded-xl bg-[#292724] text-white text-[10px] font-medium">✦ 生成主页 / 签名</button>
                      <button onClick={() => setCharacterProfileManageOpen(true)} className="w-10 h-10 rounded-xl border border-[#e5e1df] text-[#555]">☷</button>
                    </div>
                    <div
                      className={`rounded-[22px] border p-4 overflow-hidden ${characterProfileStyles[character.id]?.cardStyle === 'paper' ? 'bg-[#f7f1e7] border-[#e5d8c7]' : characterProfileStyles[character.id]?.cardStyle === 'soft' ? 'bg-[#f8f8fa] border-[#e8e8ed]' : 'bg-white border-[#eee7e4]'}`}
                      style={{
                        color: characterProfileStyles[character.id]?.accent || '#333',
                        borderRadius: characterProfileStyles[character.id]?.radius ?? 22,
                        fontSize: `${(characterProfileStyles[character.id]?.fontScale || 1) * 100}%`,
                        ...(characterProfileStyles[character.id]?.customCss ? { ['--profile-custom' as any]: characterProfileStyles[character.id]?.customCss } : {}),
                      }}
                    >
                      <style>{characterProfileStyles[character.id]?.customCss || ''}</style>
                      <div className="grid grid-cols-3 text-center">
                        <div><div className="text-[15px] font-semibold">{profile.followers}</div><div className="text-[9px] text-[#aaa]">粉丝</div></div>
                        <div><div className="text-[15px] font-semibold">{profile.following}</div><div className="text-[9px] text-[#aaa]">关注</div></div>
                        <div><div className="text-[15px] font-semibold truncate">{profile.profileId || character.id}</div><div className="text-[9px] text-[#aaa]">ID</div></div>
                      </div>
                      <div className="mt-4 text-[19px] font-semibold text-[#222]">{character.name}</div>
                      <div className="mt-2 text-[11px] leading-5 text-[#666] min-h-[22px]">{profile.signature || '还没有个性签名。可以让角色自己生成。'}</div>
                      <button onClick={() => setCharacterMomentsProfile({ characterId: character.id, name: character.name })} className="mt-4 w-full h-10 rounded-xl border border-[#e8e4e3] bg-[#faf9f8] text-[10px] font-medium text-[#555] flex items-center justify-center gap-2">
                        ◎ 查看 {character.name} 的朋友圈
                      </button>
                    </div>
                  </div>;
                })()}
                {character && (
                  <div className="mt-5 border border-[#ededed] rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setFriendSettingsOpen(v => !v)}
                      className="w-full px-4 py-3.5 flex items-center justify-between text-left"
                    >
                      <div>
                        <div className="text-[12px] font-semibold text-[#333]">ABOUT</div>
                        <div className="text-[10px] text-[#aaa] mt-1">角色简介 · 性格 · 场景 · 备注</div>
                      </div>
                      <span className="text-[#aaa]">{friendSettingsOpen ? '⌃' : '⌄'}</span>
                    </button>
                    {friendSettingsOpen && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[#f2f2f2]">
                        {friendEditing && (
                          <label className="block pt-3">
                            <div className="text-[10px] text-[#999] mb-1.5">备注</div>
                            <textarea
                              value={friendProfile.note}
                              onChange={e => setFriendProfile({ ...friendProfile, note: e.target.value })}
                              className="w-full min-h-[62px] bg-[#f8f8f8] rounded-xl p-3 text-xs leading-5 text-[#555] outline-none resize-y"
                              placeholder="给这个联系人留下你的私人备注……"
                            />
                          </label>
                        )}
                        {[
                          ['description', '角色简介', character.description],
                          ['personality', '性格', character?.personality || ''],
                          ['scenario', '当前场景', character?.scenario || ''],
                          ['onlinePersona', '线上人设', character?.onlinePersona || ''],
                          ['typingHabit', '打字习惯', character?.typingHabit || ''],
                        ].map(([key, label, value]) => (
                          <div key={key} className="pt-3">
                            <div className="text-[10px] text-[#999] mb-1.5">{label}</div>
                            {friendEditing ? (
                              <textarea
                                value={String(value || '')}
                                onChange={e => setImportedCharacters(prev => prev.map(item => item.id === character?.id ? { ...item, [key]: e.target.value } : item))}
                                className="w-full min-h-[62px] bg-[#f8f8f8] rounded-xl p-3 text-xs leading-5 text-[#555] outline-none resize-y"
                              />
                            ) : (
                              <div className="text-[11px] leading-5 text-[#555] whitespace-pre-wrap">{String(value || '未填写')}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={() => {
                      if (chat) {
                        setFriendProfile(null);
                        setActiveChatId(chat.id);
                        return;
                      }
                      if (friendProfile.npcId || friendProfile.characterId) {
                        setNewChatRelationship('new-friend');
                        setReaddedReason('deleted');
                        setRelationshipContext('');
                        setOpeningMode('none');
                        setOpeningGreetingIndex(0);
                        setAddCharacterChatFriend(friendProfile);
                      } else {
                        showToast('这是普通联系人，请先保存为聊天联系人');
                      }
                    }}
                    className="h-11 rounded-xl bg-[#292724] text-white text-xs font-semibold"
                  >
                    {chat ? '进入聊天' : '添加聊天'}
                  </button>
                  <button
                    onClick={() => {
                      if (friendEditing) {
                        setFriendsList(prev => prev.map(item =>
                          friendProfile.npcId
                            ? (item.npcId === friendProfile.npcId ? friendProfile : item)
                            : (item.characterId === friendProfile.characterId && !item.npcId ? friendProfile : item)
                        ));
                        showToast('好友备注已保存');
                      }
                      setFriendEditing(v => !v);
                    }}
                    className="h-11 rounded-xl border border-[#e4e4e5] text-xs text-[#444]"
                  >
                    {friendEditing ? '完成编辑' : '备注 / 管理'}
                  </button>
                </div>
                <button
                  onClick={() => {
                    const characterId = friendProfile.characterId;
                    const npcId = friendProfile.npcId;
                    setFriendsList(prev => prev.filter(item =>
                      npcId
                        ? item.npcId !== npcId
                        : characterId
                          ? !(item.characterId === characterId && !item.npcId)
                          : item.name !== friendProfile.name
                    ));
                    setChatItems(prev => prev.map(item =>
                      (npcId
                        ? item.npcId === npcId
                        : characterId
                          ? item.characterId === characterId && !item.npcId
                          : item.name === friendProfile.name)
                        ? { ...item, friendStatus: 'not-friend', preview: item.preview === '聊天暂时无法打开' ? '暂无消息' : item.preview }
                        : item
                    ));
                    setFriendProfile(null);
                    showToast('已删除好友');
                  }}
                  className="w-full h-10 mt-2 rounded-xl border border-[#ead4d4] bg-[#fff8f8] text-[#a15f5f] text-[10px] font-medium"
                >
                  删除好友
                </button>

                <div className="mt-5 border-t border-[#f0f0f1] pt-4">
                  <div className="text-[9px] tracking-[1.5px] text-[#aaa]">RELATIONSHIP</div>
                  <div className="mt-2 text-[13px] text-[#444]">
                    {chat
                      ? (chat.relationship === 'old-friend'
                        ? '旧友 · 已建立聊天关系'
                        : chat.relationship === 'readded'
                          ? `加回好友 · ${({ deleted: '被删除后', blocked: '被拉黑后', 'mutual-delete': '互删后' } as const)[chat.readdedReason || 'deleted']}加回`
                          : '新加好友 · 已建立聊天关系')
                      : (character ? 'AI / 角色联系人 · 尚未建立聊天' : '普通联系人 · 尚未建立聊天')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {characterMomentsProfile && (
        <div className="absolute inset-0 z-[75] bg-white animate-in slide-in-from-right">
          <div className="h-full overflow-y-auto no-scrollbar">
            <div className="h-[64px] px-5 flex items-center border-b border-[#f0f0f1] bg-white sticky top-0 z-20">
              <button onClick={() => setCharacterMomentsProfile(null)} className="w-8 h-8 rounded-full bg-[#f5f5f6] text-[#555]">‹</button>
              <div className="ml-3">
                <div className="text-[14px] font-semibold text-[#222]">{characterMomentsProfile.name}</div>
                <div className="text-[9px] text-[#aaa]">VROOM · 朋友圈</div>
              </div>
            </div>
            <div className="px-5 pt-5 pb-8">
              {(() => {
                const character = importedCharacters.find(c => c.id === characterMomentsProfile.characterId);
                const posts = momentsPosts.filter(p => p.characterId === characterMomentsProfile.characterId || (!p.characterId && p.name === characterMomentsProfile.name));
                const avatar = character?.avatar || '';
                return (
                  <>
                    <div className="flex items-center gap-3 pb-5">
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-[#e8e8e9] bg-[#f1f1f2] grid place-items-center shrink-0">
                        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-sm text-[#aaa]">{characterMomentsProfile.name[0] || '·'}</span>}
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-[#222]">{characterMomentsProfile.name}</div>
                        <div className="text-[9px] text-[#aaa] mt-0.5">TA 的生活动态</div>
                      </div>
                    </div>
                    {posts.length === 0 ? (
                      <div className="py-16 text-center">
                        <div className="text-[12px] text-[#aaa]">还没有朋友圈动态</div>
                        <div className="text-[9px] text-[#c0c0c2] mt-2">角色发布动态后会出现在这里</div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {posts.map(post => {
                          const comments = flattenMomentComments(normalizeMomentComments(post.commentsList));
                          return (
                            <article key={post.id} className="pb-6 border-b border-[#f0f0f1]">
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#f1f1f2] border border-[#e8e8e9] shrink-0 grid place-items-center">
                                  {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-[#aaa]">{post.name?.[0] || '·'}</span>}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[12px] font-semibold text-[#333]">{post.name}</div>
                                  <div className="text-[9px] text-[#aaa] mt-0.5">{post.time}{post.tag ? ' · ' + post.tag : ''}</div>
                                </div>
                              </div>
                              <div className="ml-[50px] mt-2.5 text-[12px] leading-[1.8] text-[#4b4b4d] whitespace-pre-wrap">{post.text}</div>
                              {post.image && <VroomImage src={post.image} alt="" className="ml-[50px] mt-3 max-w-[82%] max-h-[250px] rounded-[13px] object-cover border border-[#eee]" />}
                              {(() => {
                                const meName = (activePersona?.name || currentUser.name || '').trim() || '我';
                                const { list, count } = momentLikerNames(post, meName);
                                const likerLine = formatMomentLikers(list, count);
                                return (
                                  <>
                                    <div className="ml-[50px] mt-3 flex items-center gap-[18px] text-[11px] text-[#999]">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const isLiking = !post.liked;
                                          setMomentsPosts((prev) => prev.map((p) => (p.id === post.id ? toggleMomentLike(p, meName) : p)));
                                          if (isLiking) void tryAutonomousMomentComment(String(post.id));
                                        }}
                                        className={`cursor-pointer ${post.liked ? 'text-[#ae7e89]' : ''}`}
                                      >
                                        {post.liked ? '♥' : '♡'} 赞
                                      </button>
                                      <button type="button" onClick={() => { setCommentReplyTo(null); setCommentingPostId(post.id); setCommentInputText(''); }} className="hover:text-[#ae7e89]">评论</button>
                                    </div>
                                    {count > 0 && likerLine && (
                                      <div className="ml-[50px] mt-2 px-2.5 py-2 rounded-[8px] bg-[#f7f5f4] text-[11px] leading-[1.55] text-[#6a5e58]">
                                        <span className="text-[#ae7e89] mr-1">♥</span>{likerLine}
                                      </div>
                                    )}
                                    {comments.length > 0 && (
                                      <div className="ml-[50px] mt-2.5 bg-[#f8f8f9] rounded-[9px] p-2.5 space-y-1.5 text-[11px]">
                                        {comments.map((comment, index) => (
                                          <div key={comment.id || post.id + '-comment-' + index} className="leading-snug">
                                            <span className="font-semibold text-[#555]">{comment.user || '朋友'}</span>
                                            {comment.replyTo ? <span className="font-semibold text-[#ae7e89]"> 回复 @{comment.replyTo}</span> : null}
                                            <span className="font-semibold text-[#555]">: </span>
                                            <span className="text-[#444]">{comment.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {postDetail && (() => {
        const meName = (activePersona?.name || currentUser.name || '').trim() || '我';
        const live = momentsPosts.find(p => p.id === postDetail.id) || postDetail;
        const { list, count } = momentLikerNames(live, meName);
        const likerLine = formatMomentLikers(list, count);
        const comments = normalizeMomentComments(live.commentsList);
        const totalComments = countMomentComments(comments);

        const openReply = (target: { id: string; user: string } | null) => {
          setCommentReplyTo(target);
          setCommentingPostId(live.id);
          setCommentInputText('');
        };

        const renderReplyTree = (nodes: MomentComment[], depth = 0): ReactNode => (
          <div className={depth === 0 ? 'space-y-2.5' : 'mt-2 ml-0.5 pl-2.5 border-l-2 border-[#ebe7e4] space-y-2'}>
            {nodes.map((c) => (
              <div key={c.id}>
                <div className="leading-snug text-[11px]">
                  <span className="font-semibold text-[#555]">{c.user}</span>
                  {c.replyTo ? <span className="font-semibold text-[#ae7e89]"> 回复 @{c.replyTo}</span> : null}
                  <span className="font-semibold text-[#555]">: </span>
                  <span className="text-[#444]">{c.text}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-[#bbb]">
                  {c.time ? <span>{c.time}</span> : null}
                  <button
                    type="button"
                    className="text-[#999] hover:text-[#ae7e89]"
                    onClick={() => openReply({ id: String(c.id), user: c.user })}
                  >
                    回复
                  </button>
                </div>
                {c.replies && c.replies.length > 0 ? renderReplyTree(c.replies, depth + 1) : null}
              </div>
            ))}
          </div>
        );

        return (
          <div className="absolute inset-0 z-[70] bg-white animate-in slide-in-from-right flex flex-col">
            <div className="h-[64px] px-5 flex items-center border-b border-[#f0f0f1] shrink-0">
              <button onClick={() => setPostDetail(null)} className="w-8 h-8 rounded-full bg-[#f5f5f6] text-[#555]">‹</button>
              <div className="ml-3 text-[14px] font-semibold">VROOM · 动态</div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="p-5 pb-6">
                <div className="flex items-center">
                  <div className="w-11 h-11 rounded-full bg-[#f1f1f2] grid place-items-center overflow-hidden">
                    {resolveMomentAvatar(postDetail) ? (
                      <img src={resolveMomentAvatar(postDetail)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[#aaa]">{postDetail.name?.[0] || '·'}</span>
                    )}
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <div className="text-[13px] font-semibold">{postDetail.name}</div>
                    <div className="text-[9px] text-[#aaa]">{postDetail.time}{postDetail.tag ? ` · ${postDetail.tag}` : ''}</div>
                  </div>
                </div>
                {(() => {
                  const postNpc = allLineNpcs.find(npc => npc.id === postDetail.npcId || (postDetail.npcId == null && npc.name === postDetail.name));
                  if (!postNpc) return null;
                  const alreadyFriend = friendsList.some(friend => friend.npcId === postNpc.id && (!friend.personaId || friend.personaId === effectivePersonaId));
                  if (alreadyFriend) return null;
                  return (
                    <button type="button" onClick={() => { setPostDetail(null); selectNpcAsFriendCandidate(postNpc); }}
                      className="mt-3 w-full h-10 rounded-xl border border-[#e5e5e7] bg-[#fafafa] text-[11px] font-medium text-[#444]">
                      添加好友并开启私聊
                    </button>
                  );
                })()}
                {Array.isArray(postDetail.mentionIds) && postDetail.mentionIds.length > 0 && (
                  <div className="mt-4 text-[12px] text-[#8c5f6b]">
                    {(Array.isArray(postDetail.mentionIds) ? postDetail.mentionIds : [])
                      .map((id: string) => resolveAudienceLabel(id, vroomAudienceFriends, allLineNpcs))
                      .filter(Boolean)
                      .map((n: string) => `@${n}`)
                      .join(' ')}
                  </div>
                )}
                {!!getPostCaption(postDetail) && (
                  <div className="mt-6 text-[14px] leading-8 whitespace-pre-wrap text-[#444]">{getPostCaption(postDetail)}</div>
                )}
                {getPostTextCards(postDetail).map((card, idx) => (
                  <div key={`detail-tc-${idx}`} className="-ml-[59px] mt-5">
                    <TextCardView text={card.text} cardStyle={card.style || textCardStyleId} />
                  </div>
                ))}
                {getPostVideoCard(postDetail) && (
                  <div className="-ml-[59px] mt-5">
                    <VideoCardView
                      text={getPostVideoCard(postDetail)!.text}
                      cardStyle={getPostVideoCard(postDetail)!.style || videoCardStyleId}
                      duration={getPostVideoCard(postDetail)!.duration}
                    />
                  </div>
                )}
                {((postDetail.images?.length ? postDetail.images : (postDetail.image ? [postDetail.image] : [])) as string[]).length > 0 && (
                  <div className="mt-5">
                    <img
                      src={((postDetail.images?.length ? postDetail.images : [postDetail.image]) as string[])[0]}
                      alt=""
                      className="w-full max-h-[360px] aspect-square object-cover rounded-[14px] border border-[#eeeeef]"
                    />
                  </div>
                )}
                {postDetail.visibilityLabel && (
                  <div className="mt-3 text-[9px] text-[#aaa]">◌ {postDetail.visibilityLabel}</div>
                )}

                {/* A：L2 赞 + C1 楼中楼 */}
                <div className="mt-7 pt-4 border-t border-[#f0f0f1]">
                  <div className="flex items-center gap-[18px] text-[11px] text-[#999]">
                    <button
                      type="button"
                      onClick={() => {
                        const isLiking = !live.liked;
                        setMomentsPosts((prev) => prev.map((p) => (p.id === live.id ? toggleMomentLike(p, meName) : p)));
                        if (isLiking) void tryAutonomousMomentComment(String(live.id));
                      }}
                      className={`cursor-pointer ${live.liked ? 'text-[#ae7e89]' : ''}`}
                    >
                      {live.liked ? '♥' : '♡'} 赞
                    </button>
                    <button type="button" onClick={() => openReply(null)} className="hover:text-[#555]">
                      评论
                    </button>
                  </div>
                  {count > 0 && likerLine && (
                    <div className="mt-2 px-2.5 py-2 rounded-[8px] bg-[#f7f5f4] text-[11px] leading-[1.55] text-[#6a5e58]">
                      <span className="text-[#ae7e89] mr-1">♥</span>{likerLine}
                    </div>
                  )}
                  <div className="mt-4 text-[12px] font-semibold text-[#666]">评论 · {totalComments}</div>
                  {comments.length > 0 ? (
                    <div className="mt-2.5 bg-[#f8f8f9] rounded-[10px] p-2.5">
                      {renderReplyTree(comments)}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-[#bbb]">还没有评论，来做第一条吧</div>
                  )}
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-[#f0f0f1] px-3 py-2.5 flex items-center gap-2 bg-white">
              <button
                type="button"
                onClick={() => openReply(null)}
                className="flex-1 text-left bg-[#f6f6f7] rounded-[12px] px-3 py-2.5 text-[12px] text-[#aaa]"
              >
                发送一条友好的评论…
              </button>
              <button
                type="button"
                onClick={() => openReply(null)}
                className="px-3.5 py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-[11px] font-semibold"
              >
                评论
              </button>
            </div>
          </div>
        );
      })()}

      {showMyProfilePage && (
        <div className="absolute inset-0 z-[70] bg-white animate-in slide-in-from-right">
          <div className="h-full overflow-y-auto no-scrollbar">
            {/* 资料卡封面：用账号背景，不是人设 */}
            <div className="h-[190px] relative overflow-hidden" style={{ background: '#efeeec' }}>
              {currentUser.background ? (
                <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.18)), url(${currentUser.background})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              ) : null}
              <button onClick={() => setShowMyProfilePage(false)} className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/90 text-[#555] z-10">‹</button>
              <label title="更换封面背景" className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-white/90 text-[10px] text-[#555] cursor-pointer z-10">
                {tx('换封面', 'カバー変更')}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const bg = String(r.result || ''); const next = { ...currentUser, background: bg }; setCurrentUser(next); localStorage.setItem('line:current-user', JSON.stringify(next)); showToast(tx('封面已更新', 'カバーを更新しました')); }; r.readAsDataURL(f); e.currentTarget.value = ''; }} />
              </label>
            </div>
            {/* 头像：点头像直接换（账号头像） */}
            <div className="px-5 -mt-9 relative z-10 flex items-end gap-3">
              <label title="点头像换一张" className="w-[76px] h-[76px] rounded-full border-[3px] border-white bg-[#f1f1f2] overflow-hidden shadow grid place-items-center shrink-0 cursor-pointer active:scale-95">
                {currentUser.avatar ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl text-[#aaa]">{currentUser.name?.[0] || '·'}</span>}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const av = String(r.result || ''); const next = { ...currentUser, avatar: av }; setCurrentUser(next); localStorage.setItem('line:current-user', JSON.stringify(next)); showToast(tx('头像已更新', 'アイコンを更新しました')); }; r.readAsDataURL(f); e.currentTarget.value = ''; }} />
              </label>
            </div>
            <div className="px-5 pt-4 pb-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[22px] font-semibold text-[#222]">{currentUser.name || '未设置昵称'}</div>
                  <div className="text-[10px] text-[#aaa] mt-1">{currentUser.id ? '@' + currentUser.id.replace(/^@/, '') : '尚未设置账号 ID'}</div>
                </div>
                <button onClick={() => { setProfileDraft(currentUser); setShowProfileEditor(true); }} className="px-3 py-1.5 rounded-full bg-[#202124] text-white text-[10px]">{tx('编辑资料', 'プロフィール編集')}</button>
              </div>
              <div className="mt-5">
                <div className="text-[9px] tracking-[1.5px] text-[#aaa] uppercase">{tx('个性签名', 'ひとこと')}</div>
                <div className="mt-2 text-[12px] leading-6 text-[#555] min-h-[24px]">{currentUser.desc.trim() || tx('还没有个性签名', 'まだひとことがありません')}</div>
              </div>
              <div className="mt-7 pt-5 border-t border-[#f0f0f1]">
                <div className="text-[9px] tracking-[1.5px] text-[#aaa]">MY VROOM · {activePersona?.name || currentUser.name || ''}</div>
                <div className="mt-3 space-y-3">
                  {myMoments.slice(0, 5).map((p: any) => (
                    <button key={p.id} onClick={() => setPostDetail(p)} className="w-full text-left rounded-2xl border border-[#eeeeef] p-3 hover:bg-[#fafafa]">
                      <div className="text-[10px] text-[#aaa]">{p.time}{p.tag ? ` · ${p.tag}` : ''}</div>
                      <div className="mt-1 text-xs text-[#444] line-clamp-3">{p.text || (getPostTextCards(p).length ? '[文字图片]' : getPostVideoCard(p) ? '[文字视频]' : p.image || p.images?.length ? '[图片动态]' : '')}</div>
                    </button>
                  ))}
                  {myMoments.length === 0 && <div className="text-xs text-[#aaa]">{tx('还没有发布过动态。', 'まだ投稿がありません。')}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfileEditor && (
        <div
          className="absolute inset-0 z-60 bg-black/25 flex items-end"
          onClick={() => setShowProfileEditor(false)}
        >
          <div
            className="w-full rounded-t-[26px] bg-white p-5 pb-7 space-y-3 animate-in slide-in-from-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[8px] font-mono tracking-[1.5px] text-[#aaa]">MY PROFILE · PRIVATE</div>
                <div className="mt-1 font-semibold text-[15px] text-[#222]">编辑我的个人主页</div>
              </div>
              <button onClick={() => setShowProfileEditor(false)} className="text-xl text-[#aaa]">×</button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="text-[10px] text-[#888]">昵称</label>
                <input
                  value={profileDraft.name}
                  onChange={e => setProfileDraft({ ...profileDraft, name: e.target.value })}
                  placeholder="你的名字"
                  className="w-full mt-1 h-10 rounded-xl bg-[#f7f7f8] px-3 text-xs outline-none"
                />
              </div>
              <label className="w-10 h-10 rounded-xl bg-[#f1f1f2] border border-[#e5e5e6] grid place-items-center cursor-pointer overflow-hidden">
                {profileDraft.avatar ? <img src={profileDraft.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-[#999]">头像</span>}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setProfileDraft(prev => ({ ...prev, avatar: String(reader.result || '') }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>

            <div>
              <label className="text-[10px] text-[#888]">账号 ID</label>
              <input
                value={profileDraft.id}
                onChange={e => setProfileDraft({ ...profileDraft, id: e.target.value })}
                placeholder="例如：my_private_id"
                className="w-full mt-1 h-10 rounded-xl bg-[#f7f7f8] px-3 text-xs outline-none"
              />
            </div>

            <label className="block p-3 rounded-xl bg-[#fafafa] border border-dashed border-[#ddd] text-xs cursor-pointer">
              <div className="font-medium">主页背景图</div><div className="text-[9px] text-[#aaa] mt-1">上传图片后会作为你的个人主页背景</div>
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f) readImageFile(f, data => setProfileDraft(prev => ({...prev,background:data}))); }} />
            </label>
            <div>
              <label className="text-[10px] text-[#888]">个人简介</label>
              <textarea
                value={profileDraft.desc}
                onChange={e => setProfileDraft({ ...profileDraft, desc: e.target.value })}
                placeholder="写一句只属于你的简介……"
                rows={3}
                className="w-full mt-1 rounded-xl bg-[#f7f7f8] px-3 py-2.5 text-xs outline-none resize-none"
              />
            </div>

            <button
              onClick={() => {
                const next = {
                  ...profileDraft,
                  name: profileDraft.name.trim(),
                  id: profileDraft.id.trim().replace(/^@/, ''),
                  desc: profileDraft.desc.trim(),
                };
                setCurrentUser(next);
                localStorage.setItem('line:current-user', JSON.stringify(next));
                window.dispatchEvent(new CustomEvent('sane333:user-profile-changed'));
                setShowProfileEditor(false);
                showToast('个人主页已保存');
              }}
              className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[11px] font-semibold"
            >
              保存个人主页
            </button>
          </div>
        </div>
      )}

      {showCreateMaskDrawer && (
        <div
          onClick={() => setShowCreateMaskDrawer(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sm text-[#222]">创建新面具身份</span>
              <button onClick={() => setShowCreateMaskDrawer(false)} className="text-xl text-[#aaa]">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-[#666]">身份昵称</span>
                <input
                  type="text"
                  placeholder="例如：苏念、林夏..."
                  value={newMaskName}
                  onChange={(e) => setNewMaskName(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
                />
              </div>
              <div>
                <span className="text-[11px] text-[#666]">个性签名 / 身份描述</span>
                <input
                  type="text"
                  placeholder="例如：东京 · 摄影师"
                  value={newMaskDesc}
                  onChange={(e) => setNewMaskDesc(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none"
                />
              </div>
            </div>
            <button
              onClick={() => {
                if (!newMaskName.trim()) {
                  showToast('请输入身份姓名');
                  return;
                }
                const newMask = {
                  name: newMaskName.trim(),
                  id: `mask_${Date.now()}`,
                  desc: newMaskDesc.trim() || '自定义新身份',
                };
                setMasks((prev) => [...prev, newMask]);
                setCurrentUser(newMask);
                setNewMaskName('');
                setNewMaskDesc('');
                setShowCreateMaskDrawer(false);
                showToast(`已创建并切换为 ${newMask.name}`);
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
            >
              完成创建
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 2: CREATE GROUP (创建群聊抽屉)
      ===================================================== */}
      {showGroupModal && (
        <div
          onClick={closeGroupModal}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom max-h-[88%] flex flex-col"
          >
            <div className="flex justify-between items-center shrink-0">
              <div>
                <div className="text-[16px] font-semibold text-[#202124]">创建新群聊</div>
                <div className="text-[10px] text-[#aaa]">可勾选好友，或从 NPC App 按角色折叠直选</div>
              </div>
              <button onClick={closeGroupModal} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="shrink-0">
              <span className="text-[11px] text-[#666]">群聊名称</span>
              <input
                type="text"
                placeholder="给群聊起个好听的名字…"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full mt-1 p-2.5 bg-[#f6f6f7] rounded-[10px] text-xs outline-none text-[#333]"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
              <div>
                <span className="text-[11px] text-[#666]">好友（含已添加的 NPC）</span>
                <div className="mt-2 divide-y divide-[#f2f2f4] text-xs rounded-xl border border-[#ededee] overflow-hidden">
                  {visibleFriends.map((friend, i) => {
                    const selectKey = friend.npcId || friend.characterId || friend.name;
                    const isSelected = selectedGroupFriends.includes(selectKey);
                    return (
                      <div
                        key={friend.npcId || friend.characterId || friend.name + '-' + i}
                        onClick={() => {
                          setSelectedGroupFriends((prev) =>
                            prev.includes(selectKey)
                              ? prev.filter((n) => n !== selectKey)
                              : [...prev, selectKey]
                          );
                          // 与 NPC App 区去重：好友里勾选 NPC 时同步 / 取消同步 selectedGroupNpcIds
                          if (friend.npcId) {
                            setSelectedGroupNpcIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== friend.npcId)
                                : prev.includes(friend.npcId!) ? prev : [...prev, friend.npcId!]
                            );
                          }
                        }}
                        className="py-2.5 px-3 flex items-center justify-between cursor-pointer hover:bg-[#fafafa]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#f1f1f2] overflow-hidden flex items-center justify-center text-[10px] text-[#888] shrink-0">
                            {resolveFriendAvatar(friend)
                              ? <img src={resolveFriendAvatar(friend)} alt="" className="w-full h-full object-cover" />
                              : friend.name[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-[#333] truncate">{friend.name}</div>
                            {friend.npcId && <div className="text-[9px] text-[#aaa] truncate">{friend.note}</div>}
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-[#ae7e89] border-[#ae7e89] text-white text-[9px]' : 'border-[#ccc]'
                        }`}>
                          {isSelected && '✓'}
                        </div>
                      </div>
                    );
                  })}
                  {!visibleFriends.length && (
                    <div className="py-4 text-center text-[10px] text-[#aaa]">当前没有可勾选的好友</div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666]">NPC App · 按角色折叠</span>
                  <span className="text-[9px] text-[#aaa]">
                    {hasBounds
                      ? `仅「${activePersonaForFilter?.name || '当前人设'}」已连接角色`
                      : '未连接人设 · 显示全部已绑定 NPC'}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {creatableNpcGroups.map(group => {
                    const expanded = groupModalExpandedChars.includes(group.characterId);
                    const selectedInGroup = group.npcs.filter(npc => selectedGroupNpcIds.includes(npc.id)).length;
                    return (
                      <div key={group.characterId} className="rounded-xl border border-[#ededee] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setGroupModalExpandedChars(prev =>
                            prev.includes(group.characterId)
                              ? prev.filter(id => id !== group.characterId)
                              : [...prev, group.characterId]
                          )}
                          className="w-full flex items-center gap-3 p-3 text-left bg-[#faf9fa]"
                        >
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0 grid place-items-center">
                            {group.avatar
                              ? <img src={group.avatar} alt="" className="w-full h-full object-cover" />
                              : <span className="text-[10px] text-[#aaa]">{group.characterName.slice(0, 1)}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-[#333] truncate">{group.characterName}</div>
                            <div className="text-[9px] text-[#aaa]">
                              {group.npcs.length} 位相关 NPC{selectedInGroup ? ` · 已选 ${selectedInGroup}` : ''}
                            </div>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-[#ccc] shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                        {expanded && group.npcs.map(npc => {
                          const checked = selectedGroupNpcIds.includes(npc.id);
                          const av = npc.avatar || group.avatar;
                          const friendKey = npc.id;
                          return (
                            <button
                              key={npc.id}
                              type="button"
                              onClick={() => {
                                setSelectedGroupNpcIds(prev =>
                                  checked ? prev.filter(id => id !== npc.id) : [...prev, npc.id]
                                );
                                // 若已是好友，同步好友勾选状态
                                const asFriend = visibleFriends.some(f => f.npcId === npc.id);
                                if (asFriend) {
                                  setSelectedGroupFriends(prev =>
                                    checked
                                      ? prev.filter(k => k !== friendKey)
                                      : prev.includes(friendKey) ? prev : [...prev, friendKey]
                                  );
                                }
                              }}
                              className="w-full flex items-center gap-3 pl-6 pr-3 py-2.5 text-left border-t border-[#f2f2f3] active:bg-[#f5f0f2]"
                            >
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-[#ae7e89] border-[#ae7e89] text-white text-[9px]' : 'border-[#ccc]'
                              }`}>
                                {checked ? '✓' : null}
                              </div>
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-[#f0f3f8] shrink-0 grid place-items-center">
                                {av
                                  ? <img src={av} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-[10px] text-[#7a8aa0]">{npc.name.slice(0, 1)}</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium text-[#333] truncate">{npc.name}</div>
                                <div className="text-[9px] text-[#aaa] truncate">
                                  NPC{npc.relationship ? ` · ${npc.relationship}` : ''}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!creatableNpcGroups.length && (
                    <div className="py-4 text-center text-[10px] text-[#aaa] rounded-xl border border-dashed border-[#e8e8e9]">
                      {hasBounds
                        ? '当前人设连接的角色下暂无 NPC。请先在 NPC App 生成。'
                        : 'NPC App 暂无可选人物，请先创建并绑定角色。'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                const groupTitle = newGroupName.trim() || '我们的新群聊';
                const selectedFriends = visibleFriends.filter(friend =>
                  selectedGroupFriends.includes(friend.npcId || friend.characterId || friend.name)
                );
                // NPC App 直选：合并好友区已勾 NPC，按 id 去重
                const friendNpcIds = new Set(
                  selectedFriends.filter(f => f.npcId).map(f => f.npcId as string)
                );
                const directNpcs = creatableNpcsForPersona.filter(npc =>
                  selectedGroupNpcIds.includes(npc.id) && !friendNpcIds.has(npc.id)
                );
                const memberNames = [
                  ...selectedFriends.map(friend => friend.name),
                  ...directNpcs.map(npc => npc.name),
                ];
                if (!memberNames.length) {
                  showToast('请至少选择一位好友或 NPC');
                  return;
                }
                const npcMembersFromFriends = Object.fromEntries(
                  selectedFriends
                    .filter(friend => friend.npcId)
                    .map(friend => [friend.name, {
                      npcId: friend.npcId as string,
                      boundCharacterId: friend.characterId,
                      avatar: resolveFriendAvatar(friend),
                    }])
                );
                const npcMembersFromApp = Object.fromEntries(
                  directNpcs.map(npc => {
                    const bound = importedCharacters.find(c => c.id === npc.boundCharacterId);
                    const gAvatar = npc.avatar || (bound ? bound.avatar : '') || '';
                    return [npc.name, {
                      npcId: npc.id,
                      boundCharacterId: npc.boundCharacterId,
                      avatar: gAvatar,
                    }];
                  })
                );
                const group = createLineGroup({
                  name: groupTitle,
                  ownerId: currentUser.id,
                  ownerName: currentUser.name,
                  memberNames,
                  characterIds: Object.fromEntries(
                    selectedFriends
                      .filter(friend => !friend.npcId && friend.characterId)
                      .map(friend => [friend.name, friend.characterId as string])
                  ),
                  npcMembers: { ...npcMembersFromFriends, ...npcMembersFromApp },
                  announcement: '',
                });
                const newChat = {
                  id: group.id,
                  name: group.name,
                  time: '刚刚',
                  preview: `${currentUser.name} 创建了群聊`,
                  unread: 0,
                  isPinned: false,
                  isMuted: false,
                  draft: '',
                  isGroup: true,
                  groupId: group.id,
                  personaId: effectivePersonaId || undefined,
                };
                setChatItems((prev) => [newChat, ...prev]);
                closeGroupModal();
                showToast(`已创建群聊「${groupTitle}」`);
              }}
              className="w-full shrink-0 py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
            >
              {(() => {
                const friendCount = selectedGroupFriends.length;
                const extraNpcCount = selectedGroupNpcIds.filter(id =>
                  !visibleFriends.some(f => f.npcId === id && selectedGroupFriends.includes(f.npcId || f.characterId || f.name))
                ).length;
                const total = friendCount + extraNpcCount;
                return total > 0 ? `完成并进入群聊 · ${total} 人` : '完成并进入群聊';
              })()}
            </button>
          </div>
        </div>
      )}

      {showFriendModal && (
        <div onClick={() => { setShowFriendModal(false); setFriendModalExpandedChars([]); }} className="absolute inset-0 bg-black/25 z-[79] flex items-end animate-in fade-in">
          <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[26px] p-5 pb-8 space-y-4 max-h-[82%] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div><div className="text-[8px] tracking-[1.8px] font-mono text-[#aaa]">ADD FRIEND</div><div className="mt-1 text-[18px] font-semibold text-[#202124]">添加好友</div></div>
              <button onClick={() => { setShowFriendModal(false); setFriendModalExpandedChars([]); }} className="text-xl text-[#aaa]">×</button>
            </div>
            <div className="h-[40px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5">
              <Search className="w-4 h-4 text-[#aaa] mr-2" />
              <input value={friendSearchQuery} onChange={e => setFriendSearchQuery(e.target.value)} placeholder="搜索角色 / NPC 名字" className="w-full bg-transparent outline-none text-xs text-[#555]" />
            </div>
            {(() => {
              const q = friendSearchQuery.trim().toLowerCase();
              const available = importedCharacters.filter(ch =>
                !hasBounds || boundSet.has(ch.id)
              ).filter(ch => !friendsList.some(f => !f.npcId && f.characterId === ch.id));
              const matches = q ? available.filter(ch => ch.name.toLowerCase().includes(q)) : available;
              return (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-[10px] text-[#888]">{q ? `角色搜索 · ${matches.length}` : '你可能认识的人 · 角色卡'}</div>
                    {matches.map(ch => (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setAddCharacterChatFriend({ name: ch.name, characterId: ch.id, kind: 'character', note: '角色卡联系人', online: true, pinyin: ch.name[0] || '' });
                          setShowFriendModal(false);
                          setOpeningMode('none');
                          setOpeningGreetingIndex(0);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#ededee] text-left"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0">
                          {ch.avatar ? <img src={ch.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-[10px] text-[#aaa]">{ch.name.slice(0, 1)}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-[#333]">{ch.name || '未命名角色'}</div>
                          <div className="text-[9px] text-[#aaa]">{ch.variantLabel || '角色卡'}</div>
                        </div>
                        <span className="text-[9px] text-[#ae7e89]">选择</span>
                      </button>
                    ))}
                    {!matches.length && (
                      <div className="py-4 text-center text-[10px] text-[#aaa]">
                        {q ? '没有找到符合名字的角色。' : hasBounds ? '当前人设绑定的角色都已经是好友。' : '所有角色都已经是好友。'}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] text-[#888]">
                      {q ? `NPC 搜索 · ${addableNpcsForPersona.length}` : 'NPC App · 按角色折叠'}
                      {hasBounds ? ` · 仅「${activePersonaForFilter?.name || '当前人设'}」已连接角色` : ''}
                    </div>
                    {addableNpcGroups.map(group => {
                      const expanded = friendModalExpandedChars.includes(group.characterId) || Boolean(q);
                      return (
                        <div key={group.characterId} className="rounded-xl border border-[#ededee] overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setFriendModalExpandedChars(prev =>
                              prev.includes(group.characterId) ? prev.filter(id => id !== group.characterId) : [...prev, group.characterId]
                            )}
                            className="w-full flex items-center gap-3 p-3 text-left bg-[#faf9fa]"
                          >
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0 grid place-items-center">
                              {group.avatar ? <img src={group.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-[#aaa]">{group.characterName.slice(0, 1)}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-medium text-[#333] truncate">{group.characterName}</div>
                              <div className="text-[9px] text-[#aaa]">{group.npcs.length} 位相关 NPC</div>
                            </div>
                            <ChevronRight className={`w-4 h-4 text-[#ccc] shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          </button>
                          {expanded && group.npcs.map(npc => (
                            <button
                              key={npc.id}
                              type="button"
                              onClick={() => selectNpcAsFriendCandidate(npc)}
                              className="w-full flex items-center gap-3 pl-6 pr-3 py-2.5 text-left border-t border-[#f2f2f3]"
                            >
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#f0f3f8] shrink-0 grid place-items-center">
                                {(npc.avatar || group.avatar)
                                  ? <img src={npc.avatar || group.avatar} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-[10px] text-[#7a8aa0]">{npc.name.slice(0, 1)}</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium text-[#333] truncate">{npc.name}</div>
                                <div className="text-[9px] text-[#aaa] truncate">NPC{npc.relationship ? ` · ${npc.relationship}` : ''}</div>
                              </div>
                              <span className="text-[9px] text-[#ae7e89]">选择</span>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {!addableNpcGroups.length && (
                      <div className="py-4 text-center text-[10px] text-[#aaa]">
                        {hasBounds
                          ? '当前人设连接的角色下暂无可添加 NPC。请先在 NPC App 生成。'
                          : 'NPC App 暂无可添加人物，或都已经是好友。'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {showNpcRequests && (() => {
        const pendingRequests = getNpcFriendRequests().filter(request => request.status === 'pending' && Boolean(effectivePersonaId) && request.personaId === effectivePersonaId);
        return (
          <div onClick={() => setShowNpcRequests(false)} className="absolute inset-0 bg-black/25 z-[90] flex items-end">
            <div onClick={event => event.stopPropagation()} className="w-full max-h-[78%] overflow-y-auto rounded-t-[26px] bg-white p-5 pb-8 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] tracking-[1.8px] font-mono text-[#aaa]">NPC FRIEND REQUESTS</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#202124]">好友申请</div>
                  <div className="mt-1 text-[10px] text-[#999]">NPC 会根据相处经历决定是否想认识你；是否成为好友由你决定。</div>
                </div>
                <button onClick={() => setShowNpcRequests(false)} className="text-xl text-[#aaa]">×</button>
              </div>
              {pendingRequests.length ? pendingRequests.map(request => {
                const npc = getNpcs().find(item => item.id === request.npcId);
                if (!npc) return null;
                const bound = importedCharacters.find(item => item.id === npc.boundCharacterId);
                return (
                  <div key={request.id} className="rounded-2xl border border-[#ececef] p-3.5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-[#f3f4f6] shrink-0 grid place-items-center">
                        {(npc.avatar || bound?.avatar) ? <img src={npc.avatar || bound?.avatar || ''} alt="" className="w-full h-full object-cover" /> : <span>{npc.name.slice(0, 1)}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[#222]">{npc.name}</div>
                        <div className="text-[10px] text-[#888]">{request.sourceLabel} · 想添加你</div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#f7f7f8] p-3 text-[11px] leading-5 text-[#555]">{request.message || '想认识你多一点。'}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { respondToNpcFriendRequest(request.id, 'declined'); setNpcRequestRevision(value => value + 1); }} className="h-10 rounded-xl border border-[#e6e6e8] text-[11px] text-[#666]">暂时不接受</button>
                      <button onClick={() => {
                        respondToNpcFriendRequest(request.id, 'accepted');
                        setNpcFriendship(npc.id, request.personaId, true);
                        const friend: LineFriend = {
                          name: npc.name, characterId: npc.boundCharacterId, npcId: npc.id, personaId: request.personaId, kind: 'npc',
                          note: 'NPC · 绑定 ' + (npc.boundCharacterName || bound?.name || '角色'),
                          variantLabel: npc.boundCharacterName || 'NPC', online: true, pinyin: npc.name[0] || '',
                          relationship: 'new-friend',
                        };
                        setFriendsList(previous => previous.some(item => item.npcId === npc.id && item.personaId === request.personaId) ? previous : [friend, ...previous]);
                        setChatItems(previous => previous.some(chat => chat.npcId === npc.id && chat.personaId === request.personaId) ? previous : [{
                          id: 'c_' + Date.now(), name: npc.name, characterId: npc.boundCharacterId, npcId: npc.id,
                          personaId: request.personaId, time: '刚刚', preview: '你们已经成为好友，打个招呼吧',
                          unread: 0, isPinned: false, isMuted: false, draft: '', isGroup: false,
                          relationshipContext: request.sourceLabel, openingMode: 'none',
                          relationship: 'new-friend', variantLabel: npc.boundCharacterName || 'NPC',
                        }, ...previous]);
                        setNpcRequestRevision(value => value + 1);
                        showToast('已接受 ' + npc.name + ' 的好友申请');
                      }} className="h-10 rounded-xl bg-[#292724] text-white text-[11px]">接受并成为好友</button>
                    </div>
                  </div>
                );
              }) : <div className="py-10 text-center text-[11px] text-[#999]">目前没有待处理的 NPC 好友申请。</div>}
            </div>
          </div>
        );
      })()}

      {addCharacterChatFriend && (() => {
        const isNpcFriend = Boolean(addCharacterChatFriend.npcId);
        const npcFriend = isNpcFriend ? allLineNpcs.find(item => item.id === addCharacterChatFriend.npcId) : null;
        const character = (!isNpcFriend && addCharacterChatFriend.characterId)
          ? importedCharacters.find(item => item.id === addCharacterChatFriend.characterId)
          : null;
        const boundForNpc = npcFriend
          ? importedCharacters.find(item => item.id === npcFriend.boundCharacterId)
          : null;
        const greetings = character ? [character.firstMessage, ...character.alternateGreetings].filter(Boolean) : [];

        if (isNpcFriend && npcFriend) {
          const avatar = npcFriend.avatar || (boundForNpc ? boundForNpc.avatar : '') || '';
          return (
            <div onClick={() => setAddCharacterChatFriend(null)} className="absolute inset-0 bg-black/25 z-[80] flex items-end animate-in fade-in">
              <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[26px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom max-h-[88%] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[8px] tracking-[1.8px] font-mono text-[#aaa]">ADD NPC</div>
                    <div className="mt-1 text-[18px] font-semibold text-[#202124]">添加 NPC 好友</div>
                    <div className="mt-1 text-[10px] text-[#999]">来自 NPC App · 绑定 {npcFriend.boundCharacterName || boundForNpc?.name || '角色'}</div>
                  </div>
                  <button onClick={() => setAddCharacterChatFriend(null)} className="text-xl text-[#aaa]">×</button>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#f7f7f8] border border-[#ededee]">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-[#f0f3f8] shrink-0 grid place-items-center">
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-sm text-[#7a8aa0]">{npcFriend.name.slice(0, 1)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-[#222]">{npcFriend.name}</div>
                    <div className="text-[10px] text-[#888] mt-1 truncate">{npcFriend.identity || 'NPC'}{npcFriend.relationship ? ` · ${npcFriend.relationship}` : ''}</div>
                    <div className="text-[9px] text-[#aaa] mt-1 line-clamp-2">{npcFriend.bio || npcFriend.personality || '来自 NPC App 的关联人物'}</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#f7f7f8] p-3.5 space-y-2">
                  <div className="text-[10px] text-[#888]">你们的关系</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([['new-friend', '新朋友'], ['old-friend', '老朋友'], ['readded', '重新加回']] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setNewChatRelationship(id)}
                        className={`py-2 rounded-xl text-[10px] border ${newChatRelationship === id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white text-[#666] border-[#e8e8e9]'}`}>{label}</button>
                    ))}
                  </div>
                  <textarea value={relationshipContext} onChange={e => setRelationshipContext(e.target.value)}
                    placeholder="例如：TA 是程凛的发小，我们在聚会上认识。"
                    className="w-full h-16 p-2.5 rounded-xl bg-white border border-[#e8e8e9] outline-none resize-none text-[10px] text-[#555]" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const friend: LineFriend = {
                      name: npcFriend.name,
                      characterId: npcFriend.boundCharacterId,
                      npcId: npcFriend.id,
                      personaId: effectivePersonaId || undefined,
                      kind: 'npc',
                      note: 'NPC · 绑定 ' + (npcFriend.boundCharacterName || boundForNpc?.name || '角色'),
                      variantLabel: npcFriend.boundCharacterName || 'NPC',
                      online: true,
                      pinyin: npcFriend.name[0] || '',
                      relationship: newChatRelationship,
                    };
                    const context = relationshipContext.trim();
                    if (effectivePersonaId) setNpcFriendship(npcFriend.id, effectivePersonaId, true);
                    setFriendsList(prev => prev.some(item => item.npcId === npcFriend.id && item.personaId === effectivePersonaId) ? prev : [friend, ...prev]);
                    setChatItems(prev => {
                      if (prev.some(chat => chat.npcId === npcFriend.id && chat.personaId === effectivePersonaId)) return prev;
                      return [{
                        id: `c_${Date.now()}`,
                        name: npcFriend.name,
                        characterId: npcFriend.boundCharacterId,
                        npcId: npcFriend.id,
                        personaId: effectivePersonaId || undefined,
                        time: '刚刚',
                        preview: '打个招呼吧',
                        unread: 0,
                        isPinned: false,
                        isMuted: false,
                        draft: '',
                        isGroup: false,
                        relationshipContext: context,
                        openingMode: 'none',
                        relationship: newChatRelationship,
                        variantLabel: friend.variantLabel,
                      }, ...prev];
                    });
                    setAddCharacterChatFriend(null);
                    setFriendSearchQuery('');
                    showToast(`已添加 NPC「${npcFriend.name}」并建立聊天`);
                  }}
                  className="w-full py-3 rounded-2xl bg-[#292724] text-white text-xs font-semibold"
                >
                  添加为好友并进入聊天
                </button>
              </div>
            </div>
          );
        }

        return (
          <div onClick={() => setAddCharacterChatFriend(null)} className="absolute inset-0 bg-black/25 z-[80] flex items-end animate-in fade-in">
            <div onClick={e => e.stopPropagation()} className="w-full bg-white rounded-t-[26px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom max-h-[88%] overflow-y-auto">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[8px] tracking-[1.8px] font-mono text-[#aaa]">ADD FRIEND</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#202124]">添加好友</div>
                  <div className="mt-1 text-[10px] text-[#999]">可添加角色卡，或从 NPC App 添加已连接角色下的人物。</div>
                </div>
                <button onClick={() => setAddCharacterChatFriend(null)} className="text-xl text-[#aaa]">×</button>
              </div>

              <div className="h-[40px] bg-[#f6f6f7] rounded-[11px] flex items-center px-3.5">
                <Search className="w-4 h-4 text-[#aaa] mr-2" />
                <input value={friendSearchQuery} onChange={e => setFriendSearchQuery(e.target.value)} placeholder="搜索角色名字" className="w-full bg-transparent outline-none text-xs text-[#555]" />
              </div>

              {friendSearchQuery.trim() ? (() => {
                const q = friendSearchQuery.trim().toLowerCase();
                const matches = importedCharacters.filter(ch => ch.name.toLowerCase().includes(q) && !friendsList.some(friend => friend.characterId === ch.id));
                return matches.length ? (
                  <div className="space-y-2">
                    <div className="text-[10px] text-[#888]">搜索结果 · {matches.length}</div>
                    {matches.map(ch => (
                      <button key={ch.id} onClick={() => {
                        const friend: LineFriend = { name: ch.name, characterId: ch.id, note: '角色卡联系人', online: true, pinyin: ch.name[0] || '' };
                        setFriendsList(prev => [friend, ...prev]);
                        setFriendSearchQuery('');
                        setAddCharacterChatFriend(null);
                        showToast(`已添加「${ch.name}」为好友`);
                      }} className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#ededee] text-left">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0">{ch.avatar ? <img src={ch.avatar} alt={ch.name} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-[10px] text-[#aaa]">{ch.name.slice(0,1) || '?'}</div>}</div>
                        <div className="flex-1 min-w-0"><div className="text-[12px] font-medium text-[#333]">{ch.name}</div><div className="text-[9px] text-[#aaa]">{ch.variantLabel || '角色卡'}</div></div>
                        <span className="text-[9px] text-[#ae7e89]">匹配 · 添加</span>
                      </button>
                    ))}
                  </div>
                ) : <div className="py-5 text-center text-[10px] text-[#aaa]">没有找到符合名字的角色。</div>;
              })() : (
                <div className="rounded-2xl bg-[#f7f7f8] p-3.5 space-y-2.5">
                  <div className="text-[10px] text-[#888]">你可能认识的人</div>
                  {importedCharacters.filter(ch => !friendsList.some(friend => friend.characterId === ch.id)).map(ch => (
                    <button key={ch.id} onClick={() => {
                      const friend: LineFriend = { name: ch.name, characterId: ch.id, note: '角色卡联系人', online: true, pinyin: ch.name[0] || '' };
                      setFriendsList(prev => [friend, ...prev]);
                      setAddCharacterChatFriend(null);
                      showToast(`已添加「${ch.name}」为好友`);
                    }} className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#ededee] text-left">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-[#f1f1f2] shrink-0">{ch.avatar ? <img src={ch.avatar} alt={ch.name} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-[10px] text-[#aaa]">{ch.name.slice(0,1) || '?'}</div>}</div>
                      <div className="flex-1 min-w-0"><div className="text-[12px] font-medium text-[#333]">{ch.name || '未命名角色'}</div><div className="text-[9px] text-[#aaa]">{ch.variantLabel || '角色卡'}</div></div>
                      <span className="text-[9px] text-[#ae7e89]">添加</span>
                    </button>
                  ))}
                  {!importedCharacters.some(ch => !friendsList.some(friend => friend.characterId === ch.id)) && <div className="py-4 text-center text-[10px] text-[#aaa]">所有角色都已经是好友。</div>}
                </div>
              )}

              {character && greetings.length > 0 && (
                <div className="rounded-2xl bg-[#f7f7f8] p-3.5 space-y-2.5">
                  <div>
                    <div className="text-[10px] text-[#888]">角色开场白</div>
                    <div className="mt-1 text-[9px] text-[#aaa]">有几个开场白，就显示几个选择；太多时自动折叠。</div>
                  </div>
                  <div className="space-y-1.5">
                    {greetings.map((greeting, index) => (
                      <details key={index} className={`rounded-xl border ${openingMode === 'context' && openingGreetingIndex === index ? 'border-[#292724] bg-[#292724] text-white' : 'border-[#e3e3e4] bg-white text-[#666]'}`}>
                        <summary className="px-3 py-2.5 text-[9px] cursor-pointer list-none flex items-center justify-between">
                          <span className="font-semibold">开场白 {index + 1}</span>
                          <span className="text-[8px] opacity-50">展开 / 收起</span>
                        </summary>
                        <div className="px-3 pb-3">
                          <div className="text-[9px] leading-relaxed whitespace-pre-wrap opacity-80">{greeting}</div>
                          <button onClick={() => { setOpeningMode('context'); setOpeningGreetingIndex(index); }} className={`mt-2 w-full py-2 rounded-lg text-[9px] ${openingMode === 'context' && openingGreetingIndex === index ? 'bg-white text-[#292724]' : 'bg-[#292724] text-white'}`}>
                            {openingMode === 'context' && openingGreetingIndex === index ? '已选择这个开场白' : '选择这个开场白'}
                          </button>
                        </div>
                      </details>
                    ))}
                    <button onClick={() => setOpeningMode('none')} className={`w-full text-left px-3 py-2 rounded-xl border text-[9px] ${openingMode === 'none' ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white border-[#e3e3e4] text-[#666]'}`}>不选择开场白</button>
                  </div>
                </div>
              )}

              {character && (
                <div className="rounded-2xl bg-[#f7f7f8] p-3.5 space-y-3">
                  <div className="text-[10px] text-[#888]">你们的关系</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      ['new-friend', '新朋友'],
                      ['old-friend', '老朋友'],
                      ['readded', '重新加回'],
                    ].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setNewChatRelationship(id as any)}
                        className={`py-2 rounded-xl border text-[10px] ${newChatRelationship === id ? 'bg-[#292724] text-white border-[#292724]' : 'bg-white border-[#e3e3e4] text-[#666]'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {newChatRelationship === 'readded' && (
                    <div>
                      <div className="text-[9px] text-[#aaa] mb-1">重新联系的原因</div>
                      <select value={readdedReason} onChange={e => setReaddedReason(e.target.value as any)}
                        className="w-full p-2 rounded-xl bg-white border border-[#e8e8e9] outline-none text-[10px] text-[#666]">
                        <option value="deleted">之前删除过</option>
                        <option value="blocked">之前拉黑过</option>
                        <option value="mutual-delete">之前互相删除</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <div className="text-[9px] text-[#aaa] mb-1">关系背景 / 相识经过</div>
                    <textarea value={relationshipContext} onChange={e => setRelationshipContext(e.target.value)}
                      placeholder="例如：我们认识很多年了，最近重新联系。"
                      className="w-full h-16 p-2.5 rounded-xl bg-white border border-[#e8e8e9] outline-none resize-none text-[10px] text-[#555]" />
                  </div>
                </div>
              )}

              {character && (
                <button onClick={() => {
                  const relationship = newChatRelationship;
                  const context = relationshipContext.trim();
                  const greeting = greetings[openingGreetingIndex] || '';
                  setFriendsList(prev => prev.some(friend => !friend.npcId && friend.characterId === character.id) ? prev : [{ ...addCharacterChatFriend, characterId: character.id, kind: 'character', note: '角色卡联系人', online: true }, ...prev]);
                  setChatItems(prev => prev.some(chat => !chat.npcId && chat.characterId === character.id && chat.personaId === effectivePersonaId)
                    ? prev
                    : [{ id: `c_${Date.now()}`, name: character.name, characterId: character.id, personaId: effectivePersonaId || undefined, time: '刚刚', preview: '打个招呼吧', unread: 0, isPinned: false, isMuted: false, draft: '', isGroup: false, relationshipContext: context, openingMode, openingGreeting: openingMode === 'context' ? greeting : '', relationship }, ...prev]);
                  setAddCharacterChatFriend(null); setFriendSearchQuery(''); showToast(`已添加「${character.name}」并建立聊天`);
                }} className="w-full py-3 rounded-2xl bg-[#292724] text-white text-xs font-semibold">添加为好友并进入聊天</button>
              )}
            </div>
          </div>
        );
      })()}

      {/* =====================================================
           MODAL 4: POST TO MOMENTS (发朋友圈抽屉)
      ===================================================== */}
      {showPostModal && (
        <div
          onClick={() => { setShowPostModal(false); setMentionSuggest(null); }}
          className="absolute inset-0 bg-black/25 z-50 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[90%] overflow-y-auto bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center sticky top-0 bg-white z-10 pb-1">
              <span className="text-[16px] font-semibold text-[#202124]">分享生活动态</span>
              <button onClick={() => { setShowPostModal(false); setMentionSuggest(null); }} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="relative">
              <div className="text-[11px] font-semibold text-[#444] mb-1.5">动态正文</div>
              <textarea
                ref={postTextareaRef}
                value={newPostText}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewPostText(value);
                  syncMentionSuggest(value, e.target.selectionStart ?? value.length);
                }}
                onClick={(e) => syncMentionSuggest(newPostText, (e.target as HTMLTextAreaElement).selectionStart ?? newPostText.length)}
                onKeyUp={(e) => syncMentionSuggest(newPostText, (e.target as HTMLTextAreaElement).selectionStart ?? newPostText.length)}
                placeholder="写点什么… 输入 @ 可艾特好友"
                className="w-full h-28 bg-[#f8f8f9] rounded-[12px] p-3 text-[13px] outline-none resize-none leading-relaxed text-[#333] border border-[#ececee] focus:border-[#d4aab5]"
                autoFocus
              />
              {mentionSuggest && (
                <div className="absolute left-0 right-0 top-[calc(100%-4px)] z-20 rounded-[12px] border border-[#e8e8e9] bg-white shadow-[0_10px_28px_rgba(0,0,0,.08)] overflow-hidden">
                  <div className="px-3 py-2 text-[10px] text-[#999] border-b border-[#f2f2f3]">艾特好友 · 下滑选择</div>
                  <div className="max-h-[160px] overflow-y-auto">
                    {mentionCandidates.length === 0 ? (
                      <div className="px-3 py-4 text-[11px] text-[#aaa]">没有匹配的好友</div>
                    ) : (
                      mentionCandidates.map(f => {
                        const key = friendAudienceKey(f);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => applyMentionPick(f)}
                            className="w-full px-3 py-2.5 text-left text-[12px] hover:bg-[#f7f7f8] flex items-center gap-2"
                          >
                            <span className="text-[#8c5f6b]">@{f.name}</span>
                            {f.npcId ? <span className="text-[8px] text-[#ae7e89]">NPC</span> : null}
                            {newPostMentionIds.includes(key) && <span className="ml-auto text-[9px] text-[#aaa]">已选</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              {newPostMentionIds.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {newPostMentionIds.map(id => {
                    const name = resolveAudienceLabel(id, vroomAudienceFriends, allLineNpcs);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setNewPostMentionIds(prev => prev.filter(x => x !== id))}
                        className="px-2 py-0.5 rounded-full text-[10px] bg-[#f6eef0] text-[#8c5f6b]"
                      >
                        @{name} ×
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 真实图片：只能 1 张 */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#444]">真实图片 · {newPostImages.length}/1</span>
                {newPostImages.length > 0 && <button type="button" onClick={() => { setNewPostImages([]); setNewPostImage(''); }} className="text-[10px] text-[#999]">清除</button>}
              </div>
              <div className="mt-2">
                {newPostImages[0] ? (
                  <div className="relative w-[42%] max-w-[140px] aspect-square rounded-[12px] overflow-hidden border border-[#eee]">
                    <img src={newPostImages[0]} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => { setNewPostImages([]); setNewPostImage(''); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white text-[11px] leading-none">×</button>
                  </div>
                ) : (
                  <label className="inline-flex w-[42%] max-w-[140px] aspect-square rounded-[12px] border border-dashed border-[#ddd] flex-col items-center justify-center text-[#888] cursor-pointer hover:border-[#555] hover:text-[#555]">
                    <span className="text-lg leading-none">＋</span>
                    <span className="text-[9px] mt-1">加一张图</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const data = String(reader.result || '');
                        setNewPostImages([data]);
                        setNewPostImage(data);
                      };
                      reader.readAsDataURL(file);
                      e.currentTarget.value = '';
                    }} />
                  </label>
                )}
              </div>
            </div>

            {/* 文字卡片：只能 1 张；样式跟 Me；AI 润色在 VROOM 设置里开关 */}
            <div className="p-3.5 rounded-[16px] border border-[#eeeeef] bg-[#fafafa]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-[#444]">文字卡片 · {newPostTextCards.length}/1</div>
                  <div className="text-[9px] text-[#999] mt-0.5">
                    样式：{TEXT_CARD_STYLES.find(x => x.id === textCardStyleId)?.name || '墨线'}
                    {momentsSettings.aiPolishTextCard ? ' · 发布时 AI 润色开着' : ' · AI 润色关着'}
                  </div>
                </div>
                {newPostTextCards.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setNewPostTextCards([''])}
                    className="px-2.5 py-1.5 rounded-full text-[10px] border border-[#e3e3e5] bg-white text-[#444]"
                  >
                    ＋添加
                  </button>
                ) : (
                  <button type="button" onClick={() => setNewPostTextCards([])} className="text-[10px] text-[#999]">移除</button>
                )}
              </div>
              {newPostTextCards.length > 0 && (
                <textarea
                  value={newPostTextCards[0] || ''}
                  onChange={e => setNewPostTextCards([e.target.value])}
                  placeholder="写进文字图片卡的内容……"
                  className="mt-2.5 w-full h-20 bg-white rounded-[12px] p-2.5 text-[12px] outline-none resize-none border border-[#ececee] leading-relaxed"
                />
              )}
            </div>

            {/* 视频卡片：只能 1 */}
            <div className="p-3.5 rounded-[16px] border border-[#eeeeef] bg-[#fafafa]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-[#444]">视频卡片 · {newPostVideoText != null ? 1 : 0}/1</div>
                  <div className="text-[9px] text-[#999] mt-0.5">
                    样式：{TEXT_CARD_STYLES.find(x => x.id === videoCardStyleId)?.name || '墨线'}
                    {momentsSettings.aiPolishTextCard ? ' · 发布时 AI 润色开着' : ' · AI 润色关着'}
                  </div>
                </div>
                {newPostVideoText == null ? (
                  <button
                    type="button"
                    onClick={() => setNewPostVideoText('')}
                    className="px-2.5 py-1.5 rounded-full text-[10px] border border-[#e3e3e5] bg-white text-[#444]"
                  >
                    ＋添加
                  </button>
                ) : (
                  <button type="button" onClick={() => setNewPostVideoText(null)} className="text-[10px] text-[#999]">移除</button>
                )}
              </div>
              {newPostVideoText != null && (
                <textarea
                  value={newPostVideoText}
                  onChange={e => setNewPostVideoText(e.target.value)}
                  placeholder="写进文字视频卡的内容（点播放后显示）……"
                  className="mt-2.5 w-full h-20 bg-white rounded-[12px] p-2.5 text-[12px] outline-none resize-none border border-[#ececee] leading-relaxed"
                />
              )}
            </div>

            {/* 谁可以看 */}
            <div className="p-3.5 rounded-[16px] border border-[#eeeeef] bg-white">
              <div className="text-[11px] font-semibold text-[#444]">谁可以看</div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {([['public','公开'],['group','分组'],['self','仅自己'],['partial','部分']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setNewPostVisibility(id)} className={`py-2 rounded-[12px] border text-[10px] ${newPostVisibility === id ? 'bg-[#202124] text-white border-[#202124]' : 'bg-[#f6f6f7] border-[#e3e3e5] text-[#666]'}`}>{label}</button>
                ))}
              </div>
              {(newPostVisibility === 'group' || newPostVisibility === 'partial') && (
                <div className="mt-2.5">
                  <div className="text-[10px] text-[#666] font-semibold">给谁看 · 角色 / NPC（{newPostAllowedIds.length}）</div>
                  <div className="mt-1.5 max-h-[140px] overflow-y-auto space-y-1">
                    {vroomAudienceFriends.map(f => {
                      const key = friendAudienceKey(f);
                      return (
                      <label key={key} className="flex items-center gap-2 p-1.5 rounded-lg border border-[#f0f0f0] text-[11px] cursor-pointer">
                        <input type="checkbox" checked={newPostAllowedIds.includes(key)} onChange={() => { setNewPostAllowedIds(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]); }} />
                        <span className="flex-1 truncate">{f.name}</span>
                        {f.npcId ? <span className="text-[8px] text-[#ae7e89]">NPC</span> : <span className="text-[8px] text-[#aaa]">角色</span>}
                      </label>
                      );
                    })}
                    {!vroomAudienceFriends.length && <div className="text-[10px] text-[#aaa] text-center py-2">还没有好友或 NPC</div>}
                  </div>
                </div>
              )}
              {(newPostVisibility === 'partial' || newPostVisibility === 'public') && (
                <div className="mt-2.5">
                  <div className="text-[10px] text-[#666] font-semibold">不给谁看 · 可屏蔽 NPC（{newPostBlockedIds.length}）</div>
                  <div className="mt-1.5 max-h-[140px] overflow-y-auto space-y-1">
                    {vroomAudienceFriends.map(f => {
                      const key = friendAudienceKey(f);
                      return (
                      <label key={'block-' + key} className="flex items-center gap-2 p-1.5 rounded-lg border border-[#f0f0f0] text-[11px] cursor-pointer">
                        <input type="checkbox" checked={newPostBlockedIds.includes(key)} onChange={() => { setNewPostBlockedIds(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]); }} />
                        <span className="flex-1 truncate">{f.name}</span>
                        {f.npcId ? <span className="text-[8px] text-[#ae7e89]">NPC</span> : <span className="text-[8px] text-[#aaa]">角色</span>}
                      </label>
                      );
                    })}
                    {!vroomAudienceFriends.length && <div className="text-[10px] text-[#aaa] text-center py-2">还没有好友或 NPC</div>}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isPublishingPost}
              onClick={() => {
                void (async () => {
                  const rawCard = (newPostTextCards[0] || '').trim();
                  const videoBody = newPostVideoText != null ? newPostVideoText.trim() : '';
                  if (newPostTextCards.length > 0 && !rawCard) {
                    showToast('请填写文字卡片正文，或移除文字卡');
                    return;
                  }
                  if (newPostVideoText != null && !videoBody) {
                    showToast('请填写视频卡片正文，或移除视频卡');
                    return;
                  }
                  if (!newPostText.trim() && !newPostImages.length && !newPostImage && !rawCard && !videoBody) {
                    showToast('请写正文，或添加图片 / 文字卡 / 视频卡');
                    return;
                  }

                  setIsPublishingPost(true);
                  let polishedCard = rawCard;
                  let polishedVideo = videoBody;
                  try {
                    const polishSettings = channelSettings.moments.enabled
                      ? channelAsAiSettings('moments')
                      : resolveChannelAiSettings('moments');
                    const polishOne = async (raw: string, kindLabel: string) => {
                      const polished = await generateCreativeText({
                        settings: polishSettings,
                        systemPrompt: [
                          `你是中文短句润色助手，只服务朋友圈「${kindLabel}」。`,
                          '把用户原文润成更有画面感的短句，语气自然、克制，像夜读杂志里的一句。',
                          '不要加标题、引号、解释、emoji；不要改变事实；不要写成广告。',
                          '尽量保持原意，长度相近，最多两到三句。',
                          '只输出润色后的正文。',
                        ].join('\n'),
                        userPrompt: raw,
                        temperature: Math.min(0.95, (polishSettings.temperature ?? 0.85) + 0.05),
                      });
                      return polished.trim() || raw;
                    };

                    if (momentsSettings.aiPolishTextCard && (rawCard || videoBody)) {
                      showToast(rawCard && videoBody ? '正在润色文字卡与视频卡……' : rawCard ? '正在润色文字卡片……' : '正在润色视频卡片……');
                      if (rawCard) polishedCard = await polishOne(rawCard, '文字图片卡');
                      if (videoBody) polishedVideo = await polishOne(videoBody, '文字视频卡');
                    }

                    const visibilityLabel = newPostVisibility === 'public'
                      ? (newPostBlockedIds.length ? `公开 · 屏蔽${newPostBlockedIds.length}人` : '公开')
                      : newPostVisibility === 'group'
                        ? `分组 · ${newPostAllowedIds.length}人`
                        : newPostVisibility === 'self'
                          ? '仅自己'
                          : `部分 · ${newPostAllowedIds.length}人可见${newPostBlockedIds.length ? ` · ${newPostBlockedIds.length}人不可见` : ''}`;
                    const authorName = (activePersona?.name || currentUser.name || '').trim() || '我';
                    const authorAvatar = activePersona?.avatar || currentUser.avatar || undefined;
                    const oneImage = newPostImages[0] || newPostImage || undefined;
                    let storedImage = oneImage;
                    if (storedImage && storedImage.startsWith('data:')) {
                      try { storedImage = 'media:' + await putMedia(storedImage); }
                      catch { showToast('图片太大，发布失败，请换张小图'); setIsPublishingPost(false); return; }
                    }
                    const didPolish = !!(momentsSettings.aiPolishTextCard && (rawCard || videoBody));
                    const newPost = {
                      id: `p_${Date.now()}`,
                      name: authorName,
                      avatar: authorAvatar,
                      personaId: effectivePersonaId || undefined,
                      isMine: true,
                      characterId: undefined,
                      time: '刚刚',
                      text: newPostText.trim(),
                      tag: '',
                      likes: 0,
                      liked: false,
                      likers: [],
                      commentsList: [],
                      image: storedImage,
                      images: storedImage ? [storedImage] : [],
                      textCards: polishedCard
                        ? [{ text: polishedCard, style: textCardStyleId || 'a', collapsed: true, polished: !!(rawCard && didPolish && polishedCard !== rawCard) }]
                        : [],
                      textCard: polishedCard
                        ? { style: textCardStyleId || 'a', collapsed: true, text: polishedCard }
                        : undefined,
                      videoCard: polishedVideo
                        ? {
                            text: polishedVideo,
                            style: videoCardStyleId || 'a',
                            duration: videoCardDuration > 0 ? videoCardDuration : undefined,
                            polished: !!(videoBody && didPolish && polishedVideo !== videoBody),
                          }
                        : undefined,
                      visibility: newPostVisibility,
                      visibilityLabel,
                      allowedIds: [...newPostAllowedIds],
                      blockedIds: [...newPostBlockedIds],
                      mentionIds: [...newPostMentionIds],
                    };
                    setMomentsPosts((prev) => [newPost, ...prev]);
                    setNewPostText('');
                    setNewPostImage('');
                    setNewPostImages([]);
                    setNewPostTextCards([]);
                    setNewPostVideoText(null);
                    setMentionSuggest(null);
                    setNewPostVisibility('public');
                    setNewPostAllowedIds([]);
                    setNewPostBlockedIds([]);
                    setNewPostMentionIds([]);
                    setShowPostModal(false);
                    showToast(didPolish ? '已润色并发布 ✨' : '朋友圈动态已发布 ✨');
                    applyBatchCommentsAfterPost(newPost);
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : '发布失败（润色或网络出错）');
                  } finally {
                    setIsPublishingPost(false);
                  }
                })();
              }}
              className="w-full py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer disabled:opacity-55"
            >
              {isPublishingPost ? '发布中…' : '发布到朋友圈'}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 4.5: MOMENTS COMMENT INPUT DRAWER (评论抽屉)
      ===================================================== */}
      {commentingPostId && (() => {
        const meName = (activePersona?.name || currentUser.name || '').trim() || currentUser.name || '我';
        const submitComment = () => {
          const text = commentInputText.trim();
          if (!text) return;
          const postId = commentingPostId;
          const replyTarget = commentReplyTo;
          const nextComment: MomentComment = {
            id: `c_${Date.now().toString(36)}`,
            user: meName,
            text,
            time: '刚刚',
            replyTo: replyTarget?.user,
            replies: [],
            kind: 'user',
          };
          const livePost = momentsPosts.find(p => p.id === postId);
          const parentComment = replyTarget?.id
            ? flattenMomentComments(normalizeMomentComments(livePost?.commentsList)).find(c => c.id === replyTarget.id) || null
            : null;

          setMomentsPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              const tree = normalizeMomentComments(p.commentsList);
              return {
                ...p,
                commentsList: appendMomentComment(tree, nextComment, replyTarget?.id || null),
              };
            })
          );
          setCommentingPostId(null);
          setCommentReplyTo(null);
          setCommentInputText('');
          showToast(replyTarget ? '回复已发送' : '评论已发送');

          if (livePost && postId) {
            void (async () => {
              try {
                const aiReply = await spawnInstantReply({
                  post: {
                    id: String(livePost.id),
                    name: livePost.name,
                    text: livePost.text,
                    characterId: livePost.characterId,
                  },
                  meName,
                  userComment: nextComment,
                  parentComment,
                  settings: momentsSettings,
                });
                if (!aiReply) return;
                // 楼中楼：挂在被回复的那一层；顶层新评：挂在我这条评论下
                const hangUnderId = replyTarget?.id || nextComment.id;
                setMomentsPosts(prev =>
                  prev.map(p => {
                    if (p.id !== postId) return p;
                    const tree = normalizeMomentComments(p.commentsList);
                    return { ...p, commentsList: appendMomentComment(tree, aiReply, hangUnderId) };
                  }),
                );
              } catch (e) {
                showToast(e instanceof Error ? e.message : '立刻回敬失败');
              }
            })();
          }
        };
        return (
          <div
            onClick={() => { setCommentingPostId(null); setCommentReplyTo(null); }}
            className="absolute inset-0 bg-black/25 z-[80] flex items-end animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-[#333]">
                  {commentReplyTo ? `回复 @${commentReplyTo.user}` : '写下你的评论'}
                </span>
                <button
                  type="button"
                  onClick={() => { setCommentingPostId(null); setCommentReplyTo(null); }}
                  className="text-lg text-[#aaa]"
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={commentInputText}
                  onChange={(e) => setCommentInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitComment();
                  }}
                  placeholder={commentReplyTo ? `回复 @${commentReplyTo.user}…` : '发送一条友好的评论…'}
                  className="flex-1 bg-[#f6f6f7] p-2.5 rounded-[12px] text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={submitComment}
                  className="px-3.5 py-2.5 bg-[#d4aab5] text-white rounded-[12px] text-xs font-semibold cursor-pointer"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================
           MODAL 5: CHAT ITEM CONTEXT ACTION SHEET (长按会话操作)
      ===================================================== */}
      {chatContextMenu && (
        <div
          onClick={() => setChatContextMenu(null)}
          className="absolute inset-0 bg-black/25 z-60 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-4 pb-6 space-y-3 animate-in slide-in-from-bottom"
          >
            <div className="w-8 h-1 bg-[#ddd] rounded-full mx-auto" />
            <div className="font-semibold text-sm text-[#333] px-2">
              {chatContextMenu.name}
              {chatContextMenu.variantLabel && <span className="ml-1 text-[9px] font-normal text-[#aaa]">· {chatContextMenu.variantLabel}</span>}
              {chatContextMenu.chatLabel && <div className="text-[9px] font-normal text-[#aaa] mt-0.5">{chatContextMenu.chatLabel}</div>}
            </div>
            {!chatContextMenu.isGroup && chatContextMenu.characterId && (
              <button
                onClick={() => {
                  const existing = chatItems.filter(item => item.characterId === chatContextMenu.characterId);
                  const newChat: LineChatItem = {
                    ...chatContextMenu,
                    id: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                    chatLabel: `聊天 ${existing.length + 1}`,
                    time: '刚刚',
                    preview: '新的独立聊天',
                    unread: 0,
                    isPinned: false,
                    isMuted: false,
                    draft: '',
                  };
                  setChatItems(prev => [newChat, ...prev]);
                  setChatContextMenu(null);
                  setActiveChatId(newChat.id);
                  showToast(`已创建 ${chatContextMenu.name} 的新聊天`);
                }}
                className="w-full px-2.5 py-2.5 rounded-xl bg-[#faf3f5] text-[#ae7e89] text-xs text-left cursor-pointer"
              >
                ＋ 为这个角色新建聊天
              </button>
            )}

            <div className="divide-y divide-[#f2f2f4] text-xs">
              {/* 置顶切换 */}
              <div
                onClick={() => {
                  setChatItems((prev) =>
                    prev.map((c) =>
                      c.id === chatContextMenu.id ? { ...c, isPinned: !c.isPinned } : c
                    )
                  );
                  setChatContextMenu(null);
                  showToast(chatContextMenu.isPinned ? '已取消置顶' : '已置顶会话 📌');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">{chatContextMenu.isPinned ? '取消置顶' : '置顶聊天'}</span>
                <Pin className="w-4 h-4 text-[#ae7e89]" />
              </div>

              {/* 免打扰切换 */}
              <div
                onClick={() => {
                  setChatItems((prev) =>
                    prev.map((c) =>
                      c.id === chatContextMenu.id ? { ...c, isMuted: !c.isMuted } : c
                    )
                  );
                  setChatContextMenu(null);
                  showToast(chatContextMenu.isMuted ? '已开启新消息提醒' : '已设为免打扰 🔕');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">{chatContextMenu.isMuted ? '开启通知提醒' : '消息免打扰'}</span>
                <BellOff className="w-4 h-4 text-[#888]" />
              </div>

              {/* 标为已读/未读 */}
              <div
                onClick={() => {
                  setChatItems((prev) =>
                    prev.map((c) =>
                      c.id === chatContextMenu.id
                        ? { ...c, unread: c.unread > 0 ? 0 : 1 }
                        : c
                    )
                  );
                  setChatContextMenu(null);
                  showToast('已更新消息标记');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">{chatContextMenu.unread > 0 ? '标为已读' : '标为未读'}</span>
                <span className="text-xs text-[#ae7e89]">✉</span>
              </div>

              {/* 删除此会话 */}
              <div
                onClick={() => {
                  setChatItems((prev) => prev.filter((c) => c.id !== chatContextMenu.id));
                  setChatContextMenu(null);
                  showToast('已删除会话');
                }}
                className="py-3 px-2 flex items-center justify-between cursor-pointer hover:bg-neutral-50 text-rose-500"
              >
                <span>删除此对话</span>
                <Trash2 className="w-4 h-4" />
              </div>
            </div>

            <button
              onClick={() => setChatContextMenu(null)}
              className="w-full py-2.5 rounded-[12px] bg-[#f7f7f7] text-[#777] text-xs font-medium cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 6: MY MOMENTS DRAWER (我的朋友圈)
      ===================================================== */}
      {showMyMomentsModal && (
        <div
          onClick={() => setShowMyMomentsModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 max-h-[85%] overflow-y-auto animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[17px] font-semibold text-[#202124]" >{tx('我的朋友圈', 'マイモーメンツ')}</span>
                <div className="text-[10px] text-[#aaa]">当前身份：{activePersona?.name || currentUser.name}</div>
              </div>
              <button onClick={() => setShowMyMomentsModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="divide-y divide-[#f2f2f4]">
              {myMoments.map((post) => (
                  <div key={post.id} className="py-3 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-[#aaa]">
                      <span>{post.time}</span>
                      <span className="text-[#ae7e89]">{post.tag}</span>
                    </div>
                    <div className="text-xs text-[#333] leading-relaxed">{post.text || (getPostTextCards(post).length ? '[文字图片]' : getPostVideoCard(post) ? '[文字视频]' : post.image || post.images?.length ? '[图片动态]' : '')}</div>
                    <div className="text-[10px] text-[#888] flex items-center justify-between pt-1">
                      <span>♥ {post.likes} 赞 · {countMomentComments(normalizeMomentComments(post.commentsList))} 评论</span>
                      <button
                        onClick={() => {
                          setMomentsPosts((prev) => prev.filter((p) => p.id !== post.id));
                          showToast('已删除该动态');
                        }}
                        className="text-rose-400 hover:text-rose-600 cursor-pointer"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}

              {myMoments.length === 0 && (
                <div className="py-12 text-center text-xs text-[#aaa]">
                  当前身份尚未发布过动态
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 7: FAVORITES DRAWER (收藏箱)
      ===================================================== */}
      {showFavoritesModal && (
        <div
          onClick={() => setShowFavoritesModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 max-h-[85%] overflow-y-auto animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[17px] font-semibold text-[#202124]" >{tx('我的收藏', 'お気に入り')}</span>
                <div className="text-[10px] text-[#aaa]">共 {globalFavorites.length} 条珍藏内容</div>
              </div>
              <button onClick={() => setShowFavoritesModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="divide-y divide-[#f2f2f4]">
              {globalFavorites.map((fav) => (
                <div key={fav.id} className="py-3 space-y-1">
                  <div className="flex justify-between text-[11px] text-[#888]">
                    <span className="font-semibold text-[#ae7e89]">{fav.contactName}</span>
                    <span className="text-[#aaa]">{fav.time}</span>
                  </div>
                  <div className="text-xs text-[#333] leading-relaxed whitespace-pre-wrap">{fav.text}</div>
                  <div className="flex justify-end gap-2 pt-1 text-[10px]">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(fav.text);
                        showToast('已复制内容');
                      }}
                      className="px-2 py-0.5 rounded bg-[#f5f5f7] text-[#555] hover:bg-[#eaeaea] cursor-pointer"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => {
                        setGlobalFavorites((prev) => prev.filter((f) => f.id !== fav.id));
                        showToast('已移除收藏');
                      }}
                      className="px-2 py-0.5 rounded bg-rose-50 text-rose-500 hover:bg-rose-100 cursor-pointer"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 8: NOTIFICATION SETTINGS (新消息通知)
      ===================================================== */}
      {showNotificationModal && (
        <div
          onClick={() => setShowNotificationModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('新消息通知设置', '通知設定')}</span>
              <button onClick={() => setShowNotificationModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            <div className="divide-y divide-[#f2f2f4] text-xs">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">接收新消息通知</div>
                  <div className="text-[10px] text-[#aaa]">收到消息时在通知栏提示</div>
                </div>
                <div
                  onClick={() => setNotifSound(!notifSound)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    notifSound ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    notifSound ? 'left-4.5' : 'left-0.5'
                  }`} />
                </div>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">振动提醒</div>
                  <div className="text-[10px] text-[#aaa]">收到消息时触发微震</div>
                </div>
                <div
                  onClick={() => setNotifVibrate(!notifVibrate)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    notifVibrate ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    notifVibrate ? 'left-4.5' : 'left-0.5'
                  }`} />
                </div>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#333]">通知显示消息详情</div>
                  <div className="text-[10px] text-[#aaa]">锁屏时展示发送人与文字摘要</div>
                </div>
                <div
                  onClick={() => setNotifPreview(!notifPreview)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    notifPreview ? 'bg-[#d4aab5]' : 'bg-[#ddd]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    notifPreview ? 'left-4.5' : 'left-0.5'
                  }`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 9: GLOBAL CHAT SETTINGS (全局聊天设置)
      ===================================================== */}
      {showGlobalChatSettingsModal && (
        <div
          onClick={() => setShowGlobalChatSettingsModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[88%] overflow-y-auto bg-white rounded-t-[20px] p-5 pb-8 space-y-4 animate-in slide-in-from-bottom"
          >
            <div className="flex justify-between items-center sticky top-0 bg-white z-10 pb-1">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('聊天通用设置', 'チャット設定')}</span>
              <button onClick={() => setShowGlobalChatSettingsModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>

            {/* AI 润色：聊天/朋友圈 文字图片卡 + 文字视频卡 发送前润色 */}
            <label className="flex items-center justify-between gap-3 p-4 rounded-[16px] border border-[#f0e4e7] bg-[#faf8f9] cursor-pointer">
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-[#333]">图片卡 / 视频卡 · AI 润色后发送</div>
                <div className="text-[9px] text-[#999] mt-1 leading-relaxed">
                  开启后：LINE 与 VROOM 发送「文字图片卡」「文字视频卡」时，都会先 AI 润色正文再发出。关闭则原文发送。
                </div>
              </div>
              <input
                type="checkbox"
                className="shrink-0"
                checked={!!momentsSettings.aiPolishTextCard}
                onChange={e => {
                  const on = e.target.checked;
                  setMomentsSettings(prev => ({ ...prev, aiPolishTextCard: on }));
                  showToast(on ? '已开启：图片卡/视频卡会 AI 润色后发送' : '已关闭：图片卡/视频卡按原文发送');
                }}
              />
            </label>

            {/* 图片卡片设置：6 色样式 + 加载文案（原型格式） */}
            <div className="rounded-[16px] border border-[#eeeeef] bg-white overflow-hidden">
              <button onClick={() => setImgCardOpen(v => !v)} className="w-full p-4 flex items-center justify-between text-left">
                <div>
                  <div className="text-[12px] font-bold text-[#333]">图片卡片设置 · {TEXT_CARD_STYLES.find(x => x.id === textCardStyleId)?.name || ''}</div>
                  <div className="text-[9px] text-[#aaa] mt-1">LINE 聊天 VROOM · 封面加载中 → 点开滚全文 · 「{imageLoadingLabel}」</div>
                </div>
                <span className="text-[#aaa] text-sm">{imgCardOpen ? '▾' : '▸'}</span>
              </button>
              {imgCardOpen && (
              <div className="px-4 pb-4">
              <div className="text-[10px] text-[#888] mb-2">配色样式</div>
              <TextCardStylePicker
                value={textCardStyleId}
                kind="image"
                loadingLabel={imageLoadingLabel}
                onChange={(id) => { setTextCardStyleId(id); showToast(`默认图片卡换成${TEXT_CARD_STYLES.find(x => x.id === id)?.name || ''}了`); }}
              />
              <div className="text-[10px] text-[#888] mt-3 mb-0">封面加载文案</div>
              <ImageLoadingLabelPicker
                value={imageLoadingLabel}
                onChange={(text) => { setImageLoadingLabel(text); showToast(`封面文案换成「${text}」了`); }}
              />
              </div>
              )}
            </div>

            {/* 视频卡片设置：底条常显 + 可自定义秒数 */}
            <div className="rounded-[16px] border border-[#eeeeef] bg-white overflow-hidden">
              <button onClick={() => setVidCardOpen(v => !v)} className="w-full p-4 flex items-center justify-between text-left">
                <div>
                  <div className="text-[12px] font-bold text-[#333]">视频卡片设置 · {TEXT_CARD_STYLES.find(x => x.id === videoCardStyleId)?.name || ''}</div>
                  <div className="text-[9px] text-[#aaa] mt-1">
                    LINE 聊天 VROOM · 底条常显 · 秒数
                    {videoCardDuration > 0 ? `固定 ${videoCardDuration}s` : '按文字自动'}
                  </div>
                </div>
                <span className="text-[#aaa] text-sm">{vidCardOpen ? '▾' : '▸'}</span>
              </button>
              {vidCardOpen && (
              <div className="px-4 pb-4">
              <div className="text-[10px] text-[#888] mb-2">配色样式</div>
              <TextCardStylePicker
                value={videoCardStyleId}
                kind="video"
                durationSecs={videoCardDuration > 0 ? videoCardDuration : 12}
                onChange={(id) => { setVideoCardStyleId(id); showToast(`默认视频卡换成${TEXT_CARD_STYLES.find(x => x.id === id)?.name || ''}了`); }}
              />
              <div className="text-[10px] text-[#888] mt-3 mb-0">视频秒数</div>
              <VideoDurationSetter
                value={videoCardDuration}
                onChange={(secs) => {
                  setVideoCardDuration(secs);
                  showToast(secs > 0 ? `默认视频秒数设为 ${secs} 秒` : '已改为按文字长度自动估算秒数');
                }}
              />
              </div>
              )}
            </div>

            <div className="space-y-3 text-xs">
              {(['chat', 'moments'] as const).map((channel) => {
                const s = channelSettings[channel];
                const label = channel === 'chat' ? 'LINE 聊天 API' : '朋友圈 Moments API';
                const models = channelModels[channel];
                return (
                  <div key={channel} className="p-3 bg-[#faf8f9] rounded-[12px] border border-[#f0e4e7] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#ae7e89]">{label}</div>
                        <div className="text-[9px] text-[#999] mt-0.5">{s.enabled ? '当前聊天频道使用独立 API' : '默认跟随全局 AI API'}</div>
                      </div>
                      <button onClick={() => updateChannelSettings(channel, { enabled: !s.enabled })} className={`px-2.5 py-1 rounded-full text-[9px] ${s.enabled ? 'bg-[#d4aab5] text-white' : 'bg-[#eee] text-[#777]'}`}>{s.enabled ? '独立 API' : '跟随全局'}</button>
                    </div>
                    {s.enabled && <div className="space-y-2">
                      <input value={s.apiBaseUrl} onChange={e => updateChannelSettings(channel, { apiBaseUrl: e.target.value })} placeholder="API Base URL" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none" />
                      <input value={s.apiKey} onChange={e => updateChannelSettings(channel, { apiKey: e.target.value })} placeholder="API Key" type="password" className="w-full p-2 bg-white border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none" />
                      <div className="flex gap-2">
                        <select value={s.model} onChange={e => updateChannelSettings(channel, { model: e.target.value })} className="flex-1 p-2 bg-white border border-[#e8e8e9] rounded-[9px] text-[10px] outline-none">
                          <option value="">选择模型</option>
                          {models.map(model => <option key={model} value={model}>{model}</option>)}
                          {s.model && !models.includes(s.model) && <option value={s.model}>{s.model}</option>}
                        </select>
                        <button onClick={() => fetchChannelModels(channel)} className="px-2.5 rounded-[9px] bg-[#f0e6e8] text-[#8c5f6b] text-[9px]">{channelBusy === channel + '-models' ? '拉取中…' : '拉取模型'}</button>
                      </div>
                      <button onClick={() => testChannel(channel)} className="w-full py-2 rounded-[9px] bg-[#292724] text-white text-[10px]">{channelBusy === channel + '-test' ? '测试中…' : '测试连接'}</button>
                    </div>}
                  </div>
                );
              })}
              <div onClick={() => { setChatItems(prev => prev.map(c => ({ ...c, unread: 0 }))); showToast('已全部标记为已读'); }} className="p-3 bg-[#f8f8fa] rounded-[12px] flex items-center justify-between cursor-pointer hover:bg-[#f0f0f2]"><span className="text-[#333]">一键全部标为已读</span><span className="text-[#aaa]">›</span></div>
              <div onClick={() => { setChatItems(prev => prev.map(c => ({ ...c, draft: '' }))); showToast('已清空所有草稿记录'); }} className="p-3 bg-[#f8f8fa] rounded-[12px] flex items-center justify-between cursor-pointer hover:bg-[#f0f0f2]"><span className="text-[#333]">清空所有草稿记录</span><span className="text-[#aaa]">›</span></div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 10: PRIVACY SETTINGS (隐私权限)
      ===================================================== */}
      {showPrivacyModal && (
        <div
          onClick={() => setShowPrivacyModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-3 animate-in slide-in-from-bottom text-xs"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('隐私权限与安全', 'プライバシーと安全')}</span>
              <button onClick={() => setShowPrivacyModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>
            <div className="p-3 bg-[#fafafa] rounded-[12px] border border-[#f0f0f2] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[#333]">加我为好友需要验证</span>
                <span className="text-[#ae7e89] font-semibold">已开启</span>
              </div>
              <div className="border-t border-[#eee] pt-2 flex justify-between items-center">
                <span className="text-[#333]">朋友圈可见范围</span>
                <span className="text-[#888]">全部公开</span>
              </div>
              <div className="border-t border-[#eee] pt-2 flex justify-between items-center">
                <span className="text-[#333]">端到端加密通话</span>
                <span className="text-[#8c5f6b]">有效保护中</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
           MODAL 11: GENERAL SETTINGS (系统通用设置)
      ===================================================== */}
      {showGeneralSettingsModal && (
        <div
          onClick={() => setShowGeneralSettingsModal(false)}
          className="absolute inset-0 bg-black/25 z-55 flex items-end animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[20px] p-5 pb-8 space-y-3 animate-in slide-in-from-bottom text-xs"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[17px] font-semibold text-[#202124]" >{tx('系统通用设置', 'システム設定')}</span>
              <button onClick={() => setShowGeneralSettingsModal(false)} className="text-xl text-[#aaa] cursor-pointer">
                ×
              </button>
            </div>
            <div className="divide-y divide-[#f2f2f4]">
              <div className="py-2.5 flex justify-between items-center">
                <div>
                  <div className="text-[#333]">全局 AI</div>
                  <div className="text-[9px] text-[#aaa] mt-0.5">LINE 默认聊天与未单独指定频道使用</div>
                </div>
                <span className="text-[#888]">{readAppSettings().apiKey && readAppSettings().model ? readAppSettings().model : '未配置'}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <div>
                  <div className="text-[#333]">频道 API</div>
                  <div className="text-[9px] text-[#aaa] mt-0.5">聊天与朋友圈可分别覆盖全局</div>
                </div>
                <span className="text-[#ae7e89]">已支持独立配置</span>
              </div>
              <button
                onClick={() => onNavigateScreen?.('settings')}
                className="w-full py-2.5 text-left flex justify-between items-center cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">打开系统 AI / 媒体 API 设置</span>
                <span className="text-[#ae7e89]">前往 ›</span>
              </button>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-[#333]">{tx('多语言 (Language)', '言語 (Language)')}</span>
                <button onClick={() => setLineLocale(ja ? 'zh-CN' : 'ja-JP')} className="text-[#ae7e89]">{ja ? '日本語' : '简体中文'} ↔</button>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <span className="text-[#333]">版本</span>
                <span className="text-[#888]">LINE — White Edition v2.5</span>
              </div>
              <div
                onClick={() => {
                  showToast('本地缓存已清理完毕');
                }}
                className="py-2.5 flex justify-between items-center cursor-pointer hover:bg-neutral-50"
              >
                <span className="text-[#333]">清除缓存数据</span>
                <span className="text-[#ae7e89]">立即清理 ›</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toastMsg && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-20 bg-black/85 text-white px-3.5 py-1.5 rounded-full text-[11px] shadow-lg pointer-events-none z-60 animate-in fade-in">
          {toastMsg}
        </div>
      )}

    </div>
  );
}
