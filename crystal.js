// crystal.js — Pokémon Crystal 3D: STANDALONE Johto overworld (real Crystal assets)
// Built from the AUTHENTIC Pokémon Crystal tilesets + the real Crocotile 3D
// forest-village model. No Helm server. All state client-side.
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

const DAY_TINTS = [
  { t: 0.0, sky: 0x0d0a14, sun: 0x445588, hemi: 0x223355, inten: 0.35 },
  { t: 0.25, sky: 0xffb87a, sun: 0xffd9a0, hemi: 0xbb88ff, inten: 1.0 },
  { t: 0.5, sky: 0x6fb7ff, sun: 0xffffff, hemi: 0xbbddff, inten: 1.2 },
  { t: 0.75, sky: 0xff7a4d, sun: 0xffaa66, hemi: 0x884466, inten: 0.8 },
  { t: 1.0, sky: 0x0d0a14, sun: 0x445588, hemi: 0x223355, inten: 0.35 },
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
  if (scene.background && scene.background.isColor) scene.background.setHex(lerpC(a.sky, b.sky));
  if (scene.fog && scene.fog.color.isColor) scene.fog.color.setHex(lerpC(a.sky, b.sky));
  sun.color.setHex(lerpC(a.sun, b.sun));
  sun.intensity = a.inten + (b.inten - a.inten) * f;
  hemi.color.setHex(lerpC(a.hemi, b.hemi));
}

// ---- REAL CRYSTAL ASSETS: sprite atlas built from tileset2.png ----
// Authentic Johto overworld tiles (buildings, trees, signs, NPCs, fences, grass).
const SPRITE_ATLAS = './assets/tileset2_sprites.png';
const TILE_PX = 16;                 // each tile is 16x16 in the atlas
const spriteTex = new THREE.TextureLoader().load(SPRITE_ATLAS, (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
});
// Column index for every real tile name in tileset2_sprites.png (48 tiles, 1 row).
// Mirrors tileset2_sprites.json — kept inline so the game has zero JSON fetch deps.
const SPRITE_INDEX = {
  wall:0, tree:1, tree2:2, wallWin:3, roof:4, win:5, wallCorner:6, tree3:7, trunk:8, gymSign:9,
  doorDark:10, martSign:11, shopWin:12, tree4:13, fence:14, tree5:15, wallC2:16, tree6:17,
  trunk2:18, bush:19, npcGirl:20, signPost:21, tree7:22, signBoard:23, wallC3:24, tree8:25,
  tree9:26, npcGirl2:27, pokeC1:28, pokeC2:29, wallC4:30, door:31, wallC5:32, wallFence:33,
  wallRoof:34, grassFlower:35, pokeC3:36, pokeC4:37, wallC6:38, door2:39, wallC7:40, wallC8:41,
  hedge:42, bench:43, win2:44, door3:45, wallFence2:46, signBoard2:47,
};
// uvRect(name) -> pulls the exact 16x16 tile out of the atlas
function uvRect(name) {
  const col = SPRITE_INDEX[name];
  if (col === undefined) return null;
  return { u: col / 48, v: 0, u2: (col + 1) / 48, v2: 1 };
}
function spriteMaterial(name, opts = {}) {
  const r = uvRect(name);
  if (!r) return new THREE.MeshBasicMaterial({ color: 0x888888 });
  const tex = spriteTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / 48, 1);
  tex.offset.set(r.u, 0);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, ...opts
  });
}

// ---- Ground (PRISMWOOD Phase 0): real Crystal grass tile repeated ----
const groundCanvas = document.createElement('canvas');
groundCanvas.width = groundCanvas.height = 16;
const gctx = groundCanvas.getContext('2d');
gctx.fillStyle = '#3b7045'; gctx.fillRect(0, 0, 16, 16);
const groundTex = new THREE.CanvasTexture(groundCanvas);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(MAP_W, MAP_H);
groundTex.magFilter = THREE.NearestFilter;
// Blit the real grass-flower tile [3,4] from tileset2.png onto the ground canvas
const grassImg = new Image();
grassImg.onload = () => {
  // tile [3,4] in tileset2.png (128x96): x=3*16, y=4*16
  gctx.drawImage(grassImg, 3 * 16, 4 * 16, 16, 16, 0, 0, 16, 16);
  groundTex.needsUpdate = true;
};
grassImg.src = './assets/tileset2.png';

