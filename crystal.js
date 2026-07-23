// crystal.js — Pokémon Crystal 3D: STANDALONE Johto overworld engine (Three.js)
// Fully self-contained: NO server. All trainer/battle/roamer/trade/dex state
// lives in the client. Built in PRISMWOOD phase chunks (Phase 0 → 3).
import * as THREE from 'three';
import { loadCrocotile } from './crocotile.js';
import { CRYSTAL_WORLD } from './crystal-world-data.js';

const TILE = 1.0;
const MAP_W = 40, MAP_H = 40;
const SAVE_KEY = 'crystal3d-trainer';

const view = document.getElementById('view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a14);
scene.fog = new THREE.Fog(0x0d0a14, 24, 90);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 500);
camera.position.set(MAP_W / 2, 1.7, MAP_H / 2 + 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);

// ---- Lights (PRISMWOOD Phase 0: live day/night cycle) ----
const hemi = new THREE.HemisphereLight(0xbb88ff, 0x221133, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.1);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
scene.add(sun);

// Day/night: cycle sun color/intensity + fog over a 120s loop (PRISMWOOD core identity)
const DAY_TINTS = [
  { t: 0.0, sky: 0x0d0a14, sun: 0x445588, hemi: 0x223355, inten: 0.35 }, // night
  { t: 0.25, sky: 0xffb87a, sun: 0xffd9a0, hemi: 0xbb88ff, inten: 1.0 },  // dawn
  { t: 0.5, sky: 0x6fb7ff, sun: 0xffffff, hemi: 0xbbddff, inten: 1.2 },   // day
  { t: 0.75, sky: 0xff7a4d, sun: 0xffaa66, hemi: 0x884466, inten: 0.8 },  // dusk
  { t: 1.0, sky: 0x0d0a14, sun: 0x445588, hemi: 0x223355, inten: 0.35 },  // night
];
function applyDayNight(timeSec) {
  const phase = (timeSec % 120) / 120;
  let a = DAY_TINTS[0], b = DAY_TINTS[1];
  for (let i = 0; i < DAY_TINTS.length - 1; i++) {
    if (phase >= DAY_TINTS[i].t && phase <= DAY_TINTS[i + 1].t) { a = DAY_TINTS[i]; b = DAY_TINTS[i + 1]; break; }
  }
  const f = (phase - a.t) / (b.t - a.t || 1);
  const lerp = (x, y) => Math.round(x + (y - x) * f);
  const lerpC = (c1, c2) => (lerp((c1 >> 16) & 255, (c2 >> 16) & 255) << 16) | (lerp((c1 >> 8) & 255, (c2 >> 8) & 255) << 8) | lerp(c1 & 255, c2 & 255);
  // Only tint a Color background (Crocotile skybox sets a Texture, which has no setHex)
  if (scene.background && scene.background.isColor) {
    scene.background.setHex(lerpC(a.sky, b.sky));
  }
  if (scene.fog && scene.fog.color.isColor) scene.fog.color.setHex(lerpC(a.sky, b.sky));
  sun.color.setHex(lerpC(a.sun, b.sun));
  sun.intensity = a.inten + (b.inten - a.inten) * f;
  hemi.color.setHex(lerpC(a.hemi, b.hemi));
}

// ---- Ground: Extract single grass tile from Crystal tileset for seamless ground ----
const grassCanvas = document.createElement('canvas');
grassCanvas.width = 64; grassCanvas.height = 64;
const gctx = grassCanvas.getContext('2d');

// Fallback solid grass background while texture loads
gctx.fillStyle = '#3b7045';
gctx.fillRect(0, 0, 64, 64);

const grassTex = new THREE.CanvasTexture(grassCanvas);
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(MAP_W, MAP_H);
grassTex.magFilter = THREE.NearestFilter;

const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0x3b7045, roughness: 0.85 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const tsImg = new Image();
tsImg.onload = () => {
  gctx.drawImage(tsImg, 0, 0, 16, 16, 0, 0, 64, 64);
  grassTex.needsUpdate = true;
};
tsImg.src = './assets/tileset_crystal_hd.png';

