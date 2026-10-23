#!/usr/bin/env node
/**
 * Build the itch.io HTML5 artifact: a zip of public/ with index.html at its
 * root, staged under dist-itch/ and never in dist-release/.
 *
 *   node tools/package_itch.mjs --candidate            # dry run, the untagged candidate
 *   node tools/package_itch.mjs --candidate --confirm  # write it
 *   node tools/package_itch.mjs --confirm              # from a checkout of the tag vX.Y.Z
 *
 * Dry run by default: it walks public/, prints the plan and writes nothing.
 * --confirm writes the zip, its SHA256SUMS.txt and, only after the staging has
 * verified and the tree has been asked again, a source record beside it
 * (`dist-itch/<stage>.source`, tools/source_tag.mjs's format, the one
 * package_release.mjs writes for dist-release/). `publish_itch.mjs` reads it,
 * so a ZIP can never be published for a commit other than the one it was built
 * from.
 *
 * The stage is `vX.Y.Z` when HEAD is that annotated tag, and
 * `candidate-<first seven of the commit>` with --candidate. Either way HEAD is
 * on origin/main and the working tree is exactly HEAD. The itch ZIP is a third
 * asset for a second storefront; keeping it out of dist-release/ is what
 * preserves the GitHub release's exact two-asset contract
 * (release_lib.releaseAssets).
 *
 * The version comes from mobile/android/app/build.gradle's versionName, the
 * one source tools/package_release.mjs also reads; the cross-check that every
 * other declaration agrees is that script's job and tools/release.test.mjs's,
 * not duplicated here. Unlike that script this one runs anywhere: it needs no
 * toolchain, only node and git.
 *
 * Node standard library only. The zip encoder is tools/zip_lib.mjs. Tressette's
 * packager, ported (ITCH.md).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksumProblems } from './release_lib.mjs';
import { formatSource, treeProblems } from './source_tag.mjs';
import { buildZip } from './zip_lib.mjs';
import { itchSource, itchStageFiles } from './itch_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const fail = (msg) => { console.error(`\npackage_itch: ${msg}`); process.exit(1); };
const CONFIRM = process.argv.includes('--confirm');
const CANDIDATE = process.argv.includes('--candidate');

// --- the version, and where the build may be staged ---
const gradlePath = path.join(ROOT, 'mobile/android/app/build.gradle');
if (!existsSync(gradlePath)) fail('mobile/android/app/build.gradle is missing — cannot read versionName.');
const version = /versionName\s+["']([^"']+)["']/.exec(readFileSync(gradlePath, 'utf8'))?.[1];
if (!version) fail('could not read versionName from mobile/android/app/build.gradle');
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`versionName is not X.Y.Z: ${JSON.stringify(version)}`);
const tag = `v${version}`;

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const out = (...args) => { const r = git(...args); return r.status === 0 ? r.stdout.trim() : null; };
const head = out('rev-parse', 'HEAD');
if (!head) fail('this is not a git checkout.');
const treeOf = () => out('rev-parse', 'HEAD^{tree}');
const tree = treeOf();
let dirty;
try { dirty = treeProblems(ROOT); } catch (e) { fail(e.message); }
const source = itchSource({
  version, head, dirty, candidate: CANDIDATE,
  tagCommit: out('rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`),
  tagType: out('cat-file', '-t', `refs/tags/${tag}`),
  onMain: git('merge-base', '--is-ancestor', head, 'origin/main').status === 0,
});
if (!source.ok) fail(source.reason);
// A failed rev-parse fails here, not after the zip is written.
try { formatSource({ commit: head, tree }); } catch (e) { fail(`could not read HEAD: ${e.message}`); }

// --- walk public/, relative, forward slashes, index.html at the root ---
if (!existsSync(PUBLIC)) fail('public/ is missing — the game source is gone.');
if (!existsSync(path.join(PUBLIC, 'index.html')))
  fail('public/index.html is missing — itch.io needs index.html at the zip root.');
function* walk(dir, prefix = ''){
  for (const name of readdirSync(dir)){
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) yield* walk(abs, rel);
    else yield { name: rel, data: readFileSync(abs), size: statSync(abs).size };
  }
}
const entries = [...walk(PUBLIC)].sort((a, b) => a.name.localeCompare(b.name));
if (!entries.length) fail('public/ is empty — nothing to package.');

const [zipName] = itchStageFiles(version);
const outDir = path.join(ROOT, 'dist-itch', source.dir);
const zipPath = path.join(outDir, zipName);
const sumsPath = path.join(outDir, 'SHA256SUMS.txt');
const sourcePath = path.join(ROOT, 'dist-itch', `${source.dir}.source`);

console.log(`\nitch.io build for Scopetta ${tag} (${source.kind}, commit ${head})`);
console.log(`  source:    public/ (${entries.length} files)`);
console.log(`  output:    dist-itch/${source.dir}/${zipName}`);
console.log(`  record:    dist-itch/${source.dir}.source`);
for (const e of entries) console.log(`    ${e.name}  (${e.size} bytes)`);

if (!CONFIRM) {
  console.log('\nDry run. Re-run with --confirm to write.');
  process.exit(0);
}

// --- stage: replace any earlier directory and record, then verify ---
// The record goes first, so a failed rerun cannot leave the last build's
// record beside a staging it does not describe.
rmSync(sourcePath, { force: true });
rmSync(outDir, { recursive: true, force: true });
const zipBuf = buildZip(entries);
const zipHash = createHash('sha256').update(zipBuf).digest('hex');
mkdirSync(outDir, { recursive: true });
writeFileSync(zipPath, zipBuf);
writeFileSync(sumsPath, `${zipHash}  ${zipName}\n`);
const hashOf = (name) => {
  const p = path.join(outDir, name);
  return existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;
};
const problems = checksumProblems(readFileSync(sumsPath, 'utf8'), hashOf,
  { expected: itchStageFiles(version), present: readdirSync(outDir) });
if (problems.length) fail(`what was staged does not verify: ${problems.join('; ')}`);

// The tree is asked again before it is recorded, as package_release.mjs does:
// an edit made while the zip was being read would otherwise be recorded as
// what was built.
let after;
try { after = treeProblems(ROOT); } catch (e) { fail(e.message); }
if (after.length || out('rev-parse', 'HEAD') !== head || treeOf() !== tree)
  fail('the working tree changed while the zip was being built. Nothing was recorded; package again.');
// Last, so a record exists only beside a staging that verified.
writeFileSync(sourcePath, formatSource({ commit: head, tree }));

console.log(`\ndone.`);
console.log(`  dist-itch/${source.dir}/${zipName}`);
console.log(`  ${zipHash}  ${zipName}`);
console.log(`  source ${head} (tree ${tree})`);
console.log(source.kind === 'release'
  ? `\nnext: node tools/smoke_itch_zip.mjs   (then publish_itch.mjs)`
  : `\nnext: node tools/smoke_itch_zip.mjs dist-itch/${source.dir}/${zipName}, then the ` +
    `real-phone check on that zip; tag that exact commit ${tag}, check it out, and package again.`);
