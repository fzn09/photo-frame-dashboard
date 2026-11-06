# Architecture

How the pieces of this repository fit together. For what to do, start elsewhere: the [README](README.md) covers
choosing your frame and the rules, and [dashboard/SETUP.md](dashboard/SETUP.md) covers connecting live data.

**Contents**

- [1. Overview](#1-overview)
- [2. Frame takeover](#2-frame-takeover)
  - [The phased workflow](#the-phased-workflow)
  - [`docs/`: device knowledge](#docs-device-knowledge)
  - [`scripts/`: tooling](#scripts-tooling)
- [3. The dashboard](#3-the-dashboard)
  - [Tech stack](#tech-stack)
  - [File layout](#file-layout)
  - [Request flow](#request-flow)
  - [Access gate](#access-gate)
  - [Worker routes](#worker-routes)
  - [Data flow in the page](#data-flow-in-the-page)
  - [Router and views](#router-and-views)
  - [Theme and stage](#theme-and-stage)
  - [Cookidoo meals](#cookidoo-meals)
  - [Frame constraints](#frame-constraints)
  - [Tests](#tests)
- [4. The kiosk app](#4-the-kiosk-app)
- [5. Contributing](#5-contributing)
- [6. How to modify](#6-how-to-modify)

---

## 1. Overview

The repository holds two things:

1. **A research and tooling archive for taking over cheap Android photo frames:** identifying the board, getting ADB,
   backing up flash, rooting, removing the vendor app and running our own launcher. Notes live in `docs/`, tooling
   in `scripts/`.
2. **The family dashboard those frames end up running:** a vanilla-JS web app served by a Cloudflare Worker
   (`dashboard/`), plus a small Android WebView kiosk app that shows it full screen (`dashboard/kiosk/`).

```text
 Cloudflare Worker  ──serves──▶  dashboard (Vite build)  ──loaded by──▶  kiosk APK (WebView)
 (gate, /api proxy,                                                       on a rooted or unlocked frame
  static assets)                                                          (set up via docs/ + scripts/)
```

The research half gets a frame to the point where the right-hand box can run. The dashboard half is what runs there.

```text
README.md              ← entry point: which frame, the dashboard, agent rules, phase map
ARCHITECTURE.md        ← this file
PRODUCT.md             ← who the dashboard is for and the product constraints
docs/                  ← per-device notes, research logs, guides (markdown + images)
scripts/               ← flashing, rooting, boot-patch and on-device helper tooling
dashboard/             ← the web app, the Worker and the kiosk APK
.agents/skills/        ← agent skill for triaging contributions (issues / PRs)
.github/               ← issue templates (new device, PF1007L report), PR template
frames/ backups/ diagnostics/ log/   ← private, git-ignored, never committed
```

---

## 2. Frame takeover

### The phased workflow

Everything in `docs/` and `scripts/` maps onto the README's [phase map](README.md#phase-map):

| Phase | Goal | Mostly lives in |
|---|---|---|
| 1. Identify | USB IDs, `getprop`, chip query | `docs/hardware-research.md`, per-device docs |
| 2. Get ADB | USB, then network, then a vendor-app trick or boot patch | `docs/app-analysis.md`, `docs/pf1007l-*`, `scripts/a33-*`, `scripts/pf1007l-boot/` |
| 3. Loader mode | Rockchip/Allwinner low-level modes | `docs/loader-research.md`, `scripts/*reader*.py`, `scripts/rkdeveloptool-rd6.patch`, `scripts/zc002-fel/` |
| 4. Back up | Verified full-flash capture | `scripts/backup-flash.py`, `inspect-backup.py`, `extract-partitions.py` |
| 5. Root | Shipped `su`, debug ramdisk, boot patch | `docs/debug-ramdisk-research.md`, `scripts/build-debug-boot.py`, `scripts/a133/` |
| 6. Make it useful | Launcher, WebView, kiosk, dashboard | `docs/android-launcher.md`, `docs/biuframe*.md`, `dashboard/` |
| 7. Networking | USB tethering, Wi-Fi dongles, network gates | `docs/usb-internet-sharing.md`, `docs/usb-wifi-dongle.md`, `scripts/build-usb-wifi.sh`, `scripts/share-internet.sh` |
| 8. Vendor updates | Stop auto-installing APKs and FOTA | `docs/app-updates.md` |
| 9. Hand-off | Tell the owner what they now have | `docs/biuframe-setup-guide.md` |

The [rules](README.md#rules-we-learned-the-hard-way) (ask before every write, verified backup first, stop at the first
mismatch, keep dumps private) apply to every script.

### `docs/`: device knowledge

- **`devices.md`** is the index: one row per frame, with its SoC and Android version, whether ADB works out of the box,
  its root route and where to start.
- **One file per device or board family** (e.g. `pf1007l-*`, `biuframe*.md`, `skylight-d156.md`,
  `allwinner-a133-*.md`, `frameo-*.md`). These record units their owners tested and are not universal guides.
  Observations are kept separate from guesses.
- **PF1007L (Allwinner A33)** has the deepest set: `pf1007l-start-here.md` is the hub, with dated per-host reports
  beside it and `docs/patches/` holding the U-Boot patches they reference.
- **Research notes:** `research-log.md`, `boot-analysis.md`, `recovery-analysis.md`, `ram-boot-research.md`,
  `debug-ramdisk-research.md` and the Wi-Fi investigations (`live-diagnostics.md`, `native-wifi-root-tests.md`, …).
- **`building-for-the-frame.md`** is the source of truth for what the frame's browser can run.
- **`community-builds.md`** and `images/community/`: what other people built on their frames.
- **`frame-records.md`:** the format for the private per-frame record kept in the git-ignored `frames/` folder.
- **`images/`:** device photos (`images/devices/`, keyed by ASIN) and community photos.

New hardware means a new `docs/<device>.md` and a row in `devices.md`.

### `scripts/`: tooling

Grouped by what they do rather than by device. Most are Python or shell, run by hand with the owner's approval.

| Group | Contents |
|---|---|
| **Rockchip flow** (Skylight, BIUFRAME) | `patch-usb-reader.py`, `load-usb-reader.py`, `probe-reader.py`, `backup-flash.py`, `inspect-backup.py`, `extract-partitions.py`, `build-debug-boot.py`, `raw-fastboot-boot.py`, `rkdeveloptool-rd6.patch`, `biuframe-setup.sh` (`check` / `backup` / `apply`) |
| **Allwinner A33** (PF1007L) | `a33-sdboot/` (SD-card boot and sector writes, Docker build), `a33-uboot/` (mainline U-Boot patch, eMMC and recovery helpers for macOS and Windows), `pf1007l-boot/` (on-device boot hooks and installer), `aimor-network-adb/` (local server that answers the vendor app's shell channel) |
| **Allwinner A133** | `a133/` (Android 10 super-image build, sparse/ext4/LP helpers, fastboot flashing, kiosk defaults templates) |
| **ZC002 / other FEL work** | `zc002-fel/` (FEL read, root preparation, SPL reader, with tests) |
| **Wi-Fi / networking** | `build-usb-wifi.sh`, `usb-wifi.Dockerfile`, `build-wifi-boot.py`, `build-static-iw.py`, `skylight-wifi-*`, `share-internet.sh`, `test-usb-*-on-device.sh` |
| **Kiosk support on the frame** | `kioskwatch/` (watchdog), `home-button/` (floating Back/Dashboard overlay APK), `si006-webview-overlay/` (WebView overlay APK for the SI006), `set-kiosk-url.sh` |
| **Dashboard support** | `cookidoo-refresh-token.py` (prints the token you seed into KV, see [Cookidoo meals](dashboard/SETUP.md#cookidoo-meals)) |
| **Tests** | `test-*.py` beside the script they cover; run them directly, no framework |

Each subfolder with its own `README.md` documents itself. Scripts that write to a device refuse to proceed without the
identity checks the docs describe.

---

## 3. The dashboard

A touch-friendly family dashboard for a wall-mounted frame: today at a glance, plus calendar, chores, shopping, fridge,
meals, kitchen tools and photos. See [PRODUCT.md](PRODUCT.md) for who it serves.

### Tech stack

| Layer | Choice |
|---|---|
| Runtime | Vanilla JS, no runtime packages. Each module is an IIFE attaching to `window.App`, `window.DATA` or `window.ICONS` |
| Bundler | Vite, targeting Chrome 106 for JS and Chrome 61 for CSS |
| Server | One Cloudflare Worker with no dependencies: gate, `/api/*` proxy and static assets |
| Storage | Workers KV for the Cookidoo token pair and the REWE fridge feed; everything else lives in its upstream service |
| CSS | Design tokens (`tokens.css`), `base.css` and one stylesheet per view |
| Icons | Inline SVG registry in `icons.js`, drawn with `App.icon()` |
| Secrets | `wrangler secret put` in production, `.dev.vars` locally |

### File layout

```text
dashboard/
├── index.html          ← shell: nav rail + one <section> per view
├── worker.js           ← Worker: access gate, /api/* routes, static assets
├── cookidoo.js         ← Worker module: Cookidoo token refresh, week, recipes, image proxy
├── views.js            ← which views exist; shared by the Worker and the page
├── calc.js             ← pure helpers: calculator, conversions, fridge shelf-life estimates
├── rewe-map.js         ← pure helpers: REWE job payload to stored items, used-up flags
├── SETUP.md            ← live-data setup, configuration and API reference
├── vite.config.js, wrangler.jsonc, package.json
├── js/
│   ├── main.js         ← import order (modules attach to window.App)
│   ├── icons.js        ← window.ICONS
│   ├── data.js         ← window.DATA: sample data, the fallback for every feed
│   ├── app.js          ← router, clock, theme, idle, toasts, sheets, shared helpers
│   ├── system.js       ← alerts and the hidden demo drawer
│   ├── slideshow.js    ← slideshow used by Photos, ambient mode and the Today tile
│   ├── views/          ← home, calendar, tasks, shopping, fridge, meals, kitchen, photos, ambient
│   ├── diag.js         ← on-device diagnostics overlay (?diag)
│   └── fetch.js        ← polls /api/*, merges into window.DATA, fires App.emit('data')
├── css/                ← tokens.css, base.css, views/*.css
├── public/             ← fonts, PWA manifest and icons
├── test/               ← plain node:assert checks
└── kiosk/              ← Android WebView kiosk app
```

`js/main.js` imports modules in this order, and new modules must slot into it: icons → data → app → system → slideshow
→ views → diag → fetch.

### Request flow

```text
 Frame (WebView)                 Cloudflare Worker                     Upstream
 ───────────────                 ─────────────────                     ────────
 page + assets   ──── cookie ──▶ gate ──▶ dist/ assets
 fetch.js polls  ──── cookie ──▶ gate ──▶ /api/* handlers ──────────▶  Open-Meteo, Google Calendar,
 writes (POST)   ── + token ───▶ gate ──▶ write guard ──▶ handlers ──▶ Bring!, BVG, TickTick,
 images          ──── cookie ──▶ gate ──▶ /api/meals/img ───────────▶  Unsplash, Cookidoo

 REWE job (EC2)  ──── bearer ──────────▶ POST /api/ingest ──────────▶  KV (read by GET /api/fridge)
```

API keys stay in the Worker. The frame only talks to the Worker, because Android 6 lacks the Let's Encrypt root and
third-party hosts can fail there.

### Access gate

The Worker runs before every asset (`run_worker_first`), so the gate covers the page as well as the API:

- Without the `DASH_TOKEN` secret, everything answers 503.
- `/?key=<DASH_TOKEN>` sets the `hq` cookie for a year. Without the cookie, requests answer 401.
- The manifest and icons are public, because browsers fetch them without cookies.
- `POST /api/ingest` skips the gate, because the REWE job has no cookie. Its bearer check on `INGEST_KEY` is the only
  control on that route.
- `POST` calls also need `X-Dash-Token` to match. The page carries that value (`VITE_DASH_TOKEN`), so gating only
  `/api` would protect nothing.
- Responses send no CORS headers, so other sites can't read the family's data.

`npm run dev` runs Vite alone, with no gate and no Worker, on sample data. `npm run dev:live` runs the real Worker over
`dist/`, reading secrets from `.dev.vars`.

### Worker routes

The full table, with poll intervals, is in [SETUP.md](dashboard/SETUP.md#api-routes).

| Area | Routes | Handled in |
|---|---|---|
| Config | `/api/config` | `worker.js`, using `views.js` |
| Read-only feeds | `/api/weather`, `/api/calendar`, `/api/transit`, `/api/photos` | `worker.js` |
| Read and write | `/api/shopping`, `/api/fridge`, `/api/chores` | `worker.js` |
| Job push | `/api/ingest` | `worker.js`, using `rewe-map.js` |
| Meals | `/api/meals`, `/api/meals/recipe`, `/api/meals/img` | `cookidoo.js` |

A handler answers 503 when its credentials are missing, and a thrown error becomes a generic 502 with details in the
Worker logs (`wrangler tail`).

### Data flow in the page

1. `js/data.js` fills `window.DATA` with sample data, so every view can paint offline.
2. `js/fetch.js` polls each `/api/*` route, merges results into `window.DATA`, then calls `App.emit('data')`.
3. Views subscribe with `App.on('data', fn)`. Some feeds emit their own event too (`shopping`, `fridge`, `chores`,
   `meals`), so a view can repaint only when it is on screen.

Failure handling is the same everywhere:

- A failed poll keeps the last good data, so the page never goes blank.
- Retries run at 5 s, 15 s and 1 min, because Wi-Fi comes up after the page loads. After that, polling returns to its
  normal interval.
- A 503 means the feed is not configured: sample data is intended, and polling stops. The fridge feed keeps polling,
  because its 503 means the first job run has not happened yet.
- Cards show their age when a feed is overdue, and the rail shows **Sample data** or **Updated N min ago**.

Writes go through `post()` in `fetch.js`: the page updates first, a failed write shows a toast, and a refresh follows.

### Router and views

Views call `App.register(name, { show, hide, resume })`. `App.go(name)` toggles `content-visibility` on
`<section id="view-X">`. Views are built lazily and never torn down, and stale views rebuild when selected.

Which views exist comes from `D.views` (default in `js/data.js`), overridden by the Worker's `VIEWS` var through
`/api/config` and cached in localStorage. `views.js` parses that list for both the Worker and the page, and keeps the
rail order. `home` is always on. A disabled view is never built, its rail button and Today card hide (`#stage[data-off]`
CSS hook), and `App.go` falls back to Today.

| View | File | Data |
|---|---|---|
| Today | `home.js` | Everything: the glanceable overview, never scrolls |
| Calendar | `calendar.js` | Events, plus meals with the all-day items |
| Chores | `tasks.js` | TickTick |
| Shopping | `shopping.js` | Bring! |
| Fridge | `fridge.js` | REWE eBon items from KV, pushed by the job ([guide](dashboard/PLAN-rewe-fridge.md)) |
| Meals | `meals.js` | Cookidoo; also owns the shared recipe sheet |
| Kitchen | `kitchen.js` | None, works offline; its timers keep running on other views |
| Photos | `photos.js` | Unsplash and live cams |
| Ambient, Night | `ambient.js` | Idle overlays: slideshow by day, dim clock at night |

Demo tools (clock long-press panel, keyboard shortcuts) need `?demo`. The diagnostics overlay needs `?diag`.

### Theme and stage

- **Stage:** a fixed 1280×800 design, scaled with a CSS transform. Left rail 76 px, content 1156×752.
- **Theme:** `App.applyTheme()` sets `html[data-theme]`. Silver & Walnut runs by day and Walnut Evening from sunset to
  07:00, using the sunset from the weather feed. `?theme=midnight` pins the optional all-dark palette.
- **Colour:** the same tokens in every palette. Orange is the only accent and means time-critical.
- **Type:** Instrument Serif for display, Archivo for data, with nothing below 16 px.

### Cookidoo meals

Cookidoo has no public API. `cookidoo.js` ports the calls from the unofficial
[miaucl/cookidoo-api](https://github.com/miaucl/cookidoo-api), read-only.

```text
 scripts/cookidoo-refresh-token.py ──(run once on your PC)──▶ KV: {refresh}
                                                                 │
 /api/meals ──▶ cookidooToken() ──refresh when expired──▶ KV: {access, exp, refresh}
      │
      ├─ my-week (path discovered from the planning home document)
      ├─ created-recipes/<lang>/<id> for each of your own recipes
      └─ customer-devices/api/my-devices/versions
```

- **Tokens:** the Worker refreshes the OAuth token and stores the rotated pair in KV. It never sees your password.
- **Week:** the response lists days that have recipes, so the page builds Monday to Sunday itself and fills them in.
- **Own recipes:** the week returns ids only. The Worker resolves each title, and a failed lookup shows "Your recipe".
- **Recipes:** `/api/meals/recipe` is fetched on demand, cached in the page, and retried twice. Step text arrives as
  HTML, so the Worker strips tags and splits out the Thermomix settings wrapped in `<nobr>`.
- **Images:** the frame can't reach the image CDN, so `/api/meals/img` proxies them, for that host only.
- **Not available:** live Thermomix state has no endpoint, and the plan has no meal slot or time. See
  [SETUP.md](dashboard/SETUP.md#cookidoo-meals).

`App.mealsOn(day)` gives Today and Calendar the same data, and `App.recipeSheet(id)` opens the same sheet from anywhere.

### Frame constraints

The target is Android 6 with WebView 106 on an A33 with about 1 GB of RAM.
[docs/building-for-the-frame.md](docs/building-for-the-frame.md) is the source of truth, and the
`frame-compat-reviewer` agent checks changes against it. The rules that bite most:

- Keep `target: 'chrome106'` and `cssTarget: 'chrome61'` in `vite.config.js`. The frame rejects 4- and 8-digit hex
  colours, so use `rgba()`.
- Not supported: `oklch`, `color-mix`, native CSS nesting, `:has()`, `dvh`, newer JS APIs such as `toSorted` (the
  bundler doesn't polyfill them), `alert`/`confirm`/`prompt`, `target="_blank"`.
- No third-party hosts from the page, no infinite animations, and no two-finger hold gesture.
- The page must survive alone: retry with backoff and show stale data with its age.

### Tests

Run from `dashboard/` with `node test/<name>.test.mjs`. They use plain `node:assert` and mocked network.

| Test | Covers |
|---|---|
| `views.test.mjs` | Parsing the `VIEWS` list |
| `gate.test.mjs` | The access gate, including the ingest exception |
| `cookidoo.test.mjs` | Token refresh, week and recipe mapping, routes, image proxy |
| `calc.test.mjs` | Calculator, conversions, fridge estimates |
| `rewe-map.test.mjs` | Job payload mapping, stable ids, caps, bad types |
| `ingest.test.mjs` | Ingest auth and limits, ok and error runs, used-up flags, pruning |
| `type-floor.test.mjs` | No text under the 16 px floor |

---

## 4. The kiosk app

A small full-screen WebView app (package `com.wesbos.homehq`), built without Gradle by `dashboard/kiosk/build.sh` or
`build.ps1`.

- `MainActivity.java` holds `DEFAULT_URL` and the two-finger long-press menu (launcher, Android settings, Wi-Fi, reload).
  Save your own URL with `--es url`, so you don't need to rebuild.
- `NavigationService.java` is an accessibility service providing Back and Dashboard actions on frames with no system
  navigation. `test-navigation.py` exercises it over ADB.

See the [kiosk guide](dashboard/kiosk/README.md).

---

## 5. Contributing

- Findings go back as PRs to `docs/<device>.md` and `docs/devices.md`. Issue templates in `.github/ISSUE_TEMPLATE/`
  cover new devices and PF1007L reports.
- `.agents/skills/triage-contributions/` is the agent skill for reviewing incoming issues and PRs.
- Private data (serials, MACs, Wi-Fi details, dumps, vendor APKs) never gets committed. See
  [Privacy](README.md#privacy) and `.gitignore`.

---

## 6. How to modify

| Task | Where |
|---|---|
| Document a new frame | `docs/<device>.md` and a row in `docs/devices.md` |
| Add or fix a flashing or rooting helper | `scripts/<group>/`, with a `test-*` beside it if it has logic |
| Change sample data | `dashboard/js/data.js` |
| Change a screen | `dashboard/js/views/<name>.js` and `dashboard/css/views/<name>.css` |
| Add a view | `js/views/X.js`, `css/views/X.css`, a section, a rail button and a stylesheet link in `index.html`, the import in `main.js`, and the name in `views.js`, `data.js` and `system.js` |
| Add a feed | A handler and route in `worker.js`, a `poll()` in `fetch.js`, sample data in `data.js`, and a section in `SETUP.md` |
| Design tokens, icons, shared helpers | `css/tokens.css`, `js/icons.js`, `js/app.js` |
| Rebuild the kiosk APK | `dashboard/kiosk/build.sh` or `build.ps1` |
| Run the dashboard locally | `npm run dev` in `dashboard/` (sample data), or `npm run dev:live` (real Worker, after `npm run build`) |
| Deploy | `npm run deploy` in `dashboard/` |
