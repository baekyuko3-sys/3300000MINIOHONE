import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bell, CheckCircle2, Database, Download, Image as ImageIcon, KeyRound,
  Mic2, RefreshCw, Save, Server, Shield, SlidersHorizontal, Smartphone, Sparkles,
  Trash2, Volume2, Wifi, BellRing
} from 'lucide-react';
import type { ScreenType } from '../../types';
import type { ImportedCharacter } from '../../data/characterImport';
import type { CharacterAiProfile } from '../../store/characterAiProfiles';
import { buildCharacterAiProfile } from '../../store/characterAiProfiles';
import { usePersistentState } from '../../store/usePersistentState';
import { DEFAULT_APP_SETTINGS, type AppSettings, readAppSettings, saveAppSettings } from '../../store/appSettings';
import { applyApiPreset, deleteApiPreset, readApiPresets, settingsToApiPreset, upsertApiPreset, type ApiPreset } from '../../store/apiPresets';
import { clearAiDebugLog, readAiDebugLog, type AiDebugEntry } from '../../store/aiDebug';
import { listOpenAiCompatibleModels, testAiConnection } from '../../ai/aiEngine';
import { generateImage, generateSpeech } from '../../ai/mediaEngine';
import { playAppSound, saveSoundFile, type AppSoundKind } from '../../store/soundManager';
import { exportMedia, importMedia } from '../../store/mediaVault';
import {
  getBackgroundHeartbeat,
  requestNotificationPermission,
  stopBackgroundRuntime,
  startBackgroundRuntime,
} from '../../store/backgroundRuntime';
import { getGitHubSyncConfig, getGitHubToken, pullSnapshotFromGitHub, saveGitHubSyncConfig, saveGitHubToken, syncSnapshotToGitHub, testGitHubSync } from '../../store/githubSync';

