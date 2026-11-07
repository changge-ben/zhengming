import type { Match } from '../shared/types';

const CHECKPOINT_KEY = 'zhengming-active-match';

// Per-tab storage survives reload without confusing another tab's live match.
export function saveCheckpoint(match: Match, completed = false): boolean {
  try {
    sessionStorage.setItem(
      CHECKPOINT_KEY,
      JSON.stringify({ version: 1, completed, match })
    );
    return true;
  } catch {
    return false;
  }
}

export function loadCheckpoint(): Match | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(CHECKPOINT_KEY) || 'null');
    if (stored?.version !== 1) return null;
    const match = stored.match as Match | null;
    if (
      !match ||
      typeof match.id !== 'string' ||
      typeof match.config?.topic !== 'string' ||
      !Array.isArray(match.messages) ||
      !Array.isArray(match.preparation) ||
      !Number.isFinite(match.createdAt)
    )
      return null;
    if (
      ![1, 2, 3].includes(match.config.teamSize) ||
      !match.config.judge ||
      !match.config.teams?.pro?.length ||
      !match.config.teams?.con?.length ||
      !match.messages.every((m) => m && typeof m.text === 'string')
    )
      return null;
    if (
      stored.completed &&
      match.result &&
      typeof match.result.detail === 'string' &&
      ['concession', 'forfeit', 'limit', 'judge', 'stopped', 'error'].includes(
        match.result.reason
      )
    )
      return match;
    return {
      ...match,
      result: {
        reason: 'stopped',
        winner: null,
        detail:
          '页面离开前的比赛记录已找回。本场因页面离开而中止，可重看或导出已保存内容。',
      },
    };
  } catch {
    return null;
  }
}

export function clearCheckpoint(id: string) {
  try {
    const current = JSON.parse(
      sessionStorage.getItem(CHECKPOINT_KEY) || 'null'
    );
    if (current?.match?.id === id) sessionStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    /* A damaged checkpoint must not interfere with normal saving. */
  }
}
