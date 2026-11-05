export async function readError(response: Response): Promise<string> {
  const statusLabel = response.statusText ? ' ' + response.statusText : '';
  let text = '';
  try {
    text = (await response.text()).trim().slice(0, 4000);
  } catch {
    return '[' + response.status + statusLabel + '] AI 请求失败';
  }
  if (!text) return '[' + response.status + statusLabel + '] AI 请求失败';
  try {
    const data = JSON.parse(text);
    const error = data?.error ?? data;
    const code = error?.code ?? error?.error_code ?? error?.statusCode;
    const type = error?.type;
    const message = error?.message ?? data?.message;
    const parts = [
      code !== undefined ? 'code=' + String(code) : '',
      type ? 'type=' + String(type) : '',
      message ? String(message) : '',
    ].filter(Boolean);
    return '[' + response.status + statusLabel + ']' + (parts.length ? ' ' + parts.join(' · ') : ' ' + text);
  } catch {
    return '[' + response.status + statusLabel + '] ' + text;
  }
}

export async function parseSseResponse(
  response: Response,
  extractText: (data: any) => string,
  onDelta?: (delta: string) => void,
  idleTimeoutMs = 45000,
  onReasoning?: (delta: string) => void,
  extractReasoning?: (data: any) => string,
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (!text.trim()) return '';
    let data: any;
    try { data = JSON.parse(text); }
    catch { throw new Error('AI_STREAM_INVALID_RESPONSE: 流式接口返回了无法解析的数据'); }
    if (data?.error) {
      const message = data.error?.message || data.error?.detail || data.error;
      throw new Error('AI_STREAM_PROVIDER_ERROR: ' + String(message).slice(0, 1000));
    }
    const result = extractText(data).trim();
    const reasoning = extractReasoning?.(data) || '';
    if (reasoning) onReasoning?.(reasoning);
    if (result) onDelta?.(result);
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let streamDone = false;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') { streamDone = true; return; }

    let data: any;
    try { data = JSON.parse(payload); }
    catch { return; } // Ignore non-JSON SSE comments/keep-alives.

    if (data?.error) {
      const message = data.error?.message || data.error?.detail || data.error;
      throw new Error('AI_STREAM_PROVIDER_ERROR: ' + String(message).slice(0, 1000));
    }
    const delta = extractText(data);
    const reasoning = extractReasoning?.(data) || '';
    if (reasoning) onReasoning?.(reasoning);
    if (delta) {
      fullText += delta;
      onDelta?.(delta);
    }
  };

  try {
    while (!streamDone) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const readPromise = reader.read();
        const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('AI_STREAM_TIMEOUT: 流式接口连续 ' + Math.round(idleTimeoutMs / 1000) + ' 秒没有收到新数据')),
            idleTimeoutMs,
          );
        });
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) processLine(line);
        }
      } catch (error) {
        try { await reader.cancel(error); } catch { /* the stream may already be closed */ }
        throw error;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }

    buffer += decoder.decode();
    if (buffer && !streamDone) processLine(buffer);
    return fullText.trim();
  } finally {
    if (streamDone) {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    try { reader.releaseLock(); } catch { /* cancellation may have released it */ }
  }
}

