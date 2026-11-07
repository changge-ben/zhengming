import { scoreDimensions, readScorecard, scoreTotal, type Scorecard } from '../shared/adjudication';

export default function ScoreTable({ value }: { value?: Scorecard }) {
  const scores = readScorecard(value);
  if (!scores) return null;
  return <section className="scorecard" aria-label="整场表现评分表"><h4>整场表现评分 · 满分 100</h4><table><thead><tr><th scope="col">评分维度</th><th scope="col">正方</th><th scope="col">反方</th></tr></thead><tbody>{scoreDimensions(scores).map(d => <tr key={d.key}><th scope="row">{d.label}<small> / {d.max}</small></th><td>{scores.pro[d.key]}</td><td>{scores.con[d.key]}</td></tr>)}</tbody><tfoot><tr><th scope="row">总分</th><td>{scoreTotal(scores.pro)}</td><td>{scoreTotal(scores.con)}</td></tr></tfoot></table>{scores.tiebreak && <p>同分决胜依据：{scores.tiebreak}</p>}<p>同总分{scores.pro.judgeResponse !== undefined ? "先比较裁判问题回应，再比较" : "依次比较"}自洽、攻防、严密、论据、表达。评分衡量本场表现。</p></section>;
}