const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 0.9 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * TILE, MAP_H * TILE), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- REAL CROCOTILE 3D ENVIRONMENT (forest-village model) ----
// Loaded from assets/environment.crocotile — 78 textured meshes, shared wooded atlas.
fetch('./assets/environment.crocotile')
  .then((r) => r.json())
  .then((json) => {
    const env = loadCrocotile(json, {
      onSkybox: (skyTex) => { if (!scene.background.isColor) scene.background = skyTex; }
    });
    // Place the real forest-village in the north-west quadrant of the map.
    env.position.set(2, 0, 2);
    env.scale.setScalar(0.4); // Crocotile units are ~16px; scale to world
    scene.add(env);
    console.log('[crocotile] forest-village placed');
  })
  .catch((e) => console.warn('[crocotile] load failed:', e));

// ---- Player rig ----
const player = new THREE.Group();
player.position.set(8, 0, 30); // New Bark Town
scene.add(player);
const avatar = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x9b3e91, roughness: 0.8 }));
body.position.y = 0.9; body.castShadow = true;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), new THREE.MeshStandardMaterial({ color: 0xe9c9a8, roughness: 0.9 }));
head.position.y = 1.7; head.castShadow = true;
const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.7 }));
cap.position.y = 1.86;
avatar.add(body, head, cap);
player.add(avatar);

let camYaw = 0, camPitch = 0.62, camDist = 9, camHeight = 7;
function updateCamera() {
  camera.position.set(player.position.x + Math.sin(camYaw) * camDist, camHeight, player.position.z + Math.cos(camYaw) * camDist);
  camera.lookAt(player.position.x, 1.4, player.position.z);
}

// ---- REAL CRYSTAL BUILDINGS / TREES / SIGNS from the actual tileset ----
// A building uses wall (front/back), roof (top), door, window tiles — sampled
// from tileset2.png. Trees & signs are camera-facing sprite quads.
function building(cx, cz, opts = {}) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  const w = opts.w || 4, h = opts.h || 5, d = opts.d || 4;
  const wallMat = spriteMaterial(opts.wall || 'wall');
  const roofMat = spriteMaterial(opts.roof || 'roof');
  // four walls
  const wallGeo = new THREE.PlaneGeometry(w, h);
  const positions = [
    [0, h / 2, d / 2, 0], [0, h / 2, -d / 2, Math.PI],
    [w / 2, h / 2, 0, Math.PI / 2], [-w / 2, h / 2, 0, -Math.PI / 2],
  ];
  for (const [x, y, z, ry] of positions) {
    const m = new THREE.Mesh(wallGeo, wallMat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
  // roof (solid, use roof sprite on top quad)
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roofMat);
  roof.position.set(0, h, 0); roof.rotation.x = -Math.PI / 2; roof.castShadow = true; g.add(roof);
  // door on front
  const doorMat = spriteMaterial(opts.door || 'door');
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), doorMat);
  door.position.set(0, 1, d / 2 + 0.01); g.add(door);
  if (opts.sign) {
    const sm = spriteMaterial(opts.sign);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), sm);
    s.position.set(w / 2 + 0.4, 1.2, d / 2); s.rotation.y = -Math.PI / 2; g.add(s);
  }
  scene.add(g);
  return g;
}
function treeSprite(cx, cz, kind = 'tree') {
  const mat = spriteMaterial(kind);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), mat);
  m.position.set(cx, 1.3, cz); m.castShadow = true;
  scene.add(m);
  // billboard: face camera each frame
  TREES.push(m);
  return m;
}
const TREES = [];
function signSprite(cx, cz, kind) {
  const mat = spriteMaterial(kind);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), mat);
  m.position.set(cx, 1.0, cz); scene.add(m); TREES.push(m);
  return m;
}
function npcSprite(cx, cz, kind = 'npcGirl') {
  const mat = spriteMaterial(kind);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), mat);
  m.position.set(cx, 1.1, cz); scene.add(m); TREES.push(m);
  return m;
}

