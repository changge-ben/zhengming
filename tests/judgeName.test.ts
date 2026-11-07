import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, loadConfig, loadMatches } from '../src/lib.ts';
import { normalizeJudgeTitle, type Match } from '../shared/types.ts';

test('legacy judge titles load under the new label while real API model IDs stay intact', () => {
  const legacyConfig = structuredClone(DEFAULT_CONFIG);
  legacyConfig.judge.modelId = 'Astra 大人';
  const legacyMatch: Match = {
    id: 'legacy-judge-label',
    config: legacyConfig,
    messages: [{ id: 'ruling', side: 'judge', member: 0, name: 'Astra 大人', model: 'Astra 大人', round: 1, text: 'Astra 大人裁定正方胜。', timestamp: 1 }],
    preparation: [],
    createdAt: 1,
    rounds: 1,
    result: { reason: 'judge', winner: 'pro', detail: 'Astra 大人确认胜负。' },
  };
  const saved = new Map([
    ['zhengming-config', JSON.stringify(legacyConfig)],
    ['zhengming-history', JSON.stringify([legacyMatch])],
  ]);
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => saved.get(key) ?? null } });
  try {
    assert.equal(loadConfig().judge.modelId, '裁判');
    const [match] = loadMatches();
    assert.equal(match.config.judge.modelId, '裁判');
    assert.equal(match.messages[0].name, '裁判');
    assert.equal(match.messages[0].model, '裁判');
    assert.equal(match.result.detail, '裁判确认胜负。');
    assert.equal(normalizeJudgeTitle(match.messages[0].text), '裁判裁定正方胜。');

    const realConfig = { ...legacyConfig, demo: false, judge: { ...legacyConfig.judge, providerId: 'openai', modelId: 'gpt-6-astra' } };
    saved.set('zhengming-config', JSON.stringify(realConfig));
    saved.set('zhengming-history', JSON.stringify([{ ...legacyMatch, config: realConfig, messages: [{ ...legacyMatch.messages[0], model: 'gpt-6-astra' }] }]));
    assert.equal(loadConfig().judge.modelId, 'gpt-6-astra');
    assert.equal(loadMatches()[0].messages[0].model, 'gpt-6-astra');
    assert.equal(normalizeJudgeTitle('Astra 裁判使用 gpt-6-astra。'), '裁判使用 gpt-6-astra。');
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
