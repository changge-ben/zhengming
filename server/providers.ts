import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Provider } from '../shared/types.ts';
import { canRememberKeys, protectKey, restoreKey } from './keyStorage.ts';
import { normalizeBaseUrl, isLocalBaseUrl } from '../shared/providerConfig.ts';

export interface PrivateProvider extends Omit<Provider, 'hasKey' | 'hasSavedKey' | 'canRememberKey'> { apiKey: string; protectedKey?: string }
const metadataPath = path.resolve('.local/providers.json');

const defaults: PrivateProvider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', protocol: 'openai', tokenParameter: 'max_tokens', models: ['deepseek-chat', 'deepseek-reasoner'], apiKey: process.env.DEEPSEEK_API_KEY || '' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai', tokenParameter: 'max_completion_tokens', models: [], apiKey: process.env.OPENAI_API_KEY || '' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: [], apiKey: process.env.QWEN_API_KEY || '' },
  { id: 'anthropic', name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', protocol: 'anthropic', tokenParameter: 'max_tokens', models: [], apiKey: process.env.ANTHROPIC_API_KEY || '' },
  { id: 'custom', name: '自定义 / 本地模型', baseUrl: 'http://localhost:11434/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: [], apiKey: process.env.CUSTOM_API_KEY || '' },
];

const registry = new Map(defaults.map(p => [p.id, { ...p }]));

export async function loadProviders() {
  try {
    const saved = JSON.parse(await readFile(metadataPath, 'utf8')) as Omit<PrivateProvider, 'apiKey'>[];
    if (!Array.isArray(saved)) return;
    for (const p of saved) {
      const previous = registry.get(p.id) || (typeof p.id === 'string' && /^custom-[a-z0-9-]{1,80}$/.test(p.id) ? { ...defaults[4], id: p.id, apiKey: '' } : undefined);
      if (previous && typeof p.baseUrl === 'string' && Array.isArray(p.models)) {
        let apiKey = previous.apiKey;
        const protectedKey = typeof p.protectedKey === 'string' ? p.protectedKey : undefined;
        if (protectedKey) {
          try { apiKey = await restoreKey(protectedKey); }
          catch { console.warn('已保存的密钥无法解密，请使用原 Windows 账户启动，或在模型接入中重新填写。'); }
        }
        registry.set(p.id, { ...previous, ...p, protectedKey, apiKey });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('模型元数据未加载，将使用默认设置。');
  }
}

export function getProvider(id: string) { return registry.get(id); }
export function listProviders(): Provider[] {
  return [...registry.values()].map(({ apiKey, protectedKey, ...p }) => ({ ...p, hasKey: Boolean(apiKey), hasSavedKey: Boolean(protectedKey), canRememberKey: canRememberKeys }));
}

type ProviderPatch = Omit<PrivateProvider, 'id' | 'apiKey' | 'protectedKey'> & { apiKey?: string; clearKey?: boolean; rememberKey?: boolean };
let writeTail: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeTail.then(operation);
  writeTail = result.catch(() => undefined);
  return result;
}
async function persist(all: PrivateProvider[]) {
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath + '.tmp', JSON.stringify(all.map(({ apiKey: _key, ...p }) => p), null, 2));
  await rename(metadataPath + '.tmp', metadataPath);
}

export async function createProvider(patch: ProviderPatch) {
  return serialize(async () => {
    const { apiKey, clearKey, rememberKey, ...metadata } = patch;
    const secret = clearKey ? '' : apiKey?.trim() || '';
    const provider: PrivateProvider = { ...metadata, baseUrl: normalizeBaseUrl(metadata.baseUrl, metadata.protocol), id: `custom-${randomUUID()}`, apiKey: secret, ...(rememberKey && secret ? { protectedKey: await protectKey(secret) } : {}) };
    await persist([...registry.values(), provider]);
    registry.set(provider.id, provider);
    return provider.id;
  });
}

export async function updateProvider(id: string, patch: ProviderPatch) {
  return serialize(async () => {
  const existing = registry.get(id);
  if (!existing) throw new Error('服务商不存在');
  const { clearKey, apiKey, rememberKey, ...metadata } = patch;
  const candidate = { ...existing, ...metadata, baseUrl: normalizeBaseUrl(metadata.baseUrl, metadata.protocol), apiKey: clearKey ? '' : apiKey?.trim() || existing.apiKey };
  const remember = rememberKey ?? Boolean(existing.protectedKey);
  if (clearKey || !remember) delete candidate.protectedKey;
  else if (candidate.apiKey && (apiKey?.trim() || !candidate.protectedKey)) candidate.protectedKey = await protectKey(candidate.apiKey);
  // Only opted-in DPAPI ciphertext reaches disk; never a plaintext API key.
  const all = [...registry.values()].map(p => p.id === id ? candidate : p);
  await persist(all);
  registry.set(id, candidate);
  });
}

export function providerHeaders(provider: PrivateProvider): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.protocol === 'anthropic') {
    headers['x-api-key'] = provider.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  return headers;
}

export function isLocalProvider(p: PrivateProvider) {
  return isLocalBaseUrl(p.baseUrl);
}

export function redact(text: string): string {
  for (const p of registry.values()) if (p.apiKey) text = text.split(p.apiKey).join('[密钥已隐藏]');
  return text.replace(/(?:sk-|Bearer\s+)[A-Za-z0-9_.-]{12,}/g, '[密钥已隐藏]');
}