// ---- New Bark Town (start) ----
building(8, 30, { w: 5, h: 5, d: 4, wall: 'wall', roof: 'roof', door: 'door', sign: null });          // Elm's Lab
building(12, 29, { w: 4, h: 4, d: 4, wall: 'wallWin', roof: 'roof', door: 'door2' });                    // Player home
treeSprite(6, 28, 'tree'); treeSprite(10, 33, 'tree2'); treeSprite(14, 31, 'tree3');
// Pokémon Center + Mart hub (real signs)
building(20, 20, { w: 5, h: 6, d: 4, wall: 'wallC3', roof: 'roof', door: 'pokeC2', sign: 'pokeC1' });
building(24, 20, { w: 5, h: 5, d: 4, wall: 'wallC4', roof: 'roof', door: 'door3', sign: 'martSign' });
signSprite(22, 24, 'pokeC3'); signSprite(26, 24, 'martSign');
// Violet City — Sprout Tower (tall) + Gym
building(30, 8, { w: 4, h: 12, d: 4, wall: 'wallC5', roof: 'roof', door: 'door', sign: 'gymSign' });
building(34, 10, { w: 4, h: 5, d: 4, wall: 'wallWin', roof: 'roof', door: 'door2', sign: 'gymSign' });
treeSprite(28, 10, 'tree4'); treeSprite(32, 6, 'tree5');
// 7 remaining Johto gym towns (compact)
building(8, 8, { w: 4, h: 5, d: 4, wall: 'wallC2', roof: 'roof', door: 'door', sign: 'gymSign' });    // Azalea
building(30, 30, { w: 4, h: 6, d: 4, wall: 'wallC4', roof: 'roof', door: 'door3', sign: 'gymSign' });  // Goldenrod
building(8, 18, { w: 4, h: 5, d: 4, wall: 'wallC3', roof: 'roof', door: 'door2', sign: 'gymSign' });   // Ecruteak
building(20, 8, { w: 4, h: 5, d: 4, wall: 'wallC6', roof: 'roof', door: 'door', sign: 'gymSign' });     // Cianwood
building(20, 32, { w: 4, h: 5, d: 4, wall: 'wallC7', roof: 'roof', door: 'door3', sign: 'gymSign' });   // Olivine
building(34, 20, { w: 4, h: 6, d: 4, wall: 'wallC8', roof: 'roof', door: 'door2', sign: 'gymSign' });   // Mahogany
building(14, 14, { w: 4, h: 7, d: 4, wall: 'wallRoof', roof: 'roof', door: 'door', sign: 'gymSign' });  // Blackthorn
// Kanto epilogue
building(36, 36, { w: 4, h: 5, d: 4, wall: 'wallC3', roof: 'roof', door: 'door', sign: 'gymSign' });    // Viridian
building(2, 36, { w: 4, h: 5, d: 4, wall: 'wallWin', roof: 'roof', door: 'door2' });                     // Pallet
building(20, 36, { w: 5, h: 7, d: 4, wall: 'wallC5', roof: 'roof', door: 'pokeC2', sign: 'pokeC1' });    // Indigo Plateau
// scatter real trees + NPCs from the authentic tileset
for (const [x, z] of [[11, 24], [26, 12], [16, 12], [24, 26], [9, 12], [33, 26], [15, 30], [29, 14]]) treeSprite(x, z, ['tree', 'tree6', 'tree7', 'tree8', 'tree9'][Math.floor(Math.random() * 5)]);
npcSprite(22, 22, 'npcGirl'); npcSprite(31, 9, 'npcGirl2'); npcSprite(7, 29, 'npcGirl');

// ---- Kit routes: path strips connecting setpieces ----
const routeMat = new THREE.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.95 });
function route(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 2), routeMat);
  strip.position.set((x1 + x2) / 2, 0.06, (z1 + z2) / 2);
  strip.rotation.y = -Math.atan2(dz, dx);
  strip.receiveShadow = true; scene.add(strip);
}
route(8, 30, 20, 20); route(20, 20, 30, 8); route(8, 30, 8, 8); route(8, 8, 20, 8);
route(30, 8, 30, 30); route(30, 30, 20, 32); route(8, 18, 14, 14); route(14, 14, 20, 8);
route(34, 20, 20, 32); route(8, 18, 8, 8); route(30, 30, 36, 36); route(8, 30, 2, 36);
route(2, 36, 20, 36); route(20, 36, 36, 36); route(20, 20, 20, 36);