function collectLocalData(includeSecrets = true) {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || (!key.startsWith('phone:') && !key.startsWith('line:'))) continue;
    try { data[key] = JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { data[key] = localStorage.getItem(key); }
  }

  if (!includeSecrets && data['phone:settings'] && typeof data['phone:settings'] === 'object') {
    const safe = { ...(data['phone:settings'] as Record<string, unknown>) };
    for (const key of ['apiKey', 'voiceApiKey', 'sttApiKey', 'imageApiKey']) safe[key] = '';
    for (const key of ['chatApiOverride', 'momentsApiOverride']) {
      if (safe[key] && typeof safe[key] === 'object') {
        safe[key] = { ...(safe[key] as Record<string, unknown>), apiKey: '' };
      }
    }
    data['phone:settings'] = safe;
    if (Array.isArray(data['phone:character-ai-profiles'])) {
      data['phone:character-ai-profiles'] = (data['phone:character-ai-profiles'] as Array<Record<string, unknown>>).map(profile => ({ ...profile, apiKey: '' }));
    }
  }

  return data;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function prettyBytes(value: number) {
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

export function SettingsScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const importRef = useRef<HTMLInputElement>(null);
  const messageSoundFileRef = useRef<HTMLInputElement>(null);
  const momentsSoundFileRef = useRef<HTMLInputElement>(null);
  const callSoundFileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettingsState] = usePersistentState<AppSettings>('phone:settings', () => readAppSettings());
  const [notice, setNotice] = useState('');
  const [openSection, setOpenSection] = useState<'ai' | 'voice' | 'image' | 'data' | 'sound' | 'background' | 'debug'>('ai');
  const [testing, setTesting] = useState(false);
  const [aiConnection, setAiConnection] = useState<{ status: 'idle' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [loadingModels, setLoadingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [mediaModels, setMediaModels] = useState<{ voice: string[]; stt: string[]; image: string[] }>({ voice: [], stt: [], image: [] });
  const [mediaModelBusy, setMediaModelBusy] = useState<'voice' | 'stt' | 'image' | null>(null);
  const [heartbeat, setHeartbeat] = useState(() => getBackgroundHeartbeat());
  const [includeSecretsInBackup, setIncludeSecretsInBackup] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [githubConfig, setGithubConfig] = useState(() => getGitHubSyncConfig());
  const [githubToken, setGithubToken] = useState(() => getGitHubToken());
  const [githubBusy, setGithubBusy] = useState(false);
  const [characters] = usePersistentState<ImportedCharacter[]>('phone:characters', []);
  const [characterAiProfiles, setCharacterAiProfiles] = usePersistentState<CharacterAiProfile[]>('phone:character-ai-profiles', []);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [apiPresets, setApiPresets] = useState<ApiPreset[]>(() => readApiPresets());
  const [apiPresetName, setApiPresetName] = useState('');
  const [debugLog, setDebugLog] = useState<AiDebugEntry[]>(() => readAiDebugLog());


  useEffect(() => { const fn=()=>setDebugLog(readAiDebugLog()); window.addEventListener('sane333:ai-debug-changed',fn); return () => window.removeEventListener('sane333:ai-debug-changed',fn); }, []);

  const localStats = useMemo(() => {
    const data = collectLocalData();
    const size = new Blob([JSON.stringify(data)]).size;
    return { keys: Object.keys(data).length, size };
  }, [notice, settings]);

  const uploadSound = async (kind: AppSoundKind, file?: File) => {
    if (!file) return;
    try {
      const ref = await saveSoundFile(file, kind);
      if (kind === 'message') update('messageSoundRef', ref);
      else if (kind === 'moments') update('momentsSoundRef', ref);
      else update('callRingtoneRef', ref);
      notify('自定义铃声已保存到本机');
    } catch (error) {
      notify(error instanceof Error ? error.message : '铃声保存失败');
    }
  };

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const saveGithubField = (patch: Parameters<typeof saveGitHubSyncConfig>[0]) => setGithubConfig(saveGitHubSyncConfig(patch));

  const handleGithubTest = async () => {
    setGithubBusy(true);
    try { saveGitHubToken(githubToken); const login = await testGitHubSync(githubConfig, githubToken); notify(`GitHub 已连接：${login}`); }
    catch (error) { notify(error instanceof Error ? error.message : 'GitHub 连接失败'); }
    finally { setGithubBusy(false); }
  };

  const handleGithubPush = async () => {
    setGithubBusy(true);
    try {
      saveGitHubToken(githubToken);
      const result = await syncSnapshotToGitHub(collectLocalData(false), githubConfig, githubToken);
      setGithubConfig(prev => ({ ...prev, enabled: true, lastSyncedAt: result.syncedAt }));
      notify('本机数据已同步到 GitHub');
    } catch (error) { notify(error instanceof Error ? error.message : 'GitHub 同步失败'); }
    finally { setGithubBusy(false); }
  };

  const handleGithubPull = async () => {
    setGithubBusy(true);
    try {
      saveGitHubToken(githubToken);
      const result = await pullSnapshotFromGitHub(githubConfig, githubToken);
      if (!result.data || typeof result.data !== 'object') throw new Error('GITHUB_DATA_EMPTY');
      for (const [key, value] of Object.entries(result.data as Record<string, unknown>)) {
        if (key.startsWith('phone:') || key.startsWith('line:')) localStorage.setItem(key, JSON.stringify(value));
      }
      notify('GitHub 数据已恢复；正在重新载入项目');
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) { notify(error instanceof Error ? error.message : 'GitHub 恢复失败'); }
    finally { setGithubBusy(false); }
  };

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = saveAppSettings({ [key]: value });
    setSettingsState(next);
  };

  const saveCurrentApiPreset = () => {
    const name = apiPresetName.trim() || window.prompt('给这个 API 预设起个名字')?.trim();
    if (!name) return;
    upsertApiPreset(settingsToApiPreset(settings, name));
    setApiPresets(readApiPresets()); setApiPresetName(''); notify('API 预设已保存');
  };
  const applySavedApiPreset = (preset: ApiPreset) => {
    const next = saveAppSettings(applyApiPreset(preset)); setSettingsState(next);
    notify('已切换 API 预设：' + preset.name);
  };
  const removeSavedApiPreset = (id: string) => {
    if (!window.confirm('删除这个 API 预设？')) return;
    deleteApiPreset(id); setApiPresets(readApiPresets()); notify('API 预设已删除');
  };

  const selectedCharacter = characters.find(character => character.id === selectedCharacterId) || null;
  const selectedCharacterAi = selectedCharacter
    ? characterAiProfiles.find(profile => profile.characterId === selectedCharacter.id) || null
    : null;

  const createOrUpdateCharacterAi = (patch: Partial<CharacterAiProfile>) => {
    if (!selectedCharacter) return;
    const base = selectedCharacterAi || buildCharacterAiProfile(
      {
        provider: settings.provider,
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        streaming: settings.streaming,
        contextLength: settings.contextLength,
        maxOutputTokens: settings.maxOutputTokens,
        autoSave: settings.autoSave,
        temperature: settings.temperature,
        topP: settings.topP,
        topK: settings.topK,
        frequencyPenalty: settings.frequencyPenalty,
        presencePenalty: settings.presencePenalty,
        seed: settings.seed,
      },
      selectedCharacter.id,
      selectedCharacter.name,
    );
    const updated = { ...base, ...patch, updatedAt: new Date().toISOString() };
    setCharacterAiProfiles(prev => {
      const index = prev.findIndex(profile => profile.id === updated.id);
      return index >= 0
        ? prev.map(profile => profile.id === updated.id ? updated : profile)
        : [updated, ...prev];
    });
  };

  const fetchMediaModels = async (kind: 'voice' | 'stt' | 'image') => {
    const config = kind === 'voice'
      ? { base: settings.voiceBaseUrl, key: settings.voiceApiKey }
      : kind === 'stt'
        ? { base: settings.sttBaseUrl, key: settings.sttApiKey }
        : { base: settings.imageBaseUrl, key: settings.imageApiKey };
    if (!config.base.trim() || !config.key.trim()) { notify('请先填写 API Base URL 和 API Key'); return; }
    setMediaModelBusy(kind);
    try {
      const models = await listOpenAiCompatibleModels({
        provider: 'openai-compatible',
        apiBaseUrl: config.base,
        apiKey: config.key,
        model: kind === 'voice' ? settings.voiceModel : kind === 'stt' ? settings.sttModel : settings.imageModel,
        streaming: false,
        contextLength: 4,
        maxOutputTokens: 64,
        autoSave: true,
        temperature: 0.2,
        topP: 1,
        topK: 40,
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      });
      setMediaModels(prev => ({ ...prev, [kind]: models }));
      notify(models.length ? '模型列表已更新' : '接口没有返回模型列表');
    } catch (error) {
      notify(error instanceof Error ? error.message : '拉取模型失败');
    } finally {
      setMediaModelBusy(null);
    }
  };

  const copyChatToMedia = (kind: 'voice' | 'image') => {
    if (kind === 'voice') {
      update('voiceBaseUrl', settings.apiBaseUrl);
      update('voiceApiKey', settings.apiKey);
      update('voiceModel', settings.model);
      notify('已复制聊天 API 到语音配置');
    } else {
      update('imageBaseUrl', settings.apiBaseUrl);
      update('imageApiKey', settings.apiKey);
      update('imageModel', settings.model);
      notify('已复制聊天 API 到图片配置');
    }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const data = parsed?.data;
      if (!data || typeof data !== 'object') throw new Error('备份文件格式不正确');

      for (const [key, value] of Object.entries(data)) {
        if (!key.startsWith('phone:') && !key.startsWith('line:')) continue;
        localStorage.setItem(key, JSON.stringify(value));
      }

      if (parsed?.media && typeof parsed.media === 'object') {
        await importMedia(parsed.media as Record<string, string>);
      }

      window.dispatchEvent(new Event('sane333:data-restored'));
      notify('角色、聊天、设置与媒体已恢复；正在重新载入本机项目状态');
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      notify(error instanceof Error ? error.message : '恢复失败');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const exportFullBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const media = await exportMedia().catch(() => ({} as Record<string, string>));
      downloadJson(`sane333-full-backup-${Date.now()}.json`, {
        version: 4,
        exportedAt: new Date().toISOString(),
        data: collectLocalData(includeSecretsInBackup),
        media,
      });
      notify(`完整备份已导出 · ${Object.keys(media).length} 个媒体文件`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '备份导出失败');
    } finally {
      setBackingUp(false);
    }
  };

  const clearAll = () => {
    if (!window.confirm('确定清空本机全部角色、聊天、世界书、记忆、设置与剧情存档吗？此操作不可撤销。')) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('phone:') || key?.startsWith('line:')) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
    setSettingsState(DEFAULT_APP_SETTINGS);
    stopBackgroundRuntime();
    notify('本机项目空间已清空');
    window.setTimeout(() => window.location.reload(), 500);
  };

  const testVoice = async () => {
    try {
      const media = await generateSpeech('私人设备语音连接测试。', settings);
      if (media?.url) {
        const audio = new Audio(media.url);
        await audio.play();
      }
      notify(media?.source === 'browser' ? '浏览器语音已调用' : 'TTS 语音连接成功');
    } catch (error) {
      notify(error instanceof Error ? error.message : '语音测试失败');
    }
  };

  const testImage = async () => {
    try {
      const result = await generateImage('a quiet cinematic portrait, editorial photography, no text', settings);
      notify(result.url ? '图片接口已返回结果' : '图片接口无结果');
    } catch (error) {
      notify(error instanceof Error ? error.message : '图片测试失败');
    }
  };

  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      update('notificationEnabled', true);
      notify('通知权限已开启');
    } else if (permission === 'denied') {
      notify('浏览器拒绝了通知权限，请在站点设置里重新开启');
    } else {
      notify('当前浏览器不支持系统通知');
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      <header className="relative z-10 px-5 pt-12 pb-3.5 border-b border-[rgba(40,36,31,.12)] bg-[rgba(247,244,238,.88)] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/40 border border-white/60 grid place-items-center text-[#242323] shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[8px] font-mono tracking-[2px] text-[#817a72] uppercase">SYSTEM / CONNECTION / STORAGE</div>
            <h2 className="font-serif font-bold text-base tracking-tight text-[#242323]">设置 · Control Center</h2>
          </div>
        </div>
        <span className="text-[8px] font-mono text-[#8b7560]">{localStats.keys} KEYS</span>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar p-4 space-y-3 text-xs">
        <section className="relative overflow-hidden p-4 rounded-2xl bg-white/65 border border-[rgba(40,36,31,.1)]">
          <div className="absolute -right-8 -top-10 w-28 h-28 rounded-full border border-[#d4aab5]/20" />
          <div className="absolute right-3 bottom-2 text-5xl font-serif text-[#d4aab5]/10">333</div>
          <div className="relative text-[8px] font-mono tracking-[2px] text-[#aaa]">SANE333 / PRIVATE DEVICE</div>
          <div className="relative mt-2 text-[17px] font-serif font-bold text-[#292724]">你的 API、角色与存档，都在这里。</div>
          <div className="relative mt-1 text-[9px] text-[#817a72] leading-relaxed">Gemini、OpenAI Compatible、语音、图片、记忆与后台运行，都从这里管理。</div>
        </section>

        <div className="grid grid-cols-7 gap-1.5">
          {[
            ['ai', 'AI'],
            ['voice', '语音'],
            ['image', '图片'],
            ['data', '数据'],
            ['sound', '声音'],
            ['background', '后台'],
            ['debug', '诊断'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setOpenSection(key as typeof openSection)}
              className={`py-2 rounded-xl border text-[9px] transition-all ${openSection === key ? 'bg-[#d4aab5] border-[#d4aab5] text-white shadow-xs' : 'bg-white/55 border-[rgba(40,36,31,.1)] text-[#5f5952]'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {openSection === 'ai' && (
          <section className="p-4 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)]">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-3">
              <KeyRound className="w-3.5 h-3.5" /> CHAT AI / LLM
            </div>
            <div className="space-y-2.5">
              <div className="p-3 rounded-2xl bg-white/55 border border-black/5">
                <div className="flex items-center justify-between mb-2"><div><div className="text-[10px] font-semibold text-[#403b36]">API 预设</div><div className="text-[8px] text-[#938b83]">保存多套 API 配置，随时切换。</div></div><span className="text-[8px] text-[#8b7560]">{apiPresets.length} 套</span></div>
                <div className="flex gap-1.5"><input value={apiPresetName} onChange={e=>setApiPresetName(e.target.value)} placeholder="例如 Gemini / Vertex / OpenRouter" className="flex-1 bg-white rounded-xl p-2.5 text-[10px] outline-none" /><button onClick={saveCurrentApiPreset} className="px-3 rounded-xl bg-[#292724] text-white text-[9px]">保存当前</button></div>
                {apiPresets.length>0 && <div className="mt-2 max-h-32 overflow-y-auto space-y-1">{apiPresets.map(p=><div key={p.id} className="flex items-center gap-1.5 bg-white/70 rounded-xl px-2.5 py-2"><button onClick={()=>applySavedApiPreset(p)} className="flex-1 text-left min-w-0"><div className="text-[9px] font-semibold truncate">{p.name}</div><div className="text-[8px] text-[#999] truncate">{p.provider} · {p.model||'未选模型'}</div></button><button onClick={()=>removeSavedApiPreset(p.id)} className="text-[8px] text-[#b47783] px-1.5">删除</button></div>)}</div>}
              </div>

              <label className="block text-[9px] text-[#7e7770]">Provider
                <select value={settings.provider} onChange={e => update('provider', e.target.value as AppSettings['provider'])} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-xs outline-none">
                  <option value="gemini">Google Gemini</option>
                  <option value="openai-compatible">OpenAI Compatible · 第三方</option>
                  <option value="custom">Custom OpenAI Endpoint</option>
                </select>
              </label>
              <label className="block text-[9px] text-[#7e7770]">API Base URL
                <input value={settings.apiBaseUrl} onChange={e => update('apiBaseUrl', e.target.value)} placeholder={settings.provider === 'gemini' ? '留空 = Google Gemini API' : '例如 https://your-provider.example/v1'} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none font-mono" />
              </label>
              <label className="block text-[9px] text-[#7e7770]">API Key
                <input type="password" value={settings.apiKey} onChange={e => update('apiKey', e.target.value)} placeholder="只保存在这台设备的浏览器本地" className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-xs outline-none" />
              </label>
              <label className="block text-[9px] text-[#7e7770]">Model
                <div className="flex gap-1.5 mt-1">
                  <input value={settings.model} onChange={e => update('model', e.target.value)} placeholder="例如 gemini-2.5-flash / 你的第三方模型 ID" className="flex-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none font-mono" />
                  {settings.provider !== 'gemini' && (
                    <button
                      disabled={loadingModels}
                      onClick={async () => {
                        setLoadingModels(true);
                        try {
                          const models = await listOpenAiCompatibleModels(settings);
                          setAvailableModels(models);
                          notify(models.length ? `读取到 ${models.length} 个模型` : '接口没有返回模型列表');
                        } catch (error) {
                          notify(error instanceof Error ? error.message : '读取模型失败');
                        } finally {
                          setLoadingModels(false);
                        }
                      }}
                      className="px-2.5 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-40"
                      title="从兼容接口读取 /models"
                    >
                      {loadingModels ? '…' : '读取'}
                    </button>
                  )}
                </div>
              </label>
              {availableModels.length > 0 && (
                <div className="mt-1.5 rounded-xl bg-white/60 border border-black/5 overflow-hidden">
                  <div className="px-2.5 py-1.5 text-[8px] text-[#938b83] border-b border-black/5 flex items-center justify-between">
                    <span>模型列表 · {availableModels.length} 个</span>
                    <span>可下滑选择</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto overscroll-contain p-1.5 space-y-1">
                    {availableModels.map(model => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => update('model', model)}
                        className={"w-full text-left px-2.5 py-2 rounded-lg text-[9px] font-mono truncate transition-colors " + (settings.model === model ? 'bg-[#292724] text-white' : 'bg-white/50 text-[#675f58] hover:bg-white')}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Top P<input type="number" step="0.05" min={0} max={1} value={settings.topP} onChange={e=>update('topP',Math.max(0,Math.min(1,Number(e.target.value)||0)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" /></label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Top K<input type="number" min={1} max={100} value={settings.topK} onChange={e=>update('topK',Math.max(1,Math.min(100,Number(e.target.value)||40)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" /></label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Seed<input type="number" value={settings.seed ?? ''} onChange={e=>update('seed',e.target.value===''?null:Number(e.target.value))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" placeholder="自动" /></label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">频率惩罚<input type="number" step="0.05" min={-2} max={2} value={settings.frequencyPenalty} onChange={e=>update('frequencyPenalty',Math.max(-2,Math.min(2,Number(e.target.value)||0)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" /></label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">存在惩罚<input type="number" step="0.05" min={-2} max={2} value={settings.presencePenalty} onChange={e=>update('presencePenalty',Math.max(-2,Math.min(2,Number(e.target.value)||0)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" /></label>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">上下文
                  <input type="number" min={4} max={200} value={settings.contextLength} onChange={e => update('contextLength', Math.max(4, Math.min(200, Number(e.target.value) || 24)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                  <span className="text-[8px] text-[#938b83]">轮</span>
                </label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Temperature
                  <input type="number" step="0.05" min={0} max={2} value={settings.temperature} onChange={e => update('temperature', Math.max(0, Math.min(2, Number(e.target.value) || 0.85)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                </label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">最大输出
                  <input type="number" min={128} max={12000} value={settings.maxOutputTokens} onChange={e => update('maxOutputTokens', Math.max(128, Math.min(12000, Number(e.target.value) || 1200)))} className="w-full mt-1 bg-transparent outline-none font-mono text-xs" />
                  <span className="text-[8px] text-[#938b83]">tokens</span>
                </label>
                <button onClick={() => update('streaming', !settings.streaming)} className="bg-white/55 rounded-xl p-2.5 text-left text-[9px]">
                  Streaming
                  <div className="mt-1 font-semibold text-[#8b7560]">{settings.streaming ? 'ON' : 'OFF'}</div>
                </button>
              </div>
            </div>

            <div className="mt-3 p-3 rounded-2xl bg-white/45 border border-black/5">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">CHARACTER ROUTING · 独立 API</div>
              <div className="mt-1 text-[9px] text-[#7a736c] leading-relaxed">每个角色可以单独指定 Provider、Base URL、Key 与模型；没有启用独立档案时，默认跟随全局 AI。</div>
              <select
                value={selectedCharacterId}
                onChange={e => setSelectedCharacterId(e.target.value)}
                className="w-full mt-2 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none"
              >
                <option value="">选择一个已导入角色…</option>
                {characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
              {selectedCharacter && (
                <div className="mt-2.5 space-y-2">
                  <button
                    onClick={() => createOrUpdateCharacterAi({ enabled: !(selectedCharacterAi?.enabled ?? false) })}
                    className="w-full p-2.5 rounded-xl bg-[#ebe7df] flex items-center justify-between text-left"
                  >
                    <div><div className="text-[10px] font-semibold text-[#403b36]">{selectedCharacter.name}</div><div className="text-[8px] text-[#8b8782] mt-0.5">{selectedCharacterAi?.enabled ? '正在使用独立 AI 配置' : '当前跟随全局 AI'}</div></div>
                    <span className="text-[9px] font-mono text-[#8b7560]">{selectedCharacterAi?.enabled ? 'CUSTOM ON' : 'GLOBAL'}</span>
                  </button>
                  {selectedCharacterAi?.enabled && (
                    <>
                      <label className="block text-[8px] text-[#8b8782]">Provider
                        <select value={selectedCharacterAi.provider} onChange={e => createOrUpdateCharacterAi({ provider: e.target.value as CharacterAiProfile['provider'] })} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none">
                          <option value="gemini">Google Gemini</option>
                          <option value="openai-compatible">OpenAI Compatible</option>
                          <option value="custom">Custom Endpoint</option>
                        </select>
                      </label>
                      <label className="block text-[8px] text-[#8b8782]">Base URL
                        <input value={selectedCharacterAi.apiBaseUrl} onChange={e => createOrUpdateCharacterAi({ apiBaseUrl: e.target.value })} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[9px] font-mono outline-none" />
                      </label>
                      <label className="block text-[8px] text-[#8b8782]">API Key
                        <input type="password" value={selectedCharacterAi.apiKey} onChange={e => createOrUpdateCharacterAi({ apiKey: e.target.value })} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none" />
                      </label>
                      <label className="block text-[8px] text-[#8b8782]">Model
                        <input value={selectedCharacterAi.model} onChange={e => createOrUpdateCharacterAi({ model: e.target.value })} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[9px] font-mono outline-none" />
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">Temperature
                          <input type="number" step="0.05" min="0" max="2" value={selectedCharacterAi.temperature} onChange={e => createOrUpdateCharacterAi({ temperature: Math.max(0, Math.min(2, Number(e.target.value) || 0.85)) })} className="w-full mt-1 bg-transparent outline-none text-xs font-mono text-[#4a4540]" />
                        </label>
                        <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">Context
                          <input type="number" min="4" max="200" value={selectedCharacterAi.contextLength} onChange={e => createOrUpdateCharacterAi({ contextLength: Math.max(4, Math.min(200, Number(e.target.value) || 24)) })} className="w-full mt-1 bg-transparent outline-none text-xs font-mono text-[#4a4540]" />
                        </label>
                        <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">Max output
                          <input type="number" min="128" max="12000" value={selectedCharacterAi.maxOutputTokens} onChange={e => createOrUpdateCharacterAi({ maxOutputTokens: Math.max(128, Math.min(12000, Number(e.target.value) || 1200)) })} className="w-full mt-1 bg-transparent outline-none text-xs font-mono text-[#4a4540]" />
                        </label>
                      </div>
                      <button onClick={() => createOrUpdateCharacterAi({
                        apiBaseUrl: settings.apiBaseUrl,
                        apiKey: settings.apiKey,
                        model: settings.model,
                        provider: settings.provider,
                        streaming: settings.streaming,
                        contextLength: settings.contextLength,
                        maxOutputTokens: settings.maxOutputTokens,
                        temperature: settings.temperature,
                      })} className="w-full py-2 rounded-xl bg-white/70 border border-black/5 text-[9px] text-[#685f58]">复制当前全局配置到角色</button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/40 border border-black/5 p-2.5">
              <Shield className="w-3.5 h-3.5 text-[#8b7560] mt-0.5 shrink-0" />
              <div className="text-[8.5px] leading-relaxed text-[#7a726a]">
                API Key 默认存浏览器本地。某些第三方接口会禁止浏览器跨域；遇到 CORS 时，再把同一配置交给后端代理即可。App 本身不会自动上传你的角色数据。
              </div>
            </div>

            <div className="mt-3 p-3 rounded-2xl bg-white/45 border border-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">MEMORY / 自动长期记忆</div>
                  <div className="mt-1 text-[9px] text-[#6f6860]">聊天达到指定消息数后，AI 会整理值得长期保留的关系、经历与偏好。</div>
                </div>
                <button onClick={() => update('memoryEnabled', !settings.memoryEnabled)} className="text-[9px] font-mono text-[#8b7560]">
                  {settings.memoryEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              {settings.memoryEnabled && (
                <>
                  <label className="block mt-2.5 text-[8px] text-[#8b8782]">记忆整理模型
                    <input value={settings.memoryModel} onChange={e => update('memoryModel', e.target.value)} placeholder={settings.model} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] font-mono outline-none" />
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">整理模式
                      <select value={settings.memoryMode} onChange={e => update('memoryMode', e.target.value as AppSettings['memoryMode'])} className="w-full mt-1 bg-transparent outline-none text-[10px]">
                        <option value="hybrid">混合记忆 · 推荐</option><option value="diary">日记型</option><option value="facts">事实表格型</option><option value="relationship">关系型</option>
                      </select>
                    </label>
                    <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">总结 Temperature
                      <input type="number" step="0.05" min="0" max="1" value={settings.memoryTemperature} onChange={e => update('memoryTemperature', Math.max(0, Math.min(1, Number(e.target.value) || 0.2)))} className="w-full mt-1 bg-transparent outline-none text-xs font-mono" />
                    </label>
                  </div>
                  <label className="block mt-2 text-[8px] text-[#8b8782]">读取最近聊天
                    <select value={settings.memoryContextMessages} onChange={e => update('memoryContextMessages', Number(e.target.value))} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none">
                      {[20,40,60,80,120].map(value => <option key={value} value={value}>最近 {value} 条</option>)}
                    </select>
                  </label>
                  <label className="flex items-center justify-between mt-2 p-2.5 rounded-xl bg-white/55 border border-black/5 text-[9px] text-[#6f6860]"><span>独立记忆引擎</span>
                    <button onClick={() => update('memoryEnabled', !settings.memoryEnabled)} className="font-mono text-[#8b7560]">{settings.memoryEnabled ? 'ON' : 'OFF'}</button>
                  </label>
                  <div className="mt-2.5 p-2.5 rounded-xl bg-white/55 border border-black/5">
                    <div className="text-[8px] font-mono text-[#8b8782]">模式专用模型 · 留空则回退到记忆整理模型</div>
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      <label className="text-[8px] text-[#8b8782]">日记<input value={settings.memoryDiaryModel} onChange={e => update('memoryDiaryModel', e.target.value)} placeholder="同记忆模型" className="w-full mt-1 bg-white/75 rounded-lg p-2 text-[9px] font-mono outline-none" /></label>
                      <label className="text-[8px] text-[#8b8782]">事实<input value={settings.memoryFactsModel} onChange={e => update('memoryFactsModel', e.target.value)} placeholder="同记忆模型" className="w-full mt-1 bg-white/75 rounded-lg p-2 text-[9px] font-mono outline-none" /></label>
                      <label className="text-[8px] text-[#8b8782]">关系<input value={settings.memoryRelationshipModel} onChange={e => update('memoryRelationshipModel', e.target.value)} placeholder="同记忆模型" className="w-full mt-1 bg-white/75 rounded-lg p-2 text-[9px] font-mono outline-none" /></label>
                    </div>
                  </div>

                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button disabled={testing} onClick={async () => {
                setTesting(true);
                setAiConnection({ status: 'idle', message: '正在测试连接…' });
                try {
                  const result = await testAiConnection(settings);
                  const message = result.text || 'AI 连接成功';
                  setAiConnection({ status: 'success', message });
                  notify(message);
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'AI 连接失败';
                  setAiConnection({ status: 'error', message });
                  notify(message);
                } finally {
                  setTesting(false);
                }
              }} className="py-2.5 rounded-xl bg-[#292724] text-white text-[10px] disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" /> {testing ? '测试中…' : '测试聊天 API'}
              </button>
              <button onClick={() => { update('autoSave', !settings.autoSave); notify(settings.autoSave ? '自动保存关闭' : '自动保存开启'); }} className="py-2.5 rounded-xl bg-white/65 border border-[rgba(40,36,31,.1)] text-[#4d4843] text-[10px]">
                自动保存 · {settings.autoSave ? 'ON' : 'OFF'}
              </button>
            </div>
            {aiConnection.status !== 'idle' && (
              <div className={"mt-2.5 rounded-xl border px-3 py-2 text-[9px] " + (aiConnection.status === 'success' ? 'bg-[#eef8f0] border-[#cce8d1] text-[#3d7650]' : 'bg-[#fff1f1] border-[#f0cccc] text-[#9a4d4d]')}>
                <div className="font-semibold">{aiConnection.status === 'success' ? '● 连接成功' : '● 连接失败'}</div>
                <div className="mt-0.5 font-mono break-all">{aiConnection.message}</div>
              </div>
            )}
          </section>
        )}

        {openSection === 'debug' && (
          <section className="p-4 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)]">
            <div className="flex items-center justify-between mb-3">
              <div><div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">SANE333 CONSOLE / AI</div><div className="text-sm font-semibold">AI 诊断后台</div><div className="text-[9px] text-[#8b8782] mt-0.5">记录最近请求、模型、耗时与错误，不记录完整 API Key。</div></div>
              <button onClick={()=>{clearAiDebugLog();setDebugLog([]);}} className="text-[9px] text-[#a06e79]">清空</button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white/65 rounded-xl p-2.5"><div className="text-[8px] text-[#999]">请求</div><div className="text-base font-semibold">{debugLog.filter(x=>x.event==='request:start').length}</div></div>
              <div className="bg-white/65 rounded-xl p-2.5"><div className="text-[8px] text-[#999]">成功</div><div className="text-base font-semibold">{debugLog.filter(x=>x.level==='success').length}</div></div>
              <div className="bg-white/65 rounded-xl p-2.5"><div className="text-[8px] text-[#999]">错误</div><div className="text-base font-semibold">{debugLog.filter(x=>x.level==='error').length}</div></div>
            </div>
            <div className="max-h-[360px] overflow-y-auto space-y-1.5">
              {debugLog.length ? (
                debugLog.map(item => (
                  <div key={item.id} className="bg-white/70 rounded-xl p-2.5 border border-black/5">
                    <div className="flex justify-between gap-2">
                      <span className={`text-[9px] font-semibold ${item.level === 'error' ? 'text-[#b35f6e]' : item.level === 'success' ? 'text-[#65856b]' : 'text-[#756f69]'}`}>
                        {item.event}
                      </span>
                      <span className="text-[8px] text-[#aaa]">{new Date(item.time).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-[9px] mt-1 leading-relaxed break-words">{item.message}</div>
                    <div className="text-[8px] text-[#999] mt-1">
                      {item.provider || ''} · {item.model || ''}{item.durationMs ? ' · ' + item.durationMs + 'ms' : ''}
                    </div>
                    {item.meta && (
                      <pre className="mt-1 text-[7px] text-[#8b8580] whitespace-pre-wrap break-words">
                        {JSON.stringify(item.meta, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-[10px] text-[#aaa]">还没有 AI 请求记录</div>
              )}
            </div>
          </section>
        )}

        {openSection === 'voice' && (
          <section className="p-4 rounded-2xl bg-white/55 border border-[rgba(40,36,31,.1)]">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-3">
              <Mic2 className="w-3.5 h-3.5" /> VOICE / TTS
            </div>
            <button onClick={() => update('voiceEnabled', !settings.voiceEnabled)} className="w-full p-3 rounded-xl bg-[#ebe7df] flex items-center justify-between text-left">
              <div><div className="text-[10px] font-semibold text-[#403b36]">角色语音</div><div className="text-[8px] text-[#8b8782] mt-0.5">AI 回复可以自动朗读</div></div>
              <span className="text-[9px] font-mono text-[#8b7560]">{settings.voiceEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <div className="mt-2.5 space-y-2.5">
              <label className="block text-[9px] text-[#7e7770]">TTS Provider
                <select value={settings.voiceProvider} onChange={e => update('voiceProvider', e.target.value as AppSettings['voiceProvider'])} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-xs outline-none">
                  <option value="browser">浏览器原生语音 · 免费</option>
                  <option value="openai-compatible">OpenAI Compatible / audio-speech</option>
                  <option value="custom">Custom TTS Endpoint</option>
                </select>
              </label>
              {settings.voiceProvider !== 'browser' && <>
                <label className="block text-[9px] text-[#7e7770]">Voice API Base URL
                  <input value={settings.voiceBaseUrl} onChange={e => update('voiceBaseUrl', e.target.value)} placeholder="例如 https://api.openai.com/v1" className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none font-mono" />
                </label>
                <label className="block text-[9px] text-[#7e7770]">Voice API Key
                  <input type="password" value={settings.voiceApiKey} onChange={e => update('voiceApiKey', e.target.value)} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-xs outline-none" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">TTS Model
                    <select value={settings.voiceModel} onChange={e => update('voiceModel', e.target.value)} className="w-full mt-1 bg-transparent outline-none font-mono text-[10px]">
                      <option value={settings.voiceModel}>{settings.voiceModel}</option>
                      {mediaModels.voice.filter(model => model !== settings.voiceModel).map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                  <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Voice
                    <input value={settings.voiceName} onChange={e => update('voiceName', e.target.value)} className="w-full mt-1 bg-transparent outline-none font-mono text-[10px]" />
                  </label>
                </div>
              </>}
              <button onClick={() => void fetchMediaModels('voice')} className="w-full py-2 rounded-xl bg-white/70 border border-black/5 text-[9px]">{mediaModelBusy === 'voice' ? '拉取中…' : '拉取 TTS 模型'}</button>
              <button onClick={() => update('autoSpeakAiReplies', !settings.autoSpeakAiReplies)} className="w-full py-2.5 rounded-xl bg-[#ebe7df] border border-[rgba(40,36,31,.1)] text-left px-3 text-[10px]">
                AI 回复自动发声 · <b className="text-[#8b7560]">{settings.autoSpeakAiReplies ? 'ON' : 'OFF'}</b>
              </button>
            </div>
            <div className="mt-3 p-3 rounded-2xl bg-[#ebe7df] border border-black/5">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">STT / 语音转文字</div>
              <button onClick={() => update('sttEnabled', !settings.sttEnabled)} className="w-full mt-2 p-2.5 rounded-xl bg-white/55 flex items-center justify-between text-left">
                <div><div className="text-[10px] font-semibold text-[#403b36]">语音消息转写</div><div className="text-[8px] text-[#8b8782] mt-0.5">录音后把语音转成文字，供 AI 理解与聊天记录搜索</div></div>
                <span className="text-[9px] font-mono text-[#8b7560]">{settings.sttEnabled ? 'ON' : 'OFF'}</span>
              </button>
              {settings.sttEnabled && <>
                <label className="block mt-2.5 text-[8px] text-[#8b8782]">STT Provider
                  <select value={settings.sttProvider} onChange={e => update('sttProvider', e.target.value as AppSettings['sttProvider'])} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none">
                    <option value="openai-compatible">OpenAI Compatible /audio/transcriptions</option>
                    <option value="custom">Custom STT Endpoint</option>
                    <option value="browser">浏览器实时识别（实验）</option>
                  </select>
                </label>
                {settings.sttProvider !== 'browser' && <>
                  <label className="block mt-2 text-[8px] text-[#8b8782]">STT Base URL
                    <input value={settings.sttBaseUrl} onChange={e => update('sttBaseUrl', e.target.value)} placeholder="例如 https://api.openai.com/v1" className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[9px] font-mono outline-none" />
                  </label>
                  <label className="block mt-2 text-[8px] text-[#8b8782]">STT API Key
                    <input type="password" value={settings.sttApiKey} onChange={e => update('sttApiKey', e.target.value)} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none" />
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">STT Model
                      <select value={settings.sttModel} onChange={e => update('sttModel', e.target.value)} className="w-full mt-1 bg-transparent outline-none text-[9px] font-mono text-[#4a4540]">
                        <option value={settings.sttModel}>{settings.sttModel}</option>
                        {mediaModels.stt.filter(model => model !== settings.sttModel).map(model => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                    <label className="bg-white/60 rounded-xl p-2.5 text-[8px] text-[#8b8782]">Language
                      <input value={settings.sttLanguage} onChange={e => update('sttLanguage', e.target.value)} className="w-full mt-1 bg-transparent outline-none text-[9px] font-mono text-[#4a4540]" />
                    </label>
                  </div>
                </>}
                <button onClick={() => void fetchMediaModels('stt')} className="w-full mt-2 py-2 rounded-xl bg-white/70 border border-black/5 text-[9px]">{mediaModelBusy === 'stt' ? '拉取中…' : '拉取 STT 模型 / 测试接口'}</button>
                <button onClick={() => {
                  update('sttBaseUrl', settings.voiceBaseUrl || settings.apiBaseUrl);
                  update('sttApiKey', settings.voiceApiKey || settings.apiKey);
                  notify('已复制语音 API 到 STT');
                }} className="w-full mt-2 py-2 rounded-xl bg-white/70 border border-black/5 text-[9px]">复制语音 API 到 STT</button>
              </>}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => copyChatToMedia('voice')} className="py-2 rounded-xl bg-white/75 border border-[rgba(40,36,31,.1)] text-[9px] flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" />复制聊天 API</button>
              <button onClick={testVoice} className="py-2 rounded-xl bg-[#292724] text-white text-[9px] flex items-center justify-center gap-1"><Volume2 className="w-3 h-3" />测试语音</button>
            </div>
          </section>
        )}

        {openSection === 'image' && (
          <section className="p-4 rounded-2xl bg-white/55 border border-[rgba(40,36,31,.1)]">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-3">
              <ImageIcon className="w-3.5 h-3.5" /> IMAGE / VISION
            </div>
            <button onClick={() => update('imageEnabled', !settings.imageEnabled)} className="w-full p-3 rounded-xl bg-[#ebe7df] flex items-center justify-between text-left">
              <div><div className="text-[10px] font-semibold text-[#403b36]">图片接口</div><div className="text-[8px] text-[#8b8782] mt-0.5">供 LINE 发图与后续图片剧情使用</div></div>
              <span className="text-[9px] font-mono text-[#8b7560]">{settings.imageEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <div className="mt-2.5 space-y-2.5">
              <label className="block text-[9px] text-[#7e7770]">Image API Base URL
                <input value={settings.imageBaseUrl} onChange={e => update('imageBaseUrl', e.target.value)} placeholder="例如 https://api.openai.com/v1" className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[10px] outline-none font-mono" />
              </label>
              <label className="block text-[9px] text-[#7e7770]">Image API Key
                <input type="password" value={settings.imageApiKey} onChange={e => update('imageApiKey', e.target.value)} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-xs outline-none" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Image Model
                  <select value={settings.imageModel} onChange={e => update('imageModel', e.target.value)} className="w-full mt-1 bg-transparent outline-none font-mono text-[10px]">
                    <option value={settings.imageModel}>{settings.imageModel}</option>
                    {mediaModels.image.filter(model => model !== settings.imageModel).map(model => <option key={model} value={model}>{model}</option>)}
                  </select>
                </label>
                <label className="bg-white/55 rounded-xl p-2.5 text-[9px]">Size
                  <select value={settings.imageSize} onChange={e => update('imageSize', e.target.value)} className="w-full mt-1 bg-transparent outline-none text-[10px]">
                    <option>1024x1024</option>
                    <option>1536x1024</option>
                    <option>1024x1536</option>
                  </select>
                </label>
              </div>
            </div>
            <button onClick={() => void fetchMediaModels('image')} className="w-full mt-2 py-2 rounded-xl bg-white/70 border border-black/5 text-[9px]">{mediaModelBusy === 'image' ? '拉取中…' : '拉取图片模型'}</button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => copyChatToMedia('image')} className="py-2 rounded-xl bg-white/75 border border-[rgba(40,36,31,.1)] text-[9px] flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" />复制聊天 API</button>
              <button onClick={testImage} className="py-2 rounded-xl bg-[#292724] text-white text-[9px] flex items-center justify-center gap-1"><ImageIcon className="w-3 h-3" />测试图片接口</button>
            </div>
            <div className="mt-2 text-[8.5px] text-[#8b8782] leading-relaxed">视觉理解不需要独立模型配置：LINE 上传图片时，会把图片作为多模态消息送给当前聊天模型；前提是你的模型支持 vision / multimodal。</div>
          </section>
        )}


        {openSection === 'sound' && (
          <section className="p-4 rounded-2xl bg-white/55 border border-[rgba(40,36,31,.1)]">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-3">
              <BellRing className="w-3.5 h-3.5" /> SOUND / RINGTONE
            </div>
            <button onClick={() => update('soundEnabled', !settings.soundEnabled)} className="w-full p-3 rounded-xl bg-[#ebe7df] flex items-center justify-between text-left">
              <div><div className="text-[10px] font-semibold text-[#403b36]">系统声音</div><div className="text-[8px] text-[#8b8782] mt-0.5">消息、朋友圈更新和来电都使用这里的声音设置。</div></div>
              <span className="text-[9px] font-mono text-[#8b7560]">{settings.soundEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <label className="block mt-2.5 p-2.5 rounded-xl bg-white/60 text-[9px] text-[#777]">音量
              <input type="range" min="0" max="1" step="0.05" value={settings.soundVolume} onChange={e => update('soundVolume', Number(e.target.value))} className="w-full mt-1" />
            </label>
            {([
              ['message', '收到消息提示音', settings.messageSoundUrl, settings.messageSoundRef, messageSoundFileRef],
              ['moments', '朋友圈更新提示音', settings.momentsSoundUrl, settings.momentsSoundRef, momentsSoundFileRef],
              ['call', '来电铃声', settings.callRingtoneUrl, settings.callRingtoneRef, callSoundFileRef],
            ] as const).map(([kind, label, url, mediaRef, fileRef]) => (
              <div key={kind} className="mt-2.5 p-3 rounded-xl bg-[#ebe7df] border border-black/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div><div className="text-[10px] font-semibold">{label}</div><div className="text-[8px] text-[#8b8782]">{mediaRef ? '已上传本机铃声' : url ? '使用音频链接' : '使用内置简易提示音'}</div></div>
                  <button onClick={() => playAppSound(kind)} className="text-[9px] font-mono text-[#8b7560]">试听</button>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <input value={url} onChange={e => update(kind === 'message' ? 'messageSoundUrl' : kind === 'moments' ? 'momentsSoundUrl' : 'callRingtoneUrl', e.target.value)} placeholder="粘贴音频链接（可选）" className="min-w-0 p-2 bg-white/70 rounded-lg text-[9px] font-mono outline-none" />
                  <button onClick={() => fileRef.current?.click()} className="px-2.5 rounded-lg bg-white border border-black/5 text-[9px]">上传</button>
                  <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" className="hidden" onChange={e => uploadSound(kind, e.target.files?.[0])} />
                </div>
              </div>
            ))}
            <div className="mt-2.5 p-2.5 rounded-xl bg-white/50 border border-black/5 text-[8px] leading-relaxed text-[#8b8782]">
              支持本地音频文件或音频 URL。上传的铃声保存在本机 IndexedDB；不会自动上传到 GitHub 数据文件。
            </div>
          </section>
        )}

        {openSection === 'data' && (
          <section className="p-4 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.12)]">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-3">
              <Database className="w-3.5 h-3.5" /> DATA / BACKUP
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-3 rounded-xl bg-white/55"><div className="text-lg font-serif font-bold text-[#292724]">{localStats.keys}</div><div className="text-[8px] text-[#8b8782]">本机数据项</div></div>
              <div className="p-3 rounded-xl bg-white/55"><div className="text-lg font-serif font-bold text-[#292724]">{prettyBytes(localStats.size)}</div><div className="text-[8px] text-[#8b8782]">估算占用</div></div>
            </div>
            <label className="mt-2.5 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/55 border border-black/5 text-[9px] text-[#645c55]">
              <span>备份包含 API 密钥</span>
              <input type="checkbox" checked={includeSecretsInBackup} onChange={e => setIncludeSecretsInBackup(e.target.checked)} />
            </label>
            <div className="mt-1 text-[8px] text-[#8b8782]">完整备份会同时包含 IndexedDB 中的图片/语音；默认不导出 API 密钥。</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={exportFullBackup} disabled={backingUp} className="py-2.5 rounded-xl bg-[#292724] text-white text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-50"><Download className="w-3.5 h-3.5" />{backingUp ? '整理备份…' : '导出完整备份'}</button>
              <button onClick={() => importRef.current?.click()} className="py-2.5 rounded-xl bg-white/75 border border-[rgba(40,36,31,.12)] text-[10px] flex items-center justify-center gap-1.5"><Save className="w-3.5 h-3.5" />导入 / 恢复</button>
            </div>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={e => importBackup(e.target.files?.[0])} />
            <div className="mt-2.5 p-3 rounded-xl bg-white/55 border border-[rgba(40,36,31,.1)] space-y-2.5">
              <div className="flex items-center justify-between"><div><div className="text-[10px] font-semibold">GitHub 数据库</div><div className="text-[8px] text-[#8b8782] mt-0.5">只同步项目 JSON 数据，不使用 Supabase。</div></div><span className="text-[8px] font-mono text-[#8b7560]">{githubConfig.lastSyncedAt ? '已同步' : '未同步'}</span></div>
              <div className="grid grid-cols-2 gap-1.5">
                <input value={githubConfig.owner} onChange={e => saveGithubField({ owner: e.target.value })} placeholder="Owner" className="p-2 bg-white/75 border border-black/5 rounded-lg text-[9px] outline-none" />
                <input value={githubConfig.repo} onChange={e => saveGithubField({ repo: e.target.value })} placeholder="Repository" className="p-2 bg-white/75 border border-black/5 rounded-lg text-[9px] outline-none" />
                <input value={githubConfig.branch} onChange={e => saveGithubField({ branch: e.target.value })} placeholder="Branch" className="p-2 bg-white/75 border border-black/5 rounded-lg text-[9px] outline-none" />
                <input value={githubConfig.path} onChange={e => saveGithubField({ path: e.target.value })} placeholder="sane333/data.json" className="p-2 bg-white/75 border border-black/5 rounded-lg text-[9px] outline-none" />
              </div>
              <input type="password" value={githubToken} onChange={e => { setGithubToken(e.target.value); saveGitHubToken(e.target.value); }} placeholder="GitHub Token（仅本机保存，不进入备份）" className="w-full p-2 bg-white/75 border border-black/5 rounded-lg text-[9px] outline-none" />
              <div className="grid grid-cols-3 gap-1.5">
                <button disabled={githubBusy} onClick={handleGithubTest} className="py-2 rounded-lg bg-white border border-black/5 text-[9px] disabled:opacity-50">测试连接</button>
                <button disabled={githubBusy} onClick={handleGithubPush} className="py-2 rounded-lg bg-[#292724] text-white text-[9px] disabled:opacity-50">上传同步</button>
                <button disabled={githubBusy} onClick={handleGithubPull} className="py-2 rounded-lg bg-white border border-black/5 text-[9px] disabled:opacity-50">从 GitHub 恢复</button>
              </div>
              <div className="text-[8px] leading-relaxed text-[#8b8782]">建议使用只允许该仓库内容读写的 Fine-grained Token。Token 不会写进 GitHub，也不会包含进项目备份。</div>
            </div>
            <button onClick={() => onNavigate('project-studio')} className="mt-2 w-full py-2.5 rounded-xl bg-white/75 border border-[rgba(40,36,31,.12)] text-[10px] flex items-center justify-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-[#8b7560]" />Studio · AI 编程工作台</button>
            <button onClick={clearAll} className="mt-2 w-full py-2.5 rounded-xl bg-white/60 border border-[#cba6a0]/30 text-[#9b625b] text-[10px] flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />清空全部本机数据</button>
          </section>
        )}

        {openSection === 'background' && (
          <section className="p-4 rounded-2xl bg-white/55 border border-[rgba(40,36,31,.1)]">
            <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-3">
              <Server className="w-3.5 h-3.5" /> BACKGROUND / RUNTIME
            </div>
            <div className="p-3 rounded-xl bg-[#ebe7df]">
              <div className="flex items-center justify-between">
                <div><div className="text-[10px] font-semibold">后台运行心跳</div><div className="text-[8px] text-[#8b8782] mt-0.5">保存活跃时间、恢复运行状态、支撑主动事件调度</div></div>
                <button onClick={() => { const next = !settings.backgroundEnabled; update('backgroundEnabled', next); if (next) startBackgroundRuntime(); else stopBackgroundRuntime(); }} className="text-[9px] font-mono text-[#8b7560]">{settings.backgroundEnabled ? 'ON' : 'OFF'}</button>
              </div>
              <div className="mt-3 h-px bg-black/5" />
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="bg-white/55 rounded-xl p-2.5"><div className="text-[8px] text-[#8b8782]">最后活跃</div><div className="mt-1 text-[9px] font-mono text-[#4f4943]">{heartbeat?.lastActiveAt ? new Date(heartbeat.lastActiveAt).toLocaleString() : '暂无记录'}</div></div>
                <div className="bg-white/55 rounded-xl p-2.5"><div className="text-[8px] text-[#8b8782]">最后心跳</div><div className="mt-1 text-[9px] font-mono text-[#4f4943]">{heartbeat?.heartbeatAt ? new Date(heartbeat.heartbeatAt).toLocaleString() : '暂无记录'}</div></div>
              </div>
            </div>

            <div className="mt-2.5 p-3 rounded-xl bg-[#ebe7df]">
              <div className="text-[10px] font-semibold">主动事件</div>
              <div className="mt-2 flex items-center justify-between text-[9px]">
                <span>角色主动消息 / 邀约调度</span>
                <button onClick={() => update('proactiveMessagesEnabled', !settings.proactiveMessagesEnabled)} className="font-mono text-[#8b7560]">{settings.proactiveMessagesEnabled ? 'ON' : 'OFF'}</button>
              </div>
              <label className="block mt-2.5 text-[8px] text-[#8b8782]">主动消息模型
                <input value={settings.proactiveModel} onChange={e => update('proactiveModel', e.target.value)} placeholder="留空 = 跟随聊天模型" className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-[9px] font-mono outline-none" />
              </label>
              <label className="block mt-2.5 text-[8px] text-[#8b8782]">主动消息 Temperature
                <input type="number" step="0.05" min="0" max="2" value={settings.proactiveTemperature} onChange={e => update('proactiveTemperature', Math.max(0, Math.min(2, Number(e.target.value) || 0.85)))} className="w-full mt-1 bg-white/75 rounded-xl p-2.5 text-xs font-mono outline-none" />
              </label>
              <div className="mt-2 flex items-center justify-between text-[9px]">
                <span>心跳间隔</span>
                <select value={settings.keepAliveMinutes} onChange={e => update('keepAliveMinutes', Number(e.target.value))} className="bg-white/65 rounded-lg px-2 py-1 outline-none text-[9px]">
                  {[1, 5, 10, 15, 30].map(v => <option key={v} value={v}>{v} min</option>)}
                </select>
              </div>
            </div>

            <div className="mt-2.5 p-3 rounded-xl bg-[#ebe7df]">
              <div className="flex items-center gap-2 text-[10px] font-semibold"><Bell className="w-3.5 h-3.5 text-[#8b7560]" /> 浏览器通知</div>
              <div className="mt-1 text-[8.5px] text-[#8b8782]">角色主动消息、线下邀约和未来后台事件可以用系统通知提醒你。</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={enableNotifications} className="py-2 rounded-xl bg-[#292724] text-white text-[9px]">申请通知权限</button>
                <button onClick={() => update('notificationEnabled', !settings.notificationEnabled)} className="py-2 rounded-xl bg-white/70 border border-[rgba(40,36,31,.1)] text-[9px]">通知 · {settings.notificationEnabled ? 'ON' : 'OFF'}</button>
              </div>
            </div>

            <div className="mt-2.5 p-3 rounded-xl bg-white/65 border border-[rgba(40,36,31,.08)]">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#403b36]"><Sparkles className="w-3.5 h-3.5 text-[#8b7560]" /> PWA / 手机后台</div>
              <p className="mt-1.5 text-[8.5px] leading-relaxed text-[#7d756d]">网页安装成 PWA 后可以离线打开外壳、保留本机数据，并通过 Service Worker 恢复页面资源。浏览器仍可能在真正后台时冻结 JavaScript，因此这里做的是“可恢复运行”，不是强制绕过系统休眠。</p>
              <button onClick={() => { setHeartbeat(getBackgroundHeartbeat()); notify('后台状态已刷新'); }} className="mt-2 w-full py-2 rounded-xl bg-white border border-black/5 text-[9px] flex items-center justify-center gap-1.5"><RefreshCw className="w-3 h-3" />刷新后台状态</button>
            </div>
          </section>
        )}

        <section className="p-4 rounded-2xl bg-white/45 border border-[rgba(40,36,31,.08)]">
          <div className="flex items-center gap-2 text-[8px] font-mono tracking-[1.5px] text-[#8b8782] mb-2"><SlidersHorizontal className="w-3.5 h-3.5" /> SYSTEM MAP</div>
          <div className="grid grid-cols-2 gap-y-1.5 text-[9px] text-[#5d5751]">
            <div>✓ 本地持久化</div><div>✓ PNG / JSON / YAML</div>
            <div>✓ World Book</div><div>✓ 长期记忆</div>
            <div>✓ Gemini / OpenAI Compatible</div><div>✓ Vision 输入</div>
            <div>✓ TTS / 浏览器语音</div><div>✓ 图片生成接口</div>
            <div>✓ JSON 全量备份</div><div>✓ PWA / Service Worker</div>
            <div>→ 主动事件 AI 调度</div><div>✓ GitHub JSON 数据库同步</div>
          </div>
        </section>
      </div>

      {notice && <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-16 bg-[#292724] text-white px-3.5 py-2 rounded-full text-[10px] shadow-lg">{notice}</div>}
    </div>
  );
}
