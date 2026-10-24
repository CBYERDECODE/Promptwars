import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

const TelemetryPulses: React.FC<{ count: number }> = ({ count }) => {
  const points = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      const r = 1.05; // Slightly outside the globe
      p[i * 3] = r * Math.cos(theta) * Math.sin(phi);
      p[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      p[i * 3 + 2] = r * Math.cos(phi);
    }
    return p;
  }, [count]);

  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.1;
      // Pulse effect
      const s = 1 + Math.sin(state.clock.getElapsedTime() * 2) * 0.02;
      ref.current.scale.set(s, s, s);
    }
  });

  return (
    <Points ref={ref} positions={points} stride={3}>
      <PointMaterial
        transparent
        color="#3B82F6"
        size={0.05}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
};

const Globe: React.FC<{ pulseIntensity: number }> = ({ pulseIntensity }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
      meshRef.current.rotation.x += 0.002;
    }
  });

  return (
    <group>
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
      <TelemetryPulses count={Math.max(20, pulseIntensity * 10)} />
    </group>
  );
};

export const InnovationGlobe: React.FC<{ incidentCount?: number }> = ({ incidentCount = 4 }) => {
  return (
    <div className="relative h-full min-h-[400px] w-full overflow-hidden rounded-2xl border border-slate-200/50 bg-slate-50/50 shadow-inner">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.08),transparent)]" />
      <Canvas
        className="absolute inset-0 h-full w-full touch-none"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 3], fov: 45 }}
      >
        <color attach="background" args={['#F1F5F9']} />
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
        <Globe pulseIntensity={incidentCount} />
      </Canvas>
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 pointer-events-none">
        <div className="flex items-center gap-2 mb-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600/60">Live Telemetry</span>
        </div>
        <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-slate-400">
          {incidentCount} ACTIVE INCIDENT NODES
        </span>
      </div>
    </div>
  );
};
