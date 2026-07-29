import * as THREE from "three";
import { generateWorld } from "../../../packages/simulation/src/generation/generateWorld.ts";
import { Terrain } from "../../../packages/simulation/src/Terrain.ts";

const WORLD_SEED = 20260729;
const world = generateWorld({ seed: WORLD_SEED });

// A scene holds every visible 3D object.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89b9d5);
scene.fog = new THREE.Fog(0x89b9d5, 45, 115);

// A perspective camera makes distant objects appear smaller.
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const worldCenter = world.width / 2 - 0.5;
camera.position.set(worldCenter + 25, 43, worldCenter + 31);
camera.lookAt(worldCenter, 0, worldCenter);

// The renderer draws the scene through the camera into our canvas.
const canvas = document.querySelector("#world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Lights affect how mesh materials are shaded.
scene.add(new THREE.HemisphereLight(0xd9eeff, 0x31502e, 2.2));
const sun = new THREE.DirectionalLight(0xfff3d1, 2.4);
sun.position.set(35, 70, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const terrainGroup = new THREE.Group();
scene.add(terrainGroup);
createTerrainMeshes(world, terrainGroup);

/**
 * InstancedMesh draws many copies of one geometry/material in one draw call.
 * This lets us render thousands of tiles without creating thousands of Meshes.
 */
function createTerrainMeshes(world, group) {
  const grass = [];
  const water = [];
  const rock = [];
  const trees = [];

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tile = world.get(x, y);
      if (tile === Terrain.Grass) grass.push([x, y]);
      if (tile === Terrain.Water) water.push([x, y]);
      if (tile === Terrain.Rock) rock.push([x, y]);
      if (tile === Terrain.Tree) trees.push([x, y]);
    }
  }

  addTileInstances(group, grass, 0x5a9b50, 0.16);
  addTileInstances(group, water, 0x3a86b9, 0.08);
  addTileInstances(group, rock, 0x788078, 0.48);
  addTileInstances(group, trees, 0x4a8747, 0.16);
  addTreeInstances(group, trees);
}

function addTileInstances(group, positions, color, height) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.98, height, 0.98),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    positions.length,
  );
  const matrix = new THREE.Matrix4();
  positions.forEach(([x, y], index) => {
    matrix.makeTranslation(x, height / 2, y);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addTreeInstances(group, positions) {
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.14, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x6e4b2f, roughness: 1 }),
    positions.length,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.42, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x24613b, roughness: 1 }),
    positions.length,
  );
  const matrix = new THREE.Matrix4();
  positions.forEach(([x, y], index) => {
    matrix.makeTranslation(x, 0.56, y);
    trunk.setMatrixAt(index, matrix);
    matrix.makeTranslation(x, 1.45, y);
    canopy.setMatrixAt(index, matrix);
  });
  trunk.castShadow = true;
  canopy.castShadow = true;
  group.add(trunk, canopy);
}

function resizeRenderer() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resizeRenderer);

document.querySelector("#world-seed").textContent = String(WORLD_SEED);

// requestAnimationFrame schedules one render per browser repaint.
function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
