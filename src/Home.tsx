import { styleLabels } from '../shared/styles';
import { ArrowRight, Clock3, FileText, Crown, DoorOpen, MessageCircle, PlugZap, Shuffle, Sparkles, Users } from 'lucide-react';
import type { DebateConfig } from '../shared/types';
import { TOPICS } from './lib';
import type { SetupModule } from './SetupDialog';
import ArenaArt from './ArenaArt';

interface Props { config: DebateConfig; setConfig: React.Dispatch<React.SetStateAction<DebateConfig>>; busy: boolean; onStart: () => void; onModule: (module: SetupModule) => void; onConnect: () => void; connected: number }
export default function Home({ config, setConfig, busy, onStart, onModule, onConnect, connected }: Props) {
  const cards = [
    { id: 'case' as const, icon: FileText, title: '赛题与规程', value: config.protocol === 'structured' ? '分阶段正式赛' : '自由攻防', text: `${config.evidence?.length || 0} 条公共资料 · 定义、标准与举证` },
    { id: 'teams' as const, icon: Users, title: '对战阵容', value: `${config.teamSize} v ${config.teamSize}`, text: config.demo ? '脚本演示 · 自由分工' : '真实模型 · 每席独立选择' },
    { id: 'schedule' as const, icon: Clock3, title: '发言预算', value: config.pace === 'timed' ? `常规 ${config.matchSeconds / 60} 分钟` : `${config.speechChars || 400} 字 / 次`, text: config.pace === 'timed' ? `每轮 ${config.roundSeconds / 60} 分钟 · 未决加时` : `最长等待 ${config.thinkingSeconds || 180} 秒 · 未决加时` },
    { id: 'prep' as const, icon: DoorOpen, title: '赛前备战', value: config.prepSeconds ? `${config.prepSeconds} 秒私密讨论` : '直接开场', text: '自行商议战术、分工与预判' },
    { id: 'language' as const, icon: MessageCircle, title: '表达偏好', value: styleLabels(config), text: '少点术语，多点有意思的交锋' },
    { id: 'judge' as const, icon: Crown, title: '裁判席', value: config.judge.enabled ? config.judge.timing === 'final' ? '终场裁决' : '逐轮指导' : '暂不邀请', text: config.judge.enabled ? '选模型、赛制与赛后申诉' : '也可以只靠选手分出胜负' },
    { id: 'connect' as const, icon: PlugZap, title: '模型接入', value: connected ? `${connected} 个服务商已接入` : '等待你的模型', text: '填写 API，接上各路大脑' },
  ];
  return <section className="home-page"><div className="home-hero"><div className="home-intro"><div className="eyebrow"><span />思想交锋现场 <i> / </i> THE DEBATE ARENA</div><h1>让每一种观点，<br /><span>遇见它的对手。</span></h1><p>选择不同的智能，展开一场有分量的交锋。<br />立论、追问、反击。直到分歧有了答案。</p><div className="hero-edition"><span>自主战术</span><span>整场攻防</span><span>终局裁决</span></div></div><ArenaArt /></div>
    <div className="topic-launch"><div className="topic-launch-heading"><label htmlFor="home-topic">今天，辩点什么？</label><button disabled={busy} className="text-action" onClick={() => { const pool = TOPICS.filter(t => t !== config.topic); setConfig(c => ({ ...c, topic: pool[Math.floor(Math.random() * pool.length)] })); }}><Shuffle size={14} />换个灵感</button></div><textarea id="home-topic" disabled={busy} maxLength={500} value={config.topic} onChange={e => setConfig(c => ({ ...c, topic: e.target.value }))} placeholder="一个你总想听听不同答案的问题…" /><div className="launch-bottom"><span><Sparkles size={14} />{config.demo ? '当前为脚本演示，无需 API Key' : '使用你接入的真实模型'}</span><button className="primary-button enter-arena" onClick={onStart}>{busy ? '返回主战场' : '进入主战场'}<ArrowRight size={19} /></button></div></div>
    <div className="settings-section-heading"><span><b>本场配置</b><small>让交锋按你的方式展开</small></span><small>点击模块调整 <ArrowRight size={13}/></small></div><div className="setup-cards">{cards.map(({ id, icon: Icon, title, value, text }) => <button className={`setup-card ${id === 'judge' ? 'gold' : ''}`} key={id} onClick={() => id === 'connect' ? onConnect() : onModule(id)}><div className="setup-card-top"><Icon size={18} /><span>{title}</span><ArrowRight size={15} /></div><strong>{value}</strong><p>{text}</p></button>)}</div>
    <div className="home-action"><p>{busy ? '比赛正在进行，随时回场观战。' : '战术由选手决定，精彩留给现场。'}</p><small>{config.topic.length}/500 字 · 设置自动保存</small></div>
  </section>;
}
