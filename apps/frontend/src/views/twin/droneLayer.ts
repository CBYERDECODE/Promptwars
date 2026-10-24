import maplibregl, { CustomLayerInterface, CustomRenderMethodInput } from 'maplibre-gl';
import * as THREE from 'three';
import { DRONE_ALTITUDE_M, DronePose } from './sim/drone';
import { toLngLat } from './geo';

/**
 * Three.js custom MapLibre layer that renders the VIRTUAL drone (a stylised
 * quadcopter with a translucent sensor cone) at its simulated pose. The model
 * is drawn ~8x real size so it stays legible at city zoom.
 */
export function createDroneLayer(getPose: () => DronePose | null): CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let map: maplibregl.Map | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const drone = new THREE.Group();
  const rotors: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4, roughness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.4 });
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75 });
  drone.add(new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6), bodyMat));
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2), accentMat);
  nose.position.set(4, 0.4, 0);
  drone.add(nose);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 0.8), bodyMat);
    arm.position.set(dx * 3, 0, dz * 3);
    arm.rotation.y = (dx * dz > 0 ? -1 : 1) * Math.PI / 4;
    drone.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.3, 24), rotorMat);
    rotor.position.set(dx * 6, 1, dz * 6);
    rotors.push(rotor);
    drone.add(rotor);
  }
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(DRONE_ALTITUDE_M * 0.55, DRONE_ALTITUDE_M, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  );
  cone.position.y = -DRONE_ALTITUDE_M / 2 / 8;
  cone.scale.setScalar(1 / 8);
  drone.add(cone);
  drone.scale.setScalar(1);
  scene.add(drone);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 100, 50);
  scene.add(sun);

  return {
    id: 'twin-drone-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    onRemove() {
      renderer?.dispose();
      renderer = null;
    },
    render(_gl, args: CustomRenderMethodInput) {
      const pose = getPose();
      if (!renderer || !map || !pose) return;
      const mc = maplibregl.MercatorCoordinate.fromLngLat(toLngLat(pose.position), DRONE_ALTITUDE_M);
      const s = mc.meterInMercatorCoordinateUnits() * 8;
      const transform = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z ?? 0)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(-pose.headingRad));
      const t = performance.now() / 60;
      rotors.forEach((r, i) => (r.rotation.y = t * (i % 2 ? 1 : -1)));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(transform);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    }
  };
}
