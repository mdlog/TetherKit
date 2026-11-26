import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FpsMeter, clamp, type ControlAction } from 'tetherkit-core';
import {
  LinkedBurst,
  PairingCard,
  TelemetryHud,
  VirtualPhoneEmulator,
  useAnimationFrame,
  useTetherHost,
} from 'tetherkit-core/react';
import { BUILTIN_MODELS, MAX_GLB_BYTES, parseGlb, type ModelEntry } from '../assets/models';
import builtinDeck from '../assets/tetherkit-deck.md?raw';
import { APP_ID, CONTROLLER_URL, ICE_SERVERS, SIBLING_URL, SIGNALING_URL } from '../env';
import {
  DeckAction,
  formatClock,
  isDeckMode,
  type DeckMode,
  type DeckSync,
  type ModePayload,
  type ZoomPayload,
} from '../shared/deck-protocol';
import { SlidePresenter } from './SlidePresenter';
import { MAX_DISTANCE, MIN_DISTANCE, ThreeInspector } from './ThreeInspector';
import { parseSlides, type Slide } from './slides';
import { usePresentationTimer } from './usePresentationTimer';

const TALK_LENGTHS = [5, 10, 15, 20];
const MAX_NOTES_CHARS = 1500;

export default function HostApp() {
  const { host, state } = useTetherHost({
    app: APP_ID,
    signalingUrl: SIGNALING_URL,
    controllerUrl: CONTROLLER_URL,
    iceServers: ICE_SERVERS,
  });

  const [mode, setMode] = useState<DeckMode>('slides');
  const [slides, setSlides] = useState<Slide[]>(() => parseSlides(builtinDeck));
  const [deckName, setDeckName] = useState('Built-in TetherKit deck');
  const [slideIndex, setSlideIndex] = useState(0);
  const [models, setModels] = useState<ModelEntry[]>(BUILTIN_MODELS);
  const [modelIndex, setModelIndex] = useState(0);
  const [distance, setDistance] = useState(6);
  const [talkMin, setTalkMin] = useState(10);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = usePresentationTimer();

  const [fps, setFps] = useState(0);
  const [fpsMeter] = useState(() => new FpsMeter());
  useAnimationFrame((now) => {
    if (fpsMeter.tick(now)) setFps(fpsMeter.fps);
  });

  const emulatorOpen = state.emulatorUrl !== null;
  const toggleEmulator = () => (emulatorOpen ? host.stopEmulator() : void host.startEmulator());

  const step = useCallback(
    (delta: number) => {
      setSlideIndex((i) => clamp(i + delta, 0, Math.max(0, slides.length - 1)));
      timer.start();
    },
    [slides.length, timer.start],
  );

  // ---- phone actions -----------------------------------------------------
  const handleAction = (action: ControlAction) => {
    switch (action.action) {
      case DeckAction.next:
      case DeckAction.prev: {
        const delta = action.action === DeckAction.next ? 1 : -1;
        const target = clamp(slideIndex + delta, 0, slides.length - 1);
        step(delta);
        host.sendFeedback({ vibratePattern: target === slideIndex ? [40, 40, 40] : [14] });
        break;
      }
      case DeckAction.setMode: {
        const next = (action.payload as Partial<ModePayload> | undefined)?.mode;
        if (isDeckMode(next)) {
          setMode(next);
          host.sendFeedback({ vibratePattern: [10, 40, 10] });
        }
        break;
      }
      case DeckAction.zoom: {
        const factor = Number((action.payload as Partial<ZoomPayload> | undefined)?.factor);
        if (Number.isFinite(factor) && factor > 0.5 && factor < 2) {
          setDistance((d) => clamp(d / factor, MIN_DISTANCE, MAX_DISTANCE));
        }
        break;
      }
      case DeckAction.nextModel:
        setModelIndex((i) => (i + 1) % Math.max(1, models.length));
        host.sendFeedback({ vibratePattern: [18] });
        break;
      case DeckAction.timerToggle:
        timer.toggle();
        break;
      case DeckAction.timerReset:
        timer.reset();
        break;
      default:
        break;
    }
  };
  const actionRef = useRef(handleAction);
  useEffect(() => {
    actionRef.current = handleAction;
  });
  useEffect(() => host.onAction((action) => actionRef.current(action)), [host]);

  // ---- state sync to the phone ------------------------------------------
  const slide = slides[slideIndex];
  const talkSec = talkMin * 60;
  const sync = useMemo<DeckSync>(
    () => ({
      mode,
      slideIndex,
      totalSlides: slides.length,
      slideTitle: (slide?.title ?? '').slice(0, 200),
      notes: (slide?.notes || 'No speaker notes on this slide.').slice(0, MAX_NOTES_CHARS),
      elapsedSec: timer.elapsedSec,
      remainingSec: talkSec - timer.elapsedSec,
      talkSec,
      timerRunning: timer.running,
      modelName: models[modelIndex]?.name ?? '',
      modelIndex,
      modelCount: models.length,
    }),
    [mode, slideIndex, slides.length, slide, timer.elapsedSec, timer.running, talkSec, models, modelIndex],
  );
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
    host.sendFeedback({ syncState: sync });
  }, [host, sync]);
  // Full state on every (re)connect. The phone's LinkedFlash plays the "linked" haptic itself.
  useEffect(() => host.onConnect(() => host.sendFeedback({ syncState: syncRef.current })), [host]);

  // One-minute warning and time-up buzz.
  const remaining = sync.remainingSec;
  useEffect(() => {
    if (!timer.running) return;
    if (remaining === 60) host.sendFeedback({ audioCue: 'warning', vibratePattern: [120, 80, 120] });
    if (remaining === 0) host.sendFeedback({ audioCue: 'warning', vibratePattern: [400, 120, 400] });
  }, [host, remaining, timer.running]);

  // Desktop keyboard / clicker support (most clickers send PageUp/PageDown).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (mode !== 'slides' || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        step(1);
      } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, step]);

  // ---- local files (never uploaded) ---------------------------------------
  const loadMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const parsed = parseSlides(await file.text());
    if (parsed.length === 0) {
      setNotice(`No slides found in ${file.name}. Separate slides with --- and start each with a # Title.`);
      return;
    }
    setSlides(parsed);
    setDeckName(file.name);
    setSlideIndex(0);
    setMode('slides');
    setNotice(null);
  };

  const loadGlb = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_GLB_BYTES) {
      setNotice('That model is larger than 50 MB.');
      return;
    }
    const buffer = await file.arrayBuffer();
    const entry: ModelEntry = {
      id: `upload-${Date.now()}`,
      name: file.name.replace(/\.glb$/i, ''),
      subtitle: 'Local .glb · stays in this browser tab',
      create: () => parseGlb(buffer),
    };
    setModels((list) => [...list, entry]);
    setModelIndex(models.length);
    setMode('inspector');
    setNotice(null);
  };

  return (
    <div className="deck">
      <header className="deck-top">
        <div className="deck-brand">
          <span className="deck-brand__mark" aria-hidden />
          <span className="deck-brand__name">tether-deck</span>
          <span className="deck-brand__by">on TetherKit</span>
        </div>
        <nav className="deck-tabs" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'inspector'} onClick={() => setMode('inspector')}>
            3D Inspector
          </button>
          <button type="button" aria-pressed={mode === 'slides'} onClick={() => setMode('slides')}>
            Laser &amp; Slides
          </button>
        </nav>
        <span className="deck-spacer" />
        <TelemetryHud state={state} fps={fps} />
        <a className="deck-sibling" href={SIBLING_URL}>
          phantom-beam ↗
        </a>
      </header>

      <div className="deck-body">
        <main className={`deck-stage ${state.status === 'connected' ? 'deck-stage--linked' : ''}`}>
          {mode === 'inspector' ? (
            <ThreeInspector
              host={host}
              models={models}
              modelIndex={modelIndex}
              distance={distance}
              onDistanceChange={setDistance}
            />
          ) : (
            <SlidePresenter host={host} slides={slides} index={slideIndex} />
          )}

          <div className="deck-dock">
          <div className="deck-pairing">
            <PairingCard state={state} emulatorOpen={emulatorOpen} onToggleEmulator={toggleEmulator} />
          </div>

          <div className="deck-toolbar">
            {mode === 'slides' ? (
              <>
                <span className="deck-toolbar__label" title={deckName}>
                  {deckName}
                </span>
                <button type="button" className="tk-btn tk-btn--small" onClick={() => step(-1)} aria-label="Previous slide">
                  ‹
                </button>
                <span className="deck-toolbar__count">
                  {slideIndex + 1}/{slides.length}
                </span>
                <button type="button" className="tk-btn tk-btn--small" onClick={() => step(1)} aria-label="Next slide">
                  ›
                </button>
                <button type="button" className="tk-btn tk-btn--small" onClick={timer.toggle}>
                  {timer.running ? 'Pause' : 'Start'} {formatClock(timer.elapsedSec)}
                </button>
                <select
                  className="deck-select"
                  value={talkMin}
                  onChange={(event) => setTalkMin(Number(event.target.value))}
                  aria-label="Talk length"
                >
                  {TALK_LENGTHS.map((m) => (
                    <option key={m} value={m}>
                      {m} min talk
                    </option>
                  ))}
                </select>
                <label className="tk-btn tk-btn--small deck-file">
                  Load .md
                  <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={loadMarkdown} />
                </label>
              </>
            ) : (
              <>
                {models.map((model, i) => (
                  <button
                    key={model.id}
                    type="button"
                    className="tk-btn tk-btn--small deck-chip"
                    aria-pressed={i === modelIndex}
                    onClick={() => setModelIndex(i)}
                  >
                    {model.name}
                  </button>
                ))}
                <label className="tk-btn tk-btn--small deck-file">
                  Load .glb
                  <input type="file" accept=".glb,model/gltf-binary" onChange={loadGlb} />
                </label>
              </>
            )}
          </div>
          </div>
          {notice && (
            <p className="deck-notice" role="alert">
              {notice}
              <button type="button" className="tk-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </p>
          )}
        </main>
        <VirtualPhoneEmulator
          src={state.emulatorUrl}
          onClose={() => host.stopEmulator()}
          hint="Drag the pad to aim the laser or orbit the model. Hold the big button (or Space) for laser/orbit. ← → change slides."
        />
        <LinkedBurst state={state} />
      </div>
    </div>
  );
}
