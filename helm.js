// helm.js — The Helm client: modular channels + 3D Pokémon Crystal Engine + Steer Box + Interactive Raycasting
import * as THREE from 'three';
import { loadCrocotile } from './crocotile.js';

const API = '';
let active = null;          // active channel id
let channelMeta = {};       // id -> manifest
let world = null;           // active world state
let steerLog = [];
let audioEnabled = true;
let currentInspectedEntity = null;

// Pokémon Battle & Trainer State
let wildPokemon = null;
let playerHp = 39, playerMaxHp = 39;
let wildHp = 100, wildMaxHp = 100;
let inBattle = false;
let encounterCooldown = false;

// ---------- Web Audio API Retro 8-bit Sound Generator ----------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playAudioFx(type) {
  if (!audioEnabled || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
      osc.start(now); osc.stop(now + 0.06);
    } else if (type === 'switch') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'battleStart') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.setValueAtTime(450, now + 0.08);
      osc.frequency.setValueAtTime(600, now + 0.16);
      osc.frequency.setValueAtTime(900, now + 0.24);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'attackHit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'catchSuccess') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      osc.frequency.setValueAtTime(1046.50, now + 0.3);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.45);
      osc.start(now); osc.stop(now + 0.45);
    } else if (type === 'build') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.08);
      osc.frequency.setValueAtTime(659.25, now + 0.16);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    } else if (type === 'steer') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'demolish') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    }
  } catch (e) {}
}

document.getElementById('sound-toggle').onclick = () => {
  audioEnabled = !audioEnabled;
  document.getElementById('sound-toggle').textContent = audioEnabled ? '🔊 Sound' : '🔇 Muted';
  if (audioEnabled) playAudioFx('click');
};

