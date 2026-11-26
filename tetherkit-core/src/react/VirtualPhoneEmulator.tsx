export interface VirtualPhoneEmulatorProps {
  /** Emulator controller URL from `host.startEmulator()`; null hides the panel. */
  src: string | null;
  onClose: () => void;
  title?: string;
  hint?: string;
}

/**
 * Split-View judge mode: the real controller page runs in a phone-sized iframe
 * and talks to the host over BroadcastChannel with the same TetherProtocol.
 * Place it as a flex sibling of your stage so the stage shrinks beside it.
 */
export function VirtualPhoneEmulator({
  src,
  onClose,
  title = 'Virtual Phone',
  hint = 'Drag on the pad to aim. Hold the big button (or press Space) for the primary action.',
}: VirtualPhoneEmulatorProps) {
  if (!src) return null;
  return (
    <aside className="tk-emulator" aria-label="Virtual phone emulator">
      <header className="tk-emulator__bar">
        <span className="tk-emulator__title">{title}</span>
        <span className="tk-badge tk-badge--info">
          <span className="tk-badge__dot" aria-hidden />
          BroadcastChannel
        </span>
        <button type="button" className="tk-icon-btn" onClick={onClose} aria-label="Close virtual phone">
          ×
        </button>
      </header>
      <div className="tk-emulator__phone">
        <iframe src={src} title="TetherKit virtual phone controller" allow="autoplay; screen-wake-lock" />
      </div>
      <p className="tk-emulator__hint">{hint}</p>
    </aside>
  );
}
