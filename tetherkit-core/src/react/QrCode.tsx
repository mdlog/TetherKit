import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

export interface QrCodeProps {
  value: string;
  size?: number;
  /** Quiet-zone width in modules. */
  margin?: number;
  className?: string;
  label?: string;
}

/** Renders a QR code as a single SVG path (crisp at any size, no canvas). */
export function QrCode({ value, size = 184, margin = 2, className, label = 'QR code' }: QrCodeProps) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
    return { path: d, count: n + margin * 2 };
  }, [value, margin]);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
