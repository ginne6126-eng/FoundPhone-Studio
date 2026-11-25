import * as THREE from 'three';

/**
 * Generic jelly / plush soft body for any triangle mesh hierarchy.
 *
 * - The object's meshes are baked into one local space ("root space").
 * - The mesh volume is voxelised into a hexahedral lattice (surface cells + interior
 *   cells found by ray-parity voting along x / y / z, so slightly open meshes still work).
 * - Lattice nodes are simulated with PBD: per-cell co-rotational shape matching with a
 *   volume constraint, a weak whole-body shape match (against sag), optional "pin" of the
 *   core nodes, pointer grabs, pokes, gravity and a floor with friction + jelly bounce.
 * - Render vertices are embedded trilinearly in their cell; normals follow the
 *   cofactor of the (node-averaged) deformation gradient.
 *
 * Deformation is written into CPU vertex buffers, so any material and renderer work unchanged.
 */

/** Tunable material / interaction parameters; all can change while the simulation runs. */
export interface SoftBodyParams {
  /** 0 = wobbly jelly, 1 = plump and firm. */
  firmness: number;
  /** How quickly wobble dies out, 0..1. */
  damping: number;
  /** Gravity acceleration, units / s² (0 disables). */
  gravity: number;
  /** Grab patch radius as a fraction of the model size. */
  grabRadius: number;
  /** Multiplier for click pokes. */
  pokeStrength: number;
  /** Floor friction, 0..1. */
  friction: number;
  /** Unpinned only: pull toward standing upright (0 lets it tip over). */
  upright: number;
}

export interface SoftBodySimulationOptions {
  /** Lattice cells along the longest side of the model. Higher = finer detail, slower. */
  resolution?: number;
}

export interface SoftBodyStats {
  nodes: number;
  cells: number;
  coreNodes: number;
  /** Lattice cell edge length in root-space units. */
  cellSize: number;
}

export const SOFT_BODY_DEFAULTS: SoftBodyParams = {
  firmness: 0.5,
  damping: 0.3,
  gravity: 9.81,
  grabRadius: 0.16,
  pokeStrength: 1,
  friction: 0.85,
  upright: 1,
};

type Vec3Like = { x: number; y: number; z: number };
type TriangleCallback = (p: Float32Array, a: number, b: number, c: number) => void;

interface SoftBodyGrab {
  nodes: Int32Array;
  weights: Float32Array;
  /** Node offsets from the grab point at grab time, root space. */
  offsets: Float32Array;
  start: THREE.Vector3;
  target: THREE.Vector3;
}

interface SoftBodyMeshEntry {
  mesh: THREE.Mesh;
  restPos: Float32Array;
  restNrm: Float32Array;
  /** Lattice cell each vertex is embedded in. */
  cell: Int32Array;
  /** Trilinear coordinates of each vertex inside its cell. */
  uvw: Float32Array;
}

// Corner k = dx + 2·dy + 4·dz, sign vector s_k = (2dx-1, 2dy-1, 2dz-1)
const CS = new Int8Array(24);
for (let k = 0; k < 8; k++) {
  CS[k * 3] = (k & 1) * 2 - 1;
  CS[k * 3 + 1] = ((k >> 1) & 1) * 2 - 1;
  CS[k * 3 + 2] = ((k >> 2) & 1) * 2 - 1;
}

const FIXED_DT = 1 / 60;
const SUBSTEPS = 5;
// Cell stiffness range (jelly → plump), mapped geometrically by `firmness`
const STIFF_MIN = 0.6;
const STIFF_MAX = 60;
// Fraction of the volume error removed per cell per substep
const VOLUME_STIFFNESS = 1;

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Müller et al. 2016 rotation extraction. A, R column-major 3×3; Q quaternion array (warm start). */
function extractRotation(A: Float32Array, Q: Float32Array, o: number, iters: number, R: Float32Array) {
  let qx = Q[o], qy = Q[o + 1], qz = Q[o + 2], qw = Q[o + 3];
  for (let it = 0; it < iters; it++) {
    quatToMat(qx, qy, qz, qw, R);
    const ox =
      R[1] * A[2] - R[2] * A[1] + (R[4] * A[5] - R[5] * A[4]) + (R[7] * A[8] - R[8] * A[7]);
    const oy =
      R[2] * A[0] - R[0] * A[2] + (R[5] * A[3] - R[3] * A[5]) + (R[8] * A[6] - R[6] * A[8]);
    const oz =
      R[0] * A[1] - R[1] * A[0] + (R[3] * A[4] - R[4] * A[3]) + (R[6] * A[7] - R[7] * A[6]);
    const d =
      Math.abs(
        R[0] * A[0] + R[1] * A[1] + R[2] * A[2] +
        R[3] * A[3] + R[4] * A[4] + R[5] * A[5] +
        R[6] * A[6] + R[7] * A[7] + R[8] * A[8]
      ) + 1e-9;
    const wx = ox / d, wy = oy / d, wz = oz / d;
    const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (w < 1e-9) break;
    const s = Math.sin(w * 0.5) / w;
    const ax = wx * s, ay = wy * s, az = wz * s, aw = Math.cos(w * 0.5);
    // q = dq * q
    const nx = aw * qx + ax * qw + ay * qz - az * qy;
    const ny = aw * qy - ax * qz + ay * qw + az * qx;
    const nz = aw * qz + ax * qy - ay * qx + az * qw;
    const nw = aw * qw - ax * qx - ay * qy - az * qz;
    const inv = 1 / Math.hypot(nx, ny, nz, nw);
    qx = nx * inv; qy = ny * inv; qz = nz * inv; qw = nw * inv;
  }
  Q[o] = qx; Q[o + 1] = qy; Q[o + 2] = qz; Q[o + 3] = qw;
  quatToMat(qx, qy, qz, qw, R);
}

