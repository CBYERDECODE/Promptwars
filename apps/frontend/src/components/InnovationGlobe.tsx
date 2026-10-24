import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';

const Globe: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
      meshRef.current.rotation.x += 0.002;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={1}>
      <Sphere ref={meshRef} args={[1, 64, 64]}>
        <MeshDistortMaterial
          color="#3B82F6"
          attach="material"
          distort={0.3}
          speed={2}
          roughness={0.2}
          metalness={0.8}
        />
      </Sphere>
    </Float>
  );
};

export const InnovationGlobe: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center relative overflow-hidden bg-slate-50/50 rounded-2xl border border-slate-200/50 shadow-inner">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05),transparent)] pointer-events-none" />
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
        <Globe />
      </Canvas>
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 pointer-events-none">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600/60">Rescue Intelligence Engine</span>
        <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-slate-400">Deterministic Allocation Topology</span>
      </div>
    </div>
  );
};
