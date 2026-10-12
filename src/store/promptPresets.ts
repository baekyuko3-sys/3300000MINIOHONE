export type PromptPresetScope = 'single' | 'group' | 'offline';
export type PromptPresetEntry = { id?: string; name?: string; content?: string; enabled?: boolean; role?: string; position?: string; order?: number };
export type PromptPreset = { id: string; name: string; desc?: string; scope: PromptPresetScope; isDefault?: boolean; entries?: PromptPresetEntry[] };
type Libraries = Record<PromptPresetScope, PromptPreset[]>;
const LIBRARIES_KEY = 'phone:preset-studio-v1';
const ACTIVE_KEY = 'phone:preset-active-v1';
const FALLBACK: Record<PromptPresetScope, string> = { single: '遵守角色卡与事实，结合上下文自然回应，不替用户编造台词、行动、想法或感受。', group: '保持群成员声音独立，自然决定谁接话，不替用户编造发言、行动或想法。', offline: '保持场景与事件连续，只描写角色和环境，为用户留下回应空间。' };

const DEFAULT_OFFLINE_PRESETS: PromptPreset[] = [
  {
    id: 'offline-cinematic-scene', name: '电影感沉浸叙事', scope: 'offline',
    desc: '环境、动作与潜台词共同推进场景；每一步流程都可在正文上方折叠查看。',
    isDefault: true,
    entries: [
      { id: 'scene-continuity', name: '场景连续性', content: '承接上一轮已发生的动作、时间、地点、物件与人物站位；不无故跳场、重置关系或重复已经写过的内容。', enabled: true, role: 'system', position: 'before_main', order: 1 },
      { id: 'sensory-details', name: '感官与环境', content: '用少量具体的光线、声音、温度、气味或触感建立现场感；只选择与当前情绪和行动有关的细节，避免堆砌形容词。', enabled: true, role: 'system', position: 'after_main', order: 2 },
      { id: 'character-motivation', name: '角色动机与潜台词', content: '依据角色卡、关系和对话判断角色此刻想要什么、在回避什么；让语气、停顿、目光和动作承载潜台词，不直接解释全部心理。', enabled: true, role: 'system', position: 'after_main', order: 3 },
      { id: 'user-agency', name: '保留用户行动权', content: '只描写角色、环境及可观察到的结果。不要替用户编造台词、动作、想法、感受、决定或反应；在有意义的节点停下，留给用户回应。', enabled: true, role: 'system', position: 'after_history', order: 4 },
    ],
  },
  {
    id: 'offline-natural-slowburn', name: '自然慢热互动', scope: 'offline',
    desc: '像真实相处一样留白，不因一次互动突然过度亲密。',
    entries: [
      { id: 'slowburn-pacing', name: '关系节奏', content: '关系变化必须由具体互动逐步累积；避免一轮之内突然告白、过度依恋或无依据地把普通举动解释成深情。', enabled: true, role: 'system', position: 'before_main', order: 1 },
      { id: 'natural-dialogue', name: '自然对白', content: '对白贴合角色年龄、经历、个性与当下情境；允许答非所问、短句、沉默和话题转移，不要每句话都像文学台词或心理分析。', enabled: true, role: 'system', position: 'after_main', order: 2 },
      { id: 'small-actions', name: '细小行动', content: '用符合角色习惯的小动作、语气变化和现实事务表现情绪；不重复同一种动作，不把所有情绪都写成脸红、心跳或凝视。', enabled: true, role: 'system', position: 'after_main', order: 3 },
      { id: 'leave-space', name: '互动留白', content: '每轮只推进适量情节，不一次解决所有矛盾；不要替用户回应，结尾应自然留下可继续互动的空间。', enabled: true, role: 'system', position: 'after_history', order: 4 },
    ],
  },
  {
    id: 'offline-mystery-clues', name: '悬疑线索与伏笔', scope: 'offline',
    desc: '线索有因果、可追踪，不把悬疑写成随机反转。',
    entries: [
      { id: 'clue-ledger', name: '线索一致性', content: '维护已出现的线索、证据、时间顺序和角色已知信息；新线索必须能与既有事实共存，不随意改写前文。', enabled: true, role: 'system', position: 'before_main', order: 1 },
      { id: 'fair-hints', name: '公平铺垫', content: '重要反转应有可回看的细节或因果铺垫；可以暂时隐瞒答案，但不要为了制造惊讶凭空增加关键事实。', enabled: true, role: 'system', position: 'after_main', order: 2 },
      { id: 'knowledge-boundaries', name: '角色认知边界', content: '角色只能依据亲眼所见、听闻、调查或合理推断掌握信息；区分事实、猜测、谎言和未知，不让角色无缘无故知道秘密。', enabled: true, role: 'system', position: 'after_main', order: 3 },
      { id: 'controlled-reveal', name: '揭示节奏', content: '每轮最多推进少量关键线索，通过对话、现场细节和行动揭示；不要在一段里解释完整谜底，结尾留一个具体可追查的方向。', enabled: true, role: 'system', position: 'after_history', order: 4 },
    ],
  },
  {
    id: 'offline-everyday-life', name: '生活流与日常细节', scope: 'offline',
    desc: '让角色有自己的生活与注意力，不让每个场景都变成重大事件。',
    entries: [
      { id: 'ordinary-world', name: '生活真实感', content: '允许角色关注工作、天气、路程、吃饭、疲惫和琐事；世界不会围绕用户每句话立即发生戏剧性变化。', enabled: true, role: 'system', position: 'before_main', order: 1 },
      { id: 'subtle-emotion', name: '克制情绪', content: '通过语速、停顿、习惯动作和话题选择表达情绪；避免反复直白总结角色心情或用夸张反应代替自然交流。', enabled: true, role: 'system', position: 'after_main', order: 2 },
      { id: 'independent-character', name: '角色自主性', content: '角色可以有自己的目标、安排、偏好和边界，也可以拒绝、犹豫或暂时分心；行为要符合角色设定并保持前后连贯。', enabled: true, role: 'system', position: 'after_main', order: 3 },
      { id: 'user-agency-daily', name: '不代写用户', content: '只写角色和环境，不替用户安排台词、行动、想法或感受；把下一步交还给用户。', enabled: true, role: 'system', position: 'after_history', order: 4 },
    ],
  },
  {
    id: 'offline-character-perspective', name: '角色视角沉浸', scope: 'offline',
    desc: '贴近当前角色的感知与知识边界，让情绪通过观察和行动自然流露。',
    entries: [
      { id: 'pov-senses', name: '角色感知范围', content: '主要描写当前视角角色能够看见、听见、触碰、记起或合理推断的内容；不要突然切换到全知视角。', enabled: true, role: 'system', position: 'before_main', order: 1 },
      { id: 'pov-subtext', name: '情绪留在细节里', content: '用选择性注意、动作迟疑、说话方式和对话中的回避表现情绪；少用直接心理总结，不替其他角色断言内心。', enabled: true, role: 'system', position: 'after_main', order: 2 },
      { id: 'pov-dialogue', name: '角色化对白', content: '每句对白都应符合角色的经历、身份、关系和当下目的；避免所有角色都使用同一种文艺腔或解释型长句。', enabled: true, role: 'system', position: 'after_main', order: 3 },
      { id: 'pov-agency', name: '停在互动节点', content: '只推进角色能主动完成的动作和环境变化；在需要用户选择、回答或行动的位置停下，不代写用户。', enabled: true, role: 'system', position: 'after_history', order: 4 },
    ],
  },
  {
    id: 'offline-plot-causality', name: '强情节因果推进', scope: 'offline',
    desc: '适合事件驱动剧情：每次推进有动机、有后果，并为后续留下可追踪线索。',
    entries: [
      { id: 'plot-goal', name: '本轮推进目标', content: '围绕当前场景最重要的冲突或目标推进一小步；不要同时开启过多新事件，也不要重复已经完成的情节。', enabled: true, role: 'system', position: 'before_main', order: 1 },
      { id: 'plot-cause', name: '行动与后果', content: '角色的决定必须来自已知动机、环境压力或已有信息；重要行动应产生合理后果，不能为制造戏剧性而随机转折。', enabled: true, role: 'system', position: 'after_main', order: 2 },
      { id: 'plot-continuity', name: '线索与信息边界', content: '保持物件、伤势、地点、时间、承诺和角色知情范围一致；将事实、猜测、误会和谎言区分清楚。', enabled: true, role: 'system', position: 'after_main', order: 3 },
      { id: 'plot-cliffhanger', name: '自然收束', content: '结尾可以留下一个具体动作、问题、发现或未解决的压力，但不要每轮强行反转或用刻意悬念截断自然交流。', enabled: true, role: 'system', position: 'after_history', order: 4 },
    ],
  },
];

