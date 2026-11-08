import { Languages } from 'lucide-react';
import { setLocale, t, useLocale } from './i18n';

export default function LanguageSwitch() {
  const locale = useLocale();
  return <button type="button" className="language-switch" onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
    aria-label={locale === 'en' ? 'Switch interface to Chinese' : 'Switch interface to English'}
    title={locale === 'en' ? '切换为中文' : 'Switch to English'}>
    <Languages size={16} aria-hidden="true" />
    <span>{locale === 'en' ? '中文' : 'EN'}</span>
    <span className="sr-only">{t('界面语言')}</span>
  </button>;
}
