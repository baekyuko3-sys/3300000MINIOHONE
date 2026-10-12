import { Component, type ErrorInfo, type ReactNode } from 'react';

export type CrashPayload = {
  title?: string;
  where?: string;
  error: unknown;
  componentStack?: string;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function buildCrashText(payload: CrashPayload): string {
  const parts = [
    '[SANE333 CRASH]',
    payload.where ? `where: ${payload.where}` : '',
    '',
    formatError(payload.error),
    payload.componentStack
      ? `\n[React component stack]\n${payload.componentStack}`
      : '',
  ];
  return parts.filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n').trim();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Imperative crash screen for boot / module-load failures (before React mounts). */
export function showBootCrash(payload: CrashPayload) {
  const root = document.getElementById('root') || document.body;
  const text = buildCrashText(payload);
  const title = payload.title || '有问题 · 待修复';
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.id = 'sane333-crash';
  wrap.setAttribute(
    'style',
    [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'box-sizing:border-box',
      'background:#eeeae4',
      'color:#292724',
      'font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",serif',
    ].join(';'),
  );
  wrap.innerHTML = `
    <div style="width:100%;max-width:420px;max-height:90vh;overflow:auto;border-radius:28px;background:#f8f6f1;border:1px solid rgba(0,0,0,.06);padding:22px 20px 18px;box-shadow:0 24px 60px rgba(40,30,20,.12)">
      <div style="font-size:10px;letter-spacing:.18em;color:rgba(0,0,0,.35)">SANE333 · CRASH</div>
      <div style="margin-top:10px;font-size:22px;font-weight:700;letter-spacing:.06em">${title}</div>
      <div style="margin-top:8px;font-size:13px;line-height:1.6;color:rgba(0,0,0,.55)">页面崩了，不是黑屏白屏。把下面错误复制给我，我可以直接修。</div>
      <textarea readonly id="sane333-crash-text" style="margin-top:14px;width:100%;min-height:180px;max-height:280px;resize:none;box-sizing:border-box;border:0;border-radius:16px;background:#efece6;padding:12px;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#555;outline:none">${text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</textarea>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button type="button" id="sane333-crash-copy" style="flex:1;height:42px;border:0;border-radius:999px;background:#292724;color:#fff;font:inherit;font-size:13px;cursor:pointer">复制错误代码</button>
        <button type="button" id="sane333-crash-reload" style="flex:1;height:42px;border:1px solid rgba(0,0,0,.12);border-radius:999px;background:#fff;color:#292724;font:inherit;font-size:13px;cursor:pointer">重新加载</button>
      </div>
      <div id="sane333-crash-hint" style="margin-top:8px;text-align:center;font-size:11px;color:rgba(0,0,0,.4)">也可以点错误框后 Ctrl+A → Ctrl+C</div>
    </div>
  `;
  root.appendChild(wrap);
  const copyBtn = wrap.querySelector('#sane333-crash-copy') as HTMLButtonElement | null;
  const reloadBtn = wrap.querySelector('#sane333-crash-reload') as HTMLButtonElement | null;
  const ta = wrap.querySelector('#sane333-crash-text') as HTMLTextAreaElement | null;
  const hint = wrap.querySelector('#sane333-crash-hint') as HTMLElement | null;
  ta?.addEventListener('focus', () => ta.select());
  copyBtn?.addEventListener('click', async () => {
    const ok = await copyText(text);
    if (copyBtn) copyBtn.textContent = ok ? '已复制 ✓' : '复制失败，请手动选中';
    if (hint) hint.textContent = ok ? '已复制到剪贴板' : '请手动全选后复制';
  });
  reloadBtn?.addEventListener('click', () => window.location.reload());
}

type BoundaryState = {
  hasError: boolean;
  debugText: string;
  copied: boolean;
};

export class AppErrorBoundary extends Component<
  { children: ReactNode; where?: string; onReset?: () => void; resetLabel?: string },
  BoundaryState
> {
  state: BoundaryState = { hasError: false, debugText: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return {
      hasError: true,
      debugText: buildCrashText({ error, where: 'react-render' }),
      copied: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SANE333] render crash', this.props.where, error, info);
    this.setState({
      hasError: true,
      debugText: buildCrashText({
        error,
        where: this.props.where || 'react-render',
        componentStack: info.componentStack || '',
      }),
      copied: false,
    });
  }

  private copy = async () => {
    const ok = await copyText(this.state.debugText);
    this.setState({ copied: ok });
    if (ok) window.setTimeout(() => this.setState({ copied: false }), 1800);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[#eeeae4] px-5 overflow-hidden">
        <div className="w-full max-w-[400px] max-h-[90%] overflow-auto rounded-[28px] border border-black/5 bg-[#f8f6f1] px-5 py-5 shadow-[0_24px_60px_rgba(40,30,20,.12)]">
          <div className="text-[10px] tracking-[0.18em] text-black/35">SANE333 · CRASH</div>
          <div className="mt-2 text-[22px] font-semibold tracking-[0.06em] text-[#292724]">有问题 · 待修复</div>
          <div className="mt-2 text-[13px] leading-relaxed text-black/55">
            页面崩了。把下面错误复制给我，我可以直接定位。
            {this.props.where ? `（${this.props.where}）` : ''}
          </div>
          <textarea
            readOnly
            value={this.state.debugText}
            aria-label="错误代码"
            className="mt-4 w-full min-h-[170px] max-h-[260px] resize-none overflow-auto rounded-2xl bg-[#efece6] px-3 py-3 text-[11px] leading-[1.45] text-[#555] font-mono outline-none select-text"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void this.copy()}
              className="flex-1 h-[42px] rounded-full bg-[#292724] text-[13px] text-white"
            >
              {this.state.copied ? '已复制 ✓' : '复制错误代码'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (this.props.onReset) this.props.onReset();
                else this.setState({ hasError: false, debugText: '', copied: false });
              }}
              className="flex-1 h-[42px] rounded-full border border-black/10 bg-white text-[13px] text-[#292724]"
            >
              {this.props.resetLabel || '重试'}
            </button>
          </div>
          <div className="mt-2 text-center text-[11px] text-black/40">也可以点错误框后 Ctrl+A → Ctrl+C</div>
        </div>
      </div>
    );
  }
}
