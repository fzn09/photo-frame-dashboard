# Architecture

## What this repo is

Two things in one repository:

1. **A research and tooling archive for taking over cheap Android photo frames**: identifying the board, getting ADB, backing up flash, rooting, removing the vendor app, and running our own launcher. Notes live in `docs/`, helper tooling in `scripts/`.
2. **The family dashboard those frames end up running**: a vanilla-JS web app (`dashboard/`) plus a small Android WebView kiosk app (`dashboard/kiosk/`) that shows it full screen.

The README is the entry point (device picker, rules for agents, phase map). This file explains how the pieces fit together.

```
README.md              ← entry point: which frame do you have, agent rules, phase map
ARCHITECTURE.md        ← this file
docs/                  ← per-device notes, research logs, guides (markdown + images)
scripts/               ← flashing, rooting, boot-patch and on-device helper tooling
dashboard/             ← the web app and the kiosk APK that displays it
.agents/skills/        ← agent skill for triaging contributions (issues / PRs)
.github/               ← issue templates (new device, PF1007L report), PR template
frames/ backups/ diagnostics/ log/   ← private, git-ignored, never committed
```

---

## The phased workflow

Everything in `docs/` and `scripts/` maps onto the README's phase map:

| Phase | Goal | Mostly lives in |
|---|---|---|
| 1. Identify | USB IDs, `getprop`, chip query | `docs/hardware-research.md`, per-device docs |
| 2. Get ADB | USB, then network, then a vendor-app trick or boot patch | `docs/app-analysis.md`, `docs/pf1007l-*`, `scripts/a33-*`, `scripts/pf1007l-boot/` |
| 3. Loader mode | Rockchip/Allwinner low-level modes | `docs/loader-research.md`, `scripts/*reader*.py`, `scripts/rkdeveloptool-rd6.patch`, `scripts/zc002-fel/` |
| 4. Back up | Verified full-flash capture | `scripts/backup-flash.py`, `inspect-backup.py`, `extract-partitions.py` |
| 5. Root | Shipped `su`, debug ramdisk, boot patch | `docs/debug-ramdisk-research.md`, `scripts/build-debug-boot.py`, `scripts/a133/` |
| 6. Make it useful | Launcher, WebView, kiosk, dashboard | `docs/android-launcher.md`, `docs/biuframe*.md`, `dashboard/` |
| 7. Networking | USB tethering, Wi-Fi dongles, network gates | `docs/usb-internet-sharing.md`, `docs/usb-wifi-dongle.md`, `scripts/build-usb-wifi.sh`, `scripts/share-internet.sh` |
| 8. Vendor updates | Stop auto-installing APKs / FOTA | `docs/app-updates.md` |
| 9. Hand-off | Tell the owner what they now have | `docs/biuframe-setup-guide.md` |

Cross-cutting rules (ask before every write, verified backup first, stop at the first mismatch, keep dumps private) are in the README and apply to every script.

---

## `docs/` — device knowledge

- **`devices.md`** is the index: one row per frame, its SoC/Android version, whether ADB works out of the box, root route, and where to start.
- **One file per device or board family** (e.g. `pf1007l-*`, `biuframe*.md`, `skylight-d156.md`, `allwinner-a133-*.md`, `frameo-*.md`). These are records of units owners tested, not universal guides. Observations are kept separate from guesses.
- **PF1007L (Allwinner A33)** has the deepest set: `pf1007l-start-here.md` is the hub, with dated per-host (Windows/macOS/Linux) reports beside it and `docs/patches/` holding the U-Boot patches they reference.
- **Research notes**: `research-log.md`, `boot-analysis.md`, `recovery-analysis.md`, `ram-boot-research.md`, `debug-ramdisk-research.md`, Wi-Fi investigations (`live-diagnostics.md`, `native-wifi-root-tests.md`, …).
- **`community-builds.md`** + `images/community/`: what other people built on their frames.
- **`frame-records.md`**: format for the private per-frame record kept in the git-ignored `frames/` folder.
- **`images/`**: device photos (`images/devices/`, keyed by ASIN) and community photos.

New hardware means a new `docs/<device>.md` plus a row in `devices.md`.

---

## `scripts/` — tooling

Grouped by what they do rather than by device; most are Python or shell and are run by hand under the owner's approval.

