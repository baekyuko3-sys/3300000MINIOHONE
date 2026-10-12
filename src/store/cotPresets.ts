export type CotPresetTarget = 'line' | 'offline' | 'group';

export interface CotPreset {
  id: string;
  title: string;
  displayTitle?: string;
  displayStyle?: 'minimal' | 'soft' | 'mono' | 'outline';
  tag: string;
  description: string;
  template: string;
exampleThinking: string;
  targets: CotPresetTarget[];
  createdAt: string;
  updatedAt: string;
}

const KEY = 'line:cot-presets';

export const DEFAULT_COT_PRESETS: CotPreset[] = [
  {
    id: 'cot-1',
    title: 'SANE333 角色决策链',
    displayTitle: 'COT',
    displayStyle: 'minimal',
    tag: '<cot>...</cot>',
    description: '以角色本人为中心，结合前文、设定、人设与状态决定自然回复。',
    template: '<cot>\n\nSTEP 1: CONTEXT\n- 当前消息\n- 角色上一条回复\n- 最近前文 / 当前话题\n- 未完成的事情\n\nSTEP 2: CHARACTER\n- 读取角色设定\n- 读取线上人设\n- 读取角色表达习惯\n- 只使用角色已知的信息\n\nSTEP 3: MEANING\n- 我这句话表面是什么意思？\n- 结合前文，我真正可能在表达什么？\n- 不过度脑补。\n\nSTEP 4: REACTION\n- 站在角色立场，他会怎么理解？\n- 他现在的情绪 / 状态是什么？\n- 他第一反应想做什么？\n\nSTEP 5: RESPONSE\n- 角色决定：回答 / 反问 / 调侃 / 安慰 / 延伸 / 简短回应 / 不展开\n- 决定回复长度和表达方式。\n- 不强制主动，不强制制造情绪。\n\nSTEP 6: CHECK\n- 是否符合角色设定、关系、前文和表达习惯？\n- 是否 OOC？\n- 是否使用角色不知道的信息？\n- 是否替用户决定行为、思想或反应？\n- 是否违反禁止事项？\n\nSTEP 7: FINAL\n- 只输出角色真正会发送的 LINE 消息。\n- 不解释分析过程，不复述用户消息，不使用 AI 式总结。\n\n</cot>',
    exampleThinking: '前文 → 角色设定 → 用户意思 → 角色反应 → 回复决定 → 状态栏 → 连续性/OOC检查。',
    targets: ['line', 'offline', 'group'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'cot-2',
    title: '潜意识与微反应',
    tag: '<cot>...</cot>',
    description: '关注视线、停顿、呼吸与无意识动作。',
    template: '在生成角色回复前，结合当前情境推断角色最自然的潜意识反应与微小行为，再决定克制或表达。',
    exampleThinking: '观察刺激点 → 第一反应 → 理性修正 → 自然表达。',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'cot-3',
    title: '克制隐忍暗涌',
    tag: '<think>...</think>',
    description: '适合冷淡、克制、高岭之花类型角色。',
    template: '保持角色外在克制，重点判断理智防线、微妙动摇与没有说出口的情绪。',
    exampleThinking: '刺激点 → 防御 → 裂痕 → 克制后的表达。',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
  {
    id: 'cot-4',
    title: '甜蜜宠溺与偏爱',
    tag: '<think>...</think>',
    description: '以偏爱、治愈和保护感为核心。',
    template: '优先考虑角色如何自然表达关心、偏爱与安全感，但不能替用户决定行动或情绪。',
    exampleThinking: '感受用户状态 → 判断需要的陪伴 → 用角色自己的方式表达。',
    targets: ['line', 'offline'],
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  },
];

export function getCotPresets(): CotPreset[] {
  if (typeof window === 'undefined') return DEFAULT_COT_PRESETS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(DEFAULT_COT_PRESETS));
      return DEFAULT_COT_PRESETS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COT_PRESETS;
    const defaultsById = new Map(DEFAULT_COT_PRESETS.map(item => [item.id, item]));
    const migrated = parsed.map((item: CotPreset) => {
      const isLegacyDefault = ['深度心理侧写与情感博弈预设', '深度心理侧写与情感博弈'].includes(item?.title);
      const isMalformedSane333 = item?.id === 'cot-1'
        && typeof item?.template === 'string'
        && item.template.includes('<cot>')
        && item.template.includes('</thinking>');
      if (!isLegacyDefault && !isMalformedSane333) return item;
      return {
        ...defaultsById.get('cot-1'),
        ...item,
        id: 'cot-1',
        title: DEFAULT_COT_PRESETS[0].title,
        displayTitle: item.displayTitle || DEFAULT_COT_PRESETS[0].displayTitle,
        displayStyle: item.displayStyle || DEFAULT_COT_PRESETS[0].displayStyle,
        description: DEFAULT_COT_PRESETS[0].description,
        tag: '<cot>...</cot>',
        template: DEFAULT_COT_PRESETS[0].template,
        exampleThinking: DEFAULT_COT_PRESETS[0].exampleThinking,
        targets: ['line', 'offline', 'group'],
      } as CotPreset;
    });
    if (!migrated.some(item => item.id === 'cot-1')) migrated.unshift(DEFAULT_COT_PRESETS[0]);
    const normalized = migrated;
    localStorage.setItem(KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return DEFAULT_COT_PRESETS;
  }
}

export function saveCotPresets(presets: CotPreset[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(presets));
  window.dispatchEvent(new CustomEvent('sane333:cot-presets-changed'));
}

export function exportCotPresets(presets = getCotPresets()): string {
  return JSON.stringify({ type: 'sane333-cot-presets', version: 1, exportedAt: new Date().toISOString(), presets }, null, 2);
}

export function importCotPresets(raw: string): CotPreset[] {
  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed) ? parsed : parsed?.presets;
  if (!Array.isArray(incoming)) throw new Error('不是有效的思维链预设文件。');
  return incoming.map((item: any, index: number) => ({
    ...item,
    id: String(item.id || `cot-import-${Date.now()}-${index}`),
    title: String(item.title || '未命名思维链预设'),
    displayTitle: String(item.displayTitle || item.title || 'COT'),
    displayStyle: ['minimal','soft','mono','outline'].includes(item.displayStyle) ? item.displayStyle : 'minimal',
    tag: String(item.tag || '<cot>...</cot>'),
    description: String(item.description || ''),
    template: String(item.template || ''),
    exampleThinking: String(item.exampleThinking || ''),
    targets: Array.isArray(item.targets) ? item.targets : ['line'],
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  })) as CotPreset[];
}

export type CotAssignments = Partial<Record<CotPresetTarget, string>>;
const ASSIGN_KEY = 'line:cot-assignments';
export function getCotAssignments(): CotAssignments { if (typeof window === 'undefined') return {}; try { return JSON.parse(window.localStorage.getItem(ASSIGN_KEY) || '{}'); } catch { return {}; } }
export function saveCotAssignment(target: CotPresetTarget, presetId: string) { if (typeof window === 'undefined') return; const next={...getCotAssignments(),[target]:presetId}; window.localStorage.setItem(ASSIGN_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('sane333:cot-assignments-changed')); }
export function getCotForTarget(target: CotPresetTarget): CotPreset | null {
  const presets = getCotPresets();
  const assignedId = getCotAssignments()[target];
  return presets.find(item => item.id === assignedId)
    || presets.find(item => item.targets.includes(target))
    || (target === 'group' ? presets.find(item => item.targets.includes('line')) || null : null);
}
