# Spec: home bridge (shopping and fridge, Home Assistant, Thermomix status)

Status: draft for review. Nothing here is implemented. Facts about the repo come from `ARCHITECTURE.md`, `SETUP.md`,
`PRODUCT.md`, `worker.js` and `wrangler.jsonc`. Facts about outside products come from the sources at the end. Items
marked "proposal" or "unverified" are design decisions or guesses.

## 1. Where the current architecture stops

| Fact | Consequence |
|---|---|
| The Worker is the only backend. It is stateless apart from one KV namespace holding the Cookidoo token pair | It cannot hold a socket open or listen for events |
| The Worker runs on Cloudflare's network | It cannot reach a Home Assistant instance on the home LAN |
| `PRODUCT.md` states the household runs no always-on listener | Live Thermomix state is out of scope today |
| Frame is Android 6, WebView 106, about 1 GB RAM, polls `/api/*` | The page keeps polling. No WebSocket or SSE on the frame |

Features 2 and 3 need something the Worker cannot be. Feature 1 does not.

## 2. Decision: what needs EC2

| Feature | Needs EC2 | Reason |
|---|---|---|
| 1. Shopping and fridge integration | No | Both are Bring! lists already. The linking logic is Worker and page code |
| 2. Home Assistant | Only if HA stays on the LAN | The Worker needs a reachable endpoint or a pushed copy of state |
| 3. Thermomix status | Yes, if a source exists | Needs an always-on process. See section 5 for the source problem |

Two ways to reach Home Assistant:

- **Option A, tunnel only.** Home Assistant runs at home with `cloudflared`. The Worker calls the HA REST API through the
  tunnel. No EC2. The HA long-lived token sits in a Worker secret, and the tunnel exposes HA to the internet unless
  Cloudflare Access fronts it.
- **Option B, EC2 bridge (recommended if feature 3 goes ahead).** A small EC2 instance runs a bridge that holds the HA
  WebSocket and pushes an allow-listed snapshot to the Worker. The Worker never holds the HA token.

Option B costs one more component. It is the only option that also gives feature 3 a place to run, so the rest of this
spec assumes B.

Do not host Home Assistant itself on EC2. HA discovers devices by mDNS and talks to Zigbee/Z-Wave radios. Those need
the LAN. A site-to-site VPN would be required to make that work.

## 3. Target architecture

```text
 Home LAN                              AWS eu-central-1                      Cloudflare
 ────────                              ────────────────                      ──────────
 Home Assistant ◀── WireGuard ──▶  EC2 t4g.small                       Worker (existing)
 Thermomix source (section 5)          bridge (Node, docker)  ── HTTPS POST ──▶ /api/ingest
 smart plug via HA                     │                                     │
                                       │◀── Cloudflare Tunnel (outbound) ────┤ /api/house (read)
                                       │    commands, allow-listed           │ /api/house/act (write)
                                                                             ▼
                                                                         KV: house snapshot
                                                                             ▲
                                                                  Frame polls /api/house (30 s)
```

Rules:

- The bridge only makes outbound connections (WireGuard, Cloudflare Tunnel, HTTPS push). The instance has no inbound
  security group rules.
- Reads: the bridge pushes a snapshot to `POST /api/ingest` with a shared secret. The Worker stores it in KV with a
  timestamp. The frame polls `/api/house` and shows the age, as it does for every other feed.
- Writes (phase 2): the Worker calls the bridge through the tunnel. Cloudflare Access checks a service token. The bridge
  accepts only service calls named in its own allow-list.
- A stale snapshot shows its age. An old Thermomix state never displays as current.

### Worker and page changes

