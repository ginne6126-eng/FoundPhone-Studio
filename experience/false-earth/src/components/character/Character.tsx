import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { CharacterProps } from './config';
import { useCharacterPhysics } from './hooks/useCharacterPhysics';
import { useGameStore } from '../../core/store/gameStore';

export const Character = ({ position = [0, 0, 0], scale = 1, visible = true }: CharacterProps) => {
  const root = useRef<THREE.Group>(null);
  const figure = useRef<THREE.Group>(null);
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const previous = useRef(new THREE.Vector3());
  const phase = useRef(0);
  const physicsScene = useMemo(() => new THREE.Group(), []);
  const setCharacterRef = useGameStore((s) => s.setCharacterRef);
  useCharacterPhysics(root, physicsScene, [], () => undefined);

  useEffect(() => {
    setCharacterRef(root);
    return () => setCharacterRef(null);
  }, [setCharacterRef]);

  useFrame((_, dt) => {
    if (!root.current) return;
    const delta = Math.max(dt, 0.0001);
    const speed = root.current.position.distanceTo(previous.current) / delta;
    previous.current.copy(root.current.position);
    phase.current += delta * (speed > 0.08 ? 9 : 2);
    const amount = Math.min(speed / 2.2, 1);
    const swing = Math.sin(phase.current) * amount * 0.62;
    if (legs[0].current) legs[0].current.rotation.x = swing;
    if (legs[1].current) legs[1].current.rotation.x = -swing;
    if (arms[0].current) arms[0].current.rotation.x = -swing * 0.7;
    if (arms[1].current) arms[1].current.rotation.x = swing * 0.7;
    if (figure.current) figure.current.position.y = Math.abs(Math.sin(phase.current * 2)) * amount * 0.035;
  });

  const mat = (color: string) => <meshStandardMaterial color={color} roughness={0.9} />;
  return <group ref={root} position={position} scale={scale} visible={visible}>
    <group ref={figure}>
      <mesh position={[0,0.78,0]} castShadow><capsuleGeometry args={[0.205,0.36,5,12]}/>{mat('#c6d4d4')}</mesh>
      <mesh position={[0,0.53,0]} castShadow><capsuleGeometry args={[0.19,0.12,4,10]}/>{mat('#687d91')}</mesh>
      <mesh position={[0,1.16,0]} castShadow><sphereGeometry args={[0.225,24,18]}/>{mat('#e8bd9e')}</mesh>
      <mesh position={[0,1.285,-0.018]} castShadow><sphereGeometry args={[0.226,20,14,0,Math.PI*2,0,Math.PI*0.52]}/>{mat('#493b35')}</mesh>
      {[[-0.078,1.17,0.203],[0.078,1.17,0.203]].map((p,i)=><mesh key={i} position={p as [number,number,number]}><sphereGeometry args={[0.012,10,8]}/>{mat('#55443d')}</mesh>)}
      {arms.map((ref,i)=><group key={i} ref={ref} position={[i===0?-0.235:0.235,0.91,0]}>
        <mesh position={[0,-0.17,0]} castShadow><capsuleGeometry args={[0.075,0.23,4,10]}/>{mat('#c6d4d4')}</mesh>
        <mesh position={[0,-0.32,0.015]}><sphereGeometry args={[0.065,12,10]}/>{mat('#e8bd9e')}</mesh>
      </group>)}
      {legs.map((ref,i)=><group key={i} ref={ref} position={[i===0?-0.105:0.105,0.48,0]}>
        <mesh position={[0,-0.19,0]} castShadow><capsuleGeometry args={[0.085,0.27,4,10]}/>{mat('#687d91')}</mesh>
        <mesh position={[0,-0.37,0.045]} castShadow><capsuleGeometry args={[0.07,0.12,4,10]}/>{mat('#e9e5dc')}</mesh>
      </group>)}
    </group>
  </group>;
};
