import * as THREE from "three";

// A scene holds every visible 3D object.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89b9d5);
scene.fog = new THREE.Fog(0x89b9d5, 30, 90);

// A perspective camera makes distant objects appear smaller.
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(14, 15, 18);
camera.lookAt(0, 0, 0);

// The renderer draws the scene through the camera into our canvas.
const canvas = document.querySelector("#world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Lights affect how mesh materials are shaded.
scene.add(new THREE.HemisphereLight(0xd9eeff, 0x31502e, 2.2));
const sun = new THREE.DirectionalLight(0xfff3d1, 2.4);
sun.position.set(12, 20, 8);
sun.castShadow = true;
scene.add(sun);

// Every mesh combines a geometry (shape) and material (surface appearance).
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(28, 28),
  new THREE.MeshStandardMaterial({ color: 0x4f8d45, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(28, 28, 0x365f38, 0x365f38);
grid.position.y = 0.01;
scene.add(grid);

const marker = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.75 }),
);
marker.position.y = 0.5;
marker.castShadow = true;
scene.add(marker);

function resizeRenderer() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resizeRenderer);

// requestAnimationFrame schedules one render per browser repaint.
function render() {
  marker.rotation.y += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
