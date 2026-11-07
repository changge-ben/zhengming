import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readScorecard, scoreWinner, scoreTotal } from '../shared/adjudication.ts';
import { readDecision } from '../shared/decision.ts';
import { parseForfeit, parseControl, type DebateConfig, type TurnRequest, type Utterance } from '../shared/types.ts';
import { EXPRESSION_STYLES, effectiveStyles, styleLabels } from '../shared/styles.ts';
import { DEFAULT_CONFIG, scoreMarkdown } from '../src/lib.ts';
import ScoreTable from '../src/ScoreTable.tsx';
import { buildPrompts } from '../server/debate.ts';
import { transcriptFor } from '../server/judge.ts';

const scores = { pro: { rigor: 22, coherence: 21, rebuttal: 23, evidence: 12, expression: 9 }, con: { rigor: 20, coherence: 20, rebuttal: 21, evidence: 11, expression: 9 } };
const request = (patch: Partial<TurnRequest> = {}): TurnRequest => ({ config: structuredClone(DEFAULT_CONFIG), speaker: DEFAULT_CONFIG.teams.pro[0], round: 6, history: [], kind: 'speech', timeLimit: 180, ...patch });

test('new scores give judge responses 30 percent and keep old scorecards readable', () => {
  const modern = { pro: { judgeResponse: 30, rigor: 17, coherence: 18, rebuttal: 12, evidence: 8, expression: 4 }, con: { judgeResponse: 10, rigor: 20, coherence: 20, rebuttal: 15, evidence: 10, expression: 5 } };
  assert.equal(scoreTotal(modern.pro), 89);
  assert.equal(scoreWinner(modern), 'pro');
  assert.ok(readScorecard(modern));
  assert.equal(readScorecard({ ...modern, con: scores.con }), undefined);
  assert.equal(readScorecard({ ...modern, pro: { ...modern.pro, judgeResponse: 31 } }), undefined);
  assert.ok(readScorecard(scores));
  const markup = renderToStaticMarkup(createElement(ScoreTable, { value: modern }));
  assert.ok(markup.includes('正面回应裁判问题'));
  assert.ok(scoreMarkdown(modern).join('\n').includes('正面回应裁判问题 / 30'));
  const system = buildPrompts(request({ kind: 'judge', isFinal: true, forceScoring: true })).system;
  assert.ok(system.includes('judgeResponse=正面回应裁判问题（0—30）'));
  assert.ok(system.includes('本项双方同给30分'));
  assert.ok(system.includes('正文总量上限为 800 字'));
  assert.ok(system.includes('不能把不同意裁判当作不尊重'));
});

test('scorecards validate every category and derive winners from totals, not a contradictory label', () => {
  assert.equal(scoreTotal(scores.pro), 87);
  assert.equal(scoreWinner(scores), 'pro');
  assert.equal(readDecision(`判词。<decision>${JSON.stringify({ verdict: 'con', scores })}</decision>`).verdict, 'pro');
  for (const invalid of [{ ...scores, pro: { ...scores.pro, rigor: 26 } }, { ...scores, con: { ...scores.con, evidence: -1 } }, { ...scores, pro: { ...scores.pro, expression: 1.5 } }, { ...scores, con: {} }]) {
    assert.equal(readScorecard(invalid), undefined);
    assert.equal(readDecision(`<decision>${JSON.stringify({ verdict: 'pro', scores: invalid })}</decision>`).verdict, undefined);
  }
});

test('ties use published dimensions and exact ties require a grounded deciding reason', () => {
  const tied = { pro: { ...scores.pro, coherence: 22, rigor: 21 }, con: { ...scores.pro } };
  assert.equal(scoreTotal(tied.pro), scoreTotal(tied.con));
  assert.equal(scoreWinner(tied), 'pro');
  const identical = { pro: scores.pro, con: scores.pro };
  assert.equal(scoreWinner(identical, 'con'), undefined);
  assert.equal(scoreWinner({ ...identical, tiebreak: '反方第六轮提出的关键反例始终未获回应。' }, 'con'), 'con');
});

