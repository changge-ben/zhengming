import test from 'node:test';
import assert from 'node:assert/strict';
import { streamTurn, type ClientTurnEvent } from '../src/turnStream.ts';
import type { StreamEvent, TurnRequest } from '../shared/types.ts';

const request = (overrides: Partial<TurnRequest> = {}): TurnRequest => ({
  config: { topic: '测试断流后的恢复机制', teamSize: 1, roundSeconds: 60, matchSeconds: 60, prepSeconds: 0, maxRounds: 1, format: 'classic', language: 'natural', demo: true, teams: { pro: [], con: [] }, judge: { enabled: false, providerId: 'custom', modelId: 'fixture', timing: 'final', appeals: false } },
  speaker: { side: 'pro', member: 0, name: '正方一辩', providerId: 'custom', modelId: 'fixture' },
  round: 1, timeLimit: 5, history: [], kind: 'speech', ...overrides,
});
const complete: StreamEvent = { type: 'done', text: '完整发言。', conceded: false, finishReason: 'stop' };
const sse = (...events: StreamEvent[]) => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const mockFetch = (fn: (...args: Parameters<typeof fetch>) => Promise<Response>) => fn as typeof fetch;
async function collect(fetcher: typeof fetch, input = request(), signal = new AbortController().signal) {
  const events: ClientTurnEvent[] = [];
  for await (const event of streamTurn(input, signal, fetcher)) events.push(event);
  return events;
}

test('an empty terminated upstream is retried once inside the original time budget', async () => {
  const budgets: number[] = [];
  const events = await collect(mockFetch(async (_url, options) => {
    budgets.push(JSON.parse(options!.body as string).timeLimit);
    return budgets.length === 1 ? sse({ type: 'error', message: '正方一辩（fixture）：terminated' }) : sse({ type: 'token', text: '完整发言。' }, complete);
  }));
  assert.equal(budgets.length, 2);
  assert.equal(budgets[0], 5);
  assert.ok(budgets[1] > 0 && budgets[1] < budgets[0] - .2);
  assert.equal(events.filter(e => e.type === 'notice').length, 1);
  const done = events.at(-1);
  assert.ok(done?.type === 'done');
  assert.equal(done.text, '完整发言。');
  assert.ok(done.warning?.includes('重试 1 次'));
});

test('a browser fetch failure before any text can recover with one retry', async () => {
  let calls = 0;
  const events = await collect(mockFetch(async () => { if (!calls++) throw new TypeError('Failed to fetch'); return sse(complete); }));
  assert.equal(calls, 2);
  assert.equal(events.at(-1)?.type, 'done');
});

test('partial text is preserved after a socket failure without replaying or conceding', async () => {
  let calls = 0;
  const events = await collect(mockFetch(async () => {
    calls++;
    let chunk = 0;
    return new Response(new ReadableStream({ pull(controller) {
      if (!chunk++) controller.enqueue(new TextEncoder().encode('data: {"type":"token","text":"部分发言。\\n[[CONCEDE]]"}\n\n'));
      else controller.error(new TypeError('terminated'));
    } }));
  }));
  assert.equal(calls, 1);
  const done = events.at(-1);
  assert.ok(done?.type === 'done');
  assert.equal(done.text, '部分发言。');
  assert.equal(done.conceded, false);
  assert.equal(done.verdict, undefined);
  assert.equal(done.finishReason, 'interrupted');
});

test('configuration and authentication errors are not retried', async () => {
  for (const message of ['接口返回 401：无效 API Key', '返回了网页而不是模型流（HTTP 200），检查 /v1']) {
    let calls = 0;
    await assert.rejects(() => collect(mockFetch(async () => { calls++; return sse({ type: 'error', message }); })), error => error instanceof Error && error.message === message);
    assert.equal(calls, 1);
  }
});

test('repeated empty failures stop after one retry with an actionable message', async () => {
  let calls = 0;
  await assert.rejects(() => collect(mockFetch(async () => { calls++; return sse({ type: 'error', message: 'terminated' }); })), /正方一辩.*fixture.*已重试 1 次仍未恢复/);
  assert.equal(calls, 2);
});

test('judge and appeal failures are not silently replayed or accepted as decisions', async () => {
  for (const kind of ['judge', 'review', 'appeal'] as const) {
    let calls = 0;
    await assert.rejects(() => collect(mockFetch(async () => { calls++; return sse({ type: 'token', text: '残缺判词' }, { type: 'error', message: 'terminated' }); }), request({ kind })), /未收到完整有效/);
    assert.equal(calls, 1);
  }
});

test('a nearly exhausted turn does not gain another request or extra time', async () => {
  let calls = 0;
  await assert.rejects(() => collect(mockFetch(async () => { calls++; return sse({ type: 'error', message: 'terminated' }); }), request({ timeLimit: .5 })), /剩余时间不足/);
  assert.equal(calls, 1);
});

test('stopping during the reconnect notice prevents a second request', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(async () => {
    for await (const event of streamTurn(request(), controller.signal, mockFetch(async () => { calls++; return sse({ type: 'error', message: 'terminated' }); }))) {
      if (event.type === 'notice') controller.abort();
    }
  }, error => error instanceof Error && error.name === 'AbortError');
  assert.equal(calls, 1);
});

test('a complete done event is final even if the connection subsequently breaks', async () => {
  let calls = 0;
  const events = await collect(mockFetch(async () => {
    calls++;
    let chunk = 0;
    return new Response(new ReadableStream({ pull(controller) {
      if (!chunk++) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(complete)}\n\n`));
      else controller.error(new TypeError('terminated'));
    } }));
  }));
  assert.equal(calls, 1);
  assert.deepEqual(events, [complete]);
});