// ---- Johto setpiece dioramas (PRISMWOOD #02: hand-crafted zones) ----
function diorama(cx, cz, buildings) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  for (const b of buildings) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w || 4, b.h, b.d || 4),
      new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.8 }));
    m.position.set(b.x || 0, b.h / 2, b.z || 0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (b.roof) {
      const r = new THREE.Mesh(new THREE.ConeGeometry((b.w || 4) * 0.8, 1.6, 4),
        new THREE.MeshStandardMaterial({ color: b.roof, roughness: 0.7 }));
      r.position.set(b.x || 0, b.h + 0.8, b.z || 0); r.rotation.y = Math.PI / 4;
      r.castShadow = true; g.add(r);
    }
    if (b.sign) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffd33d, emissive: 0x553300, emissiveIntensity: 0.4 }));
      s.position.set((b.x || 0) + (b.w || 4) / 2 + 0.3, 0.7, b.z || 0);
      g.add(s);
    }
  }
  scene.add(g);
  return g;
}
// New Bark Town (start)
diorama(8, 30, [
  { x: -2, z: 0, h: 6, c: 0x57c97a, roof: 0xffffff, sign: true },   // Elm's Lab
  { x: 3, z: -1, h: 5, c: 0xe8d8b0, roof: 0x9b3e91 },                // Player home
  { x: 1, z: 3, h: 4, c: 0xcdbff0, roof: 0x6c5ce7 },                 // Rival home
]);
// Violet City (Sprout Tower + Falkner Gym)
diorama(30, 8, [
  { x: 0, z: 0, h: 12, c: 0xd4af37, roof: 0xb8860b, sign: true },   // Sprout Tower
  { x: 5, z: 2, h: 6, c: 0x3aa6ff, roof: 0x1f6fb0, sign: true },    // Gym
]);
// Pokémon Center + Mart hub
diorama(20, 20, [
  { x: -3, z: 0, h: 7, c: 0xff5b6e, roof: 0xffffff, sign: true },
  { x: 3, z: 0, h: 6, c: 0x3aa6ff, roof: 0xffffff, sign: true },
]);
// remaining 7 Johto gym towns (compact dioramas)
diorama(8, 8, [{ x: 0, z: 0, h: 6, c: 0x9b3e91, roof: 0xd4af37, sign: true }]);    // Azalea (Bugsy)
diorama(30, 30, [{ x: 0, z: 0, h: 7, c: 0x2e8b57, roof: 0xd4af37, sign: true }]);  // Goldenrod (Whitney)
diorama(8, 18, [{ x: 0, z: 0, h: 6, c: 0x6c5ce7, roof: 0xffffff, sign: true }]);   // Ecruteak (Morty)
diorama(20, 8, [{ x: 0, z: 0, h: 6, c: 0xc94f7c, roof: 0xffffff, sign: true }]);   // Cianwood (Chuck)
diorama(20, 32, [{ x: 0, z: 0, h: 6, c: 0x33ccff, roof: 0x1f6fb0, sign: true }]);  // Olivine (Jasmine)
diorama(34, 20, [{ x: 0, z: 0, h: 7, c: 0xffaa33, roof: 0xb8860b, sign: true }]);  // Mahogany (Pryce)
diorama(14, 14, [{ x: 0, z: 0, h: 8, c: 0x884466, roof: 0xd4af37, sign: true }]);  // Blackthorn (Clair)
// Kanto epilogue towns (condensed)
diorama(36, 36, [{ x: 0, z: 0, h: 6, c: 0xff5b6e, roof: 0xffffff, sign: true }]);  // Viridian
diorama(2, 36, [{ x: 0, z: 0, h: 6, c: 0x3aa6ff, roof: 0xffffff, sign: true }]);   // Pallet
diorama(20, 36, [{ x: 0, z: 0, h: 7, c: 0x57c97a, roof: 0xb8860b, sign: true }]);  // Indigo Plateau

