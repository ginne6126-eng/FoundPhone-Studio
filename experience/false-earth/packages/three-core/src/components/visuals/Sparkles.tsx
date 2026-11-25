import { useEffect, useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { instancedDynamicBufferAttribute, uniform } from 'three/tsl';

/** Every look-and-motion knob. Units are world units (times `unit`) and seconds. */
export interface SparkleSettings {
  /** Per source, per second. */
  rate: number;
  /** Seconds; each particle varies by +-lifeJitter. */
  life: number;
  lifeJitter: number;
  /** Largest size; smaller ones are more common. */
  size: number;
  /** Smallest size as a share of `size`. */
  sizeMin: number;
  /** Downward acceleration. */
  gravity: number;
  /** Share of the source's own velocity a particle leaves with. */
  inherit: number;
  /** Extra upward speed at birth, randomised 50-100%. */
  kick: number;
  /** Random speed at birth, in any direction. */
  jitter: number;
  /** Velocity decay per second. */
  drag: number;
  /** Radius around the source they are born in. */
  spread: number;
  /** 0 white, 1 the source's own colour. */
  tint: number;
  /** Opacity multiplier, capped at fully opaque. */
  intensity: number;
  /** Share of the life spent fading in; the rest fades out. */
  fadeIn: number;
  /** Fade-out curve: 1 linear, higher lingers then drops. */
  fadeOut: number;
  /** How deep the flicker dips: opacity by this much, size by 40% of it. */
  twinkle: number;
  /** Flicker speed, radians per second. */
  twinkleSpeed: number;
  /** Top speed of the in-plane turn, radians per second; each picks +-. */
  spin: number;
  /** Opacity of the soft glow drawn behind each one. */
  halo: number;
  /** Glow size relative to the particle. */
  haloSize: number;
}

export const SPARKLE_DEFAULTS: SparkleSettings = {
  rate: 40,
  life: 2.4,
  lifeJitter: 0.3,
  size: 0.09,
  sizeMin: 0.35,
  gravity: 0.32,
  inherit: 0.3,
  kick: 0,
  jitter: 0.08,
  drag: 0.8,
  spread: 0.1,
  tint: 0,
  intensity: 1,
  fadeIn: 0.125,
  fadeOut: 1.5,
  twinkle: 0.8,
  twinkleSpeed: 9,
  spin: 1.5,
  halo: 0.25,
  haloSize: 1,
};

export interface StarTextureOptions {
  /** Number of rays; 4 is the classic cross sparkle. */
  points?: number;
  /** Ray half-width at the centre, in pixels of a 128 canvas. */
  rayWidth?: number;
  /** Ray length as a share of the half-size (1 reaches the edge). */
  rayLength?: number;
  /** How far the soft core glow reaches (0-1). */
  glow?: number;
  /** Canvas size in pixels. */
  resolution?: number;
}

/** A white n-point star over a soft glow -- white so instance colour tints it. */
export function createStarTexture({
  points = 4, rayWidth = 3, rayLength = 0.97, glow = 0.35, resolution = 128,
}: StarTextureOptions = {}): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;
  const c = resolution / 2;
  const k = resolution / 128;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.min(glow * 0.35, 1), 'rgba(255,255,255,0.75)');
  g.addColorStop(Math.min(glow, 1), 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, resolution, resolution);
  ctx.fillStyle = '#fff';
  const reach = c * rayLength;
  for (let p = 0; p < points; p++) {
    const a = (p / points) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const nx = -dy * rayWidth * k, ny = dx * rayWidth * k;
    ctx.beginPath();
    ctx.moveTo(c + nx, c + ny);
    ctx.lineTo(c + dx * reach, c + dy * reach);
    ctx.lineTo(c - nx, c - ny);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A plain soft disc, for the glow behind each particle. */
export function createGlowTexture(resolution = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;
  const c = resolution / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, resolution, resolution);
  return new THREE.CanvasTexture(canvas);
}

let sharedStar: THREE.Texture | null = null;
let sharedGlow: THREE.Texture | null = null;

