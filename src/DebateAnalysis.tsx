import type { DebateConfig, Utterance } from '../shared/types';
import { SIDE_LABEL, speakerName } from '../shared/types';
import {
  debateAudit,
  EVIDENCE_LABEL,
  messageRef,
  regulationRounds,
  STAGE_LABEL,
  stageForRound,
} from '../shared/protocol';

interface Props {
  config: DebateConfig;
  messages: Utterance[];
  onReference: (ref: string) => void;
}
export function ProtocolTimeline({
  config,
  round,
  overtime,
  live,
}: {
  config: DebateConfig;
  round: number;
  overtime: boolean;
  live: boolean;
}) {
  if (config.protocol !== 'structured') return null;
  const current = stageForRound(config, round || 1, overtime);
  const steps = [
    ['opening', '01', '独立立论'],
    ['question', '02', '双向质询'],
    ['rebuttal', '03', '争点攻防'],
    ['closing', '04', '总结陈词'],
  ] as const;
  const currentIndex = overtime
    ? 4
    : steps.findIndex(
        ([stage]) =>
          stage === current || (stage === 'question' && current === 'answer')
      );
  return (
    <div
      className={`protocol-timeline ${live ? 'is-live' : ''}`}
      aria-label="正式赛程"
    >
      <svg
        className="protocol-line"
        viewBox="0 0 1000 4"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 2H1000" />
        <path
          className="protocol-progress"
          style={{
            strokeDashoffset: 1000 - (Math.min(3, currentIndex) * 1000) / 3,
          }}
          d="M0 2H1000"
          pathLength="1000"
        />
      </svg>
      {steps.map(([id, number, title], index) => (
        <div
          className={`protocol-step ${index === currentIndex ? 'current' : index < currentIndex ? 'done' : ''}`}
          key={id}
          aria-current={index === currentIndex ? 'step' : undefined}
        >
          <span>{number}</span>
          <div>
            <strong>{title}</strong>
            <small>
              {id === 'opening'
                ? '共同资料 · 相互盲开'
                : id === 'question'
                  ? '双方提问 · 指定作答'
                  : id === 'rebuttal'
                    ? `${regulationRounds(config) - 3} 轮整场交锋`
                    : '归纳比较 · 完整收束'}
            </small>
          </div>
        </div>
      ))}
      {overtime && <p>加时阶段 · 继续处理未决争点</p>}
    </div>
  );
}

export default function DebateAnalysis({
  config,
  messages,
  onReference,
}: Props) {
  const audit = debateAudit(messages, config.evidence);
  return (
    <div className="debate-analysis">
      <div className="analysis-intro">
        <span className="eyebrow">THE ARGUMENT DESK</span>
        <h2>沿着交锋，回到依据。</h2>
        <p>
          索引记录明确引用与指定回应。回应是否有效、材料能否支持结论，由整场论证与裁判判词说明。
        </p>
      </div>
      <div className="overview-stats">
        {[
          ['发言间引用', audit.links.length],
          ['指定质询', audit.questions.length],
          ['公共资料', config.evidence?.length || 0],
          ['待核对编号', audit.invalid.length],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="analysis-section">
        <h3>质询与回应</h3>
        {!audit.questions.length && (
          <p className="analysis-empty">
            正式赛第二轮产生指定质询；自由攻防通过正文引用关联。
          </p>
        )}
        {audit.questions.map((item) => (
          <article className="question-track" key={item.index}>
            <button
              className="ref-label"
              onClick={() => onReference(messageRef(item.index))}
            >
              [{messageRef(item.index)}]
            </button>
            <div>
              <strong>{messages[item.index].name}的质询</strong>
              <p>{messages[item.index].text}</p>
            </div>
            <button
              className={`response-status ${item.complete ? 'complete' : ''}`}
              disabled={item.answerIndex < 0}
              onClick={() => onReference(messageRef(item.answerIndex))}
            >
              {item.complete
                ? '已有完整回应'
                : item.answerIndex >= 0
                  ? '回应未正常完成'
                  : '等待回应'}
              {item.answerIndex >= 0 && (
                <small>[{messageRef(item.answerIndex)}] ↗</small>
              )}
            </button>
          </article>
        ))}
      </section>
      <section className="analysis-section">
        <h3>跨发言引用</h3>
        <p className="analysis-caption">最近 40 条显式引用，点击回到原话。</p>
        <div className="reference-threads">
          {audit.links.slice(-40).map(({ from, to }) => (
            <div className="reference-thread" key={`${from}-${to}`}>
              <button onClick={() => onReference(messageRef(from))}>
                [{messageRef(from)}] {messages[from].name}
              </button>
              <span>引用 →</span>
              <button onClick={() => onReference(messageRef(to))}>
                [{messageRef(to)}] 第{messages[to].round}轮 ·{' '}
                {messages[to].name}
              </button>
            </div>
          ))}
          {!audit.links.length && (
            <p className="analysis-empty">
              发言中引用 [M编号] 后，会在这里形成可点击的交锋线索。
            </p>
          )}
        </div>
        {audit.invalid.length > 0 && (
          <details className="invalid-references">
            <summary>{audit.invalid.length} 个编号需要核对</summary>
            {audit.invalid.map((item) => (
              <p key={`${item.from}-${item.ref}`}>
                <button onClick={() => onReference(messageRef(item.from))}>
                  [{messageRef(item.from)}]
                </button>{' '}
                引用了 [{item.ref}]，该资料不存在或该发言当时尚未出现。
              </p>
            ))}
          </details>
        )}
      </section>
      <section className="analysis-section">
        <h3>资料与引用记录</h3>
        <p className="analysis-caption">
          材料由用户提供，来源真实性及代表性仍需核实。
        </p>
        {(config.evidence || []).map((card) => (
          <article
            className="evidence-item"
            id={`evidence-${card.id}`}
            tabIndex={-1}
            key={card.id}
          >
            <div>
              <span className="ref-label">[{card.id}]</span>
              <strong>{card.title}</strong>
              <small>{EVIDENCE_LABEL[card.kind]}</small>
            </div>
            <p>{card.content}</p>
            <footer>
              <span>{card.source || '未填写出处'}</span>
              <div className="evidence-citations">
                {audit.evidenceUse.get(card.id)?.map((index) => (
                  <button
                    onClick={() => onReference(messageRef(index))}
                    key={index}
                  >
                    [{messageRef(index)}] ↗
                  </button>
                ))}
                {!audit.evidenceUse.get(card.id)?.length && (
                  <small>暂无显式引用</small>
                )}
              </div>
            </footer>
          </article>
        ))}
        {!config.evidence?.length && (
          <p className="analysis-empty">
            本场未预置资料。可在开场大厅的「赛题与规程」添加。
          </p>
        )}
      </section>
      <section className="analysis-section">
        <h3>双方公开阵容</h3>
        <div className="analysis-rosters">
          {(['pro', 'con'] as const).map((side) => (
            <div key={side}>
              <strong>{SIDE_LABEL[side]}</strong>
              {config.teams[side].slice(0, config.teamSize).map((s) => (
                <p key={s.member}>
                  {speakerName(side, s.member)}（{s.modelId}）
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
