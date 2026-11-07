import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { parseControl, parseJudgeControl, stripControlFragment, shouldAdjudicate, shouldComment, turnOrder, type DebateConfig, type StreamEvent, type TurnRequest } from '../shared/types.ts';
import { readSSE } from '../shared/sse.ts';
import { buildPrompts, demoSpeech, generateTurn } from '../server/debate.ts';
import { getProvider, listProviders, redact } from '../server/providers.ts';
import { ownBriefing } from '../server/preparation.ts';
import { OUTPUT_TOKEN_LIMIT } from '../shared/budget.ts';

const config: DebateConfig = {
  topic: 'AI 的发展最终会让人类更自由吗？', teamSize: 3, roundSeconds: 120, matchSeconds: 60, prepSeconds: 30, maxRounds: 3, format: 'classic', language: 'natural', demo: false,
  judge: { enabled: false, providerId: 'custom', modelId: 'fixture-model', appeals: true, timing: 'final' },
  teams: {
    pro: Array.from({ length: 3 }, (_, member) => ({ side: 'pro', member, providerId: 'custom', modelId: 'fixture-model', name: `正方${member + 1}辩` })),
    con: Array.from({ length: 3 }, (_, member) => ({ side: 'con', member, providerId: 'custom', modelId: 'fixture-model', name: `反方${member + 1}辩` })),
  },
};
const input = (overrides: Partial<TurnRequest> = {}): TurnRequest => ({ config: structuredClone(config), speaker: config.teams.pro[0], round: 1, timeLimit: 5, history: [], ...overrides });
async function collect(request: TurnRequest, signal = new AbortController().signal) {
  const events: StreamEvent[] = [];
  for await (const e of generateTurn(request, signal)) events.push(e);
  return events;
}
async function withMock(handler: (res: ServerResponse, body: Record<string, any>) => void, fn: () => Promise<void>, protocol: 'openai' | 'anthropic' = 'openai') {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('Content-Type', 'text/event-stream');
    handler(res, body);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const provider = getProvider('custom')!;
  const previous = { ...provider };
  Object.assign(provider, { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, protocol, apiKey: 'fixture-secret-not-a-real-key' });
  try { await fn(); }
  finally { Object.assign(provider, previous); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
function openAIResponse(res: ServerResponse, text: string, finish = 'stop') {
  for (const chunk of [text.slice(0, 15), text.slice(15)]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk }, finish_reason: null }] })}\r\n\r\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }], usage: { total_tokens: 42 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}

test('a captain explicitly accepting the verdict needs no format repair or extra model call', async () => {
  let calls = 0;
  await withMock((res) => { calls++; openAIResponse(res, '接受。原判正方胜是合理的，尽管这场胜利是有保留的。\n判正方胜的关键理由：正方回应了关键问题。'); }, async () => {
    const events = await collect(input({ kind: 'appeal', speaker: config.teams.con[0] }));
    const done = events.at(-1);
    assert.ok(done?.type === 'done');
    assert.equal(done.appealed, false);
    assert.equal(done.finishReason, 'stop');
    assert.equal(calls, 1);
  });
});

