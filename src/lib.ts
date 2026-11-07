import type { DebateConfig, Match, Provider, Speaker } from '../shared/types';
import { FORMAT_LABEL, SIDE_LABEL, speakerName, normalizeJudgeTitle, type Utterance } from '../shared/types';
import { scoreEntry, type ScoreEntry } from '../shared/statistics';
import { effectiveStyles, styleLabels } from '../shared/styles';
import { scoreDimensions, readScorecard, scoreTotal } from '../shared/adjudication';
import { briefSchema, evidenceSchema } from '../shared/caseSchema';
import { EMPTY_BRIEF, EVIDENCE_LABEL, MOTION_LABEL, STAGE_LABEL, messageRef, regulationRounds } from '../shared/protocol';
import { isLocalBaseUrl } from '../shared/providerConfig';

export const TOPICS = [
  'AI 的发展，最终会让人类更自由吗？',
  '如果可以永远年轻，你会选择永生吗？',
  '比起读万卷书，行万里路更重要吗？',
  '一周工作四天，社会会变得更好吗？',
  '在亲密关系里，坦诚比善意的谎言更重要吗？',
  '人类应该把重大决策交给人工智能吗？',
  '如果结局相同，过程还有意义吗？',
  '一个没有推荐算法的互联网，会更好吗？',
];

function team(side: 'pro' | 'con'): Speaker[] {
  return Array.from({ length: 3 }, (_, member) => ({ side, member, providerId: 'demo', modelId: side === 'pro' ? '演示模型 A' : '演示模型 B', name: speakerName(side, member) }));
}
export const DEFAULT_CONFIG: DebateConfig = {
  protocol: 'arena', brief: { ...EMPTY_BRIEF }, evidence: [],
  pace: 'length', thinkingSeconds: 180, speechChars: 400, topic: TOPICS[0], teamSize: 1, roundSeconds: 120, matchSeconds: 300, prepSeconds: 30, maxRounds: 3,
  format: 'classic', language: 'natural', styles: ['natural', 'sharp', 'humorous', 'literary'], demo: true, teams: { pro: team('pro'), con: team('con') },
  judge: { enabled: false, providerId: 'demo', modelId: '裁判', appeals: true, timing: 'final' },
};

export function loadConfig(): DebateConfig {
  try {
    const saved = JSON.parse(localStorage.getItem('zhengming-config') || 'null');
    if (saved && typeof saved.topic === 'string' && [1, 2, 3].includes(saved.teamSize) &&
      [60, 120, 180, 300].includes(saved.roundSeconds) && [0, 1, 2, 3, 4, 5, 6, 10, 20, 30].includes(saved.maxRounds) &&
      ['classic', 'crossfire', 'socratic'].includes(saved.format) && typeof saved.demo === 'boolean' &&
      ['pro', 'con'].every(side => Array.isArray(saved.teams?.[side]) && saved.teams[side].length === 3 && saved.teams[side].every((s: Speaker) => typeof s.modelId === 'string' && typeof s.providerId === 'string'))) {
      const judge = saved.judge && typeof saved.judge.enabled === 'boolean' && typeof saved.judge.providerId === 'string' && typeof saved.judge.modelId === 'string' && typeof saved.judge.appeals === 'boolean' ? { ...saved.judge, timing: saved.judge.timing === 'coach' ? 'coach' : 'final' } : { ...DEFAULT_CONFIG.judge };
      if (judge.providerId === 'demo') judge.modelId = '裁判';
      const matchSeconds = [60, 180, 300, 600, 900, 1800].includes(saved.matchSeconds) ? saved.matchSeconds : 300;
      const protocol = saved.protocol === 'structured' ? 'structured' : 'arena';
      const brief = briefSchema.safeParse(saved.brief);
      const evidence = evidenceSchema.safeParse(saved.evidence);
      return { ...saved, protocol, brief: brief.success ? brief.data : { ...EMPTY_BRIEF }, evidence: evidence.success ? evidence.data : [], styles: effectiveStyles(saved), pace: protocol === 'structured' ? 'length' : saved.pace === 'timed' ? 'timed' : 'length', thinkingSeconds: [60,120,180,300,600].includes(saved.thinkingSeconds) ? saved.thinkingSeconds : 180, speechChars: [200,400,600,1000].includes(saved.speechChars) ? saved.speechChars : 400, judge, matchSeconds, prepSeconds: [0, 30, 60, 120, 180].includes(saved.prepSeconds) ? saved.prepSeconds : 30, language: ['natural', 'witty', 'rigorous'].includes(saved.language) ? saved.language : 'natural', maxRounds: protocol === 'structured' ? regulationRounds(saved) : saved.pace === 'timed' ? saved.maxRounds : saved.maxRounds || 3, teams: {
        pro: saved.teams.pro.map((s: Speaker, member: number) => ({ ...s, side: 'pro', member, name: speakerName('pro', member), modelId: saved.demo ? '演示模型 A' : s.modelId })),
        con: saved.teams.con.map((s: Speaker, member: number) => ({ ...s, side: 'con', member, name: speakerName('con', member), modelId: saved.demo ? '演示模型 B' : s.modelId })),
      } };
    }
  } catch { /* invalid storage: use defaults */ }
  return structuredClone(DEFAULT_CONFIG);
}