export interface SparklesProps {
  /** Objects to shed from. Read through world space, so they can sit anywhere. */
  sources: RefObject<THREE.Object3D | null>[];
  /** One colour per source, blended in by `tint`. Defaults to white. */
  colors?: THREE.ColorRepresentation[];
  /** New particles only while true; live ones always finish. */
  emitting?: boolean;
  /** Scales every distance and speed, e.g. to track the viewport. */
  unit?: number;
  /** Point on each source to emit from, in its local space. */
  offset?: THREE.Vector3;
  /** Any subset of SparkleSettings; the rest come from SPARKLE_DEFAULTS. */
  settings?: Partial<SparkleSettings>;
  /** Pool size -- the most alive at once. */
  max?: number;
  /** Particle shape. Defaults to createStarTexture(). */
  texture?: THREE.Texture;
  /** Glow shape. Defaults to createGlowTexture(). */
  haloTexture?: THREE.Texture;
  blending?: THREE.Blending;
  renderOrder?: number;
}

const ORIGIN = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff');
const DEFAULT_COLORS: THREE.ColorRepresentation[] = ['#ffffff'];

/**
 * Twinkling particles shed off moving objects, falling away in the parent's
 * frame and keeping part of the source's motion as they leave. Flat quads, so
 * they face a camera looking down -Z; one instanced draw, plus one for the glow.
 */
