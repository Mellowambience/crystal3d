// crystal.js — 3D Pokémon Crystal overworld engine (Three.js)
// Loads a REAL Crystal tileset PNG as the ground, the Crocotile-authored
// environment model, and a 3rd-person 3/4 follow camera with a trainer avatar.
import * as THREE from 'three';
import { loadCrocotile } from './crocotile.js';

const TILE = 1.0;            // world units per Crystal tile (16px source)
const MAP_W = 40, MAP_H = 40; // overworld grid we build

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a14);
scene.fog = new THREE.Fog(0x0d0a14, 20, 70);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
camera.position.set(MAP_W / 2, 1.7, MAP_H / 2 + 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lights — candlelit dusk
const hemi = new THREE.HemisphereLight(0xbb88ff, 0x221133, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.1);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
scene.add(sun);

// ---- Ground: real Crystal tileset, repeated across the overworld ----
const loader = new THREE.TextureLoader();
loader.load('./assets/tileset_ice.png', (tex) => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(MAP_W / 2, MAP_H / 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // keep the crisp pixel look
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
});

// A few raised "buildings" using another Crystal tileset, to give 3D depth
loader.load('./assets/tileset_com.png', (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 5 + Math.random() * 4, 4), mat);
    b.position.set(6 + i * 5, b.geometry.parameters.height / 2, 10 + (i % 2) * 6);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
  }
});

// ---- Crocotile-authored environment model (real asset) ----
loader.load('./assets/environment.crocotile', async (texunused) => {
  // fetch as JSON (TextureLoader won't parse JSON; load text instead)
});
fetch('./assets/environment.crocotile')
  .then((r) => r.json())
  .then((json) => {
    const env = loadCrocotile(json, {
      onSkybox: (skyTex) => { scene.background = skyTex; },
    });
    env.position.set(MAP_W / 2, 0, MAP_H / 2);
    env.scale.setScalar(0.05); // Crocotile grid units -> our world
    scene.add(env);
    console.log('[crocotile] loaded', (json.objects || []).length, 'objects');
  })
  .catch((e) => console.warn('[crocotile] load failed:', e));

// ---- Player controller (pointer lock FPS) ----
// ---- 3rd-person 3/4 follow camera + visible trainer avatar ----
// The player rig holds a visible character; the camera trails behind/above.
const player = new THREE.Group();
player.position.set(MAP_W / 2, 0, MAP_H / 2);
scene.add(player);

// Trainer avatar — a simple capsule body + head, tinted, facing -Z
const avatar = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9b3e91, roughness: 0.8 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), bodyMat);
body.position.y = 0.9; body.castShadow = true;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xe9c9a8, roughness: 0.9 }));
head.position.y = 1.7; head.castShadow = true;
const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.7 }));
cap.position.y = 1.86;
avatar.add(body, head, cap);
player.add(avatar);

// Camera orbit state (spherical around the player)
const camYaw = 0;          // horizontal angle
const camPitch = 0.62;     // look-down tilt (3/4 view)
const camDist = 9;         // distance behind player
const camHeight = 7;       // height above player
function updateCamera() {
  const px = player.position.x, pz = player.position.z;
  camera.position.set(
    px + Math.sin(camYaw) * camDist,
    camHeight,
    pz + Math.cos(camYaw) * camDist
  );
  camera.lookAt(px, 1.4, pz);
}

const blocker = document.getElementById('blocker');
if (blocker) {
  blocker.addEventListener('click', () => { try { renderer.domElement.requestPointerLock(); } catch (e) {} });
  document.addEventListener('pointerlockchange', () => {
    blocker.style.display = (document.pointerLockElement === renderer.domElement) ? 'none' : 'flex';
  });
  setTimeout(() => { blocker.style.display = 'none'; }, 600);
}

// Mouse drag (or pointer-lock) rotates the camera orbit
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!dragging && document.pointerLockElement !== renderer.domElement) return;
  const dx = e.movementX || (e.clientX - lastX), dy = e.movementY || (e.clientY - lastY);
  lastX = e.clientX; lastY = e.clientY;
  camYaw -= dx * 0.005;
  camPitch = Math.max(0.15, Math.min(1.3, camPitch - dy * 0.004));
});

// Visible error overlay
addEventListener('error', (e) => {
  const d = document.getElementById('err') || (() => {
    const el = document.createElement('div'); el.id = 'err';
    el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99;max-width:60%;color:#ff9b9b;background:rgba(20,0,0,.8);padding:8px 12px;border:1px solid #a33;border-radius:8px;font:12px monospace;white-space:pre-wrap;';
    document.body.appendChild(el); return el;
  })();
  d.textContent = 'ERROR: ' + (e.message || e.error || 'unknown') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : '');
});

const keys = {};
addEventListener('keydown', (e) => (keys[e.code] = true));
addEventListener('keyup', (e) => (keys[e.code] = false));

const SPEED = 9;
function animate() {
  requestAnimationFrame(animate);
  // Movement relative to camera yaw (W = away from camera)
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  if (fwd || strafe) {
    const len = Math.hypot(fwd, strafe) || 1;
    const mx = (strafe * Math.cos(camYaw) + fwd * Math.sin(camYaw)) / len;
    const mz = (fwd * Math.cos(camYaw) - strafe * Math.sin(camYaw)) / len;
    player.position.x += mx * SPEED * 0.016;
    player.position.z += mz * SPEED * 0.016;
    player.position.x = Math.max(1, Math.min(MAP_W - 1, player.position.x));
    player.position.z = Math.max(1, Math.min(MAP_H - 1, player.position.z));
    // face movement direction
    player.rotation.y = Math.atan2(mx, mz);
    avatar.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.12; // walk bob
  }
  updateCamera();
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

console.log('[crystal3d] engine ready — click to walk');