// ---------- Three.js WebGL Scene Setup ----------
const view = document.getElementById('view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070614);
scene.fog = new THREE.FogExp2(0x070614, 0.016);

const camera = new THREE.PerspectiveCamera(60, view.clientWidth / view.clientHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(view.clientWidth, view.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);

// Lighting
const hemiLight = new THREE.HemisphereLight(0xbb88ff, 0x100a20, 0.8);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffd9a0, 1.3);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
scene.add(sun);

// ---------- Crocotile 3D Environment Model Loading FIRST ----------
let crocoGroup = null;
function loadCrocotileEnvironment() {
  if (crocoGroup) scene.remove(crocoGroup);
  fetch('./assets/environment.crocotile')
    .then((r) => r.json())
    .then((json) => {
      crocoGroup = loadCrocotile(json, {
        onSkybox: (skyTex) => {
          scene.background = skyTex;
        }
      });
      crocoGroup.position.set(20, 0, 20);
      crocoGroup.scale.setScalar(0.045);
      scene.add(crocoGroup);
      console.log('[helm] Crocotile 3D Environment loaded FIRST');
    })
    .catch((e) => console.warn('[helm] Crocotile load skipped:', e));
}
loadCrocotileEnvironment();

// ---------- Refreshed High-Res Channel Tileset Art Assets ----------
const loader = new THREE.TextureLoader();
const rawCrystalHDAtlas = loader.load('./assets/tileset_crystal_hd.png');
const rawCyberAtlas = loader.load('./assets/tileset_cyber.png');
const rawLibraryAtlas = loader.load('./assets/tileset_library.png');
const rawAmberAtlas = loader.load('./assets/tileset_amber.png');
const rawComAtlas = loader.load('./assets/tileset_com.png');
const raw2Atlas = loader.load('./assets/tileset2.png');

// Crop a single sub-tile into a standalone seamless canvas texture
function createSubTileTexture(sourceImage, col = 0, row = 0, totalCols = 8, totalRows = 6) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (sourceImage && sourceImage.width) {
    const sw = sourceImage.width / totalCols;
    const sh = sourceImage.height / totalRows;
    ctx.drawImage(sourceImage, col * sw, row * sh, sw, sh, 0, 0, 128, 128);
  } else {
    ctx.fillStyle = '#1b263b';
    ctx.fillRect(0, 0, 128, 128);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function spliceTileTexture(sourceTexture, col, row, totalCols = 4, totalRows = 4) {
  const tex = sourceTexture.clone();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.repeat.set(1 / totalCols, 1 / totalRows);
  tex.offset.set(col / totalCols, 1 - (row + 1) / totalRows);
  tex.needsUpdate = true;
  return tex;
}

function getSplicedMaterial(sourceTexture, col = 0, row = 0, totalCols = 4, totalRows = 4, roughness = 0.7) {
  return new THREE.MeshStandardMaterial({
    map: spliceTileTexture(sourceTexture, col, row, totalCols, totalRows),
    roughness,
    metalness: 0.1,
  });
}

// ---------- Clean Overworld Ground Plane ----------
let groundMesh = null;
function setGroundTheme(theme) {
  if (groundMesh) scene.remove(groundMesh);

  let themeName = 'Crystal Ice';
  let groundColor = 0x12142c;

  if (theme === 'terminal-green') {
    themeName = 'Terminal Green';
    groundColor = 0x051a0d;
    scene.background = new THREE.Color(0x040d07);
    scene.fog.color.setHex(0x040d07);
    hemiLight.color.setHex(0x5a8f6b);
    hemiLight.groundColor.setHex(0x031408);
    sun.color.setHex(0x33ff88);
  } else if (theme === 'terminal-amber') {
    themeName = 'Terminal Amber';
    groundColor = 0x1c1204;
    scene.background = new THREE.Color(0x0e0902);
    scene.fog.color.setHex(0x0e0902);
    hemiLight.color.setHex(0xffaa33);
    hemiLight.groundColor.setHex(0x1a0a00);
    sun.color.setHex(0xffbb44);
  } else if (theme === 'library-violet') {
    themeName = 'Library Violet';
    groundColor = 0x1d112b;
    scene.background = new THREE.Color(0x0d0717);
    scene.fog.color.setHex(0x0d0717);
    hemiLight.color.setHex(0xcdbff0);
    hemiLight.groundColor.setHex(0x1a0f28);
    sun.color.setHex(0xffd4a0);
  } else {
    themeName = 'Crystal Ice';
    groundColor = 0x12142c;
    scene.fog.color.setHex(0x070614);
    hemiLight.color.setHex(0xbb88ff);
    hemiLight.groundColor.setHex(0x100a20);
    sun.color.setHex(0xffd9a0);
  }

  // Create clean pixel grass/path ground material
  const mat = new THREE.MeshStandardMaterial({
    color: groundColor,
    roughness: 0.85,
    metalness: 0.05,
  });

  // Use real pixel tileset image if loaded
  if (rawComAtlas.image && rawComAtlas.image.complete) {
    const tileTex = createSubTileTexture(rawComAtlas.image, 0, 0, 8, 6);
    tileTex.repeat.set(30, 30);
    mat.map = tileTex;
    mat.color.setHex(0xffffff);
  }

  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 40, 40), mat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  document.getElementById('stat-theme').textContent = themeName;
}

// ---------- Clean 3D Johto Architecture & Buildings ----------
let johtoTownGroup = null;
function createJohtoTown() {
  if (johtoTownGroup) scene.remove(johtoTownGroup);
  johtoTownGroup = new THREE.Group();

  // 1. Pokémon Center (Red Roof)
  const matCenterRoof = new THREE.MeshStandardMaterial({ color: 0xcc2233, roughness: 0.4 });
  const matCenterWall = getSplicedMaterial(rawCrystalHDAtlas, 1, 0, 4, 4);
  const matCenterDoor = getSplicedMaterial(rawCrystalHDAtlas, 0, 2, 4, 4);
  const centerMat = [matCenterWall, matCenterWall, matCenterRoof, matCenterWall, matCenterDoor, matCenterWall];
  const pkmnCenter = new THREE.Mesh(new THREE.BoxGeometry(6, 4.5, 5), centerMat);
  pkmnCenter.position.set(10, 2.25, 10);
  pkmnCenter.castShadow = true; pkmnCenter.receiveShadow = true;

  const signCenter = makeLabel('🏥 Pokémon Center');
  signCenter.position.set(10, 5.2, 10);
  johtoTownGroup.add(pkmnCenter, signCenter);

  // 2. PokéMart (Blue Roof)
  const matMartRoof = new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.4 });
  const martMat = [matCenterWall, matCenterWall, matMartRoof, matCenterWall, matCenterDoor, matCenterWall];
  const pokeMart = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 5), martMat);
  pokeMart.position.set(28, 2.1, 10);
  pokeMart.castShadow = true; pokeMart.receiveShadow = true;
  const signMart = makeLabel('🏪 PokéMart');
  signMart.position.set(28, 4.8, 10);
  johtoTownGroup.add(pokeMart, signMart);

  // 3. Professor Elm's Lab (Large Voxel Building)
  const matLabRoof = getSplicedMaterial(rawComAtlas, 0, 0, 8, 6);
  const labMat = [matCenterWall, matCenterWall, matLabRoof, matCenterWall, matCenterDoor, matCenterWall];
  const elmsLab = new THREE.Mesh(new THREE.BoxGeometry(8, 5.5, 6), labMat);
  elmsLab.position.set(19, 2.75, 30);
  elmsLab.castShadow = true; elmsLab.receiveShadow = true;
  const signLab = makeLabel("🧪 Prof. Elm's Lab");
  signLab.position.set(19, 6.2, 30);
  johtoTownGroup.add(elmsLab, signLab);

  // 4. Tall Grass Encounters Zone (Interactive)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9 });
  for (let gx = 0; gx < 4; gx++) {
    for (let gz = 0; gz < 4; gz++) {
      const patch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.4), grassMat);
      patch.position.set(6 + gx * 1.6, 0.18, 22 + gz * 1.6);
      patch.userData = { isTallGrass: true };
      patch.castShadow = true;
      johtoTownGroup.add(patch);
    }
  }
  const grassLabel = makeLabel('🌿 Tall Grass (Encounters)');
  grassLabel.position.set(8.5, 1.4, 24.5);
  johtoTownGroup.add(grassLabel);

  // 5. Water Pond
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, roughness: 0.1, transparent: true, opacity: 0.8 });
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 24), waterMat);
  pond.position.set(30, 0.05, 26);
  johtoTownGroup.add(pond);

  scene.add(johtoTownGroup);
}
createJohtoTown();

