import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBaseUrl, isLocalBaseUrl } from '../shared/providerConfig.ts';
import {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
} from '../src/recovery.ts';
import { api, DEFAULT_CONFIG, loadMatches } from '../src/lib.ts';
import type { Match } from '../shared/types.ts';

test('pasted API endpoints retain supplier prefixes and incompatible addresses fail early', () => {
  assert.equal(
    normalizeBaseUrl(' https://api.example/v1/chat/completions/ ', 'openai'),
    'https://api.example/v1'
  );
  assert.equal(
    normalizeBaseUrl('https://api.example/compatible-mode/v1/models', 'openai'),
    'https://api.example/compatible-mode/v1'
  );
  assert.equal(
    normalizeBaseUrl('https://api.example/prefix/v1/messages', 'anthropic'),
    'https://api.example/prefix/v1'
  );
  assert.equal(
    normalizeBaseUrl('https://api.deepseek.com/', 'openai'),
    'https://api.deepseek.com'
  );
  for (const value of [
    'not a URL',
    'file:///tmp',
    'https://user:password@example.com/v1',
    'https://api.example/v1?key=secret',
    'https://api.example/v1#fragment',
    'https://api.example/v1/messages',
  ])
    assert.throws(() => normalizeBaseUrl(value, 'openai'));
  assert.throws(() =>
    normalizeBaseUrl('https://api.example/v1/chat/completions', 'anthropic')
  );
  assert.ok(isLocalBaseUrl('http://[::1]:1234/v1'));
  assert.ok(isLocalBaseUrl('http://localhost:11434/v1'));
  assert.equal(isLocalBaseUrl('https://localhost.evil.example'), false);
  assert.equal(isLocalBaseUrl('invalid'), false);
});

test('reload checkpoints retain partial speech, cannot invent a winner, and preserve completed results', () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  const match: Match = {
    id: 'checkpoint',
    config: structuredClone(DEFAULT_CONFIG),
    createdAt: 1,
    rounds: 2,
    preparation: [],
    messages: [
      {
        id: 'partial',
        side: 'pro',
        member: 0,
        name: '正方一辩',
        model: 'demo',
        round: 2,
        text: '已经生成的部分正文。',
        timestamp: 1,
        finishReason: 'stopped',
      },
    ],
    result: { reason: 'judge', winner: 'pro', detail: '已确认胜负。' },
  };
  try {
    assert.ok(saveCheckpoint(match));
    assert.equal(loadCheckpoint()?.messages[0].text, match.messages[0].text);
    assert.equal(loadCheckpoint()?.result.reason, 'stopped');
    assert.equal(loadCheckpoint()?.result.winner, null);
    clearCheckpoint('another-match');
    assert.ok(loadCheckpoint());
    assert.ok(saveCheckpoint(match, true));
    assert.deepEqual(
      loadCheckpoint()?.result,
      match.result,
      'a failed archive write must not discard a completed verdict'
    );
    clearCheckpoint(match.id);
    assert.equal(loadCheckpoint(), null);
    values.set('zhengming-active-match', 'broken-json');
    assert.equal(loadCheckpoint(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('blocked browser storage does not interrupt normal debate', () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('Storage disabled');
    },
  });
  try {
    assert.equal(saveCheckpoint({} as Match), false);
    assert.equal(loadCheckpoint(), null);
    assert.doesNotThrow(() => clearCheckpoint('id'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('one malformed archive or message does not hide other readable matches', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const valid = {
    id: 'valid',
    createdAt: 1,
    rounds: 1,
    config: structuredClone(DEFAULT_CONFIG),
    preparation: [],
    messages: [
      {
        id: 'message',
        side: 'pro',
        member: 0,
        round: 1,
        text: '完整记录',
        timestamp: 1,
      },
      null,
      { text: 12 },
    ],
    result: { reason: 'stopped', winner: null },
  };
  const data = [
    null,
    {
      id: 'broken',
      config: { topic: '坏记录' },
      messages: [],
      result: { reason: 'stopped' },
    },
    valid,
  ];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => JSON.stringify(data) },
  });
  try {
    const matches = loadMatches();
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'valid');
    assert.equal(matches[0].messages.length, 3);
    assert.equal(matches[0].messages[0].text, '完整记录');
    assert.match(matches[0].messages[1].text, /原编号保留/);
    assert.equal(matches[0].result.detail, '历史比赛记录');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('local API failures give actionable messages and preserve service validation errors', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(api('/api/providers'), /启动争鸣.cmd/);
    globalThis.fetch = async () =>
      new Response('<html>wrong endpoint</html>', { status: 200 });
    await assert.rejects(api('/api/providers'), /无效响应/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: '请填写模型 ID' }), { status: 400 });
    await assert.rejects(api('/api/providers'), /请填写模型 ID/);
    globalThis.fetch = async (_url, options) => {
      assert.ok(options?.signal);
      return new Response(JSON.stringify({ ok: true }));
    };
    assert.deepEqual(await api('/api/health'), { ok: true });
  } finally {
    globalThis.fetch = previous;
  }
});