// ---- Kit routes: path strips connecting setpieces (PRISMWOOD #02) ----
const routeMat = new THREE.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.95 });
function route(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 2), routeMat);
  strip.position.set((x1 + x2) / 2, 0.06, (z1 + z2) / 2);
  strip.rotation.y = -Math.atan2(dz, dx);
  strip.receiveShadow = true;
  scene.add(strip);
}
route(8, 30, 20, 20); route(20, 20, 30, 8); route(8, 30, 8, 8); route(8, 8, 20, 8);
route(30, 8, 30, 30); route(30, 30, 20, 32); route(8, 18, 14, 14); route(14, 14, 20, 8);
route(34, 20, 20, 32); route(8, 18, 8, 8); route(30, 30, 36, 36); route(8, 30, 2, 36);
route(2, 36, 20, 36); route(20, 36, 36, 36); route(20, 20, 20, 36);

// ---- Crocotile-authored environment model (real asset) ----
fetch('./assets/environment.crocotile')
  .then((r) => r.json())
  .then((json) => {
    const env = loadCrocotile(json, { onSkybox: (skyTex) => { scene.background = skyTex; } });
    env.position.set(MAP_W / 2, 0, MAP_H / 2);
    env.scale.setScalar(0.05);
    scene.add(env);
  })
  .catch((e) => console.warn('[crocotile] load failed:', e));

// ---- Player rig: visible trainer avatar + 3/4 follow camera ----
const player = new THREE.Group();
player.position.set(8, 0, 30); // start in New Bark Town
scene.add(player);

const avatar = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x9b3e91, roughness: 0.8 }));
body.position.y = 0.9; body.castShadow = true;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xe9c9a8, roughness: 0.9 }));
head.position.y = 1.7; head.castShadow = true;
const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.7 }));
cap.position.y = 1.86;
avatar.add(body, head, cap);
player.add(avatar);

let camYaw = 0, camPitch = 0.62, camDist = 9, camHeight = 7;
function updateCamera() {
  camera.position.set(
    player.position.x + Math.sin(camYaw) * camDist,
    camHeight,
    player.position.z + Math.cos(camYaw) * camDist
  );
  camera.lookAt(player.position.x, 1.4, player.position.z);
}

// ---- Agent-built entities (now STATIC, embedded from crystal-world-data.js) ----
const entMeshes = new Map();
const tallGrass = [];
function clearEntities() {
  for (const [, m] of entMeshes) scene.remove(m);
  entMeshes.clear();
}
function addEntity(e) {
  if (entMeshes.has(e.id)) return;
  const g = new THREE.Group();
  const kind = e.kind || 'default';
  let mesh;
  if (kind.includes('tree')) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6b4423 }));
    trunk.position.y = 0.5;
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2e8b57 }));
    leaves.position.y = 1.4; leaves.castShadow = true;
    g.add(trunk, leaves);
  } else if (kind.includes('shrine')) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.2), new THREE.MeshStandardMaterial({ color: 0xc94f7c, emissive: 0x551133, emissiveIntensity: 0.3 }));
    mesh.position.y = 1; mesh.castShadow = true; g.add(mesh);
  } else if (kind.includes('npc')) {
    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6c5ce7 }));
    mesh.position.y = 0.8; g.add(mesh);
  } else if (kind.includes('path')) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0xb8a06a }));
    mesh.position.y = 0.06; g.add(mesh);
  } else if (kind.includes('glyph')) {
    mesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 16), new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x114455, emissiveIntensity: 0.5 }));
    mesh.position.y = 0.6; mesh.rotation.x = Math.PI / 2; g.add(mesh);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xd4af37 }));
    mesh.position.y = 0.4; g.add(mesh);
  }
  g.position.set(e.x || 0, 0, e.z || 0);
  scene.add(g);
  entMeshes.set(e.id, g);
}
function renderWorld(world) {
  clearEntities();
  tallGrass.length = 0;
  const ents = (world && world.entities) || [];
  const hud = document.getElementById('hud-entities');
  if (hud) hud.textContent = ents.length;
  for (const e of ents) addEntity(e);
  // Tall-grass encounter patches
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9 });
  const spots = [[14, 14], [20, 20], [12, 24], [24, 12], [16, 32], [26, 26], [10, 14]];
  for (const [gx, gz] of spots) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 3), grassMat);
    patch.position.set(gx, 0.2, gz);
    patch.userData = { isTallGrass: true };
    scene.add(patch);
    tallGrass.push(patch);
  }
}

