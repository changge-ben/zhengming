import { t } from './i18n';
import { scoreDimensions, readScorecard, scoreTotal, type Scorecard } from '../shared/adjudication';

export default function ScoreTable({ value }: { value?: Scorecard }) {
  const scores = readScorecard(value);
  if (!scores) return null;
  return <section className="scorecard" aria-label={t("整场表现评分表")}><h4>{t("整场表现评分 · 满分 100")}</h4><table><thead><tr><th scope="col">{t("评分维度")}</th><th scope="col">{t("正方")}</th><th scope="col">{t("反方")}</th></tr></thead><tbody>{scoreDimensions(scores).map(d => <tr key={d.key}><th scope="row">{t(d.label)}<small> / {d.max}</small></th><td>{scores.pro[d.key]}</td><td>{scores.con[d.key]}</td></tr>)}</tbody><tfoot><tr><th scope="row">{t("总分")}</th><td>{scoreTotal(scores.pro)}</td><td>{scoreTotal(scores.con)}</td></tr></tfoot></table>{scores.tiebreak && <p>{t("同分决胜依据：")}{scores.tiebreak}</p>}<p>{t("同总分")}{scores.pro.judgeResponse !== undefined ? t("先比较裁判问题回应，再比较") : t("依次比较")}{t("自洽、攻防、严密、论据、表达。评分衡量本场表现。")}</p></section>;
}
