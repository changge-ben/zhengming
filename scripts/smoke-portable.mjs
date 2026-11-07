import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rename, appendFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';

const execute = promisify(execFile);
if (process.platform !== 'win32') throw new Error('便携包冒烟检查需要 Windows。');
const root = process.cwd();
const latest = JSON.parse(await readFile('.local/releases/latest.json', 'utf8'));
const testRoot = await mkdtemp(path.join(root, '.local', 'portable-smoke-'));
const unpacked = path.join(testRoot, '中文 空格路径');
const data = path.join(testRoot, '独立 用户数据');
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const environment = { ...process.env, PATH: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '', QWEN_API_KEY: '', ANTHROPIC_API_KEY: '', CUSTOM_API_KEY: '' };
await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:ZM_ARCHIVE -DestinationPath $env:ZM_EXPAND'], { windowsHide: true, env: { ...environment, ZM_ARCHIVE: latest.zip, ZM_EXPAND: unpacked }, timeout: 120000 });
let directory = path.join(unpacked, (await readdir(unpacked))[0]);
const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const fakeSecret = 'fixture-portable-dpapi-key-not-a-real-secret';
let conflict;
let passed = false;
const checks = [];
const health = async () => (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2500) })).json();
async function launch(options = []) {
  return execute(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'portable-launcher.ps1'), '-NoBrowser', '-Port', String(port), '-DataDirectory', data, ...options], { env: environment, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
}
async function stop() {
  await launch(['-Stop', '-Force']);
  for (let i = 0; i < 30; i++) {
    try { await health(); } catch { return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('服务没有按预期停止。');
}
try {
  await launch();
  const first = await health();
  assert.equal(first.version, latest.version); assert.equal(first.mode, 'portable');
  const runtime = await execute(path.join(directory, 'runtime', 'node.exe'), ['-p', 'process.versions.node'], { env: environment, windowsHide: true });
  assert.equal(runtime.stdout.trim(), '24.22.2');
  checks.push('ZIP 解压后在中文空格路径启动，PATH 无系统 Node');
  const html = await (await fetch(url)).text();
  assert.ok(html.includes('争鸣 · AI 辩论场'));
  const script = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(url + script)).status, 200);
  checks.push('前端 HTML 与静态资源正常');
  await launch(); assert.equal((await health()).pid, first.pid);
  checks.push('重复启动复用同一服务');
  const provider = { name: '便携模拟接口', baseUrl: 'http://127.0.0.1:11434/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: ['fixture-portable'], apiKey: fakeSecret, rememberKey: true };
  const response = await fetch(`${url}/api/providers/custom`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(provider) });
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(fakeSecret));
  assert.ok(!(await readFile(path.join(data, 'providers.json'), 'utf8')).includes(fakeSecret));
  const speaker = side => ({ side, member: 0, name: side === 'pro' ? '正方一辩' : '反方一辩', modelId: '演示模型', providerId: 'demo' });
  const config = { topic: 'AI 是否带来更多自由', teamSize: 1, roundSeconds: 120, matchSeconds: 300, prepSeconds: 0, maxRounds: 3, format: 'classic', language: 'natural', demo: true, teams: { pro: [speaker('pro')], con: [speaker('con')] }, judge: { enabled: false, providerId: 'demo', modelId: '裁判', appeals: true, timing: 'final' } };
  const stream = await fetch(`${url}/api/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, speaker: speaker('pro'), round: 1, timeLimit: 5, history: [], kind: 'speech' }) });
  assert.ok((await stream.text()).includes('"type":"done"'));
  checks.push('便携服务支持模拟 SSE 及加密密钥保存');
  await stop();
  const moved = path.join(testRoot, '更新 后的程序目录');
  for (const target of [directory, moved]) assert.ok(path.resolve(target).startsWith(path.resolve(testRoot) + path.sep));
  await rename(directory, moved); directory = moved;
  await launch();
  const providers = (await (await fetch(`${url}/api/providers`)).json()).providers;
  assert.ok(providers.find(p => p.id === 'custom' && p.hasKey && p.hasSavedKey && p.models.includes('fixture-portable')));
  checks.push('移动程序目录后使用原数据恢复加密配置');
  const diagnosis = await launch(['-Diagnose']);
  assert.ok(!diagnosis.stdout.includes(fakeSecret));
  const reports = (await readdir(data)).filter(file => file.startsWith('diagnostics-'));
  assert.ok(reports.length > 0);
  assert.ok(!(await readFile(path.join(data, reports[0]), 'utf8')).includes(fakeSecret));
  checks.push('诊断报告生成且没有测试密钥');
  await stop();
  conflict = createServer((_request, result) => result.end('other application'));
  conflict.listen(port, '127.0.0.1'); await once(conflict, 'listening');
  await assert.rejects(launch(), error => error.code === 1 && error.stdout.includes('占用'));
  conflict.closeAllConnections(); await new Promise(resolve => conflict.close(resolve)); conflict = undefined;
  checks.push('端口冲突清楚提示，未启动重复进程');
  await appendFile(path.join(directory, 'app', 'dist', 'index.html'), '\n<!-- fixture corruption -->');
  await assert.rejects(launch(), error => error.code === 1 && error.stdout.includes('校验失败'));
  checks.push('文件损坏阻止启动并给出恢复提示');
  passed = true;
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  if (conflict) { conflict.closeAllConnections(); conflict.close(); }
  try { await launch(['-Stop', '-Force']); } catch { /* Retain failed fixtures for diagnosis. */ }
  if (passed) {
    const local = path.resolve(root, '.local') + path.sep;
    if (!path.resolve(testRoot).startsWith(local) || !path.basename(testRoot).startsWith('portable-smoke-')) throw new Error('拒绝清理工作区外路径。');
    await rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } else console.error(`保留测试目录供诊断 ${testRoot}`);
}
