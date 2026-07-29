import * as THREE from "three";
import { Terrain } from "../../../packages/simulation/src/Terrain.ts";

/** Adds the static 3D representation of a generated logical world to a group. */
export function addTerrainMeshes(world, group) {
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

/**
 * InstancedMesh draws many copies of one geometry/material in one draw call.
 * It is a good fit for a world made from thousands of repeated tiles.
 */
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