| Group | Contents |
|---|---|
| **Rockchip flow** (Skylight, BIUFRAME) | `patch-usb-reader.py`, `load-usb-reader.py`, `probe-reader.py`, `backup-flash.py`, `inspect-backup.py`, `extract-partitions.py`, `build-debug-boot.py`, `raw-fastboot-boot.py`, `rkdeveloptool-rd6.patch`, `biuframe-setup.sh` (`check` / `backup` / `apply`) |
| **Allwinner A33** (PF1007L) | `a33-sdboot/` (SD-card boot / sector writes, Docker build), `a33-uboot/` (mainline U-Boot patch, eMMC and recovery helpers for macOS/Windows), `pf1007l-boot/` (on-device boot hooks and installer), `aimor-network-adb/` (local server that answers the vendor app's shell channel) |
| **Allwinner A133** | `a133/` (Android 10 super-image build, sparse/ext4/LP helpers, fastboot flashing, kiosk defaults templates) |
| **ZC002 / other FEL work** | `zc002-fel/` (FEL read, root preparation, SPL reader, with tests) |
| **Wi-Fi / networking** | `build-usb-wifi.sh`, `usb-wifi.Dockerfile`, `build-wifi-boot.py`, `build-static-iw.py`, `skylight-wifi-*`, `share-internet.sh`, `test-usb-*-on-device.sh` |
| **Kiosk support on the frame** | `kioskwatch/` (watchdog), `home-button/` (floating Back/Dashboard overlay APK), `si006-webview-overlay/` (WebView overlay APK for the SI006), `set-kiosk-url.sh` |
| **Tests** | `test-*.py` beside the script they cover; run them directly (no framework) |

Each subfolder with its own `README.md` documents itself. Scripts that write to a device refuse to proceed without the identity checks the docs describe.

---

## `dashboard/` — the app the frame runs

A **family smart-home dashboard**: a touch-friendly web app for a wall-mounted frame/tablet (about 1280×800, old Android WebView, Chrome 106 target). Pure vanilla JS, no runtime npm packages, Vite for dev/build, Cloudflare Worker + static assets for deploy.

### Tech stack

| Layer | Choice |
|---|---|
| Runtime | Vanilla JS (IIFE pattern attaching to `window.App`, plus ES module imports from `main.js`) |
| Bundler | Vite (build target matches the frame's WebView) |
| Deploy | Cloudflare Worker serving `dist/` via `wrangler` (`npm run deploy`) |
| CSS | Design tokens (`tokens.css`) + per-view stylesheets |
| Icons | Inline SVG registry in `icons.js`, `App.icon()` helper |
| Data | Mock data in `data.js` is the fallback; live data from the Worker's `/api/*` endpoints is merged over it |
| Worker | `worker.js`, no dependencies; secrets via `wrangler secret put` |

### Layout

```
dashboard/
├── index.html          ← shell: nav rail + one <section> per view
├── worker.js           ← Cloudflare Worker: /api/* proxy, everything else is static assets
├── ha-map.js           ← pure Home Assistant ↔ dashboard shape mapping (used by the Worker)
├── SETUP.md            ← one-time live-data setup (weather, BVG, Google Calendar, Bring!, HA)
├── test/ha-map.test.mjs← check for ha-map.js
├── vite.config.js, wrangler.jsonc, package.json
├── js/
│   ├── main.js         ← import order (modules attach to window.App)
│   ├── app.js          ← router, clock, idle, toasts, sheets, shared helpers
│   ├── data.js         ← window.DATA, mock data (events, chores, weather, devices…)
│   ├── icons.js        ← window.ICONS
│   ├── system.js       ← system-level logic
│   ├── slideshow.js    ← ambient/slideshow mode
│   ├── diag.js         ← diagnostics / demo controls
│   ├── fetch.js        ← polls /api/*, merges into window.DATA, fires App.emit('data')
│   └── views/          ← home, calendar, tasks, shopping, photos, control, agents, ambient
├── css/                ← tokens.css, base.css, views/*.css
├── public/             ← PWA manifest and icons
└── kiosk/              ← Android WebView kiosk app (see below)
```

### Live data

`worker.js` routes:

| Route | Source | Notes |
|---|---|---|
| `GET /api/weather` | Open-Meteo (no key) | lat/lon/timezone from `wrangler.jsonc` vars; 503 if unset |
| `GET /api/calendar` | Google Calendar | service account (`GOOGLE_SERVICE_EMAIL`, `GOOGLE_SERVICE_KEY`), one calendar ID secret per person |
| `GET/POST /api/shopping` | Bring! | `BRING_EMAIL`/`BRING_PASSWORD`; POST ops `add` / `done` / `remove` |
| `GET/POST /api/home` | Home Assistant | optional `HA_URL`/`HA_TOKEN`; mapping in `ha-map.js` |
| `GET /api/transit` | BVG transport.rest (no key) | stop from `BVG_STOP_ID` / `BVG_STOP_NAME` |
| `GET /api/config` | `VIEWS` var | which views the frame shows; parsed by `views.js` |

Writes require an `X-Dash-Token` header matching the `DASH_TOKEN` secret (the same value is baked into the page as `VITE_DASH_TOKEN`, so it only stops casual abuse); with no `DASH_TOKEN` set, writes return 503. `fetch.js` keeps the mock data on any fetch failure, so the dashboard still works with none of this configured. `npm run dev:live` runs the Worker locally via `wrangler dev`.

### Router

Views register with `App.register(name, view)` onto `window.App.views`. `App.go(name)` toggles `content-visibility` on the `<section>`s, so there is **no DOM teardown**: views are built once and kept alive, and hidden views are pre-built in the background so tab switches are instant. Data changes propagate through `App.emit('data')`.

Which views exist on the frame is `D.views` (default in `js/data.js`, overridden by the Worker's `VIEWS` var via `/api/config`, cached in localStorage). `App.enabled(name)` / `App.setViews(list)` in `js/app.js`: a hidden view is never built, its rail button and Today card are hidden (`#stage[data-off]` CSS hook), and `App.go` falls back to Today. Demo tools (clock long-press panel, keyboard shortcuts) need `?demo`. See `dashboard/SETUP.md` section 12.

### `dashboard/kiosk/` — the Android shell

A small full-screen WebView app (package `com.wesbos.homehq`), built **without Gradle** by `build.sh` / `build.ps1` (aapt/javac/d8-style steps). `MainActivity.java` holds `DEFAULT_URL` (change it to your deployment) and the two-finger long-press menu (launcher, Android settings, reload). `NavigationService.java` is an accessibility service providing Back/Dashboard actions on frames with no system navigation; `test-navigation.py` exercises it over ADB. See `dashboard/kiosk/README.md`.

### End-to-end picture

```
 Cloudflare Worker  ──serves──▶  dashboard (Vite build)  ──loaded by──▶  kiosk APK (WebView)
 (static assets +                                                          on a rooted/unlocked frame
  optional live-data proxy)                                                (launcher set via docs/ + scripts/)
```

The research half of the repo gets a frame to the point where the right-hand box can run; the dashboard half is what runs there.

---

## Contribution flow

- Findings go back as PRs to `docs/<device>.md` and `docs/devices.md`; issue templates in `.github/ISSUE_TEMPLATE/` cover new devices and PF1007L reports.
- `.agents/skills/triage-contributions/` is the agent skill for reviewing incoming issues and PRs (review checklist, comment templates, decision records, snapshot/check scripts).
- Private data (serials, MACs, Wi-Fi details, dumps, vendor APKs) never gets committed; see README → Privacy and `.gitignore`.

---

## How to modify

| Task | Where |
|---|---|
| Document a new frame | `docs/<device>.md` + row in `docs/devices.md` |
| Add or fix a flashing/rooting helper | `scripts/<group>/`, with a `test-*` beside it if it has logic |
| Change dashboard data (mock) | `dashboard/js/data.js` |
| Change a screen | `dashboard/js/views/<name>.js` + `dashboard/css/views/<name>.css` |
| Add a view | New file in `js/views/`, register it, add `<section id="view-X">` and a nav button |
| Design tokens / icons / shared helpers | `css/tokens.css` / `js/icons.js` / `js/app.js` |
| Rebuild the kiosk APK | `dashboard/kiosk/build.sh` or `build.ps1` |
| Run the dashboard locally | `npm run dev` in `dashboard/` |
| Deploy | `npm run deploy` in `dashboard/` |
