/**
 * Three.js renderer for the haunted corridor. Runs its own rAF loop (outside
 * React), reads the phone input every frame, steps the pure game rules and
 * mirrors the result into lights, sprites and particles.
 */
import * as THREE from 'three';
import { aimDirection } from './game/emf';
import { createGame, eyeOf, startGame, stepGame, walkedOf } from './game/session';
import type { GameEvent, GameState, Ghost } from './game/types';
import { glowTexture, mimicTexture, stoneFloorTexture, stoneWallTexture, wraithTexture } from './textures';

export interface EngineInput {
  nx: number;
  ny: number;
  uvHeld: boolean;
}

export interface EngineCallbacks {
  readInput(): EngineInput;
  /** Called every frame after the simulation step. */
  onFrame(state: GameState, events: GameEvent[], now: number): void;
}

/** Corridor length (m). The player walks up to MAX_WALK (38 m); the rest stays hidden in fog. */
const LENGTH = 64;
/** Distance per footstep (m), used for the walking bob. */
export const STEP_LENGTH = 0.75;
const HALF_WIDTH = 3.5;
const HEIGHT = 4.6;
const WARM = new THREE.Color(0xfff0d2);
const UV = new THREE.Color(0x9b5cff);
const UV_TINT = new THREE.Color(0xc3a2ff);

interface GhostView {
  group: THREE.Group;
  body: THREE.Sprite;
  aura: THREE.Sprite;
  bodyMat: THREE.SpriteMaterial;
  auraMat: THREE.SpriteMaterial;
  baseScale: THREE.Vector2;
}

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
}

const BEAM_VERTEX = /* glsl */ `
  varying float vAlong;
  varying float vEdge;
  void main() {
    vAlong = uv.y;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vEdge = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlong;
  varying float vEdge;
  void main() {
    float a = uOpacity * pow(vAlong, 1.6) * pow(vEdge, 1.5);
    gl_FragColor = vec4(uColor, a);
  }
`;

