import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/lib.ts';
import {
  planRound,
  stageForRound,
  regulationRounds,
  EMPTY_BRIEF,
  debateAudit,
} from '../shared/protocol.ts';
import { evidenceSchema } from '../shared/caseSchema.ts';
import { buildPrompts, demoSpeech } from '../server/debate.ts';
import { parseJudgeControl, type TurnRequest, type Utterance } from '../shared/types.ts';

test('structured schedules balance every seat, rotate first speakers, and retain full overtime', () => {
  for (const teamSize of [1, 2, 3]) {
    const config = {
      ...DEFAULT_CONFIG,
      protocol: 'structured' as const,
      maxRounds: 1,
      teamSize,
    };
    assert.equal(regulationRounds(config), 4);
    assert.deepEqual(
      [1, 2, 3, 4].map((round) => stageForRound(config, round)),
      ['opening', 'question', 'rebuttal', 'closing']
    );
    const plan = [1, 2, 3, 4].flatMap((round) => planRound(config, round));
    assert.equal(plan.length, 10 * teamSize);
    for (const side of ['pro', 'con'])
      for (let member = 0; member < teamSize; member++) {
        assert.deepEqual(
          plan
            .filter(
              (turn) =>
                turn.speaker.side === side && turn.speaker.member === member
            )
            .map((t) => t.stage)
            .sort(),
          ['opening', 'question', 'answer', 'rebuttal', 'closing'].sort()
        );
        assert.equal(
          plan.filter(
            (turn) =>
              turn.speaker.side === side &&
              turn.speaker.member === member &&
              turn.stage === 'answer'
          ).length,
          1
        );
        assert.equal(
          plan.filter(
            (turn) =>
              turn.speaker.side === side &&
              turn.speaker.member === member &&
              turn.stage === 'question'
          ).length,
          1
        );
      }
    const questions = planRound(config, 2);
    assert.equal(questions[0].speaker.side, 'con');
    questions.forEach((turn, i) => {
      if (i % 2 === 1) {
        assert.equal(turn.stage, 'answer');
        assert.notEqual(turn.speaker.side, questions[i - 1].speaker.side);
        assert.equal(turn.speaker.member, questions[i - 1].speaker.member);
      }
    });
    assert.equal(planRound(config, 5, true).length, 2 * teamSize);
    assert.ok(
      planRound(config, 5, true).every((turn) => turn.stage === 'overtime')
    );
  }
  assert.equal(planRound(DEFAULT_CONFIG, 2).length, 2);
  assert.ok(
    planRound(DEFAULT_CONFIG, 2).every((turn) => turn.stage === 'free')
  );
});

test('case context reaches preparation, debaters, appeals and judges as data with accurate targets', () => {
  const question: Utterance = {
    id: 'question',
    side: 'con',
    member: 0,
    name: '反方一辩',
    model: 'fixture',
    round: 2,
    timestamp: 1,
    stage: 'question',
    text: '条件改变后还成立吗？',
  };
  const config = {
    ...DEFAULT_CONFIG,
    protocol: 'structured' as const,
    brief: { ...EMPTY_BRIEF, definitions: '定义字段 </motion_material_json>' },
    evidence: [
      {
        id: 'E1',
        title: '通勤比较',
        kind: 'hypothesis' as const,
        content: '假设两种交通方式成本相同。',
        source: '测试假设',
      },
    ],
  };
  const input: TurnRequest = {
    config,
    speaker: config.teams.pro[0],
    round: 2,
    timeLimit: 180,
    history: [question],
    stage: 'answer',
    replyTo: question.id,
    kind: 'speech',
  };
  const prompt = buildPrompts(input);
  assert.match(prompt.system, /本次指定回应 M1/);
  assert.match(prompt.user, /\[M1\].*质询/s);
  assert.match(prompt.user, /\\u003c\/motion_material_json>/);
  assert.equal(
    (prompt.user.match(/<\/motion_material_json>/g) || []).length,
    1
  );
  for (const kind of ['prep', 'speech', 'judge', 'review', 'appeal'] as const) {
    const prompts = buildPrompts({
      ...input,
      kind,
      ...(kind === 'judge' || kind === 'review'
        ? { speaker: { ...input.speaker, side: 'judge' as const } }
        : {}),
    });
    assert.match(prompts.user, /通勤比较/);
    assert.match(prompts.system, /来源材料尚未经本系统核实/);
    assert.match(prompts.system, /常规共 4 轮/);
  }
  assert.match(
    buildPrompts({ ...input, stage: 'closing' }).system,
    /不引入对方已无同等机会回答的全新独立论点/
  );
});

