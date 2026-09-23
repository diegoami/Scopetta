# Scopetta — the desktop build

The recorded decision for packaging `public/` as a desktop application, and how
the build is checked. Companion to [`ANDROID.md`](ANDROID.md), which does the
same for the APK.

**Status.** The [`desktop/`](desktop/README.md) wrapper is built and passes
`tools/smoke_desktop.mjs` (below). Releasing it beside the APK is the next
change, and is not wired up yet. Installers and code signing are deferred.

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

Run on 2026-09-23 (Windows 11, Tauri 2.11.6):

```
first launch
  pass  served from the app origin  (http://tauri.localhost)
  pass  the window opens at 1280x800  (1280x800)
  pass  all 6 decks load over the asset protocol
  pass  a deal puts three cards in your hand  (3)
  pass  a whole deal plays through  (18 cards played)
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

Made to fail first, two ways, so its checks are known to see what they name:

- **A window of the wrong size.** Built with `tauri.conf.json` at 1100 × 700,
  the smoke fails exactly one check: `the window opens at 1280x800 (1100x700)`.
- **A deck the page does not know.** Tressette's first smoke chose `'trevisane'`,
  which is not a deck, and its persistence checks failed as they should. The
  same mistake here fails five: the deal, the result, the history, and both
  checks after the restart, which comes back with the default deck. Here the
  deal did not even reach its end under the unknown name. A player cannot reach
  that state, since the picker offers only real names and the page replaces an
  unknown saved one on load, so it is recorded here rather than chased.

After both, the healthy build passes every check again.

## Releasing

Not wired up yet. The next change ships the executable beside the APK as one
GitHub Release on
[`diegoami/scopetta-releases`](https://github.com/diegoami/scopetta-releases),
at 1.0.1, following Tressette's 1.0.4: the packager builds both, smokes the
exe, and stages them with `SHA256SUMS.txt`; every version declaration has to
agree before anything is built; and the about screen and a `/windows` redirect
link to it.

## Out of scope

A CI job for the desktop build. Releases are built locally
([`ANDROID.md`](ANDROID.md)), and a Windows runner with a Rust toolchain costs
more than the command it would save. Installers and code signing wait until a
broader distribution is wanted.
