# Spec: shoplister fridge, Home Assistant, Thermomix status (revision 2)

Status: draft. Nothing here is implemented.

## 0. What changed from revision 1

Revision 1 treated the fridge as a Bring! list and put a new bridge on EC2 for Home Assistant. Both were wrong.

| Revision 1 | Revision 2 | Source |
|---|---|---|
| Fridge view keeps its Bring! "Fridge" list and gains links to Shopping | Fridge view shows REWE eBon items from shoplister. Bring! no longer feeds it | Your correction, and the session "Reacarch Shoplister - Fridge Integration" |
| EC2 runs a Home Assistant and Thermomix bridge | EC2 runs shoplister only | Same session |
| Home Assistant is new work | Home Assistant already exists as a Worker proxy on other branches | `origin/live-data-and-view-updates` |

Evidence and limits:

- The shoplister session (started 2026-10-29) ended in a plan waiting at ExitPlanMode. Its plan is not approved and no
  code was written. I read its transcript, not the `fzn09/shoplister` repo. Shoplister facts below come from what that
  session read.
- The Home Assistant facts come from `worker.js`, `ha-map.js` and `SETUP.md` on `origin/live-data-and-view-updates`. The
  repo's own notes say the HA path was tested only through the mapper (`ha-map.test.mjs`), not against a live HA.
- This checkout (`claude/cookidoo-meals-backend`) has neither `ha-map.js` nor the `control` and `agents` views.

## 1. Architecture

```text
 Frame (kiosk WebView, Android 6)
   │  GET /api/fridge                          (cookie gate, as today)
   ▼
 Cloudflare Worker (dashboard)  ── cache 5 min ──┐
   │  GET https://rewe.<domain>/frame/rewe       │  header X-API-Key
   ▼                                             │
 Cloudflare edge ── Cloudflare Tunnel (outbound from EC2) ──▶ EC2 t4g.micro
                                                   uvicorn 127.0.0.1:8000, shoplister, systemd
                                                   SQLite: rewe_bons, rewe_cache
                                                   refresh thread, every 30 min
                                                         ├─ Gmail IMAP: eBon PDFs from ebon@mailing.rewe.de
                                                         └─ Bring! API: Shopping side only (matching_service)

 Home Assistant ◀── Nabu Casa URL or Cloudflare Tunnel ── Worker /api/home   (no EC2)
```

Decisions:

- The frame calls only the Worker. Android 6 lacks the Let's Encrypt root, and an API key in the page is readable.
- Cloudflare Tunnel keeps the instance at zero inbound ports. A named tunnel hostname needs a domain with DNS on
  Cloudflare. A quick tunnel changes URL on every restart and would break a frame that runs all year.
- The new shoplister route reads `rewe_cache` only. It never starts an IMAP fetch or a PDF parse, so a caller cannot load
  the instance.
- Bring! stays in shoplister for the Shopping side. The fridge view stops calling it.

## 2. Feature 1: fridge view from REWE eBon

### Data path

1. shoplister downloads eBon PDFs from Gmail (`ebon@mailing.rewe.de`, attachment `REWE-eBon.pdf`, 30 day lookback).
2. `rewe_pdf_parser.py` reads the 10 latest bons with `pdfplumber` and stops each bon at the `SUMME` line.
3. The result sits in `rewe_cache` as JSON items with `name`, `qty`, `total_price`, `purchase_date`.
4. `GET /frame/rewe` returns `{"items": [...], "updated_at": "..."}`. `database.get_rewe_cache()` must add `updated_at`.
5. The Worker maps it with a pure `rewe-map.js` (cap 200 items) and the frame renders it.

### What the fridge view shows

A receipt lists what you bought. It does not say what is in the fridge. Two facts limit the view:

- Receipts carry no expiry date.
- The parser sets `qty` to 1.0 unless a line like "N Stk x price" follows, so quantities are approximate.

The view is therefore "recent purchases", grouped by purchase date, newest first, in the layout of the shoplister UI
(header with count, total in EUR and "updated N min ago", rows with recency tint). Proposed additions, each needing your
decision:

