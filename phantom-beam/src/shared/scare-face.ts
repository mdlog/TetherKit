/**
 * Procedural jump-scare faces (plain 2D canvas, no Three.js, no image files),
 * shared by the desktop overlay and the phone. Results are cached as data URLs.
 */
import type { ScareKind } from './phantom-protocol';

const cache = new Map<ScareKind, string>();

function wraith(ctx: CanvasRenderingContext2D): void {
  // Hood.
  ctx.fillStyle = '#05070a';
  ctx.beginPath();
  ctx.ellipse(256, 270, 205, 250, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face.
  const skin = ctx.createRadialGradient(256, 230, 20, 256, 270, 210);
  skin.addColorStop(0, '#f4fbff');
  skin.addColorStop(0.55, '#b9cfdc');
  skin.addColorStop(1, '#3a4a55');
  ctx.shadowColor = 'rgba(150,235,255,0.9)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(256, 275, 140, 200, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Sunken eyes.
  ctx.fillStyle = '#000';
  for (const [x, tilt] of [
    [200, 0.35],
    [312, -0.35],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, 220, 44, 58, tilt, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = '#bffcff';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#e8ffff';
  for (const x of [204, 308]) {
    ctx.beginPath();
    ctx.arc(x, 228, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Nose slits.
  ctx.fillStyle = '#1a242b';
  for (const x of [244, 268]) {
    ctx.beginPath();
    ctx.ellipse(x, 300, 6, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Screaming mouth.
  const mouth = ctx.createRadialGradient(256, 400, 5, 256, 400, 90);
  mouth.addColorStop(0, '#000');
  mouth.addColorStop(0.8, '#0a0002');
  mouth.addColorStop(1, '#3b0a12');
  ctx.fillStyle = mouth;
  ctx.beginPath();
  ctx.ellipse(256, 400, 58, 92, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cracks.
  ctx.strokeStyle = 'rgba(20,30,36,0.7)';
  ctx.lineWidth = 2;
  for (const [x0, y0, dx, dy] of [
    [180, 120, 30, 60],
    [330, 130, -20, 70],
    [150, 320, 25, 40],
    [360, 330, -30, 30],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + dx * 0.5, y0 + dy * 0.6);
    ctx.lineTo(x0 + dx, y0 + dy);
    ctx.stroke();
  }
}

function mimic(ctx: CanvasRenderingContext2D): void {
  // Jagged shadow head with a blood-red rim.
  ctx.shadowColor = 'rgba(255,30,70,0.9)';
  ctx.shadowBlur = 36;
  ctx.fillStyle = '#0b020d';
  ctx.beginPath();
  const spikes = 34;
  for (let i = 0; i <= spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const r = (i % 2 ? 205 : 240) - (i % 3) * 8;
    const x = 256 + Math.cos(a) * r * 0.9;
    const y = 270 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  // Eyes.
  ctx.shadowColor = '#ff1a3c';
  ctx.shadowBlur = 30;
  for (const [x, dir] of [
    [180, 1],
    [332, -1],
  ] as const) {
    ctx.fillStyle = '#ff1a3c';
    ctx.beginPath();
    ctx.moveTo(x - 60 * dir, 190);
    ctx.lineTo(x + 55 * dir, 215);
    ctx.lineTo(x - 20 * dir, 250);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe0e6';
    ctx.beginPath();
    ctx.arc(x, 220, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // Grin with teeth.
  ctx.fillStyle = '#1a0004';
  ctx.beginPath();
  ctx.moveTo(110, 330);
  ctx.quadraticCurveTo(256, 470, 402, 330);
  ctx.quadraticCurveTo(256, 400, 110, 330);
  ctx.fill();
  ctx.fillStyle = '#f2e9dc';
  for (let i = 0; i < 12; i++) {
    const x = 128 + i * 23;
    const top = 335 + Math.sin((i / 11) * Math.PI) * 52;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 20, top + 2);
    ctx.lineTo(x + 10, top + 26);
    ctx.closePath();
    ctx.fill();
  }
}

/** Data URL of a 512×512 scare face. */
export function scareFaceUrl(kind: ScareKind): string {
  const cached = cache.get(kind);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  if (kind === 'wraith') wraith(ctx);
  else mimic(ctx);
  const url = canvas.toDataURL('image/png');
  cache.set(kind, url);
  return url;
}

/** Jump scares default to off for people who asked the OS for reduced motion. */
export function scaresAllowedByDefault(): boolean {
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
