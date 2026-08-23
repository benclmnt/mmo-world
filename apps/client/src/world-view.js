import * as THREE from "three";
import { directionDelta } from "../../../packages/simulation/src/movement.ts";
import { isWalkable } from "../../../packages/simulation/src/Terrain.ts";
import { addTerrainMeshes } from "./terrain-view.js";

/** Creates the Three.js scene and exposes only the operations main.js needs. */
export function createWorldView(
  canvas,
  world,
  playerId,
  initialEntities,
  { predictionEnabled = true } = {},
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x89b9d5);
  scene.fog = new THREE.Fog(0x89b9d5, 45, 115);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  const cameraOffset = new THREE.Vector3(12, 17, 16);
  const cameraPan = new THREE.Vector3();
  const initialPlayer = initialEntities.find((entity) => entity.id === playerId);
  const cameraTarget = new THREE.Vector3(initialPlayer.x, 0, initialPlayer.y);
  const cameraDesired = new THREE.Vector3();
  const cameraControls = { zoom: 1 };
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  camera.position.copy(cameraTarget).add(cameraOffset);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const isCoarsePointer = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  // Rendering a shadow map for thousands of terrain instances is costly on a
  // phone. Keep the desktop treatment, but favor consistent frame pacing on
  // coarse-pointer devices where movement is controlled in real time.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCoarsePointer ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !isCoarsePointer;

  addLights(scene);
  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);
  addTerrainMeshes(world, terrainGroup);

  const players = new Map();
  const interpolationDurationMs = 100;
  const predictionTickMs = 100;
  let localAction = { type: "idle" };
  let localActionSequence = -1;
  let nextPredictionAt = performance.now();
  let blockedPrediction;
  let followedEntityId = playerId;
  for (const entity of initialEntities) addPlayer(entity);
  enableCameraControls(
    canvas,
    camera,
    cameraPan,
    cameraForward,
    cameraRight,
    cameraControls,
    Math.max(world.width, world.height) / 2,
  );

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    applySnapshot(entities, acknowledgement = undefined) {
      const activeIds = new Set(entities.map((entity) => entity.id));
      for (const [entityId, player] of players) {
        if (activeIds.has(entityId)) continue;
        scene.remove(player.mesh);
        players.delete(entityId);
      }

      for (const entity of entities) {
        const player = players.get(entity.id) ?? addPlayer(entity);
        if (entity.id === playerId && predictionEnabled) {
          reconcileLocalPlayer(player, entity, acknowledgement);
          continue;
        }
        transitionPlayer(player, entity.x, entity.y);
      }
    },
    setLocalAction(action, sequence) {
      if (!predictionEnabled) return;
      localAction = action;
      localActionSequence = sequence;
      blockedPrediction = undefined;
      // Do not reset the prediction clock for a direction change. Resetting it
      // began a second transition from the middle of the first one, which is
      // what made turns visibly cut and stutter. An idle player still starts
      // its first optimistic tile immediately.
      if (action.type === "move" && playerIsStationary()) {
        nextPredictionAt = performance.now();
        advanceLocalPrediction(nextPredictionAt);
      }
    },
    setFollowEntity(entityId) {
      followedEntityId = players.has(entityId) ? entityId : playerId;
    },
    renderFrame() {
      const now = performance.now();
      if (predictionEnabled) advanceLocalPrediction(now);
      for (const player of players.values()) {
        const progress = Math.min(
          1,
          (now - player.transitionStartedAt) / interpolationDurationMs,
        );
        player.mesh.position.lerpVectors(player.from, player.target, progress);
      }

      const followedPlayer = players.get(followedEntityId) ?? players.get(playerId);
      if (followedPlayer === undefined) return;
      cameraTarget.set(followedPlayer.mesh.position.x, 0, followedPlayer.mesh.position.z);
      // Follow the already-interpolated player directly. A second camera lerp
      // made the look target and camera position converge at different rates,
      // which produced a visible wobble while moving.
      cameraDesired.copy(cameraOffset).multiplyScalar(cameraControls.zoom).add(cameraTarget).add(cameraPan);
      camera.position.copy(cameraDesired);
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
    },
  };

  function transitionPlayer(player, x, y) {
    if (player.target.x === x && player.target.z === y) return;
    player.from.copy(player.mesh.position);
    player.target.set(x, 0, y);
    player.transitionStartedAt = performance.now();
  }

  function advanceLocalPrediction(now) {
    const player = players.get(playerId);
    if (player === undefined) return;
    // A backgrounded tab can miss many client ticks. Resume from the current
    // clock rather than replaying a large, visually meaningless burst.
    if (now - nextPredictionAt > 1_000) nextPredictionAt = now;

    while (now >= nextPredictionAt) {
      nextPredictionAt += predictionTickMs;
      if (localAction.type !== "move") continue;

      const delta = directionDelta(localAction.direction);
      const x = player.target.x + delta.x;
      const y = player.target.z + delta.y;
      if (
        blockedPrediction !== undefined &&
        blockedPrediction.x === x &&
        blockedPrediction.y === y
      ) {
        continue;
      }
      // Terrain is deterministic and known to the client. Entity occupancy is
      // intentionally not predicted; an authoritative snapshot can reject the
      // move and reconcile the visual position below.
      if (world.inBounds(x, y) && isWalkable(world.get(x, y)))
        transitionPlayer(player, x, y);
    }
  }

  function reconcileLocalPlayer(player, entity, acknowledgement) {
    if (
      acknowledgement === undefined ||
      acknowledgement.sequence < localActionSequence
    ) {
      // This snapshot was produced with an older input. Local movement stays
      // authoritative until the server has had a chance to process the turn.
      return;
    }

    if (localAction.type !== "move") {
      transitionPlayer(player, entity.x, entity.y);
      return;
    }

    if (acknowledgement.movementAccepted) {
      // A successful server tick is confirmation, not a reason to pull the
      // player back to an already-past snapshot. Keep advancing locally.
      const wasBlocked = blockedPrediction !== undefined;
      blockedPrediction = undefined;
      if (wasBlocked) transitionPlayer(player, entity.x, entity.y);
      return;
    }

    // Static terrain is rejected before it reaches this point. A rejected
    // walkable step is an occupancy conflict (or another server-only rule), so
    // this is the one case where authority corrects the local prediction.
    const delta = directionDelta(localAction.direction);
    blockedPrediction = { x: entity.x + delta.x, y: entity.y + delta.y };
    transitionPlayer(player, entity.x, entity.y);
  }

  function playerIsStationary() {
    const player = players.get(playerId);
    return player === undefined || (
      player.mesh.position.x === player.target.x &&
      player.mesh.position.z === player.target.z
    );
  }

  function addPlayer(entity) {
    const mesh = createPlayerMesh(entity, entity.id === playerId);
    const player = {
      mesh,
      from: mesh.position.clone(),
      target: mesh.position.clone(),
      transitionStartedAt: performance.now(),
    };
    players.set(entity.id, player);
    scene.add(mesh);
    return player;
  }
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xd9eeff, 0x31502e, 2.2));

  const sun = new THREE.DirectionalLight(0xfff3d1, 2.4);
  sun.position.set(35, 70, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
}

function createPlayerMesh(player, isLocalPlayer) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.45, 4, 8),
    new THREE.MeshStandardMaterial({ color: isLocalPlayer ? 0xffc857 : playerColor(player.id), roughness: 0.65 }),
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

function playerColor(entityId) {
  return new THREE.Color().setHSL((entityId * 0.61803398875) % 1, 0.62, 0.52);
}

/** Adds panning, zoom, and reset controls without changing the player's simulation state. */
function enableCameraControls(canvas, camera, cameraPan, cameraForward, cameraRight, controls, maxPan) {
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
    cameraPan.x = THREE.MathUtils.clamp(cameraPan.x, -maxPan, maxPan);
    cameraPan.z = THREE.MathUtils.clamp(cameraPan.z, -maxPan, maxPan);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointerId) return;

    canvas.releasePointerCapture(activePointerId);
    activePointerId = undefined;
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    controls.zoom = THREE.MathUtils.clamp(controls.zoom + event.deltaY * 0.001, 0.6, 1.8);
  }, { passive: false });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyR" || event.repeat) return;

    controls.zoom = 1;
    cameraPan.set(0, 0, 0);
  });
}