| Addition | Where it lives | Cost |
|---|---|---|
| "Used up" flag per item, hides the row | New SQLite table in shoplister, `POST /frame/rewe/used` through the Worker | One write route, guarded by `X-Dash-Token` and the API key |
| Estimated use-by from category | Page only, using `App.categorize()` and a table of days | A guess. Label it "est." and never show it as a date from the receipt |
| Non-food filter (deposit, bags, cleaning) | `rewe-map.js` | Needs a check of the parser output on real bons. Unverified |

### What gets removed from the dashboard

- Bring! reads and writes behind `/api/fridge`, and the `BRING_FRIDGE_LIST` var.
- The quick-add panel, the usuals tiles and the expiry presets in `fridge.js`.
- The expiry-in-note logic (`withExpiry`, `daysLeft` in `calc.js`) unless the estimated use-by reuses it. Keep
  `calc.test.mjs` passing either way.

Manual entry of items that have no receipt (market, bakery) is lost. Say if that matters before this is built.

### Changes by file

| File | Change |
|---|---|
| `dashboard/rewe-map.js`, `test/rewe-map.test.mjs` | New, pure, same pattern as `ha-map.js` |
| `dashboard/worker.js` | `/api/fridge` calls `REWE_API_URL + /frame/rewe` with `X-API-Key`. 503 and empty body when unset. Non-OK throws `REWE API answered <status>`. `Cache-Control: max-age=300` |
| `dashboard/wrangler.jsonc`, `SETUP.md` | Secrets `REWE_API_URL`, `REWE_API_KEY`. Replace the Bring! fridge section |
| `js/data.js` | `fridge` holds REWE-shaped sample items for `npm run dev` |
| `js/fetch.js` | `updateFridge` maps the new shape and stores `D.fridgeAt`. Retry at 5 s, 15 s, 1 min after a failure |
| `js/views/fridge.js`, `css/views/fridge.css` | New list and header. `rgba()` only. One cached `Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'})`. No `innerHTML` rebuild on timers |
| shoplister `app.py`, `database.py`, `requirements.txt` | `GET /frame/rewe` with `hmac.compare_digest` on the key, public to the cookie middleware. 503 if `REWE_API_KEY` is unset. Pin `fastapi`, `uvicorn`, `aiohttp`, `bring-api`, `python-dotenv`, `imap-tools`, `pdfplumber`, `rapidfuzz` |

Prerequisite from the shoplister session: merge `harden-auth-and-bring-cache` (commit `bd149f1`) first. That session
found that the auth check let every path through before it.

## 3. EC2 specification

| Item | Value |
|---|---|
| Instance | `t4g.micro`, Ubuntu 24.04 LTS arm64, 1 GiB swap file |
| Storage | 16 GB encrypted gp3 |
| Network | Security group with no inbound rules. Public IPv4 for outbound only. Check current AWS pricing for it |
| Admin access | SSM Session Manager. Role `AmazonSSMManagedInstanceCore` and nothing else. No SSH, no AWS keys on the box |
| Runtime | Python venv in `/opt/shoplister`, systemd unit, `uvicorn app:app --host 127.0.0.1 --port 8000 --workers 1`, `Restart=always`, `NoNewPrivileges=true`. One worker, because the refresh thread and rate-limit state are per process |
| Tunnel | `cloudflared` arm64 as a service, hostname `rewe.<domain>` to `http://localhost:8000` |
| Edge | WAF rate-limit rule on the hostname. Check the free-plan rule limit |
| Updates | `unattended-upgrades` |
| Backup | None. SQLite is a cache rebuilt from Gmail. The "used up" table is not, so back it up if you add it |
| Monitoring | CloudWatch `CPUCreditBalance` and memory for the first week |

### Credentials

| Secret | Location | Set with |
|---|---|---|
| `BRING_EMAIL`, `BRING_PASSWORD`, `EMAIL_USER`, `EMAIL_PASS`, `APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAILS` | `/etc/shoplister/env`, owner `root:shoplister`, mode 0640, loaded by `EnvironmentFile=` | Edit over Session Manager |
| `REWE_API_KEY` | Same file, and Worker secret | `openssl rand -hex 32`, then `wrangler secret put REWE_API_KEY` |
| `REWE_API_URL` | Worker secret | `wrangler secret put REWE_API_URL` |
| Tunnel token | cloudflared service config | Copied once from Cloudflare Zero Trust |

