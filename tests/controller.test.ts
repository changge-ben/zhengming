import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useDebate, type DebateController } from '../src/useDebate.ts';
import type { DebateConfig, Match, StreamEvent, TurnRequest } from '../shared/types.ts';

const actor = (side: 'pro' | 'con') => ({ side, member: 0, providerId: 'custom', modelId: 'fixture', name: side === 'pro' ? '正方一辩' : '反方一辩' });
const config: DebateConfig = { topic: '测试加时与裁决恢复机制', pace: 'length', thinkingSeconds: 180, speechChars: 400, teamSize: 1, roundSeconds: 60, matchSeconds: 30, prepSeconds: 0, maxRounds: 1, format: 'classic', language: 'natural', demo: false, teams: { pro: [actor('pro')], con: [actor('con')] }, judge: { enabled: true, providerId: 'custom', modelId: 'fixture', appeals: false, timing: 'final' } };
const answer = (patch: Partial<Extract<StreamEvent, { type: 'done' }>> = {}) => new Response(`data: ${JSON.stringify({ type: 'done', text: '模型完整发言。', conceded: false, finishReason: 'stop', ...patch })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
const scores = { pro: { judgeResponse: 26, rigor: 18, coherence: 18, rebuttal: 13, evidence: 8, expression: 4 }, con: { judgeResponse: 24, rigor: 16, coherence: 17, rebuttal: 12, evidence: 8, expression: 4 } };

async function matchWith(configuration: DebateConfig, reply: (input: TurnRequest, controller: DebateController) => Response | Promise<Response>) {
  let controller!: DebateController;
  let saved: Match | undefined;
  renderToString(createElement(() => { controller = useDebate(match => { saved = match; }); return null; }));
  const original = globalThis.fetch;
  const requests: TurnRequest[] = [];
  globalThis.fetch = async (_url, options) => { const input = JSON.parse(options!.body as string) as TurnRequest; requests.push(input); return reply(input, controller); };
  try { await controller.start(configuration); }
  finally { globalThis.fetch = original; }
  assert.ok(saved, 'a completed or manually stopped match must be saved');
  return { saved, requests };
}

test('draw and continue verdicts extend play until a genuine winner is confirmed', async () => {
  const { saved, requests } = await matchWith(config, input => input.kind === 'judge' ? answer({ verdict: input.round === 1 ? 'draw' : input.round === 2 ? 'continue' : 'con' }) : answer());
  assert.equal(saved.result.reason, 'judge');
  assert.equal(saved.result.winner, 'con');
  assert.equal(saved.rounds, 3);
  for (let round = 1; round <= 3; round++) assert.deepEqual(requests.filter(r => r.kind === 'speech' && r.round === round).map(r => r.speaker.side), ['pro', 'con']);
  assert.ok(requests.every(r => r.timeLimit === 180), 'later context must not reduce thinking budgets');
});

test('a malformed judge response resumes debate instead of ending the match', async () => {
  const { saved } = await matchWith(config, input => input.kind === 'judge' ? new Response('data: {"type":"error","message":"裁判未返回有效裁决标记"}\n\n') : answer({ conceded: input.round === 2 && input.speaker.side === 'con' }));
  assert.equal(saved.result.reason, 'concession');
  assert.equal(saved.result.winner, 'pro');
  assert.ok(saved.messages.some(m => m.kind === 'judge' && m.finishReason === 'error'));
  assert.ok(saved.messages.some(m => m.round === 2 && m.side === 'pro'));
});

test('without a judge, crossing regulation does not end play and manual stop still works', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, enabled: false } }, (input, controller) => {
    if (input.round === 2 && input.speaker.side === 'con') controller.stop();
    return answer();
  });
  assert.equal(saved.result.reason, 'stopped');
  assert.equal(saved.result.winner, null);
  assert.ok(requests.some(r => r.round === 2));
  assert.ok(requests.every(r => r.kind === 'speech'));
});

test('an unresolved appeal review requires overtime instead of confirming the initial winner', async () => {
  const { saved } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge') return answer({ verdict: input.round === 1 ? 'pro' : 'con' });
    if (input.kind === 'appeal') return answer({ appealed: input.round === 1 });
    if (input.kind === 'review') return answer({ verdict: 'continue' });
    return answer();
  });
  assert.equal(saved.result.winner, 'con');
  assert.equal(saved.rounds, 2);
  assert.ok(saved.messages.some(m => m.kind === 'review' && m.verdict === 'continue'));
});

test('three complete overtime rounds lead to scoring at regulation plus three, with all speeches heard', async () => {
  const { saved, requests } = await matchWith(config, input => input.kind === 'judge' ? input.forceScoring ? answer({ verdict: 'con', scores }) : answer({ verdict: 'continue' }) : answer());
  assert.equal(saved.rounds, 4);
  assert.equal(saved.result.winner, 'pro', 'scores must override a contradictory declared winner');
  assert.ok(saved.result.detail.includes('评分决胜'));
  assert.deepEqual(requests.filter(r => r.kind === 'judge').map(r => [r.overtimeRound, r.forceScoring]), [[0, false], [1, false], [2, false], [3, true]]);
  assert.deepEqual(requests.filter(r => r.kind === 'speech' && r.round === 4).map(r => r.speaker.side), ['pro', 'con']);
  assert.equal(saved.config.rulesVersion, 4);
});

test('forced scoring never finalizes a plain winner without a complete scorecard', async () => {
  const { saved, requests } = await matchWith(config, input => input.kind === 'judge' ? input.round < 4 ? answer({ verdict: 'continue' }) : input.round === 4 ? answer({ verdict: 'con' }) : answer({ verdict: 'pro', scores }) : answer());
  assert.equal(saved.rounds, 5);
  assert.equal(saved.result.winner, 'pro');
  assert.ok(requests.find(r => r.kind === 'judge' && r.round === 5)?.forceScoring);
});

test('a non-captain can explicitly forfeit the stance but an interrupted signal cannot cause a loss', async () => {
  const two = { ...config, teamSize: 2, teams: { pro: [actor('pro'), { ...actor('pro'), member: 1 }], con: [actor('con'), { ...actor('con'), member: 1 }] } };
  const { saved } = await matchWith(two, input => input.speaker.side === 'pro' ? answer({ forfeited: true, finishReason: input.speaker.member ? 'stop' : 'interrupted' }) : answer());
  assert.equal(saved.result.reason, 'forfeit');
  assert.equal(saved.result.winner, 'con');
  assert.equal(saved.messages.length, 3);
});

test('a scoring appeal review retains the complete rubric and may correct the result', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge') return input.forceScoring ? answer({ verdict: 'pro', scores }) : answer({ verdict: 'continue' });
    if (input.kind === 'appeal') return answer({ appealed: input.speaker.side === 'con' });
    if (input.kind === 'review') return answer({ verdict: 'con', scores: { pro: scores.con, con: scores.pro } });
    return answer();
  });
  assert.equal(saved.result.winner, 'con');
  assert.equal(saved.rounds, 4);
  const review = requests.find(r => r.kind === 'review');
  assert.equal(review?.forceScoring, true);
  assert.equal(review?.overtimeRound, 3);
  assert.deepEqual(requests.filter(r => r.kind === 'appeal').map(r => [r.speaker.side, r.priorVerdict, r.appealAttempt]), [['con', 'pro', 1], ['pro', 'con', 2]]);
});

test('an overturned ruling gives the new loser an equal appeal and the second review can uphold it', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge') return answer({ verdict: 'con' });
    if (input.kind === 'appeal') return answer({ appealed: true });
    if (input.kind === 'review') return answer({ verdict: 'pro' });
    return answer();
  });
  assert.equal(saved.result.winner, 'pro');
  assert.equal(saved.rounds, 1);
  assert.deepEqual(requests.filter(r => r.kind === 'appeal').map(r => [r.speaker.side, r.priorVerdict, r.appealAttempt]), [['pro', 'con', 1], ['con', 'pro', 2]]);
  assert.deepEqual(requests.filter(r => r.kind === 'review').map(r => [r.priorVerdict, r.appealAttempt]), [['con', 1], ['pro', 2]]);
  const secondAppeal = requests.find(r => r.kind === 'appeal' && r.appealAttempt === 2)!;
  assert.equal(secondAppeal.history.at(-1)?.kind, 'review');
  assert.equal(secondAppeal.history.at(-1)?.verdict, 'pro');
});

test('two successful appeals require a full overtime round and reset both sides appeal rights', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge') return answer({ verdict: 'pro' });
    if (input.kind === 'appeal') return answer({ appealed: input.round === 1 || input.appealAttempt === 1 });
    if (input.kind === 'review') return answer({ verdict: input.appealAttempt === 1 ? 'con' : 'pro' });
    return answer();
  });
  assert.equal(saved.result.winner, 'con');
  assert.equal(saved.rounds, 2);
  assert.deepEqual(requests.map(r => r.kind), ['speech', 'speech', 'judge', 'appeal', 'review', 'appeal', 'review', 'speech', 'speech', 'judge', 'appeal', 'review', 'appeal']);
  assert.deepEqual(requests.filter(r => r.kind === 'appeal').map(r => [r.round, r.speaker.side, r.appealAttempt]), [[1, 'con', 1], [1, 'pro', 2], [2, 'con', 1], [2, 'pro', 2]]);
  assert.deepEqual(requests.filter(r => r.round === 2 && r.kind === 'speech').map(r => r.speaker.side), ['pro', 'con']);
});

test('a rejected first appeal settles without offering a redundant winner appeal', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge' || input.kind === 'review') return answer({ verdict: 'pro' });
    if (input.kind === 'appeal') return answer({ appealed: true });
    return answer();
  });
  assert.equal(saved.result.winner, 'pro');
  assert.equal(requests.filter(r => r.kind === 'appeal').length, 1);
});

test('two successful scored appeals keep overtime cumulative and retain complete scores in both reviews', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge') return input.forceScoring ? answer({ verdict: 'pro', scores }) : answer({ verdict: 'continue' });
    if (input.kind === 'appeal') return answer({ appealed: input.round === 4 });
    if (input.kind === 'review') return answer({ verdict: input.appealAttempt === 1 ? 'con' : 'pro', scores: input.appealAttempt === 1 ? { pro: scores.con, con: scores.pro } : scores });
    return answer();
  });
  assert.equal(saved.rounds, 5);
  assert.equal(saved.result.winner, 'pro');
  assert.deepEqual(requests.filter(r => r.kind === 'review').map(r => [r.forceScoring, r.overtimeRound, r.appealAttempt]), [[true, 3, 1], [true, 3, 2]]);
  assert.equal(requests.filter(r => r.kind === 'judge').at(-1)?.overtimeRound, 4);
  assert.equal(requests.filter(r => r.kind === 'judge').at(-1)?.forceScoring, true);
});

test('an incomplete second appeal cannot confirm an overturned verdict', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.round === 2 && input.kind === 'speech') return answer({ conceded: true });
    if (input.kind === 'judge') return answer({ verdict: 'pro' });
    if (input.kind === 'review') return answer({ verdict: 'con' });
    if (input.kind === 'appeal') return answer({ appealed: input.appealAttempt === 1 ? true : undefined, finishReason: input.appealAttempt === 1 ? 'stop' : 'timeout' });
    return answer();
  });
  assert.equal(saved.result.reason, 'concession');
  assert.equal(saved.rounds, 2);
  assert.equal(requests.filter(r => r.kind === 'appeal').length, 2);
});

test('a completed explicit acceptance without a marker finalizes the ruling without another round', async () => {
  const { saved, requests } = await matchWith({ ...config, judge: { ...config.judge, appeals: true } }, input => {
    if (input.kind === 'judge') return answer({ verdict: 'pro' });
    if (input.kind === 'appeal') return answer({ text: '接受。原判正方胜是合理的，尽管这场胜利是有保留的。' });
    return answer();
  });
  assert.equal(saved.result.winner, 'pro');
  assert.equal(saved.rounds, 1);
  assert.equal(requests.length, 4);
  assert.equal(saved.messages.at(-1)?.appealed, false);
});

test('manual stop cancels stalled streams including the new loser appeal and second review', async () => {
  for (const target of ['prep', 'speech', 'judge', 'appeal', 'review', 'second-appeal', 'second-review']) {
    const kind = target.replace('second-', '');
    let cancelled = false;
    let stoppedAt = 0;
    const { saved, requests } = await matchWith({ ...config, prepSeconds: target === 'prep' ? 30 : 0, judge: { ...config.judge, appeals: true } }, (input, controller) => {
      if (input.kind === kind && (!target.startsWith('second-') || input.appealAttempt === 2)) return new Response(new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('data: {"type":"token","text":"已收到的部分正文。"}\n\n'));
          setTimeout(() => { stoppedAt = Date.now(); controller.stop(); }, 20);
        },
        cancel() { cancelled = true; },
      }));
      if (input.kind === 'judge') return answer({ verdict: 'pro' });
      if (input.kind === 'appeal') return answer({ appealed: true });
      if (input.kind === 'review') return answer({ verdict: 'con' });
      return answer();
    });
    assert.equal(saved.result.reason, 'stopped', target);
    assert.equal(saved.result.winner, null, target);
    assert.ok(cancelled, `${target}: stalled reader must be cancelled`);
    assert.ok(Date.now() - stoppedAt < 250, `${target}: stop must not await another token`);
    assert.equal(requests.at(-1)?.kind, kind);
    if (target.startsWith('second-')) assert.equal(requests.at(-1)?.appealAttempt, 2);
    assert.ok([...saved.messages, ...saved.preparation].some(m => m.text.includes('已收到的部分正文') && m.finishReason === 'stopped'));
  }
});

test('stop during the transition after a completed turn cannot start the next actor', async () => {
  const { saved, requests } = await matchWith(config, (_input, controller) => {
    setTimeout(() => controller.stop(), 30);
    return answer();
  });
  assert.equal(saved.result.reason, 'stopped');
  assert.equal(saved.messages.length, 1);
  assert.equal(saved.messages[0].finishReason, 'stop');
  assert.equal(requests.length, 1);
});

test('manual stop while paused prevents any subsequent actor request', async () => {
  const { saved, requests } = await matchWith(config, (_input, controller) => {
    controller.pause();
    setTimeout(() => controller.stop(), 400);
    return answer();
  });
  assert.equal(saved.result.reason, 'stopped');
  assert.equal(requests.length, 1);
});