export class CorridorEngine {
  readonly game: GameState = createGame();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(66, 1, 0.05, 80);
  private readonly spot: THREE.SpotLight;
  private readonly spotTarget = new THREE.Object3D();
  private readonly beam: THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>;
  private readonly candles: Array<{ light: THREE.PointLight; flame: THREE.Sprite; seed: number }> = [];
  private readonly doorLight: THREE.PointLight;
  private readonly dust: THREE.Points;
  private readonly ghostViews = new Map<number, GhostView>();
  private readonly bursts: Burst[] = [];
  private readonly textures: Record<'wraith' | 'mimic' | 'glow', THREE.Texture>;
  private readonly observer: ResizeObserver;
  private raf = 0;
  private last = 0;
  private aim = { x: 0, y: 0 };
  private uvBlend = 0;
  private shake = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: EngineCallbacks,
  ) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.background = new THREE.Color(0x030405);
    this.scene.fog = new THREE.FogExp2(0x030405, 0.055);
    this.scene.add(new THREE.AmbientLight(0x1b2440, 0.35));
    this.scene.add(new THREE.HemisphereLight(0x22304a, 0x050505, 0.25));

    this.textures = { wraith: wraithTexture(), mimic: mimicTexture(), glow: glowTexture() };
    this.buildCorridor();

    // Flashlight held in the right hand, slightly below the eyes.
    const eye = eyeOf(this.game);
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.scene.add(this.camera);
    this.scene.add(this.spotTarget);
    const spot = new THREE.SpotLight(WARM, 170, 0, 0.42, 0.45, 1.6);
    spot.position.set(0.28, -0.3, -0.1);
    spot.target = this.spotTarget;
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = 0.2;
    spot.shadow.camera.far = 45;
    this.camera.add(spot);
    this.spot = spot;

    const beamLength = 16;
    const beamGeo = new THREE.ConeGeometry(Math.tan(0.42) * beamLength, beamLength, 40, 1, true);
    beamGeo.translate(0, -beamLength / 2, 0);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: WARM.clone() }, uOpacity: { value: 0.09 } },
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.copy(spot.position);
    this.camera.add(this.beam);

    // Red glow behind the far door.
    this.doorLight = new THREE.PointLight(0xff2a3a, 6, 12, 2);
    this.doorLight.position.set(0, 1.4, -LENGTH + 3.2);
    this.scene.add(this.doorLight);

    this.dust = this.buildDust();
    this.scene.add(this.dust);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  /** Horizontal view direction in radians (+ = looking right). Used for spatial audio. */
  get viewYaw(): number {
    return this.aim.x * 0.16;
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Begin (or restart) a 60-second hunt. */
  startHunt(): void {
    for (const view of this.ghostViews.values()) this.removeGhostView(view);
    this.ghostViews.clear();
    startGame(this.game);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer.disconnect();
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
      const list = Array.isArray(material) ? material : material ? [material] : [];
      for (const m of list) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      }
    });
    Object.values(this.textures).forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---- per frame ---------------------------------------------------------

  private frame(dt: number, now: number): void {
    const input = this.callbacks.readInput();
    // Hand inertia on the beam.
    const k = 1 - Math.exp(-dt * 14);
    this.aim.x += (input.nx - this.aim.x) * k;
    this.aim.y += (input.ny - this.aim.y) * k;
    const dir = aimDirection(this.aim.x, this.aim.y);

    const events = stepGame(this.game, { dir, uvHeld: input.uvHeld && this.game.phase === 'playing' }, dt);
    const t = now / 1000;

    // Camera follows the player: breathing, walking bob/sway, look-toward-the-beam, shake on contact.
    const eye = eyeOf(this.game);
    this.shake = Math.max(this.game.touching ? 1 : 0, this.shake - dt * 2);
    const jitter = this.shake * 0.03;
    const stride = (walkedOf(this.game) / STEP_LENGTH) * Math.PI;
    const walkBlend = Math.min(1, this.game.walkSpeed / 0.6);
    this.camera.position.set(
      eye.x + Math.sin(stride) * 0.025 * walkBlend + (Math.random() - 0.5) * jitter,
      eye.y + Math.sin(t * 1.3) * 0.015 + Math.abs(Math.sin(stride)) * 0.045 * walkBlend + (Math.random() - 0.5) * jitter,
      eye.z,
    );
    this.camera.rotation.set(this.aim.y * 0.1, -this.aim.x * 0.16, Math.sin(stride) * 0.006 * walkBlend, 'YXZ');
    this.camera.updateMatrixWorld();

    // Flashlight target in world space, ahead of where the player stands.
    this.spotTarget.position.set(eye.x + dir.x * 12, eye.y + dir.y * 12, eye.z + dir.z * 12);
    this.spotTarget.updateMatrixWorld();
    this.beam.lookAt(this.spotTarget.position);

    this.uvBlend += ((this.game.uvActive ? 1 : 0) - this.uvBlend) * (1 - Math.exp(-dt * 8));
    const lowSanity = this.game.phase === 'playing' ? 1 - this.game.sanity / 100 : 0;
    const flicker = 1 - Math.random() * (0.02 + lowSanity * 0.25) * (Math.random() < 0.08 + lowSanity * 0.2 ? 1 : 0.1);
    this.spot.color.copy(WARM).lerp(UV, this.uvBlend);
    this.spot.intensity = (170 + this.uvBlend * 90) * flicker;
    this.beam.material.uniforms.uColor!.value.copy(this.spot.color);
    this.beam.material.uniforms.uOpacity!.value = (0.08 + this.uvBlend * 0.1) * flicker;

    for (const candle of this.candles) {
      const f = 0.75 + Math.sin(t * 9 + candle.seed) * 0.12 + Math.sin(t * 23 + candle.seed * 3) * 0.08 + Math.random() * 0.05;
      candle.light.intensity = 2.6 * f;
      candle.flame.scale.setScalar(0.22 * f);
    }
    this.doorLight.intensity = 4 + Math.sin(t * 0.8) * 2 + (this.game.emf > 0.75 ? Math.random() * 3 : 0);

    this.updateDust(dt);
    this.syncGhosts(t);
    for (const event of events) if (event.type === 'banished') this.spawnBurst(event.pos);
    this.updateBursts(dt);

    this.renderer.render(this.scene, this.camera);
    this.callbacks.onFrame(this.game, events, now);
  }

  private syncGhosts(t: number): void {
    const seen = new Set<number>();
    for (const ghost of this.game.ghosts) {
      seen.add(ghost.id);
      const view = this.ghostViews.get(ghost.id) ?? this.createGhostView(ghost);
      this.updateGhostView(view, ghost, t);
    }
    for (const [id, view] of this.ghostViews) {
      if (!seen.has(id)) {
        this.removeGhostView(view);
        this.ghostViews.delete(id);
      }
    }
  }

  private createGhostView(ghost: Ghost): GhostView {
    const wraith = ghost.kind === 'wraith';
    const bodyMat = new THREE.SpriteMaterial({
      map: wraith ? this.textures.wraith : this.textures.mimic,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const auraMat = new THREE.SpriteMaterial({
      map: this.textures.glow,
      color: wraith ? 0x7fe8ff : 0xff2a4a,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const body = new THREE.Sprite(bodyMat);
    const aura = new THREE.Sprite(auraMat);
    const baseScale = wraith ? new THREE.Vector2(1.75, 2.6) : new THREE.Vector2(1.85, 2.3);
    body.scale.set(baseScale.x, baseScale.y, 1);
    aura.scale.set(baseScale.x * 2.2, baseScale.y * 1.8, 1);
    const group = new THREE.Group();
    group.add(aura, body);
    this.scene.add(group);
    const view = { group, body, aura, bodyMat, auraMat, baseScale };
    this.ghostViews.set(ghost.id, view);
    return view;
  }

  private updateGhostView(view: GhostView, ghost: Ghost, t: number): void {
    const proximity = THREE.MathUtils.clamp(1 - ghost.distance / 16, 0, 1);
    const fade = 1 - ghost.dissolve;
    const shakeAmt = ghost.banish * 0.06;
    view.group.position.set(
      ghost.pos.x + (Math.random() - 0.5) * shakeAmt,
      ghost.pos.y + (Math.random() - 0.5) * shakeAmt,
      ghost.pos.z,
    );
    const flicker = 0.85 + Math.sin(t * 11 + ghost.id) * 0.1 + Math.random() * 0.05;
    view.bodyMat.opacity = Math.min(1, Math.pow(Math.min(1, ghost.reveal * 1.5), 1.2)) * fade * flicker;
    view.bodyMat.color.setRGB(1, 1, 1).lerp(UV_TINT, Math.max(ghost.banish, ghost.dissolve));
    view.auraMat.opacity = (0.06 + proximity * 0.28 + ghost.banish * 0.4) * fade * (1 - ghost.reveal * 0.4);
    view.auraMat.color.set(ghost.kind === 'wraith' ? 0x7fe8ff : 0xff2a4a).lerp(UV, ghost.banish);
    const grow = 1 + ghost.dissolve * 0.7 + ghost.banish * 0.08 * Math.sin(t * 40);
    view.body.scale.set(view.baseScale.x * grow, view.baseScale.y * grow, 1);
  }

  private removeGhostView(view: GhostView): void {
    this.scene.remove(view.group);
    view.bodyMat.dispose();
    view.auraMat.dispose();
  }

  private spawnBurst(pos: { x: number; y: number; z: number }): void {
    const count = 160;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1.2 + Math.random() * 3.2);
      velocities[i * 3] = v.x;
      velocities[i * 3 + 1] = v.y + 0.8;
      velocities[i * 3 + 2] = v.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: this.textures.glow,
      color: 0xc3a2ff,
      size: 0.16,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, age: 0 });
  }

  private updateBursts(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!;
      burst.age += dt;
      const attr = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const drag = Math.exp(-dt * 1.8);
      for (let j = 0; j < arr.length; j += 3) {
        burst.velocities[j] = burst.velocities[j]! * drag;
        burst.velocities[j + 1] = burst.velocities[j + 1]! * drag + dt * 0.6;
        burst.velocities[j + 2] = burst.velocities[j + 2]! * drag;
        arr[j] = arr[j]! + burst.velocities[j]! * dt;
        arr[j + 1] = arr[j + 1]! + burst.velocities[j + 1]! * dt;
        arr[j + 2] = arr[j + 2]! + burst.velocities[j + 2]! * dt;
      }
      attr.needsUpdate = true;
      const material = burst.points.material as THREE.PointsMaterial;
      material.opacity = Math.max(0, 1 - burst.age / 1.4);
      if (burst.age > 1.4) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  // ---- static scene ------------------------------------------------------

  private buildCorridor(): void {
    const floorTex = stoneFloorTexture(HALF_WIDTH / 2, LENGTH / 4);
    const wallTex = stoneWallTexture(LENGTH / 4, HEIGHT / 4);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 0.6, roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallTex, bumpScale: 0.8, roughness: 0.92 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 1 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3b3b42, roughness: 0.9, bumpMap: wallTex, bumpScale: 0.4 });
    const zMid = -LENGTH / 2 + 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, LENGTH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, LENGTH), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, HEIGHT, zMid);
    this.scene.add(ceiling);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, HEIGHT), wallMat);
      wall.rotation.y = side * -Math.PI / 2;
      wall.position.set(side * HALF_WIDTH, HEIGHT / 2, zMid);
      wall.receiveShadow = true;
      this.scene.add(wall);
    }

    const back = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, HEIGHT), wallMat);
    back.position.set(0, HEIGHT / 2, -LENGTH + 2);
    back.receiveShadow = true;
    this.scene.add(back);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x140b08, roughness: 0.8 }));
    door.position.set(0, 1.4, -LENGTH + 2.15);
    this.scene.add(door);

    // Gothic pillars and ribbed arches.
    const pillarGeo = new THREE.BoxGeometry(0.55, HEIGHT, 0.55);
    const archGeo = new THREE.TorusGeometry(HALF_WIDTH - 0.3, 0.16, 8, 40, Math.PI);
    for (let z = -3; z > -LENGTH + 3; z -= 5) {
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, stoneMat);
        pillar.position.set(side * (HALF_WIDTH - 0.3), HEIGHT / 2, z);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        this.scene.add(pillar);
      }
      const arch = new THREE.Mesh(archGeo, stoneMat);
      arch.position.set(0, HEIGHT - (HALF_WIDTH - 0.3), z);
      arch.castShadow = true;
      this.scene.add(arch);
    }

    // Rubble and crates for shadow play, spread along the whole walkable length (deterministic layout).
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 1 });
    const rubble: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = 0.5 + ((i * 37) % 5) * 0.1;
      rubble.push([side * (1.9 + ((i * 13) % 7) * 0.1), -6.5 - i * 5.3, w, w * 0.85]);
    }
    for (const [x, z, w, h] of rubble) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.9), rubbleMat);
      box.position.set(x, h / 2, z);
      box.rotation.y = x * z;
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
    }

    // Candles.
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.7 });
    for (const [x, z, seed] of [
      [-2.7, -8.5, 1],
      [2.8, -20.5, 2],
      [-2.8, -32, 3],
      [2.7, -43, 4],
      [-2.7, -54, 5],
    ] as const) {
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.35, 12), waxMat);
      wax.position.set(x, 0.175, z);
      this.scene.add(wax);
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.textures.glow, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      flame.position.set(x, 0.42, z);
      this.scene.add(flame);
      const light = new THREE.PointLight(0xff9a3c, 2.6, 7, 2);
      light.position.set(x, 0.55, z);
      this.scene.add(light);
      this.candles.push({ light, flame, seed });
    }
  }

  private buildDust(): THREE.Points {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * (HALF_WIDTH - 0.2);
      positions[i * 3 + 1] = Math.random() * HEIGHT;
      positions[i * 3 + 2] = -Math.random() * (LENGTH - 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: this.textures.glow,
        color: 0x8fa3b8,
        size: 0.035,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
  }

  private updateDust(dt: number): void {
    const attr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] = arr[i]! - dt * 0.05;
      if (arr[i]! < 0) arr[i] = HEIGHT;
    }
    attr.needsUpdate = true;
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
