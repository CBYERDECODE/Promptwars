import React, { useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  edgeKey,
  twinRoadElevationM,
  type TwinCity,
  type TwinDroneMission,
  type TwinFloodAssessment,
  type TwinRoute
} from '@resq-ai/shared';
import {
  DRONE_ALTITUDE_M,
  EXPOSURE_HEX,
  PLAN_TO_WORLD,
  SEVERITY_HEX,
  TONE_HEX,
  WORLD_SPAN,
  buildingHeightWorld,
  dronePoseAt,
  elevationToWorld,
  nodeElevationM,
  planToWorld,
  roadWorldGeometry
} from './twinLayout';

/**
 * The 3D Disaster Twin scene.
 *
 * ⚠️ SIMULATED: every block, road, elevation, water depth and flight path below
 * is synthetic and exists only to rehearse a decision. The scene is rendered
 * with React Three Fiber over WebGL; nothing here talks to a real asset.
 *
 * ACCESSIBILITY: the canvas is hidden from assistive technology on purpose. The
 * same figures are exposed as real text in the panels and in the building table
 * beside it, so no information lives only inside the 3D view.
 */

interface SceneProps {
  city: TwinCity;
  flood: TwinFloodAssessment;
  /** Routes to draw solid: the current plan(s). */
  routes: TwinRoute[];
  /** The previous route, drawn as a dashed reference for comparison. */
  baselineRoute: TwinRoute | null;
  mission: TwinDroneMission | null;
  /** 0..1 progress of the virtual drone along its planned flight path. */
  droneProgress: number;
  /** True while the drone mission is running (drives the pulse animation). */
  droneRunning: boolean;
  /** True to lock the camera to the drone. */
  cameraFollow: boolean;
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string | null) => void;
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * Keeps the composition readable: when following the drone the camera eases in
 * behind it; otherwise it is left entirely to the user's orbit input.
 */
const CameraRig: React.FC<{ focus: [number, number, number]; follow: boolean }> = ({
  focus,
  follow
}) => {
  const camera = useThree(state => state.camera);
  const controls = useThree(state => state.controls) as ControlsLike | null;

  useFrame((_state, delta) => {
    if (!follow || !controls) return;
    // Frame-rate independent easing, so the move feels identical at 30 and 144 Hz.
    const ease = 1 - Math.pow(0.001, delta);
    const target = new THREE.Vector3(focus[0], focus[1], focus[2]);
    controls.target.lerp(target, ease);
    const desired = target.clone().add(new THREE.Vector3(0, 3.6, 5.4));
    camera.position.lerp(desired, ease * 0.85);
    controls.update();
  });

  return null;
};

/* ------------------------------------------------------------------ */
/* Ground and terrain                                                  */
/* ------------------------------------------------------------------ */

const Terrain: React.FC<{ city: TwinCity }> = ({ city }) => (
  <group>
    {/* Base plate at the simulated datum. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={false}>
      <planeGeometry args={[WORLD_SPAN * 1.45, WORLD_SPAN * 1.45]} />
      <meshStandardMaterial color="#F1F5F9" roughness={1} metalness={0} />
    </mesh>

    <gridHelper args={[WORLD_SPAN * 1.35, 18, '#CBD5E1', '#E2E8F0']} position={[0, 0.002, 0]} />

    {/*
      One terrace per road node, its top face at that node's synthetic ground
      elevation. The varying heights ARE the modelled terrain: the west bank is
      low, Cedar Hollow and Hilltop sit high.
    */}
    {city.graph.nodes.map(node => {
      const [wx, wz] = planToWorld(node.x, node.y);
      const elevation = nodeElevationM(city, node.id);
      const height = elevationToWorld(elevation);
      return (
        <mesh key={node.id} position={[wx, height / 2, wz]}>
          <cylinderGeometry args={[WORLD_SPAN * 0.078, WORLD_SPAN * 0.082, height, 20]} />
          <meshStandardMaterial color="#E9EEF5" roughness={0.95} metalness={0} />
        </mesh>
      );
    })}
  </group>
);

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

