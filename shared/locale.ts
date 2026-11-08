export type Locale = 'zh-CN' | 'en';

export function normalizeLocale(value: unknown): Locale {
  return typeof value === 'string' && /^en(?:-|$)/i.test(value) ? 'en' : 'zh-CN';
}
