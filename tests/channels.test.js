// Validates the on-disk channel data that server.js loads at boot.
// Catches malformed manifest.json / world.json before they cause a
// silent [server] error loading channel manifest at runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANNELS_DIR = path.join(__dirname, '..', 'channels');

const REQUIRED_MANIFEST_FIELDS = ['name', 'type', 'desc'];
// server.js falls back to defaults (`ch.world.meta.w || 40`, etc.) when these
// are missing, so older world.json files without them are tolerated, not broken.
const RECOMMENDED_WORLD_META_FIELDS = ['w', 'h', 'theme'];

for (const id of readdirSync(CHANNELS_DIR)) {
  const dir = path.join(CHANNELS_DIR, id);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) continue;

  test(`channel "${id}" has a valid manifest.json`, () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      assert.ok(field in manifest, `manifest.json missing "${field}"`);
    }
    if (manifest.agent && manifest.agent !== 'idle') {
      assert.ok(Array.isArray(manifest.agentVerbs), 'agent channels need agentVerbs');
    }
  });

  const worldPath = path.join(dir, 'world.json');
  if (!existsSync(worldPath)) continue;

  test(`channel "${id}" has a valid world.json`, (t) => {
    const world = JSON.parse(readFileSync(worldPath, 'utf8'));
    assert.ok(world.meta, 'world.json missing meta');
    for (const field of RECOMMENDED_WORLD_META_FIELDS) {
      if (!(field in world.meta)) {
        t.diagnostic(`world.meta missing recommended field "${field}" (server.js will default it)`);
      }
    }
    assert.ok(Array.isArray(world.tiles));
    assert.ok(Array.isArray(world.entities));
    assert.ok(Array.isArray(world.log));
  });
}
