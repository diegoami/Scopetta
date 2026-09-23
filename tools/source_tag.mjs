/**
 * Ties a staged release to the source it was built from. Discola's, from
 * diegoami/discola-web (issue #65), unchanged below this header but for one
 * addition to treeProblems, the flagged-entries check (issue #67).
 *
 * The packager refuses a working tree that is not exactly HEAD, and records the
 * commit and tree it built (`dist-release/vX.Y.Z.source`, beside the staged
 * directory so the SHA256SUMS.txt set stays exactly the assets). The publisher
 * refuses to publish unless `vX.Y.Z` exists on origin, is on origin/main, and
 * names that same commit; the release notes then name it.
 *
 * Here the tag comes first (CLAUDE.md, "Each milestone"): the reviewed
 * candidate is tagged, and the release is packaged from a checkout of the tag,
 * so the recorded commit is the tag's. Packaging the candidate first and
 * tagging it after would pass the same check; the check is that the tag and the
 * build name one commit, whichever happened first.
 *
 * Record format, LF endings:
 *
 *     commit <hex>
 *     tree <hex>
 */

import { spawnSync } from 'node:child_process';

const OID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Why the working tree at `cwd` is not exactly HEAD, one line per path, or []
 * when it is. Throws if git fails. Deliberately not `git status --porcelain`:
 *
 * - tracked changes come from `git diff HEAD`, which compares content after
 *   eol conversion. With core.autocrlf=true, `cap sync` rewrites CRLF-checked-out
 *   Gradle files as LF and status reports them modified with nothing to commit.
 * - untracked files come from `git ls-files --others`, which, unlike status,
 *   ignores status.showUntrackedFiles=no.
 * - ignored files count too under `bundled` (public/), since the build copies
 *   that whole directory; a global core.excludesFile can hide anything there.
 * - a tracked file flagged --skip-worktree or --assume-unchanged is reported
 *   whatever its content, because git trusts the flag and every question above
 *   then reads it as clean. `git ls-files -v` tags skip-worktree entries `S`
 *   and assume-unchanged ones in lower case (issue #67; Scopetta's addition).
 */
export function treeProblems(cwd, bundled = ['public/']){
  const git = (args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
    return r.stdout.split('\n').filter(Boolean);
  };
  return [
    ...git(['diff', '--name-only', '--no-ext-diff', 'HEAD', '--']).map((p) => `modified   ${p}`),
    ...git(['ls-files', '--others', '--exclude-standard']).map((p) => `untracked  ${p}`),
    ...git(['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...bundled])
      .map((p) => `ignored    ${p}`),
    ...git(['ls-files', '-v']).filter((l) => /^([a-z]|S) /.test(l))
      .map((l) => `flagged    ${l.slice(2)}`),
  ];
}

/** Serialize `{ commit, tree }` as a source record. */
export function formatSource({ commit, tree }){
  for (const [key, oid] of [['commit', commit], ['tree', tree]])
    if (!OID.test(oid ?? '')) throw new Error(`${key} is not a full object id: ${oid}`);
  return `commit ${commit}\ntree ${tree}\n`;
}

/** Parse a source record. Throws unless it is exactly `formatSource`'s output. */
export function parseSource(text){
  const m = /^commit (\S+)\ntree (\S+)\n$/.exec(text);
  if (!m || !OID.test(m[1]) || !OID.test(m[2]))
    throw new Error('the source record is not "commit <oid>\\ntree <oid>\\n"');
  return { commit: m[1], tree: m[2] };
}

/**
 * The commit `tag` names in `git ls-remote --tags` output, or null when the tag
 * is absent. An annotated tag lists the tag object and then the peeled commit
 * (`^{}`); a lightweight tag lists the commit alone. Refs must match exactly, so
 * v1.0.1 is not satisfied by v1.0.10 or by some/prefix/v1.0.1.
 */
export function tagCommit(lsRemote, tag){
  let direct = null, peeled = null;
  for (const line of lsRemote.split(/\r?\n/)) {
    const m = /^([0-9a-f]+)\t(\S+)$/.exec(line);
    if (!m) continue;
    if (m[2] === `refs/tags/${tag}^{}`) peeled = m[1];
    else if (m[2] === `refs/tags/${tag}`) direct = m[1];
  }
  return peeled ?? direct;
}
