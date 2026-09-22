/**
 * The decisions behind tools/package_release.mjs and tools/publish_release.mjs,
 * as pure functions.
 *
 * The release scripts run rarely, on the one boundary here that is hard to take
 * back, and their choices — which staged version is newest, which build-tools
 * to trust, whether the signature is the right one, whether the staged files
 * still hash to what the manifest says — used to live inline and were exercised
 * only on release day. They are here so `tools/release.test.mjs` can hold them
 * without an SDK, a keystore, a device or the network.
 *
 * Nothing here touches the filesystem, `process`, a clock or an rng.
 */
import path from 'node:path';

// The SHA-256 digest of the release certificate, recorded in ANDROID.md §3.
// Every future release must be signed with this key: Android treats a different
// signer as a different app, and no installed copy will take it as an update.
//
// NOT RECORDED YET. This project has no release key at the time of writing, so
// the placeholder below is all zeros. The first `node tools/package_release.mjs`
// after the key exists will build and verify, then refuse with the real digest
// in the message — paste that digest here and into ANDROID.md §3, and run it
// again. It refuses rather than warning on purpose: an APK signed by the wrong
// key cannot update an installed copy, and that is not a mistake to make once.
export const EXPECTED_CERT =
  '0000000000000000000000000000000000000000000000000000000000000000';

// `vX.Y.Z` (the only shape package_release writes) to [X, Y, Z], else null.
export function parseVersion(name){
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// The highest tag numerically. Default `.sort()` compares strings, so it puts
// v1.10.0 before v1.9.0 and hands publish_release the wrong directory the first
// time a component reaches two digits.
export function newestTag(names){
  return names
    .filter((n) => parseVersion(n))
    .sort((a, b) => {
      const x = parseVersion(a), y = parseVersion(b);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .at(-1) ?? null;
}

// The build-tools directory to use, chosen by number. Android names them
// `X.Y.Z` or `X.Y.Z-suffix` (rc, preview, …); a stable release of a given
// number beats a preview of the same number.
export function newestBuildTools(names){
  const key = (n) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(n);
    if (!m) return null;
    return { maj: +m[1], min: +m[2], pat: +m[3], stable: m[4] === '' ? 1 : 0, rest: m[4] };
  };
  return names
    .filter((n) => key(n))
    .sort((a, b) => {
      const x = key(a), y = key(b);
      return x.maj - y.maj || x.min - y.min || x.pat - y.pat ||
        x.stable - y.stable || x.rest.localeCompare(y.rest);
    })
    .at(-1) ?? null;
}

// The SHA-256 certificate digest apksigner prints, lowercased and unpunctuated
// so a colon-separated form and a plain one compare equal.
export function parseCertDigest(output){
  const m = /SHA-256 digest:\s*([0-9a-fA-F:\s]+)/i.exec(output || '');
  return m ? m[1].replace(/[^0-9a-fA-F]/g, '').toLowerCase() : null;
}

export function certificateMatches(digest, expected = EXPECTED_CERT){
  return typeof digest === 'string' && digest.toLowerCase() === expected.toLowerCase();
}

// Whether the recorded digest is still the placeholder. The all-zero value is
// not a certificate anybody will ever sign with, but "compare against the
// constant" would happily accept a verifier that printed zeros, and the value is
// only there until the owner records the real key. So it is refused explicitly
// rather than by hoping the comparison fails.
export function isPlaceholderCert(expected = EXPECTED_CERT){
  return !/^[0-9a-f]{64}$/i.test(expected) || /^0{64}$/.test(expected);
}

// The decision step 4 of package_release has to make. `verify` is null when no
// apksigner could be run at all. Absence used to mean "do not check", and the
// APK was staged anyway; now it fails closed, and a verified signature on the
// wrong certificate fails too.
export function signatureVerdict({ verify, expected = EXPECTED_CERT }){
  if (!verify)
    return { ok: false, reason:
      'apksigner was not found under the SDK build-tools, so the APK could not be ' +
      'verified. An unverified build is not staged: install build-tools or point ' +
      'ANDROID_HOME at an SDK that has them.' };
  if (verify.status !== 0)
    return { ok: false, reason:
      `the APK does not verify:\n${verify.stdout ?? ''}${verify.stderr ?? ''}` };
  const digest = parseCertDigest(verify.stdout);
  if (!digest)
    return { ok: false, reason: 'apksigner printed no SHA-256 certificate digest.' };
  if (isPlaceholderCert(expected))
    return { ok: false, reason:
      `no release key is recorded yet — EXPECTED_CERT is still the all-zero ` +
      `placeholder. This build is signed with ${digest}. Paste that into ` +
      'tools/release_lib.mjs and ANDROID.md §3, then run again.' };
  if (!certificateMatches(digest, expected))
    return { ok: false, reason:
      `signed with ${digest}, expected ${expected}. That is the wrong key: an APK ` +
      'signed by anything else cannot update an installed copy. Stop.' };
  return { ok: true, signer: digest };
}

// `SHA256SUMS.txt` rows — `<64 hex><space><name>` — the shape `sha256sum`
// writes. Malformed input throws rather than parsing to an empty list, because
// an empty manifest that "verifies" is the failure mode this guards.
export function parseChecksums(text){
  return String(text).trim().split('\n').filter(Boolean).map((line) => {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (!m) throw new Error(`malformed SHA256SUMS line: ${line}`);
    return { hash: m[1], name: m[2] };
  });
}

// Everything wrong with a staged directory, given a `hashOf(name)` that returns
// the actual digest or null when the file is absent. Empty means staged intact.
export function checksumProblems(manifestText, hashOf){
  let rows;
  try { rows = parseChecksums(manifestText); }
  catch (e){ return [e.message]; }
  if (!rows.length) return ['SHA256SUMS.txt is empty'];
  const problems = [];
  for (const { name, hash } of rows){
    const actual = hashOf(name);
    if (actual === null) problems.push(`missing ${name}`);
    else if (actual !== hash) problems.push(`${name} does not match SHA256SUMS.txt`);
  }
  return problems;
}

// The `gh release create` arguments, or null on a dry run. This is the one
// irreversible step, and returning null for the default keeps the no-write
// guarantee in a function that a test can call, not only in a process a human
// watches.
export function releaseCreateArgs({ confirm, tag, version, dir, apkName, releasesRepo, notesFile }){
  if (!confirm) return null;
  return ['release', 'create', tag,
    path.join(dir, apkName), path.join(dir, 'SHA256SUMS.txt'),
    '-R', releasesRepo, '--title', `Scopetta ${version}`, '--notes-file', notesFile];
}
