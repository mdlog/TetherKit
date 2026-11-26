/**
 * Built-in 3D models, generated procedurally so the repo ships no binary
 * assets with unclear licenses. Each model may expose `userData.update(t)`
 * for idle animation.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface ModelEntry {
  id: string;
  name: string;
  subtitle: string;
  create(): Promise<THREE.Object3D>;
}

type Animated = THREE.Object3D & { userData: { update?: (t: number) => void } };

function buildServerNode(): Animated {
  const root = new THREE.Group() as Animated;
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, metalness: 0.85, roughness: 0.35 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.7, roughness: 0.4 });
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x5ce1e6, emissive: 0x5ce1e6, emissiveIntensity: 1.4 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 1.05), chassisMat);
  root.add(chassis);

  // Glowing edge trims.
  for (const x of [-0.66, 0.66]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.12, 0.03), trimMat);
    trim.position.set(x, 0, 0.53);
    root.add(trim);
  }

  const leds: THREE.MeshStandardMaterial[] = [];
  const ledColors = [0x3ddc84, 0x5ce1e6, 0xffc857, 0x3ddc84, 0xff5c7a, 0x5ce1e6];
  for (let i = 0; i < 6; i++) {
    const y = -0.8 + i * 0.32;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.26, 0.1), bladeMat);
    blade.position.set(0, y, 0.55);
    root.add(blade);
    for (let v = 0; v < 5; v++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), ventMat);
      vent.position.set(-0.42 + v * 0.11, y, 0.61);
      root.add(vent);
    }
    const ledMat = new THREE.MeshStandardMaterial({
      color: ledColors[i],
      emissive: ledColors[i],
      emissiveIntensity: 2,
    });
    leds.push(ledMat);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), ledMat);
    led.position.set(0.38, y, 0.61);
    root.add(led);
  }

  // Heat-sink fins on top.
  for (let i = 0; i < 9; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.9), bladeMat);
    fin.position.set(-0.52 + i * 0.13, 1.14, 0);
    root.add(fin);
  }

  // Cables looping out of the back.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3 + i * 0.3, 0.6 - i * 0.4, -0.52),
      new THREE.Vector3(-0.4 + i * 0.3, 0.2 - i * 0.4, -0.95),
      new THREE.Vector3(-0.2 + i * 0.2, -1.0, -0.8),
      new THREE.Vector3(i * 0.15, -1.3, -0.4),
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.035, 8, false), cableMat));
  }

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.12, 48), chassisMat);
  plinth.position.y = -1.12;
  root.add(plinth);

  root.userData.update = (t: number) => {
    leds.forEach((mat, i) => {
      mat.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * (3 + i) + i * 1.7)) * 2.2;
    });
  };
  return root;
}

function buildGyroArtifact(): Animated {
  const root = new THREE.Group() as Animated;
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 1, roughness: 0.28 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 1, roughness: 0.22 });
  const core = new THREE.MeshStandardMaterial({ color: 0x7b2cff, emissive: 0x8a4dff, emissiveIntensity: 1.8, roughness: 0.15 });

  const outer = new THREE.Group();
  const middle = new THREE.Group();
  const inner = new THREE.Group();
  root.add(outer);
  outer.add(middle);
  middle.add(inner);

  outer.add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.055, 24, 128), brass));
  const middleRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 24, 112), steel);
  middleRing.rotation.y = Math.PI / 2;
  middle.add(middleRing);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.045, 24, 96), brass);
  innerRing.rotation.x = Math.PI / 2;
  inner.add(innerRing);

  // Rivets along the outer ring.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), steel);
    rivet.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.05);
    outer.add(rivet);
  }

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.32, 16), steel);
  inner.add(spindle);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 2), core);
  inner.add(orb);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.012, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xb388ff }),
  );
  inner.add(halo);

  // Stand.
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 16), brass);
  arm.position.y = -1.33;
  root.add(arm);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.14, 48), steel);
  base.position.y = -1.55;
  root.add(base);

  root.userData.update = (t: number) => {
    outer.rotation.y = t * 0.35;
    middle.rotation.x = t * 0.8;
    inner.rotation.z = t * 1.6;
    orb.rotation.y = t * 2.4;
    core.emissiveIntensity = 1.4 + Math.sin(t * 2.2) * 0.6;
  };
  return root;
}

export const BUILTIN_MODELS: ModelEntry[] = [
  {
    id: 'server-node',
    name: 'Modular Cyber Server Node',
    subtitle: 'Procedural · blinking status LEDs',
    create: async () => buildServerNode(),
  },
  {
    id: 'gyro-artifact',
    name: 'Mechanical Gyro Artifact',
    subtitle: 'Procedural · nested spinning gimbals',
    create: async () => buildGyroArtifact(),
  },
];

export const MAX_GLB_BYTES = 50 * 1024 * 1024;

/** Parses a local .glb entirely in memory — the file never leaves the browser. */
export async function parseGlb(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(buffer, '');
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return gltf.scene;
}
