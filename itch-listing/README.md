# itch.io listing images

The [v1.0.4 kit](v1.0.4/) is ready to upload to
<https://diegoami.itch.io/scopetta>. It uses the original card art, bundled
fonts and game colours. The screenshots come from the verified released HTML5
ZIP; the game files are unchanged.

| Where in itch.io | File |
|---|---|
| Edit game → Cover image | `v1.0.4/cover-630x500.png` |
| Higher-resolution cover alternative | `v1.0.4/cover-1260x1000.png` |
| Edit game → Screenshots, first | `v1.0.4/01-gameplay.png` |
| Screenshots, second | `v1.0.4/02-choose-a-capture.png` |
| Screenshots, third | `v1.0.4/03-phone-italian.png` |
| Screenshots, fourth | `v1.0.4/04-opponents-and-decks.png` |
| Optional Edit theme → Header/Banner | `v1.0.4/banner-1600x500.png` |

The cover has itch.io's 315:250 aspect ratio. Gameplay/capture images are
2560×1600, the phone image is 960×1600, and the full start screen is 2560×2000.
The cover is a promotional composition; screenshots show the actual game UI.

HTML game pages hide the screenshot sidebar under the theme's **Auto** layout.
Choose **Edit theme → Layout → Screenshots → Sidebar** to show the uploaded
screenshots, or place selected images in the description instead.

References: [itch.io image sizes](https://itch.io/docs/creators/getting-started)
and [page layout](https://itch.io/docs/creators/design).

## Reproduce the kit

With the project's Playwright dependency/browser installed and the verified
`dist-itch/v1.0.4/Scopetta-1.0.4-itch-html5.zip` present:

```sh
node tools/capture_itch_listing.mjs
```

This verifies the release ZIP hash, extracts it into a temporary directory,
captures legal play from seed 16, and writes the PNGs plus a provenance manifest.
The cover/banner composition uses CSS sprite cells with nearest-neighbour
scaling; the original 1997 bitmap files are untouched. Every image was visually
inspected, including the full start screen with all controls above the fold.

The script also writes the ready-to-extract upload pack:
`dist-itch/Scopetta-1.0.4-itch-images.zip` (ignored build output). It contains the
seven PNGs, `UPLOAD.txt`, and `manifest.json`; upload the PNGs to the page's
image fields, not as game builds through butler.
