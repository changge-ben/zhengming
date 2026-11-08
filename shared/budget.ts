import type { TurnRequest } from './types.ts';

// Reserve a little transport/transition overhead, without donating unused time
// to later seats. Every participant in a round receives this same ceiling.
export function roundTurnSeconds(roundSeconds: number, matchRemaining: number, seats: number): number {
  const roundBudget = Math.max(0, Math.min(roundSeconds, matchRemaining));
  const reserve = Math.min(roundBudget * .08, seats * .5);
  return Math.max(.05, Math.floor((roundBudget - reserve) / seats * 100) / 100);
}

// A safety ceiling, separate from the visible-text budget; some providers count reasoning here.
export const OUTPUT_TOKEN_LIMIT = 8192;

export function visibleCharLimit(config: Pick<import('./types.ts').DebateConfig, 'speechChars'>, kind?: string): number {
  if (kind === 'judge' || kind === 'review') return 800;
  const limit = Math.max(100, Math.min(2000, config.speechChars ?? 400));
  return kind === 'prep' ? Math.min(300, limit) : limit;
}

export function thinkingLimit(config: Pick<import('./types.ts').DebateConfig, 'thinkingSeconds'>): number {
  return Math.max(60, Math.min(600, config.thinkingSeconds ?? 180));
}

export function limitVisibleText(text: string, limit: number): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  const prefix = chars.slice(0, limit).join('');
  const ends = [...prefix.matchAll(/[。！？.!?；;](?:[”」）)]?)/g)];
  const last = ends.at(-1);
  return last && last.index! + last[0].length >= prefix.length * .5 ? prefix.slice(0, last.index! + last[0].length) : prefix;
}

/** Only a genuine winning side ends a match. Draw/continue/missing signals require overtime. */
export function winningSide(verdict?: string): 'pro' | 'con' | null {
  return verdict === 'pro' || verdict === 'con' ? verdict : null;
}

export function budgetPrompt(input: Pick<TurnRequest, 'timeLimit' | 'kind'> & Partial<Pick<TurnRequest, 'config'>>): string {
  const seconds = Math.max(.05, input.timeLimit);
  const target = visibleCharLimit(input.config || {}, input.kind);
  if (input.config?.locale === 'en') return `[TURN BUDGET] You have at most ${Number(seconds.toFixed(2))} seconds, including connection, reasoning and output. This is a technical deadline. Visible output is limited to ${target} characters, including letters, spaces, digits and punctuation. Control markers are excluded. This is a character limit, not a word limit. Plan a complete response and finish within it.
The API safety ceiling is ${OUTPUT_TOKEN_LIMIT} tokens. Some providers count reasoning toward it. Keep hidden reasoning private, prioritize the strongest contribution, and reserve room for a complete final sentence and the required control marker. You cannot observe the live countdown. Choose your own tactics and structure.`;
  return `【本次发言预算】你本次最多有 ${Number(seconds.toFixed(2))} 秒，包含接口连接、思考和输出；这是技术等待上限，不要求按秒数凑字数。正文总量上限为 ${target} 字，中文、字母、数字及标点都计入，最后的控制标记不计入正文。请先规划篇幅，控制在上限内，句子完整再结束；不要写到一半才发现字数不够。
应用另设 ${OUTPUT_TOKEN_LIMIT} tokens 的接口安全预算，部分接口会把思考也计入该预算；这不是正文的字数。可充分思考，但不展示隐藏思考过程，不必用满字数。先把最有价值的话说出来，避免长铺垫。给最后一句和规定的结束标记留出余量。你看不到实时倒计时，不要假装能精确感知剩余秒数。具体战术、论证结构和分工仍由你自行决定。`;
}