const Roads: React.FC<{ city: TwinCity; flood: TwinFloodAssessment }> = ({ city, flood }) => {
  const deckByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of city.graph.edges) {
      map.set(edgeKey(edge.from, edge.to), twinRoadElevationM(city, edge));
    }
    return map;
  }, [city]);

  return (
    <group>
      {flood.roads.map(road => {
        const geometry = roadWorldGeometry(
          city,
          road.from,
          road.to,
          deckByKey.get(road.edge_key) ?? 4
        );
        if (!geometry) return null;
        const [startX, startY, startZ] = geometry.start;
        const [endX, , endZ] = geometry.end;
        const angle = Math.atan2(-(endZ - startZ), endX - startX);

        return (
          <mesh
            key={road.edge_key}
            position={[(startX + endX) / 2, startY + 0.015, (startZ + endZ) / 2]}
            rotation={[0, angle, 0]}
          >
            <boxGeometry args={[geometry.length, 0.03, road.accessible ? 0.26 : 0.34]} />
            <meshStandardMaterial
              color={road.accessible ? '#94A3B8' : TONE_HEX.critical}
              roughness={0.9}
              metalness={0}
            />
          </mesh>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

const Buildings: React.FC<{
  city: TwinCity;
  flood: TwinFloodAssessment;
  selectedId: string | null;
  onSelect: (buildingId: string) => void;
}> = ({ city, flood, selectedId, onSelect }) => {
  const exposureByBuilding = useMemo(
    () => new Map(flood.buildings.map(state => [state.building_id, state])),
    [flood]
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <group>
      {city.buildings.map(building => {
        const state = exposureByBuilding.get(building.id);
        const height = buildingHeightWorld(building.floors, building.floor_height_m);
        const base = elevationToWorld(building.ground_elevation_m);
        const [wx, wz] = planToWorld(building.x, building.y);
        const selected = selectedId === building.id;
        const hovered = hoveredId === building.id;

        return (
          <mesh
            key={building.id}
            position={[wx, base + height / 2, wz]}
            onClick={event => {
              event.stopPropagation();
              onSelect(building.id);
            }}
            onPointerOver={event => {
              event.stopPropagation();
              setHoveredId(building.id);
            }}
            onPointerOut={() => setHoveredId(current => (current === building.id ? null : current))}
          >
            <boxGeometry args={[building.width * PLAN_TO_WORLD, height, building.depth * PLAN_TO_WORLD]} />
            <meshStandardMaterial
              color={state ? EXPOSURE_HEX[state.exposure] : '#E2E8F0'}
              emissive={selected ? TONE_HEX.accent : hovered ? '#93C5FD' : '#000000'}
              emissiveIntensity={selected ? 0.6 : hovered ? 0.32 : 0}
              roughness={0.7}
              metalness={0.05}
            />
          </mesh>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

const Water: React.FC<{ waterLevelM: number }> = ({ waterLevelM }) => {
  const y = elevationToWorld(waterLevelM);
  if (waterLevelM <= 0) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[WORLD_SPAN * 1.45, WORLD_SPAN * 1.45]} />
      <meshStandardMaterial
        color="#38BDF8"
        transparent
        opacity={0.42}
        roughness={0.25}
        metalness={0.1}
        depthWrite={false}
      />
    </mesh>
  );
};

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

/** World polyline for a route, draped over the modelled node elevations. */
function routeWorldPoints(city: TwinCity, route: TwinRoute): Array<[number, number, number]> {
  return route.path.map(nodeId => {
    const node = city.graph.nodes.find(candidate => candidate.id === nodeId);
    if (!node) return [0, 0, 0] as [number, number, number];
    const [wx, wz] = planToWorld(node.x, node.y);
    return [wx, elevationToWorld(nodeElevationM(city, nodeId) + 9), wz] as [number, number, number];
  });
}

const RouteLines: React.FC<{
  city: TwinCity;
  routes: TwinRoute[];
  baselineRoute: TwinRoute | null;
}> = ({ city, routes, baselineRoute }) => (
  <group>
    {baselineRoute && baselineRoute.path.length > 1 && (
      <Line
        points={routeWorldPoints(city, baselineRoute)}
        color="#94A3B8"
        lineWidth={1.6}
        dashed
        dashSize={0.16}
        gapSize={0.12}
        transparent
        opacity={0.85}
      />
    )}

    {routes.map(route => {
      if (route.path.length < 2) return null;
      const tone = !route.reachable ? 'critical' : route.within_sla ? 'accent' : 'warning';
      return (
        <Line
          key={route.signature}
          points={routeWorldPoints(city, route)}
          color={TONE_HEX[tone]}
          lineWidth={3}
        />
      );
    })}
  </group>
);

/* ------------------------------------------------------------------ */
/* Incidents, units and drone                                          */
/* ------------------------------------------------------------------ */

const IncidentPins: React.FC<{ city: TwinCity; flood: TwinFloodAssessment }> = ({ city, flood }) => {
  const floodedNodes = useMemo(() => {
    const blocked = new Set(
      flood.roads.filter(road => !road.accessible).flatMap(road => [road.from, road.to])
    );
    return blocked;
  }, [flood]);

  return (
    <group>
      {city.incidents.map(incident => {
        const node = city.graph.nodes.find(candidate => candidate.id === incident.node_id);
        if (!node) return null;
        const [wx, wz] = planToWorld(node.x, node.y);
        const base = elevationToWorld(nodeElevationM(city, incident.node_id));
        const stranded = floodedNodes.has(incident.node_id);
        const colour = stranded ? TONE_HEX.critical : SEVERITY_HEX[incident.severity];

        return (
          <group key={incident.id} position={[wx, base, wz]}>
            {/* Beacon mast: taller for more severe incidents. */}
            <mesh position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 1.1, 8]} />
              <meshStandardMaterial color={colour} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.18, 0]}>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial
                color={colour}
                emissive={colour}
                emissiveIntensity={0.75}
                roughness={0.3}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.14, 0.2, 24]} />
              <meshBasicMaterial color={colour} transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

const UnitPins: React.FC<{ city: TwinCity }> = ({ city }) => (
  <group>
    {city.units.map(unit => {
      const node = city.graph.nodes.find(candidate => candidate.id === unit.home_node);
      if (!node) return null;
      const [wx, wz] = planToWorld(node.x, node.y);
      const base = elevationToWorld(nodeElevationM(city, unit.home_node));
      const colour = unit.type === 'AMBULANCE' ? '#0EA5E9' : '#0F766E';
      return (
        <mesh key={unit.id} position={[wx, base + 0.09, wz]}>
          <boxGeometry args={[0.17, 0.16, 0.17]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.28} roughness={0.4} />
        </mesh>
      );
    })}
  </group>
);

const DroneMission: React.FC<{
  city: TwinCity;
  mission: TwinDroneMission;
  progress: number;
  running: boolean;
}> = ({ city, mission, progress, running }) => {
  const pose = dronePoseAt(city, mission, progress);
  const [dx, dz] = planToWorld(pose.x, pose.y);
  const dy = elevationToWorld(pose.altitude_m);
  const markerRef = React.useRef<THREE.Group>(null);

  // A gentle bob makes it read as an aircraft without being distracting.
  useFrame(state => {
    if (!markerRef.current || !running) return;
    markerRef.current.position.y = dy + Math.sin(state.clock.getElapsedTime() * 1.8) * 0.04;
  });

  const pathPoints: Array<[number, number, number]> = useMemo(() => {
    const baseNode = city.graph.nodes.find(node => node.id === mission.base_node);
    const base = baseNode ? planToWorld(baseNode.x, baseNode.y) : ([0, 0] as [number, number]);
    return [
      [base[0], dy, base[1]],
      ...mission.points.map(point => {
        const [wx, wz] = planToWorld(point.x, point.y);
        return [wx, dy, wz] as [number, number, number];
      })
    ];
  }, [city, mission, dy]);

  return (
    <group>
      {pathPoints.length > 1 && (
        <Line points={pathPoints} color={TONE_HEX.uncertain} lineWidth={1.4} dashed dashSize={0.12} gapSize={0.1} />
      )}

      {/* Planned inspection stops: outlined until flown, filled afterwards. */}
      {mission.points.map(point => {
        const [wx, wz] = planToWorld(point.x, point.y);
        const y = elevationToWorld(city.buildings.find(b => b.id === point.building_id)?.ground_elevation_m ?? 4);
        return (
          <mesh key={point.id} rotation={[-Math.PI / 2, 0, 0]} position={[wx, y + 0.03, wz]}>
            <ringGeometry args={[0.1, 0.14, 20]} />
            <meshBasicMaterial color={TONE_HEX.uncertain} transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
        );
      })}

      <group ref={markerRef} position={[dx, dy, dz]}>
        <mesh>
          <octahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial
            color="#0F172A"
            emissive={TONE_HEX.accent}
            emissiveIntensity={0.6}
            roughness={0.3}
          />
        </mesh>
        {/* Tether to the ground makes the altitude legible. */}
        <mesh position={[0, -dy / 2, 0]}>
          <cylinderGeometry args={[0.004, 0.004, dy, 6]} />
          <meshBasicMaterial color={TONE_HEX.uncertain} transparent opacity={0.35} />
        </mesh>
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export const TwinScene: React.FC<SceneProps> = ({
  city,
  flood,
  routes,
  baselineRoute,
  mission,
  droneProgress,
  droneRunning,
  cameraFollow,
  selectedBuildingId,
  onSelectBuilding
}) => {
  const dronePose = mission ? dronePoseAt(city, mission, droneProgress) : null;
  const [droneX, droneZ] = dronePose ? planToWorld(dronePose.x, dronePose.y) : [0, 0];
  const droneY = elevationToWorld(DRONE_ALTITUDE_M);

  const selectedBuilding = selectedBuildingId
    ? city.buildings.find(building => building.id === selectedBuildingId) ?? null
    : null;
  const focus: [number, number, number] = selectedBuilding
    ? (() => {
        const [wx, wz] = planToWorld(selectedBuilding.x, selectedBuilding.y);
        return [wx, elevationToWorld(selectedBuilding.ground_elevation_m) + 0.5, wz];
      })()
    : [droneX, droneY, droneZ];

  return (
    <Canvas
      className="h-full w-full touch-none"
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 8.5, 9.5], fov: 42, near: 0.1, far: 80 }}
      onPointerMissed={() => onSelectBuilding(null)}
    >
      <color attach="background" args={['#F8FAFC']} />
      <hemisphereLight args={['#FFFFFF', '#CBD5E1', 1.05]} />
      <directionalLight position={[6, 12, 7]} intensity={1.15} />
      <directionalLight position={[-7, 6, -6]} intensity={0.35} />

      <Terrain city={city} />
      <Roads city={city} flood={flood} />
      <Buildings
        city={city}
        flood={flood}
        selectedId={selectedBuildingId}
        onSelect={onSelectBuilding}
      />
      <Water waterLevelM={flood.water_level_m} />
      <RouteLines city={city} routes={routes} baselineRoute={baselineRoute} />
      <IncidentPins city={city} flood={flood} />
      <UnitPins city={city} />
      {mission && (
        <DroneMission city={city} mission={mission} progress={droneProgress} running={droneRunning} />
      )}

      <CameraRig focus={focus} follow={cameraFollow} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={3}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0.4, 0]}
      />
    </Canvas>
  );
};