function loadCrystalWorld() {
  // STANDALONE: render the embedded static world (no server fetch)
  renderWorld({ entities: CRYSTAL_WORLD });
}

// ---- STANDALONE game state (formerly server-authoritative) ----
const POKEMON_DB = [
  { id: 155, name: 'Cyndaquil', type: 'Fire', hp: 39, maxHp: 39, level: 5, moves: ['Tackle', 'Ember', 'Quick Attack'], sprite: '🔥' },
  { id: 158, name: 'Totodile', type: 'Water', hp: 50, maxHp: 50, level: 5, moves: ['Scratch', 'Water Gun', 'Bite'], sprite: '🐊' },
  { id: 152, name: 'Chikorita', type: 'Grass', hp: 45, maxHp: 45, level: 5, moves: ['Tackle', 'Vine Whip', 'Razor Leaf'], sprite: '🍃' },
  { id: 25, name: 'Pikachu', type: 'Electric', hp: 42, maxHp: 42, level: 7, moves: ['Thunder Shock', 'Quick Attack', 'Thunder Wave'], sprite: '⚡' },
  { id: 149, name: 'Dragonite', type: 'Dragon', hp: 91, maxHp: 91, level: 25, moves: ['Dragon Rage', 'Wing Attack', 'Hyper Beam'], sprite: '🐉' },
  { id: 245, name: 'Suicune', type: 'Water/Ice', hp: 100, maxHp: 100, level: 30, moves: ['Aurora Beam', 'Hydro Pump', 'Blizzard'], sprite: '❄️' },
  { id: 16, name: 'Pidgey', type: 'Flying', hp: 36, maxHp: 36, level: 4, moves: ['Tackle', 'Gust'], sprite: '🐦' },
];

// PRISMWOOD QA guardrail: per-species scale anchors (no Caterpie=Snorlax)
const SPECIES_SCALE = { Suicune: 3.4, Cyndaquil: 2.4, Totodile: 2.5, Chikorita: 2.4, Pidgey: 2.0, Geodude: 2.6, Togepi: 1.8, Dragonite: 3.2, Pikachu: 2.2 };
function speciesScale(name) { return SPECIES_SCALE[name] || 2.4; }

const POKEMON_TOTAL = 251; // Johto dex flavor

const defaultTrainer = () => ({
  name: 'Ethan',
  badges: ['Zephyr', 'Hive'],           // start with 2 badges
  money: 3500,
  party: [
    { id: 155, name: 'Cyndaquil', type: 'Fire', hp: 39, maxHp: 39, level: 12, moves: ['Ember', 'Tackle', 'Quick Attack'], sprite: '🔥' },
    { id: 158, name: 'Totodile', type: 'Water', hp: 48, maxHp: 50, level: 14, moves: ['Water Gun', 'Bite', 'Scratch'], sprite: '🐊' },
  ],
  inventory: { pokeballs: 10, potions: 5, revive: 2 },
  seen: [], caught: [], expShare: false,
});

let trainerState = defaultTrainer();
try {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) trainerState = { ...defaultTrainer(), ...JSON.parse(saved) };
} catch { /* ignore corrupt save */ }
function saveTrainer() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(trainerState)); } catch { /* storage may be unavailable */ }
}