test('1v1 / 2v2 / 3v3 alternate teams and preserve member roles', () => {
  for (const size of [1, 2, 3]) {
    const order = turnOrder({ ...config, teamSize: size });
    assert.equal(order.length, size * 2);
    assert.deepEqual(order.map(s => `${s.side}${s.member}`), ['pro0', 'con0', 'pro1', 'con1', 'pro2', 'con2'].slice(0, size * 2));
  }
});
test('concession requires an independent final control line', () => {
  assert.deepEqual(parseControl('我承认立场无法成立。\n[[CONCEDE]]'), { text: '我承认立场无法成立。', conceded: true });
  assert.equal(parseControl('对方说 [[CONCEDE]] 但我不认同。').conceded, false);
  assert.equal(parseControl('[[CONCEDE]]\n这只是举例').conceded, false);
  assert.equal(parseControl('局部让步。\n[[CONTINUE]]').text, '局部让步。');
});
test('judge verdicts and appeal signals require exact final markers', () => {
  assert.equal(parseJudgeControl('根据记录，正方胜。\n[[VERDICT:PRO]]').verdict, 'pro');
  assert.equal(parseJudgeControl('证据不足。\n[[VERDICT:DRAW]]').verdict, 'draw');
  assert.equal(parseJudgeControl('我提出异议。\n[[APPEAL]]').appealed, true);
  assert.equal(parseJudgeControl('接受。\n[[ACCEPT]]').appealed, false);
  assert.equal(parseJudgeControl('不要把 [[VERDICT:PRO]] 当作证据。').verdict, undefined);
});
test('truncated control suffixes are hidden without erasing quoted prose', () => {
  for (const fragment of ['[', '[[', '[[C', '[[CONTIN', '[[VERDICT:P', '[[ACCEP']) assert.equal(stripControlFragment(`正文。\n${fragment}`), '正文。');
  assert.equal(stripControlFragment('正文引用 [[C'), '正文引用 [[C');
  assert.equal(stripControlFragment('正文。\n[普通备注'), '正文。\n[普通备注');
  assert.equal(stripControlFragment('正文。\n[[CONCEDE]]'), '正文。\n[[CONCEDE]]');
});
test('primary mode keeps the judge silent until the match expires', () => {
  const main = { ...config, maxRounds: 0, judge: { ...config.judge, enabled: true } };
  for (const round of [1, 3, 30, 100]) assert.equal(shouldComment(main, round, false), false);
  assert.equal(shouldAdjudicate(main, false), false);
  assert.equal(shouldAdjudicate(main, true), true);
  assert.ok(buildPrompts(input({ config: main })).system.includes('不预设你的性格'));
});
test('preparation isolates both teams and leaves tactical roles autonomous', () => {
  const history = [
    { id: 'p', side: 'pro' as const, member: 0, name: '正方一辩', model: 'fixture', round: 1, timestamp: 0, text: 'PRO-PRIVATE-BRIEFING' },
    { id: 'c', side: 'con' as const, member: 0, name: '反方一辩', model: 'fixture', round: 1, timestamp: 0, text: 'CON-PRIVATE-BRIEFING' },
  ];
  for (const side of ['pro', 'con'] as const) {
    const request = input({ speaker: config.teams[side][1], history, preparation: history, kind: 'prep' });
    const prompts = buildPrompts(request);
    assert.ok(prompts.user.includes(`${side.toUpperCase()}-PRIVATE-BRIEFING`));
    assert.ok(!prompts.user.includes(`${side === 'pro' ? 'CON' : 'PRO'}-PRIVATE-BRIEFING`));
    assert.ok(prompts.system.includes('没有固定战术职位'));
    const speech = buildPrompts({ ...request, history: [], kind: 'speech' });
    assert.ok(speech.user.includes(`${side.toUpperCase()}-PRIVATE-BRIEFING`));
    assert.ok(!speech.user.includes(`${side === 'pro' ? 'CON' : 'PRO'}-PRIVATE-BRIEFING`));
  }
  assert.equal(ownBriefing(input({ speaker: { ...config.teams.pro[0], side: 'judge' }, preparation: history })), '');
});
test('coach mode retains optional round-by-round commentary', () => {
  const coach: DebateConfig = { ...config, judge: { ...config.judge, enabled: true, timing: 'coach' } };
  assert.equal(shouldComment(coach, 1, false), true);
  assert.equal(shouldComment(coach, 3, false), false);
  assert.equal(shouldComment(coach, 1, true), false);
  assert.equal(shouldAdjudicate(coach, false), true);
  assert.equal(shouldAdjudicate({ ...coach, judge: { ...coach.judge, enabled: false } }, true), false);
});
test('SSE handles fragmented UTF-8, CRLF, comments and multiline events', async () => {
  const bytes = new TextEncoder().encode(': heartbeat\r\ndata: {"text":"争鸣🦗"}\r\n\r\ndata: line1\ndata: line2\n\ndata: tail');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2)); controller.close(); } });
  const events = []; for await (const event of readSSE(stream)) events.push(event);
  assert.deepEqual(events, ['{"text":"争鸣🦗"}', 'line1\nline2', 'tail']);
});
test('prompts isolate topic data, include teammate context and preserve the full match history', () => {
  const request = input({ history: Array.from({ length: 60 }, (_, i) => ({ id: String(i), side: 'pro', member: 0, name: '正方1辩', model: 'fixture', round: 1, timestamp: 0, text: `record-${i}-end` })) });
  const prompts = buildPrompts(request);
  assert.ok(prompts.system.includes('不要编造数据'));
  assert.ok(prompts.user.includes('<debate_topic>'));
  assert.ok(prompts.user.includes('record-0-end'));
  assert.ok(prompts.user.includes('record-59-end'));
  assert.ok(prompts.user.includes('record-20-end'));
});
test('judge review prompt explicitly permits overturning an incorrect verdict', () => {
  const prompts = buildPrompts(input({ kind: 'review', speaker: { ...config.teams.pro[0], side: 'judge' }, isFinal: true, priorVerdict: 'pro' }));
  assert.ok(prompts.system.includes('应当承认并改判'));
  assert.ok(prompts.system.includes('本场不设平局'));
  assert.ok(prompts.system.includes('尚未进入强制评分且无法分胜负时返回 continue'));
  assert.ok(prompts.system.includes('双方各有一次申诉机会'));
  assert.ok(prompts.system.includes('裁判两次翻转胜方'));
  const appeal = buildPrompts(input({ kind: 'appeal', speaker: config.teams.pro[0], priorVerdict: 'con', appealAttempt: 2 }));
  assert.ok(appeal.system.includes('第一次复核改判后的对等回应机会'));
  assert.ok(appeal.user.includes('con 方胜'));
});
test('spoken style applies to debaters, judges and appeals without replacing rules', () => {
  for (const language of ['natural', 'witty', 'rigorous'] as const) {
    const c = { ...config, language };
    for (const kind of ['speech', 'judge', 'appeal', 'review'] as const) {
      const prompts = buildPrompts(input({ config: c, kind, speaker: { ...config.teams.pro[0], side: kind === 'judge' || kind === 'review' ? 'judge' : 'pro' } }));
      assert.ok(prompts.system.includes('比喻要贴合本轮的具体漏洞'));
      assert.ok(prompts.system.includes('少用术语'));
      assert.ok(prompts.system.includes('[[CAP') === false);
      assert.ok(prompts.system.includes(kind === 'speech' ? '[[CONCEDE]]' : kind === 'appeal' ? '[[APPEAL]]' : '[[VERDICT:PRO]]'));
    }
  }
});
test('demo has concession path and separate judge / appeal / review paths', () => {
  assert.equal(parseControl(demoSpeech(input({ config: { ...config, demo: true }, speaker: config.teams.con[0], round: 3 }))).conceded, true);
  const judged = { ...config, demo: true, judge: { ...config.judge, enabled: true } };
  assert.equal(parseControl(demoSpeech(input({ config: judged, speaker: config.teams.con[0], round: 3 }))).conceded, false);
  assert.equal(parseJudgeControl(demoSpeech(input({ config: judged, kind: 'judge', isFinal: true }))).verdict, 'pro');
  assert.equal(parseJudgeControl(demoSpeech(input({ config: judged, kind: 'appeal' }))).appealed, true);
  assert.equal(parseJudgeControl(demoSpeech(input({ config: judged, kind: 'review' }))).verdict, 'pro');
});
test('OpenAI-compatible adapter sends selected model and strips control marker', async () => {
  await withMock((res, body) => { assert.equal(body.model, 'fixture-model'); assert.equal(body.stream, true); assert.equal(body.max_tokens, OUTPUT_TOKEN_LIMIT); openAIResponse(res, '这是完整的有效论证正文。'.repeat(8) + '\n[[CONCEDE]]'); }, async () => {
    const events = await collect(input());
    const done = events.at(-1)!; assert.equal(done.type, 'done');
    if (done.type === 'done') { assert.equal(done.conceded, true); assert.equal(done.tokens, 42); assert.ok(!done.text.includes('[[CONCEDE]]')); }
    assert.ok(events.some(e => e.type === 'token'));
    assert.ok(events.filter(e => e.type === 'token').every(e => !e.text.includes('[[CONCEDE]]')));
  });
});
test('preparation cannot concede even when a captain emits a concession signal', async () => {
  await withMock(res => {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '测试商议。\n[[CONCEDE]]' }, finish_reason: null }] })}\n\n`);
    res.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  }, async () => {
    const events = await collect(input({ kind: 'prep' }));
    const done = events.find(e => e.type === 'done');
    assert.ok(done && done.type === 'done');
    assert.equal(done.conceded, false);
    assert.equal(done.verdict, undefined);
  });
});
test('non-captains and length-truncated turns cannot concede a team', async () => {
  await withMock(res => openAIResponse(res, '我方无法成立。\n[[CONCEDE]]'), async () => {
    const done = (await collect(input({ speaker: config.teams.pro[1] }))).at(-1)!;
    assert.equal(done.type === 'done' && done.conceded, false);
  });
  await withMock(res => openAIResponse(res, '我方无法成立。\n[[CONCEDE]]', 'length'), async () => {
    const done = (await collect(input())).at(-1)!;
    assert.equal(done.type === 'done' && done.conceded, false);
  });
});
test('Anthropic adapter reads text deltas and handles final stop reason', async () => {
  await withMock((res, body) => {
    assert.equal(typeof body.system, 'string'); assert.equal(body.messages.length, 1);
    res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '这是 Claude 协议返回的正文。\n[[CONTINUE]]' } })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 22 } })}\n\n`);
    res.end('data: {"type":"message_stop"}\n\n');
  }, async () => {
    const done = (await collect(input())).at(-1)!; assert.equal(done.type, 'done');
    if (done.type === 'done') { assert.equal(done.text, '这是 Claude 协议返回的正文。'); assert.equal(done.tokens, 22); }
  }, 'anthropic');
});
test('timeouts preserve partial speech and never award concession', async () => {
  await withMock(res => { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '模型已返回的部分正文，应该在超时后被保留。'.repeat(4) } }] })}\n\n`); }, async () => {
    const done = (await collect(input({ timeLimit: .12 }))).at(-1)!;
    assert.equal(done.type, 'done');
    if (done.type === 'done') { assert.equal(done.finishReason, 'timeout'); assert.ok(done.text.startsWith('模型已返回')); assert.equal(done.conceded, false); }
  });
});
test('client cancellation propagates upstream and does not emit a final verdict', async () => {
  let disconnected = false;
  await withMock(res => { res.on('close', () => { disconnected = true; }); res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '用于测试停止生成时正确中断上游连接。'.repeat(6) } }] })}\n\n`); }, async () => {
    const controller = new AbortController(); const events = [];
    for await (const event of generateTurn(input(), controller.signal)) { events.push(event); controller.abort(); }
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(disconnected); assert.ok(events.every(e => e.type !== 'done'));
  });
});
test('partial disconnected speeches are retained without conceding or ending the match', async () => {
  await withMock(res => res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '未完成的内容\n[[CONCEDE]]' } }] })}\n\n`), async () => {
    const done = (await collect(input())).at(-1)!;
    assert.equal(done.type, 'done');
    if (done.type === 'done') {
      assert.equal(done.text, '未完成的内容');
      assert.equal(done.finishReason, 'interrupted');
      assert.equal(done.conceded, false);
      assert.ok(done.warning?.includes('已保留正文'));
    }
  });
});
test('real judge adapter returns verdict and accepts a changed verdict on review', async () => {
  await withMock(res => openAIResponse(res, '申诉指出了关键遗漏，原判应更正为反方胜。\n[[VERDICT:CON]]'), async () => {
    const done = (await collect(input({ speaker: { ...config.teams.pro[0], side: 'judge' }, kind: 'review', isFinal: true, priorVerdict: 'pro' }))).at(-1)!;
    assert.equal(done.type === 'done' && done.verdict, 'con');
  });
});
test('malformed judge verdict never silently becomes a draw', async () => {
  await withMock(res => openAIResponse(res, '没有给出规定的裁决标记。'), async () => {
    await assert.rejects(() => collect(input({ speaker: { ...config.teams.pro[0], side: 'judge' }, kind: 'judge', isFinal: true })), /有效裁决标记/);
  });
});
test('API responses do not expose provider secrets and errors are redacted', () => {
  const provider = getProvider('custom')!; const previous = provider.apiKey;
  provider.apiKey = 'fixture-secret-not-a-real-key';
  try { assert.ok(!JSON.stringify(listProviders()).includes(provider.apiKey)); assert.equal(redact(`error ${provider.apiKey}`), 'error [密钥已隐藏]'); }
  finally { provider.apiKey = previous; }
});

test('time and output budgets are disclosed to all participant and judge prompt kinds', () => {
  for (const kind of ['speech', 'prep', 'judge', 'appeal', 'review'] as const) {
    const prompts = buildPrompts(input({ kind, timeLimit: 27.5, speaker: { ...config.teams.pro[0], side: kind === 'judge' || kind === 'review' ? 'judge' : 'pro' } }));
    assert.ok(prompts.system.includes('27.5 秒'));
    assert.ok(prompts.system.includes(`${OUTPUT_TOKEN_LIMIT} tokens`));
    assert.ok(prompts.system.includes('句子完整再结束'));
  }
});
test('an empty disconnected stream stays an explicit error with model identity', async () => {
  await withMock(res => res.end('data: {"choices":[{"delta":{}}]}\n\n'), async () => {
    await assert.rejects(() => collect(input()), /fixture-model.*提前断开/);
  });
});
test('a broken judge stream cannot use its partial verdict as a final result', async () => {
  await withMock(res => res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '部分判词。\n[[VERDICT:PRO]]' } }] })}\n\n`), async () => {
    await assert.rejects(() => collect(input({ kind: 'judge', isFinal: true, speaker: { ...config.teams.pro[0], side: 'judge' } })), /提前断开/);
  });
});
test('HTML responses report the missing API path rather than a generic SSE failure', async () => {
  await withMock(res => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html>gateway homepage</html>'); }, async () => {
    await assert.rejects(() => collect(input()), /fixture-model.*网页.*HTTP 200.*\/v1/);
  });
});
test('non-SSE JSON API errors report a bounded explanation without exposing keys', async () => {
  await withMock(res => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'fixture-secret-not-a-real-key quota exhausted' } })); }, async () => {
    await assert.rejects(() => collect(input()), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('quota exhausted'));
      assert.ok(!error.message.includes('fixture-secret-not-a-real-key'));
      return true;
    });
  });
});
test('completion token budgets use the correct configured parameter', async () => {
  await withMock((res, body) => { assert.equal(body.max_completion_tokens, OUTPUT_TOKEN_LIMIT); assert.equal(body.max_tokens, undefined); openAIResponse(res, '正文完整。\n[[CONTINUE]]'); }, async () => {
    const provider = getProvider('custom')!;
    const previous = provider.tokenParameter;
    provider.tokenParameter = 'max_completion_tokens';
    try { const done = (await collect(input())).at(-1)!; assert.equal(done.type === 'done' && done.finishReason, 'stop'); }
    finally { provider.tokenParameter = previous; }
  });
});

