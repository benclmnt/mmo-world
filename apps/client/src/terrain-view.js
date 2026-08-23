import * as THREE from "three";
import { Terrain } from "../../../packages/simulation/src/Terrain.ts";
import { hashToUnit } from "../../../packages/simulation/src/generation/rng.ts";

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

  addFlatTileInstances(group, grass, 0x5a9b50, 0.16, world.seed, 1);
  addFlatTileInstances(group, water, 0x3a86b9, 0.08, world.seed, 2);
  addFlatTileInstances(group, rock, 0x66706a, 0.16, world.seed, 3);
  const rockResources = addRockInstances(group, rock, world.seed);
  addFlatTileInstances(group, trees, 0x4a8747, 0.16, world.seed, 4);
  const treeResources = addTreeInstances(group, trees, world.seed);
  const changedNodes = new Map();

  return {
    /** Resource snapshots omit full nodes, so first restore the prior sparse set. */
    applyResourceNodes(nodes) {
      for (const node of changedNodes.values()) {
        resourceViewFor(node.resource).setAvailability(node.x, node.y, 1);
      }
      changedNodes.clear();
      for (const node of nodes) {
        const availability = node.remaining / node.capacity;
        if (availability === 1) continue;
        resourceViewFor(node.resource).setAvailability(node.x, node.y, availability);
        changedNodes.set(`${node.x},${node.y}`, node);
      }
    },
  };

  function resourceViewFor(resource) {
    return resource === "wood" ? treeResources : rockResources;
  }
}

function addFlatTileInstances(group, positions, color, surfaceHeight, seed, salt) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    positions.length,
  );
  const matrix = new THREE.Matrix4();
  const instanceColor = new THREE.Color();

  positions.forEach(([x, y], index) => {
    matrix.makeRotationX(-Math.PI / 2);
    matrix.setPosition(x, surfaceHeight, y);
    mesh.setMatrixAt(index, matrix);
    setVariedColor(mesh, index, color, hashToUnit(seed, x, y, salt), instanceColor);
  });

  mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addRockInstances(group, positions, seed) {
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.52, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    positions.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  const instanceColor = new THREE.Color();

  positions.forEach(([x, y], index) => {
    const variation = hashToUnit(seed, x, y, 5);
    const size = 0.75 + variation * 0.4;
    position.set(x, 0.16 + 0.39 * size, y);
    rotation.setFromAxisAngle(axisY, variation * Math.PI * 2);
    scale.set(size, 0.75 * size, size);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    setVariedColor(mesh, index, 0x788078, variation, instanceColor);
  });
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const indexByPosition = new Map(positions.map(([x, y], index) => [`${x},${y}`, index]));
  return {
    setAvailability(x, y, availability) {
      const index = indexByPosition.get(`${x},${y}`);
      if (index === undefined) return;
      const variation = hashToUnit(seed, x, y, 5);
      const full = new THREE.Color(0x788078).multiplyScalar(0.88 + variation * 0.22);
      mesh.setColorAt(index, full.lerp(new THREE.Color(0x4c514d), 1 - availability));
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

function addTreeInstances(group, positions, seed) {
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.14, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    positions.length,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.42, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    positions.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  const trunkColor = new THREE.Color();
  const canopyColor = new THREE.Color();

  positions.forEach(([x, y], index) => {
    const variation = hashToUnit(seed, x, y, 6);
    const size = 0.8 + variation * 0.35;
    rotation.setFromAxisAngle(axisY, variation * Math.PI * 2);
    position.set(x, 0.16 + 0.4 * size, y);
    scale.set(size, size, size);
    matrix.compose(position, rotation, scale);
    trunk.setMatrixAt(index, matrix);
    setVariedColor(trunk, index, 0x6e4b2f, variation, trunkColor);
    position.set(x, 0.16 + 1.4 * size, y);
    matrix.compose(position, rotation, scale);
    canopy.setMatrixAt(index, matrix);
    setVariedColor(canopy, index, 0x24613b, variation, canopyColor);
  });
  trunk.instanceColor.needsUpdate = true;
  canopy.instanceColor.needsUpdate = true;
  trunk.castShadow = true;
  canopy.castShadow = true;
  group.add(trunk, canopy);

  const indexByPosition = new Map(positions.map(([x, y], index) => [`${x},${y}`, index]));
  return {
    setAvailability(x, y, availability) {
      const index = indexByPosition.get(`${x},${y}`);
      if (index === undefined) return;
      const variation = hashToUnit(seed, x, y, 6);
      const multiplier = 0.88 + variation * 0.22;
      trunk.setColorAt(index, new THREE.Color(0x6e4b2f).multiplyScalar(multiplier).lerp(new THREE.Color(0x4b3928), 1 - availability));
      canopy.setColorAt(index, new THREE.Color(0x24613b).multiplyScalar(multiplier).lerp(new THREE.Color(0x6a5940), 1 - availability));
      trunk.instanceColor.needsUpdate = true;
      canopy.instanceColor.needsUpdate = true;
    },
  };
}

function setVariedColor(mesh, index, baseColor, variation, target) {
  target.set(baseColor).multiplyScalar(0.88 + variation * 0.22);
  mesh.setColorAt(index, target);
}
