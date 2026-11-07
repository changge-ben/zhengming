import {
  turnOrder,
  type DebateConfig,
  type Speaker,
  type Utterance,
} from './types.ts';

export interface DebateBrief {
  kind: 'value' | 'policy' | 'fact';
  definitions: string;
  scope: string;
  criterion: string;
  proBurden: string;
  conBurden: string;
}

export interface EvidenceCard {
  id: string;
  title: string;
  kind: 'source' | 'example' | 'hypothesis';
  content: string;
  source: string;
}

export const EMPTY_BRIEF: DebateBrief = {
  kind: 'value',
  definitions: '',
  scope: '',
  criterion: '',
  proBurden: '',
  conBurden: '',
};
export const MOTION_LABEL = {
  value: '价值判断',
  policy: '政策主张',
  fact: '事实判断',
};
export const EVIDENCE_LABEL = {
  source: '来源材料 · 待核实',
  example: '生活实例',
  hypothesis: '假设情境',
};
export const STAGE_LABEL = {
  free: '自由攻防',
  opening: '独立立论',
  question: '定向质询',
  answer: '质询回应',
  rebuttal: '争点攻防',
  closing: '总结陈词',
  overtime: '加时交锋',
};
export type DebateStage = keyof typeof STAGE_LABEL;

export function regulationRounds(config: DebateConfig): number {
  return config.protocol === 'structured'
    ? Math.max(4, config.maxRounds || 4)
    : config.maxRounds || 3;
}

export function stageForRound(
  config: DebateConfig,
  round: number,
  overtime = false
): DebateStage {
  if (overtime) return 'overtime';
  if (config.protocol !== 'structured') return 'free';
  if (round === 1) return 'opening';
  if (round === 2) return 'question';
  if (round >= regulationRounds(config)) return 'closing';
  return 'rebuttal';
}

export interface PlannedTurn {
  speaker: Speaker;
  stage: DebateStage;
}

/** Both teams receive the same number of questions, answers and speeches. */
export function planRound(
  config: DebateConfig,
  round: number,
  overtime = false
): PlannedTurn[] {
  const stage = stageForRound(config, round, overtime);
  const order = turnOrder(config);
  if (config.protocol !== 'structured')
    return order.map((speaker) => ({ speaker, stage }));
  const sides =
    round % 2 ? (['pro', 'con'] as const) : (['con', 'pro'] as const);
  return Array.from({ length: config.teamSize }, (_, member) => {
    const [first, second] = sides.map((side) => config.teams[side][member]);
    if (stage === 'question')
      return [
        { speaker: first, stage: 'question' as const },
        { speaker: second, stage: 'answer' as const },
        { speaker: second, stage: 'question' as const },
        { speaker: first, stage: 'answer' as const },
      ];
    return [
      { speaker: first, stage },
      { speaker: second, stage },
    ];
  }).flat();
}

export function messageRef(index: number): string {
  return `M${index + 1}`;
}

export function citedRefs(text: string, prefix: 'M' | 'E'): string[] {
  return [
    ...new Set(
      Array.from(
        text.matchAll(new RegExp(`\\[(${prefix}[1-9]\\d*)\\]`, 'g')),
        (match) => match[1]
      )
    ),
  ];
}

/** References track explicit links only. They do not establish truth or a successful rebuttal. */
export function debateAudit(
  messages: Utterance[],
  evidence: EvidenceCard[] = []
) {
  const links: { from: number; to: number }[] = [];
  const invalid: { from: number; ref: string }[] = [];
  const evidenceUse = new Map(
    evidence.map((card) => [card.id, [] as number[]])
  );
  messages.forEach((message, from) => {
    for (const ref of citedRefs(message.text, 'M')) {
      const to = Number(ref.slice(1)) - 1;
      if (to < from && to >= 0) links.push({ from, to });
      else invalid.push({ from, ref });
    }
    for (const ref of citedRefs(message.text, 'E')) {
      const uses = evidenceUse.get(ref);
      if (uses) uses.push(from);
      else invalid.push({ from, ref });
    }
  });
  const questions = messages.flatMap((message, index) => {
    if (message.stage !== 'question') return [];
    const answerIndex = messages.findIndex(
      (m) => m.stage === 'answer' && m.replyTo === message.id
    );
    const answer = messages[answerIndex];
    return [
      {
        index,
        answerIndex,
        complete: Boolean(answer?.text && answer.finishReason === 'stop'),
      },
    ];
  });
  return { links, invalid, evidenceUse, questions };
}
