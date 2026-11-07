import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleHelp, Eye, EyeOff, KeyRound, LoaderCircle, PlugZap, Plus, RefreshCw, Save, Server, X } from 'lucide-react';
import type { Provider } from '../shared/types';
import { api } from './lib';

interface Props { providers: Provider[]; onClose: () => void; onUpdate: (providers: Provider[]) => void }

export default function Settings({ providers, onClose, onUpdate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(providers[0]?.id || 'deepseek');
  const provider = providers.find(p => p.id === selected);
  const [draft, setDraft] = useState<Provider | null>(provider ? { ...provider } : null);
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [rememberKey, setRememberKey] = useState(Boolean(provider?.hasSavedKey));
  const [modelsText, setModelsText] = useState(provider?.models.join('\n') || '');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'create' | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [discovered, setDiscovered] = useState<string[]>([]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const p = providers.find(p => p.id === selected);
    setDraft(p ? { ...p } : null); setModelsText(p?.models.join('\n') || ''); setKey(''); setClearKey(false); setRememberKey(Boolean(p?.hasSavedKey)); setShowKey(false); setFeedback(null); setDiscovered([]);
  }, [selected]);

  async function addProvider() {
    setBusy('create'); setFeedback(null);
    try {
      const data = await api<{ id: string; providers: Provider[] }>('/api/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `自定义接口 ${providers.filter(p => p.id.startsWith('custom')).length + 1}`, baseUrl: 'http://localhost:11434/v1', protocol: 'openai', tokenParameter: 'max_tokens', models: [] }) });
      onUpdate(data.providers); setSelected(data.id);
    } catch (error) { setFeedback({ text: (error as Error).message, error: true }); }
    finally { setBusy(null); }
  }

  async function save(test = false) {
    if (!draft) return;
    setBusy(test ? 'test' : 'save'); setFeedback(null);
    try {
      const models = [...new Set(modelsText.split(/[\n,，]/).map(s => s.trim()).filter(Boolean))];
      const data = await api<{ providers: Provider[] }>(`/api/providers/${selected}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: draft.name, baseUrl: draft.baseUrl.trim(), protocol: draft.protocol, tokenParameter: draft.tokenParameter, models, ...(key ? { apiKey: key } : {}), clearKey, rememberKey }) });
      const saved = data.providers.find(p => p.id === selected)!;
      onUpdate(data.providers); setDraft(saved); setRememberKey(Boolean(saved.hasSavedKey)); setKey(''); setClearKey(false);
      if (test) {
        const result = await api<{ message: string; models: string[] }>(`/api/providers/${selected}/test`, { method: 'POST' });
        setDiscovered(result.models); setFeedback({ text: result.message });
      } else setFeedback({ text: saved.hasSavedKey ? '配置已保存，密钥已在本机加密记住，重启服务后自动恢复。' : saved.hasKey ? '配置已保存，密钥仅本次使用；勾选“记住 API Key”可在重启后自动恢复。' : '配置已保存。当前没有密钥，本地免密接口仍可使用。' });
    } catch (error) { setFeedback({ text: (error as Error).message, error: true }); }
    finally { setBusy(null); }
  }

  return <dialog className="settings-dialog" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="dialog-header"><div className="dialog-icon"><PlugZap size={21} /></div><div><h2>给辩手接上大脑</h2><p>你的模型，你的擂台。</p></div><button className="icon-button close-dialog" onClick={onClose} aria-label="关闭模型设置"><X size={20} /></button></div>
    <div className="settings-layout">
      <div className="provider-nav"><span className="eyebrow">模型服务商</span>{providers.map(p => <button key={p.id} disabled={!!busy} className={`provider-nav-item ${selected === p.id ? 'selected' : ''}`} onClick={() => setSelected(p.id)}><span className={`provider-symbol ${p.id}`}>{p.id === 'deepseek' ? 'D' : p.id === 'openai' ? '◎' : p.id === 'qwen' ? 'Q' : p.id === 'anthropic' ? '✳' : '⌘'}</span><span>{p.name}</span>{p.hasKey ? <CheckCircle2 size={13} className="connected-icon" /> : <ChevronRight size={13} />}</button>)}<button className="provider-nav-item" disabled={!!busy} onClick={() => void addProvider()}><Plus size={17} /><span>新增自定义入口</span></button><div className="provider-note"><Server size={17} /><span>也支持 Ollama、LM Studio 和兼容接口的中转服务。</span></div></div>
      <div className="provider-form">{draft ? <>
        <div className="provider-heading"><div><h3>{draft.name}</h3><p>{draft.hasKey ? draft.hasSavedKey ? '密钥已配置 · 本机加密保存' : '密钥已配置 · 本次服务有效' : draft.hasSavedKey ? '已存密钥未能恢复，请重新填写或使用原 Windows 账户' : '填写 API 信息后，即可加入辩论'}</p></div><span className={`connection-tag ${draft.hasKey ? 'connected' : ''}`}><span />{draft.hasKey ? '已配置' : '待接入'}</span></div>
        <div className="field"><label htmlFor="provider-name">显示名称</label><input id="provider-name" value={draft.name} maxLength={60} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="provider-protocol">接口协议 <span>按你的服务商文档选择</span></label><select id="provider-protocol" value={draft.protocol} onChange={e => setDraft({ ...draft, protocol: e.target.value as Provider['protocol'] })}><option value="openai">OpenAI 兼容 · Chat Completions</option><option value="anthropic">Anthropic · Messages</option></select></div>
        <div className="field"><label htmlFor="provider-url">Base URL <span>不包含 /chat/completions 或 /messages</span></label><input id="provider-url" type="url" spellCheck={false} value={draft.baseUrl} placeholder="https://your-api.com/v1" onChange={e => setDraft({ ...draft, baseUrl: e.target.value })} /></div>
        <div className="field"><label htmlFor="provider-key">API Key <KeyRound size={12} /></label><div className="password-field"><input id="provider-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={key} placeholder={draft.hasKey ? '已配置，留空保留现有密钥' : 'sk-…（本地模型可留空）'} onChange={e => setKey(e.target.value)} /><button type="button" className="icon-button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><label className="checkbox-label"><input type="checkbox" checked={rememberKey} disabled={!draft.canRememberKey || clearKey || !!busy} onChange={e => setRememberKey(e.target.checked)} />记住 API Key（本机加密，重启自动恢复）</label>{(draft.hasKey || draft.hasSavedKey) && <label className="checkbox-label"><input type="checkbox" checked={clearKey} onChange={e => setClearKey(e.target.checked)} />清除当前密钥</label>}</div>
        <div className="field"><label htmlFor="provider-models">模型 ID <span>每行一个，可添加多个</span></label><textarea id="provider-models" className="models-textarea" value={modelsText} spellCheck={false} placeholder={'填写服务商实际提供的模型 ID\n例如：deepseek-chat'} onChange={e => setModelsText(e.target.value)} /></div>
        {discovered.length > 0 && <div className="discovered-models"><span>从接口发现的模型 · 点击添加</span><div>{discovered.slice(0, 40).map(model => <button key={model} onClick={() => { const list = modelsText.split('\n').map(s => s.trim()); if (!list.includes(model)) setModelsText([...list.filter(Boolean), model].join('\n')); }}><span>+</span>{model}</button>)}</div><small>添加后请再次保存。{discovered.length > 40 ? '仅显示前 40 个，也可手动填写其他 ID。' : ''}</small></div>}
        {draft.protocol === 'openai' && <div className="field"><label htmlFor="token-param">输出长度参数 <span>接口不兼容时可调整</span></label><select id="token-param" value={draft.tokenParameter} onChange={e => setDraft({ ...draft, tokenParameter: e.target.value as Provider['tokenParameter'] })}><option value="max_tokens">max_tokens（多数兼容接口）</option><option value="max_completion_tokens">max_completion_tokens（OpenAI）</option><option value="none">不传此参数</option></select></div>}
        {feedback && <div className={`settings-feedback ${feedback.error ? 'error' : ''}`} role="status">{feedback.error ? <CircleHelp size={16} /> : <Check size={16} />}<span>{feedback.text}</span></div>}
        <div className="key-info"><KeyRound size={14} /><p>{draft.canRememberKey ? '勾选后通过 Windows 账户加密保存在本机，不回传密钥、不写入浏览器。取消勾选并保存，可移除已存密钥，仅保留本次使用；“清除当前密钥”会同时清除本次和已存密钥。' : '当前系统暂不支持本机加密记住。密钥仅本次使用，长期配置可使用项目的 .env 文件。'}</p></div>
        <div className="settings-actions"><button className="secondary-button" disabled={!!busy} onClick={() => void save(true)}>{busy === 'test' ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}保存并测试</button><button className="primary-button" disabled={!!busy} onClick={() => void save()}>{busy === 'save' ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}保存配置<ArrowUpRight size={15} /></button></div>
      </> : <div className="no-providers"><LoaderCircle className="spin" />本地模型服务尚未连接。请关闭设置并稍后重试。</div>}</div>
    </div>
  </dialog>;
}
