# Scopetta — the itch.io build

The browser game, packaged as an HTML5 ZIP and uploaded to itch.io, with the
Windows and Android builds on the same project page. This is the playbook the
owner follows; `tools/package_itch.mjs`, `tools/smoke_itch_zip.mjs` and
`tools/publish_itch.mjs` are what it runs. It is Tressette's (`ITCH.md` there,
its issue #95), ported onto this repository's release tooling: the source
records are `tools/source_tag.mjs`'s, the ones `package_release.mjs` already
writes.

The GitHub release is unchanged: `diegoami/scopetta-releases` still carries
exactly the APK and the Windows `.exe` and their `SHA256SUMS.txt`
([`ANDROID.md`](ANDROID.md) §4, [`DESKTOP.md`](DESKTOP.md)). The itch ZIP is a
third artifact for a second storefront, staged under `dist-itch/` so it can
never join that release.

## The page (edited by hand)

**Butler pushes builds, not page text.** The description, the embed size, the
cover, the screenshots, the tags and the fullscreen toggle are all edited on
itch.io by hand, so a change here is not live until the owner pastes it. The
project is **diegoami/scopetta**, confirmed by the owner on 2026-10-23:
<https://diegoami.itch.io/scopetta>. Check what is uploaded with
`butler status diegoami/scopetta` (all three channels).

- **Kind of project: HTML.** Under *Uploads*, the ZIP on the `html5` channel has
  **This file will be played in the browser** ticked, once, and it stays
  ticked. The APK and the `.exe` stay downloads.
- **Android key change from v1.0.4.** Include the uninstall and local-data-loss
  warning from the generated GitHub release notes beside the Android download:
  users of v1.0.3 or earlier cannot install the new-key APK over the old app.
- **Embed size: 480×720, portrait.** On phones itch.io launches the game
  fullscreen and fixes the orientation from the embed's aspect ratio before any
  game code runs, so a portrait embed is what keeps a phone upright. This is the
  owner's decision in Discola (`STORES.md`, issue #121) and Tressette, and the
  UI check asserts the whole first screen fits it without scrolling, in both
  languages and with a result behind it (`tools/check_ui.mjs`, the
  `itch embed` viewport).
- **The page must also work at 640×480** and at every other size and
  orientation. That is a supported window, not the canonical embed, so the sheet
  may scroll there; Gioca is sticky and stays on the screen.
- **The fullscreen option stays available to the player and is never forced.**
  Discola tried taking the embed fullscreen (and locking portrait) on the first
  Start and the owner rejected it; the game never calls `requestFullscreen` or
  `screen.orientation.lock`, and the UI check's framed pass asserts it,
  top-level and inside a same-origin iframe.
