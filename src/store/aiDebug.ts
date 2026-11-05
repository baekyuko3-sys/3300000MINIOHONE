import { reportPersistenceIssue } from './usePersistentState';
export type AiDebugLevel = 'info' | 'success' | 'error';
export interface AiDebugEntry {
  id: string; time: string; level: AiDebugLevel; event: string; message: string;
  provider?: string; model?: string; durationMs?: number; meta?: Record<string, unknown>;
}
const SECRET_FIELD = /^(?:apiKey|voiceApiKey|sttApiKey|imageApiKey|accessToken|refreshToken|githubToken|authorization|password|clientSecret|secret)$/i;
function redactSensitiveText(value: string): string {
  return value
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|client[_-]?secret)\s*[:=]\s*["']?)[^&\s"'<>]+/gi, '$1[REDACTED]');
}
function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[TRUNCATED]';
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(item => redactSensitiveValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_FIELD.test(key) ? '[REDACTED]' : redactSensitiveValue(child, depth + 1);
    }
    return output;
  }
  return value;
}
const KEY='phone:ai-debug-log';
const blockedDebugKeys = new Set<string>();
export function readAiDebugLog(): AiDebugEntry[] {
  if(typeof window==='undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) { blockedDebugKeys.delete(KEY); return []; }
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('AI_DEBUG_LOG_SCHEMA_INVALID');
    blockedDebugKeys.delete(KEY);
    return value.map(item => redactSensitiveValue(item) as AiDebugEntry);
  } catch (error) {
    blockedDebugKeys.add(KEY);
    reportPersistenceIssue('read:' + KEY, 'AI 调试日志损坏或格式不符；已锁定写入以保留原始记录', error);
    return [];
  }
}
function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined' || blockedDebugKeys.has(key)) return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI_DEBUG_TRACE_SCHEMA_INVALID');
    }
    window.localStorage.setItem(key, value);
    if (window.localStorage.getItem(key) !== value) throw new Error('AI_DEBUG_WRITE_VERIFY_FAILED');
    return true;
  } catch (error) {
    blockedDebugKeys.add(key);
    reportPersistenceIssue('write:' + key, 'AI 调试记录写入失败；原始诊断数据已保留', error);
    return false;
  }
}

function compactTraceValue(value: AiDebugTrace): AiDebugTrace {
  const copy: AiDebugTrace = { ...value };
  if (copy.request) {
    copy.request = {
      ...copy.request,
      system: String(copy.request.system || '').slice(0, 50000),
      messages: Array.isArray(copy.request.messages) ? copy.request.messages.slice(-16) : copy.request.messages,
      payload: undefined,
    };
  }
  copy.rawResponse = redactSensitiveText(String(copy.rawResponse || '')).slice(0, 30000);
  if (copy.error) copy.error = { message: redactSensitiveText(String(copy.error.message || '')), stack: copy.error.stack ? redactSensitiveText(copy.error.stack) : undefined };
  if (Array.isArray(copy.stages)) copy.stages = copy.stages.map(stage => ({ ...stage, detail: stage.detail ? redactSensitiveText(stage.detail) : undefined }));
  if (copy.request) copy.request = redactSensitiveValue(copy.request) as AiDebugTrace['request'];
  return redactSensitiveValue(copy) as AiDebugTrace;
}

export function pushAiDebugLog(entry: Omit<AiDebugEntry,'id'|'time'>) {
  if(typeof window==='undefined') return;
  const safeEntry = redactSensitiveValue(entry) as Omit<AiDebugEntry, 'id' | 'time'>;
  const next=[{...safeEntry,id:'dbg-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),time:new Date().toISOString()},...readAiDebugLog()].slice(0,100);
  safeSetItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('sane333:ai-debug-changed'));
}
export interface AiDebugTrace {
  id: string;
  time: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  context?: Record<string, unknown>;
  switches?: Record<string, unknown>;
  request?: { system?: string; messages?: unknown[]; payload?: unknown };
  rawResponse?: string;
  parsed?: Record<string, unknown>;
  final?: Record<string, unknown>;
  stage?: string;
  stages?: Array<{ stage: string; at: string; detail?: string }>;
  error?: { message: string; stack?: string };
}
const TRACE_KEY='phone:ai-debug-trace';
const traceKey = (conversationId?: string) => conversationId ? `${TRACE_KEY}:${conversationId}` : TRACE_KEY;
export function readAiDebugTrace(conversationId?: string): AiDebugTrace | null {
  if(typeof window==='undefined') return null;
  const key = traceKey(conversationId);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI_DEBUG_TRACE_SCHEMA_INVALID');
      blockedDebugKeys.delete(key);
      return redactSensitiveValue(value) as AiDebugTrace;
    }
    blockedDebugKeys.delete(key);
    if (conversationId) {
      const latestRaw = window.localStorage.getItem(TRACE_KEY);
      if (latestRaw !== null) {
        const latest = JSON.parse(latestRaw);
        if (!latest || typeof latest !== 'object' || Array.isArray(latest)) throw new Error('AI_DEBUG_TRACE_SCHEMA_INVALID');
        if (String(latest.context?.conversationId || '') === conversationId) return redactSensitiveValue(latest) as AiDebugTrace;
      }
    }
    return null;
  } catch (error) {
    blockedDebugKeys.add(key);
    reportPersistenceIssue('read:' + key, 'AI 调试追踪损坏；已锁定写入以保留原始记录', error);
    return null;
  }
}
export function writeAiDebugTrace(trace: Omit<AiDebugTrace,'id'|'time'> & Partial<Pick<AiDebugTrace,'id'|'time'>>) {
  if(typeof window==='undefined') return;
  const conversationId = String(trace.context?.conversationId || '');
  const value = compactTraceValue({...trace,id:trace.id||'trace-'+Date.now(),time:trace.time||new Date().toISOString()});
  const serialized = JSON.stringify(value);
  safeSetItem(traceKey(conversationId || undefined), serialized);
  // Also keep one global "latest" pointer. The chat UI will only use it when the
  // stored conversation id matches, which protects against legacy chat ids changing.
  safeSetItem(TRACE_KEY, serialized);
  window.dispatchEvent(new CustomEvent('sane333:ai-debug-trace-changed',{detail:{conversationId}}));
}
export function clearAiDebugLog(){ if(typeof window!=='undefined'){localStorage.removeItem(KEY);localStorage.removeItem(TRACE_KEY); Object.keys(localStorage).filter(k=>k.startsWith(TRACE_KEY+':')).forEach(k=>localStorage.removeItem(k));window.dispatchEvent(new CustomEvent('sane333:ai-debug-changed'));window.dispatchEvent(new CustomEvent('sane333:ai-debug-trace-changed'));} }
