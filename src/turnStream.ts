import { readSSE } from '../shared/sse.ts';
import { parseControl, stripControlFragment, type StreamEvent, type TurnRequest } from '../shared/types.ts';

export type ClientTurnEvent = StreamEvent | { type: 'notice'; message: string };

class TurnStreamError extends Error {
  constructor(message: string, readonly transient: boolean) { super(message); }
}

function isTransient(error: unknown): boolean {
  if (error instanceof TurnStreamError) return error.transient;
  return error instanceof TypeError || (error instanceof Error && /\b(?:terminated|fetch failed|failed to fetch|networkerror|econnreset|econnrefused|etimedout|und_err_socket)\b|network connection was lost|模型连接提前断开/i.test(error.message));
}

async function reconnectDelay(signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 250);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
  });
}

/** Retry only an ordinary turn that has not produced text, within its original clock. */
export async function* streamTurn(input: TurnRequest, signal: AbortSignal, requestFetch: typeof fetch = fetch): AsyncGenerator<ClientTurnEvent> {
  const started = Date.now();
  const ordinary = !input.kind || input.kind === 'speech' || input.kind === 'prep';
  const identity = `${input.speaker.name}（${input.speaker.modelId}）`;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError');
    const timeLimit = attempt === 0 ? input.timeLimit : Math.max(.05, input.timeLimit - (Date.now() - started) / 1000);
    let received = '';
    try {
      const response = await requestFetch('/api/turn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, timeLimit }), signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new TurnStreamError(data.error || `服务返回 ${response.status}`, [502, 503, 504].includes(response.status));
      }
      if (!response.body) throw new TurnStreamError('浏览器没有收到输出流。', true);
      for await (const data of readSSE(response.body, signal)) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError');
        const event = JSON.parse(data) as StreamEvent;
        if (event.type === 'error') throw new TurnStreamError(event.message, isTransient(new Error(event.message)));
        if (event.type === 'token') received += event.text;
        if (event.type === 'done') {
          if (attempt) event.warning = [event.warning, '连接短暂中断后已重试 1 次；重试计入本次发言时间。'].filter(Boolean).join(' ');
          yield event;
          return;
        }
        yield event;
      }
      throw new TurnStreamError('连接未发送完整结束事件。', true);
    } catch (error) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const transient = isTransient(error);
      if (ordinary && received.trim() && (transient || !(error instanceof TurnStreamError))) {
        yield { type: 'done', text: parseControl(stripControlFragment(received)).text, conceded: false, finishReason: 'interrupted', warning: '本次连接中断，已保留收到的正文并继续下一位；不重发已有内容，也不把残缺发言判为认输。' };
        return;
      }
      const remaining = input.timeLimit - (Date.now() - started) / 1000;
      if (ordinary && transient && !received.trim() && !attempt && remaining > 1) {
        yield { type: 'notice', message: '连接在返回正文前中断，正在自动重连（1/1）；仍使用本次剩余时间。' };
        await reconnectDelay(signal);
        continue;
      }
      if (transient) throw new Error(`${identity}：${ordinary ? '连接在返回正文前被提前关闭' : '连接中断，未收到完整有效的裁决或申诉结果'}。${attempt ? '已重试 1 次仍未恢复。' : ordinary ? '本次剩余时间不足，未再发起请求。' : ''}已有记录将保留，本场不据此判胜负；请检查中转服务或稍后再试。`);
      throw error;
    }
  }
}