export function loadMatches(): Match[] {
  try {
    const data = JSON.parse(localStorage.getItem('zhengming-history') || '[]');
    if (Array.isArray(data)) return data.filter(m => m && typeof m.id === 'string' && typeof m.config?.topic === 'string' && Array.isArray(m.messages) && [1, 2, 3].includes(m.config.teamSize) && ['pro', 'con'].every(side => Array.isArray(m.config.teams?.[side]) && m.config.teams[side].length >= m.config.teamSize && m.config.teams[side].every((speaker: Speaker) => speaker && typeof speaker.modelId === 'string' && typeof speaker.providerId === 'string')) && Number.isFinite(m.createdAt) && m.result && ['concession', 'forfeit', 'limit', 'judge', 'stopped', 'error'].includes(m.result.reason)).slice(0, 20).map(m => {
      const judge = m.config.judge ? { ...m.config.judge, timing: m.config.judge.timing || 'coach' } : { ...DEFAULT_CONFIG.judge };
      if (judge.providerId === 'demo') judge.modelId = '裁判';
      const messages = m.messages.map((message: Utterance, index: number): Utterance => {
        if (!message || typeof message.id !== 'string' || typeof message.text !== 'string' || !['pro', 'con', 'judge', 'audience'].includes(message.side) || !Number.isFinite(message.round) || !Number.isFinite(message.member)) {
          // Preserve the position so later [M#] citations still identify the same turn.
          return { id: typeof message?.id === 'string' ? message.id : `damaged-${index}`, side: 'audience', member: 0, name: '档案恢复', model: '', round: 0, text: '（这条历史发言已损坏，原编号保留，无法恢复正文。）', timestamp: 0, finishReason: 'error' };
        }
        return message.side === 'judge' ? { ...message, name: '裁判', model: m.config.demo ? '裁判' : message.model } : message;
      });
      return {
        ...m,
        messages,
        result: { ...m.result, detail: normalizeJudgeTitle(typeof m.result.detail === 'string' ? m.result.detail : '历史比赛记录') },
        preparation: Array.isArray(m.preparation) ? m.preparation.filter((message: Utterance) => message && typeof message.text === 'string') : [],
        config: { ...m.config, prepSeconds: m.config.prepSeconds || 0, language: m.config.language || 'natural', matchSeconds: m.config.matchSeconds || 300, judge },
      };
    });
  } catch { /* localStorage unavailable */ }
  return [];
}

export function loadScorebook(): ScoreEntry[] {
  try {
    const stored = localStorage.getItem('zhengming-scorebook');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.filter(e => e && typeof e.id === 'string' && Array.isArray(e.teams?.pro) && Array.isArray(e.teams?.con) && e.result);
    }
  } catch { /* use existing browser archive as a seed */ }
  return loadMatches().map(scoreEntry);
}

