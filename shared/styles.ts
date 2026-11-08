import { translateMessage } from './messages.ts';
import type { Locale } from './locale.ts';

export const EXPRESSION_STYLES = [
  { id: 'natural', label: '生活化', description: '用日常语言和具体生活场景，把道理讲明白。', prompt: '用日常词汇、具体生活场景接话，像当面交流，避免论文腔。' },
  { id: 'sharp', label: '言辞犀利', description: '精准指出漏洞，敢追问、敢反击，针对论点。', prompt: '精准揭示前后矛盾、偷换和未答问题，反问有力，针对论点而非人身。' },
  { id: 'humorous', label: '幽默风趣', description: '适度接梗、打趣，用贴切的比喻增加趣味。', prompt: '允许适度接梗、俏皮类比与机智反问，不硬塞笑话，不让段子挤掉论证。' },
  { id: 'literary', label: '有文采', description: '恰当运用典故、诗句和鲜活意象，言之有物。', prompt: '可用准确的典故、诗句、寓言与鲜活意象，讲清与争点的关联，避免堆辞藻和捏造出处。' },
  { id: 'rigorous', label: '严谨清楚', description: '厘清前提、因果和适用边界，也能说得有趣。', prompt: '讲清前提、因果与适用范围，区分事实和假设；严谨可以和幽默、文采同时存在。' },
  { id: 'concise', label: '简洁有力', description: '少铺垫、短句直击要点，留出实例和结论。', prompt: '少铺垫、少重复，用短句集中推进关键争点，为实例、回应和完整结论留出篇幅。' },
] as const;

export type ExpressionStyle = typeof EXPRESSION_STYLES[number]['id'];

export function effectiveStyles(config: { language: 'natural' | 'witty' | 'rigorous'; styles?: ExpressionStyle[] }): ExpressionStyle[] {
  const selected = Array.isArray(config.styles) ? config.styles.filter(id => EXPRESSION_STYLES.some(s => s.id === id)) : undefined;
  if (selected?.length) return [...new Set(selected)];
  return config.language === 'witty' ? ['natural', 'sharp', 'humorous'] : config.language === 'rigorous' ? ['rigorous'] : ['natural'];
}

export function styleLabels(config: Parameters<typeof effectiveStyles>[0], locale: Locale = 'zh-CN') {
  return effectiveStyles(config).map(id => translateMessage(locale, EXPRESSION_STYLES.find(s => s.id === id)!.label)).join(' · ');
}
