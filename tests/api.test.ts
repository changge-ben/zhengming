import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('HTTP API validates input, blocks foreign origins and persists only opted-in encrypted keys', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhengming-api-test-'));
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const entry = fileURLToPath(new URL('../server/index.ts', import.meta.url));
  const launch = () => spawn(process.execPath, ['--import', import.meta.resolve('tsx'), entry], { cwd: dir, env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '', QWEN_API_KEY: '', ANTHROPIC_API_KEY: '', CUSTOM_API_KEY: '' }, stdio: 'pipe', windowsHide: true });
  const child = launch();
  let logs = ''; child.stderr.on('data', chunk => { logs += chunk.toString(); });
  const url = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${url}/api/health`)).ok) { ready = true; break; } } catch { /* wait for startup */ }
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    assert.ok(ready, `API failed to start: ${logs}`);
    const before = await (await fetch(`${url}/api/providers`)).json() as { providers: { id: string; hasKey: boolean }[] };
    assert.equal(before.providers.length, 5);
    const invalid = await fetch(`${url}/api/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400);
    const forbidden = await fetch(`${url}/api/providers`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(forbidden.status, 403);
    const malformed = await fetch(`${url}/api/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' });
    assert.equal(malformed.status, 400);
    const fakeSecret = 'fixture-secret-never-save-to-disk';
    const saved = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '本地测试服务', baseUrl: 'http://localhost:11434/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: ['fixture-model'], apiKey: fakeSecret }) });
    assert.equal(saved.status, 200);
    const savedText = await saved.text(); assert.ok(!savedText.includes(fakeSecret));
    const disk = await readFile(path.join(dir, '.local/providers.json'), 'utf8');
    assert.ok(!disk.includes(fakeSecret)); assert.ok(!disk.includes('apiKey'));
    const updated = await (await fetch(`${url}/api/providers`)).json() as { providers: { id: string; hasKey: boolean }[] };
    assert.equal(updated.providers.find(p => p.id === 'custom')?.hasKey, true);
    const unknown = await fetch(`${url}/api/does-not-exist`); assert.equal(unknown.status, 404);
    const created = await Promise.all(['alpha', 'beta'].map(async name => {
      const response = await fetch(`${url}/api/providers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, baseUrl: `https://${name}.example/v1`, protocol: 'openai', tokenParameter: 'max_tokens', models: [`${name}-model`], apiKey: fakeSecret }) });
      assert.equal(response.status, 201);
      const text = await response.text(); assert.ok(!text.includes(fakeSecret));
      return JSON.parse(text) as { id: string };
    }));
    assert.notEqual(created[0].id, created[1].id);
    const persisted = await readFile(path.join(dir, '.local/providers.json'), 'utf8');
    assert.ok(!persisted.includes(fakeSecret));
    assert.ok(created.every(p => persisted.includes(p.id)));
    const patch = { name: '本地测试服务', baseUrl: 'http://localhost:11434/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: ['fixture-model'] };
    let rememberedId = '';
    if (process.platform === 'win32') {
      // Opt in using an existing in-memory key without retyping it.
      const response = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, rememberKey: true }) });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(!text.includes(fakeSecret) && !text.includes('protectedKey'));
      assert.equal(JSON.parse(text).providers.find((p: { id: string }) => p.id === 'custom').hasSavedKey, true);
      const encryptedDisk = await readFile(path.join(dir, '.local/providers.json'), 'utf8');
      assert.ok(!encryptedDisk.includes(fakeSecret));
      assert.ok(JSON.parse(encryptedDisk).find((p: { id: string }) => p.id === 'custom').protectedKey);
      const extra = await fetch(`${url}/api/providers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, apiKey: fakeSecret, rememberKey: true }) });
      assert.equal(extra.status, 201);
      rememberedId = (await extra.json()).id;
      // Opting out removes the encrypted copy but keeps this session usable.
      const optout = await fetch(`${url}/api/providers/${rememberedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, rememberKey: false }) });
      const opted = (await optout.json()).providers.find((p: { id: string }) => p.id === rememberedId);
      assert.equal(opted.hasKey, true); assert.equal(opted.hasSavedKey, false);
    }
    child.kill(); await once(child, 'exit');
    const restarted = launch();
    try {
      let restored: { id: string; hasKey: boolean; models: string[] }[] = [];
      for (let i = 0; i < 80; i++) {
        try { const response = await fetch(`${url}/api/providers`); if (response.ok) { restored = (await response.json()).providers; break; } } catch { /* startup */ }
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      for (const p of created) {
        assert.ok(restored.some(r => r.id === p.id && !r.hasKey && r.models.length === 1), 'each new provider must survive restart without storing its key');
      }
      if (process.platform === 'win32') {
        assert.equal(restored.find(p => p.id === 'custom')?.hasKey, true, 'remembered key must survive process restart');
        assert.equal(restored.find(p => p.id === rememberedId)?.hasKey, false, 'opted-out key must not return after restart');
        const before = JSON.parse(await readFile(path.join(dir, '.local/providers.json'), 'utf8')).find((p: { id: string }) => p.id === 'custom').protectedKey;
        const blank = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, rememberKey: true }) });
        assert.equal(blank.status, 200);
        const after = JSON.parse(await readFile(path.join(dir, '.local/providers.json'), 'utf8')).find((p: { id: string }) => p.id === 'custom').protectedKey;
        assert.equal(after, before, 'saving blank key preserves remembered key');
        const replacement = 'fixture-replacement-secret';
        const replaced = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, apiKey: replacement, rememberKey: true }) });
        assert.equal(replaced.status, 200);
        const replacementDisk = await readFile(path.join(dir, '.local/providers.json'), 'utf8');
        assert.ok(!replacementDisk.includes(replacement) && !replacementDisk.includes(fakeSecret));
        const { restoreKey } = await import('../server/keyStorage.ts');
        assert.equal(await restoreKey(JSON.parse(replacementDisk).find((p: { id: string }) => p.id === 'custom').protectedKey), replacement);
        const cleared = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, clearKey: true, rememberKey: true }) });
        const clearedProvider = (await cleared.json()).providers.find((p: { id: string }) => p.id === 'custom');
        assert.equal(clearedProvider.hasKey, false); assert.equal(clearedProvider.hasSavedKey, false);
        const clearedDisk = await readFile(path.join(dir, '.local/providers.json'), 'utf8');
        assert.ok(!clearedDisk.includes('protectedKey') && !clearedDisk.includes(replacement));
      }
    } finally { if (restarted.exitCode === null && restarted.signalCode === null) { restarted.kill(); await once(restarted, 'exit'); } }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('zhengming-api-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
