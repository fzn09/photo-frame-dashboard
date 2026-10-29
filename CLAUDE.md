# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two halves, see [ARCHITECTURE.md](ARCHITECTURE.md):

1. **Frame takeover research** (`docs/`, `scripts/`): getting ADB, backing up flash, rooting and kiosking cheap Android photo frames. One doc per device, indexed in `docs/devices.md`.
2. **The family dashboard** (`dashboard/`): a vanilla-JS Vite app served by a Cloudflare Worker, plus `dashboard/kiosk/`, a Gradle-free Android WebView app that shows it full screen.

This checkout is `fzn09/photo-frame-dashboard`, a fork of `wesbos/photo-frame-dashboard` (`upstream` remote). The owner's frame is a SOMY M10R7 (Allwinner A33). Its private record lives in the git-ignored `frames/` junction; read `frames/SETUP.md` before any device work, since it records the current phase.

## Device work: hard rules (from README)

- **Ask before every write** to flash, a partition, `/system`, an SD card, or a RAM payload. Each write needs its own approval; past approval does not carry over.
- No writes before a verified backup (exact size, SHA-256, readback). Don't trust fastboot `OKAY`; read writes back.
- Stop at the first mismatch in a hash, model string, offset or size. Report it, don't work around it.
- One change at a time, with the undo recorded first.
- Prove the way back (Settings → Apps reachable by hand on the panel) before disabling the vendor app or the access route.
- Before each write and each new session, check upstream for newer fixes: `gh issue list` / `gh pr list --repo wesbos/photo-frame-dashboard`.
- Never commit dumps, vendor APKs, serials, MACs, Wi-Fi details, tokens or whole-disk hashes. `backups/`, `diagnostics/`, `log/`, `frames/` are ignored for that reason.
- On Windows, `build.sh`-style shell tooling runs in WSL from a separate clone with `core.autocrlf=false`.

## Dashboard commands

Run from `dashboard/`:

```sh
npm run dev          # Vite dev server (host: true, port 5173), mock data only
npm run build        # dist/ — required before dev:live
npm run dev:live     # wrangler dev: Worker + /api/* + dist/ assets; secrets from .dev.vars
npm run deploy       # build + wrangler deploy
node test/views.test.mjs     # single test; also test/ha-map.test.mjs. Plain node:assert, no framework
```

Stale `workerd` processes can hold ports after a `dev:live` run; use a fresh port and restart wrangler after a rebuild produces new hashed files.

Script tests in `scripts/` are standalone `test-*.py` files run directly with Python.

Kiosk APK: `dashboard/kiosk/build.ps1` (Windows) or `build.sh`. The saved URL is set with `adb shell am start -n com.wesbos.homehq/.MainActivity --es url <url>`.

## Dashboard architecture

- **No framework, no runtime dependencies.** Each module is an IIFE attaching to `window.App` / `window.DATA` / `window.ICONS`. `js/main.js` imports them in a fixed order (icons → data → app → system → slideshow → views → diag → fetch); new modules must slot into that order.
- **Data flow:** `js/data.js` holds `window.DATA` with mock data as the fallback. `js/fetch.js` polls the Worker's `/api/*`, merges results into `window.DATA`, then calls `App.emit('data')`. Views subscribe with `App.on('data', fn)` and repaint only what changed. A failed fetch keeps the last good data, so the page never goes blank.
- **Router:** views call `App.register(name, {show, hide, resume})`. `App.go` toggles `content-visibility` on `<section id="view-X">`; views are built once and never torn down, and hidden views are prebuilt in the background. Adding a view means a `js/views/X.js`, a `css/views/X.css`, a section and a rail button in `index.html`, and a name in `views.js`.
- **Which views show** comes from the Worker's `VIEWS` var (`wrangler.jsonc`) via `/api/config`, parsed by `views.js`. That file is shared by the Worker and the page. `home` is always on; disabled views are never built (`#stage[data-off]` CSS hook). `?demo` enables demo tools.
- **Worker (`worker.js`)** is a dependency-free proxy: weather (Open-Meteo), calendar (Google service account, JWT signed with `crypto.subtle`), shopping (Bring!, GET + POST), home (Home Assistant, mapping in `ha-map.js`), transit (BVG transport.rest), photos (Unsplash). Everything else is static assets from `dist/`. Writes need an `X-Dash-Token` header matching `DASH_TOKEN` (baked in at build time as `VITE_DASH_TOKEN`). Secrets are listed at the bottom of `wrangler.jsonc`; setup is in `dashboard/SETUP.md`.
- **Stage:** fixed 1280×800 design, scaled with a CSS transform. Left rail 76px, content 1156×752. Design tokens are in `css/tokens.css`, icons in `js/icons.js` via `App.icon()`.
- The people are Fauzan (`alex`, `CAL_ALEX`) and Amanda (`jordan`, `CAL_JORDAN`). Location is Berlin (BVG, `Europe/Berlin`).

## Frame constraints (Android 6, WebView 106, A33, ~1 GB RAM)

[docs/building-for-the-frame.md](docs/building-for-the-frame.md) is the source of truth. The `frame-compat-reviewer` agent checks changes against it; run it after dashboard or Worker edits. The rules that bite most:

- Keep `vite.config.js` at `target: 'chrome106'`, `cssTarget: 'chrome61'`. The frame rejects 4- and 8-digit hex colours, so use `rgba()`.
- Not supported: `oklch`/`color-mix`, native CSS nesting, `:has()`, `dvh`, `toSorted`/`Object.groupBy`/newer JS APIs (the bundler doesn't polyfill them), `alert`/`confirm`/`prompt`, `target="_blank"`.
- No third-party CDNs from the page: Android 6 lacks the Let's Encrypt root. `*.workers.dev` works. Proxy images and other assets through the Worker. API keys stay in the Worker.
- No infinite animations (SMIL or CSS loops keep 1–2 cores busy). Cache `Intl.DateTimeFormat`, update the clock once a minute, and avoid `innerHTML` rebuilds on every tick.
- The page must survive alone: Wi-Fi comes up after the page loads, so retry with backoff and show stale data with its age. Never design a two-finger hold gesture; it opens the kiosk menu.
- Test on the frame with `adb -d reverse tcp:5173 tcp:5173`, then launch the kiosk with `--ez debug true` and open `chrome://inspect`.

## Contributions

Device findings go in `docs/<device>.md` and a row in `docs/devices.md`, with observations kept separate from guesses. PRs to upstream follow `.github/pull_request_template.md` (privacy and safety checklist). Show the owner the diff before opening one, since it is published under their account.
