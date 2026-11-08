import { t, useLocale, dateLocale } from './i18n';
import LanguageSwitch from './LanguageSwitch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CircleHelp, History, Home as HomeIcon, PlugZap, RotateCcw, Square, Swords, Trophy, X } from 'lucide-react';
import type { DebateConfig, Match, Provider } from '../shared/types';
import { scoreEntry, type ScoreEntry } from '../shared/statistics';
import { api, DEFAULT_CONFIG, exportMatch, loadConfig, loadMatches, loadScorebook, modelOptions } from './lib';
import { useDebate } from './useDebate';
import Settings from './Settings';
import Home from './Home';
import SetupDialog, { type SetupModule } from './SetupDialog';
import Battle from './Battle';
import Records from './Records';
import { clearCheckpoint, loadCheckpoint } from './recovery';

type Page = 'home' | 'arena' | 'history' | 'records' | 'guide';
const pages: { id: Page; label: string; icon: typeof HomeIcon }[] = [{ id: 'home', label: '开场大厅', icon: HomeIcon }, { id: 'arena', label: '主战场', icon: Swords }, { id: 'records', label: '模型战绩', icon: Trophy }, { id: 'history', label: '辩论档案', icon: History }, { id: 'guide', label: '玩法指南', icon: BookOpen }];
function currentPage(): Page { const value = location.hash.replace('#/', ''); return pages.some(p => p.id === value) ? value as Page : 'home'; }

