import type { Match, MatchResult, Side } from './types.ts';

export interface ScoreEntry {
  id: string;
  demo: boolean;
  teams: Record<Side, { providerId: string; modelId: string }[]>;
  result: MatchResult;
  createdAt: number;
  topic: string;
}
export interface ModelStanding {
  key: string;
  providerId: string;
  modelId: string;
  wins: number;
  losses: number;
  draws: number;
  unresolved: number;
  selfPlay: number;
  games: number;
  lastPlayed: number;
}
export function scoreEntry(match: Match): ScoreEntry {
  return { id: match.id, demo: match.config.demo, teams: { pro: match.config.teams.pro.slice(0, match.config.teamSize).map(({ providerId, modelId }) => ({ providerId, modelId })), con: match.config.teams.con.slice(0, match.config.teamSize).map(({ providerId, modelId }) => ({ providerId, modelId })) }, result: match.result, createdAt: match.createdAt, topic: match.config.topic };
}
export function standings(entries: ScoreEntry[], includeDemo = false): ModelStanding[] {
  const records = new Map<string, ModelStanding>();
  const visited = new Set<string>();
  for (const entry of entries) {
    if (visited.has(entry.id) || (!includeDemo && entry.demo) || !['concession', 'forfeit', 'judge', 'limit'].includes(entry.result.reason)) continue;
    visited.add(entry.id);
    const pro = new Set(entry.teams.pro.map(m => JSON.stringify([m.providerId, m.modelId])));
    const con = new Set(entry.teams.con.map(m => JSON.stringify([m.providerId, m.modelId])));
    for (const key of new Set([...pro, ...con])) {
      const [providerId, modelId] = JSON.parse(key);
      const record = records.get(key) || { key, providerId, modelId, wins: 0, losses: 0, draws: 0, unresolved: 0, selfPlay: 0, games: 0, lastPlayed: 0 };
      record.games++;
      record.lastPlayed = Math.max(record.lastPlayed, entry.createdAt);
      if (pro.has(key) && con.has(key)) record.selfPlay++;
      else if (entry.result.winner) {
        const won = entry.result.winner === 'pro' ? pro.has(key) : con.has(key);
        if (won) record.wins++; else record.losses++;
      } else if (entry.result.reason === 'judge') record.draws++;
      else record.unresolved++;
      records.set(key, record);
    }
  }
  return [...records.values()].sort((a, b) => b.wins - a.wins || b.games - a.games || a.modelId.localeCompare(b.modelId));
}
