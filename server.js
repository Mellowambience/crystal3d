// server.js — The Helm: modular multi-channel world server + 3D Pokémon Crystal engine
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8099;
const CHANNELS_DIR = path.join(__dirname, 'channels');

// ---- Channel registry ----
function loadChannels() {
  const out = {};
  if (!fs.existsSync(CHANNELS_DIR)) return out;
  for (const name of fs.readdirSync(CHANNELS_DIR)) {
    const dir = path.join(CHANNELS_DIR, name);
    const man = path.join(dir, 'manifest.json');
    if (fs.existsSync(man)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(man, 'utf8'));
        manifest._id = name;
        manifest._dir = dir;
        const worldPath = path.join(dir, 'world.json');
        manifest.world = fs.existsSync(worldPath) ? JSON.parse(fs.readFileSync(worldPath, 'utf8')) : defaultWorld(manifest);
        out[name] = manifest;
      } catch (err) {
        console.error('[server] error loading channel manifest:', name, err);
      }
    }
  }
  return out;
}

function defaultWorld(manifest = {}) {
  const theme = manifest.type === 'security' ? 'terminal-green'
              : manifest.type === 'writing' ? 'library-violet'
              : manifest.type === 'terminal' ? 'terminal-amber'
              : 'crystal-ice';
  return {
    meta: { w: 40, h: 40, theme, created: Date.now() },
    tiles: [],
    entities: [],
    log: []
  };
}

function saveWorld(ch) {
  try {
    fs.writeFileSync(path.join(ch._dir, 'world.json'), JSON.stringify(ch.world, null, 2));
  } catch (err) {
    console.error('[server] error saving world:', ch._id, err);
  }
}

let CHANNELS = loadChannels();
let active = Object.keys(CHANNELS)[0] || 'crystal';
const clients = new Set(); // SSE listeners

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try { c.res.write(msg); } catch (e) { clients.delete(c); }
  }
}

// ---- Pokémon Crystal Database & Encounter System ----
const POKEMON_DB = [
  { id: 155, name: 'Cyndaquil', type: 'Fire', hp: 39, maxHp: 39, level: 5, moves: ['Tackle', 'Ember', 'Quick Attack'], sprite: '🔥' },
  { id: 158, name: 'Totodile', type: 'Water', hp: 50, maxHp: 50, level: 5, moves: ['Scratch', 'Water Gun', 'Bite'], sprite: '🐊' },
  { id: 152, name: 'Chikorita', type: 'Grass', hp: 45, maxHp: 45, level: 5, moves: ['Tackle', 'Vine Whip', 'Razor Leaf'], sprite: '🍃' },
  { id: 25, name: 'Pikachu', type: 'Electric', hp: 42, maxHp: 42, level: 7, moves: ['Thunder Shock', 'Quick Attack', 'Thunder Wave'], sprite: '⚡' },
  { id: 149, name: 'Dragonite', type: 'Dragon', hp: 91, maxHp: 91, level: 25, moves: ['Dragon Rage', 'Wing Attack', 'Hyper Beam'], sprite: '🐉' },
  { id: 245, name: 'Suicune', type: 'Water/Ice', hp: 100, maxHp: 100, level: 30, moves: ['Aurora Beam', 'Hydro Pump', 'Blizzard'], sprite: '❄️' },
  { id: 16, name: 'Pidgey', type: 'Flying', hp: 36, maxHp: 36, level: 4, moves: ['Tackle', 'Gust'], sprite: '🐦' },
];

let trainerState = {
  name: 'Ethan',
  badges: 2,
  money: 3500,
  party: [
    { id: 155, name: 'Cyndaquil', type: 'Fire', hp: 39, maxHp: 39, level: 12, moves: ['Ember', 'Tackle', 'Quick Attack'], sprite: '🔥' },
    { id: 158, name: 'Totodile', type: 'Water', hp: 48, maxHp: 50, level: 14, moves: ['Water Gun', 'Bite', 'Scratch'], sprite: '🐊' }
  ],
  inventory: { pokeballs: 10, potions: 5, revive: 2 }
};

