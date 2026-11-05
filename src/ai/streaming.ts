
export async function readResponseBytesWithTimeout(
  response: Response,
  timeoutMs = 30000,
  maxBytes = 16 * 1024 * 1024,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const readPromise = reader.read();
        const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          timer = setTimeout(() => reject(new Error('AI_RESPONSE_BODY_TIMEOUT: 服务商响应正文读取超时')), timeoutMs);
        });
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) throw new Error('AI_RESPONSE_BODY_TOO_LARGE: 服务商响应超过允许大小');
          chunks.push(value);
        }
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    try { await reader.cancel(error); } catch { /* stream already closed */ }
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

export async function readResponseTextWithTimeout(
  response: Response,
  timeoutMs = 30000,
  maxBytes = 16 * 1024 * 1024,
): Promise<string> {
  const bytes = await readResponseBytesWithTimeout(response, timeoutMs, maxBytes);
  return new TextDecoder().decode(bytes);
}

export async function readJsonResponseWithTimeout<T = any>(
  response: Response,
  timeoutMs = 30000,
  maxBytes = 16 * 1024 * 1024,
): Promise<T> {
  const text = await readResponseTextWithTimeout(response, timeoutMs, maxBytes);
  if (!text.trim()) throw new Error('AI_EMPTY_RESPONSE_BODY');
  try { return JSON.parse(text) as T; }
  catch { throw new Error('AI_INVALID_JSON_RESPONSE: 服务商返回了无法解析的 JSON'); }
}

export async function readBlobResponseWithTimeout(
  response: Response,
  timeoutMs = 30000,
  maxBytes = 32 * 1024 * 1024,
): Promise<Blob> {
  const bytes = await readResponseBytesWithTimeout(response, timeoutMs, maxBytes);
  const blobBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([blobBuffer], { type: response.headers.get('content-type') || 'application/octet-stream' });
}

export async function readError(response: Response): Promise<string> {
  const statusLabel = response.statusText ? ' ' + response.statusText : '';
  let text = '';
  try {
    text = (await readResponseTextWithTimeout(response, 15000, 64 * 1024)).trim().slice(0, 4000);
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

