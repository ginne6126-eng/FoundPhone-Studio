import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { CharacterProps } from './config';
import { useCharacterPhysics } from './hooks/useCharacterPhysics';
import { useGameStore } from '../../core/store/gameStore';

// A quiet, everyday child character built from original geometry. No visual
// shorthand is used to imply an autism diagnosis or a particular personality.
export const Character = ({ position = [0, 0, 0], scale = 1, visible = true }: CharacterProps) => {
  const root = useRef<THREE.Group>(null);
  const figure = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const previous = useRef(new THREE.Vector3());
  const phase = useRef(0);
  const physicsScene = useMemo(() => new THREE.Group(), []);
  const setCharacterRef = useGameStore((s) => s.setCharacterRef);

  // Reuse False Earth's original input, movement solver and follow-camera hook.
  useCharacterPhysics(root, physicsScene, [], () => undefined);

  useEffect(() => {
    setCharacterRef(root);
    return () => setCharacterRef(null);
  }, [setCharacterRef]);

  useFrame((_, dt) => {
    if (!root.current) return;
    const delta = Math.min(Math.max(dt, 0.0001), 0.05);
    const speed = root.current.position.distanceTo(previous.current) / delta;
    previous.current.copy(root.current.position);
    const moving = speed > 0.08;
    phase.current += delta * (moving ? 9 : 1.8);
    const amount = THREE.MathUtils.clamp(speed / 2.2, 0, 1);
    const swing = Math.sin(phase.current) * amount * 0.58;
    const idleSway = Math.sin(phase.current) * (moving ? 0 : 0.025);

    if (legs[0].current) legs[0].current.rotation.x = swing;
    if (legs[1].current) legs[1].current.rotation.x = -swing;
    if (arms[0].current) arms[0].current.rotation.x = -swing * 0.72 + idleSway;
    if (arms[1].current) arms[1].current.rotation.x = swing * 0.72 - idleSway;
    if (figure.current) {
      figure.current.position.y = Math.abs(Math.sin(phase.current * 2)) * amount * 0.028;
      figure.current.rotation.z = idleSway * 0.35;
    }
    if (head.current) head.current.rotation.x = Math.sin(phase.current * 0.5) * 0.012;
  });

  const mat = (color: string, roughness = 0.88) =>
    <meshStandardMaterial color={color} roughness={roughness} />;

  return (
    <group ref={root} position={position} scale={scale} visible={visible}>
      <group ref={figure}>
        {/* Soft, everyday clothes: a muted blue-grey hoodie and dark trousers. */}
        <mesh position={[0, 0.77, 0]} castShadow>
          <capsuleGeometry args={[0.205, 0.35, 6, 14]} />
          {mat('#9aabb5')}
        </mesh>
        <mesh position={[0, 0.56, 0.012]} castShadow>
          <capsuleGeometry args={[0.19, 0.12, 5, 12]} />
          {mat('#465b6d')}
        </mesh>
        {/* Hoodie pocket and drawstrings add small, readable clothing details. */}
        <mesh position={[0, 0.65, 0.184]} castShadow>
          <boxGeometry args={[0.19, 0.105, 0.018]} />
          {mat('#8498a5')}
        </mesh>
        {[-0.035, 0.035].map((x) => (
          <mesh key={x} position={[x, 0.91, 0.194]}>
            <cylinderGeometry args={[0.006, 0.006, 0.13, 8]} />
            {mat('#d5d9d5')}
          </mesh>
        ))}
        {/* Neck and head. Facial details remain understated and natural. */}
        <mesh position={[0, 1.015, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.08, 0.13, 12]} />
          {mat('#d8ad91')}
        </mesh>
        <group ref={head} position={[0, 1.19, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.226, 28, 22]} />
            {mat('#e5b99b')}
          </mesh>
          {/* Hair cap, back hair and a soft fringe. */}
          <mesh position={[0, 0.105, -0.018]} castShadow>
            <sphereGeometry args={[0.232, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.53]} />
            {mat('#493d38')}
          </mesh>
          <mesh position={[0, -0.045, -0.145]} castShadow>
            <sphereGeometry args={[0.178, 20, 16]} />
            {mat('#493d38')}
          </mesh>
          <mesh position={[-0.095, 0.095, 0.171]} rotation={[0.16, 0, -0.18]} castShadow>
            <sphereGeometry args={[0.105, 16, 12]} />
            {mat('#493d38')}
          </mesh>
          <mesh position={[0.015, 0.12, 0.19]} rotation={[0.12, 0, 0.08]} castShadow>
            <sphereGeometry args={[0.11, 16, 12]} />
            {mat('#493d38')}
          </mesh>
          {/* Ears, eyes and a very subtle mouth. */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.222, -0.015, 0]} castShadow>
              <sphereGeometry args={[0.043, 12, 10]} />
              {mat('#dfb092')}
            </mesh>
          ))}
          {[-0.078, 0.078].map((x) => (
            <mesh key={x} position={[x, -0.015, 0.211]}>
              <sphereGeometry args={[0.012, 12, 10]} />
              {mat('#443934', 0.55)}
            </mesh>
          ))}
          <mesh position={[0, -0.092, 0.217]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.018, 0.003, 5, 16, Math.PI]} />
            {mat('#9b625b')}
          </mesh>
        </group>

        {/* Sleeves, hands and articulated trouser legs. */}
        {arms.map((ref, i) => (
          <group key={i} ref={ref} position={[i === 0 ? -0.235 : 0.235, 0.9, 0]}>
            <mesh position={[0, -0.16, 0]} castShadow>
              <capsuleGeometry args={[0.073, 0.23, 5, 12]} />
              {mat('#9aabb5')}
            </mesh>
            <mesh position={[0, -0.315, 0.012]} castShadow>
              <sphereGeometry args={[0.061, 14, 12]} />
              {mat('#e5b99b')}
            </mesh>
          </group>
        ))}
        {legs.map((ref, i) => (
          <group key={i} ref={ref} position={[i === 0 ? -0.105 : 0.105, 0.47, 0]}>
            <mesh position={[0, -0.17, 0]} castShadow>
              <capsuleGeometry args={[0.083, 0.25, 5, 12]} />
              {mat('#465b6d')}
            </mesh>
            <mesh position={[0, -0.365, 0.045]} castShadow>
              <capsuleGeometry args={[0.071, 0.105, 5, 12]} />
              {mat('#e6e1d8')}
            </mesh>
            <mesh position={[0, -0.407, 0.045]}>
              <boxGeometry args={[0.095, 0.012, 0.105]} />
              {mat('#b6b1a8')}
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};
