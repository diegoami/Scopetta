// The itch.io tooling's decisions, held without the network, butler or a real
// zip extractor. Tressette's (issue #95 there), ported onto this repository's
// source records. The ZIP cases exercise the hand-rolled encoder, which is the
// one piece that cannot be checked by reading source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseProject, channelAssets, channelTargets, stageName, itchStageFiles,
  releaseStageFiles, itchSource, recordProblems, tagRef, branchHead,
} from './itch_lib.mjs';
import { formatSource } from './source_tag.mjs';
import { crc32, buildZip } from './zip_lib.mjs';

const SHA = 'a'.repeat(40);
const TREE = 'f'.repeat(40);

// --- the project slug is explicit, never guessed ---

test('the itch project is an owner/slug, and nothing else', () => {
  assert.deepEqual(parseProject('diegoami/scopetta'),
    { owner: 'diegoami', slug: 'scopetta', target: 'diegoami/scopetta' });
  for (const bad of [undefined, '', 'tressette', 'diegoami/', '/tressette',
                     'a/b/c', 'a b/c', 'diegoami/../etc', 'http://x/y',
                     'diegoami/scopetta:html5'])
    assert.throws(() => parseProject(bad), /owner\/slug/, JSON.stringify(bad));
});

// --- the three channels map to one file each, and one --userversion ---

test('each butler channel carries exactly one named file', () => {
  assert.deepEqual(channelAssets('1.0.7'), {
    html5:   'Scopetta-1.0.7-itch-html5.zip',
    windows: 'Scopetta-1.0.7-windows-x64.exe',
    android: 'Scopetta-1.0.7-android.apk',
  });
  assert.deepEqual(channelTargets('diegoami/scopetta', '1.0.7'), [
    { channel: 'html5',   target: 'diegoami/scopetta:html5',
      file: 'Scopetta-1.0.7-itch-html5.zip',    userversion: '1.0.7' },
    { channel: 'windows', target: 'diegoami/scopetta:windows',
      file: 'Scopetta-1.0.7-windows-x64.exe',   userversion: '1.0.7' },
    { channel: 'android', target: 'diegoami/scopetta:android',
      file: 'Scopetta-1.0.7-android.apk',       userversion: '1.0.7' },
  ]);
  // The three filenames are distinct: a repeated ZIP is impossible.
  const files = Object.values(channelAssets('1.0.7'));
  assert.equal(new Set(files).size, 3);
});

test('a stage is vX.Y.Z for a release, candidate-<first seven> otherwise', () => {
  assert.equal(stageName({ kind: 'release', version: '1.0.7', commit: SHA }), 'v1.0.7');
  assert.equal(stageName({ kind: 'candidate', version: '1.0.7', commit: SHA }),
    'candidate-aaaaaaa');
  assert.match(stageName({ kind: 'candidate', version: '1.0.7', commit: SHA }), /^candidate-[0-9a-f]{7}$/);
});

test('the itch stage holds the zip; the release stage keeps its exact two', () => {
  assert.deepEqual(itchStageFiles('1.0.7'), ['Scopetta-1.0.7-itch-html5.zip']);
  assert.deepEqual(releaseStageFiles('1.0.7'),
    ['Scopetta-1.0.7-android.apk', 'Scopetta-1.0.7-windows-x64.exe']);
});

// --- where a build may be staged from ---

