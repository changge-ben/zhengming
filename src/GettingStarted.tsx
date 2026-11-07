import { ArrowRight, Play, PlugZap, X } from 'lucide-react';

export default function GettingStarted({
  onDemo,
  onConnect,
  onDismiss,
  disabled,
}: {
  onDemo: () => void;
  onConnect: () => void;
  onDismiss: () => void;
  disabled: boolean;
}) {
  return (
    <section className="getting-started" aria-label="第一次使用">
      <div>
        <span className="eyebrow">START HERE</span>
        <h2>第一场，从这里开始。</h2>
        <p>
          先看一场无需密钥的短演示，再接入你的模型。阵容、赛程与表达风格都可以慢慢调整。
        </p>
      </div>
      <div className="getting-started-actions">
        <button className="primary-button" disabled={disabled} onClick={onDemo}>
          <Play size={15} />
          先看一场演示
        </button>
        <button className="text-action" onClick={onConnect}>
          <PlugZap size={15} />
          接入我的模型
          <ArrowRight size={14} />
        </button>
      </div>
      <button
        className="icon-button getting-started-close"
        aria-label="收起入门提示"
        onClick={onDismiss}
      >
        <X size={15} />
      </button>
    </section>
  );
}
