#!/usr/bin/env node
/**
 * Build a release, the signed Android APK and the Windows desktop executable,
 * and stage both for publishing.
 *
 *   node tools/package_release.mjs
 *
 * Steps, in order, stopping at the first failure:
 *   1. every version declaration agrees with Android's versionName
 *   1b. the working tree is exactly HEAD (tools/source_tag.mjs), and HEAD's
 *      commit and tree are what this build will be recorded as; any earlier
 *      staging of this version is removed before anything builds
 *   1c. versionCode is higher than the previous milestone tag's
 *   2. npm ci (mobile), then cap sync android — the Capacitor runtime from
 *      mobile/package-lock.json at this commit, then public/ into the project
 *   3. gradlew assembleRelease
 *   4. refuse an unsigned APK (a silently unsigned build is worse than none)
 *   5. apksigner verify    — the signature must actually check out, on our key
 *   6. desktop: npm ci, then tauri build --no-bundle
 *   7. refuse an implausible executable (missing, truncated, not PE)
 *   8. tools/smoke_desktop.mjs against that executable
 *   9. stage dist-release/vX.Y.Z/ with both assets and SHA256SUMS.txt, then
 *      read back and verify what was staged; ask the tree again, and only if
 *      it is still exactly the HEAD of step 1b, record the source beside it in
 *      dist-release/vX.Y.Z.source, which publish_release.mjs checks the tag against
 *
 * The version comes from mobile/android/app/build.gradle's versionName, and
 * step 1 holds the desktop wrapper's declarations to it. Both targets stage
 * together, so a half-built release cannot be published, and a rerun replaces
 * the directory rather than merging into it.
 *
 * Needs a JDK 21 (JAVA_HOME, or one found in the usual places — 25 fails with
 * "Unsupported class file major version 69"), and ANDROID_HOME or the SDK in
 * the default place. Windows only, because the desktop build is. Node standard
 * library only: it shells out to the Android toolchain, npm and cargo, which is
 * the tooling a packaging step is allowed to need, and to the smoke, which
 * needs the repository's dev dependency. The steps and the release-lib
 * functions are Tressette's (DESKTOP.md), ported into these scripts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_CERT, JDK_MAJOR, newestBuildTools, signatureVerdict, pickJdk,
  releaseAssets, versionDeclarations, versionDisagreements, exeProblem,
  parseVersionCode, previousMilestone, versionCodeProblem,
} from './release_lib.mjs';
import { formatSource, treeProblems } from './source_tag.mjs';
import { stageAssets } from './stage_assets.mjs';

const WIN = process.platform === 'win32';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = path.join(ROOT, 'mobile');
const ANDROID = path.join(MOBILE, 'android');
const DESKTOP = path.join(ROOT, 'desktop');

const fail = (msg) => { console.error(`\npackage_release: ${msg}`); process.exit(1); };

if (!WIN) fail('the desktop build is Windows-only, so a release is packaged on Windows.');

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
if (!existsSync(sdk)) fail(`Android SDK not found (looked in ${sdk}). Set ANDROID_HOME.`);

// Gradle needs JDK 21, found through JAVA_HOME. A JAVA_HOME that is set is
// taken as meant. Without one, the usual places a JDK lands on this machine are
// searched for a 21: the JDKs IntelliJ and Android Studio download, and the one
// Android Studio bundles, which is newer than Gradle 8.14 accepts today.
function jdkCandidates(){
  const home = os.homedir(), pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const dirs = [];
  for (const root of [path.join(home, '.jdks'), path.join(pf, 'Java'), path.join(pf, 'Eclipse Adoptium')])
    if (existsSync(root)) for (const d of readdirSync(root).sort().reverse()) dirs.push(path.join(root, d));
  dirs.push(path.join(pf, 'Android', 'Android Studio', 'jbr'));
  return dirs.map((d) => [d, existsSync(path.join(d, 'release')) ? readFileSync(path.join(d, 'release'), 'utf8') : null]);
}
const javaHome = process.env.JAVA_HOME || pickJdk(jdkCandidates());
if (!javaHome) fail(`no JDK ${JDK_MAJOR} found: set JAVA_HOME to one (ANDROID.md §2).`);
if (!process.env.JAVA_HOME) console.log(`JAVA_HOME not set; using ${javaHome}`);
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: javaHome };

// Node 24 refuses to spawn a .cmd/.bat without shell:true (a Windows security
// change), and returns status null rather than an error. So every external
// command goes through the shell, and its arguments are quoted here because the
// shell would otherwise split them on spaces — the SDK and JDK can sit under
// "Program Files".
const quote = (a) => (/[\s&()[\]{}^=;!'+,`~]/.test(a) ? `"${a}"` : a);
function run(cmd, args, opts = {}) {
  return spawnSync([cmd, ...args].map(quote).join(' '), { shell: true, env, ...opts });
}

function step(label, cmd, args, opts = {}) {
  console.log(`\n> ${label}`);
  const res = run(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) fail(`${label} failed (exit ${res.status ?? res.signal}).`);
}

// --- 1: one version, declared the same everywhere, before anything builds ---
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const declarations = versionDeclarations({
  gradle: read('mobile/android/app/build.gradle'),
  tauriConf: read('desktop/src-tauri/tauri.conf.json'),
  cargoToml: read('desktop/src-tauri/Cargo.toml'),
  packageJson: read('desktop/package.json'),
  packageLock: read('desktop/package-lock.json'),
  cargoLock: read('desktop/src-tauri/Cargo.lock'),
});
const version = declarations['mobile/android/app/build.gradle versionName'];
if (!version) fail('could not read versionName from mobile/android/app/build.gradle');
const disagree = versionDisagreements(version, declarations);
if (disagree.length)
  fail(`the version declarations disagree with Android's ${version}:\n  ` +
       disagree.join('\n  ') + '\n\nBump every one and refresh both lockfiles (DESKTOP.md).');
const tag = `v${version}`;
console.log(`packaging Scopetta ${tag}`);

// --- 1b: build only committed source, and remember which ---
// A release is the tagged commit (CLAUDE.md, "Each milestone"), so a build that
// no commit contains cannot be published. Untracked files count, and ignored
// ones under public/, which the build bundles; treeProblems says why it avoids
// git status, which cap sync's LF rewrites fool on a CRLF checkout.
let dirty;
try { dirty = treeProblems(ROOT); } catch (e) { fail(e.message); }
if (dirty.length)
  fail('the working tree is not exactly HEAD, so this build would match no commit:\n' +
       dirty.map((p) => `  ${p}`).join('\n') +
       '\n\nCommit, stash or remove them, then package again.');
const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const source = {
  commit: git(['rev-parse', 'HEAD']).stdout.trim(),
  tree: git(['rev-parse', 'HEAD^{tree}']).stdout.trim(),
};
// A failed rev-parse fails here, not after a long build.
try { formatSource(source); } catch (e) { fail(`could not read HEAD: ${e.message}`); }
console.log(`source ${source.commit}`);

// --- 1c: versionCode goes up from the previous milestone ---
// Android refuses an update whose versionCode is not higher than the installed
// one (issue #69). The previous milestone is the newest vX.Y.Z tag merged into
// HEAD that is below this version; its build.gradle is read from the tag.
const versionCode = parseVersionCode(read('mobile/android/app/build.gradle'));
const tagsHere = git(['tag', '--merged', 'HEAD', '--list', 'v*']).stdout.split('\n').map((s) => s.trim()).filter(Boolean);
const prevTag = previousMilestone(tagsHere, version);
const previous = prevTag
  ? { tag: prevTag, versionCode: parseVersionCode(git(['show', `${prevTag}:mobile/android/app/build.gradle`]).stdout) }
  : null;
const codeProblem = versionCodeProblem({ versionCode, previous });
if (codeProblem) fail(codeProblem);
console.log(previous
  ? `versionCode ${versionCode}, above ${previous.tag}'s ${previous.versionCode}`
  : `versionCode ${versionCode}; no milestone tag below ${tag} here, so there is nothing to compare it with`);

// Any earlier staging of this version goes now, before a long build that can
// fail: a failed rerun must not leave the last build staged for publishing.
const outDir = path.join(ROOT, 'dist-release', tag);
const sourceFile = path.join(ROOT, 'dist-release', `${tag}.source`);
rmSync(outDir, { recursive: true, force: true });
rmSync(sourceFile, { force: true });

// --- a signing key must be configured, or the whole exercise is pointless ---
if (!existsSync(path.join(ANDROID, 'keystore.properties')))
  fail('mobile/android/keystore.properties is missing — no signing key configured. ' +
       'Copy keystore.properties.example and fill it in (see ANDROID.md §3).');

// --- 2 & 3: sync the web assets, then build ---
const apkDir = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release');
rmSync(apkDir, { recursive: true, force: true }); // never mistake a stale APK for this one
// The Capacitor runtime and plugins the APK is built with live in
// mobile/node_modules, which git ignores, so without this the tagged commit does
// not determine the APK: it would be built from whatever was installed last
// (issue #68). The desktop build does the same in desktop/ at step 6.
step('npm ci (mobile)', 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: MOBILE });
step('cap sync android', 'npx', ['cap', 'sync', 'android'], { cwd: MOBILE });
step('gradlew assembleRelease', path.join(ANDROID, 'gradlew.bat'),
     ['assembleRelease', '--console=plain'], { cwd: ANDROID });

// --- 4: refuse an unsigned APK ---
if (existsSync(path.join(apkDir, 'app-release-unsigned.apk')))
  fail('Gradle produced app-release-unsigned.apk — keystore.properties is not being applied.');
const apk = path.join(apkDir, 'app-release.apk');
if (!existsSync(apk)) fail(`expected ${path.relative(ROOT, apk)}, but it is not there.`);

// --- 5: the signature must verify, on our key, or nothing is staged ---
function findApksigner(){
  const buildTools = path.join(sdk, 'build-tools');
  if (!existsSync(buildTools)) return null;
  const ver = newestBuildTools(readdirSync(buildTools));
  if (!ver) return null;
  const apksigner = path.join(buildTools, ver, 'apksigner.bat');
  return existsSync(apksigner) ? apksigner : null;
}

const apksigner = findApksigner();
let verify = null;
if (apksigner) {
  console.log('\n> apksigner verify');
  verify = run(apksigner, ['verify', '--print-certs', apk], { encoding: 'utf8' });
  process.stdout.write(verify.stdout ?? '');
  if (verify.stderr) process.stderr.write(verify.stderr);
}
const verdict = signatureVerdict({ verify });
if (!verdict.ok) fail(verdict.reason);
const signer = verdict.signer;

// --- 6: the desktop executable, from the wrapper's pinned CLI ---
step('npm ci (desktop)', 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: DESKTOP });
step('tauri build --no-bundle', 'npm', ['run', 'build'], { cwd: DESKTOP });

// --- 7: refuse an implausible executable ---
const exe = path.join(DESKTOP, 'src-tauri', 'target', 'release', 'scopetta.exe');
const problem = exeProblem(existsSync(exe) ? readFileSync(exe) : null);
if (problem) fail(`${problem} (${path.relative(ROOT, exe)}).`);

// --- 8: the built app has to play a deal and keep it across a restart ---
// What check_ui cannot see, because only the wrapper can break it (DESKTOP.md).
step('smoke the desktop app', process.execPath, [path.join(ROOT, 'tools', 'smoke_desktop.mjs'), exe]);

// --- 9: stage both, then read it back, then record the source ---
// (any earlier directory was removed at step 1b)
mkdirSync(outDir, { recursive: true });
// The manifest comes from the built files and the check from the staged
// copies, so a copy that went wrong fails here (stage_assets.mjs, issue #70).
const [apkName, exeName] = releaseAssets(version);
const { sums, problems } = stageAssets(outDir, [[apkName, apk], [exeName, exe]]);
if (problems.length) fail(`what was staged does not verify: ${problems.join('; ')}`);
// The build takes minutes, so the tree is asked again before it is recorded:
// a commit, checkout or edit made meanwhile would otherwise be recorded as
// what was built. The staging stays, and the publisher refuses it without a
// record (the review of #66).
let after;
try { after = treeProblems(ROOT); } catch (e) { fail(e.message); }
const now = { commit: git(['rev-parse', 'HEAD']).stdout.trim(), tree: git(['rev-parse', 'HEAD^{tree}']).stdout.trim() };
if (after.length || now.commit !== source.commit || now.tree !== source.tree)
  fail('the working tree changed while the release was building, so the build matches no ' +
       'one commit. Nothing was recorded; package again.\n' +
       [...after, ...(now.commit !== source.commit ? [`HEAD moved: ${source.commit} -> ${now.commit}`] : [])]
         .map((p) => `  ${p}`).join('\n'));
// Last, so a source record exists only beside a staging that verified.
writeFileSync(sourceFile, formatSource(source));

console.log(`\ndone.`);
console.log(`  dist-release/${tag}/`);
for (const line of sums) console.log(`  ${line}`);
console.log(`  cert   ${signer}`);
console.log(`  source ${source.commit} (tree ${source.tree})`);
console.log(`         (expected ${EXPECTED_CERT}, ANDROID.md \u00a73)`);
console.log(`\nnext: node tools/publish_release.mjs   (dry run; --confirm to publish)`);