test('a build is a clean commit on main: the tag for a release, any for a candidate', () => {
  const base = { version: '1.0.7', head: SHA, tagCommit: SHA, tagType: 'tag', onMain: true,
                 dirty: [], candidate: false };
  assert.deepEqual(itchSource(base), { ok: true, kind: 'release', dir: 'v1.0.7' });
  assert.deepEqual(itchSource({ ...base, candidate: true, tagCommit: null, tagType: null }),
    { ok: true, kind: 'candidate', dir: 'candidate-aaaaaaa' });

  const refused = (over, why) => {
    const r = itchSource({ ...base, ...over });
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.match(r.reason, why);
  };
  refused({ dirty: ['modified   public/index.html'] }, /not exactly HEAD[\s\S]*public\/index\.html/);
  refused({ dirty: ['untracked  x'], candidate: true }, /not exactly HEAD/);
  refused({ onMain: false }, /not on origin\/main/);
  refused({ onMain: false, candidate: true }, /not on origin\/main/);
  refused({ tagCommit: null, tagType: null }, /v1\.0\.7 does not exist here.*--candidate/s);
  refused({ tagType: 'commit' }, /lightweight/);
  refused({ tagCommit: 'b'.repeat(40) }, /HEAD is not v1\.0\.7/);
});

// --- the source records tie each stage to the commit it was built from ---

test('the itch release, the GitHub release and the itch candidate name one source', () => {
  const src = { commit: SHA, tree: TREE };
  const ok = { source: src };
  assert.deepEqual(recordProblems({ version: '1.0.7', itch: ok, release: ok, candidate: ok }), []);

  const other = { commit: 'b'.repeat(40), tree: TREE };
  assert.match(recordProblems({ version: '1.0.7', itch: { source: other }, release: ok, candidate: ok }).join('\n'),
    /dist-itch\/v1\.0\.7\.source is commit bbbb.*dist-release\/v1\.0\.7\.source is aaaa/s);
  assert.match(recordProblems({ version: '1.0.7', itch: ok, release: ok,
    candidate: { source: { commit: SHA, tree: 'e'.repeat(40) } } }).join('\n'),
    /dist-itch\/candidate-aaaaaaa\.source is tree eeee/);
  // Missing or malformed records are reported as they were read, never skipped.
  assert.deepEqual(recordProblems({ version: '1.0.7', itch: { problem: 'itch gone' }, release: ok,
    candidate: { problem: 'candidate gone' } }), ['itch gone', 'candidate gone']);
  assert.deepEqual(recordProblems({ version: '1.0.7', itch: ok, release: { problem: 'release gone' },
    candidate: null }), ['release gone']);
});

// --- the live remote refs: annotated tag, on main, at the packaged commit ---

test('the annotated tag and its commit are read from ls-remote, exactly', () => {
  const annotated = `1111\trefs/tags/v1.0.7\n2222\trefs/tags/v1.0.7^{}\n`;
  assert.deepEqual(tagRef(annotated, 'v1.0.7'), { commit: '2222', annotated: true });
  const light = `3333\trefs/tags/v1.0.7\n`;
  assert.deepEqual(tagRef(light, 'v1.0.7'), { commit: '3333', annotated: false });
  assert.equal(tagRef(light, 'v1.0.70'), null, 'a prefix is not the tag');
  assert.equal(tagRef(`4444\trefs/tags/some/v1.0.7\n`, 'v1.0.7'), null);
  assert.equal(tagRef('', 'v1.0.7'), null);

  const refs = `aaaa\trefs/heads/main\nbbbb\trefs/heads/main-old\n`;
  assert.equal(branchHead(refs, 'main'), 'aaaa');
  assert.equal(branchHead(refs, 'main-old'), 'bbbb');
  assert.equal(branchHead(refs, 'ma'), null);
});

// --- the hand-rolled zip encoder ---

