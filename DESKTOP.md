# Scopetta — the desktop build

The recorded decision for packaging `public/` as a desktop application, and how
the build is checked. Companion to [`ANDROID.md`](ANDROID.md), which does the
same for the APK.

**Status.** The [`desktop/`](desktop/README.md) wrapper is built and passes
`tools/smoke_desktop.mjs` (below). A release carries it beside the APK from
1.0.1 on, and the rules screen and `/windows` link to it. Installers and code
signing are deferred.

## Recorded decision

Chosen by the owner on 2026-09-23, in chat: the defaults proposed, which are
Discola's decision as Tressette took it, renamed.

| Decision | Value | Note |
|---|---|---|
| Shell | **Tauri 2** | wraps `public/` unchanged |
| Platforms | **Windows only** | Linux and macOS are later options |
| Goal | **Personal use + GitHub Releases** | as for Android, not app stores |
| Binary hosting | **`diegoami/scopetta-releases`** | the repository the APK ships from |
| Code signing | **Unsigned first** | SmartScreen warns on first run; the release notes will say so |
| Identifier | **`com.scopetta.desktop`** | permanent: it keys the app's storage |
| First release with it | **1.0.1** | the house's patch line, as Tressette's 1.0.4 |

The comparison it was made from, Tauri against Electron and against rewriting
the page in the Geoclick stack, is in
[Discola's `DESKTOP.md`](https://github.com/diegoami/discola-web/blob/main/DESKTOP.md),
and nothing in it differs for this game. Tauri wraps `public/` unchanged, so
the web build stays a directory that opens with no toolchain (`SPEC.md` §2).
The Rust toolchain it needs was already installed (cargo 1.98.1). Electron
would bundle a whole Chromium to show one page, and a rewrite would change
nothing a player sees while risking everything the UI check guards.

The wrapper is Tressette's at `9d2be25`, which forked Discola's at `8574702`:
the same three source files and configuration, renamed, with the same
`Cargo.lock` so the build uses the Tauri it was proven on (runtime 2.11.6, CLI
2.11.5). The only change the build made to that lock was to move the renamed
root entry into alphabetical order.

## How the build is checked

`tools/check_ui.mjs` measures `public/` over `file://`. The app embeds those
same bytes, so the layout is checked there, and the check gained the app's
window, 1280 × 800, as the `desktop window` viewport. What the check cannot see
is what only the wrapper can break, and `tools/smoke_desktop.mjs` checks that
against the built `scopetta.exe` itself:

```sh
cd desktop && npm ci && npm run build && cd ..
node tools/smoke_desktop.mjs
```

It launches the app with WebView2's DevTools port open and attaches
`playwright-core`, the repository's one dev dependency, over CDP. Nothing is
injected into the build: the build that is checked is the build that ships. The
app runs against a temporary WebView2 profile, so a smoke run never writes into
a player's history. It plays a whole deal the way a player does — one tap plays
a card, and where the rules leave a choice of capture a second tap accepts the
capture the table proposes — then restarts the app and looks for the deal and
the deck it chose.

The deal is a known one, seed 16 with the dealer cleared, as in `check_ui.mjs`'s
deal pass. A random deal meets a choice of capture only about a third of the
time, and a run that never made the second tap printed the same as one that did;
the review of #61 found it. On this deal the driver meets two choices every run,
the smoke counts them and fails on none, and the cards played are read from the
page rather than counted by the driver. A choice is counted only once the page
shows the card raised (`aria-pressed`), so the check sees the page and not the
driver's own taps.

Run on 2026-09-23 (Windows 11, Tauri 2.11.6):

```
first launch
  pass  served from the app origin  (http://tauri.localhost)
  pass  the window opens at 1280x800  (1280x800)
  pass  all 6 decks load over the asset protocol
  pass  a deal puts three cards in your hand  (3)
  pass  a whole deal plays through  (36 of 36 cards played)
  pass  a choice of capture is accepted with a second tap  (2 choice(s))
  pass  the end of the deal shows its result  (Hai perso)
  pass  the deal is recorded in the history  (1 deals)
  pass  all 6 @font-face rules load
  pass  nothing is fetched from outside the app
  pass  no script errors
second launch
  pass  the deal is in the history after a restart  (1 deals)
  pass  the deck chosen before the restart is still chosen  (Napoletane)
  pass  the app wrote to the temporary profile, not the player's
```

Made to fail first, four ways, so its checks are known to see what they name:

- **A window of the wrong size.** Built with `tauri.conf.json` at 1100 × 700,
  the smoke fails exactly one check: `the window opens at 1280x800 (1100x700)`.
- **A deck the page does not know.** Tressette's first smoke chose `'trevisane'`,
  which is not a deck, and its persistence checks failed as they should. The
  same mistake here fails five: the deal, the result, the history, and both
  checks after the restart, which comes back with the default deck. Here the
  deal did not even reach its end under the unknown name. A player cannot reach
  that state, since the picker offers only real names and the page replaces an
  unknown saved one on load, so it is recorded here rather than chased.

- **A choice the second tap never accepts.** With the second tap taken out
  but the choice still counted, the deal stalls on the raised card: `a whole
  deal plays through (32 of 36 cards played)` fails, with the result and the
  history after it. The page's own count is what catches it.
- **A page that never raises the card.** Built with the tap handler playing a
  choice on the first tap, the deal still plays through (36 of 36), and the
  choice check fails on its own: `no card was raised for a choice, so the second
  tap was never made`. Before it read the page's `aria-pressed`, this break
  passed every check.

After each, the healthy build passes every check again, and three healthy runs
in a row met the same two choices.

## Releasing

Both targets ship as one GitHub Release on
[`diegoami/scopetta-releases`](https://github.com/diegoami/scopetta-releases),
on one version line, from this machine: it holds the Android signing key and
the Rust toolchain.

```sh
node tools/package_release.mjs            # builds both, smokes the exe, stages dist-release/vX.Y.Z/
node tools/publish_release.mjs            # dry run: verifies, prints the notes
node tools/publish_release.mjs --confirm
```

A version bump touches seven declarations: Android's `versionName` (and
`versionCode`), `tauri.conf.json`, `Cargo.toml`, `desktop/package.json`, the
two fields of `desktop/package-lock.json`, and `Cargo.lock`, which `cargo
update -p scopetta --offline` rewrites rather than a hand. `package_release.mjs`
refuses to build unless they all agree, and so does `tools/release.test.mjs` on
every pull request, so a missed one turns CI red before release day. The
packager refuses an `.exe` that is missing, under 1 MB or not a PE binary, runs
the smoke against it, and stages `Scopetta-X.Y.Z-android.apk`,
`Scopetta-X.Y.Z-windows-x64.exe` and `SHA256SUMS.txt`, replacing any earlier
directory. The publisher requires exactly those two assets: an APK-only
directory is half a release, not a smaller one.

This is Tressette's 1.0.4, ported into this repository's own release scripts
rather than copied over them, since they had diverged (`isPlaceholderCert` is
Scopetta's), so every decision is a pure function the tests hold.

The executable is **unsigned**, so SmartScreen warns on first run. The release
notes say so where a player meets it:

> L'eseguibile non è firmato digitalmente, quindi Windows mostrerà l'avviso
> «Windows ha protetto il PC»: clicca «Ulteriori informazioni», poi «Esegui
> comunque». È portabile, senza installer: mettilo dove preferisci.

## Out of scope

A CI job for the desktop build. Releases are built locally
([`ANDROID.md`](ANDROID.md)), and a Windows runner with a Rust toolchain costs
more than the command it would save. Installers and code signing wait until a
broader distribution is wanted.