// PRISMWOOD Phase 1: type-effectiveness chart (client-authoritative now)
const TYPE_CHART = {
  Normal: {}, Fire: { Grass: 2, Ice: 2, Bug: 2, Steel: 2, Water: 0.5, Fire: 0.5, Rock: 0.5, Dragon: 0.5 },
  Water: { Fire: 2, Ground: 2, Rock: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
  Grass: { Water: 2, Ground: 2, Rock: 2, Fire: 0.5, Grass: 0.5, Flying: 0.5, Bug: 0.5, Steel: 0.5, Dragon: 0.5 },
  Electric: { Water: 2, Flying: 2, Grass: 0.5, Electric: 0.5, Dragon: 0.5, Ground: 0 },
  Flying: { Grass: 2, Fighting: 2, Bug: 2, Electric: 0.5, Rock: 0.5, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Rock: 2, Dark: 2, Steel: 2, Flying: 0.5, Poison: 0.5, Bug: 0.5, Psychic: 0.5, Fairy: 0.5 },
  Poison: { Grass: 2, Fairy: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0.5 },
  Ground: { Fire: 2, Electric: 2, Poison: 2, Rock: 2, Steel: 2, Grass: 0.5, Bug: 0.5, Flying: 0 },
  Rock: { Fire: 2, Ice: 2, Flying: 2, Bug: 2, Fighting: 0.5, Ground: 0.5, Steel: 0.5 },
  Ice: { Grass: 2, Ground: 2, Flying: 2, Dragon: 2, Fire: 0.5, Water: 0.5, Ice: 0.5, Steel: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Psychic: 2, Ghost: 2, Fighting: 0.5, Dark: 0.5, Fairy: 0.5 },
  Steel: { Ice: 2, Rock: 2, Fairy: 2, Steel: 0.5, Fire: 0.5, Water: 0.5, Electric: 0.5 },
  Fairy: { Fighting: 2, Dragon: 2, Dark: 2, Fire: 0.5, Poison: 0.5, Steel: 0.5 },
};
function moveEffectiveness(moveType, defType) {
  const mt = moveType.split('/')[0].trim(); const dt = defType.split('/')[0].trim();
  if (!TYPE_CHART[mt]) return 1;
  if (defType.includes('/')) {
    const dt2 = defType.split('/')[1].trim();
    return (TYPE_CHART[mt][dt] ?? 1) * (TYPE_CHART[mt][dt2] ?? 1);
  }
  return TYPE_CHART[mt][dt] ?? 1;
}

// PHASE 2 — Roaming Suicune (real-time wanderer, client-side)
let roamerMesh = null;
let roamer = { name: 'Suicune', sprite: '❄️', level: 40, x: 20, z: 20, type: 'Water/Ice' };
function roamStep() {
  roamer.x = Math.max(2, Math.min(38, roamer.x + (Math.random() * 8 - 4)));
  roamer.z = Math.max(2, Math.min(38, roamer.z + (Math.random() * 8 - 4)));
  if (roamerMesh) roamerMesh.position.set(roamer.x, 0.7, roamer.z);
}
function loadRoamer() {
  if (!roamerMesh) {
    roamerMesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x114455, emissiveIntensity: 0.6 }));
    roamerMesh.position.y = 0.7; roamerMesh.rotation.y = Math.PI / 4;
    scene.add(roamerMesh);
  }
  roamerMesh.position.set(roamer.x, 0.7, roamer.z);
}
setInterval(roamStep, 4000);

// PHASE 3 — async trade board (local, in-memory; no live ladder/server)
let tradeBoard = [];
function legalityCheck(mon) {
  if (!mon || !mon.name) return { ok: false, reason: 'Invalid entry' };
  if (!Number.isFinite(mon.level) || mon.level < 1 || mon.level > 100) return { ok: false, reason: 'Illegal level' };
  return { ok: true };
}

// ---- Controls ----
let dragging = false, lastX = 0, lastY = 0;
const blocker = document.getElementById('blocker');
if (blocker) {
  blocker.addEventListener('click', () => { blocker.style.display = 'none'; });
  setTimeout(() => { if (blocker) blocker.style.display = 'none'; }, 4500);
}
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  camYaw -= dx * 0.005;
  camPitch = Math.max(0.15, Math.min(1.3, camPitch - dy * 0.004));
});

addEventListener('error', (e) => {
  const d = document.getElementById('err');
  if (d) { d.style.display = 'block'; d.textContent = 'ERROR: ' + (e.message || e.error || 'unknown') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''); }
});

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') interact();           // PHASE 1: interact / talk
  if (e.code === 'KeyB') togglePokedex();      // PHASE 1: Pokédex
  if (e.code === 'KeyT') toggleTrade();         // PHASE 3: trade board
});
addEventListener('keyup', (e) => (keys[e.code] = false));