test('crc32 is the reflected IEEE polynomial', () => {
  assert.equal(crc32(Buffer.from('')), 0);
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('buildZip writes a readable, deterministic archive', () => {
  const entries = [
    { name: 'index.html', data: Buffer.from('<h1>hi</h1>'.repeat(50)) },
    { name: 'engine.js', data: Buffer.from('console.log(1)') },
    { name: 'decks/x.png', data: Buffer.alloc(1000, 7) },
  ];
  const zip = buildZip(entries);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'starts with a local file header');
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50, 'ends with the EOCD');
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), entries.length, 'counts the entries');

  // Same bytes whatever the input order: the encoder sorts.
  assert.ok(buildZip([...entries].reverse()).equals(zip));

  // The first local header names the first sorted entry, and its payload is
  // the raw DEFLATE of the source.
  const nameLen = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + nameLen).toString('utf8'), 'decks/x.png');
  const method = zip.readUInt16LE(8);
  const compSize = zip.readUInt32LE(18);
  const payload = zip.subarray(30 + nameLen, 30 + nameLen + compSize);
  const data = method === 0x08 ? inflateRawSync(payload) : payload;
  assert.deepEqual(data, entries[2].data);
});

// --- the publisher refuses, dry run included, before anything is uploaded ---
// The real script, run against a temp checkout. The refusal cases below fail
// before butler is ever consulted, so they run on every platform; the dry-run
// case needs a butler shim and a git origin, so it is POSIX-only, as
// release.test.mjs's gh shim is.

const REPO_FILES = ['publish_itch.mjs', 'package_itch.mjs', 'itch_lib.mjs', 'release_lib.mjs',
                    'source_tag.mjs', 'zip_lib.mjs'];

function publishCheckout(version = '1.0.7'){
  const tmp = mkdtempSync(path.join(tmpdir(), 'scopetta-itch-'));
  mkdirSync(path.join(tmp, 'tools'));
  for (const f of REPO_FILES)
    copyFileSync(new URL(`./${f}`, import.meta.url), path.join(tmp, 'tools', f));
  mkdirSync(path.join(tmp, 'mobile', 'android', 'app'), { recursive: true });
  writeFileSync(path.join(tmp, 'mobile', 'android', 'app', 'build.gradle'),
    `android {\n  defaultConfig {\n    versionCode 8\n    versionName "${version}"\n  }\n}\n`);
  return tmp;
}

function stage(dir, names, source){
  mkdirSync(dir, { recursive: true });
  const rows = names.map((name) => {
    const data = `not really ${name}`;
    writeFileSync(path.join(dir, name), data);
    return `${createHash('sha256').update(data).digest('hex')}  ${name}`;
  });
  writeFileSync(path.join(dir, 'SHA256SUMS.txt'), rows.join('\n') + '\n');
  writeFileSync(`${dir}.source`, formatSource(source));
}

const runPublish = (tmp, ...args) => spawnSync(process.execPath,
  [path.join(tmp, 'tools', 'publish_itch.mjs'), ...args], { encoding: 'utf8' });

test('publish_itch refuses without --project', () => {
  const tmp = publishCheckout();
  const res = runPublish(tmp);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /--project owner\/slug is required/);
});

test('publish_itch refuses a missing current stage', () => {
  const tmp = publishCheckout();
  const res = runPublish(tmp, '--project', 'diegoami/scopetta');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /dist-itch\/v1\.0\.7\/ is missing/);
});

test('publish_itch refuses a missing candidate record', () => {
  const tmp = publishCheckout();
  const source = { commit: SHA, tree: TREE };
  stage(path.join(tmp, 'dist-itch', 'v1.0.7'), itchStageFiles('1.0.7'), source);
  stage(path.join(tmp, 'dist-release', 'v1.0.7'), releaseStageFiles('1.0.7'), source);
  const res = runPublish(tmp, '--project', 'diegoami/scopetta');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /dist-itch\/candidate-aaaaaaa\.source is missing/);
});

test('publish_itch refuses a mixed commit between the two release records', () => {
  const tmp = publishCheckout();
  stage(path.join(tmp, 'dist-itch', 'v1.0.7'), itchStageFiles('1.0.7'), { commit: SHA, tree: TREE });
  stage(path.join(tmp, 'dist-release', 'v1.0.7'), releaseStageFiles('1.0.7'),
    { commit: 'b'.repeat(40), tree: TREE });
  const res = runPublish(tmp, '--project', 'diegoami/scopetta');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /dist-itch\/v1\.0\.7\.source is commit aaaa/);
});