export function clockTime(seconds: number) {
  return `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const timeout = AbortSignal.timeout(20000);
  try {
    response = await fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    const data = await response.json().catch(() => { throw new Error('本地服务返回了无效响应，请重新连接后重试。'); });
    if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
    return data as T;
  } catch (error) {
    if (timeout.aborted) throw new Error('本次请求等待超过 20 秒，请检查本地服务后重试。');
    if (error instanceof TypeError) throw new Error('无法连接本地服务。请双击「启动争鸣.cmd」，然后点击重新连接。');
    throw error;
  }
}

export function modelOptions(providers: Provider[]) {
  return providers.flatMap(p => p.models.map(modelId => ({ providerId: p.id, modelId, label: `${p.name} · ${modelId}`, available: p.hasKey || isLocalBaseUrl(p.baseUrl) })));
}

export function scoreMarkdown(value: unknown): string[] {
  const scores = readScorecard(value);
  if (!scores) return [];
  return ['### 整场表现评分（满分100）', '', '| 维度 | 正方 | 反方 |', '| --- | ---: | ---: |', ...scoreDimensions(scores).map(d => `| ${d.label} / ${d.max} | ${scores.pro[d.key]} | ${scores.con[d.key]} |`), `| 总分 | ${scoreTotal(scores.pro)} | ${scoreTotal(scores.con)} |`, '', ...(scores.tiebreak ? [`同分决胜依据：${scores.tiebreak}`, ''] : [])];
}

export function exportMatch(match: Match) {
  const { config } = match;
  const content = [
    `# 争鸣 · AI 辩论场\n\n## ${config.topic}`, '',
    `- 时间：${new Date(match.createdAt).toLocaleString('zh-CN')}`,
    `- 模式：${config.teamSize}v${config.teamSize} · ${FORMAT_LABEL[config.format]}`,
    `- 发言预算：${config.pace === 'timed' ? `传统计时，每轮 ${config.roundSeconds} 秒，常规 ${config.matchSeconds} 秒` : `正文每次最多 ${config.speechChars || 400} 字，单次最长等待 ${config.thinkingSeconds || 180} 秒，常规 ${config.maxRounds || 3} 轮`}`,
    `- 赛制：${config.judge.timing === 'coach' ? '裁判指导赛（每轮点评）' : '极限攻防（常规结束后裁决）'}；${(config.rulesVersion || 0) >= 2 && config.judge.enabled ? '未决加时，完整三轮后按整场表现评分决胜' : '未分胜负持续加时'}，可手动结束。`,
    `- 语言风格：${styleLabels(config)}`,
    `- 来源：${config.demo ? '演示模式（预设脚本，非真实模型输出）' : '真实模型 API'}`,
    `- 比赛规程：${config.protocol === 'structured' ? '分阶段正式赛 · 独立立论 / 双向质询 / 争点攻防 / 总结陈词' : '自由攻防'}`,
    `- 裁判：${config.judge.enabled ? `裁判（${config.judge.modelId}） · ${config.judge.appeals ? '允许一次申诉' : '不接受申诉'}` : '无裁判'}`,
    `- 结果：${match.result.detail}`, '',
    '## 赛题约定与公共资料', '',
    ...(config.brief ? [`- 命题类型：${MOTION_LABEL[config.brief.kind]}`, ...(['definitions', 'scope', 'criterion', 'proBurden', 'conBurden'] as const).map((key, i) => `- ${['概念定义', '讨论范围', '比较标准', '正方举证', '反方举证'][i]}：${config.brief![key] || '未预设，由双方公开论证'}`)] : ['未预设赛题约定。']), '',
    ...(config.evidence || []).flatMap(card => [`### [${card.id}] ${card.title}`, `${EVIDENCE_LABEL[card.kind]} · ${card.source || '未填写出处'}`, '', card.content, '']),
    '---', '',
    ...(match.preparation?.length ? ['# 赛前更衣室（双方模型各自只能读取本队内容）', '', ...match.preparation.flatMap(m => [`## 第 ${m.round} 次商议 · ${m.name}（${m.model}）`, '', m.text, '']), '---', '', '# 正式比赛', ''] : []),
    ...match.messages.flatMap((m, index) => [`## [${messageRef(index)}] 第 ${m.round} 轮 · ${m.name}${m.side === 'audience' ? '' : `（${m.model}）`}${m.stage ? ` · ${STAGE_LABEL[m.stage]}` : ''}`, ...(m.replyTo && match.messages.some(target => target.id === m.replyTo) ? [`> 指定回应 [${messageRef(match.messages.findIndex(target => target.id === m.replyTo))}]`] : []), '', m.text, '', ...scoreMarkdown(m.scores), ...(m.forfeited ? ['> 本方明确弃守立场，按规则判负。', ''] : []), ...(m.timeLimit !== undefined ? [`> 本次最长等待：${m.timeLimit} 秒；正文上限 ${m.charLimit || config.speechChars || 400} 字。`, ''] : []), ...(m.finishReason === 'timeout' ? ['> 本次发言因等待超时结束。', ''] : []), ...(m.warning ? [`> ${m.warning}`, ''] : [])]),
  ].join('\n');
  const blob = new Blob([normalizeJudgeTitle(content)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `争鸣-${config.topic.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 35)}-${new Date(match.createdAt).toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