const SPEED = 9;
let running = false; // PRISMWOOD #09: hold Shift to run
let encounterCooldown = false;
function animate() {
  requestAnimationFrame(animate);
  running = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  if (fwd || strafe) {
    const len = Math.hypot(fwd, strafe) || 1;
    const mx = (strafe * Math.cos(camYaw) + fwd * Math.sin(camYaw)) / len;
    const mz = (fwd * Math.cos(camYaw) - strafe * Math.sin(camYaw)) / len;
    const spd = SPEED * (running ? 1.8 : 1.0) * 0.016;
    player.position.x = Math.max(1, Math.min(MAP_W - 1, player.position.x + mx * spd));
    player.position.z = Math.max(1, Math.min(MAP_H - 1, player.position.z + mz * spd));
    player.rotation.y = Math.atan2(mx, mz);
    avatar.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.12;
    if (!encounterCooldown) {
      for (const p of tallGrass) {
        if (Math.abs(p.position.x - player.position.x) < 2 && Math.abs(p.position.z - player.position.z) < 2) {
          if (Math.random() < 0.025) triggerEncounter();
          break;
        }
      }
    }
    // PHASE 2: proximity to roaming Suicune
    if (roamerMesh && Math.abs(roamerMesh.position.x - player.position.x) < 2 && Math.abs(roamerMesh.position.z - player.position.z) < 2) {
      if (!encounterCooldown && Math.random() < 0.5) sightRoamer();
    }
  }
  applyDayNight(performance.now() / 1000);
  updateCamera();
  renderer.render(scene, camera);
}

// ---- PHASE 1: NPC dialogue / interaction ----
const NPC_LINES = {
  'Elm': 'Welcome! Take a starter and begin your Johto journey. The roaming Suicune awaits a worthy trainer.',
  'Kimono Girl': 'The crystal tides sing. Suicune walks the rivers of Johto — follow the water.',
  'Youngster': 'My Rattata is top percentage! Battle me anytime!',
};
async function interact() {
  if (inBattle) return;
  // nearest sign (gym badge) within 2.5 units → grant badge
  for (const [name, x, z, badge] of GYM_SIGNS) {
    if (Math.abs(x - player.position.x) < 3 && Math.abs(z - player.position.z) < 3) {
      if (!trainerState.badges.includes(badge)) {
        trainerState.badges.push(badge);
        saveTrainer();
      }
      showDialogue(`You earned the ${badge} Badge!`);
      refreshHud();
      return;
    }
  }
  // default: Elm greeting
  showDialogue(NPC_LINES['Elm']);
}
const GYM_SIGNS = [
  ['Falkner', 35, 10, 'Zephyr'], ['Bugsy', 8, 8, 'Hive'], ['Whitney', 30, 30, 'Plain'],
  ['Morty', 8, 18, 'Fog'], ['Chuck', 20, 8, 'Storm'], ['Jasmine', 20, 32, 'Mineral'],
  ['Pryce', 34, 20, 'Glacier'], ['Clair', 14, 14, 'Rising'],
];
function showDialogue(text) {
  const d = document.getElementById('dialogue');
  if (!d) return;
  d.textContent = text; d.style.display = 'block';
  clearTimeout(showDialogue._t);
  showDialogue._t = setTimeout(() => (d.style.display = 'none'), 3500);
}

// ---- PHASE 1 / 2 / 3: HUD refresh (local) ----
function refreshHud() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('hud-badges', String(trainerState.badges.length));
  set('hud-money', '$' + trainerState.money);
  set('hud-balls', String(trainerState.inventory.pokeballs));
  set('hud-dex', `${trainerState.caught.length}/${POKEMON_TOTAL}`);
  const party = document.getElementById('pkmn-hud');
  if (party) {
    party.innerHTML = '';
    for (const p of trainerState.party.slice(0, 6)) {
      const b = document.createElement('div'); b.className = 'hud-badge';
      b.textContent = `${p.sprite} ${p.name} Lv.${p.level}`;
      party.appendChild(b);
    }
  }
}

// ---- Pokémon battle (PHASE 1: type-effective, STANDALONE) ----
let wildPokemon = null, inBattle = false;
let playerHp = 39, playerMaxHp = 39, wildHp = 100, wildMaxHp = 100;