test('publish_itch refuses a stray file in the itch stage', () => {
  const tmp = publishCheckout();
  const source = { commit: SHA, tree: TREE };
  stage(path.join(tmp, 'dist-itch', 'v1.0.7'), itchStageFiles('1.0.7'), source);
  stage(path.join(tmp, 'dist-release', 'v1.0.7'), releaseStageFiles('1.0.7'), source);
  writeFileSync(path.join(tmp, 'dist-itch', 'candidate-aaaaaaa.source'), formatSource(source));
  writeFileSync(path.join(tmp, 'dist-itch', 'v1.0.7', 'Scopetta-1.0.6-itch-html5.zip'), 'stale');
  const res = runPublish(tmp, '--project', 'diegoami/scopetta');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Scopetta-1\.0\.6-itch-html5\.zip is staged but not in SHA256SUMS\.txt/);
});

test('publish_itch dry-runs the three channels and uploads nothing',
  { skip: process.platform === 'win32' ? 'the butler shim here is a POSIX script' : false },
  () => {
    const tmp = publishCheckout();
    const git = (cwd, ...args) => {
      const r = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
        { cwd, encoding: 'utf8' });
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    };
    const origin = mkdtempSync(path.join(tmpdir(), 'scopetta-itch-origin-'));
    git(origin, 'init', '-q', '--bare');
    git(tmp, 'init', '-q', '-b', 'main');
    git(tmp, 'add', '-A');
    git(tmp, 'commit', '-q', '-m', 'the release');
    git(tmp, 'tag', '-a', 'v1.0.7', '-m', 'Scopetta 1.0.7');
    git(tmp, 'remote', 'add', 'origin', origin);
    git(tmp, 'push', '-q', 'origin', 'main', 'v1.0.7');
    git(tmp, 'fetch', '-q', 'origin');
    const rev = (r) => spawnSync('git', ['rev-parse', r], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    const source = { commit: rev('HEAD'), tree: rev('HEAD^{tree}') };

    stage(path.join(tmp, 'dist-itch', 'v1.0.7'), itchStageFiles('1.0.7'), source);
    stage(path.join(tmp, 'dist-release', 'v1.0.7'), releaseStageFiles('1.0.7'), source);
    writeFileSync(path.join(tmp, 'dist-itch', `candidate-${source.commit.slice(0, 7)}.source`),
      formatSource(source));

    // A butler that answers --version and records a push if it is ever reached.
    const bin = path.join(tmp, 'bin');
    mkdirSync(bin);
    const marker = path.join(tmp, 'pushed');
    writeFileSync(path.join(bin, 'butler'),
      '#!/bin/sh\n' +
      'if [ "$1" = "--version" ]; then echo "butler 15.0.0"; exit 0; fi\n' +
      'if [ "$1" = "push" ]; then echo "$@" >> ' + JSON.stringify(marker) + '; exit 0; fi\n' +
      'exit 0\n');
    chmodSync(path.join(bin, 'butler'), 0o755);

    const res = spawnSync(process.execPath, [path.join(tmp, 'tools', 'publish_itch.mjs'),
      '--project', 'diegoami/scopetta'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
    });
    assert.equal(res.status, 0, res.stderr);
    for (const channel of ['html5', 'windows', 'android'])
      assert.match(res.stdout, new RegExp(`diegoami/scopetta:${channel}`), channel);
    assert.match(res.stdout, /Dry run/);
    assert.equal(existsSync(marker), false, 'a dry run must not push');
  });

// --- the packager, end to end, on a temp checkout with an origin ---
// POSIX-only for the same reason: it needs git and a system unzip, which is the
// extractor that did not write the archive.

