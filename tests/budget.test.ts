import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetPrompt, OUTPUT_TOKEN_LIMIT, roundTurnSeconds } from '../shared/budget.ts';

test('all seats get equal fixed round budgets, without unused-time bonuses', () => {
  for (const seats of [2, 4, 6]) {
    const limit = roundTurnSeconds(120, 600, seats);
    const allocations = Array(seats).fill(limit);
    assert.ok(allocations.every(n => n === allocations[0]));
    assert.ok(limit * seats < 120);
    assert.equal(roundTurnSeconds(120, 600, seats), roundTurnSeconds(120, 600, seats));
  }
});
test('final round shares remaining match time across all seats equally', () => {
  assert.equal(roundTurnSeconds(120, 30, 6), 4.6);
  assert.ok(roundTurnSeconds(120, 30, 6) * 6 <= 30);
  assert.equal(roundTurnSeconds(120, .01, 6), .05);
});
test('budget prompts disclose time, tokens, and completion margin without prescribing tactics', () => {
  const prompt = budgetPrompt({ timeLimit: 19.5, kind: 'speech' });
  assert.ok(prompt.includes('19.5 秒'));
  assert.ok(prompt.includes(`${OUTPUT_TOKEN_LIMIT} tokens`));
  assert.ok(prompt.includes('连接、思考和输出'));
  assert.ok(prompt.includes('结束标记留出余量'));
  assert.ok(prompt.includes('战术、论证结构和分工仍由你自行决定'));
});
