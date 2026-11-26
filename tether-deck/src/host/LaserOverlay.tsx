import { useEffect, useRef } from 'react';
import type { TetherHost } from 'tetherkit-core';

const TRAIL = 12;

export interface LaserOverlayProps {
  host: TetherHost;
  color?: string;
}

/**
 * Transparent canvas over the slide. While the phone's primary button is held,
 * (nx, ny) becomes a glowing laser dot with a 12-point ring-buffer trail.
 * Runs its own requestAnimationFrame loop — no React renders per frame.
 */
export function LaserOverlay({ host, color = '#ff2d55' }: LaserOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Ring buffer of recent positions (in CSS pixels).
    const xs = new Float32Array(TRAIL);
    const ys = new Float32Array(TRAIL);
    let head = 0;
    let count = 0;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const frame = host.getLatestFrame();
      if (frame.primaryHeld && host.isConnected) {
        xs[head] = ((frame.nx + 1) / 2) * width;
        ys[head] = ((1 - frame.ny) / 2) * height;
        head = (head + 1) % TRAIL;
        count = Math.min(TRAIL, count + 1);
      } else if (count > 0) {
        count--; // let the trail fade out after release
      }

      ctx.clearRect(0, 0, width, height);
      if (count === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i++) {
        const idx = (head - count + i + TRAIL) % TRAIL;
        const t = (i + 1) / count;
        ctx.globalAlpha = t * 0.55;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(xs[idx]!, ys[idx]!, 2 + t * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (frame.primaryHeld) {
        const idx = (head - 1 + TRAIL) % TRAIL;
        const x = xs[idx]!;
        const y = ys[idx]!;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 30);
        glow.addColorStop(0, 'rgba(255,255,255,0.95)');
        glow.addColorStop(0.18, color);
        glow.addColorStop(1, 'rgba(255,0,60,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [host, color]);

  return <canvas ref={canvasRef} className="laser-overlay" aria-hidden />;
}
