import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsRuling, readDecision } from '../shared/decision.ts';
import { budgetPrompt, limitVisibleText, thinkingLimit, visibleCharLimit, winningSide } from '../shared/budget.ts';

test('decisions support terminal JSON envelopes, complete JSON, inline markers and fences', () => {
  assert.deepEqual(readDecision('理由明确。\n<decision>{"verdict":"con"}</decision>'), { text: '理由明确。', verdict: 'con' });
  assert.deepEqual(readDecision('{"reason":"举证更充分。","verdict":"pro"}'), { text: '举证更充分。', verdict: 'pro' });
  assert.equal(readDecision('```json\n{"reason":"继续质询。","verdict":"continue"}\n```').verdict, 'continue');
  assert.equal(readDecision('本场正方胜。[[VERDICT:PRO]]').verdict, 'pro');
  assert.equal(readDecision('理由。\n```\n[[VERDICT:CON]]\n```').text, '理由。');
  assert.equal(readDecision('我提出申诉。<decision>{"appealed":true}</decision>').appealed, true);
});

test('mentions, malformed objects and incomplete decisions do not create winners', () => {
  for (const text of ['提及 [[VERDICT:PRO]] 不是我的结论。', '<decision>{"verdict":"pro"', '<decision>{"verdict":"unknown"}</decision>', '{"verdict":"pro","appealed":true}', '{"verdict":true}']) assert.equal(readDecision(text).verdict, undefined);
  for (const verdict of ['draw', 'continue', 'unknown', undefined]) assert.equal(winningSide(verdict), null);
  assert.equal(winningSide('pro'), 'pro');
  assert.equal(winningSide('con'), 'con');
});

test('thinking and visible character budgets are independent of round and match clocks', () => {
  assert.equal(thinkingLimit({}), 180);
  assert.equal(thinkingLimit({ thinkingSeconds: 600 }), 600);
  assert.equal(visibleCharLimit({}), 400);
  assert.equal(visibleCharLimit({ speechChars: 1000 }), 1000);
  assert.equal(visibleCharLimit({ speechChars: 200 }, 'judge'), 800);
  assert.equal(visibleCharLimit({ speechChars: 1000 }, 'review'), 800);
  const prompt = budgetPrompt({ kind: 'speech', timeLimit: 180, config: { speechChars: 600 } as any });
  assert.ok(prompt.includes('正文总量上限为 600 字'));
  assert.ok(prompt.includes('180 秒'));
  assert.ok(!prompt.includes('汉字左右'));
  assert.ok(prompt.includes('控制标记不计入正文'));
});

test('explicit opening acceptance survives a missing signal, while quotes and conflicts do not', () => {
  for (const text of ['接受。原判正方胜是合理的，尽管这场胜利是有保留的。', '我方接受本次判决。不再申诉。', '**接受本次判决。** 我方仍坚持原立场，但承认本场表现不足。', '裁判，接受本次判决。', 'Astra 大人，我方接受本次判决。']) assert.equal(acceptsRuling(text), true, text);
  for (const text of ['对方说“接受”，但我方申诉。', '“接受。”是对方的要求。', '接受。可是我方仍申请复核。', '接受。如果对方补足证据。', '我不接受本次判决。', '接受对方的例子，不接受判决。', '接受。只是暂时接受，本方保留申诉权。', '我认可这个例子。', '接受。没有异议才怪。']) assert.equal(acceptsRuling(text), false, text);
});

test('visible output limits count Unicode characters and prefer complete sentences', () => {
  assert.equal(limitVisibleText('第一句。第二句很长很长。', 8), '第一句。');
  assert.equal(limitVisibleText('😀😀😀😀😀', 3), '😀😀😀');
  assert.ok(Array.from(limitVisibleText('字'.repeat(1000), 400)).length <= 400);
});
