import { t } from './i18n';
import { useState } from 'react';
import { ArrowUpRight, FileText, Plus, Trash2 } from 'lucide-react';
import type { DebateConfig } from '../shared/types';
import {
  EMPTY_BRIEF,
  EVIDENCE_LABEL,
  MOTION_LABEL,
  regulationRounds,
  type DebateBrief,
  type EvidenceCard,
} from '../shared/protocol';
import { evidenceSchema } from '../shared/caseSchema';

interface Props {
  config: DebateConfig;
  onChange: React.Dispatch<React.SetStateAction<DebateConfig>>;
}
const briefFields = [
  ['definitions', '概念定义', '关键概念怎么理解，哪些说法容易混淆'],
  ['scope', '讨论范围', '适用人群、时间范围、比较对象与排除条件'],
  ['criterion', '比较标准', '凭什么判断更好，冲突时如何权衡'],
  ['proBurden', '正方举证责任', '正方需要建立哪些主张与推导'],
  ['conBurden', '反方举证责任', '反方需要质疑什么，是否承担替代方案责任'],
] as const;
const blankCard = (): EvidenceCard => ({
  id: '',
  title: '',
  kind: 'source',
  content: '',
  source: '',
});

export default function CaseSetup({ config, onChange }: Props) {
  const brief = config.brief || EMPTY_BRIEF;
  const cards = config.evidence || [];
  const [draft, setDraft] = useState<EvidenceCard | null>(null);
  const [error, setError] = useState('');
  function updateBrief(key: keyof DebateBrief, value: string) {
    onChange((current) => ({
      ...current,
      brief: { ...(current.brief || EMPTY_BRIEF), [key]: value },
    }));
  }
  function saveCard() {
    if (!draft) return;
    const id =
      draft.id ||
      `E${Math.max(0, ...cards.map((card) => Number(card.id.slice(1)))) + 1}`;
    const card = { ...draft, id };
    const next = draft.id
      ? cards.map((item) => (item.id === id ? card : item))
      : [...cards, card];
    const parsed = evidenceSchema.safeParse(next);
    if (!parsed.success) {
      setError(t('请填写资料标题与内容，每条内容最多 2400 字，最多 12 条资料。'));
      return;
    }
    onChange((current) => ({ ...current, evidence: parsed.data }));
    setDraft(null);
    setError('');
  }
  return (
    <div className="case-setup">
      <div className="choice-stack" aria-label={t("比赛规程")}>
        <button
          className={`choice ${config.protocol !== 'structured' ? 'selected' : ''}`}
          aria-pressed={config.protocol !== 'structured'}
          onClick={() => onChange((c) => ({ ...c, protocol: 'arena' }))}
        >
          <strong>{t("自由攻防")}</strong>
          <span>{t("双方轮流发言，开放决定战术与交锋路线。")}</span>
        </button>
        <button
          className={`choice ${config.protocol === 'structured' ? 'selected' : ''}`}
          aria-pressed={config.protocol === 'structured'}
          onClick={() =>
            onChange((c) => ({
              ...c,
              protocol: 'structured',
              pace: 'length',
              maxRounds: Math.max(4, c.maxRounds || 4),
            }))
          }
        >
          <strong>{t("分阶段正式赛")}</strong>
          <span>
            {t("独立立论 → 双向质询 → 争点攻防 → 总结陈词。每位辩手均有提问与作答机会，首发方逐轮轮换。")}</span>
        </button>
      </div>
      {config.protocol === 'structured' && (
        <p className="case-callout">
          {t("常规")} {regulationRounds(config)}  {t("轮 ·")}{' '}
          {2 * config.teamSize * (regulationRounds(config) + 1)}{' '}
          {t("次选手发言。使用独立等待预算，完整走完赛程后裁决；可在「发言预算」调整轮数。独立立论互不可见，第二轮起读取整场记录。")}</p>
      )}
      <section className="case-section">
        <div className="case-section-heading">
          <span>01</span>
          <div>
            <h3>{t("把命题说清楚")}</h3>
            <p>{t("可选填写。公开约定供双方、备战和裁判共同使用。")}</p>
          </div>
        </div>
        <label className="module-field">
          {t("命题类型")}<select
            aria-label={t("命题类型")}
            value={brief.kind}
            onChange={(e) => updateBrief('kind', e.target.value)}
          >
            {Object.entries(MOTION_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <div className="brief-fields">
          {briefFields.map(([key, label, placeholder]) => (
            <label key={key} className="module-field">
              {t(label)}
              <textarea
                aria-label={t(label)}
                rows={2}
                maxLength={1200}
                value={brief[key]}
                placeholder={t(placeholder)}
                onChange={(e) => updateBrief(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="case-section">
        <div className="case-section-heading">
          <span>02</span>
          <div>
            <h3>{t("公共资料库")}</h3>
            <p>{t("同一份资料，同等知情。保留出处，并区分材料、实例和假设。")}</p>
          </div>
          <small>{cards.length}/12</small>
        </div>
        <div className="evidence-list">
          {cards.map((card) => (
            <article className="evidence-item" key={card.id}>
              <div>
                <span className="ref-label">[{card.id}]</span>
                <strong>{card.title}</strong>
                <small>{t(EVIDENCE_LABEL[card.kind])}</small>
              </div>
              <p>{card.content}</p>
              <footer>
                <span>{card.source || t('未填写出处')}</span>
                <button
                  className="text-action"
                  onClick={() => {
                    setDraft({ ...card });
                    setError('');
                  }}
                >
                  {t("编辑")}<ArrowUpRight size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t`移除资料 ${card.id}`}
                  onClick={() => {
                    onChange((c) => ({
                      ...c,
                      evidence: (c.evidence || []).filter(
                        (item) => item.id !== card.id
                      ),
                    }));
                    if (draft?.id === card.id) setDraft(null);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </footer>
            </article>
          ))}
        </div>
        {!cards.length && !draft && (
          <div className="case-empty">
            <FileText size={23} />
            <p>{t("可以先放入几条材料，让论证有据可循。")}</p>
          </div>
        )}
        {draft ? (
          <div className="evidence-editor">
            <h4>{draft.id ? t`编辑 [${draft.id}]` : t('添加资料')}</h4>
            <label className="module-field">
              {t("资料标题")}<input
                aria-label={t("资料标题")}
                maxLength={120}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="module-field">
              {t("资料类型")}<select
                aria-label={t("资料类型")}
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as EvidenceCard['kind'],
                  })
                }
              >
                {Object.entries(EVIDENCE_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="module-field">
              {t("内容与适用边界")}<textarea
                aria-label={t("内容与适用边界")}
                rows={4}
                maxLength={2400}
                value={draft.content}
                onChange={(e) =>
                  setDraft({ ...draft, content: e.target.value })
                }
              />
            </label>
            <label className="module-field">
              {t("出处、日期或链接")}<input
                aria-label={t("出处、日期或链接")}
                maxLength={1000}
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder={t("填写原文摘要及出处，模型只会收到这里写下的内容")}
              />
            </label>
            {error && <p role="alert">{t(error)}</p>}
            <div className="evidence-editor-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setDraft(null);
                  setError('');
                }}
              >
                {t("取消")}</button>
              <button className="primary-button" onClick={saveCard}>
                {t("保存资料")}</button>
            </div>
          </div>
        ) : (
          <button
            className="secondary-button"
            disabled={cards.length >= 12}
            onClick={() => {
              setDraft(blankCard());
              setError('');
            }}
          >
            <Plus size={15} />
            {t("添加公共资料")}</button>
        )}
        <p className="module-note">
          {t("资料随本场存档并写入导出文件。来源材料标为待核实，系统不会自动访问链接或核验事实。每条资料可用 [E编号] 引用。")}</p>
      </section>
    </div>
  );
}