// Atmospheric Particle System
let particleSystem = null;
function createParticles() {
  if (particleSystem) scene.remove(particleSystem);
  const count = 100;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    pos[i] = (Math.random() - 0.5) * 80 + 20;
    pos[i + 1] = Math.random() * 25 + 0.5;
    pos[i + 2] = (Math.random() - 0.5) * 80 + 20;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xd4af37,
    size: 0.35,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });
  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}
createParticles();

// ---------- Trainer Ethan 3D Avatar & Movement Controller ----------
const player = new THREE.Group();
player.position.set(19, 0, 18);
scene.add(player);

const avatar = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc2233, roughness: 0.6 }); // Ethan's red jacket
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), bodyMat);
body.position.y = 0.9; body.castShadow = true;

const headMat = new THREE.MeshStandardMaterial({ color: 0xf5d6ba, roughness: 0.8 });
const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), headMat);
head.position.y = 1.68; head.castShadow = true;

// Backwards Red/Gold Cap
const capMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.5 });
const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
cap.position.y = 1.84; cap.rotation.x = -Math.PI / 6;

// Backpack
const bagMat = new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.7 });
const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), bagMat);
backpack.position.set(0, 1.0, -0.25);

avatar.add(body, head, cap, backpack);
player.add(avatar);

let camYaw = 0, camPitch = 0.58, camDist = 12, camHeight = 9;
function updateCamera() {
  camera.position.set(
    player.position.x + Math.sin(camYaw) * camDist,
    camHeight,
    player.position.z + Math.cos(camYaw) * camDist
  );
  camera.lookAt(player.position.x, 1.4, player.position.z);
}

// ---------- Clean 3D Entity Construction & Distance-Culled Tooltips ----------
const entMeshes = new Map();
const labelSprites = [];

function rebuildEntities() {
  for (const [id, m] of entMeshes) {
    scene.remove(m);
    entMeshes.delete(id);
  }
  labelSprites.length = 0;
  if (!world) return;
  document.getElementById('stat-count').textContent = world.entities.length;
  for (const e of world.entities) addEntityMesh(e);
}

