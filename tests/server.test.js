// Smoke tests for The Helm server. Runs server.js as a real child process
// (rather than importing it) so its global state and setTimeout agent loops
// never leak into the test process.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 8199;
const BASE = `http://localhost:${PORT}`;

let child;
const createdChannelDirs = [];

async function waitForServer(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/channels`);
      if (res.ok) return;
    } catch {
      // not up yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start in time');
}

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  await waitForServer();
});

after(() => {
  if (child) child.kill();
  for (const dir of createdChannelDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /channels lists the known channels', async () => {
  const res = await fetch(`${BASE}/channels`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.active, 'has an active channel');
  const ids = body.channels.map((c) => c.id);
  for (const known of ['crystal', 'ghostline', 'aetherbooks', 'dispatches', 'chronosvault']) {
    assert.ok(ids.includes(known), `expected channel "${known}" to be listed`);
  }
});

test('GET /channel/state returns a well-formed world', async () => {
  const res = await fetch(`${BASE}/channel/state`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.world, 'has a world');
  assert.ok(Array.isArray(body.world.entities));
  assert.ok(Array.isArray(body.world.log));
});

test('GET / serves the app shell', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<!DOCTYPE html>/i);
});

test('GET on an unknown path returns 404', async () => {
  const res = await fetch(`${BASE}/does-not-exist`);
  assert.equal(res.status, 404);
});

test('channel lifecycle: create -> switch -> edit world -> delete entity', async () => {
  const id = 'qatest' + Date.now().toString(36);
  createdChannelDirs.push(path.join(ROOT, 'channels', id));

  const createRes = await fetch(`${BASE}/channel/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name: 'QA Test Channel', agent: 'idle' }),
  });
  assert.equal(createRes.status, 200);
  const created = await createRes.json();
  assert.equal(created.active, id);

  const listRes = await fetch(`${BASE}/channels`);
  const list = await listRes.json();
  assert.ok(list.channels.some((c) => c.id === id));

  const editRes = await fetch(`${BASE}/world/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'user-build', text: 'QA landmark', x: 5, z: 5, by: 'qa-suite' }),
  });
  assert.equal(editRes.status, 200);
  const edited = await editRes.json();
  assert.ok(edited.ok);
  assert.equal(edited.ent.text, 'QA landmark');

  const stateRes = await fetch(`${BASE}/channel/state`);
  const state = await stateRes.json();
  assert.ok(state.world.entities.some((e) => e.id === edited.ent.id));

  const deleteRes = await fetch(`${BASE}/world/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: edited.ent.id, by: 'qa-suite' }),
  });
  assert.equal(deleteRes.status, 200);

  const afterState = await (await fetch(`${BASE}/channel/state`)).json();
  assert.ok(!afterState.world.entities.some((e) => e.id === edited.ent.id));
});

test('POST /world/delete with unknown id returns 404', async () => {
  const res = await fetch(`${BASE}/world/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'nope', by: 'qa-suite' }),
  });
  assert.equal(res.status, 404);
});