// ---- Contextual text generator for agent actions ----
const ACTION_TEMPLATES = {
  'plant-tree': ['Crystal Pine planted', 'Frost Birch rooted', 'Moonberry Bush grown', 'Berry Tree planted'],
  'raise-shrine': ['Shrine of Dragonair erected', 'Icy Altar constructed', 'Johto Bell Tower pillar set', 'Sacred Torch lit'],
  'spawn-npc': ['Kimono Girl stationed', 'Professor Elm visiting', 'Youngster Joey waiting', 'Ace Trainer standing by'],
  'lay-path': ['Cobblestone path paved', 'Snowy trail marked', 'Marble steps laid', 'Lantern path lit'],
  'spawn-pokemon': ['Wild Suicune spotted', 'Wild Cyndaquil appeared', 'Wild Pikachu playing', 'Wild Dragonite soaring'],
  'audit-vault': ['AETHER Vault audited', 'Zero-trust scan passed', 'Secrets key rotated', 'Auth tokens verified'],
  'check-dns': ['DNS resolution checked', 'DoH proxy verified', 'Subdomain sweep clean', 'TLSA record validated'],
  'scan-bookmarks': ['Bookmark integrity verified', 'Broken link scrubbed', 'Session cookie isolated', 'Encrypted backup synced'],
  'harden-cookie': ['SameSite attribute enforced', 'CSP header injected', 'Strict-Transport-Security set', 'Subresource Integrity added'],
  'draft-scene': ['Scene IV drafted', 'Dialogue polished', 'Atmospheric prose added', 'Character arc advanced'],
  'name-character': ['Character named Lyra', 'Antagonist named Vane', 'Mentor named Archon', 'Companion named Zephyr'],
  'plot-twist': ['Secret letter discovered', 'Portal unlocked in vault', 'Hidden lineage revealed', 'Chrono shift triggered'],
  'close-chapter': ['Chapter III finalized', 'Epilogue penned', 'Draft saved to AETHER archive', 'Volume index updated'],
  'transmit-dispatch': ['Signal #409 transmitted', 'Emergency broadcast sent', 'Cryptographic pulse sent', 'Relay node active'],
  'intercept-signal': ['Packet intercepted @ 142.8MHz', 'Satellite beacon locked', 'Burst telemetry captured', 'Sub-space carrier detected'],
  'decrypt-wire': ['RSA-4096 key decrypted', 'Ciphertext resolved', 'Wire payload verified', 'Transmission decoded'],
  'log-frequency': ['Frequency 88.5MHz logged', 'Spectrogram clean', 'Carrier signal stable', 'Telemetry packet archived'],
};

// ---- Agent loop per channel ----
function startAgentLoop(ch) {
  const agent = ch.agent || 'idle';
  if (agent === 'idle') return;
  const tick = () => {
    if (CHANNELS[active] === ch) {
      try { runAgentStep(ch); } catch (e) { console.warn('[agent]', ch._id, e.message); }
    }
    ch._timer = setTimeout(tick, ch.agentInterval || 5000);
  };
  tick();
}

function runAgentStep(ch) {
  const verbs = ch.agentVerbs || ['build'];
  const v = verbs[Math.floor(Math.random() * verbs.length)];
  
  let labelText = ch.agentLine || 'Agent activity recorded';
  if (ACTION_TEMPLATES[v]) {
    const list = ACTION_TEMPLATES[v];
    labelText = list[Math.floor(Math.random() * list.length)];
  } else if (ch.steer) {
    labelText = `${ch.steer.slice(0, 18)} (${v})`;
  }

  const gridW = ch.world.meta.w || 40;
  const gridH = ch.world.meta.h || 40;

  const ent = {
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
    kind: v,
    text: labelText,
    x: Math.floor(Math.random() * (gridW - 4)) + 2,
    z: Math.floor(Math.random() * (gridH - 4)) + 2,
    by: 'agent:' + ch._id,
    t: Date.now(),
  };

  ch.world.entities.push(ent);
  ch.world.log.push({ t: Date.now(), by: 'agent:' + ch._id, action: v, ent });
  
  if (ch.world.entities.length > 80) ch.world.entities.shift();
  if (ch.world.log.length > 120) ch.world.log.shift();

  saveWorld(ch);
  broadcast('world', { channel: ch._id, world: ch.world });
}

