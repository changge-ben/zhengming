import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, scoreEntry, type ScoreEntry } from '../shared/statistics.ts';
import type { Match } from '../shared/types.ts';

const team = (modelId: string) => ({ providerId: 'fixture', modelId });
function entry(id: string, changes: Partial<ScoreEntry> = {}): ScoreEntry { return { id, demo: false, teams: { pro: [team('A'), team('A')], con: [team('B')] }, result: { reason: 'judge', winner: 'pro', detail: 'fixture' }, createdAt: 1, topic: 'fixture', ...changes }; }

test('stance forfeits count as wins and losses in model standings', () => {
  const rows = standings([entry('forfeit', { result: { reason: 'forfeit', winner: 'con', detail: '正方弃守立场。' } })]);
  assert.equal(rows.find(r => r.modelId === 'B')?.wins, 1);
  assert.equal(rows.find(r => r.modelId === 'A')?.losses, 1);
});
test('standings count a repeated model once per team and deduplicate match IDs', () => {
  const rows = standings([entry('1'), entry('1'), entry('2')]);
  assert.equal(rows.find(r => r.modelId === 'A')?.wins, 2);
  assert.equal(rows.find(r => r.modelId === 'B')?.losses, 2);
  assert.ok(rows.every(r => r.games === 2));
});
test('standings distinguish draws, unresolved matches, and self play', () => {
  const rows = standings([entry('draw', { result: { reason: 'judge', winner: null, detail: '' } }), entry('limit', { result: { reason: 'limit', winner: null, detail: '' } }), entry('self', { teams: { pro: [team('A')], con: [team('A')] } })]);
  const a = rows.find(r => r.modelId === 'A')!;
  assert.deepEqual([a.wins, a.losses, a.draws, a.unresolved, a.selfPlay, a.games], [0, 0, 1, 1, 1, 3]);
});
test('standings exclude demo, errors and stopped matches by default', () => {
  const entries = [entry('demo', { demo: true }), entry('stop', { result: { reason: 'stopped', winner: null, detail: '' } }), entry('error', { result: { reason: 'error', winner: null, detail: '' } })];
  assert.deepEqual(standings(entries), []);
  assert.equal(standings(entries, true).find(r => r.modelId === 'A')?.wins, 1);
});
test('providers with the same model ID retain separate records', () => {
  const rows = standings([entry('1', { teams: { pro: [team('A')], con: [{ providerId: 'other', modelId: 'A' }] } })]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].selfPlay, 0);
});
test('score entries retain only selected participants and compact match facts', () => {
  const match = { id: '1', config: { demo: false, teamSize: 1, topic: 'topic', teams: { pro: [team('A'), team('C')], con: [team('B')] } }, result: { reason: 'judge', winner: 'pro', detail: '' }, createdAt: 1, messages: [], preparation: [], rounds: 2 } as unknown as Match;
  const result = scoreEntry(match);
  assert.equal(result.teams.pro.length, 1);
  assert.ok(!('messages' in result));
  assert.ok(!('preparation' in result));
});