test('package_itch stages a candidate, then the release from the tag, each with its record',
  { skip: process.platform === 'win32' ? 'needs a POSIX unzip' : false },
  () => {
    const tmp = publishCheckout();
    const git = (...args) => {
      const r = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
        { cwd: tmp, encoding: 'utf8' });
      assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout.trim();
    };
    mkdirSync(path.join(tmp, 'public', 'decks'), { recursive: true });
    writeFileSync(path.join(tmp, 'public', 'index.html'), '<!doctype html><title>Scopetta</title>'.repeat(20));
    writeFileSync(path.join(tmp, 'public', 'engine.js'), 'export {};\n');
    writeFileSync(path.join(tmp, 'public', 'decks', 'x.png'), Buffer.alloc(300, 9));
    writeFileSync(path.join(tmp, '.gitignore'), 'dist-itch\n');
    const origin = mkdtempSync(path.join(tmpdir(), 'scopetta-itch-origin-'));
    spawnSync('git', ['init', '-q', '--bare', origin]);
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'the candidate');
    git('remote', 'add', 'origin', origin);
    git('push', '-q', 'origin', 'main');
    git('fetch', '-q', 'origin');
    const source = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
    const run = (...args) => spawnSync(process.execPath,
      [path.join(tmp, 'tools', 'package_itch.mjs'), ...args], { cwd: tmp, encoding: 'utf8' });

    // No tag yet: the release build is refused, the candidate dry run writes nothing.
    assert.match(run('--confirm').stderr, /v1\.0\.7 does not exist here/);
    const dry = run('--candidate');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Dry run/);
    assert.equal(existsSync(path.join(tmp, 'dist-itch')), false, 'a dry run must write nothing');

    const cand = run('--candidate', '--confirm');
    assert.equal(cand.status, 0, cand.stderr);
    const stageDir = path.join(tmp, 'dist-itch', `candidate-${source.commit.slice(0, 7)}`);
    const zip = path.join(stageDir, 'Scopetta-1.0.7-itch-html5.zip');
    assert.equal(readFileSync(`${stageDir}.source`, 'utf8'), formatSource(source));
    const sum = createHash('sha256').update(readFileSync(zip)).digest('hex');
    assert.equal(readFileSync(path.join(stageDir, 'SHA256SUMS.txt'), 'utf8'),
      `${sum}  Scopetta-1.0.7-itch-html5.zip\n`);
    // An extractor that is not ours reads it back as exactly public/.
    const site = mkdtempSync(path.join(tmpdir(), 'scopetta-itch-site-'));
    const ex = spawnSync('unzip', ['-q', zip, '-d', site], { encoding: 'utf8' });
    assert.equal(ex.status, 0, ex.stderr);
    for (const f of ['index.html', 'engine.js', 'decks/x.png'])
      assert.ok(readFileSync(path.join(site, f)).equals(readFileSync(path.join(tmp, 'public', f))), f);

    // A tree that is not exactly HEAD is refused, and nothing is recorded.
    writeFileSync(path.join(tmp, 'public', 'engine.js'), 'export const edited = 1;\n');
    const dirty = run('--candidate', '--confirm');
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /modified\s+public\/engine\.js/);
    git('checkout', '--', 'public/engine.js');

    // A lightweight tag is not a release; the annotated one on HEAD is.
    git('tag', 'v1.0.7');
    assert.match(run('--confirm').stderr, /lightweight/);
    git('tag', '-d', 'v1.0.7');
    git('tag', '-a', 'v1.0.7', '-m', 'Scopetta 1.0.7');
    const rel = run('--confirm');
    assert.equal(rel.status, 0, rel.stderr);
    assert.equal(readFileSync(path.join(tmp, 'dist-itch', 'v1.0.7.source'), 'utf8'), formatSource(source));
    // The same source writes the same bytes: the encoder is deterministic.
    assert.ok(readFileSync(path.join(tmp, 'dist-itch', 'v1.0.7', 'Scopetta-1.0.7-itch-html5.zip'))
      .equals(readFileSync(zip)));
  });
