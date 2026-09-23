/**
 * Stage a release's assets beside a SHA256SUMS.txt, and read back what landed.
 *
 * This is the one staging step that touches the filesystem, so it lives here
 * rather than in release_lib.mjs, whose functions touch nothing.
 *
 * The manifest is written from hashes of the SOURCES — the built APK and exe —
 * taken before anything is copied, and the staged copies are then checked
 * against it with checksumProblems. The read-back therefore compares two
 * independent readings, and a copy that went wrong is caught. The packager used
 * to hash the staged copies, write the manifest from those hashes and check the
 * copies against it: a reading compared with itself, which only the file-set
 * half of the check could ever fail (issue #70).
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { checksumProblems } from './release_lib.mjs';

/**
 * Copy `files` ([name, source path] pairs) into `outDir`, write SHA256SUMS.txt
 * from the sources, and verify the copies. Returns `{ sums, problems }`: the
 * manifest's lines, and everything wrong with what was staged ([] when intact).
 * `copy` is injectable so a test can make a copy go wrong.
 */
export function stageAssets(outDir, files, { copy = copyFileSync } = {}){
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const sums = files.map(([name, src]) => `${sha(src)}  ${name}`);
  for (const [name, src] of files) copy(src, path.join(outDir, name));
  writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  const hashOf = (name) => {
    const p = path.join(outDir, name);
    return existsSync(p) ? sha(p) : null;
  };
  const problems = checksumProblems(readFileSync(path.join(outDir, 'SHA256SUMS.txt'), 'utf8'),
    hashOf, { expected: files.map(([name]) => name), present: readdirSync(outDir) });
  return { sums, problems };
}
