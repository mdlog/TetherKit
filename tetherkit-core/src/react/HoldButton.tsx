import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

export interface HoldButtonProps {
  label: ReactNode;
  sublabel?: ReactNode;
  onHoldChange: (held: boolean) => void;
  /** 0-1 progress ring (e.g. UV Surge charge). */
  progress?: number;
  /** Keyboard key that also holds the button (e.g. " " for Space). */
  hotkey?: string;
  className?: string;
  disabled?: boolean;
}

/** Thumb-sized press-and-hold button with optional progress ring and hotkey. */
export function HoldButton({ label, sublabel, onHoldChange, progress, hotkey, className, disabled }: HoldButtonProps) {
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const callback = useRef(onHoldChange);
  useEffect(() => {
    callback.current = onHoldChange;
  });

  const set = (next: boolean) => {
    if (heldRef.current === next) return;
    heldRef.current = next;
    setHeld(next);
    callback.current(next);
  };

  useEffect(() => {
    if (!hotkey || disabled) return;
    const isKey = (event: KeyboardEvent) =>
      event.key === hotkey && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement);
    const onDown = (event: KeyboardEvent) => {
      if (!isKey(event)) return;
      event.preventDefault();
      if (!event.repeat) set(true);
    };
    const onUp = (event: KeyboardEvent) => {
      if (isKey(event)) set(false);
    };
    const onBlur = () => set(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [hotkey, disabled]);

  useEffect(() => {
    if (disabled) set(false);
  }, [disabled]);

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    set(true);
  };
  const release = () => set(false);

  const ring = progress !== undefined ? Math.max(0, Math.min(1, progress)) : null;
  const circumference = 2 * Math.PI * 46;

  return (
    <button
      type="button"
      className={`tk-hold ${held ? 'tk-hold--held' : ''} ${className ?? ''}`}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
      aria-pressed={held}
      disabled={disabled}
    >
      {ring !== null && (
        <svg className="tk-hold__ring" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" className="tk-hold__track" />
          <circle
            cx="50"
            cy="50"
            r="46"
            className="tk-hold__progress"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ring)}
          />
        </svg>
      )}
      <span className="tk-hold__label">{label}</span>
      {sublabel && <span className="tk-hold__sub">{sublabel}</span>}
    </button>
  );
}