test('score table and Markdown expose category scores and computed totals', () => {
  const markup = renderToStaticMarkup(createElement(ScoreTable, { value: scores }));
  assert.ok(markup.includes('整场表现评分表'));
  assert.ok(markup.includes('87'));
  assert.ok(markup.includes('81'));
  assert.ok(scoreMarkdown(scores).join('\n').includes('| 总分 | 87 | 81 |'));
});

test('standalone forfeits are distinguished from quoted words, facts and unfinished signals', () => {
  assert.equal(parseForfeit('我撤回本方立场。\n[[FORFEIT]]'), true);
  assert.equal(parseControl('我撤回本方立场。\n[[FORFEIT]]').text, '我撤回本方立场。');
  for (const raw of ['我们都累，但我仍支持本方结论。', '对方说“我们都对”，我反对。', '他要求 [[FORFEIT]]，我不接受。', '[[FORFEIT]]\n这是举例。', '我撤回。\n[[FORFE']) assert.equal(parseForfeit(raw), false);
});

test('participants and judges see earlier middle rounds instead of only the latest exchanges', () => {
  const history = Array.from({ length: 90 }, (_, i) => ({ id: String(i), side: i % 2 ? 'con' : 'pro', member: i % 3, name: '辩手', model: 'fixture', round: Math.floor(i / 6) + 1, text: `唯一发言${i}。`, timestamp: i, kind: 'speech' })) as Utterance[];
  for (const kind of ['speech', 'judge', 'review', 'appeal'] as const) {
    const input = request({ kind, history });
    const text = transcriptFor(input);
    for (const i of [0, 5, 20, 45, 70, 89]) assert.ok(text.includes(`唯一发言${i}。`));
    const prompt = buildPrompts(input);
    assert.ok(prompt.user.includes('唯一发言20。'));
  }
  const system = buildPrompts(request()).system;
  assert.ok(system.includes('整场交锋，不只接上一句'));
  assert.ok(system.includes('不要绕开追问换题'));
  assert.ok(system.includes('局部事实'));
});

test('the judge evaluates both argument chains and switches to a complete public rubric only when required', () => {
  const ordinary = buildPrompts(request({ kind: 'judge', isFinal: true })).system;
  assert.ok(ordinary.includes('不能把驳倒某一个例子'));
  assert.ok(ordinary.includes('选手没有外部检索工具'));
  assert.ok(ordinary.includes('任一辩手若明确撤回本方核心主张'));
  assert.ok(!ordinary.includes('现在进入强制评分决胜'));
  const forced = buildPrompts(request({ kind: 'review', isFinal: true, forceScoring: true, overtimeRound: 3 })).system;
  assert.ok(forced.includes('现在进入强制评分决胜'));
  assert.ok(forced.includes('coherence=逻辑自洽性（0—20）'));
  assert.ok(forced.includes('当前已完成加时 3 轮'));
});

test('expression preferences combine and reach all actors while preserving old single-style settings', () => {
  assert.deepEqual(effectiveStyles({ language: 'witty' }), ['natural', 'sharp', 'humorous']);
  assert.deepEqual(effectiveStyles({ language: 'rigorous' }), ['rigorous']);
  const config: DebateConfig = { ...DEFAULT_CONFIG, styles: EXPRESSION_STYLES.map(s => s.id) };
  assert.equal(styleLabels(config), '生活化 · 言辞犀利 · 幽默风趣 · 有文采 · 严谨清楚 · 简洁有力');
  for (const kind of ['speech', 'prep', 'judge', 'review', 'appeal'] as const) {
    const text = buildPrompts(request({ config, kind })).system;
    for (const s of EXPRESSION_STYLES) assert.ok(text.includes(`${s.label}：${s.prompt}`));
    assert.ok(text.includes('实例与文采'));
    assert.ok(!text.includes('少开玩笑'));
  }
});