export function Sparkles({
  sources,
  colors = DEFAULT_COLORS,
  emitting = true,
  unit = 1,
  offset = ORIGIN,
  settings,
  max = 700,
  texture,
  haloTexture,
  blending = THREE.NormalBlending,
  renderOrder = 5,
}: SparklesProps) {
  const state = useMemo(() => ({
    pos: new Float32Array(max * 3),
    vel: new Float32Array(max * 3),
    age: new Float32Array(max).fill(1),
    life: new Float32Array(max).fill(1),
    size: new Float32Array(max),
    phase: new Float32Array(max),
    side: new Uint8Array(max),
    angle: new Float32Array(max),
    turn: new Float32Array(max),
    next: 0,
    owed: [] as number[],
    last: [] as THREE.Vector3[],
    primed: false,
  }), [max]);

  const alpha = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(max), 1), [max]);
  const haloStrength = useMemo(() => uniform(SPARKLE_DEFAULTS.halo), []);

  const { mesh, halo } = useMemo(() => {
    const starMap = texture ?? (sharedStar ??= createStarTexture());
    const glowMap = haloTexture ?? (sharedGlow ??= createGlowTexture());

    const material = new THREE.MeshBasicNodeMaterial({
      map: starMap, transparent: true, depthWrite: false, toneMapped: false, blending,
    });
    material.opacityNode = instancedDynamicBufferAttribute(alpha);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, max);
    // Set before the first compile -- added later, the shader never picks it up.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) mesh.setMatrixAt(i, zero);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;

    // Shares the matrices, colours and fade; its own geometry sets its size.
    const haloMaterial = new THREE.MeshBasicNodeMaterial({
      map: glowMap, transparent: true, depthWrite: false, toneMapped: false, blending,
    });
    haloMaterial.opacityNode = instancedDynamicBufferAttribute(alpha).mul(haloStrength);
    const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), haloMaterial, max);
    halo.instanceMatrix = mesh.instanceMatrix;
    halo.instanceColor = mesh.instanceColor;
    halo.frustumCulled = false;
    halo.renderOrder = renderOrder - 1;
    return { mesh, halo };
  }, [alpha, haloStrength, max, texture, haloTexture, blending, renderOrder]);

  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    halo.geometry.dispose();
    (halo.material as THREE.Material).dispose();
  }, [mesh, halo]);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const here = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const hues = useMemo(() => colors.map((c) => new THREE.Color(c)), [colors]);
  const mixed = useMemo(() => colors.map(() => new THREE.Color()), [colors]);

  useFrame((frame, delta) => {
    const o = { ...SPARKLE_DEFAULTS, ...settings };
    const s = state;
    const dt = Math.min(delta, 1 / 20);
    haloStrength.value = o.halo;
    // Kept on the mesh, which is rebuilt with a fresh unit plane.
    const applied = (halo.userData.size as number | undefined) ?? 1;
    if (o.haloSize > 0 && o.haloSize !== applied) {
      halo.geometry.scale(o.haloSize / applied, o.haloSize / applied, 1);
      halo.userData.size = o.haloSize;
    }
    hues.forEach((hue, n) => mixed[n].copy(WHITE).lerp(hue, o.tint));

    sources.forEach((ref, side) => {
      const src = ref.current;
      if (!src || !mesh.parent) return;
      s.last[side] ??= new THREE.Vector3();
      s.owed[side] ??= 0;
      mesh.parent.worldToLocal(src.localToWorld(here.copy(offset)));
      const last = s.last[side];
      const vx = s.primed ? (here.x - last.x) / dt : 0;
      const vy = s.primed ? (here.y - last.y) / dt : 0;
      const vz = s.primed ? (here.z - last.z) / dt : 0;
      last.copy(here);
      if (!emitting) return;
      s.owed[side] += o.rate * dt;
      while (s.owed[side] >= 1) {
        s.owed[side] -= 1;
        const i = s.next;
        s.next = (s.next + 1) % max;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * o.spread * unit;
        s.pos[i * 3] = here.x + Math.cos(a) * r;
        s.pos[i * 3 + 1] = here.y + Math.sin(a) * r;
        s.pos[i * 3 + 2] = here.z + (Math.random() - 0.5) * o.spread * unit;
        s.vel[i * 3] = vx * o.inherit + (Math.random() - 0.5) * o.jitter * unit;
        s.vel[i * 3 + 1] = vy * o.inherit + (Math.random() - 0.3) * o.jitter * unit
          + o.kick * unit * (0.5 + Math.random() * 0.5);
        s.vel[i * 3 + 2] = vz * o.inherit;
        s.age[i] = 0;
        s.life[i] = o.life * (1 - o.lifeJitter + Math.random() * 2 * o.lifeJitter);
        s.size[i] = o.size * unit * (o.sizeMin + Math.random() ** 2 * (1 - o.sizeMin));
        s.phase[i] = Math.random() * Math.PI * 2;
        s.side[i] = side;
        s.angle[i] = Math.random() * Math.PI * 2;
        s.turn[i] = (Math.random() * 2 - 1) * o.spin;
      }
    });
    s.primed = true;

    const damp = Math.exp(-o.drag * dt);
    const t = frame.clock.elapsedTime;
    const fadeIn = Math.max(o.fadeIn, 1e-3);
    for (let i = 0; i < max; i++) {
      const u = s.age[i] / s.life[i];
      if (u >= 1) {
        alpha.array[i] = 0;
        mesh.setMatrixAt(i, matrix.makeScale(0, 0, 0));
        continue;
      }
      s.age[i] += dt;
      s.vel[i * 3] *= damp;
      s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * damp - o.gravity * unit * dt;
      s.vel[i * 3 + 2] *= damp;
      s.pos[i * 3] += s.vel[i * 3] * dt;
      s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;

      const env = Math.min(u / fadeIn, 1) * (1 - u) ** o.fadeOut;
      const dip = o.twinkle * (0.5 - 0.5 * Math.sin(t * o.twinkleSpeed + s.phase[i]));
      alpha.array[i] = Math.min(env * (1 - dip) * o.intensity, 1);
      const sc = s.size[i] * (1 - 0.4 * dip);
      s.angle[i] += s.turn[i] * dt;
      matrix.makeRotationZ(s.angle[i]).scale(scale.set(sc, sc, sc));
      matrix.setPosition(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, mixed[s.side[i]] ?? WHITE);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    alpha.needsUpdate = true;
  });

  return (
    <>
      <primitive object={halo} />
      <primitive object={mesh} />
    </>
  );
}