test('a missing judge signal is confirmed once by the same model and parsed without changing its prose', async () => {
  let calls = 0;
  await withMock((res, body) => {
    calls++;
    if (body.stream) openAIResponse(res, '反方已经充分回应核心问题，我判反方获胜。');
    else {
      assert.equal(body.model, 'fixture-model');
      assert.ok(JSON.stringify(body.messages).includes('不要重新评价比赛'));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict":"con"}' }, finish_reason: 'stop' }] }));
    }
  }, async () => {
    const done = (await collect(input({ kind: 'judge', isFinal: true }))).at(-1)!;
    assert.equal(done.type, 'done');
    if (done.type === 'done') {
      assert.equal(done.verdict, 'con');
      assert.equal(done.text, '反方已经充分回应核心问题，我判反方获胜。');
      assert.ok(done.warning?.includes('修复'));
    }
    assert.equal(calls, 2);
  });
});

test('an ambiguous repaired verdict requests overtime without inventing a winner', async () => {
  await withMock((res, body) => body.stream ? openAIResponse(res, '双方尚未回应决定性的问题，请继续交锋。') : openAIResponse(res, '{"verdict":"continue"}'), async () => {
    const done = (await collect(input({ kind: 'judge', isFinal: true }))).at(-1)!;
    assert.equal(done.type === 'done' && done.verdict, 'continue');
  });
});

