import { execFile } from 'node:child_process';
import path from 'node:path';

export const canRememberKeys = process.platform === 'win32';

// DPAPI binds ciphertext to the current Windows account. Secrets travel over
// stdin, never command-line arguments, logs, browser storage or plaintext files.
const script = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $entropy = [Text.Encoding]::UTF8.GetBytes('zhengming-provider-key-v1')
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($request.mode -eq 'protect') {
    $bytes = [Text.Encoding]::UTF8.GetBytes($request.value)
    [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)))
  } else {
    $bytes = [Convert]::FromBase64String($request.value)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)))
  }
} catch { [Console]::Error.Write('Key protection failed'); exit 1 }
`;

export class KeyStorageError extends Error {
  constructor() { super('Windows 密钥加密未能完成，本次未保存。请重试，或取消“记住 API Key”后仅在本次使用。'); }
}

function transform(value: string, mode: 'protect' | 'unprotect'): Promise<string> {
  if (!canRememberKeys) return Promise.reject(new KeyStorageError());
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = execFile(executable, ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024, encoding: 'utf8',
    }, (error, stdout) => {
      if (error || !stdout) reject(new KeyStorageError());
      else resolve(stdout);
    });
    child.stdin?.on('error', () => { /* execFile reports subprocess failures above. */ });
    child.stdin?.end(JSON.stringify({ value, mode }));
  });
}

export const protectKey = (key: string) => transform(key, 'protect');
export const restoreKey = (ciphertext: string) => transform(ciphertext, 'unprotect');
