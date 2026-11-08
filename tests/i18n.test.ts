import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
import { EN_MESSAGES, formatMessage, translateMessage } from '../shared/messages.ts';
import { acceptsRuling, readDecision } from '../shared/decision.ts';
import { buildPrompts, demoSpeech } from '../server/debate.ts';
import { DEFAULT_CONFIG, exportMatch, loadConfig, scoreMarkdown } from '../src/lib.ts';
import { getLocale, setLocale, t } from '../src/i18n.ts';
import type { Match, TurnRequest } from '../shared/types.ts';

test('translations preserve all interpolation slots and cover localized UI literals', async () => {
  const slots = (text: string) => [...new Set(text.match(/\{\d+\}/g) || [])].sort();
  for (const [source, english] of Object.entries(EN_MESSAGES)) {
    assert.deepEqual(slots(english), slots(source), source);
    assert.ok(english.trim(), source);
  }
  const files = (await readdir(new URL('../src/', import.meta.url))).filter(name => /\.tsx?$/.test(name));
  for (const file of files) {
    const text = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const root = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function check(source: string) {
      if (/[\u3400-\u9fff]/.test(source)) assert.ok(EN_MESSAGES[source], `${file} missing translation for ${source}`);
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(root) === 't' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) check(node.arguments[0].text);
      if (ts.isTaggedTemplateExpression(node) && node.tag.getText(root) === 't') {
        check(ts.isNoSubstitutionTemplateLiteral(node.template) ? node.template.text : node.template.head.text + node.template.templateSpans.map((span, index) => `{${index}}${span.literal.text}`).join(''));
      }
      ts.forEachChild(node, visit);
    }
    visit(root);
  }
});

test('application notices switch languages while values and unknown content stay intact', () => {
  assert.equal(formatMessage('en', '第 {0} 轮', [3]), 'Round 3');
  assert.equal(formatMessage('en', '{0}获胜', ['Pro']), 'Pro wins');
  assert.equal(formatMessage('en', '裁判（{0}）', ['裁判']), 'Judge (裁判)');
  const notice = '裁判确认胜负：反方获胜。';
  assert.equal(translateMessage('en', notice), 'The judge confirmed the result. Con wins. ');
  assert.equal(translateMessage('zh-CN', 'Round 3'), '第 3 轮');
  assert.equal(translateMessage('zh-CN', 'headers'), 'headers');
  const supplied = '用户的原始观点 {0} / custom-model-v1';
  assert.equal(formatMessage('en', '删除档案：{0}', [supplied]), `Delete archive — ${supplied}`);
  assert.equal(translateMessage('en', supplied), supplied);
});

