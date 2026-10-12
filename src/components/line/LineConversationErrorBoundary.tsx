import { Component, type ErrorInfo, type ReactNode } from 'react';

interface BoundaryState {
  hasError: boolean;
  errorMessage: string;
  componentStack: string;
  copied: boolean;
}

export class LineConversationErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  BoundaryState
> {
  state: BoundaryState = {
    hasError: false,
    errorMessage: '',
    componentStack: '',
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.stack || error?.message || 'Unknown render error',
      componentStack: '',
      copied: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LINE] conversation render error', error, info);
    this.setState({
      hasError: true,
      errorMessage: error?.stack || error?.message || 'Unknown render error',
      componentStack: info?.componentStack || '',
      copied: false,
    });
  }

  private getDebugText() {
    return [
      '[SANE333 LINE CHAT ERROR]',
      '',
      this.state.errorMessage,
      '',
      '[React component stack]',
      this.state.componentStack,
    ].filter(Boolean).join('\n');
  }

  private copyError = async () => {
    const text = this.getDebugText();
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1800);
    } catch {
      // Clipboard API can be unavailable in some browsers/embedded contexts.
      // The textarea fallback below remains selectable/copyable.
      this.setState({ copied: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const debugText = this.getDebugText();

    return (
      <div className="w-full h-full bg-white flex items-center justify-center px-5 overflow-hidden">
        <div className="w-full max-w-[360px] max-h-[82%] rounded-2xl border border-[#eee] bg-[#fafafa] p-5 flex flex-col">
          <div className="text-center">
            <div className="text-sm font-semibold text-[#292724]">聊天暂时无法打开</div>
            <div className="mt-2 text-xs leading-5 text-[#999]">
              聊天数据没有被删除。把下面的错误复制给我，我可以直接定位。
            </div>
          </div>

          <textarea
            readOnly
            value={debugText}
            aria-label="LINE 聊天错误信息"
            className="mt-4 w-full min-h-[190px] max-h-[280px] resize-none overflow-auto rounded-xl bg-[#f1f1f1] px-3 py-3 text-[9px] leading-4 text-[#666] font-mono outline-none select-text"
            onFocus={(event) => event.currentTarget.select()}
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={this.copyError}
              className="flex-1 rounded-full bg-[#292724] px-4 py-2.5 text-xs text-white"
            >
              {this.state.copied ? '已复制 ✓' : '复制错误信息'}
            </button>
            <button
              type="button"
              onClick={this.props.onBack}
              className="flex-1 rounded-full border border-[#ddd] bg-white px-4 py-2.5 text-xs text-[#292724]"
            >
              返回好友
            </button>
          </div>

          <div className="mt-2 text-center text-[9px] text-[#aaa]">
            也可以点上面的错误框后按 Ctrl+A → Ctrl+C
          </div>
        </div>
      </div>
    );
  }
}
