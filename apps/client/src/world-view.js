import * as THREE from "three";
import { addTerrainMeshes } from "./terrain-view.js";

/** Creates the Three.js scene and exposes only the operations main.js needs. */
export function createWorldView(canvas, world, initialPlayer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x89b9d5);
  scene.fog = new THREE.Fog(0x89b9d5, 45, 115);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  const cameraOffset = new THREE.Vector3(12, 17, 16);
  const cameraTarget = new THREE.Vector3(initialPlayer.x, 0, initialPlayer.y);
  const cameraDesired = new THREE.Vector3();
  camera.position.copy(cameraTarget).add(cameraOffset);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  addLights(scene);
  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);
  addTerrainMeshes(world, terrainGroup);

  const playerMesh = createPlayerMesh(initialPlayer);
  scene.add(playerMesh);
  const playerTarget = playerMesh.position.clone();
  const clock = new THREE.Clock();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    movePlayerTo(player) {
      playerTarget.set(player.x, 0.61, player.y);
    },
    renderFrame() {
      const smoothing = 1 - Math.exp(-12 * clock.getDelta());
      playerMesh.position.lerp(playerTarget, smoothing);
      cameraTarget.set(playerMesh.position.x, 0, playerMesh.position.z);
      cameraDesired.copy(cameraTarget).add(cameraOffset);
      camera.position.lerp(cameraDesired, smoothing);
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
    },
  };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xd9eeff, 0x31502e, 2.2));

  const sun = new THREE.DirectionalLight(0xfff3d1, 2.4);
  sun.position.set(35, 70, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
}

function createPlayerMesh(player) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.65, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.65 }),
  );
  mesh.castShadow = true;
  mesh.position.set(player.x, 0.61, player.y);
  return mesh;
}