function readLibraries(): Libraries {
  const parsed = JSON.parse(localStorage.getItem(LIBRARIES_KEY) || 'null') as Partial<Libraries> | null;
  return {
    single: Array.isArray(parsed?.single) ? parsed!.single! : [],
    group: Array.isArray(parsed?.group) ? parsed!.group! : [],
    offline: Array.isArray(parsed?.offline) ? parsed!.offline! : [],
  };
}

export function ensureDefaultOfflinePromptPresets(): PromptPreset[] {
  if (typeof window === 'undefined') return DEFAULT_OFFLINE_PRESETS;
  try {
    const libraries = readLibraries();
    const existing = new Set(libraries.offline.map(preset => preset.id));
    const added = DEFAULT_OFFLINE_PRESETS.filter(preset => !existing.has(preset.id));
    if (added.length) libraries.offline = [...libraries.offline, ...added];
    localStorage.setItem(LIBRARIES_KEY, JSON.stringify(libraries));
    const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}') as Partial<Record<PromptPresetScope, string>>;
    if (!libraries.offline.some(preset => preset.id === active.offline)) {
      active.offline = libraries.offline.find(preset => preset.isDefault)?.id || libraries.offline[0]?.id;
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    }
    return libraries.offline;
  } catch {
    return DEFAULT_OFFLINE_PRESETS;
  }
}

