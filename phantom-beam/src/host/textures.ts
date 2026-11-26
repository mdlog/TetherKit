/**
 * Procedural canvas textures: stone corridor and ghost sprites.
 * Everything is generated at runtime, so the repo carries no third-party art.
 */
import * as THREE from 'three';

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [el, ctx];
}

/** Deterministic PRNG so the corridor looks the same every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number, n: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rand() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.08 + rand() * 0.18})`;
    ctx.fillRect(x + rand() * w, y + rand() * h, 1 + rand() * 3, 1 + rand() * 3);
  }
}

function toTexture(el: HTMLCanvasElement, repeatX: number, repeatY: number, color = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function stoneWallTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const [el, ctx] = canvas(512, 512);
  const rand = mulberry32(7);
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, 512, 512);
  const rowH = 64;
  for (let row = 0; row < 512 / rowH; row++) {
    let x = row % 2 ? -60 : 0;
    while (x < 512) {
      const w = 90 + rand() * 80;
      const shade = 52 + Math.floor(rand() * 28);
      ctx.fillStyle = `rgb(${shade},${shade - 2},${shade + 2})`;
      ctx.fillRect(x + 3, row * rowH + 3, w - 6, rowH - 6);
      // darker lower edge for depth
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 3, row * rowH + rowH - 12, w - 6, 9);
      speckle(ctx, x + 3, row * rowH + 3, w - 6, rowH - 6, rand, 90);
      x += w;
    }
  }
  // moss / damp streaks
  for (let i = 0; i < 18; i++) {
    const x = rand() * 512;
    const grad = ctx.createLinearGradient(x, 0, x, 512);
    grad.addColorStop(0, 'rgba(20,40,25,0)');
    grad.addColorStop(1, 'rgba(20,40,25,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, rand() * 200, 6 + rand() * 14, 512);
  }
  return toTexture(el, repeatX, repeatY);
}

export function stoneFloorTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const [el, ctx] = canvas(512, 512);
  const rand = mulberry32(13);
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, 512, 512);
  const tile = 128;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const shade = 40 + Math.floor(rand() * 26);
      ctx.fillStyle = `rgb(${shade},${shade},${shade + 3})`;
      ctx.fillRect(tx * tile + 4, ty * tile + 4, tile - 8, tile - 8);
      speckle(ctx, tx * tile + 4, ty * tile + 4, tile - 8, tile - 8, rand, 160);
      // a crack now and then
      if (rand() > 0.55) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let cx = tx * tile + 10 + rand() * 100;
        let cy = ty * tile + 10;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 6; s++) {
          cx += (rand() - 0.5) * 30;
          cy += 18;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }
  }
  return toTexture(el, repeatX, repeatY);
}

/** Soft white radial glow (auras, candle flames, particles). */
export function glowTexture(): THREE.CanvasTexture {
  const [el, ctx] = canvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Hooded, wispy Stalker Wraith. */
export function wraithTexture(): THREE.CanvasTexture {
  const [el, ctx] = canvas(256, 384);
  ctx.shadowColor = 'rgba(160,230,255,0.9)';
  ctx.shadowBlur = 24;
  const body = ctx.createLinearGradient(0, 30, 0, 384);
  body.addColorStop(0, 'rgba(225,245,255,0.95)');
  body.addColorStop(0.55, 'rgba(170,215,240,0.7)');
  body.addColorStop(1, 'rgba(120,180,220,0)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(128, 28);
  ctx.bezierCurveTo(196, 28, 214, 110, 206, 170);
  ctx.bezierCurveTo(224, 250, 236, 300, 222, 372);
  // tattered hem
  for (let i = 0; i <= 8; i++) {
    const x = 222 - i * 24;
    ctx.lineTo(x - 12, 330 + (i % 2) * 46);
  }
  ctx.bezierCurveTo(22, 300, 32, 250, 50, 170);
  ctx.bezierCurveTo(42, 110, 60, 28, 128, 28);
  ctx.fill();
  // hood shadow + eyes
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(10,20,30,0.85)';
  ctx.beginPath();
  ctx.ellipse(128, 100, 46, 54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'rgba(120,255,240,1)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(190,255,250,1)';
  for (const x of [108, 148]) {
    ctx.beginPath();
    ctx.ellipse(x, 98, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Jagged black Shadow Mimic with red eyes. */
export function mimicTexture(): THREE.CanvasTexture {
  const [el, ctx] = canvas(256, 320);
  const rand = mulberry32(99);
  // Body: near-black with a blood-red rim so the silhouette reads against dark stone.
  ctx.shadowColor = 'rgba(255,30,70,0.85)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = 'rgba(24,6,28,0.97)';
  ctx.strokeStyle = 'rgba(255,60,90,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 20);
  const points = 26;
  for (let i = 0; i <= points; i++) {
    const a = -Math.PI / 2 + (i / points) * Math.PI * 2;
    const r = (i % 2 ? 100 : 118) + rand() * 18;
    const x = 128 + Math.cos(a) * r * 0.82;
    const y = 165 + Math.sin(a) * r * 1.2;
    ctx.lineTo(x, Math.min(310, y));
  }
  ctx.fill();
  ctx.stroke();
  // Eyes: hot white core with a red bloom.
  ctx.shadowColor = 'rgba(255,30,60,1)';
  ctx.shadowBlur = 22;
  for (const x of [100, 156]) {
    for (const [fill, grow] of [
      ['#ff2a4a', 0],
      ['#ffd0d8', -6],
    ] as const) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x - 18 - grow, 112);
      ctx.lineTo(x + 18 + grow, 102 - grow * 0.3);
      ctx.lineTo(x + 6, 124 + grow * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
  // grin
  ctx.strokeStyle = '#ff2a4a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const x = 86 + i * 8.4;
    const y = 168 + Math.sin((i / 10) * Math.PI) * 18 + (i % 2 ? -6 : 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
