export const SCORED_OVERTIME_ROUNDS = 3;

export const LEGACY_SCORE_DIMENSIONS = [
  { key: 'rigor', label: '表达与论证严密度', max: 25 },
  { key: 'coherence', label: '逻辑自洽性', max: 25 },
  { key: 'rebuttal', label: '回应与攻防表现', max: 25 },
  { key: 'evidence', label: '实例与论据运用', max: 15 },
  { key: 'expression', label: '表达与整体表现', max: 10 },
] as const;

export const SCORE_DIMENSIONS = [
  { key: 'judgeResponse', label: '正面回应裁判问题', max: 30 },
  { key: 'rigor', label: '表达与论证严密度', max: 20 },
  { key: 'coherence', label: '逻辑自洽性', max: 20 },
  { key: 'rebuttal', label: '回应与攻防表现', max: 15 },
  { key: 'evidence', label: '实例与论据运用', max: 10 },
  { key: 'expression', label: '表达与整体表现', max: 5 },
] as const;

export type SideScore = Record<typeof LEGACY_SCORE_DIMENSIONS[number]['key'], number> & { judgeResponse?: number };
export interface Scorecard { pro: SideScore; con: SideScore; tiebreak?: string }

export function scoreDimensions(scores: Scorecard) {
  return scores.pro.judgeResponse !== undefined ? SCORE_DIMENSIONS : LEGACY_SCORE_DIMENSIONS;
}

export function scoreTotal(score: SideScore) {
  const dimensions = score.judgeResponse !== undefined ? SCORE_DIMENSIONS : LEGACY_SCORE_DIMENSIONS;
  return dimensions.reduce((sum, d) => sum + (score[d.key] ?? 0), 0);
}

export function readScorecard(value: unknown): Scorecard | undefined {
  if (!value || typeof value !== 'object') return;
  const input = value as Record<string, unknown>;
  const hasResponse = ['pro', 'con'].some(side => {
    const row = input[side];
    return row && typeof row === 'object' && 'judgeResponse' in row;
  });
  const dimensions = hasResponse ? SCORE_DIMENSIONS : LEGACY_SCORE_DIMENSIONS;
  const result = {} as Scorecard;
  for (const side of ['pro', 'con'] as const) {
    const scores = input[side];
    if (!scores || typeof scores !== 'object') return;
    const row = {} as SideScore;
    for (const d of dimensions) {
      const n = (scores as Record<string, unknown>)[d.key];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > d.max) return;
      row[d.key] = n;
    }
    result[side] = row;
  }
  if (typeof input.tiebreak === 'string' && input.tiebreak.trim()) result.tiebreak = input.tiebreak.trim().slice(0, 1000);
  return result;
}

/** Totals decide first, then published tie-break dimensions; never prefer a side by order. */
export function scoreWinner(scores: Scorecard, declared?: string): 'pro' | 'con' | undefined {
  let delta = scoreTotal(scores.pro) - scoreTotal(scores.con);
  for (const key of ['judgeResponse', 'coherence', 'rebuttal', 'rigor', 'evidence', 'expression'] as const) {
    if (delta) break;
    delta = (scores.pro[key] ?? 0) - (scores.con[key] ?? 0);
  }
  if (delta) return delta > 0 ? 'pro' : 'con';
  return scores.tiebreak && (declared === 'pro' || declared === 'con') ? declared : undefined;
}
