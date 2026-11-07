import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';

const execute = promisify(execFile);
test('standalone server runs outside the source tree and keeps data independent of application files', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zhengming-distribution-'));
  const application = path.join(directory, '中文 程序');
  const storage = path.join(directory, '独立 数据');
  const assets = path.join(application, 'assets');
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, 'index.html'), '<title>portable fixture</title>');
  const entry = path.join(application, 'server.mjs');
  await execute(process.execPath, ['scripts/build-server.mjs', entry], { windowsHide: true });
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const environment = { ...process.env, PORT: String(port), ZHENGMING_DATA_DIR: storage, ZHENGMING_STATIC_DIR: assets, ZHENGMING_MODE: 'portable', OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '', QWEN_API_KEY: '', ANTHROPIC_API_KEY: '', CUSTOM_API_KEY: '' };
  let child: ChildProcess | undefined;
  const url = `http://127.0.0.1:${port}`;
  async function launch() {
    child = spawn(process.execPath, [entry], { cwd: application, env: environment, stdio: 'pipe', windowsHide: true });
    child.stderr?.on('data', () => { /* Fixtures contain no user configuration. */ });
    for (let i = 0; i < 80; i++) {
      try { const response = await fetch(`${url}/api/health`); if (response.ok) return response.json(); } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    throw new Error('Standalone bundle did not start');
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
  }
  try {
    const status = await launch();
    assert.equal(status.appId, 'zhengming-debate-arena');
    assert.equal(status.pid, child?.pid); assert.equal(status.mode, 'portable');
    assert.equal(typeof status.version, 'string');
    assert.ok((await (await fetch(url)).text()).includes('portable fixture'));
    const patch = { name: 'bundle fixture', baseUrl: 'http://127.0.0.1:11434/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: ['bundle-model'], apiKey: 'fixture-bundle-secret' };
    const response = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    assert.equal(response.status, 200);
    assert.ok(!(await readFile(path.join(storage, 'providers.json'), 'utf8')).includes(patch.apiKey));
    await assert.rejects(access(path.join(application, '.local', 'providers.json')));
    await stop(); await launch();
    const providers = (await (await fetch(`${url}/api/providers`)).json()).providers;
    assert.ok(providers.find((provider: { id: string; models: string[]; hasKey: boolean }) => provider.id === 'custom' && provider.models.includes('bundle-model') && !provider.hasKey));
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('zhengming-distribution-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
