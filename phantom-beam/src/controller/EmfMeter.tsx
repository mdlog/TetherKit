import type { CSSProperties } from 'react';
import { EMF_THRESHOLDS, emfLevel } from '../shared/phantom-protocol';

export interface EmfMeterProps {
  emf: number;
}

const SEGMENT_COLORS = ['#39ff88', '#b6ff3b', '#ffd23b', '#ff8a2a', '#ff2a4a'];

/** Analog needle + 5 LED segments (green -> yellow -> orange -> blinking red). */
export function EmfMeter({ emf }: EmfMeterProps) {
  const level = emfLevel(emf);
  const angle = -90 + Math.max(0, Math.min(1, emf)) * 180;
  const ticks = Array.from({ length: 21 }, (_, i) => -90 + i * 9);
  return (
    <div className={`emf ${level >= 5 ? 'emf--max' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(emf.toFixed(2))} aria-label="EMF intensity">
      <svg className="emf__gauge" viewBox="0 0 200 120" aria-hidden>
        <defs>
          <linearGradient id="emf-arc" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#39ff88" />
            <stop offset="0.55" stopColor="#ffd23b" />
            <stop offset="1" stopColor="#ff2a4a" />
          </linearGradient>
        </defs>
        <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="url(#emf-arc)" strokeWidth="8" strokeLinecap="round" opacity="0.85" />
        {ticks.map((a, i) => (
          <line
            key={a}
            x1="100"
            y1={i % 5 === 0 ? 38 : 44}
            x2="100"
            y2="50"
            stroke="currentColor"
            strokeWidth={i % 5 === 0 ? 2 : 1}
            opacity="0.6"
            transform={`rotate(${a} 100 110)`}
          />
        ))}
        <g className="emf__needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="100" y1="110" x2="100" y2="34" stroke="#ff4d6d" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="110" r="7" fill="#0b0f0c" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div className="emf__leds">
        {EMF_THRESHOLDS.map((threshold, i) => (
          <span
            key={threshold}
            className={`emf__led ${i < level ? 'is-on' : ''} ${i === 4 && level >= 5 ? 'is-blink' : ''}`}
            style={{ '--led': SEGMENT_COLORS[i] } as CSSProperties}
          />
        ))}
      </div>
      <div className="emf__readout">
        <span>EMF</span>
        <b>{emf.toFixed(2)}</b>
        <span>LVL {level}</span>
      </div>
    </div>
  );
}
