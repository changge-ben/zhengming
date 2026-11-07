export function isLocalBaseUrl(value: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(value).hostname
    );
  } catch {
    return false;
  }
}

/** Accept a pasted endpoint while retaining the supplier's own path prefix. */
export function normalizeBaseUrl(
  value: string,
  protocol: 'openai' | 'anthropic'
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请填写完整的接口地址，例如 https://api.example.com/v1。');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      '接口地址需要使用 HTTP 或 HTTPS，密钥请填在 API Key 一栏。'
    );
  if (url.search || url.hash)
    throw new Error('Base URL 只填写接口地址，去掉问号后的参数和 # 后的内容。');
  let pathname = url.pathname.replace(/\/+$/, '');
  if (
    (protocol === 'openai' && /\/messages$/.test(pathname)) ||
    (protocol === 'anthropic' && /\/chat\/completions$/.test(pathname))
  )
    throw new Error('地址与接口协议不匹配，请在高级接口设置中确认协议。');
  pathname = pathname.replace(
    protocol === 'openai'
      ? /\/(?:chat\/completions|models)$/
      : /\/(?:messages|models)$/,
    ''
  );
  return `${url.origin}${pathname}`;
}