export default function Workspace() {
  const locale = useLocale();
  useEffect(() => { document.documentElement.lang = locale; document.title = t('争鸣 · AI 辩论场'); }, [locale]);
  const [page, setPage] = useState<Page>(currentPage);
  const [config, setConfig] = useState<DebateConfig>(loadConfig);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [serverError, setServerError] = useState('');
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(false);
  const [module, setModule] = useState<SetupModule | null>(null);
  const [matches, setMatches] = useState<Match[]>(loadMatches);
  const [scorebook, setScorebook] = useState<ScoreEntry[]>(loadScorebook);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [recoveredMatch] = useState(loadCheckpoint);
  const [showRecovery, setShowRecovery] = useState(Boolean(recoveredMatch));
  const [removed, setRemoved] = useState<Match | null>(null);
  const [showIntro, setShowIntro] = useState(() => { try { return localStorage.getItem('zhengming-onboarding-dismissed') !== '1' && loadMatches().length === 0; } catch { return true; } });
  const refreshInFlight = useRef(false);
  const initialMatchIds = useRef(new Set(matches.map(match => match.id)));
  const visibleMatches = matches.filter(m => m.config.topic.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function dismissIntro() { setShowIntro(false); try { localStorage.setItem('zhengming-onboarding-dismissed', '1'); } catch { /* Optional preference. */ } }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string) => { setToast(text); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 4500); }, []);
  const save = useCallback((match: Match) => {
    setMatches(previous => { const next = [match, ...previous.filter(m => m.id !== match.id)].slice(0, 20); try { localStorage.setItem('zhengming-history', JSON.stringify(next)); clearCheckpoint(match.id); } catch { notify(t('档案存储空间不足，请导出本场记录。')); } return next; });
    setScorebook(previous => { const next = [scoreEntry(match), ...previous.filter(m => m.id !== match.id)]; try { localStorage.setItem('zhengming-scorebook', JSON.stringify(next)); } catch { notify(t('战绩保存失败，请检查浏览器存储。')); } return next; });
  }, [notify]);
  const debate = useDebate(save);
  const busy = ['running', 'paused', 'pausing'].includes(debate.status);
  const options = useMemo(() => modelOptions(providers), [providers, locale]);
  const navigate = useCallback((next: Page) => { location.hash = `/${next === 'home' ? '' : next}`; setPage(next); window.scrollTo(0, 0); }, []);
  const refresh = useCallback(async () => { if (refreshInFlight.current) return; refreshInFlight.current = true; try { const result = await api<{ providers: Provider[] }>('/api/providers'); setProviders(result.providers); setReady(true); setServerError(''); } catch (error) { setReady(false); setServerError((error as Error).message); } finally { refreshInFlight.current = false; } }, []);
  useEffect(() => { void refresh(); const onHash = () => setPage(currentPage()); window.addEventListener('hashchange', onHash); return () => { window.removeEventListener('hashchange', onHash); if (timer.current) clearTimeout(timer.current); }; }, [refresh]);
  useEffect(() => {
    if (!recoveredMatch) return;
    if (initialMatchIds.current.has(recoveredMatch.id)) { clearCheckpoint(recoveredMatch.id); setShowRecovery(false); return; }
    save(recoveredMatch);
  }, [recoveredMatch, save]);
  useEffect(() => {
    if (settings) return;
    const timer = window.setInterval(() => void refresh(), ready ? 30000 : 5000);
    const reconnect = () => void refresh();
    window.addEventListener('online', reconnect); window.addEventListener('focus', reconnect);
    return () => { clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect); };
  }, [settings, ready, refresh]);
  useEffect(() => {
    const persist = () => { try { localStorage.setItem('zhengming-config', JSON.stringify(config)); } catch { /* Browser storage may be unavailable. */ } };
    const timer = setTimeout(persist, 300);
    window.addEventListener('pagehide', persist);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', persist); };
  }, [config]);
  useEffect(() => { if (!busy) return; const handler = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [busy]);
  function start() {
    if (busy) { navigate('arena'); return; }
    if (!ready) { notify(t('请先重新连接本地服务。')); return; }
    if (config.topic.trim().length < 5) { notify(t('请写一个至少 5 个字的辩题。')); document.getElementById('home-topic')?.focus(); return; }
    if (!config.demo) {
      const actors = [...config.teams.pro.slice(0, config.teamSize), ...config.teams.con.slice(0, config.teamSize), ...(config.judge.enabled ? [{ ...config.judge, name: t('裁判') }] : [])];
      const missing = actors.find(s => !options.find(o => o.providerId === s.providerId && o.modelId === s.modelId)?.available);
      if (missing) { notify(t`${t(missing.name)}的模型尚未接入，请检查 API 配置与阵容。`); setSettings(true); return; }
    }
    dismissIntro(); navigate('arena'); void debate.start({ ...config, locale, topic: config.topic.trim(), maxRounds: config.pace === 'timed' ? config.maxRounds : config.maxRounds || 3 });
  }
  function demo() {
    if (busy || !ready) return;
    const sample = structuredClone(DEFAULT_CONFIG);
    sample.prepSeconds = 0; sample.locale = locale; sample.topic = t(DEFAULT_CONFIG.topic);
    dismissIntro(); navigate('arena'); void debate.start(sample);
  }
  function remove(id: string) {
    const removedMatch = matches.find(match => match.id === id);
    const next = matches.filter(match => match.id !== id);
    try { localStorage.setItem('zhengming-history', JSON.stringify(next)); setMatches(next); setRemoved(removedMatch || null); }
    catch { notify(t('档案删除未能保存，请检查浏览器存储。')); }
  }
  function undoRemove() {
    if (!removed) return;
    const next = [removed, ...matches.filter(match => match.id !== removed.id)].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    try { localStorage.setItem('zhengming-history', JSON.stringify(next)); setMatches(next); setRemoved(null); }
    catch { notify(t('档案恢复未能保存，请检查浏览器存储。')); }
  }

  return <div className="app-shell redesigned">
    <aside className="sidebar"><button className="brand" aria-label={t("争鸣 · AI 辩论场首页")} onClick={() => navigate('home')}><span className="new-brand">{t("鸣")}</span><div><strong>{t("争鸣")}</strong><small>{t("AI 辩论场")}</small></div></button><div className="sidebar-section-label">{t("独 立 思 考 · 自 由 交 锋")}</div><nav className="main-nav" aria-label={t("主导航")}>{pages.map(({ id, label, icon: Icon }, index) => <button key={id} aria-label={t(label)} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={18} /><span>{t(label)}</span><small className="nav-index">0{index + 1}</small>{id === 'arena' && busy && <span className="nav-dot" />}</button>)}</nav><div className="sidebar-divider" /><button className="sidebar-models" aria-label={t("模型接入")} onClick={() => setSettings(true)}><PlugZap size={18} /><span>{t("模型接入")}</span></button><div className="sidebar-bottom"><p>{t("让思想相遇，")}<br />{t("让观点交锋。")}</p><div className="sidebar-version"><span>{t("争鸣 · AI 辩论场")}</span><span>03</span></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">{t("争鸣")}<span>/</span><strong>{t(pages.find(p => p.id === page)!.label)}</strong></div><div className="topbar-actions"><LanguageSwitch />{busy && <button className="secondary-button stop-match global-stop" onClick={debate.stop}><Square size={14} />{t("结束比赛")}</button>}{busy && page !== 'arena' && <button className="live-return" onClick={() => navigate('arena')}><span className="live-dot is-live" />{t("返回正在进行的比赛")}</button>}{ready ? <span className="server-status"><span />{t("本地服务就绪")}</span> : <button className="server-retry" onClick={() => void refresh()}><RotateCcw size={13} />{t("重新连接")}</button>}</div></header>
      <main className="main-content">{serverError && <div className="server-error" role="alert"><CircleHelp size={16} />{t(serverError)}</div>}
        {showRecovery && recoveredMatch && <div className="recovery-banner" role="status"><div><strong>{t("已找回上次尚未归档的比赛")}</strong><p>{t(recoveredMatch.result.detail)}</p></div><button className="secondary-button" disabled={busy} onClick={() => { debate.view(recoveredMatch); navigate('arena'); setShowRecovery(false); }}>{t("查看记录")}<ArrowRight size={14} /></button><button className="icon-button" aria-label={t("收起恢复提示")} onClick={() => setShowRecovery(false)}><X size={15} /></button></div>}
        {page === 'home' && <Home showIntro={showIntro} onDemo={demo} onDismissIntro={dismissIntro} ready={ready} config={config} setConfig={setConfig} busy={busy} onStart={start} onModule={setModule} onConnect={() => setSettings(true)} connected={new Set(options.filter(option => option.available).map(option => option.providerId)).size} />}
        {page === 'arena' && <Battle debate={debate} onHome={() => navigate('home')} notify={notify} />}
        {page === 'records' && <Records entries={scorebook} providers={providers} />}
        {page === 'history' && <section className="content-page"><div className="simple-heading"><span className="eyebrow">THE ARCHIVE</span><h1>{t("每场交锋，都有迹可循。")}</h1><p>{t("最近 20 场完整档案；删除档案不会抹去累计模型战绩。")}</p></div><div className="archive-search"><History size={18} /><input aria-label={t("搜索辩论档案")} placeholder={t("搜索辩题…")} value={query} onChange={e => setQuery(e.target.value)} /><span>{query.trim() ? `${visibleMatches.length} / ${matches.length}` : matches.length}  {t("场")}</span></div>{removed && <div className="archive-undo" role="status"><span>{t("已移出档案 ·")} {removed.config.topic}</span><button className="text-action" onClick={undoRemove}>{t("撤销删除")}</button></div>}<div className="new-archive-grid">{visibleMatches.map(m => <article className="new-archive-card" key={m.id}><div><span>{m.config.demo ? t('脚本演示') : t('真实模型')} · {m.config.teamSize}v{m.config.teamSize}</span><time>{new Date(m.createdAt).toLocaleString(dateLocale())}</time></div><h2>{m.config.topic}</h2><p>{t(m.result.detail)}</p><footer><button disabled={busy} className="secondary-button" onClick={() => { debate.view(m); navigate('arena'); }}>{t("重看比赛")}<ArrowRight size={14} /></button><button className="text-action" onClick={() => exportMatch(m)}>{t("导出")}</button><button className="icon-button" aria-label={t`删除档案：${m.config.topic}`} onClick={() => remove(m.id)}><X size={15} /></button></footer></article>)}</div>{!visibleMatches.length && <div className="quiet-empty">{query.trim() ? <>{t("没有找到匹配的辩题。")}<button className="text-action" onClick={() => setQuery('')}>{t("清空搜索")}</button></> : t('还没有档案。第一场交锋，等你出题。')}</div>}</section>}
        {page === 'guide' && <section className="content-page"><div className="simple-heading"><span className="eyebrow">HOW TO PLAY</span><h1>{t("把话筒交给 AI。")}</h1><p>{t("你负责出题，它们负责把分歧讲明白。")}</p><button className="secondary-button" disabled={busy || !ready} onClick={demo}>{t("先看一场演示")}<ArrowRight size={14} /></button></div><div className="help-grid">{[
          [t('01 · 大厅布置'), t('输入辩题，点击设置卡片挑选阵容、时间与语言偏好。没有人设或思维派别限制，战术由模型自己决定。')],
          [t('02 · 赛题与规程'), t('可选择自由攻防或分阶段正式赛。正式赛按独立立论、双向质询、争点攻防、总结陈词推进；填写定义、范围、比较标准与举证责任，可添加带出处的公共资料。')],
          [t('03 · 赛前更衣室'), t('可选 30～180 秒独立备战，双方同时商议。每名模型只收到本队准备，观众可以查看两个房间。备战不占正式比赛时间。')],
          [t('04 · 极限攻防'), t('双方轮流出招。一辩作为队长，可以在完整发言后代表本队认输。默认按正文字数限制，每位选手都可独立等待 180 秒，不再平分整轮时间。字数与等待上限均可设置。')],
          [t('05 · 裁判席'), t('默认比赛中保持沉默；常规阶段结束后才裁决，未分胜负则加时一轮再评，完整三轮仍未决就按整场表现评分决胜。可选裁判指导赛，逐轮点评。双方在每次裁决中各有一次申诉机会；改判后新败方同样可申诉。双方都申诉成功则完整加时一轮，再重新裁决。')],
          [t('06 · 观众与暂停'), t('在主战场提问，下一位选手会收到。暂停在当前发言或当前备战讨论结束后生效；停止立即取消连接并保存已有内容。页面内切换不会中断比赛。')],
          [t('07 · 交锋索引'), t('每条正式消息带有 M 编号，公共资料带有 E 编号。点击正文引用可回到依据；交锋索引追踪指定质询与回答，显示跨轮引用和无效编号。引用表示关联，论证效果需结合具体内容判断。')],
          [t('08 · 战绩与数据'), t('战绩保存在当前浏览器，真实与演示默认分开。同模型多个席位按队计一次，两边都有则记自我对战。未分胜负、平局与中止分别处理。裁判需要单独选择实际调用的模型。')],
        ].map(([title, body]) => <article className="help-card" key={title}><h2>{title}</h2><p>{body}</p></article>)}</div><p className="subtle-notice">{t("演示为预设脚本，不代表真实模型能力。清理浏览器数据会丢失本地档案与战绩，重要比赛请导出。")}</p></section>}
      </main>
    </div>
    {module && <SetupDialog module={module} config={config} onChange={setConfig} options={options} disabled={busy} onClose={() => setModule(null)} onConnect={() => { setModule(null); setSettings(true); }} />}
    {settings && <Settings providers={providers} onUpdate={setProviders} onClose={() => setSettings(false)} />}
    {toast && <div className="toast" role="status"><CircleHelp size={16} /><span>{t(toast)}</span><button aria-label={t("关闭提示")} onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}
