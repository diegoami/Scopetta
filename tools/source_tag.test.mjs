// discola-web's tests for source_tag.mjs, ported unchanged but for the temp-directory
// names (issue #65). The #35 and #36 in their names are discola-web's issues.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatSource, parseSource, tagCommit, treeProblems } from './source_tag.mjs';

const C = 'e888af0ab9dcfb28a4e1123f336cceb90ae3d80a';
const T = 'cb297cd4667fe4190aea0e56acc1fa111517222d';

test('a source record round-trips', () => {
  const text = formatSource({ commit: C, tree: T });
  assert.equal(text, `commit ${C}\ntree ${T}\n`);
  assert.deepEqual(parseSource(text), { commit: C, tree: T });
});

test('a malformed source record is refused, not half-read', () => {
  assert.throws(() => parseSource(''));
  assert.throws(() => parseSource(`commit ${C}\n`));                   // no tree
  assert.throws(() => parseSource(`commit ${C}\r\ntree ${T}\r\n`));    // CRLF
  assert.throws(() => parseSource(`commit ${C.slice(0, 7)}\ntree ${T}\n`)); // short id
  assert.throws(() => parseSource(`tree ${T}\ncommit ${C}\n`));        // swapped
  assert.throws(() => formatSource({ commit: C, tree: '' }));
});

// Real output for the pushed v1.0.4 annotated tag, plus neighbours that a
// suffix or prefix match would wrongly accept.
const LS = [
  `20577668ba2c2484a7be4f85afe6b810c1c3c6ef\trefs/tags/v1.0.4`,
  `${C}\trefs/tags/v1.0.4^{}`,
  `1111111111111111111111111111111111111111\trefs/tags/v1.0.40`,
  `2222222222222222222222222222222222222222\trefs/tags/old/v1.0.5`,
].join('\n') + '\n';

test('an annotated tag resolves to its peeled commit, not the tag object', () => {
  assert.equal(tagCommit(LS, 'v1.0.4'), C);
});

test('a lightweight tag resolves to the commit it names', () => {
  assert.equal(tagCommit(`${C}\trefs/tags/v2.0.0\r\n`, 'v2.0.0'), C);
});

test('a missing tag is null, and near-miss refs do not count', () => {
  assert.equal(tagCommit(LS, 'v1.0.5'), null);  // only old/v1.0.5 exists
  assert.equal(tagCommit(LS, 'v1.0'), null);
  assert.equal(tagCommit('', 'v1.0.4'), null);
});

// --- treeProblems, against real throwaway repositories ---
// Each scenario asserts `git status` misreports it too, so the test proves the
// case it guards is real on this git, not only that the new code handles it.

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

function repo(config = {}){
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scopetta-tree-'));
  git(dir, 'init', '-q');
  for (const [k, v] of Object.entries({ 'user.name': 't', 'user.email': 't@t',
    'core.autocrlf': 'false', 'core.excludesFile': '', ...config })) git(dir, 'config', k, v);
  mkdirSync(path.join(dir, 'public'));
  writeFileSync(path.join(dir, 'public', 'index.html'), 'a\nb\n');
  writeFileSync(path.join(dir, '.gitignore'), 'dist-release\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

test('a tree that is exactly HEAD has no problems', () => {
  assert.deepEqual(treeProblems(repo()), []);
});

test('modified and staged changes are both reported', () => {
  const dir = repo();
  writeFileSync(path.join(dir, 'public', 'index.html'), 'a\nc\n');
  assert.deepEqual(treeProblems(dir), ['modified   public/index.html']);
  git(dir, 'add', '.');
  assert.deepEqual(treeProblems(dir), ['modified   public/index.html']);
});

test('untracked files are reported even with status.showUntrackedFiles=no (#36)', () => {
  const dir = repo({ 'status.showUntrackedFiles': 'no' });
  writeFileSync(path.join(dir, 'public', 'stray.txt'), 'x');
  assert.equal(git(dir, 'status', '--porcelain'), '');  // what the old check read
  assert.deepEqual(treeProblems(dir), ['untracked  public/stray.txt']);
});

test('ignored files under public/ are reported; ignored build output elsewhere is not (#36)', () => {
  const dir = repo();
  writeFileSync(path.join(dir, 'excludes'), '*.bak\n');
  git(dir, 'config', 'core.excludesFile', path.join(dir, 'excludes'));
  writeFileSync(path.join(dir, 'public', 'old.bak'), 'x');
  mkdirSync(path.join(dir, 'dist-release'));
  writeFileSync(path.join(dir, 'dist-release', 'v1.0.0.source'), 'x');
  writeFileSync(path.join(dir, 'root.bak'), 'x');
  assert.equal(git(dir, 'status', '--porcelain'), '?? excludes\n');
  assert.deepEqual(treeProblems(dir), ['untracked  excludes', 'ignored    public/old.bak']);
});

test('an LF rewrite of a CRLF checkout under autocrlf is not a change (#35)', () => {
  const dir = repo({ 'core.autocrlf': 'true' });
  const file = path.join(dir, 'public', 'index.html');
  rmSync(file);
  git(dir, 'checkout', '--', 'public/index.html');
  assert.equal(readFileSync(file, 'utf8'), 'a\r\nb\r\n');  // checked out as CRLF
  writeFileSync(file, 'a\nb\n');                           // what cap sync does
  assert.equal(git(dir, 'status', '--porcelain'), ' M public/index.html\n');
  assert.deepEqual(treeProblems(dir), []);
});

test('outside a repository it throws rather than reporting a clean tree', () => {
  assert.throws(() => treeProblems(mkdtempSync(path.join(os.tmpdir(), 'scopetta-norepo-'))));
});

// Issue #67: a tracked file git has been told not to look at. Both flags make
// `git diff HEAD` and `git status` trust the index, so an edited file under
// either one reads as clean to every question above.
test('a file flagged --skip-worktree is reported, though git status misses it (#67)', () => {
  const dir = repo();
  git(dir, 'update-index', '--skip-worktree', 'public/index.html');
  writeFileSync(path.join(dir, 'public', 'index.html'), 'edited\n');
  assert.equal(git(dir, 'status', '--porcelain'), '');   // what the checks above see
  assert.deepEqual(treeProblems(dir), ['flagged    public/index.html']);
});

test('a file flagged --assume-unchanged is reported, though git status misses it (#67)', () => {
  const dir = repo();
  git(dir, 'update-index', '--assume-unchanged', 'public/index.html');
  writeFileSync(path.join(dir, 'public', 'index.html'), 'edited\n');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.deepEqual(treeProblems(dir), ['flagged    public/index.html']);
});
