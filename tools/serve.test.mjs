// The dev server's own behaviour, which the engine tests cannot see.
//
//   node --test tools/serve.test.mjs
//
// One thing is asserted, and it is a defect the review of the dev-server change
// found: a request whose path is a malformed percent-escape (`/%`) made
// `decodeURIComponent` throw inside the async handler, and an async handler
// that rejects takes the whole process with it — the client saw ECONNRESET and
// the server was gone. A local server that one stray request can kill is the
// opposite of what it is for, so the parse is caught, the answer is 400, and
// this test is what keeps both true.
//
// No dependencies: it spawns the real script and speaks HTTP to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';

const SERVE = fileURLToPath(new URL('./serve.mjs', import.meta.url));
// A fixed high port, not 0: the script logs the port it was given rather than
// the one the OS picked, so 0 would leave the test unable to find it.
const PORT = 18099;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVE, String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const done = () => reject(new Error(`serve.mjs did not start:\n${out}`));
    const timer = setTimeout(done, 5000);
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('Scopetta on http')) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`serve.mjs exited ${code}:\n${out}`)); });
  });
}

function request(path) {
  return new Promise((resolve, reject) => {
    const req = get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

test('a malformed escape is a 400, and the server serves on', async (t) => {
  const child = await startServer();
  t.after(() => child.kill());

  const ok = await request('/');
  assert.equal(ok.status, 200, 'the page is served');

  const bad = await request('/%;');
  assert.equal(bad.status, 400, 'a malformed percent-escape is the client\'s fault');

  // And the server is still there. Before the fix this request never came back
  // — the process had already exited — so the pair is the whole assertion.
  const after = await request('/');
  assert.equal(after.status, 200, 'the server survived the bad request');
});
