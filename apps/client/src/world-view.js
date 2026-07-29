import * as THREE from "three";
import { addTerrainMeshes } from "./terrain-view.js";

/** Creates the Three.js scene and exposes only the operations main.js needs. */
export function createWorldView(canvas, world, initialPlayer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x89b9d5);
  scene.fog = new THREE.Fog(0x89b9d5, 45, 115);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  const cameraOffset = new THREE.Vector3(12, 17, 16);
  const cameraPan = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3(initialPlayer.x, 0, initialPlayer.y);
  const cameraDesired = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
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
  enableCameraPanning(canvas, camera, cameraPan, cameraForward, cameraRight);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    movePlayerTo(player) {
      playerTarget.set(player.x, 0, player.y);
    },
    renderFrame() {
      const smoothing = 1 - Math.exp(-12 * clock.getDelta());
      playerMesh.position.lerp(playerTarget, smoothing);
      cameraTarget.set(playerMesh.position.x, 0, playerMesh.position.z);
      cameraDesired.copy(cameraTarget).add(cameraOffset).add(cameraPan);
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
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.45, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.65 }),
  );
  // Capsule height is 0.45 + (2 × 0.24) = 0.93, so its center is 0.465 above ground.
  body.position.y = 0.465;
  body.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2c39b, roughness: 0.8 }),
  );
  head.position.y = 1.05;
  head.castShadow = true;

  group.add(body, head);
  group.position.set(player.x, 0, player.y);
  return group;
}

/** Right-drag moves the camera across the X/Z ground plane while it keeps looking at the player. */
function enableCameraPanning(canvas, camera, cameraPan, cameraForward, cameraRight) {
  let activePointerId;
  let previousX = 0;
  let previousY = 0;

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 2) return;

    activePointerId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(activePointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;

    const deltaX = event.clientX - previousX;
    const deltaY = event.clientY - previousY;
    previousX = event.clientX;
    previousY = event.clientY;

    // Project the camera's view direction onto the horizontal X/Z plane.
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.crossVectors(cameraForward, camera.up).normalize();
    cameraPan.addScaledVector(cameraRight, -deltaX * 0.035);
    cameraPan.addScaledVector(cameraForward, -deltaY * 0.035);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointerId) return;

    canvas.releasePointerCapture(activePointerId);
    activePointerId = undefined;
  });
}