// ---- Agent-built entities (STATIC, embedded from crystal-world-data.js) ----
const entMeshes = new Map();
const tallGrass = [];
function clearEntities() { for (const [, m] of entMeshes) scene.remove(m); entMeshes.clear(); }
function addEntity(e) {
  if (entMeshes.has(e.id)) return;
  const g = new THREE.Group();
  const kind = e.kind || 'default';
  let mesh;
  if (kind.includes('tree')) { mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2e8b57 })); mesh.position.y = 1.2; mesh.castShadow = true; }
  else if (kind.includes('shrine')) { mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.2), new THREE.MeshStandardMaterial({ color: 0xc94f7c, emissive: 0x551133, emissiveIntensity: 0.3 })); mesh.position.y = 1; mesh.castShadow = true; }
  else if (kind.includes('npc')) { mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6c5ce7 })); mesh.position.y = 0.8; }
  else if (kind.includes('path')) { mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0xb8a06a })); mesh.position.y = 0.06; }
  else if (kind.includes('glyph')) { mesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 16), new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x114455, emissiveIntensity: 0.5 })); mesh.position.y = 0.6; mesh.rotation.x = Math.PI / 2; }
  else { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0xd4af37 })); mesh.position.y = 0.4; }
  g.add(mesh); g.position.set(e.x || 0, 0, e.z || 0); scene.add(g); entMeshes.set(e.id, g);
}
function renderWorld(world) {
  clearEntities();
  tallGrass.length = 0;
  const ents = (world && world.entities) || [];
  const hud = document.getElementById('hud-entities');
  if (hud) hud.textContent = ents.length;
  for (const e of ents) addEntity(e);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9 });
  const spots = [[14, 14], [20, 20], [12, 24], [24, 12], [16, 32], [26, 26], [10, 14]];
  for (const [gx, gz] of spots) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 3), grassMat);
    patch.position.set(gx, 0.2, gz); patch.userData = { isTallGrass: true };
    scene.add(patch); tallGrass.push(patch);
  }
}
function loadCrystalWorld() { renderWorld({ entities: CRYSTAL_WORLD }); }

// ---- STANDALONE game state ----
const POKEMON_DB = [
  { id: 155, name: 'Cyndaquil', type: 'Fire', hp: 39, maxHp: 39, level: 5, moves: ['Tackle', 'Ember', 'Quick Attack'], sprite: '🔥' },
  { id: 158, name: 'Totodile', type: 'Water', hp: 50, maxHp: 50, level: 5, moves: ['Scratch', 'Water Gun', 'Bite'], sprite: '🐊' },
  { id: 152, name: 'Chikorita', type: 'Grass', hp: 45, maxHp: 45, level: 5, moves: ['Tackle', 'Vine Whip', 'Razor Leaf'], sprite: '🍃' },
  { id: 25, name: 'Pikachu', type: 'Electric', hp: 42, maxHp: 42, level: 7, moves: ['Thunder Shock', 'Quick Attack', 'Thunder Wave'], sprite: '⚡' },
  { id: 149, name: 'Dragonite', type: 'Dragon', hp: 91, maxHp: 91, level: 25, moves: ['Dragon Rage', 'Wing Attack', 'Hyper Beam'], sprite: '🐉' },
  { id: 245, name: 'Suicune', type: 'Water/Ice', hp: 100, maxHp: 100, level: 30, moves: ['Aurora Beam', 'Hydro Pump', 'Blizzard'], sprite: '❄️' },
  { id: 16, name: 'Pidgey', type: 'Flying', hp: 36, maxHp: 36, level: 4, moves: ['Tackle', 'Gust'], sprite: '🐦' },
];
const SPECIES_SCALE = { Suicune: 3.4, Cyndaquil: 2.4, Totodile: 2.5, Chikorita: 2.4, Pidgey: 2.0, Geodude: 2.6, Togepi: 1.8, Dragonite: 3.2, Pikachu: 2.2 };
function speciesScale(name) { return SPECIES_SCALE[name] || 2.4; }
const POKEMON_TOTAL = 251;
const defaultTrainer = () => ({
  name: 'Ethan', badges: ['Zephyr', 'Hive'], money: 3500,
  party: [
    { id: 155, name: 'Cyndaquil', type: 'Fire', hp: 39, maxHp: 39, level: 12, moves: ['Ember', 'Tackle', 'Quick Attack'], sprite: '🔥' },
    { id: 158, name: 'Totodile', type: 'Water', hp: 48, maxHp: 50, level: 14, moves: ['Water Gun', 'Bite', 'Scratch'], sprite: '🐊' },
  ],
  inventory: { pokeballs: 10, potions: 5, revive: 2 }, seen: [], caught: [], expShare: false,
});
let trainerState = defaultTrainer();
try { const s = localStorage.getItem(SAVE_KEY); if (s) trainerState = { ...defaultTrainer(), ...JSON.parse(s) }; } catch { /* */ }
function saveTrainer() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(trainerState)); } catch { /* */ } }

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
  if (defType.includes('/')) { const dt2 = defType.split('/')[1].trim(); return (TYPE_CHART[mt][dt] ?? 1) * (TYPE_CHART[mt][dt2] ?? 1); }
  return TYPE_CHART[mt][dt] ?? 1;
}

