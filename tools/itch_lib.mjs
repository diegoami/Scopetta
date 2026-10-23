/**
 * The decisions behind the itch.io packaging, smoke and publishing scripts, as
 * pure functions. Tressette's (issue #95 there), ported onto this repository's
 * source records rather than a sidecar format of its own.
 *
 * itch.io is a second storefront on the same source as the GitHub release, and
 * its packaging must not disturb the exact two-asset contract the GitHub
 * publisher depends on (release_lib.releaseAssets, tools/publish_release.mjs).
 * So the itch ZIP stages under dist-itch/, apart from dist-release/, and the
 * two are tied together only by a source record each — `commit <oid>\ntree
 * <oid>\n`, tools/source_tag.mjs's format, the one package_release.mjs already
 * writes beside dist-release/vX.Y.Z/. `publish_itch.mjs` refuses unless the
 * itch release record, the GitHub release record, the itch candidate record and
 * the live annotated tag all name one commit and one tree.
 *
 * Nothing here touches the filesystem, `process`, a clock or the network.
 */
import { releaseAssets } from './release_lib.mjs';

// A project is `owner/slug`, exactly one slash, no spaces or path tricks. There
// is no default: the owner confirms the slug before a publisher may run, so a
// guessed target is a refusal, not a fallback.
export function parseProject(text){
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(String(text ?? ''));
  if (!m)
    throw new Error(`--project must be owner/slug (e.g. diegoami/scopetta), ` +
                    `not ${JSON.stringify(text)}`);
  return { owner: m[1], slug: m[2], target: `${m[1]}/${m[2]}` };
}

// The one file each butler channel carries, for one version. The mapping is
// explicit so a wrong or repeated ZIP is impossible.
export function channelAssets(version){
  const [apk, exe] = releaseAssets(version);
  return {
    html5:   itchStageFiles(version)[0],
    windows: exe,
    android: apk,
  };
}

// The three `butler push` targets and the file and --userversion each carries,
// in the order they are pushed. `project` is the owner/slug string.
export function channelTargets(project, version){
  const { target } = parseProject(project);
  const assets = channelAssets(version);
  return Object.keys(assets).map((channel) => ({
    channel,
    target: `${target}:${channel}`,
    file: assets[channel],
    userversion: version,
  }));
}

// The stage directory a build is written to: `vX.Y.Z` for a release, and
// `candidate-<first seven of the commit>` for the untagged build the smoke and
// the real-phone check run on.
export function stageName({ kind, commit, version }){
  return kind === 'release' ? `v${version}` : `candidate-${commit.slice(0, 7)}`;
}

// The files inside dist-itch/<stage>/ and dist-release/<stage>/. The GitHub
// release keeps exactly its two assets (release_lib.releaseAssets); the itch
// stage holds exactly the ZIP. Each directory also carries SHA256SUMS.txt.
export function itchStageFiles(version){
  return [`Scopetta-${version}-itch-html5.zip`];
}
export function releaseStageFiles(version){
  return releaseAssets(version);
}

// Where a build may be staged from, or why not. A release is packaged from a
// checkout of its annotated tag (AGENTS.md, *Releases*); a candidate from any
// commit on origin's main, before the tag exists. Either way the tree is
// exactly HEAD, so the build is a commit's and nothing else's.
//
// `tagCommit` is what refs/tags/vX.Y.Z peels to here (null when absent) and
// `tagType` what `git cat-file -t` says of the ref itself.
export function itchSource({ version, head, tagCommit, tagType, onMain, dirty, candidate }){
  const tag = `v${version}`;
  if (dirty.length)
    return { ok: false, reason: 'the working tree is not exactly HEAD, so this build would match no commit:\n' +
      dirty.map((p) => `  ${p}`).join('\n') + '\n\nCommit, stash or remove them, then package again.' };
  if (!onMain)
    return { ok: false, reason: `HEAD (${head}) is not on origin/main. git fetch origin, and build a commit that is.` };
  if (candidate)
    return { ok: true, kind: 'candidate', dir: stageName({ kind: 'candidate', commit: head, version }) };
  if (!tagCommit)
    return { ok: false, reason: `${tag} does not exist here. Package the untagged candidate with --candidate, ` +
      `or check out the tag (git fetch --tags origin).` };
  if (tagType !== 'tag')
    return { ok: false, reason: `${tag} is a lightweight tag; a release is an annotated one (AGENTS.md).` };
  if (tagCommit !== head)
    return { ok: false, reason: `HEAD is not ${tag}.\n  HEAD ${head}\n  ${tag} ${tagCommit}\n` +
      `Check out the tag, or package the candidate with --candidate.` };
  return { ok: true, kind: 'release', dir: stageName({ kind: 'release', commit: head, version }) };
}

// Everything wrong with the three source records the publisher reads, given
// each as `{ source }` (parsed) or `{ problem }` (missing or malformed). The
// GitHub release's record is the reference: the itch release must be the same
// commit and tree, and so must the itch candidate the smoke and the phone check
// ran on. The candidate's stage name comes from that same commit, so a
// candidate built from anything else is simply not found.
export function recordProblems({ version, itch, release, candidate }){
  const tag = `v${version}`;
  const problems = [];
  for (const r of [release, itch, candidate].filter(Boolean))
    if (r.problem) problems.push(r.problem);
  const ref = release?.source;
  if (!ref) return problems;
  const same = (label, r) => {
    if (!r?.source) return;
    if (r.source.commit !== ref.commit)
      problems.push(`${label} is commit ${r.source.commit}, but dist-release/${tag}.source is ${ref.commit}`);
    else if (r.source.tree !== ref.tree)
      problems.push(`${label} is tree ${r.source.tree}, but dist-release/${tag}.source is ${ref.tree}`);
  };
  same(`dist-itch/${tag}.source`, itch);
  same(`dist-itch/${stageName({ kind: 'candidate', commit: ref.commit, version })}.source`, candidate);
  return problems;
}

// The commit `tag` names in `git ls-remote` output, or null when absent, and
// whether it is annotated. An annotated tag lists the tag object and then the
// peeled commit (`^{}`); a lightweight tag lists the commit alone. Refs match
// exactly, so v1.0.3 is not satisfied by v1.0.30 or by some/prefix/v1.0.3.
// source_tag.tagCommit answers the first half; the publisher needs the second.
export function tagRef(lsRemote, tag){
  let direct = null, peeled = null;
  for (const line of String(lsRemote).split(/\r?\n/)){
    const m = /^([0-9a-f]+)\t(\S+)$/.exec(line);
    if (!m) continue;
    if (m[2] === `refs/tags/${tag}^{}`) peeled = m[1];
    else if (m[2] === `refs/tags/${tag}`) direct = m[1];
  }
  if (!direct && !peeled) return null;
  return { commit: peeled ?? direct, annotated: peeled !== null };
}

// The commit a branch points at in `git ls-remote` output, or null. This is the
// live value on the remote; a local `origin/<branch>` is only the last fetch.
export function branchHead(lsRemote, branch){
  for (const line of String(lsRemote).split(/\r?\n/)){
    const m = /^([0-9a-f]+)\t(\S+)$/.exec(line);
    if (m && m[2] === `refs/heads/${branch}`) return m[1];
  }
  return null;
}