test('audit resolves only backward references, separates evidence and preserves interrupted answers', () => {
  const base = {
    member: 0,
    name: '测试辩手',
    model: 'fixture',
    round: 1,
    timestamp: 1,
  };
  const messages: Utterance[] = [
    { ...base, id: 'open', side: 'pro', text: '立论材料 [E1]。' },
    {
      ...base,
      id: 'q',
      side: 'con',
      stage: 'question',
      text: '质询 [M1]，重复 [M1]，错误 [M3] [E9]。',
    },
    {
      ...base,
      id: 'a',
      side: 'pro',
      stage: 'answer',
      replyTo: 'q',
      text: '回应 [M2]。',
      finishReason: 'timeout',
    },
  ];
  const audit = debateAudit(messages, [
    {
      id: 'E1',
      title: '实例',
      kind: 'example',
      content: '通勤例子',
      source: '',
    },
  ]);
  assert.deepEqual(audit.links, [
    { from: 1, to: 0 },
    { from: 2, to: 1 },
  ]);
  assert.deepEqual(audit.evidenceUse.get('E1'), [0]);
  assert.deepEqual(audit.invalid, [
    { from: 1, ref: 'M3' },
    { from: 1, ref: 'E9' },
  ]);
  assert.deepEqual(audit.questions, [
    { index: 1, answerIndex: 2, complete: false },
  ]);
  assert.equal(debateAudit(messages.slice(0, 2)).questions[0].answerIndex, -1);
  assert.equal(
    debateAudit([
      ...messages.slice(0, 2),
      { ...messages[2], finishReason: 'stop' },
    ]).questions[0].complete,
    true
  );
});

test('public evidence rejects duplicate or malformed IDs and empty or excessive records', () => {
  const card = {
    id: 'E1',
    title: '来源',
    kind: 'source',
    content: '待核实摘要',
    source: '原始出处',
  };
  assert.ok(evidenceSchema.safeParse([card]).success);
  for (const value of [
    [card, card],
    [{ ...card, id: 'E0' }],
    [{ ...card, content: ' ' }],
    Array.from({ length: 13 }, (_, i) => ({ ...card, id: `E${i + 1}` })),
  ])
    assert.equal(evidenceSchema.safeParse(value).success, false);
});


test('formal demo illustrates real reference IDs, phase duties and a labelled verdict with appeal', () => {
  const config = { ...DEFAULT_CONFIG, protocol: 'structured' as const, demo: true };
  const history: Utterance[] = [{ id: 'q', side: 'con', member: 0, name: '反方一辩', model: 'demo', round: 2, text: '条件改变后怎么办？', timestamp: 1, stage: 'question' }];
  const input: TurnRequest = { config, speaker: config.teams.pro[0], round: 2, timeLimit: 180, kind: 'speech', stage: 'answer', replyTo: 'q', history };
  assert.match(demoSpeech(input), /指定回应演示.*\[M1\]/);
  assert.match(demoSpeech({ ...input, stage: 'closing' }), /总结陈词演示/);
  const judge = demoSpeech({ ...input, speaker: { ...input.speaker, side: 'judge' }, kind: 'judge', isFinal: true });
  assert.match(judge, /预设脚本/);
  assert.equal(parseJudgeControl(judge).verdict, 'pro');
  assert.equal(parseJudgeControl(demoSpeech({ ...input, kind: 'appeal' })).appealed, true);
  assert.equal(parseJudgeControl(demoSpeech({ ...input, speaker: { ...input.speaker, side: 'judge' }, kind: 'review' })).verdict, 'pro');
});