- A Gmail app password reads the whole mailbox. Safer: a separate Gmail account that receives forwarded REWE eBon mails.
- Set `GOOGLE_ALLOWED_EMAILS`. Empty, it admits any verified Google account.
- Nothing secret goes into either repo. `deploy/env.example` holds placeholders.
- Rotate `REWE_API_KEY` on EC2 and in the Worker together, then restart the service.

## 4. Feature 2: Home Assistant

Already built on `origin/live-data-and-view-updates`, `fix/frame-unattended`, `midnight-live-merged`,
`midnight-redesign` and `claude/dashboard-design-critique-b8d047`:

- `GET /api/home` reads HA `/api/states` and maps them with `ha-map.js`. `POST /api/home` calls services.
- Allowed domains: `light`, `lock`, `cover`, `climate`, `media_player`.
- Secrets `HA_URL` and `HA_TOKEN`. `SETUP.md` there says to expose HA through a Nabu Casa URL or a Cloudflare Tunnel,
  because a LAN address does not work from a Worker.
- Writes need `X-Dash-Token`. That token ships in the page JavaScript, so it stops casual misuse only.

Work for this spec:

1. Pick a base branch. The cookidoo branch (meals, tasks) and the HA branch (control, agents) have diverged. Merging
   them touches `views.js`, `worker.js`, `data.js`, `index.html` and `wrangler.jsonc`.
2. Confirm HA is reachable from Cloudflare and test `/api/home` against the live instance.
3. Decide whether locks and covers stay writable from a wall display with a page-embedded token. This reverses my
   revision 1 exclusion, which assumed HA did not exist yet.

No EC2 component is needed for this feature.

## 5. Feature 3: Thermomix TM6 status

No confirmed source of cook state. Findings:

- `SETUP.md` (Cookidoo section) states Cookidoo has no cook-state endpoint, state reaches the phone app as a push message,
  and Vorwerk describes remote monitoring as a TM7 feature. The household owns a TM6.
- A [Home Assistant community thread](https://community.home-assistant.io/t/thermomix-tm6-possible-support/375539) asks
  for TM6 support and shows no working integration. One commenter says the TM6 does not report cooking status
  (unverified forum claim).
- Home Assistant 2025.1 added a Cookidoo integration for recipes, not machine state (same thread, unverified).
- Not searched: reverse-engineering projects for the TM6's local interface.

With Home Assistant already proxied, the options change from revision 1:

| Option | Needs | Shows |
|---|---|---|
| A. Metering smart plug as an HA sensor | Add `sensor` to the allow-listed domains in `ha-map.js`, map watts to idle or working. No EC2 | Off, idle, working. Thresholds must be measured on your TM6. Check the plug's rated load against the TM6 |
| B. Cook timer in the Kitchen view, started from a recipe step | Page code only | What you started, not what the machine does |
| C. Capture the app's push traffic | Research, plus a check of Vorwerk's terms | Real state. Unverified and fragile |

Build B first. Measure A with a borrowed plug before committing. The display never claims a dish is finished. It shows
"load dropped N min ago".

## 6. Phases

| Phase | Scope | Exit check |
|---|---|---|
| 0 | Decisions in section 7. Merge `harden-auth-and-bring-cache`. Choose the base branch | Recorded |
| 1 | shoplister `/frame/rewe`, deploy to EC2, tunnel, `curl` with and without key | 200 with key, 401 without, no inbound rules |
| 2 | Worker route, `rewe-map.js`, fridge view | `node test/*.test.mjs` passes, `npm run build`, then check on the frame via `chrome://inspect` |
| 3 | "Used up" flag, if wanted | Survives a service restart |
| 4 | Merge HA branch, live test of `/api/home` | Light toggle works from the frame |
| 5 | Timer (B), then plug sensor (A) | Five real cooks match the thresholds |

## 7. Open decisions

1. Does the fridge view show recent purchases only, or purchases minus "used up" items?
2. Is losing manual add acceptable?
3. Do you have a domain on Cloudflare, or will you register one?
4. Which branch is the base for the merge?
5. Is HA reachable from the internet today, and through which route?
6. Is a metering plug on the TM6 acceptable?
