# Architecture

## What it is
A **family smart-home dashboard** — a touch-friendly web app designed to run fullscreen on a wall-mounted photo frame/tablet (1280×800, Android WebView 106). No framework, pure vanilla JS, plus one small Cloudflare Worker (`worker.js`) that proxies live data (weather, Google Calendar, Bring!, BVG, Home Assistant) and writes back (Bring!, Home Assistant). Mock data in `data.js` is the fallback when an endpoint isn't configured.

---

## Tech Stack

| Layer | Choice |
|---|---|
| **Runtime** | Vanilla JS (ES5/IIFE pattern for compatibility + ES modules for imports) |
| **Bundler** | **Vite** — dev server + production build |
| **Deploy** | **Cloudflare Worker + static assets** via `wrangler` (`npm run deploy`); setup in `dashboard/SETUP.md` |
| **Fonts** | Google Fonts (Archivo + Instrument Serif) |
| **CSS** | Custom design tokens (`tokens.css`) + per-view stylesheets |
| **Icons** | Inline SVG via `icons.js` + `App.icon()` helper |
| **No runtime deps** | Zero npm packages at runtime — only Vite + Wrangler as devDeps |

---

## Structure

```
dashboard/
├── index.html          ← shell: nav rail + empty <section> per view
├── js/
│   ├── main.js         ← import order (modules attach to window.App)
│   ├── data.js         ← window.DATA — all mock data (events, chores, weather, devices…)
│   ├── app.js          ← core shell: router, clock, idle, toasts, sheets, helpers
│   ├── icons.js        ← window.ICONS SVG path registry
│   ├── system.js       ← system-level logic
│   ├── slideshow.js    ← slideshow/ambient mode
│   ├── diag.js         ← diagnostics / demo controls
│   └── views/          ← one file per screen
│       ├── home.js     ← Today summary
│       ├── calendar.js
│       ├── tasks.js    ← Chores
│       ├── shopping.js
│       ├── photos.js
│       ├── control.js  ← Home automation (lights, locks, climate)
│       ├── agents.js   ← AI agent usage meters
│       └── ambient.js  ← screensaver mode
├── css/
│   ├── tokens.css      ← CSS custom properties (colors, spacing, etc.)
│   ├── base.css        ← global styles, layout, components
│   └── views/*.css     ← per-view styles
└── kiosk/              ← Android kiosk APK wrapper (builds a WebView APK)
```

---

## How the Router Works

Views are registered with `App.register(name, view)` — each view module attaches itself to `window.App.views`. The router (`App.go(name)`) uses `content-visibility` to show/hide `<section>` elements — **no DOM teardown**, views are built once and kept alive. It pre-builds hidden views in the background at 400ms intervals so tab switches are instant.

---

## How to Modify

| Task | Where |
|---|---|
| **Change data** (people, events, devices) | `js/data.js` — edit `window.DATA` |
| **Modify a screen's UI/behavior** | `js/views/<name>.js` + `css/views/<name>.css` |
| **Add a new view** | New file in `js/views/`, register it, add `<section id="view-X">` in HTML and a nav button in the rail |
| **Change design tokens** (colors, spacing) | `css/tokens.css` |
| **Add a new icon** | `js/icons.js` — add SVG path to `window.ICONS` |
| **Shared helpers** (time, formatting) | `js/app.js` |
| **Run locally** | `npm run dev` in `dashboard/` |
| **Deploy** | `npm run deploy` → Cloudflare Pages |

The build target is intentionally Chrome 106 / CSS chrome61 to match the wall tablet's Android WebView.