- **Gioca sits above the deck picker** on the start sheet. itch.io runs the
  game fullscreen on a phone, and Android lays a toast over the bottom 9% of
  the screen for a few seconds; a button parked on the bottom edge sat under it
  (Discola #128).
- **Free**, with tags `card-game`, `italian`, `singleplayer`, `offline`,
  `retro`, `browser`.

A one-line description is enough; the phone player is sent to the web version
for the better experience, because the runner's fullscreen toast covers the
bottom of the screen for a few seconds:

> Scopa a due contro quattro avversari con carattere, con i mazzi regionali
> italiani. Funziona offline, senza account e senza pubblicità: lo storico
> resta sul dispositivo. In italiano e in inglese. Per un'esperienza migliore
> gioca su <https://scopetta.netlify.app> .

**Follow-up page work:** an `/itch` redirect in `netlify.toml`, the in-game
link to the itch page, and a listing kit (cover and screenshots) like
Tressette's `itch-listing/`. The project URL is now confirmed; these are not
required by the build uploader.

## The three channels

One butler channel per build, one file each, all at the same `--userversion`:

| channel | file | source |
|---|---|---|
| `html5` | `Scopetta-X.Y.Z-itch-html5.zip` | `dist-itch/vX.Y.Z/` |
| `windows` | `Scopetta-X.Y.Z-windows-x64.exe` | `dist-release/vX.Y.Z/` |
| `android` | `Scopetta-X.Y.Z-android.apk` | `dist-release/vX.Y.Z/` |

`tools/publish_itch.mjs` maps each channel to its one file, so a wrong or
repeated ZIP is impossible, and pushes all three only after every hash, every
source record and the live tag have checked out.

## Packaging order

This slots into the release in [`AGENTS.md`](AGENTS.md), *Releases*; nothing
here replaces a step there. The itch packager needs only node and git, so it
runs anywhere; `package_release.mjs` is Windows-only. Both refuse a working tree
that is not exactly HEAD.

1. **Candidate.** On a clean checkout of the candidate SHA on `main`:
   `node tools/package_itch.mjs --candidate --confirm` (without `--confirm` it
   only prints the plan). It stages
   `dist-itch/candidate-<first seven of the sha>/` with the ZIP and its
   `SHA256SUMS.txt`, and records the commit and tree it was built from beside
   it, in `dist-itch/candidate-<sha>.source`.
2. **The gates and the smoke**, on that commit: `npm test`, `npm run check`,
   then the packaged ZIP:
   `node tools/smoke_itch_zip.mjs dist-itch/candidate-<sha>/Scopetta-X.Y.Z-itch-html5.zip`.
   The smoke verifies the ZIP against `SHA256SUMS.txt`, extracts it with the
   system `unzip`/`tar`, compares every file byte for byte with `public/`, and
   loads the extracted page over http in Chromium at 480×720, in Italian and in
   English, and at 640×480.
3. **The real-phone check**, on the candidate ZIP, before the tag, with the
   other device checks (AGENTS.md, *Releases* step 4): upload the candidate
   ZIP by hand to a private itch.io draft and open it on a phone. The publisher
   accepts only tagged release stages. The orientation problem the embed size
   exists for showed up only there (Discola #121).
4. **The tag**, after AGREE, on exactly the reviewed and tested commit:
   `git tag -a vX.Y.Z -m "Scopetta X.Y.Z" <sha>`, then
   `git push origin vX.Y.Z`. If the candidate changed, build and check a new
   one first, the phone check included.
5. **Release packaging**, on a clean checkout of the tag:
   `node tools/package_release.mjs` (on Windows, [`ANDROID.md`](ANDROID.md) §4)
   and `node tools/package_itch.mjs --confirm`, which refuses unless HEAD is
   the annotated tag. Both write their records:
   `dist-release/vX.Y.Z.source` and `dist-itch/vX.Y.Z.source`. Smoke the
   release ZIP too: `node tools/smoke_itch_zip.mjs`.
6. **Upload**, on the owner's go-ahead, after the GitHub release:
   `node tools/publish_itch.mjs --project owner/slug` (dry run), then
   `--confirm`. It refuses unless `dist-release/vX.Y.Z.source`,
   `dist-itch/vX.Y.Z.source` and the candidate's
   `dist-itch/candidate-<sha>.source` all name one commit and one tree, that
   commit is the peeled annotated `vX.Y.Z` on the live `origin`, and it is an
   ancestor of `origin`'s `main`.

Packaging the candidate and the release in one checkout is what puts both
records side by side; a release packaged on another machine needs the
candidate's `dist-itch/candidate-<sha>.source` copied beside it. Repackaging
from the same commit is allowed: the source identity is the guarantee, not the
byte identity of a rebuilt `.exe` or APK. (The ZIP itself is byte-identical
across rebuilds of one commit; the encoder is deterministic.)

## The publisher

```sh
node tools/publish_itch.mjs --project owner/slug            # dry run: check, print, upload nothing
node tools/publish_itch.mjs --project owner/slug --confirm  # push the three channels
```

- **`--project owner/slug` is required on both runs.** There is no default: the
  owner confirms the slug before a publisher may run, and a guessed target is a
  refusal. The three resolved targets are printed.
- It needs `butler` (<https://itch.io/docs/butler/>) on `PATH`, or `BUTLER` set
  to its path, and a prior `butler login` or an API key in `BUTLER_API_KEY`.
  Butler manages authentication; the publisher never reads, prints or stores
  credentials.
- Dry run by default; nothing is uploaded without `--confirm`. On a failed
  channel it stops and reports which channels were completed.
- The version is this checkout's `versionName` and only that: it reads one
  stage, `vX.Y.Z`, in both staging roots. A missing current stage, a malformed
  or mismatched record, a mixed commit, an extra file in a stage, or a tag on a
  different commit is a refusal before any upload.
