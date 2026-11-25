import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { SoftBodySimulation, SOFT_BODY_DEFAULTS, type SoftBodyParams } from './SoftBodySimulation';

/** A press shorter and stiller than this is a poke instead of a pull. */
const POKE_MAX_PIXELS = 6;
const POKE_MAX_MS = 280;

interface ActivePointer {
  /** Camera-facing drag plane through the grab point, world space. */
  plane: THREE.Plane;
  localPoint: THREE.Vector3;
  localNormal: THREE.Vector3;
  x0: number;
  y0: number;
  t0: number;
  moved: number;
}

export interface SoftBodyProps
  extends Partial<SoftBodyParams>,
    Omit<ComponentProps<'primitive'>, 'object' | keyof SoftBodyParams> {
  /** Any hierarchy containing meshes (e.g. a cloned GLTF scene). Not mutated. */
  object: THREE.Object3D;
  /** Lattice cells along the longest side; changing it rebuilds the simulation. */
  resolution?: number;
  /** Hold the core in place so pulls stretch only the touched part. */
  pinned?: boolean;
  /** Called with the simulation whenever it is (re)built, for stats or imperative control. */
  onSimulation?: (sim: SoftBodySimulation) => void;
}

/**
 * Turns any Object3D into a jelly / plush soft body. Drag to pull a patch of the surface
 * (multi-pointer), click to poke it. While dragging, `controls.enabled` of the default
 * controls is turned off.
 *
 * Simulation runs in this component's local space; the floor is the lowest point of the
 * object at rest, so place the object so that it stands on the ground.
 */
export function SoftBody({
  object,
  resolution = 14,
  pinned = true,
  firmness = SOFT_BODY_DEFAULTS.firmness,
  damping = SOFT_BODY_DEFAULTS.damping,
  gravity = SOFT_BODY_DEFAULTS.gravity,
  grabRadius = SOFT_BODY_DEFAULTS.grabRadius,
  pokeStrength = SOFT_BODY_DEFAULTS.pokeStrength,
  friction = SOFT_BODY_DEFAULTS.friction,
  upright = SOFT_BODY_DEFAULTS.upright,
  onSimulation,
  ...props
}: SoftBodyProps) {
  const sim = useMemo(() => new SoftBodySimulation(object, { resolution }), [object, resolution]);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const pointers = useRef(new Map<number, ActivePointer>());
  const scratch = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      v: new THREE.Vector3(),
      n: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    }),
    []
  );

  useEffect(() => () => sim.dispose(), [sim]);
  useEffect(() => {
    onSimulation?.(sim);
  }, [sim, onSimulation]);

  useEffect(() => {
    sim.setParams({ firmness, damping, gravity, grabRadius, pokeStrength, friction, upright });
  }, [sim, firmness, damping, gravity, grabRadius, pokeStrength, friction, upright]);

  useEffect(() => {
    sim.setPinned(pinned);
  }, [sim, pinned]);

  // Move / up are tracked on the window so a pull keeps going when the pointer leaves the mesh
  useEffect(() => {
    const active = pointers.current;
    const { raycaster, ndc, v } = scratch;
    const syncControls = () => {
      if (controls) controls.enabled = active.size === 0;
      document.body.style.cursor = active.size ? 'grabbing' : '';
    };

    const onMove = (e: PointerEvent) => {
      const p = active.get(e.pointerId);
      if (!p) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(p.plane, v)) sim.moveGrab(e.pointerId, sim.root.worldToLocal(v));
      p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    };

    const onUp = (e: PointerEvent) => {
      const p = active.get(e.pointerId);
      if (!p) return;
      sim.release(e.pointerId);
      if (p.moved < POKE_MAX_PIXELS && performance.now() - p.t0 < POKE_MAX_MS) {
        sim.poke(p.localPoint, p.localNormal);
      }
      active.delete(e.pointerId);
      syncControls();
    };

    const onBlur = () => {
      sim.releaseAll();
      active.clear();
      syncControls();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, [sim, gl, camera, controls, scratch]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const localPoint = sim.root.worldToLocal(e.point.clone());
    // Current (deformed) normal of the hit triangle; mesh geometry is baked in root space
    const localNormal = new THREE.Vector3();
    const mesh = e.object as THREE.Mesh;
    const normals = mesh.geometry?.attributes.normal as THREE.BufferAttribute | undefined;
    if (e.face && normals) {
      for (const i of [e.face.a, e.face.b, e.face.c]) localNormal.add(scratch.n.fromBufferAttribute(normals, i));
      localNormal.normalize();
    }

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()),
      e.point
    );
    pointers.current.set(e.pointerId, {
      plane,
      localPoint,
      localNormal,
      x0: e.nativeEvent.clientX,
      y0: e.nativeEvent.clientY,
      t0: performance.now(),
      moved: 0,
    });
    sim.grab(e.pointerId, localPoint);
    if (controls) controls.enabled = false;
    document.body.style.cursor = 'grabbing';
  };

  useFrame((_, delta) => {
    // Gravity is world-down expressed in the soft body's local space
    const { q, v } = scratch;
    sim.root.getWorldQuaternion(q).invert();
    v.set(0, -1, 0).applyQuaternion(q);
    sim.setGravityDirection(v.x, v.y, v.z);
    sim.update(delta);
  });

  return (
    <primitive
      object={sim.root}
      onPointerDown={onPointerDown}
      onPointerOver={() => {
        if (!pointers.current.size) document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!pointers.current.size) document.body.style.cursor = '';
      }}
      {...props}
    />
  );
}