function quatToMat(x: number, y: number, z: number, w: number, R: Float32Array) {
  R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y + w * z); R[2] = 2 * (x * z - w * y);
  R[3] = 2 * (x * y - w * z); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z + w * x);
  R[6] = 2 * (x * z + w * y); R[7] = 2 * (y * z - w * x); R[8] = 1 - 2 * (x * x + y * y);
}

/** Plain Float32 copy of an attribute (handles interleaved / quantized / normalized data). */
function toFloat32Attribute(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): THREE.BufferAttribute {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  }
  return new THREE.BufferAttribute(out, attr.itemSize);
}

export class SoftBodySimulation {
  /** Owned by the simulation: render it (e.g. via `<primitive>`); simulation runs in its local space. */
  readonly root = new THREE.Group();
  readonly params: SoftBodyParams = { ...SOFT_BODY_DEFAULTS };
  pinned = false;
  /** True once the body has settled; `update` is a no-op until something wakes it. */
  sleeping = false;
  /** Largest rest bounding-box side, root-space units. */
  size = 0;
  readonly restBox = new THREE.Box3();
  /** Lowest rest node height; nodes collide with this horizontal plane. */
  floorY = 0;
  numNodes = 0;
  numCells = 0;
  private readonly gravityDir = new Float32Array([0, -1, 0]);
  private readonly grabs = new Map<number, SoftBodyGrab>();
  private pinRamp = 0;
  private accumulator = 0;
  private calmFrames = 0;
  private meshes: SoftBodyMeshEntry[] = [];

  private h = 0;
  private origin = [0, 0, 0];
  private dims = [0, 0, 0];
  private cellMap = new Int32Array(0);
  private cellNodes = new Int32Array(0);
  private rest = new Float32Array(0);
  private invIncident = new Float32Array(0);
  private coreNodes = new Int32Array(0);
  private restCentroid = [0, 0, 0];

  private x = new Float32Array(0);
  private prev = new Float32Array(0);
  private v = new Float32Array(0);
  private vyPre = new Float32Array(0);
  private cellQuat = new Float32Array(0);
  private cellF = new Float32Array(0);
  private nodeF = new Float32Array(0);
  private readonly globalQuat = new Float32Array([0, 0, 0, 1]);
  private pinTargets = new Float32Array(0);

  private readonly _A = new Float32Array(9);
  private readonly _R = new Float32Array(9);
  private readonly _w = new Float32Array(8);
  private readonly _c = new THREE.Vector3();
  private readonly _rc = new THREE.Vector3();

  /**
   * @param object any hierarchy containing meshes. It is not mutated: geometries are cloned
   *   (owned and disposed by the simulation), materials are shared with the source.
   */
  constructor(object: THREE.Object3D, { resolution = 14 }: SoftBodySimulationOptions = {}) {
    this.root.name = 'SoftBody';
    this.bakeMeshes(object);
    this.buildLattice(resolution);
    this.embedVertices();
    this.initState();
    this.writeMeshes();
  }

  // ---------------------------------------------------------------- public API

  setParams(params: Partial<SoftBodyParams>) {
    Object.assign(this.params, params);
    this.wake();
  }

  /** Unit gravity direction in root space. */
  setGravityDirection(x: number, y: number, z: number) {
    this.gravityDir[0] = x; this.gravityDir[1] = y; this.gravityDir[2] = z;
  }

  /** Hold the body's core where it currently stands, so pulls stretch only the touched part. */
  setPinned(pinned: boolean) {
    if (pinned === this.pinned) return;
    this.pinned = pinned;
    this.pinRamp = 0;
    if (pinned) this.capturePinTargets();
    this.wake();
  }

  wake() {
    this.sleeping = false;
    this.calmFrames = 0;
  }

  /**
   * Start pulling the surface patch around `point` (root space). Unpinned, the whole body
   * hangs from the grab, weighted toward the touch point.
   */
  grab(id: number, point: Vec3Like) {
    const { x, numNodes, size, pinned } = this;
    const radius = (pinned ? this.params.grabRadius : Math.max(0.3, this.params.grabRadius)) * size;
    const base = pinned ? 0 : 0.06;
    const nodes: number[] = [], weights: number[] = [], offsets: number[] = [];
    for (let i = 0; i < numNodes; i++) {
      const dx = x[i * 3] - point.x, dy = x[i * 3 + 1] - point.y, dz = x[i * 3 + 2] - point.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const w = base + (1 - base) * smooth01(1 - d / radius);
      if (w <= 0) continue;
      nodes.push(i); weights.push(w); offsets.push(dx, dy, dz);
    }
    if (nodes.length === 0) return;
    this.grabs.set(id, {
      nodes: new Int32Array(nodes),
      weights: new Float32Array(weights),
      offsets: new Float32Array(offsets),
      start: new THREE.Vector3(point.x, point.y, point.z),
      target: new THREE.Vector3(point.x, point.y, point.z),
    });
    this.wake();
  }

  /** Move a grab's target (root space). Stretch distance is capped at 0.9 × model size. */
  moveGrab(id: number, point: Vec3Like) {
    const g = this.grabs.get(id);
    if (!g) return;
    g.target.set(point.x, point.y, point.z);
    const maxStretch = this.size * 0.9;
    const d = g.target.distanceTo(g.start);
    if (d > maxStretch) g.target.sub(g.start).multiplyScalar(maxStretch / d).add(g.start);
    if (g.target.y < this.floorY) g.target.y = this.floorY;
    this.wake();
  }