function addEntityMesh(e) {
  if (entMeshes.has(e.id)) return;

  const g = new THREE.Group();
  g.userData = { entity: e };

  const kind = e.kind || 'default';
  let mainMesh;

  if (kind === 'plant-tree') {
    mainMesh = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }));
    trunk.position.y = 0.6; trunk.castShadow = true;
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.7 }));
    foliage.position.y = 1.8; foliage.castShadow = true;
    mainMesh.add(trunk, foliage);
  } else if (kind === 'raise-shrine') {
    mainMesh = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.6 }));
    base.position.y = 0.2; base.castShadow = true;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0xd4af37, emissiveIntensity: 0.6 }));
    orb.position.y = 1.0;
    mainMesh.add(base, orb);
  } else if (kind === 'spawn-npc') {
    mainMesh = new THREE.Group();
    const npcBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x336699, roughness: 0.7 }));
    npcBody.position.y = 0.9; npcBody.castShadow = true;
    const npcHead = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5d6ba }));
    npcHead.position.y = 1.65;
    mainMesh.add(npcBody, npcHead);
  } else if (kind === 'lay-path') {
    const matPathTile = getSplicedMaterial(rawCrystalHDAtlas, 2, 0, 4, 4);
    mainMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.2), matPathTile);
    mainMesh.position.y = 0.04;
  } else if (kind.includes('pokemon') || kind.includes('suicune') || kind.includes('cyndaquil')) {
    mainMesh = new THREE.Group();
    const pOrb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x33aaff, emissive: 0x1188ff, emissiveIntensity: 0.6 }));
    pOrb.position.y = 0.8;
    mainMesh.add(pOrb);
  } else {
    mainMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4, emissive: 0xd4af37, emissiveIntensity: 0.3 }));
    mainMesh.position.y = 0.8; mainMesh.castShadow = true;
  }

  g.add(mainMesh);

  if (e.text) {
    const spr = makeLabel(e.text);
    spr.position.y = 2.2;
    g.add(spr);
    labelSprites.push({ sprite: spr, worldPos: g.position });
  }

  g.position.set(e.x || 0, 0, e.z || 0);
  scene.add(g);
  entMeshes.set(e.id, g);
}

function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(14, 9, 23, 0.88)';
  x.roundRect(4, 4, 248, 48, 10); x.fill();
  x.strokeStyle = 'rgba(212, 175, 55, 0.4)'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#fbe6b0'; x.font = '600 16px Inter, sans-serif'; x.textAlign = 'center';
  x.fillText(text.slice(0, 24), 128, 32);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(3.2, 0.7, 1);
  return s;
}

// ---------- Channels & REST Client ----------
async function loadChannels() {
  try {
    const r = await fetch(API + '/channels');
    const d = await r.json();
    active = d.active; channelMeta = {};
    const rail = document.getElementById('channels'); rail.innerHTML = '';

    for (const c of d.channels) {
      channelMeta[c.id] = c;
      const el = document.createElement('div');
      el.className = 'chan' + (c.id === active ? ' active' : '');
      el.innerHTML = `
        <div class="name">${c.name}</div>
        <div class="type">${c.type}</div>
        <div class="desc">${c.desc}</div>
        ${c.id === active ? '<span class="badge">live</span>' : ''}
      `;
      el.onclick = () => switchChannel(c.id);
      rail.appendChild(el);
    }
    await loadState();
  } catch (err) {
    console.error('[helm] channel load error:', err);
  }
}

