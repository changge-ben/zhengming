import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, copyFile, cp, mkdtemp, access, rename } from 'node:fs/promises';
import path from 'node:path';
import { buildServer } from './build-server.mjs';

const execute = promisify(execFile);
if (process.platform !== 'win32') throw new Error('Windows 便携包请在 Windows 中构建。');
const root = process.cwd();
const info = JSON.parse(await readFile('package.json', 'utf8'));
const nodeVersion = '24.22.2';
const archiveName = `node-v${nodeVersion}-win-x64.zip`;
const cache = path.join(root, '.local', 'runtime-cache', nodeVersion);
const name = `zhengming-${info.version}-windows-x64`;
const releaseDirectory = path.join(root, '.local', 'releases');
const destination = path.join(releaseDirectory, name);
const zip = `${destination}.zip`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(cache, { recursive: true });
await mkdir(releaseDirectory, { recursive: true });
// Refuse to merge a new build with an older package containing unexpected files.
for (const existing of [destination, zip]) {
  try { await access(existing); throw new Error(`输出已存在，请使用新版本号或先重命名旧产物 ${existing}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const stage = await mkdtemp(path.join(releaseDirectory, '.build-'));
const output = path.join(stage, name);
const stagedZip = path.join(stage, name + '.zip');
await mkdir(output);

async function download(url, destination) {
  await execute('curl.exe', ['--fail', '--location', '--silent', '--show-error', '--connect-timeout', '15', '--max-time', '240', '--output', destination, url], { windowsHide: true, timeout: 250000 });
}
async function expand(source, destination) {
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:ZM_ARCHIVE -DestinationPath $env:ZM_EXPAND -Force'], { env: { ...process.env, ZM_ARCHIVE: source, ZM_EXPAND: destination }, windowsHide: true });
}
const sumFile = path.join(cache, 'SHASUMS256.txt');
await download(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`, sumFile);
const sumLine = (await readFile(sumFile, 'utf8')).split('\n').find(line => line.trim().endsWith(`  ${archiveName}`));
if (!sumLine) throw new Error('Node.js 官方校验表缺少所需运行时。');
const expected = sumLine.trim().split(/\s+/)[0];
const runtimeZip = path.join(cache, archiveName);
let cached = false;
try { cached = hash(await readFile(runtimeZip)) === expected; } catch { /* first download */ }
if (!cached) await download(`https://nodejs.org/dist/v${nodeVersion}/${archiveName}`, runtimeZip);
if (hash(await readFile(runtimeZip)) !== expected) throw new Error('Node.js 官方运行时校验失败，已停止打包。');
await expand(runtimeZip, path.join(cache, 'extracted'));

await mkdir(path.join(output, 'runtime'));
await copyFile(path.join(cache, 'extracted', `node-v${nodeVersion}-win-x64`, 'node.exe'), path.join(output, 'runtime', 'node.exe'));
await copyFile(path.join(cache, 'extracted', `node-v${nodeVersion}-win-x64`, 'LICENSE'), path.join(output, 'runtime', 'NODE-LICENSE.txt'));
await buildServer(path.join(output, 'app', 'server.mjs'));
await cp(path.join(root, 'dist'), path.join(output, 'app', 'dist'), { recursive: true, dereference: false });
const launcher = (await readFile('scripts/portable/portable-launcher.ps1', 'utf8')).replace(/^\uFEFF/, '');
await writeFile(path.join(output, 'portable-launcher.ps1'), '\uFEFF' + launcher);
for (const [file, option] of [['启动争鸣.cmd', ''], ['停止争鸣.cmd', '-Stop'], ['环境诊断.cmd', '-Diagnose']]) {
  await writeFile(path.join(output, file), `@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-launcher.ps1" ${option}\r\nif errorlevel 1 pause\r\n`);
}
await copyFile('scripts/portable/使用说明.txt', path.join(output, '使用说明.txt'));

// Preserve dependency copyright notices, including packages in the browser bundle.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = ['争鸣 · AI 辩论场 — Third-party notices', 'Node.js notices are in runtime/NODE-LICENSE.txt.', ''];
for (const key of Object.keys(lock.packages).filter(key => key.startsWith('node_modules/'))) {
  let metadata;
  try { metadata = JSON.parse(await readFile(path.join(root, key, 'package.json'), 'utf8')); } catch { continue; }
  const entries = await readdir(path.join(root, key));
  const licenses = entries.filter(file => /^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i.test(file));
  for (const license of licenses) {
    try { notices.push(`\n--- ${metadata.name}@${metadata.version} / ${license} ---\n`, await readFile(path.join(root, key, license), 'utf8')); } catch { /* Some distributions use a directory for licenses. */ }
  }
}
await writeFile(path.join(output, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));

async function entries(directory, prefix = '') {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('发布目录不允许符号链接。');
    const relative = prefix + item.name;
    if (item.isDirectory()) files.push(...await entries(path.join(directory, item.name), relative + '/'));
    else files.push(relative);
  }
  return files;
}
const files = {};
for (const relative of await entries(output)) files[relative] = hash(await readFile(path.join(output, relative)));
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ name: '争鸣 · AI 辩论场', version: info.version, nodeVersion, nodeArchiveSha256: expected, platform: 'windows-x64', files }, null, 2));
await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -LiteralPath $env:ZM_PACKAGE -DestinationPath $env:ZM_ZIP -CompressionLevel Optimal'], { env: { ...process.env, ZM_PACKAGE: output, ZM_ZIP: stagedZip }, windowsHide: true, timeout: 180000 });
await rename(output, destination);
await rename(stagedZip, zip);
await writeFile(`${zip}.sha256`, `${hash(await readFile(zip))}  ${path.basename(zip)}\n`);
await writeFile(path.join(releaseDirectory, 'latest.json'), JSON.stringify({ directory: destination, zip, version: info.version }, null, 2));
console.log(JSON.stringify({ directory: destination, zip, version: info.version }));
