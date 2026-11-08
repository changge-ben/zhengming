import { t, getLocale } from './i18n';
import { styleLabels } from '../shared/styles';
import { ArrowRight, Check, Clock3, FileText, Crown, DoorOpen, MessageCircle, PlugZap, Shuffle, Sparkles, Users } from 'lucide-react';
import type { DebateConfig } from '../shared/types';
import { TOPICS } from './lib';
import type { SetupModule } from './SetupDialog';
import ArenaArt from './ArenaArt';
import GettingStarted from './GettingStarted';
import { regulationRounds } from '../shared/protocol';

interface Props { showIntro: boolean; onDemo: () => void; onDismissIntro: () => void; ready: boolean; config: DebateConfig; setConfig: React.Dispatch<React.SetStateAction<DebateConfig>>; busy: boolean; onStart: () => void; onModule: (module: SetupModule) => void; onConnect: () => void; connected: number }
export default function Home({ showIntro, onDemo, onDismissIntro, ready, config, setConfig, busy, onStart, onModule, onConnect, connected }: Props) {
  const cards = [
    { id: 'case' as const, icon: FileText, title: t('赛题与规程'), value: config.protocol === 'structured' ? t('分阶段正式赛') : t('自由攻防'), text: t`${config.evidence?.length || 0} 条公共资料 · 定义、标准与举证` },
    { id: 'teams' as const, icon: Users, title: t('对战阵容'), value: `${config.teamSize} v ${config.teamSize}`, text: config.demo ? t('脚本演示 · 自由分工') : t('真实模型 · 每席独立选择') },
    { id: 'schedule' as const, icon: Clock3, title: t('发言预算'), value: config.pace === 'timed' ? t`常规 ${config.matchSeconds / 60} 分钟` : t`${config.speechChars || 400} 字 / 次`, text: config.pace === 'timed' ? t`每轮 ${config.roundSeconds / 60} 分钟 · 未决加时` : t`最长等待 ${config.thinkingSeconds || 180} 秒 · 未决加时` },
    { id: 'prep' as const, icon: DoorOpen, title: t('赛前备战'), value: config.prepSeconds ? t`${config.prepSeconds} 秒私密讨论` : t('直接开场'), text: t('自行商议战术、分工与预判') },
    { id: 'language' as const, icon: MessageCircle, title: t('表达偏好'), value: styleLabels(config, getLocale()), text: t('少点术语，多点有意思的交锋') },
    { id: 'judge' as const, icon: Crown, title: t('裁判席'), value: config.judge.enabled ? config.judge.timing === 'final' ? t('终场裁决') : t('逐轮指导') : t('暂不邀请'), text: config.judge.enabled ? t('选模型、赛制与赛后申诉') : t('也可以只靠选手分出胜负') },
    { id: 'connect' as const, icon: PlugZap, title: t('模型接入'), value: connected ? t`${connected} 个服务商已接入` : t('等待你的模型'), text: t('填写 API，接上各路大脑') },
  ];
  return <section className="home-page"><div className="home-hero"><div className="home-intro"><div className="eyebrow"><span />{t("AI 辩论场")} <i> / </i> THE AI DEBATE ARENA</div><h1>{t("让每一种观点，")}<br /><span>{t("遇见它的对手。")}</span></h1><p>{t("选择不同的智能，展开一场有分量的交锋。")}<br />{t("立论、追问、反击。直到分歧有了答案。")}</p><div className="hero-edition"><span>{t("自主战术")}</span><span>{t("整场攻防")}</span><span>{t("终局裁决")}</span></div></div><ArenaArt /></div>
    {showIntro && <GettingStarted onDemo={onDemo} onConnect={onConnect} onDismiss={onDismissIntro} disabled={busy || !ready} />}
    <div className="topic-launch">
      <div className="topic-launch-heading"><label htmlFor="home-topic">{t("今天，辩点什么？")}</label><button disabled={busy} className="text-action" onClick={() => { const pool = TOPICS.map(topic => getLocale() === 'en' ? t(topic) : topic).filter(topic => topic !== config.topic); setConfig(c => ({ ...c, topic: pool[Math.floor(Math.random() * pool.length)] })); }}><Shuffle size={14} />{t("换个灵感")}</button></div>
      <textarea id="home-topic" aria-describedby="home-topic-meta" disabled={busy} maxLength={500} value={config.topic} onChange={e => setConfig(c => ({ ...c, topic: e.target.value }))} placeholder={t("一个你总想听听不同答案的问题…")} />
      <div className="topic-meta" id="home-topic-meta">
        <span className="topic-count"><strong>{config.topic.length}</strong><span>{t("/ 500 字")}</span></span>
        <span className="topic-save-note"><Check size={14} aria-hidden="true" />{t("设置自动保存在当前浏览器")}</span>
      </div>
      <div className="launch-bottom"><span><Sparkles size={14} />{config.demo ? t('当前为脚本演示，无需 API Key') : t('使用你接入的真实模型')}</span><button className="primary-button enter-arena" disabled={!busy && !ready} onClick={onStart}>{busy ? t('返回主战场') : !ready ? t('等待服务连接') : t('进入主战场')}<ArrowRight size={19} /></button></div>
    </div>
    <p className="run-estimate">{config.pace === 'timed' ? t`常规阶段 ${config.matchSeconds / 60} 分钟，连接与思考计入等待预算。` : t`常规预计 ${2 * config.teamSize * (regulationRounds(config) + (config.protocol === 'structured' ? 1 : 0))} 次选手发言，每次最多 ${config.speechChars || 400} 字。`}{config.prepSeconds > 0 && t`另有最多 ${4 * config.teamSize} 次备战发言。`}{config.judge.enabled ? t('裁判、申诉及加时会增加调用次数。') : t('无裁判时，未认输会持续加时，可随时结束。')}{!config.demo && t('实际费用由你的模型服务商计费。')}</p>
    <div className="settings-section-heading"><span><b>{t("本场配置")}</b><small>{t("让交锋按你的方式展开")}</small></span><small>{t("点击模块调整")} <ArrowRight size={13}/></small></div><div className="setup-cards">{cards.map(({ id, icon: Icon, title, value, text }) => <button className={`setup-card ${id === 'judge' ? 'gold' : ''}`} key={id} onClick={() => id === 'connect' ? onConnect() : onModule(id)}><div className="setup-card-top"><Icon size={18} /><span>{title}</span><ArrowRight size={15} /></div><strong>{value}</strong><p>{text}</p></button>)}</div>
    <div className="home-action"><p>{busy ? t('比赛正在进行，随时回场观战。') : t('战术由选手决定，精彩留给现场。')}</p></div>
  </section>;
}