let roamerMesh = null;
let roamer = { name: 'Suicune', sprite: '❄️', level: 40, x: 20, z: 20, type: 'Water/Ice' };
function roamStep() {
  roamer.x = Math.max(2, Math.min(38, roamer.x + (Math.random() * 8 - 4)));
  roamer.z = Math.max(2, Math.min(38, roamer.z + (Math.random() * 8 - 4)));
  if (roamerMesh) roamerMesh.position.set(roamer.x, 0.7, roamer.z);
}
function loadRoamer() {
  if (!roamerMesh) {
    roamerMesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x33ccff, emissive: 0x114455, emissiveIntensity: 0.6 }));
    roamerMesh.position.y = 0.7; roamerMesh.rotation.y = Math.PI / 4; scene.add(roamerMesh);
  }
  roamerMesh.position.set(roamer.x, 0.7, roamer.z);
}
setInterval(roamStep, 4000);

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
  camYaw -= (e.clientX - lastX) * 0.005;
  camPitch = Math.max(0.15, Math.min(1.3, camPitch - (e.clientY - lastY) * 0.004));
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('error', (e) => {
  const d = document.getElementById('err');
  if (d) { d.style.display = 'block'; d.textContent = 'ERROR: ' + (e.message || e.error || 'unknown') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''); }
});
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyB') togglePokedex();
  if (e.code === 'KeyT') toggleTrade();
});
addEventListener('keyup', (e) => (keys[e.code] = false));

const SPEED = 9;
let running = false;
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
    if (roamerMesh && Math.abs(roamerMesh.position.x - player.position.x) < 2 && Math.abs(roamerMesh.position.z - player.position.z) < 2) {
      if (!encounterCooldown && Math.random() < 0.5) sightRoamer();
    }
  }
  // billboard trees/signs/NPCs toward camera
  for (const t of TREES) t.rotation.y = camYaw;
  applyDayNight(performance.now() / 1000);
  updateCamera();
  renderer.render(scene, camera);
}