test('visible output stays inside the configured cap for both a speech and a valid judge result', async () => {
  const long = '这是一段完整的句子。'.repeat(120);
  await withMock(res => openAIResponse(res, `${long}\n[[CONCEDE]]`), async () => {
    const done = (await collect(input({ config: { ...config, speechChars: 100 } }))).at(-1)!;
    assert.equal(done.type, 'done');
    if (done.type === 'done') {
      assert.ok(Array.from(done.text).length <= 100);
      assert.equal(done.conceded, false);
      assert.equal(done.finishReason, 'output_limit');
    }
  });
  await withMock(res => openAIResponse(res, `${long}\n<decision>{"verdict":"pro"}</decision>`), async () => {
    const done = (await collect(input({ config: { ...config, speechChars: 100 }, kind: 'judge', isFinal: true }))).at(-1)!;
    assert.equal(done.type, 'done');
    if (done.type === 'done') {
      assert.equal(done.verdict, 'pro');
      assert.ok(Array.from(done.text).length > 100 && Array.from(done.text).length <= 800, 'judge text has an independent 800-character budget');
      assert.ok(!done.text.includes('<decision>'));
    }
  });
});

test('scored judge results remain structured through SSE and never leak their control JSON as live prose', async () => {
  const scores = { pro: { rigor: 21, coherence: 22, rebuttal: 23, evidence: 12, expression: 9 }, con: { rigor: 20, coherence: 20, rebuttal: 19, evidence: 12, expression: 8 } };
  await withMock(res => openAIResponse(res, `双方整场的论证需要分别评价。正方第四轮回应了关键反例，反方仍有推理缺口。\n<decision>${JSON.stringify({ verdict: 'con', scores })}</decision>`), async () => {
    const events = await collect(input({ kind: 'judge', isFinal: true, forceScoring: true, overtimeRound: 3 }));
    const done = events.at(-1)!;
    assert.equal(done.type, 'done');
    if (done.type === 'done') {
      assert.equal(done.verdict, 'pro');
      assert.deepEqual(done.scores, scores);
      assert.ok(!done.text.includes('<decision>'));
    }
    assert.ok(events.filter(e => e.type === 'token').every(e => !e.text.includes('<decision>') && !e.text.includes('rigor')));
  });
});

test('forced scoring cannot accept a winner-only repair or fabricate missing category scores', async () => {
  await withMock((res, body) => openAIResponse(res, body.stream ? '我判正方胜。<decision>{"verdict":"pro"}</decision>' : '{"verdict":"pro"}'), async () => {
    await assert.rejects(() => collect(input({ kind: 'judge', isFinal: true, forceScoring: true, overtimeRound: 3 })), /完整有效的评分表/);
  });
});

test('all formal members may explicitly forfeit, but preparation and partial output never forfeit', async () => {
  for (const [kind, finish, expected] of [['speech', 'stop', true], ['prep', 'stop', false], ['speech', 'length', false]] as const) {
    await withMock(res => openAIResponse(res, '我撤回本方核心主张。\n[[FORFEIT]]', finish), async () => {
      const done = (await collect(input({ kind, speaker: config.teams.pro[1] }))).at(-1)!;
      assert.equal(done.type === 'done' && done.forfeited, expected);
      assert.ok(done.type === 'done' && !done.text.includes('[[FORFEIT]]'));
    });
  }
});