export function getPromptPresets(scope: PromptPresetScope): PromptPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const list = readLibraries()[scope];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function getActivePromptPreset(scope: PromptPresetScope): PromptPreset | null {
 if (typeof window === 'undefined') return null;
 try { const list = readLibraries()[scope]; if (!Array.isArray(list) || !list.length) return null; const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}') as Partial<Record<PromptPresetScope,string>>; return list.find(p => p.id === active[scope]) || list.find(p => p.isDefault) || list[0] || null; } catch { return null; }
}
export function getPromptPresetFlowSteps(scope: PromptPresetScope): Array<{ name: string; content: string }> {
 const preset = getActivePromptPreset(scope);
 if (!preset) return [{ name: '默认规则', content: FALLBACK[scope] }];
 return [...(preset.entries || [])]
   .filter(e => e.enabled !== false && String(e.content || '').trim())
   .sort((a,b) => Number(a.order || 0) - Number(b.order || 0))
   .map((e,i) => ({ name: String(e.name || '规则 ' + (i + 1)), content: String(e.content || '').trim() }));
}
export function buildPromptPresetInstructions(scope: PromptPresetScope): string {
 const preset = getActivePromptPreset(scope);
 if (!preset) return '【预设 App】\n' + FALLBACK[scope];
 const pos: Record<string,string> = { before_main:'主要规则前', after_main:'主要规则后', before_history:'历史记录前', after_history:'历史记录后', in_history:'历史记录内', post_history:'历史记录后置' };
 const entries = [...(preset.entries || [])].filter(e => e.enabled !== false && String(e.content || '').trim()).sort((a,b) => Number(a.order || 0) - Number(b.order || 0));
 return ['【预设 App · 当前生效】','分类：' + scope,'预设：' + preset.name,preset.desc || '',...entries.map((e,i) => '['+(i+1)+'] '+(e.name || '规则')+'（'+(pos[e.position || 'after_main'] || '主要规则后')+'；角色：'+(e.role || 'system')+'）\n'+String(e.content || '').trim())].filter(Boolean).join('\n\n');
}

export function setActivePromptPreset(scope: PromptPresetScope, presetId: string): void {
  if (typeof window === 'undefined') return;
  const libraries = readLibraries();
  if (!libraries[scope].some(preset => preset.id === presetId)) throw new Error('找不到要启用的预设。');
  const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}') as Partial<Record<PromptPresetScope, string>>;
  active[scope] = presetId;
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  window.dispatchEvent(new CustomEvent('sane333:prompt-presets-changed', { detail: { scope, presetId } }));
}
