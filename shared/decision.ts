import { readScorecard, scoreWinner, type Scorecard } from './adjudication.ts';
export interface Decision { text: string; verdict?: 'pro' | 'con' | 'draw' | 'continue'; appealed?: boolean; scores?: Scorecard }

/** Only for a completed appeal turn: an unambiguous opening acceptance of this ruling. */
export function acceptsRuling(text: string): boolean {
  const plain = text.trim().replace(/\*\*/g, '');
  const opening = /^(?:Astra\s*(?:大人|裁判)[，,：:]\s*)?(?:(?:我方|本方|我们|我)\s*)?(?:接受[。！!]|(?:接受|认可)(?:本次|本场|此次|这一|这个|该|原)?(?:判决|裁决|判词|结果|原判)(?:[。！!，,：:]|$))/i;
  if (!opening.test(plain)) return false;
  // Conflicting or conditional decisions must be confirmed by the model, never guessed.
  const rest = plain.replace(/(?:不再|不会|不|无需|放弃)(?:提出|申请|请求|进行|正式)?(?:申诉|上诉|复核)/g, '');
  return !/不(?:完全)?接受|无法接受|不能接受|拒绝接受|不认可|申诉|上诉|复核|异议|(?:如果|假如|除非|前提是|有条件)/.test(rest);
}

/** Read an explicit terminal decision, not mentions of a winner inside arguments. */
export function readDecision(raw: string): Decision {
  const envelope = raw.match(/<decision>\s*([\s\S]*?)\s*<\/decision>\s*$/i);
  const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = envelope?.[1] ?? fenced?.[1] ?? (raw.trim().startsWith('{') ? raw.trim() : undefined);
  if (candidate) {
    try {
      const value = JSON.parse(candidate);
      const text = envelope ? raw.slice(0, envelope.index).trim() : typeof value.reason === 'string' ? value.reason.trim() : '';
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const verdict = typeof value.verdict === 'string' ? value.verdict.toLowerCase() : undefined;
        if (value.scores !== undefined) {
          const scores = readScorecard(value.scores);
          if (!scores || value.appealed !== undefined) return { text };
          return { text, scores, verdict: scoreWinner(scores, verdict) };
        }
        if (['pro', 'con', 'draw', 'continue'].includes(verdict) && value.appealed === undefined) return { text, verdict } as Decision;
        if (typeof value.appealed === 'boolean' && value.verdict === undefined) return { text, appealed: value.appealed };
      }
    } catch { /* An incomplete or invalid object is never a valid decision. */ }
  }
  // Legacy providers sometimes put the final marker on the same line or in a fence.
  const verdict = raw.match(/\[\[VERDICT:(PRO|CON|DRAW|CONTINUE)\]\]\s*(?:```\s*)?$/i);
  const appeal = raw.match(/\[\[(APPEAL|ACCEPT)\]\]\s*(?:```\s*)?$/i);
  const marker = verdict || appeal;
  return {
    text: marker ? raw.slice(0, marker.index).replace(/\n?```(?:\w+)?\s*$/, '').trim() : raw.trim(),
    ...(verdict ? { verdict: verdict[1].toLowerCase() as Decision['verdict'] } : {}),
    ...(appeal ? { appealed: appeal[1].toUpperCase() === 'APPEAL' } : {}),
  };
}
