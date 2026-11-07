import { readDecision } from './decision.ts';
import type { Scorecard } from './adjudication.ts';
import type { ExpressionStyle } from './styles.ts';
export type Side = 'pro' | 'con';
export type Format = 'classic' | 'crossfire' | 'socratic';
export type MatchStatus = 'idle' | 'running' | 'pausing' | 'paused' | 'completed' | 'stopped' | 'error';

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  protocol: 'openai' | 'anthropic';
  tokenParameter: 'max_tokens' | 'max_completion_tokens' | 'none';
  models: string[];
  hasKey: boolean;
  hasSavedKey?: boolean;
  canRememberKey?: boolean;
}

export interface Speaker {
  side: Side;
  member: number;
  providerId: string;
  modelId: string;
  name: string;
}

export interface DebateConfig {
  rulesVersion?: number;
  pace?: 'length' | 'timed';
  thinkingSeconds?: number;
  speechChars?: number;
  topic: string;
  teamSize: number;
  roundSeconds: number;
  matchSeconds: number;
  prepSeconds: number;
  maxRounds: number;
  format: Format;
  language: 'natural' | 'witty' | 'rigorous';
  styles?: ExpressionStyle[];
  demo: boolean;
  judge: { enabled: boolean; providerId: string; modelId: string; appeals: boolean; timing: 'final' | 'coach' };
  teams: Record<Side, Speaker[]>;
}

export interface Utterance {
  id: string;
  side: Side | 'audience' | 'judge';
  member: number;
  name: string;
  model: string;
  round: number;
  text: string;
  timestamp: number;
  elapsed?: number;
  timeLimit?: number;
  charLimit?: number;
  warning?: string;
  finishReason?: string;
  conceded?: boolean;
  forfeited?: boolean;
  scores?: Scorecard;
  kind?: TurnKind;
  verdict?: Verdict;
  appealed?: boolean;
  appealAttempt?: 1 | 2;
}

export interface MatchResult {
  reason: 'concession' | 'forfeit' | 'limit' | 'judge' | 'stopped' | 'error';
  winner: Side | null;
  detail: string;
}

export interface Match {
  id: string;
  config: DebateConfig;
  messages: Utterance[];
  preparation: Utterance[];
  createdAt: number;
  result: MatchResult;
  rounds: number;
}

export interface TurnRequest {
  config: DebateConfig;
  speaker: Actor;
  round: number;
  timeLimit: number;
  history: Utterance[];
  preparation?: Utterance[];
  kind?: TurnKind;
  isFinal?: boolean;
  priorVerdict?: Verdict;
  overtimeRound?: number;
  forceScoring?: boolean;
  appealAttempt?: 1 | 2;
}

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; text: string; conceded: boolean; forfeited?: boolean; scores?: Scorecard; finishReason: string; tokens?: number; verdict?: Verdict; appealed?: boolean; warning?: string }
  | { type: 'error'; message: string };

export const SIDE_LABEL: Record<Side, string> = { pro: '正方', con: '反方' };
/** Display legacy role titles consistently without changing API model identifiers. */
export function normalizeJudgeTitle(text: string): string {
  return text.replace(/Astra\s*(?:大人|裁判)/gi, '裁判');
}
export type Actor = Omit<Speaker, 'side'> & { side: Side | 'judge' };
export type Verdict = 'pro' | 'con' | 'draw' | 'continue';
export type TurnKind = 'prep' | 'speech' | 'judge' | 'appeal' | 'review';
export const FORMAT_LABEL: Record<Format, string> = { classic: '经典攻防', crossfire: '自由交锋', socratic: '追问到底' };
export function speakerName(side: Side, member: number) { return `${SIDE_LABEL[side]}${['一', '二', '三'][member]}辩`; }

export function turnOrder(config: DebateConfig): Speaker[] {
  return Array.from({ length: config.teamSize }, (_, i) => [config.teams.pro[i], config.teams.con[i]]).flat();
}

export function shouldComment(config: DebateConfig, round: number, expired: boolean): boolean {
  return config.judge.enabled && config.judge.timing === 'coach' && !expired && (config.maxRounds === 0 || round < config.maxRounds);
}

export function shouldAdjudicate(config: DebateConfig, expired: boolean): boolean {
  return config.judge.enabled && (expired || config.judge.timing === 'coach');
}

export function parseControl(raw: string): { text: string; conceded: boolean } {
  const conceded = /(?:^|\n)\s*\[\[CONCEDE\]\]\s*$/.test(raw);
  return { text: raw.replace(/(?:^|\n)\s*\[\[CONCEDE\]\]\s*$/, '').replace(/(?:^|\n)\s*\[\[FORFEIT\]\]\s*$/, '').replace(/\s*\[\[CONTINUE\]\]\s*$/, '').trim(), conceded };
}

/** Only a deliberate standalone terminal declaration is a forfeiture, never a keyword match. */
export function parseForfeit(raw: string): boolean {
  return /(?:^|\n)\s*\[\[FORFEIT\]\]\s*$/.test(raw);
}

/** Hide only a truncated final protocol line, never a quoted marker in prose. */
export function stripControlFragment(raw: string): string {
  const start = raw.lastIndexOf('\n') + 1;
  const tail = raw.slice(start).trim();
  const markers = ['[[FORFEIT]]', '[[CONCEDE]]', '[[CONTINUE]]', '[[APPEAL]]', '[[ACCEPT]]', '[[VERDICT:PRO]]', '[[VERDICT:CON]]', '[[VERDICT:DRAW]]', '[[VERDICT:CONTINUE]]'];
  return tail.startsWith('[') && markers.some(marker => marker !== tail && marker.startsWith(tail)) ? raw.slice(0, start).trimEnd() : raw;
}

export function parseJudgeControl(raw: string) {
  return readDecision(raw);
}