| Area | Change |
|---|---|
| `worker.js` | Routes `/api/ingest` (POST, bridge secret), `/api/house` (GET), `/api/house/act` (POST, `X-Dash-Token`) |
| `wrangler.jsonc` | New KV namespace `HOUSE_KV` (or a key prefix in the existing one). Secrets `BRIDGE_SECRET`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`. Var `BRIDGE_URL` |
| `views.js`, `js/data.js`, `js/system.js`, `index.html`, `main.js` | New view named `house`. The name `home` is already the Today view |
| `js/views/house.js`, `css/views/house.css` | Tiles for allow-listed entities. No infinite animation, 16 px text floor, `rgba()` colours |
| `js/fetch.js` | `poll('house')` with the existing 5 s / 15 s / 1 min retry. A 503 stops polling and keeps sample data |
| `js/views/home.js` | Today card: Thermomix state and two or three pinned entities |
| `PRODUCT.md`, `ARCHITECTURE.md`, `SETUP.md` | Remove "no always-on listener" and "KV for the Cookidoo token only". Add the bridge |
| `test/` | `house.test.mjs` with mocked ingest, tunnel and stale data |

## 4. Feature 1: shopping and fridge integration

Today: Shopping is the Bring! list `home`. Fridge is the Bring! list `Fridge`. Expiry lives in the item note
(`bis 3.11.`), quantity as `2× …`. The two views share no logic.

Proposed links, all in the page and existing Worker routes:

1. **Fridge to shopping.** An item removed from the fridge, or past its expiry, offers "Add to shopping" in a toast.
   One tap writes to `/api/shopping`. Nothing is added without the tap.
2. **Shopping to fridge.** Checking off a shopping item offers "Put in fridge" with the expiry presets already in
   `fridge.js` (`+2 days`, `+1 week`, …).
3. **Recipe to shopping.** The recipe sheet gets "Add missing to shopping". It compares recipe ingredient names to the
   fridge list. Name matching is fuzzy and German/English mixed, so it ships as a suggestion list the user edits.
4. **Fridge sensors (optional).** If the fridge reports a door-open state through Home Assistant, the fridge tile shows
   "door open for N min". The brand decides this, see open questions.

Limits:

- A fridge that reports item-level inventory to Home Assistant was not found in the research. Inventory stays manual.
- Home Assistant's Bring! integration exposes `todo` entities and syncs both ways. Changes made in Home Assistant show in
  the Bring! app immediately, while changes in the Bring! app show up in Home Assistant after up to 90 seconds.
  Home Assistant automations that edit the list can race with writes from the dashboard. Use one writer per list.

## 5. Feature 3: Thermomix TM6 status check

This feature has no confirmed data source. The finding comes first, the proposal second.

Findings:

- The repo's `SETUP.md` states Cookidoo has no cook-state endpoint, that state reaches the phone app as a push message,
  and that Vorwerk describes remote monitoring as a TM7 feature. The household has a TM6.
- A Home Assistant community thread asks for TM6 support. The thread shows no working integration, and one commenter
  says the TM6 does not report cooking status to the app or website (unverified forum claim).
- Home Assistant 2025.1 added a Cookidoo integration for the recipe platform. It does not report machine state.
- Not searched: reverse-engineering projects for the TM6's local interface. One may exist.

Options, in order of effort:

| Option | What the dashboard shows | Status |
|---|---|---|
| A. Smart plug with power metering, read through HA | Off, idle, heating or motor load, derived from watts | Proposal. Unverified: the watt thresholds must be measured on the household's own TM6. Check that the TM6 tolerates a metering plug and stays within the plug's rated load |
| B. Dashboard-side cook timer | Timer started from a recipe step using its Thermomix time. Runs in the existing Kitchen view | Buildable now. Shows what the user started, not what the machine does |
| C. Capture the app's push traffic | Real cook state | Unverified and fragile. Needs a legal check of the Vorwerk terms before any work |
| D. Wait for TM7 | Vendor remote monitoring | Hardware change |

Recommendation: build B in phase 1 (no EC2). Measure A in phase 2 with a borrowed plug before committing to it. Treat C
as research only.

The display states for A are `idle`, `working`, `done recently`. `done recently` is the drop from load to idle, shown
for a fixed window. It does not claim the dish is finished.

## 6. Feature 2: Home Assistant

Phase 1 is read-only:

- The bridge subscribes to state changes over the HA WebSocket API and pushes the allow-listed set every 30 s or on
  change, whichever is slower. The allow-list is a file in the bridge repo, one entity id per line with a label and an
  icon name.
- The `house` view shows tiles grouped by area: temperature and humidity, doors and windows, lights, power.
- The frame never receives entity ids it did not need. The bridge strips attributes to a fixed set.

Phase 2 adds writes:

- Allowed services are listed per entity (`light.toggle`, `scene.turn_on`, `switch.toggle`). Everything else returns 403
  at the bridge.
- `/api/house/act` needs `X-Dash-Token`, the same as the other writes. The page carries that token, so the real
  protection is the bridge allow-list.
- Locks, alarms, garage doors and covers are excluded from phase 2.

Home Assistant side:

- Create a dedicated HA user for the bridge. Create the long-lived access token under that user and store it only on
  the EC2 instance. HA shows the token once. A wrong or revoked token returns 401 and counts as a failed login.
- Treat the token as broad access to everything the REST API exposes, even with a non-admin user. The allow-list in the
  bridge is the control that limits it.

## 7. EC2 specification

| Item | Value | Note |
|---|---|---|
| Region | `eu-central-1` (Frankfurt) | Nearest to Berlin. Confirm with the data-residency preference |
| Instance | `t4g.small`, 2 vCPU, 2 GB, arm64 | One Node process and WireGuard idle at low load. Check current AWS pricing before launch |
| OS | Amazon Linux 2023 arm64 or Debian 12 arm64 | |
| Storage | 20 GB gp3, encrypted | State lives in KV. The disk holds logs and the allow-list |
| Network | Default VPC acceptable. One public IPv4 for outbound. No inbound rules | WireGuard on the instance dials out to the home router or HA host. Cloudflare Tunnel dials out to Cloudflare |
| Admin access | SSM Session Manager, no SSH, no key pair | IAM role `AmazonSSMManagedInstanceCore` |
| Secrets | SSM Parameter Store SecureString: `HA_TOKEN`, `BRIDGE_SECRET`, tunnel token | Read at start by the instance role. Nothing in the repo or AMI |
| Runtime | Docker Compose: `bridge`, `cloudflared`. WireGuard on the host | Pin image digests |
| Process supervision | `restart: unless-stopped`, plus a CloudWatch alarm on `StatusCheckFailed` with EC2 auto-recover | |
| Logging | CloudWatch agent, 14 day retention | Logs must not contain entity values from locked or presence entities |
| Backup | None for state. The compose file and allow-list live in git | Instance is replaceable |
| Provisioning | Terraform or CloudFormation in `infra/` of this repo | One apply from empty |
| Cost | Compute, one EBS volume, one public IPv4 and egress. Look up current prices | Compare with a Raspberry Pi at home running the same compose file |

Alternative to weigh: run the bridge on the Home Assistant host or a Pi at home. It removes AWS, WireGuard and the
public IPv4, because the bridge sits on the LAN and only dials out to Cloudflare. EC2 buys a managed, monitored host
that does not depend on home power and router. If the household already has a machine that stays on, the home bridge is
the smaller change.

## 8. Security

- Gate stays as is: `hq` cookie for everything, `X-Dash-Token` for page writes.
- `/api/ingest` accepts only `BRIDGE_SECRET`, compared in constant time. It rejects bodies over a fixed size and any
  entity id outside the Worker's own allow-list var.
- No Home Assistant token in the Worker.
- Cloudflare Access service token on the tunnel hostname. Block everything else at the edge.
- Rotation: `BRIDGE_SECRET` and the HA token each get a rotation date in the runbook.
- Privacy: presence, door and lock data on a wall display is visible to guests. The view has a per-entity "hide on
  Today" flag.

## 9. Phases

| Phase | Scope | Exit check |
|---|---|---|
| 0 | Answer the open questions. Measure the TM6 plug power | Decisions recorded |
| 1 | Fridge/shopping links, dashboard cook timer. No infrastructure | `node test/*.test.mjs` passes. `frame-compat-reviewer` agent run |
| 2 | EC2 bridge, `/api/ingest`, read-only `house` view | Snapshot age shows on the frame. Unplugging the bridge makes tiles show stale, never blank |
| 3 | Writes through the allow-list | Each service tested on the real frame touch panel |
| 4 | Thermomix plug state, if phase 0 supports it | Thresholds hold across five real cooks |

## 10. Open questions

1. Does Home Assistant already run in the household, and on what host? The repo shows a Home Assistant panel on a
   different PF1007L unit, which says nothing about the owner's setup.
2. Fridge brand and model. A Bosch or Siemens unit with Home Connect exposes door and temperature entities in Home
   Assistant. Other brands differ.
3. Is a home machine available to run the bridge, so EC2 is unnecessary?
4. Which Home Assistant entities go on the frame?
5. Is a metering plug on the TM6 acceptable to the household?

## Sources

- [Home Assistant community: Thermomix TM6 possible support?](https://community.home-assistant.io/t/thermomix-tm6-possible-support/375539)
- [Home Assistant: Bring! integration](https://www.home-assistant.io/integrations/bring/)
- [Home Assistant: Home Connect integration](https://www.home-assistant.io/integrations/home_connect/)
- [Home Assistant community: Secure Cloudflare Tunnels remote access](https://community.home-assistant.io/t/howto-secure-cloudflare-tunnels-remote-access/570837)
- [Home Assistant community: Securing Cloudflare Tunnel with a pseudo API key](https://community.home-assistant.io/t/securing-cloudflare-tunnel-with-a-psuedo-api-key/608829)
- Repo: `ARCHITECTURE.md`, `PRODUCT.md`, `dashboard/SETUP.md`, `dashboard/worker.js`, `dashboard/wrangler.jsonc`
