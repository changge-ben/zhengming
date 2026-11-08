import { t } from './i18n';
import { useId, useRef, useState } from 'react';

/** An abstract conversation, drawn entirely in SVG. No model activity is implied. */
export default function ArenaArt() {
  const id = useId().replace(/:/g, '');
  const [paused, setPaused] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  function resetPosition() {
    surface.current?.style.setProperty('--sculpture-x', '0px');
    surface.current?.style.setProperty('--sculpture-y', '0px');
  }
  return <div ref={surface} className={`discourse-sculpture ${paused ? 'is-paused' : ''}`} onPointerMove={e => {
    if (paused || e.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--sculpture-x', `${((e.clientX - box.left) / box.width - .5) * 10}px`);
    e.currentTarget.style.setProperty('--sculpture-y', `${((e.clientY - box.top) / box.height - .5) * 8}px`);
  }} onPointerLeave={resetPosition}>
    <div className="sculpture-caption"><span>THE SPACE BETWEEN</span><span>01 — 02</span></div>
    <svg viewBox="0 0 520 290" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-a`} cx=".28" cy=".25" r=".85"><stop stopColor="#998363" stopOpacity=".25"/><stop offset="1" stopColor="#998363" stopOpacity=".015"/></radialGradient>
        <radialGradient id={`${id}-b`} cx=".7" cy=".3" r=".8"><stop stopColor="#779A9B" stopOpacity=".22"/><stop offset="1" stopColor="#779A9B" stopOpacity=".015"/></radialGradient>
        <linearGradient id={`${id}-line`}><stop stopColor="#c8ae82" stopOpacity="0"/><stop offset=".5" stopColor="#c8ae82" stopOpacity=".7"/><stop offset="1" stopColor="#7caaad" stopOpacity="0"/></linearGradient>
        <clipPath id={`${id}-clip-a`}><circle cx="169" cy="140" r="76"/></clipPath>
        <clipPath id={`${id}-clip-b`}><circle cx="351" cy="140" r="76"/></clipPath>
      </defs>
      <path d="M31 248H489M260 33V252" stroke="#d5c4a1" strokeOpacity=".09"/>
      <path d="M48 140H472" stroke={`url(#${id}-line)`}/>
      <path className="sculpture-transmission transmission-gold" d="M45 187C110 237 171 39 260 140" stroke="#d3b87f" strokeWidth="1.4"/>
      <path className="sculpture-transmission transmission-teal" d="M475 93C410 43 349 241 260 140" stroke="#91c5c7" strokeWidth="1.4"/>
      <g className="sculpture-orbit"><ellipse cx="260" cy="140" rx="225" ry="101" stroke="#b8ab94" strokeOpacity=".14" strokeDasharray="2 7"/></g>
      <g className="sculpture-left">
        <circle cx="169" cy="140" r="76" fill={`url(#${id}-a)`} stroke="#b79b72" strokeOpacity=".8"/>
        <g clipPath={`url(#${id}-clip-a)`} stroke="#b79b72" strokeOpacity=".35">
          {[20,42,62].map(n=><ellipse key={n} cx="169" cy="140" rx={n} ry="76"/>)}
          {[-51,-27,0,27,51].map(n=><ellipse key={n} cx="169" cy={140+n} rx="76" ry={18-Math.abs(n)/5}/>)}
        </g>
        <ellipse cx="169" cy="140" rx="94" ry="25" stroke="#d5b57c" strokeOpacity=".55" transform="rotate(-34 169 140)"/>
        <circle className="sculpture-point" cx="99" cy="191" r="3" fill="#e0bf8b"/>
      </g>
      <g className="sculpture-right">
        <circle cx="351" cy="140" r="76" fill={`url(#${id}-b)`} stroke="#7eaaac" strokeOpacity=".8"/>
        <g clipPath={`url(#${id}-clip-b)`} stroke="#7eaaac" strokeOpacity=".35">
          {[20,42,62].map(n=><ellipse key={n} cx="351" cy="140" rx={n} ry="76"/>)}
          {[-51,-27,0,27,51].map(n=><ellipse key={n} cx="351" cy={140+n} rx="76" ry={18-Math.abs(n)/5}/>)}
        </g>
        <ellipse cx="351" cy="140" rx="94" ry="25" stroke="#9fc7c8" strokeOpacity=".55" transform="rotate(34 351 140)"/>
        <circle className="sculpture-point" cx="420" cy="190" r="3" fill="#a5d2d2"/>
      </g>
      <g className="sculpture-core"><path d="M260 109v62M249 140h22" stroke="#e3ceaa" strokeOpacity=".75"/><circle cx="260" cy="140" r="6" stroke="#e3ceaa"/><circle cx="260" cy="140" r="16" stroke="#e3ceaa" strokeOpacity=".16"/></g>
      <circle className="sculpture-ripple" cx="260" cy="140" r="23" stroke="#cdb58d" strokeOpacity=".35"/>
      <circle className="sculpture-ripple ripple-delayed" cx="260" cy="140" r="23" stroke="#8fb8bd" strokeOpacity=".35"/>
      <path d="M143 248h52M325 248h52" stroke="#c8baa1" strokeOpacity=".4"/>
      <text x="169" y="272" fill="#bda680" fontSize="10" textAnchor="middle" letterSpacing="5">THESIS</text>
      <text x="351" y="272" fill="#8aadaf" fontSize="10" textAnchor="middle" letterSpacing="5">ANTITHESIS</text>
    </svg>
    <div className="sculpture-footer"><span>{t("分歧，是思考的起点。")}</span><button type="button" aria-label={paused ? t('播放装饰动画') : t('暂停装饰动画')} aria-pressed={paused} onClick={()=>{resetPosition();setPaused(p=>!p);}}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{paused ? t('播放动效') : t('暂停动效')}</button></div>
  </div>;
}
