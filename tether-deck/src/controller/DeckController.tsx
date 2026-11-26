import { useEffect, useRef } from 'react';
import { clamp, type ControllerState, type TetherController } from 'tetherkit-core';
import { ControllerStatusBar, HoldButton, PoseDot, TouchPad, useSyncState } from 'tetherkit-core/react';
import { DeckAction, formatClock, initialDeckSync, type DeckMode } from '../shared/deck-protocol';

export interface DeckControllerProps {
  controller: TetherController;
  state: ControllerState;
}

function linkMessage(state: ControllerState): string | null {
  switch (state.status) {
    case 'negotiating':
      return 'Opening the link to the desktop…';
    case 'connecting':
    case 'reconnecting':
      return 'Connecting to the signaling server…';
    case 'host-left':
      return 'The desktop page is gone. Reopen it — this phone reconnects automatically.';
    case 'error':
      return state.error;
    default:
      return null;
  }
}

/** Phone UI: notes + timer for slides, orbit pad for 3D, big hold button at the thumb. */
export function DeckController({ controller, state }: DeckControllerProps) {
  const sync = useSyncState(controller, initialDeckSync);
  const mode = sync.mode;
  const touch = state.inputSource === 'touch';

  // Touch fallback: in 3D the pad behaves like a joystick that springs back.
  useEffect(() => {
    controller.setTouchBehavior(
      mode === 'inspector' ? { springBack: true, holdsPrimary: true } : { springBack: false, holdsPrimary: true },
    );
  }, [controller, mode]);

  const next = () => controller.sendAction(DeckAction.next);
  const prev = () => controller.sendAction(DeckAction.prev);
  const setMode = (m: DeckMode) => controller.sendAction(DeckAction.setMode, { mode: m });
  const zoom = (factor: number) => controller.sendAction(DeckAction.zoom, { factor });

  // Coalesce pinch updates to ~20 messages per second.
  const pinch = useRef({ factor: 1, at: 0 });
  const onPinch = (factor: number) => {
    pinch.current.factor *= factor;
    const now = performance.now();
    if (now - pinch.current.at > 50) {
      zoom(clamp(pinch.current.factor, 0.6, 1.6));
      pinch.current = { factor: 1, at: now };
    }
  };

  // Arrow keys help when driving the Split-View emulator with a keyboard.
  const keys = useRef({ next, prev });
  useEffect(() => {
    keys.current = { next, prev };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') keys.current.next();
      else if (event.key === 'ArrowLeft') keys.current.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const message = linkMessage(state);
  const lowTime = sync.timerRunning && sync.remainingSec <= 60;

  return (
    <div className="dc">
      <ControllerStatusBar controller={controller} state={state} />
      {message && <p className="dc-banner">{message}</p>}

      <nav className="dc-modes" aria-label="Mode">
        <button type="button" aria-pressed={mode === 'inspector'} onClick={() => setMode('inspector')}>
          3D Inspector
        </button>
        <button type="button" aria-pressed={mode === 'slides'} onClick={() => setMode('slides')}>
          Laser &amp; Slides
        </button>
      </nav>

      {mode === 'slides' ? (
        <section className="dc-main">
          <div className="dc-slide-head">
            <span className="dc-count">
              {sync.totalSlides ? sync.slideIndex + 1 : 0}/{sync.totalSlides}
            </span>
            <strong className="dc-title">{sync.slideTitle || 'Waiting for slides…'}</strong>
          </div>
          <div className={`dc-timer ${lowTime ? 'dc-timer--low' : ''}`}>
            <div>
              <span className="dc-timer__label">Elapsed</span>
              <span className="dc-timer__value">{formatClock(sync.elapsedSec)}</span>
            </div>
            <div>
              <span className="dc-timer__label">Remaining</span>
              <span className="dc-timer__value">{formatClock(sync.remainingSec)}</span>
            </div>
            <button type="button" className="tk-btn tk-btn--small" onClick={() => controller.sendAction(DeckAction.timerToggle)}>
              {sync.timerRunning ? 'Pause' : 'Start'}
            </button>
            <button type="button" className="tk-btn tk-btn--small tk-btn--ghost" onClick={() => controller.sendAction(DeckAction.timerReset)}>
              Reset
            </button>
          </div>
          {touch ? (
            <>
              <div className="dc-notes">{sync.notes}</div>
              <TouchPad controller={controller} trackpad className="dc-pad dc-pad--short" label="Laser trackpad">
                <PoseDot controller={controller} />
                <span className="dc-pad__hint">Drag to aim the laser</span>
              </TouchPad>
            </>
          ) : (
            <TouchPad
              controller={controller}
              trackpad={false}
              onSwipe={(direction) => (direction === 'left' ? next() : prev())}
              touchAction="pan-y"
              className="dc-notes dc-notes--swipe"
              label="Speaker notes. Swipe left or right to change slides"
            >
              {sync.notes}
              <span className="dc-notes__hint">Swipe ← → to change slides</span>
            </TouchPad>
          )}
        </section>
      ) : (
        <section className="dc-main">
          <div className="dc-model">
            <div>
              <span className="dc-timer__label">
                Model {sync.modelCount ? sync.modelIndex + 1 : 0}/{sync.modelCount}
              </span>
              <strong className="dc-title">{sync.modelName || '—'}</strong>
            </div>
            <button type="button" className="tk-btn tk-btn--small" onClick={() => controller.sendAction(DeckAction.nextModel)}>
              Next model
            </button>
          </div>
          <TouchPad controller={controller} trackpad={touch} onPinch={onPinch} className="dc-pad" label="Orbit pad">
            <PoseDot controller={controller} />
            <span className="dc-pad__hint">
              {touch ? 'Drag to orbit · pinch to zoom' : 'Hold ORBIT and twist your wrist · pinch to zoom'}
            </span>
          </TouchPad>
        </section>
      )}

      <footer className="dc-footer">
        <HoldButton
          label={mode === 'slides' ? 'HOLD TO LASER' : 'HOLD TO ORBIT'}
          sublabel={touch ? 'or just drag the pad' : mode === 'slides' ? 'tilt to aim · Space on keyboard' : 'hold, then twist your wrist'}
          onHoldChange={(held) => {
            // Clutch: every grab starts from zero, so the wrist always has the full ±range
            // and the model never stops turning because the pose was already off-centre.
            if (held && mode === 'inspector' && !touch) controller.recenter({ quiet: true });
            controller.setPrimaryHeld(held);
          }}
          hotkey=" "
        />
        <div className="dc-row">
          {mode === 'slides' ? (
            <>
              <button type="button" className="tk-btn dc-big" onClick={prev}>
                ‹ PREV
              </button>
              <button type="button" className="tk-btn tk-btn--primary dc-big" onClick={next}>
                NEXT ›
              </button>
            </>
          ) : (
            <>
              <button type="button" className="tk-btn dc-big" onClick={() => zoom(1 / 1.15)}>
                − ZOOM
              </button>
              <button type="button" className="tk-btn dc-big" onClick={() => zoom(1.15)}>
                ZOOM +
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
