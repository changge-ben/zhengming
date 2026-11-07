import { useEffect, useRef, useState } from 'react';
import { streamTurn } from './turnStream';
import { roundTurnSeconds, thinkingLimit, visibleCharLimit, winningSide } from '../shared/budget';
import { SCORED_OVERTIME_ROUNDS, readScorecard, scoreWinner } from '../shared/adjudication';
import { acceptsRuling } from '../shared/decision';
import { SIDE_LABEL, shouldAdjudicate, shouldComment, turnOrder, type Actor, type DebateConfig, type Match, type MatchResult, type MatchStatus, type TurnKind, type Utterance, type Verdict } from '../shared/types';

interface Context {
  id: string;
  config: DebateConfig;
  history: Utterance[];
  preparation: Utterance[];
  preparing: Partial<Record<'pro' | 'con', Utterance>>;
  controller: AbortController;
  pauseRequested: boolean;
  actuallyPaused: boolean;
  round: number;
  deadline: number;
  matchDeadline: number;
  phase: 'preparing' | 'debate' | 'judging' | 'appealing' | 'reviewing';
  createdAt: number;
  audience: string[];
  pending: Utterance | null;
  finished: boolean;
}

export function useDebate(onSave: (match: Match) => void) {
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [messages, setMessages] = useState<Utterance[]>([]);
  const [active, setActive] = useState<Actor | null>(null);
  const [phase, setPhase] = useState<Context['phase']>('debate');
  const [preparation, setPreparation] = useState<Utterance[]>([]);
  const [round, setRound] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [liveConfig, setLiveConfig] = useState<DebateConfig | null>(null);
  const [viewedMatch, setViewedMatch] = useState<Match | null>(null);
  const [overtime, setOvertime] = useState(false);
  const [notice, setNotice] = useState('');
  const ctxRef = useRef<Context | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const ctx = ctxRef.current;
      if (ctx && !ctx.finished && !ctx.actuallyPaused) setRemaining(Math.max(0, Math.ceil(((ctx.phase === 'debate' && ctx.config.pace === 'timed' ? ctx.matchDeadline : ctx.deadline) - Date.now()) / 1000)));
    }, 200);
    return () => { clearInterval(timer); ctxRef.current?.controller.abort(); };
  }, []);

  const finish = (ctx: Context, next: MatchResult, nextStatus: MatchStatus) => {
    if (ctx.finished || ctxRef.current !== ctx) return;
    ctx.finished = true;
    ctx.controller.abort();
    const match: Match = { id: ctx.id, config: ctx.config, messages: [...ctx.history], preparation: [...ctx.preparation], createdAt: ctx.createdAt, result: next, rounds: ctx.phase === 'preparing' ? 0 : ctx.round };
    setMessages([...ctx.history]);
    setPreparation([...ctx.preparation]);
    setActive(null);
    setResult(next);
    setNotice('');
    setStatus(nextStatus);
    setRemaining(0);
    setViewedMatch(match);
    saveRef.current(match);
  };

  async function start(config: DebateConfig) {
    config = { ...config, rulesVersion: 4 };
    ctxRef.current?.controller.abort();
    const ctx: Context = { id: crypto.randomUUID(), config: structuredClone(config), history: [], preparation: [], preparing: {}, controller: new AbortController(), pauseRequested: false, actuallyPaused: false, round: 0, deadline: Date.now() + (config.prepSeconds || config.roundSeconds) * 1000, matchDeadline: Date.now() + config.matchSeconds * 1000, phase: config.prepSeconds ? 'preparing' : 'debate', createdAt: Date.now(), audience: [], pending: null, finished: false };
    ctxRef.current = ctx;
    setOvertime(false); setNotice('');
    setLiveConfig(ctx.config); setViewedMatch(null); setMessages([]); setPreparation([]); setResult(null); setRound(0); setRemaining(config.prepSeconds || config.matchSeconds); setStatus('running');
    const order = turnOrder(config);
    setPhase(ctx.phase);
    const publishPreparation = () => setPreparation([...ctx.preparation, ...Object.values(ctx.preparing)].sort((a, b) => a.timestamp - b.timestamp));
    function ensureActive() {
      if (ctx.finished || ctx.controller.signal.aborted || ctxRef.current !== ctx) throw new DOMException('已取消', 'AbortError');
    }
    async function checkpoint() {
      ensureActive();
      if (ctx.pauseRequested) {
        ctx.actuallyPaused = true;
        const pausedAt = Date.now();
        setStatus('paused'); setActive(null);
        while (ctx.pauseRequested && !ctx.controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 100));
        const pausedFor = Date.now() - pausedAt;
        ctx.deadline += pausedFor;
        ctx.matchDeadline += pausedFor;
        ctx.actuallyPaused = false;
        if (ctx.controller.signal.aborted) throw new DOMException('已取消', 'AbortError');
        setStatus('running');
      }
    }
    async function playTurn(speaker: Actor, kind: TurnKind, timeLimit: number, extra: { isFinal?: boolean; priorVerdict?: Verdict; round?: number; overtimeRound?: number; forceScoring?: boolean; appealAttempt?: 1 | 2 } = {}) {
      ensureActive();
      const isPrep = kind === 'prep' && speaker.side !== 'judge';
      if (!isPrep) await checkpoint();
      if (kind === 'speech' && ctx.audience.length) {
        for (const text of ctx.audience.splice(0)) ctx.history.push({ id: crypto.randomUUID(), side: 'audience', member: 0, name: '观众席', model: '', round: ctx.round, text, timestamp: Date.now() });
      }
      if (!isPrep && (kind !== 'speech' || config.pace !== 'timed')) ctx.deadline = Date.now() + timeLimit * 1000;
      const current: Utterance = { id: crypto.randomUUID(), side: speaker.side, member: speaker.member, name: speaker.name, model: speaker.modelId, round: extra.round || ctx.round, text: '', timestamp: Date.now(), kind, timeLimit, charLimit: visibleCharLimit(config, kind), ...(extra.appealAttempt ? { appealAttempt: extra.appealAttempt } : {}) };
      if (isPrep) { ctx.preparing[speaker.side as 'pro' | 'con'] = current; publishPreparation(); }
      else { ctx.pending = current; setActive(speaker); setMessages([...ctx.history, { ...current }]); }
      const source = isPrep ? ctx.preparation.filter(m => m.side === speaker.side) : ctx.history;
      const history = source;
      const ownPreparation = speaker.side === 'judge' ? [] : ctx.preparation.filter(m => m.side === speaker.side);
      for await (const event of streamTurn({ config, speaker, kind, round: current.round, timeLimit, history, preparation: ownPreparation, ...extra }, ctx.controller.signal)) {
        ensureActive();
        if (event.type === 'notice') current.warning = event.message;
        if (event.type === 'token') current.text += event.text;
        if (event.type === 'done') { current.text = event.text; current.conceded = event.conceded; current.forfeited = event.forfeited; current.scores = readScorecard(event.scores); current.finishReason = event.finishReason; current.verdict = current.scores ? scoreWinner(current.scores, event.verdict) : event.verdict; current.appealed = event.appealed; current.warning = event.warning; }
        current.elapsed = (Date.now() - current.timestamp) / 1000;
        if (isPrep) publishPreparation(); else setMessages([...ctx.history, { ...current }]);
      }
      ensureActive();
      if (isPrep) { ctx.preparation.push({ ...current }); delete ctx.preparing[speaker.side as 'pro' | 'con']; publishPreparation(); }
      else { ctx.history.push({ ...current }); ctx.pending = null; setMessages([...ctx.history]); setActive(null); }
      await new Promise<void>((resolve, reject) => {
        const signal = ctx.controller.signal;
        const abort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 320);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
      });
      ensureActive();
      return current;
    }
    const judge: Actor = { side: 'judge', member: 0, providerId: config.judge.providerId, modelId: config.judge.modelId, name: 'Astra 大人' };
    async function specialTurn(speaker: Actor, kind: 'judge' | 'appeal' | 'review', extra: { isFinal?: boolean; priorVerdict?: Verdict; overtimeRound?: number; forceScoring?: boolean; appealAttempt?: 1 | 2 } = {}) {
      ensureActive();
      ctx.phase = kind === 'appeal' ? 'appealing' : kind === 'review' ? 'reviewing' : 'judging';
      setPhase(ctx.phase);
      const limit = thinkingLimit(config);
      ctx.deadline = Date.now() + limit * 1000; setRemaining(limit);
      try {
        const message = await playTurn(speaker, kind, limit, extra);
        if (kind === 'appeal' && message.finishReason === 'stop' && message.appealed === undefined && acceptsRuling(message.text)) {
          message.appealed = false;
          const saved = ctx.history.find(m => m.id === message.id);
          if (saved) saved.appealed = false;
          setMessages([...ctx.history]);
        }
        if (message.finishReason !== 'stop' || (kind === 'appeal' ? message.appealed === undefined : !message.verdict || extra.forceScoring && (!message.scores || message.scores.pro.judgeResponse === undefined))) {
          setNotice('本次裁决或回应未完整确认，暂不判胜负，继续加时交锋。');
          return null;
        }
        return message;
      } catch (error) {
        if (ctx.controller.signal.aborted || ctxRef.current !== ctx) throw error;
        const detail = (error as Error).message;
        const pending = ctx.pending;
        ctx.history.push(pending ? { ...pending, text: pending.text || '（本次裁判或申诉连接未完成。）', finishReason: 'error', warning: detail } : { id: crypto.randomUUID(), side: speaker.side, member: speaker.member, name: speaker.name, model: speaker.modelId, round: ctx.round, timestamp: Date.now(), kind, text: '（本次裁判环节未完成。）', finishReason: 'error', warning: detail, ...(extra.appealAttempt ? { appealAttempt: extra.appealAttempt } : {}) });
        ctx.pending = null; setActive(null); setMessages([...ctx.history]);
        setNotice(`裁判环节暂未完成：${detail} 不据此判胜负，继续加时。`);
        return null;
      }
    }
    async function determineWinner(overtimeRound: number) {
      setNotice('');
      const scoring = { overtimeRound, forceScoring: overtimeRound >= SCORED_OVERTIME_ROUNDS };
      const ruling = await specialTurn(judge, 'judge', { isFinal: true, ...scoring });
      let winner = winningSide(ruling?.verdict);
      if (!winner) return null;
      let appealed = false;
      // An overturned verdict gives the newly losing side the same right to appeal.
      // Two successful appeals cancel this adjudication, rather than looping reviews.
      if (config.judge.appeals) for (const appealAttempt of [1, 2] as const) {
        const loser = winner === 'pro' ? 'con' : 'pro';
        const appeal = await specialTurn(config.teams[loser][0], 'appeal', { priorVerdict: winner, overtimeRound, appealAttempt });
        if (!appeal) return null;
        if (!appeal.appealed) break;
        appealed = true;
        const previousWinner: 'pro' | 'con' = winner;
        const review = await specialTurn(judge, 'review', { isFinal: true, priorVerdict: winner, ...scoring, appealAttempt });
        winner = winningSide(review?.verdict);
        if (!winner) return null;
        if (winner === previousWinner) break;
        if (appealAttempt === 2) {
          setNotice('双方申诉均获改判，本次裁决不结算胜负；继续加时一整轮，双方发言后重新裁决并各获新的申诉机会。');
          return null;
        }
        setNotice(`${SIDE_LABEL[loser]}申诉成功，裁判改判${SIDE_LABEL[winner]}胜；现由新的败方${SIDE_LABEL[previousWinner]}队长决定接受或申诉。`);
      }
      return { winner, appealed, scored: scoring.forceScoring };
    }
    try {
      if (config.prepSeconds > 0) {
        ctx.deadline = Date.now() + config.prepSeconds * 1000;
        // Both team rooms run concurrently; every request sees only its own room.
        for (let wave = 0; wave < config.teamSize * 2; wave++) {
          await checkpoint();
          const available = (ctx.deadline - Date.now()) / 1000;
          if (available < .05) break;
          const limit = Math.max(.05, available / (config.teamSize * 2 - wave));
          await Promise.all((['pro', 'con'] as const).map(side => playTurn(config.teams[side][wave % config.teamSize], 'prep', limit, { round: Math.floor(wave / config.teamSize) + 1 })));
        }
      }
      await checkpoint();
      ctx.matchDeadline = Date.now() + config.matchSeconds * 1000;
      ctx.phase = 'debate'; setPhase('debate');
      const lengthMode = config.pace !== 'timed';
      const regulationRounds = config.maxRounds || 3;
      let inOvertime = false;
      let overtimeRounds = 0;
      for (let r = 1; ; r++) {
        await checkpoint();
        ctx.round = r;
        if (inOvertime && !lengthMode) ctx.matchDeadline = Date.now() + config.roundSeconds * 1000;
        ctx.deadline = Date.now() + config.roundSeconds * 1000;
        const equalTurnLimit = roundTurnSeconds(config.roundSeconds, config.roundSeconds, order.length);
        setRound(r); ctx.phase = 'debate'; setPhase('debate');
        for (const speaker of order) {
          await checkpoint();
          const roundRemaining = (ctx.deadline - Date.now()) / 1000;
          if (!lengthMode && roundRemaining < .05) break;
          const timeLimit = lengthMode ? thinkingLimit(config) : Math.max(.05, Math.min(equalTurnLimit, roundRemaining));
          const current = await playTurn(speaker, 'speech', timeLimit, { overtimeRound: inOvertime ? overtimeRounds + 1 : 0 });
          if (current.forfeited && current.finishReason === 'stop') {
            const winner = speaker.side === 'pro' ? 'con' : 'pro';
            finish(ctx, { reason: 'forfeit', winner, detail: `${SIDE_LABEL[speaker.side]}${speaker.member + 1}辩明确宣布立场弃守，按规则本队判负，${SIDE_LABEL[winner]}获胜。` }, 'completed');
            return;
          }
          if (current.conceded) {
            const winner = speaker.side === 'pro' ? 'con' : 'pro';
            finish(ctx, { reason: 'concession', winner, detail: `${SIDE_LABEL[speaker.side]}队长主动认输，${SIDE_LABEL[winner]}获胜。` }, 'completed');
            return;
          }
        }
        const regulationEnded = lengthMode ? r >= regulationRounds : Date.now() >= ctx.matchDeadline || config.maxRounds > 0 && r >= config.maxRounds;
        if (inOvertime || regulationEnded) {
          if (inOvertime) overtimeRounds++;
          if (config.judge.enabled) {
            const decision = await determineWinner(overtimeRounds);
            if (decision) {
              finish(ctx, { reason: 'judge', winner: decision.winner, detail: `Astra 大人${decision.scored ? '按整场表现评分决胜' : decision.appealed ? '完成申诉复核' : '确认胜负'}：${SIDE_LABEL[decision.winner]}获胜。${decision.appealed ? '申诉与复核已记入档案。' : ''}` }, 'completed');
              return;
            }
          }
          inOvertime = true; setOvertime(true);
          setNotice(previous => previous.startsWith('裁判环节') || previous.startsWith('双方申诉均获改判') ? previous : config.judge.enabled ? overtimeRounds >= SCORED_OVERTIME_ROUNDS ? '评分裁决尚未有效确认，保留比赛继续交锋并重试评分；可随时手动结束。' : `尚未确认胜负，已完成加时 ${overtimeRounds}/${SCORED_OVERTIME_ROUNDS} 轮；满三轮仍未决将按整场表现评分。可随时手动结束。` : '常规阶段已结束，双方尚未认输，继续加时；可随时手动结束。');
        } else if (config.judge.enabled && config.judge.timing === 'coach') {
          await specialTurn(judge, 'judge', { isFinal: false });
        }
      }
    } catch (error) {
      if (ctx.controller.signal.aborted || ctxRef.current !== ctx) return;
      ctx.controller.abort();
      for (const m of Object.values(ctx.preparing)) if (m.text) ctx.preparation.push({ ...m, finishReason: 'error' });
      ctx.preparing = {};
      if (ctx.pending?.text) ctx.history.push({ ...ctx.pending, finishReason: 'error' });
      ctx.pending = null;
      finish(ctx, { reason: 'error', winner: null, detail: error instanceof TypeError ? '无法连接 API 服务，请检查服务状态与网络。' : (error as Error).message }, 'error');
    }
  }

  function pause() {
    const ctx = ctxRef.current;
    if (!ctx || ctx.finished) return;
    ctx.pauseRequested = !ctx.pauseRequested;
    setStatus(ctx.pauseRequested ? (ctx.pending || Object.keys(ctx.preparing).length ? 'pausing' : 'paused') : 'running');
  }

  function stop() {
    const ctx = ctxRef.current;
    if (!ctx || ctx.finished) return;
    ctx.controller.abort();
    ctx.pauseRequested = false;
    ctx.actuallyPaused = false;
    for (const m of Object.values(ctx.preparing)) if (m.text) ctx.preparation.push({ ...m, finishReason: 'stopped' });
    ctx.preparing = {};
    if (ctx.pending?.text) ctx.history.push({ ...ctx.pending, finishReason: 'stopped' });
    ctx.pending = null;
    finish(ctx, { reason: 'stopped', winner: null, detail: '你结束了本场辩论，已有发言已保存。' }, 'stopped');
  }

  function ask(text: string) {
    const ctx = ctxRef.current;
    if (!ctx || ctx.finished || ctx.phase === 'preparing' || ctx.audience.length >= 3 || ctx.history.filter(m => m.side === 'audience').length >= 30) return false;
    ctx.audience.push(text);
    return true;
  }

  function view(match: Match) {
    if (ctxRef.current && !ctxRef.current.finished) return;
    ctxRef.current = null;
    setLiveConfig(match.config); setMessages(match.messages); setPreparation(match.preparation || []); setResult(match.result); setRound(match.rounds); setRemaining(0); setActive(null); setViewedMatch(match); setOvertime(false); setNotice(''); setPhase('debate'); setStatus(match.result.reason === 'error' ? 'error' : match.result.reason === 'stopped' ? 'stopped' : 'completed');
  }

  function reset() {
    if (ctxRef.current && !ctxRef.current.finished) return;
    ctxRef.current = null;
    setMessages([]); setPreparation([]); setActive(null); setOvertime(false); setNotice(''); setPhase('debate'); setRound(0); setRemaining(0); setResult(null); setLiveConfig(null); setViewedMatch(null); setStatus('idle');
  }

  return { status, messages, preparation, active, phase, overtime, notice, round, remaining, result, liveConfig, viewedMatch, start, pause, stop, ask, view, reset };
}

export type DebateController = ReturnType<typeof useDebate>;