async function triggerEncounter() {
  if (inBattle || encounterCooldown) return;
  encounterCooldown = true;
  setTimeout(() => (encounterCooldown = false), 6000);
  const wild = POKEMON_DB[Math.floor(Math.random() * POKEMON_DB.length)];
  wildPokemon = wild;
  wildHp = wild.hp; wildMaxHp = wild.hp;
  inBattle = true;
  document.getElementById('btl-wild-name').textContent = 'Wild ' + wild.name;
  document.getElementById('btl-wild-lvl').textContent = 'Lv. ' + wild.level;
  const wildSpriteEl = document.getElementById('btl-wild-sprite');
  wildSpriteEl.textContent = wild.sprite || '🐉';
  wildSpriteEl.style.fontSize = (speciesScale(wild.name) * 1.4) + 'rem';
  camDist = 6; camPitch = 0.5; camHeight = 5; // PRISMWOOD #01 Dynamic Diorama
  document.getElementById('btl-log').textContent = `Wild ${wild.name} appeared! What will Cyndaquil do?`;
  document.getElementById('btl-menu').style.display = 'grid';
  document.getElementById('btl-moves-menu').style.display = 'none';
  document.getElementById('battle-modal').style.display = 'flex';
}

async function sightRoamer() {
  if (inBattle || encounterCooldown) return;
  encounterCooldown = true;
  setTimeout(() => (encounterCooldown = false), 8000);
  if (!trainerState.seen.includes(roamer.name)) { trainerState.seen.push(roamer.name); saveTrainer(); }
  showDialogue(`A wild ${roamer.name} flees into the mist... (seen!)`);
  refreshHud();
}

function updateHpBars() {
  document.getElementById('btl-player-hp').style.width = Math.max(0, (playerHp / playerMaxHp) * 100) + '%';
  document.getElementById('btl-wild-hp').style.width = Math.max(0, (wildHp / wildMaxHp) * 100) + '%';
}

document.getElementById('btn-battle').onclick = triggerEncounter;
document.getElementById('btn-recenter').onclick = () => { player.position.set(8, 0, 30); camYaw = 0; camPitch = 0.62; camDist = 9; camHeight = 7; };
document.getElementById('btl-btn-fight').onclick = () => { document.getElementById('btl-menu').style.display = 'none'; document.getElementById('btl-moves-menu').style.display = 'grid'; };
document.getElementById('btl-btn-back').onclick = () => { document.getElementById('btl-moves-menu').style.display = 'none'; document.getElementById('btl-menu').style.display = 'grid'; };
document.querySelectorAll('.move-btn').forEach((btn) => {
  btn.onclick = () => {
    const pwr = parseInt(btn.dataset.power || '30', 10);
    const eff = moveEffectiveness(btn.dataset.type || 'Normal', wildPokemon.type || 'Normal'); // PHASE 1 type chart
    const dmg = Math.round(pwr * eff);
    wildHp = Math.max(0, wildHp - dmg);
    updateHpBars();
    const log = document.getElementById('btl-log');
    const effTxt = eff > 1 ? ' It\'s super effective!' : eff < 1 ? ' It\'s not very effective...' : '';
    if (wildHp <= 0) {
      log.textContent = `Cyndaquil used ${btn.dataset.move}!${effTxt} Wild ${wildPokemon.name} fainted!`;
      setTimeout(endBattle, 1400);
    } else {
      const ret = Math.round((8 + Math.random() * 12) * (1 / Math.max(0.5, eff)));
      playerHp = Math.max(0, playerHp - ret);
      updateHpBars();
      log.textContent = `Cyndaquil used ${btn.dataset.move}!${effTxt} Wild ${wildPokemon.name} used Tackle (-${ret} HP).`;
      if (playerHp <= 0) { log.textContent = 'Cyndaquil fainted! You scurry back to the lab.'; setTimeout(endBattle, 1400); }
    }
  };
});
document.getElementById('btl-btn-catch').onclick = async () => {
  if (trainerState.inventory.pokeballs > 0) {
    trainerState.inventory.pokeballs--;
    if (wildPokemon) {
      trainerState.party.push(wildPokemon);
      if (!trainerState.caught.includes(wildPokemon.name)) trainerState.caught.push(wildPokemon.name);
    }
    saveTrainer();
  }
  document.getElementById('btl-log').textContent = `You threw a Poké Ball at ${wildPokemon.name}!`;
  setTimeout(() => { document.getElementById('btl-log').textContent = `${wildPokemon.name} was caught! Added to your party.`; refreshHud(); setTimeout(endBattle, 1400); }, 900);
};
document.getElementById('btl-btn-item').onclick = () => { playerHp = Math.min(playerMaxHp, playerHp + 20); updateHpBars(); document.getElementById('btl-log').textContent = 'You used a Potion! Cyndaquil recovered 20 HP.'; };
document.getElementById('btl-btn-run').onclick = () => { document.getElementById('btl-log').textContent = 'You got away safely!'; setTimeout(endBattle, 900); };
function endBattle() { inBattle = false; document.getElementById('battle-modal').style.display = 'none'; }