test('language preference leaves stored topics and actual model IDs unchanged', () => {
  const originalLocale = getLocale();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    setLocale('en');
    assert.equal(values.get('zhengming-locale'), 'en');
    assert.equal(t('开场大厅'), 'Lobby');
    const saved = structuredClone(DEFAULT_CONFIG);
    saved.demo = false;
    saved.topic = '我自己写下的辩题应当保留原文吗？';
    saved.teams.pro[0].modelId = 'my-model-中文-v1';
    values.set('zhengming-config', JSON.stringify(saved));
    const loaded = loadConfig();
    assert.equal(loaded.topic, saved.topic);
    assert.equal(loaded.teams.pro[0].modelId, saved.teams.pro[0].modelId);
    values.delete('zhengming-config');
    assert.match(loadConfig().topic, /^Will advances in AI/);
    setLocale('zh-CN');
    assert.equal(t('开场大厅'), '开场大厅');
    assert.equal(scoreMarkdown(undefined).length, 0);
  } finally {
    setLocale(originalLocale);
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('English acceptance is explicit and rejects conditional or contradictory statements', () => {
  for (const text of ['I accept this ruling. The comparison was fair.', 'Judge, we accept the decision. We will not appeal.', 'Our team accepts the verdict.']) {
    assert.equal(acceptsRuling(text), true, text);
  }
  for (const text of ['I accept this ruling if you correct the score.', 'I accept this ruling. However, I request a review.', 'I do not accept this ruling.', 'I accept this ruling, but I will appeal.', 'The opponent said "I accept this ruling."']) assert.equal(acceptsRuling(text), false, text);
});

test('English turns carry an explicit language and character budget across every phase', () => {
  const config = { ...structuredClone(DEFAULT_CONFIG), locale: 'en' as const, demo: true };
  for (const kind of ['prep', 'speech', 'judge', 'appeal', 'review'] as const) {
    const request: TurnRequest = { config, speaker: kind === 'judge' || kind === 'review' ? { ...config.teams.pro[0], side: 'judge' } : config.teams.pro[0], kind, round: 1, timeLimit: 180, history: [], isFinal: true };
    const prompts = buildPrompts(request);
    assert.match(prompts.system, /OUTPUT LANGUAGE — ENGLISH/);
    assert.match(prompts.system, /character limit, not a word limit/);
    const script = demoSpeech(request);
    assert.doesNotMatch(script, /[\u3400-\u9fff]/);
    if (kind === 'judge' || kind === 'review') assert.equal(readDecision(script).verdict, 'pro');
    if (kind === 'appeal') assert.equal(readDecision(script).appealed, true);
  }
  const final = demoSpeech({ config, speaker: config.teams.con[0], round: 3, kind: 'speech', history: [], timeLimit: 180 });
  assert.match(final, /\[\[CONCEDE\]\]/);
  const chinese = buildPrompts({ config: DEFAULT_CONFIG, speaker: DEFAULT_CONFIG.teams.pro[0], round: 1, timeLimit: 180, history: [] });
  assert.match(chinese.system, /中文辩论/);
  assert.doesNotMatch(chinese.system, /OUTPUT LANGUAGE — ENGLISH/);
});

test('English structured demo keeps assigned references and a complete scorecard', () => {
  const config = { ...structuredClone(DEFAULT_CONFIG), locale: 'en' as const, protocol: 'structured' as const, demo: true };
  const question = { id: 'q1', side: 'con' as const, member: 0, name: 'Con Speaker 1', model: 'demo', round: 2, text: 'How does your condition work?', timestamp: 0, stage: 'question' as const };
  const request: TurnRequest = { config, speaker: config.teams.pro[0], round: 2, stage: 'answer', replyTo: 'q1', timeLimit: 180, history: [question] };
  assert.match(demoSpeech(request), /\[M1\]/);
  for (const stage of ['opening', 'question', 'answer', 'rebuttal', 'closing', 'overtime', 'free'] as const) {
    const pro = demoSpeech({ ...request, stage });
    const con = demoSpeech({ ...request, speaker: config.teams.con[0], stage });
    assert.notEqual(pro, con, stage);
    for (const script of [pro, con]) assert.ok(Array.from(script.split('[[CONTINUE]]')[0].trim()).length <= 400, `${stage} exceeds the demo budget`);
  }
  const scored = readDecision(demoSpeech({ ...request, kind: 'judge', isFinal: true, forceScoring: true }));
  assert.equal(scored.verdict, 'pro');
  assert.equal(scored.scores?.pro.judgeResponse, 30);
});

test('English Markdown export localizes metadata and preserves user text and model IDs', async () => {
  const originalLocale = getLocale();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const createObjectURL = URL.createObjectURL;
  let exported: Blob | undefined;
  const download = { href: '', download: '', click() {} };
  const config = structuredClone(DEFAULT_CONFIG);
  config.demo = false;
  config.topic = '用户自己的辩题需要保留原文吗？';
  const originalSpeech = '我以生活中的例子回应 [M1]，原始发言必须完整保留。';
  const match: Match = {
    id: 'export-fixture', createdAt: 1, config, rounds: 1, preparation: [],
    result: { reason: 'judge', winner: 'pro', detail: '裁判确认胜负：正方获胜。' },
    messages: [{ id: 'm1', side: 'pro', member: 0, name: '正方一辩', model: 'custom-model-中文-v1', round: 1, text: originalSpeech, timestamp: 1 }],
  };
  try {
    setLocale('en');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => download } });
    URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); exported = blob; return 'blob:export-fixture'; };
    exportMatch(match);
    assert.ok(exported);
    const markdown = await exported.text();
    assert.match(markdown, /^# Zhengming · AI Debate Arena/);
    assert.match(markdown, /Round 1 · Pro Speaker 1/);
    assert.match(markdown, /The judge confirmed the result. Pro wins./);
    assert.ok(markdown.includes(config.topic));
    assert.ok(markdown.includes(originalSpeech));
    assert.ok(markdown.includes('custom-model-中文-v1'));
    assert.match(download.download, /^Zhengming-/);
  } finally {
    URL.createObjectURL = createObjectURL;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    setLocale(originalLocale);
  }
});
