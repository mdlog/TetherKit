import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { TetherHost } from 'tetherkit-core';
import type { ModelEntry } from '../assets/models';

export interface ThreeInspectorProps {
  host: TetherHost;
  models: ModelEntry[];
  modelIndex: number;
  /** Camera distance target (zoom). */
  distance: number;
  onDistanceChange: (distance: number) => void;
}

export const MIN_DISTANCE = 2.2;
export const MAX_DISTANCE = 9;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** Wraps any object so it is centered at the origin and ~2.6 units across. */
function normalize(object: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  object.position.sub(center);
  wrapper.add(object);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0 && Number.isFinite(maxDim)) wrapper.scale.setScalar(2.6 / maxDim);
  wrapper.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return wrapper;
}

/**
 * Three.js viewport. Hold "Orbit" on the phone and twist the wrist: the change
 * in (nx, ny, roll) since the grab started rotates the model (clutch-style,
 * so you can re-grab to keep turning). Mouse drag + wheel work as a fallback.
 */
export function ThreeInspector({ host, models, modelIndex, distance, onDistanceChange }: ThreeInspectorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const pivotRef = useRef<THREE.Group | null>(null);
  const distanceRef = useRef(distance);
  const onDistanceRef = useRef(onDistanceChange);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);
  useEffect(() => {
    onDistanceRef.current = onDistanceChange;
  });

  // Renderer, scene and loop — created once per mount.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.Fog(0x0b0f17, 9, 22);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0.5, distanceRef.current);

    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x10131a, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5ce1e6, 1.4);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(12, 24, 0x1f3a46, 0x141c26);
    grid.position.y = -1.499;
    scene.add(grid);

    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    // --- interaction state ---
    const target = new THREE.Quaternion();
    const grabStartQuat = new THREE.Quaternion();
    const grab = { nx: 0, ny: 0, roll: 0 };
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    const qc = new THREE.Quaternion();
    let wasHeld = false;
    let lastInteraction = -Infinity;
    let camDistance = distanceRef.current;

    // Mouse fallback.
    let drag: { x: number; y: number } | null = null;
    const canvas = renderer.domElement;
    const onDown = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag = { x: event.clientX, y: event.clientY };
      qa.setFromAxisAngle(AXIS_Y, dx * 0.01);
      qb.setFromAxisAngle(AXIS_X, dy * 0.01);
      target.premultiply(qb).premultiply(qa);
      lastInteraction = performance.now();
    };
    const onUp = () => {
      drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = THREE.MathUtils.clamp(distanceRef.current * Math.exp(event.deltaY * 0.001), MIN_DISTANCE, MAX_DISTANCE);
      distanceRef.current = next;
      onDistanceRef.current(next);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.elapsedTime;
      const now = performance.now();
      const frame = host.getLatestFrame();
      const held = host.isConnected && frame.primaryHeld;

      if (held && !wasHeld) {
        grab.nx = frame.nx;
        grab.ny = frame.ny;
        grab.roll = frame.roll;
        grabStartQuat.copy(target);
      }
      if (held) {
        // Wrist delta since grab -> world-space rotation applied to the grabbed pose.
        qa.setFromAxisAngle(AXIS_Y, (frame.nx - grab.nx) * Math.PI);
        qb.setFromAxisAngle(AXIS_X, -(frame.ny - grab.ny) * Math.PI * 0.75);
        qc.setFromAxisAngle(AXIS_Z, -(frame.roll - grab.roll) * Math.PI);
        target.copy(qa).multiply(qb).multiply(qc).multiply(grabStartQuat);
        lastInteraction = now;
      } else if (now - lastInteraction > 4000 && !drag) {
        qa.setFromAxisAngle(AXIS_Y, dt * 0.25);
        target.premultiply(qa);
      }
      wasHeld = held;

      // The phone already smooths its signal, so keep this short (~33 ms) to avoid stacking lag.
      pivot.quaternion.slerp(target, 1 - Math.exp(-dt * 30));
      camDistance += (distanceRef.current - camDistance) * (1 - Math.exp(-dt * 10));
      camera.position.set(0, 0.5 * (camDistance / 6), camDistance);
      camera.lookAt(0, 0, 0);

      pivot.traverse((node) => {
        const update = (node.userData as { update?: (time: number) => void }).update;
        if (update) update(t);
      });

      const aim = aimRef.current;
      if (aim) {
        aim.style.transform = `translate(${frame.nx * 34}px, ${-frame.ny * 34}px)`;
        aim.dataset.held = held ? '1' : '0';
        aim.dataset.live = host.isConnected ? '1' : '0';
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      disposeObject(scene);
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(canvas);
      pivotRef.current = null;
    };
  }, [host]);

  // Model loading / swapping.
  const entry = models[modelIndex];
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot || !entry) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    entry
      .create()
      .then((object) => {
        if (cancelled) {
          disposeObject(object);
          return;
        }
        for (const child of [...pivot.children]) {
          pivot.remove(child);
          disposeObject(child);
        }
        pivot.add(normalize(object));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this model.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <div className="inspector">
      <div ref={mountRef} className="inspector__viewport" />
      <div className="inspector__overlay">
        <div className="inspector__label">
          <span className="inspector__name">{entry?.name ?? 'No model'}</span>
          <span className="inspector__sub">{error ?? (loading ? 'Loading…' : entry?.subtitle)}</span>
          <p className="inspector__hint">
            Hold <b>ORBIT</b> on the phone and twist your wrist · pinch or ± to zoom · mouse drag works too
          </p>
        </div>
        <div className="inspector__aim" aria-hidden>
          <div ref={aimRef} className="inspector__aim-dot" />
        </div>
      </div>
    </div>
  );
}