  release(id: number) {
    this.grabs.delete(id);
    this.wake();
  }

  releaseAll() {
    this.grabs.clear();
    this.wake();
  }

  /** Add a uniform velocity (units / s, root space) to every node, e.g. an impact or a knock. */
  addVelocity(x: number, y: number, z: number) {
    const { v, numNodes: N } = this;
    for (let i = 0; i < N; i++) {
      v[i * 3] += x; v[i * 3 + 1] += y; v[i * 3 + 2] += z;
    }
    this.wake();
  }

  /** Add a spin (rad / s, root space) about the current centre of mass, e.g. a twist. */
  addAngularVelocity(x: number, y: number, z: number) {
    const { v, numNodes: N } = this;
    const c = this.getCenter(this._c);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const rx = this.x[o] - c.x, ry = this.x[o + 1] - c.y, rz = this.x[o + 2] - c.z;
      v[o] += y * rz - z * ry;
      v[o + 1] += z * rx - x * rz;
      v[o + 2] += x * ry - y * rx;
    }
    this.wake();
  }

  /** Current centre of mass, root space. */
  getCenter(target = new THREE.Vector3()): THREE.Vector3 {
    const { x, numNodes: N } = this;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += x[i * 3]; cy += x[i * 3 + 1]; cz += x[i * 3 + 2]; }
    return target.set(cx / N, cy / N, cz / N);
  }

  /**
   * The body's overall rigid motion since rest, without its squash: the best-fit rotation about
   * the centre of mass (from the global shape matching) and the centre's travel. A rest-space
   * point p is now at about `position + quaternion · p`, root space. For attaching things that
   * should move with the body but not deform.
   */
  getRigidTransform(position = new THREE.Vector3(), quaternion = new THREE.Quaternion()) {
    const q = this.globalQuat;
    quaternion.set(q[0], q[1], q[2], q[3]);
    const rc = this.restCentroid;
    this.getCenter(position).sub(this._rc.set(rc[0], rc[1], rc[2]).applyQuaternion(quaternion));
    return { position, quaternion };
  }

  /** Impulse at `point` pushing along `-normal` (both root space): a dent plus a wobble. */
  poke(point: Vec3Like, normal: Vec3Like, strength = 1) {
    const { x, v, numNodes, size } = this;
    const radius = size * 0.22;
    const speed = 2.4 * size * strength * this.params.pokeStrength;
    for (let i = 0; i < numNodes; i++) {
      const dx = x[i * 3] - point.x, dy = x[i * 3 + 1] - point.y, dz = x[i * 3 + 2] - point.z;
      const w = 0.12 + 0.88 * smooth01(1 - Math.sqrt(dx * dx + dy * dy + dz * dz) / radius);
      v[i * 3] -= normal.x * speed * w;
      v[i * 3 + 1] -= normal.y * speed * w;
      v[i * 3 + 2] -= normal.z * speed * w;
    }
    this.wake();
  }

  reset() {
    this.x.set(this.rest);
    this.prev.set(this.rest);
    this.v.fill(0);
    this.globalQuat.set([0, 0, 0, 1]);
    for (let c = 0; c < this.numCells; c++) this.cellQuat.set([0, 0, 0, 1], c * 4);
    this.grabs.clear();
    if (this.pinned) this.capturePinTargets();
    this.wake();
    this.writeMeshes();
  }

  /** Advance by a frame delta (seconds) with a fixed 60 Hz step. Returns true while moving. */
  update(delta: number): boolean {
    if (this.sleeping) return false;
    this.accumulator = Math.min(this.accumulator + delta, FIXED_DT * 3);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 2) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps > 0) this.writeMeshes();
    return !this.sleeping;
  }

  /**
   * Frees the cloned geometries' GPU buffers. Three re-uploads them if the root is rendered
   * again (StrictMode remounts reuse the same simulation).
   */
  dispose() {
    for (const { mesh } of this.meshes) mesh.geometry.dispose();
  }

  get stats(): SoftBodyStats {
    return { nodes: this.numNodes, cells: this.numCells, coreNodes: this.coreNodes.length, cellSize: this.h };
  }

  // ---------------------------------------------------------------- building

  private bakeMeshes(object: THREE.Object3D) {
    object.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const m = new THREE.Matrix4();

    object.traverse((node) => {
      const src = node as THREE.Mesh;
      if (!src.isMesh || !src.geometry?.attributes.position) return;
      const geometry = src.geometry.clone();
      geometry.setAttribute('position', toFloat32Attribute(geometry.attributes.position));
      if (geometry.attributes.normal) geometry.setAttribute('normal', toFloat32Attribute(geometry.attributes.normal));
      else geometry.computeVertexNormals();
      geometry.applyMatrix4(m.multiplyMatrices(toRoot, src.matrixWorld));
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const normal = geometry.attributes.normal as THREE.BufferAttribute;
      position.setUsage(THREE.DynamicDrawUsage);
      normal.setUsage(THREE.DynamicDrawUsage);

      const mesh = new THREE.Mesh(geometry, src.material);
      mesh.name = src.name;
      mesh.castShadow = src.castShadow;
      mesh.receiveShadow = src.receiveShadow;
      mesh.renderOrder = src.renderOrder;
      this.root.add(mesh);
      this.meshes.push({
        mesh,
        restPos: (position.array as Float32Array).slice(),
        restNrm: (normal.array as Float32Array).slice(),
        cell: new Int32Array(0),
        uvw: new Float32Array(0),
      });
    });

    if (this.meshes.length === 0) throw new Error('SoftBodySimulation: object contains no meshes');

    for (const { mesh } of this.meshes) {
      mesh.geometry.computeBoundingBox();
      this.restBox.union(mesh.geometry.boundingBox!);
    }
    const size = this.restBox.getSize(new THREE.Vector3());
    this.size = Math.max(size.x, size.y, size.z);

    // The deformed surface can leave the rest bounds: enlarge bounds once so raycasting
    // and frustum culling keep working without recomputing them every frame.
    const margin = this.size * 0.6;
    for (const { mesh } of this.meshes) {
      const g = mesh.geometry;
      g.boundingBox!.expandByScalar(margin);
      g.computeBoundingSphere();
      g.boundingSphere!.radius += margin;
    }
  }

  private forEachTriangle(cb: TriangleCallback) {
    for (const { mesh, restPos } of this.meshes) {
      const index = mesh.geometry.index;
      const count = index ? index.count : restPos.length / 3;
      for (let t = 0; t + 2 < count; t += 3) {
        const a = index ? index.getX(t) : t;
        const b = index ? index.getX(t + 1) : t + 1;
        const c = index ? index.getX(t + 2) : t + 2;
        cb(restPos, a * 3, b * 3, c * 3);
      }
    }
  }

  private buildLattice(resolution: number) {
    const h = this.size / resolution;
    const min = this.restBox.min, max = this.restBox.max;
    const o = [min.x - h * 0.5, min.y - h * 0.5, min.z - h * 0.5];
    const n = [
      Math.ceil((max.x - o[0]) / h + 0.5),
      Math.ceil((max.y - o[1]) / h + 0.5),
      Math.ceil((max.z - o[2]) / h + 0.5),
    ];
    const [nx, ny, nz] = n;
    const cellId = (i: number, j: number, k: number) => i + nx * (j + ny * k);
    const clampI = (v: number, a: number) => Math.min(n[a] - 1, Math.max(0, v));
    const surface = new Uint8Array(nx * ny * nz);

    const markPoint = (x: number, y: number, z: number) => {
      surface[
        cellId(
          clampI(Math.floor((x - o[0]) / h), 0),
          clampI(Math.floor((y - o[1]) / h), 1),
          clampI(Math.floor((z - o[2]) / h), 2)
        )
      ] = 1;
    };

    // 1. Surface cells: every vertex, plus samples on triangles larger than half a cell
    for (const { restPos } of this.meshes) {
      for (let i = 0; i < restPos.length; i += 3) markPoint(restPos[i], restPos[i + 1], restPos[i + 2]);
    }
    this.forEachTriangle((p, a, b, c) => {
      const e = Math.max(
        Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]),
        Math.hypot(p[b] - p[c], p[b + 1] - p[c + 1], p[b + 2] - p[c + 2]),
        Math.hypot(p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2])
      );
      const steps = Math.ceil(e / (h * 0.5));
      if (steps <= 1) return;
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
          const u = i / steps, v = j / steps, w = 1 - u - v;
          markPoint(
            p[a] * w + p[b] * u + p[c] * v,
            p[a + 1] * w + p[b + 1] * u + p[c + 1] * v,
            p[a + 2] * w + p[b + 2] * u + p[c + 2] * v
          );
        }
      }
    });

    // 2. Interior cells: ray parity through cell centres along each axis, majority vote
    const votes = new Uint8Array(nx * ny * nz);
    const jitter = h * 1.234e-4;
    for (let ax = 0; ax < 3; ax++) {
      const bx = (ax + 1) % 3, cx = (ax + 2) % 3;
      const nb = n[bx], nc = n[cx];
      const rows: number[][] = new Array(nb * nc);
      this.forEachTriangle((p, a, b, c) => {
        const pb0 = p[a + bx], pb1 = p[b + bx], pb2 = p[c + bx];
        const pc0 = p[a + cx], pc1 = p[b + cx], pc2 = p[c + cx];
        const j0 = Math.max(0, Math.ceil((Math.min(pb0, pb1, pb2) - o[bx] - jitter) / h - 0.5));
        const j1 = Math.min(nb - 1, Math.floor((Math.max(pb0, pb1, pb2) - o[bx] - jitter) / h - 0.5));
        const k0 = Math.max(0, Math.ceil((Math.min(pc0, pc1, pc2) - o[cx] - jitter) / h - 0.5));
        const k1 = Math.min(nc - 1, Math.floor((Math.max(pc0, pc1, pc2) - o[cx] - jitter) / h - 0.5));
        if (j0 > j1 || k0 > k1) return;
        const det = (pb1 - pb0) * (pc2 - pc0) - (pb2 - pb0) * (pc1 - pc0);
        if (Math.abs(det) < 1e-12) return;
        for (let j = j0; j <= j1; j++) {
          const yb = o[bx] + (j + 0.5) * h + jitter;
          for (let k = k0; k <= k1; k++) {
            const yc = o[cx] + (k + 0.5) * h + jitter;
            const u = ((yb - pb0) * (pc2 - pc0) - (pb2 - pb0) * (yc - pc0)) / det;
            const v = ((pb1 - pb0) * (yc - pc0) - (yb - pb0) * (pc1 - pc0)) / det;
            if (u < 0 || v < 0 || u + v > 1) continue;
            const hit = p[a + ax] + u * (p[b + ax] - p[a + ax]) + v * (p[c + ax] - p[a + ax]);
            (rows[j + nb * k] ||= []).push(hit);
          }
        }
      });
      const idx = [0, 0, 0];
      for (let j = 0; j < nb; j++) {
        for (let k = 0; k < nc; k++) {
          const hits = rows[j + nb * k];
          if (!hits || hits.length < 2) continue;
          hits.sort((p, q) => p - q);
          let h0 = 0;
          for (let i = 0; i < n[ax]; i++) {
            const centre = o[ax] + (i + 0.5) * h;
            while (h0 < hits.length && hits[h0] < centre) h0++;
            if (h0 & 1) {
              idx[ax] = i; idx[bx] = j; idx[cx] = k;
              votes[cellId(idx[0], idx[1], idx[2])]++;
            }
          }
        }
      }
    }

    // 3. Kept cells and their corner nodes
    const cellMap = new Int32Array(nx * ny * nz).fill(-1);
    const nodeMap = new Int32Array((nx + 1) * (ny + 1) * (nz + 1)).fill(-1);
    const nodeId = (i: number, j: number, k: number) => i + (nx + 1) * (j + (ny + 1) * k);
    const cellNodes: number[] = [];
    const nodeGrid: number[] = [];
    let numCells = 0;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = cellId(i, j, k);
          if (!surface[id] && votes[id] < 2) continue;
          cellMap[id] = numCells++;
          for (let c = 0; c < 8; c++) {
            const ci = i + (c & 1), cj = j + ((c >> 1) & 1), ck = k + ((c >> 2) & 1);
            const g = nodeId(ci, cj, ck);
            if (nodeMap[g] < 0) {
              nodeMap[g] = nodeGrid.length / 3;
              nodeGrid.push(ci, cj, ck);
            }
            cellNodes.push(nodeMap[g]);
          }
        }
      }
    }

    const numNodes = nodeGrid.length / 3;
    const rest = new Float32Array(numNodes * 3);
    for (let i = 0; i < numNodes; i++) {
      rest[i * 3] = o[0] + nodeGrid[i * 3] * h;
      rest[i * 3 + 1] = o[1] + nodeGrid[i * 3 + 1] * h;
      rest[i * 3 + 2] = o[2] + nodeGrid[i * 3 + 2] * h;
    }

    const incident = new Uint8Array(numNodes);
    for (const nId of cellNodes) incident[nId]++;

    // Node depth (lattice steps from the boundary) selects the "core" nodes used by Pin
    const depth = new Int32Array(numNodes).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < numNodes; i++) if (incident[i] < 8) { depth[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      const gi = nodeGrid[cur * 3], gj = nodeGrid[cur * 3 + 1], gk = nodeGrid[cur * 3 + 2];
      for (let d = 0; d < 6; d++) {
        const ni = gi + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const nj = gj + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nk = gk + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (ni < 0 || nj < 0 || nk < 0 || ni > nx || nj > ny || nk > nz) continue;
        const nb = nodeMap[nodeId(ni, nj, nk)];
        if (nb >= 0 && depth[nb] < 0) { depth[nb] = depth[cur] + 1; queue.push(nb); }
      }
    }
    let maxDepth = 0;
    for (let i = 0; i < numNodes; i++) maxDepth = Math.max(maxDepth, depth[i]);
    const coreDepth = Math.min(Math.max(1, Math.round(maxDepth * 0.5)), maxDepth);
    const core: number[] = [];
    for (let i = 0; i < numNodes; i++) if (depth[i] >= coreDepth) core.push(i);

    this.h = h;
    this.origin = o;
    this.dims = n;
    this.cellMap = cellMap;
    this.numCells = numCells;
    this.numNodes = numNodes;
    this.cellNodes = new Int32Array(cellNodes);
    this.rest = rest;
    this.invIncident = new Float32Array(numNodes).map((_, i) => 1 / incident[i]);
    this.coreNodes = new Int32Array(core);
    let floorY = Infinity;
    for (let i = 0; i < numNodes; i++) floorY = Math.min(floorY, rest[i * 3 + 1]);
    this.floorY = floorY;
  }

  private embedVertices() {
    const { h, origin: o, dims: n, cellMap } = this;
    const [nx, ny, nz] = n;
    for (const entry of this.meshes) {
      const p = entry.restPos;
      const count = p.length / 3;
      const cell = new Int32Array(count);
      const uvw = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        const fx = (p[v * 3] - o[0]) / h, fy = (p[v * 3 + 1] - o[1]) / h, fz = (p[v * 3 + 2] - o[2]) / h;
        let i = Math.min(nx - 1, Math.max(0, Math.floor(fx)));
        let j = Math.min(ny - 1, Math.max(0, Math.floor(fy)));
        let k = Math.min(nz - 1, Math.max(0, Math.floor(fz)));
        let c = cellMap[i + nx * (j + ny * k)];
        if (c < 0) {
          // Every vertex marks its own cell, so this only guards float edge cases:
          // use the nearest kept cell with extrapolated coordinates.
          let best = Infinity;
          for (let r = 1; r < 4 && best === Infinity; r++) {
            for (let dk = -r; dk <= r; dk++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
              const ii = i + di, jj = j + dj, kk = k + dk;
              if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
              const cc = cellMap[ii + nx * (jj + ny * kk)];
              const dd = di * di + dj * dj + dk * dk;
              if (cc >= 0 && dd < best) { best = dd; c = cc; i = ii; j = jj; k = kk; }
            }
          }
        }
        cell[v] = c;
        uvw[v * 3] = fx - i;
        uvw[v * 3 + 1] = fy - j;
        uvw[v * 3 + 2] = fz - k;
      }
      entry.cell = cell;
      entry.uvw = uvw;
    }
  }

  private initState() {
    const N = this.numNodes;
    this.x = this.rest.slice();
    this.prev = this.rest.slice();
    this.v = new Float32Array(N * 3);
    this.vyPre = new Float32Array(N);
    this.cellQuat = new Float32Array(this.numCells * 4);
    for (let c = 0; c < this.numCells; c++) this.cellQuat[c * 4 + 3] = 1;
    this.cellF = new Float32Array(this.numCells * 9);
    this.nodeF = new Float32Array(N * 9);
    this.pinTargets = new Float32Array(this.coreNodes.length * 3);

    const c = [0, 0, 0];
    for (let i = 0; i < N; i++) for (let a = 0; a < 3; a++) c[a] += this.rest[i * 3 + a] / N;
    this.restCentroid = c;
  }

  // ---------------------------------------------------------------- simulation

  /** Pin targets keep the current XZ position and yaw, standing at rest height. */
  private capturePinTargets() {
    this.shapeMatchGlobal(0);
    const R = this._R;
    const yaw = Math.atan2(R[6], R[0]);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const rc = this.restCentroid;
    let cx = 0, cz = 0;
    const N = this.numNodes;
    for (let i = 0; i < N; i++) { cx += this.x[i * 3] / N; cz += this.x[i * 3 + 2] / N; }
    const core = this.coreNodes;
    for (let k = 0; k < core.length; k++) {
      const i = core[k];
      const rx = this.rest[i * 3] - rc[0], rz = this.rest[i * 3 + 2] - rc[2];
      this.pinTargets[k * 3] = cx + cs * rx + sn * rz;
      this.pinTargets[k * 3 + 1] = this.rest[i * 3 + 1];
      this.pinTargets[k * 3 + 2] = cz - sn * rx + cs * rz;
    }
  }

  private step(frameDt: number) {
    const { x, prev, v, vyPre, numNodes: N, params } = this;
    const dt = frameDt / SUBSTEPS;
    const g = this.gravityDir;
    const gs = params.gravity;
    const drag = Math.exp(-0.12 * dt);
    const vmax = 6 * this.size;

    const firmness = Math.min(1, Math.max(0, params.firmness));
    const stiff = Math.exp(Math.log(STIFF_MIN) + (Math.log(STIFF_MAX) - Math.log(STIFF_MIN)) * firmness);
    const kk = (stiff * dt * dt) / (this.h * this.h);
    const cellK = kk / (1 + kk);
    const globalK = 0.008 * (0.4 + 1.2 * firmness);
    const uprightK = this.pinned ? 0 : 0.004 * params.upright * (this.grabs.size ? 0.6 : 1);

    if (this.pinned) this.pinRamp = Math.min(1, this.pinRamp + frameDt / 0.4);

    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        v[o] = (v[o] + g[0] * gs * dt) * drag;
        v[o + 1] = (v[o + 1] + g[1] * gs * dt) * drag;
        v[o + 2] = (v[o + 2] + g[2] * gs * dt) * drag;
        vyPre[i] = v[o + 1];
        prev[o] = x[o]; prev[o + 1] = x[o + 1]; prev[o + 2] = x[o + 2];
        x[o] += v[o] * dt; x[o + 1] += v[o + 1] * dt; x[o + 2] += v[o + 2] * dt;
      }

      this.solveGrabs(dt);
      this.shapeMatchCells(cellK, VOLUME_STIFFNESS);
      this.shapeMatchGlobal(globalK, uprightK);
      if (this.pinned) this.solvePin(0.5 * this.pinRamp * this.pinRamp);
      this.solveFloor();

      // Velocities, with a jelly bounce for nodes that hit the floor fast
      const invDt = 1 / dt;
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        let vx = (x[o] - prev[o]) * invDt, vy = (x[o + 1] - prev[o + 1]) * invDt, vz = (x[o + 2] - prev[o + 2]) * invDt;
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (sp > vmax) { const f = vmax / sp; vx *= f; vy *= f; vz *= f; }
        if (x[o + 1] <= this.floorY + 1e-4 && vyPre[i] < -1.2) vy = Math.max(vy, -vyPre[i] * 0.32);
        v[o] = vx; v[o + 1] = vy; v[o + 2] = vz;
      }
    }

    // Deformation damping: decay motion relative to the centre-of-mass velocity
    let vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < N; i++) { vx += v[i * 3]; vy += v[i * 3 + 1]; vz += v[i * 3 + 2]; }
    vx /= N; vy /= N; vz /= N;
    const decay = Math.exp(-(1 + 7 * params.damping) * frameDt);
    let maxSq = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      v[o] = vx + (v[o] - vx) * decay;
      v[o + 1] = vy + (v[o + 1] - vy) * decay;
      v[o + 2] = vz + (v[o + 2] - vz) * decay;
      maxSq = Math.max(maxSq, v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2]);
    }

    if (!Number.isFinite(maxSq)) {
      this.reset();
      return;
    }

    const calm = maxSq < (0.004 * this.size) ** 2 && this.grabs.size === 0 && (!this.pinned || this.pinRamp >= 1);
    this.calmFrames = calm ? this.calmFrames + 1 : 0;
    if (this.calmFrames > 45) {
      v.fill(0);
      this.sleeping = true;
    }
  }

  private solveGrabs(dt: number) {
    if (this.grabs.size === 0) return;
    const { x } = this;
    const alpha = 1 / (1 + 2e-6 / (dt * dt));
    for (const g of this.grabs.values()) {
      const { nodes, weights, offsets, target } = g;
      for (let k = 0; k < nodes.length; k++) {
        const o = nodes[k] * 3;
        const f = weights[k] * alpha;
        x[o] += (target.x + offsets[k * 3] - x[o]) * f;
        x[o + 1] += (target.y + offsets[k * 3 + 1] - x[o + 1]) * f;
        x[o + 2] += (target.z + offsets[k * 3 + 2] - x[o + 2]) * f;
      }
    }
  }

  private shapeMatchCells(k: number, kv: number) {
    const { x, cellNodes, cellQuat, numCells } = this;
    const hh = this.h * 0.5;
    const s4h = 1 / (4 * this.h);
    const A = this._A, R = this._R;
    for (let c = 0; c < numCells; c++) {
      const b = c * 8;
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        cx += x[o]; cy += x[o + 1]; cz += x[o + 2];
      }
      cx *= 0.125; cy *= 0.125; cz *= 0.125;
      A.fill(0);
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        const dx = x[o] - cx, dy = x[o + 1] - cy, dz = x[o + 2] - cz;
        const sx = CS[j * 3], sy = CS[j * 3 + 1], sz = CS[j * 3 + 2];
        A[0] += dx * sx; A[1] += dy * sx; A[2] += dz * sx;
        A[3] += dx * sy; A[4] += dy * sy; A[5] += dz * sy;
        A[6] += dx * sz; A[7] += dy * sz; A[8] += dz * sz;
      }
      extractRotation(A, cellQuat, c * 4, 1, R);
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        const sx = CS[j * 3] * hh, sy = CS[j * 3 + 1] * hh, sz = CS[j * 3 + 2] * hh;
        x[o] += (cx + R[0] * sx + R[3] * sy + R[6] * sz - x[o]) * k;
        x[o + 1] += (cy + R[1] * sx + R[4] * sy + R[7] * sz - x[o + 1]) * k;
        x[o + 2] += (cz + R[2] * sx + R[5] * sy + R[8] * sz - x[o + 2]) * k;
      }

      // Volume: jelly is nearly incompressible. Constraint C = det(F) - 1 with
      // F = Σ x_k ⊗ s_k / 4h and gradients ∇_k = cof(F)·s_k / 4h (Σ ∇_k = 0 → momentum kept).
      if (kv <= 0) continue;
      let f0 = 0, f1 = 0, f2 = 0, f3 = 0, f4 = 0, f5 = 0, f6 = 0, f7 = 0, f8 = 0;
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        const sx = CS[j * 3] * s4h, sy = CS[j * 3 + 1] * s4h, sz = CS[j * 3 + 2] * s4h;
        f0 += x[o] * sx; f1 += x[o + 1] * sx; f2 += x[o + 2] * sx;
        f3 += x[o] * sy; f4 += x[o + 1] * sy; f5 += x[o + 2] * sy;
        f6 += x[o] * sz; f7 += x[o + 1] * sz; f8 += x[o + 2] * sz;
      }
      // cof(F) columns: b×c, c×a, a×b
      const c0 = f4 * f8 - f5 * f7, c1 = f5 * f6 - f3 * f8, c2 = f3 * f7 - f4 * f6;
      const c3 = f7 * f2 - f8 * f1, c4 = f8 * f0 - f6 * f2, c5 = f6 * f1 - f7 * f0;
      const c6 = f1 * f5 - f2 * f4, c7 = f2 * f3 - f0 * f5, c8 = f0 * f4 - f1 * f3;
      const J = f0 * c0 + f1 * c1 + f2 * c2;
      const gradSq = (c0 * c0 + c1 * c1 + c2 * c2 + c3 * c3 + c4 * c4 + c5 * c5 + c6 * c6 + c7 * c7 + c8 * c8) * 8 * s4h * s4h;
      if (gradSq < 1e-12) continue;
      const lambda = (-(J - 1) / gradSq) * kv;
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        const sx = CS[j * 3] * s4h * lambda, sy = CS[j * 3 + 1] * s4h * lambda, sz = CS[j * 3 + 2] * s4h * lambda;
        x[o] += c0 * sx + c3 * sy + c6 * sz;
        x[o + 1] += c1 * sx + c4 * sy + c7 * sz;
        x[o + 2] += c2 * sx + c5 * sy + c8 * sz;
      }
    }
  }

  /**
   * Weak whole-body shape match (k) plus a pull toward the upright, yaw-only rest pose (upK).
   * With k = upK = 0 it only refreshes the global rotation in this._R.
   */
  private shapeMatchGlobal(k: number, upK = 0) {
    const { x, rest, numNodes: N, restCentroid: rc } = this;
    const A = this._A, R = this._R;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += x[i * 3]; cy += x[i * 3 + 1]; cz += x[i * 3 + 2]; }
    cx /= N; cy /= N; cz /= N;
    A.fill(0);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const dx = x[o] - cx, dy = x[o + 1] - cy, dz = x[o + 2] - cz;
      const qx = rest[o] - rc[0], qy = rest[o + 1] - rc[1], qz = rest[o + 2] - rc[2];
      A[0] += dx * qx; A[1] += dy * qx; A[2] += dz * qx;
      A[3] += dx * qy; A[4] += dy * qy; A[5] += dz * qy;
      A[6] += dx * qz; A[7] += dy * qz; A[8] += dz * qz;
    }
    extractRotation(A, this.globalQuat, 0, 2, R);
    if (k <= 0 && upK <= 0) return;
    const yaw = Math.atan2(R[6], R[0]);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const qx = rest[o] - rc[0], qy = rest[o + 1] - rc[1], qz = rest[o + 2] - rc[2];
      x[o] += (cx + R[0] * qx + R[3] * qy + R[6] * qz - x[o]) * k + (cx + cs * qx + sn * qz - x[o]) * upK;
      x[o + 1] += (cy + R[1] * qx + R[4] * qy + R[7] * qz - x[o + 1]) * k + (cy + qy - x[o + 1]) * upK;
      x[o + 2] += (cz + R[2] * qx + R[5] * qy + R[8] * qz - x[o + 2]) * k + (cz - sn * qx + cs * qz - x[o + 2]) * upK;
    }
  }

  private solvePin(k: number) {
    const { x, coreNodes, pinTargets: t } = this;
    for (let j = 0; j < coreNodes.length; j++) {
      const o = coreNodes[j] * 3;
      x[o] += (t[j * 3] - x[o]) * k;
      x[o + 1] += (t[j * 3 + 1] - x[o + 1]) * k;
      x[o + 2] += (t[j * 3 + 2] - x[o + 2]) * k;
    }
  }

  private solveFloor() {
    const { x, prev, numNodes: N, floorY } = this;
    const mu = this.params.friction;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      if (x[o + 1] >= floorY) continue;
      x[o + 1] = floorY;
      x[o] = prev[o] + (x[o] - prev[o]) * (1 - mu);
      x[o + 2] = prev[o + 2] + (x[o + 2] - prev[o + 2]) * (1 - mu);
    }
  }

  // ---------------------------------------------------------------- skinning

  private computeNodeF() {
    const { x, cellNodes, cellF, nodeF, numCells, invIncident } = this;
    const s = 1 / (4 * this.h); // F = A·Aqq⁻¹ with unit-sign corners
    nodeF.fill(0);
    for (let c = 0; c < numCells; c++) {
      const b = c * 8;
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        cx += x[o]; cy += x[o + 1]; cz += x[o + 2];
      }
      cx *= 0.125; cy *= 0.125; cz *= 0.125;
      const F = c * 9;
      for (let m = 0; m < 9; m++) cellF[F + m] = 0;
      for (let j = 0; j < 8; j++) {
        const o = cellNodes[b + j] * 3;
        const dx = (x[o] - cx) * s, dy = (x[o + 1] - cy) * s, dz = (x[o + 2] - cz) * s;
        const sx = CS[j * 3], sy = CS[j * 3 + 1], sz = CS[j * 3 + 2];
        cellF[F] += dx * sx; cellF[F + 1] += dy * sx; cellF[F + 2] += dz * sx;
        cellF[F + 3] += dx * sy; cellF[F + 4] += dy * sy; cellF[F + 5] += dz * sy;
        cellF[F + 6] += dx * sz; cellF[F + 7] += dy * sz; cellF[F + 8] += dz * sz;
      }
      for (let j = 0; j < 8; j++) {
        const nf = cellNodes[b + j] * 9;
        for (let m = 0; m < 9; m++) nodeF[nf + m] += cellF[F + m];
      }
    }
    for (let i = 0; i < this.numNodes; i++) {
      const w = invIncident[i];
      for (let m = 0; m < 9; m++) nodeF[i * 9 + m] *= w;
    }
  }

  /** Writes deformed positions and normals into the owned mesh geometries. */
  private writeMeshes() {
    this.computeNodeF();
    const { x, nodeF, cellNodes, _w: w } = this;
    for (const { mesh, cell, uvw, restNrm } of this.meshes) {
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const nrm = mesh.geometry.attributes.normal as THREE.BufferAttribute;
      const P = pos.array as Float32Array, Nn = nrm.array as Float32Array;
      const count = cell.length;
      for (let v = 0; v < count; v++) {
        const u = uvw[v * 3], vv = uvw[v * 3 + 1], ww = uvw[v * 3 + 2];
        const u0 = 1 - u, v0 = 1 - vv, w0 = 1 - ww;
        w[0] = u0 * v0 * w0; w[1] = u * v0 * w0; w[2] = u0 * vv * w0; w[3] = u * vv * w0;
        w[4] = u0 * v0 * ww; w[5] = u * v0 * ww; w[6] = u0 * vv * ww; w[7] = u * vv * ww;
        const b = cell[v] * 8;
        let px = 0, py = 0, pz = 0;
        let f0 = 0, f1 = 0, f2 = 0, f3 = 0, f4 = 0, f5 = 0, f6 = 0, f7 = 0, f8 = 0;
        for (let j = 0; j < 8; j++) {
          const n = cellNodes[b + j];
          const wj = w[j];
          px += x[n * 3] * wj; py += x[n * 3 + 1] * wj; pz += x[n * 3 + 2] * wj;
          const F = n * 9;
          f0 += nodeF[F] * wj; f1 += nodeF[F + 1] * wj; f2 += nodeF[F + 2] * wj;
          f3 += nodeF[F + 3] * wj; f4 += nodeF[F + 4] * wj; f5 += nodeF[F + 5] * wj;
          f6 += nodeF[F + 6] * wj; f7 += nodeF[F + 7] * wj; f8 += nodeF[F + 8] * wj;
        }
        P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;

        // n' = cof(F)·n with F = [a b c]: n.x (b×c) + n.y (c×a) + n.z (a×b)
        const nx = restNrm[v * 3], ny = restNrm[v * 3 + 1], nz = restNrm[v * 3 + 2];
        const ox = nx * (f4 * f8 - f5 * f7) + ny * (f7 * f2 - f8 * f1) + nz * (f1 * f5 - f2 * f4);
        const oy = nx * (f5 * f6 - f3 * f8) + ny * (f8 * f0 - f6 * f2) + nz * (f2 * f3 - f0 * f5);
        const oz = nx * (f3 * f7 - f4 * f6) + ny * (f6 * f1 - f7 * f0) + nz * (f0 * f4 - f1 * f3);
        const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
        if (len > 1e-12) {
          Nn[v * 3] = ox / len; Nn[v * 3 + 1] = oy / len; Nn[v * 3 + 2] = oz / len;
        }
      }
      pos.needsUpdate = true;
      nrm.needsUpdate = true;
    }
  }
}