// ---- HTTP Server ----
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const body = () => new Promise((r) => {
    let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } });
  });

  // SSE stream
  if (url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ active })}\n\n`);
    clients.add({ res, req });
    req.on('close', () => {
      for (const client of clients) {
        if (client.req === req) clients.delete(client);
      }
    });
    return;
  }

  // Channel list + active
  if (url.pathname === '/channels' && req.method === 'GET') {
    return send(200, {
      active,
      channels: Object.values(CHANNELS).map((c) => ({
        id: c._id, name: c.name, type: c.type, desc: c.desc, steer: c.steer || ''
      }))
    });
  }

  // Pokémon Trainer & Battle API
  if (url.pathname === '/pokemon/trainer' && req.method === 'GET') {
    return send(200, trainerState);
  }

  if (url.pathname === '/pokemon/encounter' && req.method === 'GET') {
    const wild = POKEMON_DB[Math.floor(Math.random() * POKEMON_DB.length)];
    return send(200, { ok: true, wild });
  }

  if (url.pathname === '/pokemon/catch' && req.method === 'POST') {
    return body().then((b) => {
      if (trainerState.inventory.pokeballs > 0) {
        trainerState.inventory.pokeballs--;
        if (b.pokemon) trainerState.party.push(b.pokemon);
        return send(200, { success: true, trainer: trainerState });
      }
      return send(200, { success: false, reason: 'No Pokeballs left!' });
    });
  }

  // Switch channel
  if (url.pathname === '/channel/switch' && req.method === 'POST') {
    return body().then((b) => {
      const targetId = b.id || b.channel;
      if (!targetId || !CHANNELS[targetId]) return send(404, { error: 'no such channel', requested: targetId });
      active = targetId;
      if (CHANNELS[active].agent && !CHANNELS[active]._timer) startAgentLoop(CHANNELS[active]);
      broadcast('channel', { active });
      return send(200, { active });
    });
  }

  // Create custom channel
  if (url.pathname === '/channel/create' && req.method === 'POST') {
    return body().then((b) => {
      const name = (b.name || 'New Channel').trim();
      const id = (b.id || name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'chan' + Date.now().toString(36));
      const type = b.type || 'custom';
      const desc = b.desc || 'Custom user-created channel.';
      const agent = b.agent || 'build';
      const verbs = Array.isArray(b.verbs) && b.verbs.length > 0 ? b.verbs : ['build', 'explore', 'create'];

      const dir = path.join(CHANNELS_DIR, id);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const manifest = {
        name, type, desc, agent, autostart: true, agentInterval: 5000,
        agentVerbs: verbs, agentLine: `${name} active`, steer: b.steer || `build ${name}`
      };

      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      manifest._id = id;
      manifest._dir = dir;
      manifest.world = defaultWorld(manifest);
      saveWorld(manifest);

      CHANNELS[id] = manifest;
      active = id;
      startAgentLoop(manifest);

      broadcast('channel', { active });
      console.log(`[helm] created new channel "${name}" (${id})`);
      return send(200, { ok: true, active, channel: stripRuntime(manifest) });
    });
  }

  // Active channel state
  if (url.pathname === '/channel/state' && req.method === 'GET') {
    const ch = CHANNELS[active];
    return send(200, { id: ch._id, name: ch.name, type: ch.type, desc: ch.desc, steer: ch.steer || '', world: ch.world, agent: ch.agent || 'idle' });
  }

  // User/Agent edit world
  if (url.pathname === '/world/edit' && req.method === 'POST') {
    return body().then((b) => {
      const ch = CHANNELS[active];
      const ent = {
        id: 'u' + Date.now().toString(36),
        kind: b.kind || 'user-build',
        text: b.text || 'User landmark',
        x: Math.max(0, Math.min((ch.world.meta.w || 40) - 1, b.x ?? 20)),
        z: Math.max(0, Math.min((ch.world.meta.h || 40) - 1, b.z ?? 20)),
        by: b.by || 'user',
        t: Date.now(),
      };
      ch.world.entities.push(ent);
      ch.world.log.push({ t: Date.now(), by: ent.by, action: ent.kind, ent });
      if (ch.world.entities.length > 100) ch.world.entities.shift();
      saveWorld(ch);
      broadcast('world', { channel: ch._id, world: ch.world });
      return send(200, { ok: true, ent });
    });
  }

  // Demolish / Delete entity by ID
  if (url.pathname === '/world/delete' && req.method === 'POST') {
    return body().then((b) => {
      const ch = CHANNELS[active];
      if (!b.id) return send(400, { error: 'missing entity id' });
      const idx = ch.world.entities.findIndex(e => e.id === b.id);
      if (idx !== -1) {
        const removed = ch.world.entities.splice(idx, 1)[0];
        ch.world.log.push({ t: Date.now(), by: b.by || 'user', action: 'demolish', ent: removed });
        saveWorld(ch);
        broadcast('world', { channel: ch._id, world: ch.world });
        return send(200, { ok: true, deleted: removed });
      }
      return send(404, { error: 'entity not found' });
    });
  }

  // Steer directive injection
  if (url.pathname === '/helm/steer' && req.method === 'POST') {
    return body().then((b) => {
      const ch = CHANNELS[active];
      if (typeof b.directive === 'string' && b.directive.trim()) {
        ch.steer = b.directive.trim();
      }
      if (Array.isArray(b.verbs)) ch.agentVerbs = b.verbs;
      if (typeof b.line === 'string') ch.agentLine = b.line;

      fs.writeFileSync(path.join(ch._dir, 'manifest.json'), JSON.stringify(stripRuntime(ch), null, 2));
      ch.world.log.push({ t: Date.now(), by: 'helm', steer: ch.steer });
      broadcast('steer', { channel: ch._id, directive: ch.steer });
      console.log(`[helm] ${ch._id} steer directive set to: "${ch.steer}"`);
      return send(200, { ok: true, active, steer: ch.steer });
    });
  }

  // Static files server
  const fileMap = {
    '/': 'index.html',
    '/crystal.js': 'crystal.js',
    '/helm.js': 'helm.js',
    '/crocotile.js': 'crocotile.js'
  };
  let f = url.pathname;
  if (fileMap[f]) f = '/' + fileMap[f];
  const fp = path.normalize(path.join(__dirname, f));

  if (!fp.startsWith(__dirname)) {
    return send(403, { error: 'forbidden' });
  }

  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp).toLowerCase();
    const ct = ext === '.js' ? 'text/javascript'
             : ext === '.html' ? 'text/html'
             : ext === '.png' ? 'image/png'
             : ext === '.json' || ext === '.crocotile' ? 'application/json'
             : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    return fs.createReadStream(fp).pipe(res);
  }

  send(404, { error: 'not found', path: url.pathname });
});

function stripRuntime(ch) {
  const { _id, _dir, _timer, world, ...rest } = ch;
  return rest;
}

// Boot server
Object.values(CHANNELS).forEach((c) => {
  if (c.agent && c.autostart) startAgentLoop(c);
});

server.listen(PORT, () => {
  console.log(`[helm] server listening on :${PORT}`);
  console.log(`[helm] channels loaded: ${Object.keys(CHANNELS).join(', ')} | active: ${active}`);
});