async function switchChannel(id) {
  if (id === active) return;
  playAudioFx('switch');
  await fetch(API + '/channel/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  active = id;
  await loadState();
  renderRail();
}

async function loadState() {
  const r = await fetch(API + '/channel/state');
  const d = await r.json();
  active = d.id; world = d.world;
  document.getElementById('vp-name').textContent = d.name;
  document.getElementById('vp-agent').textContent = 'agent: ' + d.agent;
  document.getElementById('stat-speed').textContent = (channelMeta[d.id]?.agentInterval || 4000) / 1000 + 's';
  setGroundTheme(world.meta.theme);
  rebuildEntities();
}

function renderRail() {
  document.querySelectorAll('.chan').forEach((el, i) => {
    const ids = Object.keys(channelMeta);
    el.classList.toggle('active', ids[i] === active);
    const badge = el.querySelector('.badge');
    if (ids[i] === active) {
      if (!badge) el.insertAdjacentHTML('beforeend', '<span class="badge">live</span>');
    } else {
      if (badge) badge.remove();
    }
  });
}

// ---------- SSE Stream Subscription ----------
function openStream() {
  const es = new EventSource(API + '/stream');
  es.addEventListener('channel', (ev) => {
    active = JSON.parse(ev.data).active;
    loadState(); renderRail();
  });
  es.addEventListener('world', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.channel !== active) return;
    world = d.world;
    rebuildEntities();
  });
  es.addEventListener('steer', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.channel !== active) return;
    addDir('helm', '⚓ Steer: ' + d.directive);
  });
}

// ---------- Steer Box & Quick Chips ----------
function addDir(cls, text) {
  steerLog.unshift({ cls, text, time: new Date().toLocaleTimeString() });
  const dir = document.getElementById('dir');
  dir.innerHTML = steerLog.slice(0, 40).map((r) => `
    <div class="row ${r.cls}">
      <div style="font-size:0.65rem;opacity:0.6">${r.time}</div>
      <div>${r.text}</div>
    </div>
  `).join('');
}

document.getElementById('send').onclick = async () => {
  const box = document.getElementById('steerbox');
  const text = box.value.trim();
  if (!text) return;
  playAudioFx('steer');
  addDir('helm', '⚓ ' + text);
  await fetch(API + '/helm/steer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directive: text })
  });
  box.value = '';
};

document.querySelectorAll('.chip').forEach((chip) => {
  chip.onclick = () => {
    const box = document.getElementById('steerbox');
    box.value = chip.dataset.text;
    playAudioFx('click');
  };
});

// ---------- Interactive Raycasting & Viewport Actions ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('click', (e) => {
  if (dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  for (const hit of intersects) {
    let obj = hit.object;
    while (obj && !obj.userData?.entity && obj.parent) obj = obj.parent;
    if (obj && obj.userData?.entity) {
      showInspector(obj.userData.entity);
      playAudioFx('click');
      return;
    }
  }
});

function showInspector(ent) {
  currentInspectedEntity = ent;
  const modal = document.getElementById('inspector-modal');
  document.getElementById('insp-kind').textContent = ent.kind || 'landmark';
  document.getElementById('insp-by').textContent = ent.by || 'user';
  document.getElementById('insp-text').textContent = ent.text || 'No text content';
  document.getElementById('insp-coords').textContent = `X: ${ent.x}, Z: ${ent.z}`;
  modal.style.display = 'flex';
}

document.getElementById('inspector-close').onclick = () => {
  document.getElementById('inspector-modal').style.display = 'none';
  currentInspectedEntity = null;
};

document.getElementById('btn-demolish').onclick = async () => {
  if (!currentInspectedEntity) return;
  playAudioFx('demolish');
  await fetch(API + '/world/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: currentInspectedEntity.id })
  });
  document.getElementById('inspector-modal').style.display = 'none';
  currentInspectedEntity = null;
};

document.getElementById('btn-build').onclick = async () => {
  playAudioFx('build');
  const x = Math.round(player.position.x);
  const z = Math.round(player.position.z);
  await fetch(API + '/world/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'user-build',
      text: 'User Landmark @ (' + x + ',' + z + ')',
      x, z, by: 'user'
    })
  });
};

document.getElementById('btn-recenter').onclick = () => {
  camYaw = 0; camPitch = 0.58;
  playAudioFx('click');
};

// ---------- Interactive 3D Pokémon Battle Engine ----------
async function triggerEncounter() {
  if (inBattle || encounterCooldown) return;
  encounterCooldown = true;
  setTimeout(() => (encounterCooldown = false), 6000);

  try {
    const r = await fetch(API + '/pokemon/encounter');
    const d = await r.json();
    if (!d.ok) return;

    wildPokemon = d.wild;
    wildHp = wildPokemon.hp; wildMaxHp = wildPokemon.hp;
    inBattle = true;

    playAudioFx('battleStart');
    document.getElementById('btl-wild-name').textContent = wildPokemon.name;
    document.getElementById('btl-wild-lvl').textContent = 'Lv. ' + wildPokemon.level;
    document.getElementById('btl-wild-sprite').textContent = wildPokemon.sprite || '🐉';
    updateHpBars();

    document.getElementById('btl-log').textContent = `Wild ${wildPokemon.name} appeared! What will Cyndaquil do?`;
    document.getElementById('btl-menu').style.display = 'grid';
    document.getElementById('btl-moves-menu').style.display = 'none';
    document.getElementById('battle-modal').style.display = 'flex';
  } catch (err) {
    console.error('[pokemon] encounter error:', err);
  }
}

