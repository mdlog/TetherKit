import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TetherController, type ControllerState, type TetherControllerOptions } from '../controller';
import { TetherHost, type HostState, type TetherHostOptions } from '../host';

/**
 * Creates a TetherHost for the lifetime of the component and starts it.
 * Options are read once; remount the component to change them.
 */
export function useTetherHost(options: TetherHostOptions): { host: TetherHost; state: HostState } {
  const [host] = useState(() => new TetherHost(options));
  useEffect(() => {
    host.start();
    return () => host.stop();
  }, [host]);
  const state = useSyncExternalStore(host.subscribe, host.getState, host.getState);
  return { host, state };
}

/** Creates a TetherController. Connecting is up to you (it needs a user gesture). */
export function useTetherController(
  options?: TetherControllerOptions,
): { controller: TetherController; state: ControllerState } {
  const [controller] = useState(() => new TetherController(options));
  useEffect(() => () => controller.disconnect(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return { controller, state };
}

/** Merges every `syncState` the host sends into one React state object. */
export function useSyncState<T extends Record<string, unknown>>(controller: TetherController, initial: T): T {
  const [state, setState] = useState<T>(initial);
  useEffect(
    () => controller.onSync((patch) => setState((prev) => ({ ...prev, ...patch }) as T)),
    [controller],
  );
  return state;
}

/** Runs `callback(now, dt)` every animation frame while mounted. */
export function useAnimationFrame(callback: (now: number, dtSec: number) => void): void {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ref.current(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}