// ---- PHASE 1: interaction ----
const NPC_LINES = {
  'Elm': 'Welcome! Take a starter and begin your Johto journey. The roaming Suicune awaits a worthy trainer.',
  'Kimono Girl': 'The crystal tides sing. Suicune walks the rivers of Johto — follow the water.',
  'Youngster': 'My Rattata is top percentage! Battle me anytime!',
};
async function interact() {
  if (inBattle) return;
  for (const [name, x, z, badge] of GYM_SIGNS) {
    if (Math.abs(x - player.position.x) < 3 && Math.abs(z - player.position.z) < 3) {
      if (!trainerState.badges.includes(badge)) { trainerState.badges.push(badge); saveTrainer(); }
      showDialogue(`You earned the ${badge} Badge!`);
      refreshHud(); return;
    }
  }
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

let wildPokemon = null, inBattle = false;
let playerHp = 39, playerMaxHp = 39, wildHp = 100, wildMaxHp = 100;
async function triggerEncounter() {
  if (inBattle || encounterCooldown) return;
  encounterCooldown = true;
  setTimeout(() => (encounterCooldown = false), 6000);
  const wild = POKEMON_DB[Math.floor(Math.random() * POKEMON_DB.length)];
  wildPokemon = wild; wildHp = wild.hp; wildMaxHp = wild.hp; inBattle = true;
  document.getElementById('btl-wild-name').textContent = 'Wild ' + wild.name;
  document.getElementById('btl-wild-lvl').textContent = 'Lv. ' + wild.level;
  const wildSpriteEl = document.getElementById('btl-wild-sprite');
  wildSpriteEl.textContent = wild.sprite || '🐉';
  wildSpriteEl.style.fontSize = (speciesScale(wild.name) * 1.4) + 'rem';
  camDist = 6; camPitch = 0.5; camHeight = 5;
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
    const eff = moveEffectiveness(btn.dataset.type || 'Normal', wildPokemon.type || 'Normal');
    const dmg = Math.round(pwr * eff);
    wildHp = Math.max(0, wildHp - dmg);
    updateHpBars();
    const log = document.getElementById('btl-log');
    const effTxt = eff > 1 ? ' It\'s super effective!' : eff < 1 ? ' It\'s not very effective...' : '';
    if (wildHp <= 0) { log.textContent = `Cyndaquil used ${btn.dataset.move}!${effTxt} Wild ${wildPokemon.name} fainted!`; setTimeout(endBattle, 1400); }
    else {
      const ret = Math.round((8 + Math.random() * 12) * (1 / Math.max(0.5, eff)));
      playerHp = Math.max(0, playerHp - ret); updateHpBars();
      log.textContent = `Cyndaquil used ${btn.dataset.move}!${effTxt} Wild ${wildPokemon.name} used Tackle (-${ret} HP).`;
      if (playerHp <= 0) { log.textContent = 'Cyndaquil fainted! You scurry back to the lab.'; setTimeout(endBattle, 1400); }
    }
  };
});
document.getElementById('btl-btn-catch').onclick = async () => {
  if (trainerState.inventory.pokeballs > 0) {
    trainerState.inventory.pokeballs--;
    if (wildPokemon) { trainerState.party.push(wildPokemon); if (!trainerState.caught.includes(wildPokemon.name)) trainerState.caught.push(wildPokemon.name); }
    saveTrainer();
  }
  document.getElementById('btl-log').textContent = `You threw a Poké Ball at ${wildPokemon.name}!`;
  setTimeout(() => { document.getElementById('btl-log').textContent = `${wildPokemon.name} was caught! Added to your party.`; refreshHud(); setTimeout(endBattle, 1400); }, 900);
};
document.getElementById('btl-btn-item').onclick = () => { playerHp = Math.min(playerMaxHp, playerHp + 20); updateHpBars(); document.getElementById('btl-log').textContent = 'You used a Potion! Cyndaquil recovered 20 HP.'; };
document.getElementById('btl-btn-run').onclick = () => { document.getElementById('btl-log').textContent = 'You got away safely!'; setTimeout(endBattle, 900); };
function endBattle() { inBattle = false; document.getElementById('battle-modal').style.display = 'none'; }

function togglePokedex() {
  const el = document.getElementById('pokedex');
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.querySelector('.dex-body').innerHTML = `<b>Seen:</b> ${trainerState.seen.length}/${POKEMON_TOTAL} &nbsp; <b>Caught:</b> ${trainerState.caught.length}/${POKEMON_TOTAL}<br>` + (trainerState.caught.length ? trainerState.caught.join(', ') : 'No Pokémon caught yet. Walk in tall grass!');
  el.style.display = 'block';
}
function toggleTrade() {
  const el = document.getElementById('trade-board');
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  renderTrades(); el.style.display = 'block';
}
function renderTrades() {
  const el = document.getElementById('trade-board');
  const list = el.querySelector('.trade-list');
  if (!tradeBoard.length) { list.innerHTML = '<i>No trades posted yet.</i>'; }
  else list.innerHTML = tradeBoard.map((t) => `<div class="trade-row"><span>${t.offer.sprite} ${t.offer.name} Lv.${t.offer.level} → wants ${t.want}</span><button class="battle-btn" onclick="claimTrade('${t.id}')">Claim</button></div>`).join('');
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
function showStarterPicker() {
  const el = document.getElementById('starter-pick');
  if (!el) return;
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
showStarterPicker();
animate();
console.log('[crystal3d] STANDALONE (real Crystal assets) ready — WASD walk, Shift run, E interact, B dex, T trade');