document.getElementById('btn-battle').onclick = triggerEncounter;

function updateHpBars() {
  const pPct = Math.max(0, (playerHp / playerMaxHp) * 100);
  const wPct = Math.max(0, (wildHp / wildMaxHp) * 100);
  document.getElementById('btl-player-hp').style.width = pPct + '%';
  document.getElementById('btl-wild-hp').style.width = wPct + '%';
}

document.getElementById('btl-btn-fight').onclick = () => {
  playAudioFx('click');
  document.getElementById('btl-menu').style.display = 'none';
  document.getElementById('btl-moves-menu').style.display = 'grid';
};

document.getElementById('btl-btn-back').onclick = () => {
  playAudioFx('click');
  document.getElementById('btl-moves-menu').style.display = 'none';
  document.getElementById('btl-menu').style.display = 'grid';
};

document.querySelectorAll('.move-btn').forEach((btn) => {
  btn.onclick = () => {
    const move = btn.dataset.move;
    const pwr = parseInt(btn.dataset.power || '30', 10);
    playAudioFx('attackHit');

    const dmg = Math.floor(pwr * (0.8 + Math.random() * 0.4));
    wildHp = Math.max(0, wildHp - dmg);
    updateHpBars();

    document.getElementById('btl-log').textContent = `Cyndaquil used ${move}! Dealt ${dmg} damage to ${wildPokemon.name}!`;

    if (wildHp <= 0) {
      setTimeout(() => {
        playAudioFx('catchSuccess');
        document.getElementById('btl-log').textContent = `Wild ${wildPokemon.name} fainted! Cyndaquil gained 145 EXP!`;
        setTimeout(endBattle, 1800);
      }, 800);
    } else {
      setTimeout(enemyTurn, 1400);
    }
  };
});

function enemyTurn() {
  const move = wildPokemon.moves ? wildPokemon.moves[Math.floor(Math.random() * wildPokemon.moves.length)] : 'Tackle';
  playAudioFx('attackHit');

  const dmg = Math.floor(12 + Math.random() * 8);
  playerHp = Math.max(0, playerHp - dmg);
  updateHpBars();

  document.getElementById('btl-log').textContent = `Wild ${wildPokemon.name} used ${move}! Cyndaquil took ${dmg} damage!`;

  if (playerHp <= 0) {
    setTimeout(() => {
      document.getElementById('btl-log').textContent = `Cyndaquil fainted! Trainer Ethan rushed to the Pokémon Center!`;
      playerHp = playerMaxHp;
      setTimeout(endBattle, 2000);
    }, 1000);
  } else {
    setTimeout(() => {
      document.getElementById('btl-moves-menu').style.display = 'none';
      document.getElementById('btl-menu').style.display = 'grid';
    }, 1000);
  }
}

document.getElementById('btl-btn-catch').onclick = async () => {
  playAudioFx('click');
  document.getElementById('btl-log').textContent = `Ethan threw a Pokéball at Wild ${wildPokemon.name}... 🔴`;

  const r = await fetch(API + '/pokemon/catch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pokemon: wildPokemon })
  });
  const d = await r.json();

  if (d.success) {
    setTimeout(() => {
      playAudioFx('catchSuccess');
      document.getElementById('btl-log').textContent = `Gotcha! ${wildPokemon.name} was caught! 🎉`;
      document.getElementById('hud-balls').textContent = d.trainer.inventory.pokeballs;
      setTimeout(endBattle, 1800);
    }, 1200);
  } else {
    document.getElementById('btl-log').textContent = d.reason || 'Failed to catch!';
  }
};

