import { useSyncExternalStore } from 'react';
import { normalizeLocale, type Locale } from '../shared/locale';
import { translateMessage, formatMessage } from '../shared/messages';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('zhengming-locale');
    if (saved === 'en' || saved === 'zh-CN') return saved;
  } catch { /* Language selection also works when storage is unavailable. */ }
  return normalizeLocale(typeof window === 'undefined' ? 'zh-CN' : navigator.language);
}

let locale = initialLocale();
const listeners = new Set<() => void>();
export function getLocale(): Locale { return locale; }
export function setLocale(next: Locale) {
  if (locale === next) return;
  locale = next;
  try { localStorage.setItem('zhengming-locale', next); } catch { /* Keep the in-memory preference. */ }
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => 'zh-CN');
}

export function t(message: string): string;
export function t(parts: TemplateStringsArray, ...values: unknown[]): string;
export function t(message: string | TemplateStringsArray, ...values: unknown[]): string {
  if (typeof message === 'string') return translateMessage(locale, message);
  const source = message.reduce((text, part, index) => text + (index ? `{${index - 1}}` : '') + part, '');
  return formatMessage(locale, source, values);
}

export function dateLocale(): string { return locale === 'en' ? 'en-US' : 'zh-CN'; }