// PHASE 1: Pokédex overlay (local)
function togglePokedex() {
  const el = document.getElementById('pokedex');
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.querySelector('.dex-body').innerHTML =
    `<b>Seen:</b> ${trainerState.seen.length}/${POKEMON_TOTAL} &nbsp; <b>Caught:</b> ${trainerState.caught.length}/${POKEMON_TOTAL}<br>` +
    (trainerState.caught.length ? trainerState.caught.join(', ') : 'No Pokémon caught yet. Walk in tall grass!');
  el.style.display = 'block';
}
// PHASE 3: trade board overlay (local)
function toggleTrade() {
  const el = document.getElementById('trade-board');
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  renderTrades();
  el.style.display = 'block';
}
function renderTrades() {
  const el = document.getElementById('trade-board');
  const list = el.querySelector('.trade-list');
  if (!tradeBoard.length) { list.innerHTML = '<i>No trades posted yet.</i>'; }
  else {
    list.innerHTML = tradeBoard.map((t) =>
      `<div class="trade-row"><span>${t.offer.sprite} ${t.offer.name} Lv.${t.offer.level} → wants ${t.want}</span><button class="battle-btn" onclick="claimTrade('${t.id}')">Claim</button></div>`
    ).join('');
  }
}
window.claimTrade = async (id) => {
  const idx = tradeBoard.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const claimed = tradeBoard.splice(idx, 1)[0];
  if (claimed.offer) { trainerState.party.push(claimed.offer); if (!trainerState.caught.includes(claimed.offer.name)) trainerState.caught.push(claimed.offer.name); saveTrainer(); }
  renderTrades(); refreshHud();
};
window.postTrade = async () => {
  const name = prompt('Offer which Pokémon? (name)'); if (!name) return;
  const level = parseInt(prompt('Level?', '5') || '5', 10);
  const sprite = POKEMON_DB.find((p) => p.name === name)?.sprite || '🐉';
  const leg = legalityCheck({ name, level });
  if (!leg.ok) { alert('Illegal trade: ' + leg.reason); return; }
  const id = 'trd_' + Date.now().toString(36);
  tradeBoard.push({ id, offer: { name, level, sprite }, want: 'Any', trainer: 'Ethan', at: Date.now() });
  renderTrades();
};

// PHASE 1: starter pick overlay
function showStarterPicker() {
  const el = document.getElementById('starter-pick');
  if (!el) return;
  // Skip if a saved game already chose a starter
  if (localStorage.getItem(SAVE_KEY)) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
}
window.chooseStarter = async (name) => {
  const pick = POKEMON_DB.find((p) => p.name === name);
  if (!pick) return;
  trainerState.party = [{ ...pick, level: 5, hp: pick.maxHp, maxHp: pick.maxHp }];
  if (!trainerState.seen.includes(pick.name)) trainerState.seen.push(pick.name);
  saveTrainer();
  document.getElementById('starter-pick').style.display = 'none';
  refreshHud();
  showDialogue(`You chose ${name}! Your journey begins.`);
};

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// Boot
loadCrystalWorld();
loadRoamer();
refreshHud();
showStarterPicker(); // PHASE 1: pick your starter on boot (skipped if save exists)
animate();
console.log('[crystal3d] STANDALONE build ready — WASD walk, Shift run, E interact, B dex, T trade');