document.getElementById('btl-btn-item').onclick = () => {
  playAudioFx('click');
  playerHp = Math.min(playerMaxHp, playerHp + 20);
  updateHpBars();
  document.getElementById('btl-log').textContent = `Ethan used a Potion! Cyndaquil recovered 20 HP!`;
  setTimeout(enemyTurn, 1400);
};

document.getElementById('btl-btn-run').onclick = () => {
  playAudioFx('click');
  document.getElementById('btl-log').textContent = `Got away safely! 🏃`;
  setTimeout(endBattle, 1000);
};

function endBattle() {
  inBattle = false;
  document.getElementById('battle-modal').style.display = 'none';
}

// ---------- Create Channel Modal Handlers ----------
const modalOverlay = document.getElementById('chan-modal-overlay');
document.getElementById('open-chan-modal').onclick = () => {
  modalOverlay.style.display = 'flex';
  playAudioFx('click');
};
document.getElementById('close-chan-modal').onclick = () => {
  modalOverlay.style.display = 'none';
};
document.getElementById('submit-chan-modal').onclick = async () => {
  const name = document.getElementById('new-chan-name').value.trim();
  const type = document.getElementById('new-chan-type').value;
  const desc = document.getElementById('new-chan-desc').value.trim();
  const steer = document.getElementById('new-chan-steer').value.trim();

  if (!name) return;
  playAudioFx('build');

  await fetch(API + '/channel/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, desc, steer })
  });

  modalOverlay.style.display = 'none';
  document.getElementById('new-chan-name').value = '';
  document.getElementById('new-chan-desc').value = '';
  document.getElementById('new-chan-steer').value = '';

  await loadChannels();
};

// ---------- Controls & Movement Loop ----------
const blocker = document.getElementById('blocker');
let dragging = false, lastX = 0, lastY = 0;

blocker.onclick = () => (blocker.style.display = 'none');
renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = false; lastX = e.clientX; lastY = e.clientY;
  blocker.style.display = 'none';
});
addEventListener('mouseup', () => {});
addEventListener('mousemove', (e) => {
  if (e.buttons !== 1) return;
  const dx = e.clientX - lastX; const dy = e.clientY - lastY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging = true;
  lastX = e.clientX; lastY = e.clientY;
  camYaw -= dx * 0.005;
  camPitch = Math.max(0.15, Math.min(1.3, camPitch - dy * 0.004));
});

const keys = {};
addEventListener('keydown', (e) => (keys[e.code] = true));
addEventListener('keyup', (e) => (keys[e.code] = false));

const SPEED = 10;
function animate() {
  requestAnimationFrame(animate);

  if (!inBattle) {
    const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const str = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);

    if (fwd || str) {
      const len = Math.hypot(fwd, str) || 1;
      const mx = (str * Math.cos(camYaw) + fwd * Math.sin(camYaw)) / len;
      const mz = (fwd * Math.cos(camYaw) - str * Math.sin(camYaw)) / len;

      player.position.x = Math.max(1, Math.min((world?.meta?.w || 40) - 1, player.position.x + mx * SPEED * 0.016));
      player.position.z = Math.max(1, Math.min((world?.meta?.h || 40) - 1, player.position.z + mz * SPEED * 0.016));
      player.rotation.y = Math.atan2(mx, mz);
      avatar.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.12;

      if (player.position.x >= 6 && player.position.x <= 12 && player.position.z >= 22 && player.position.z <= 28) {
        if (Math.random() < 0.02) triggerEncounter();
      }
    }
  }

  if (particleSystem) particleSystem.rotation.y += 0.0005;

  const camPos = camera.position;
  for (let i = 0; i < labelSprites.length; i++) {
    const item = labelSprites[i];
    const dist = camPos.distanceTo(item.worldPos);
    if (dist > 32) {
      item.sprite.visible = false;
    } else {
      item.sprite.visible = true;
      item.sprite.material.opacity = Math.max(0.2, Math.min(1.0, 1.0 - (dist - 15) / 18));
    }
  }

  updateCamera();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(view.clientWidth, view.clientHeight);
});

// Boot application
loadChannels();
openStream();
animate();
console.log('[helm] client ready — 3D Pokémon Crystal Game Engine active with seamless ground tiles');
