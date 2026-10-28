# Live Data Setup

This guide covers the one-time setup to connect the dashboard to live data.
The dashboard runs on mock data without any of this — complete sections in any order.

---

## 1. Weather (Open-Meteo — nothing to install)

Open-Meteo is completely free with no API key. The defaults in `wrangler.jsonc` are already set to Berlin.
If your frame is elsewhere, update these three vars in `wrangler.jsonc`:

```jsonc
"WEATHER_LAT": "52.52",   // your latitude
"WEATHER_LON": "13.41",   // your longitude
"WEATHER_TZ": "Europe/Berlin"  // IANA timezone, e.g. "America/New_York"
```

---

## 2. BVG transit departures

Find your nearest stop ID:

1. Open `https://v6.bvg.transport.rest/locations?query=YourStopName` in a browser
2. Copy the `id` of the result you want (e.g. `"900058101"`)
3. Update `wrangler.jsonc`:

```jsonc
"BVG_STOP_ID": "900058101",
"BVG_STOP_NAME": "Gleisdreieck"
```

No API key needed — BVG transport.rest is a public API.

---

## 3. Google Calendar (service account)

### 3a. Create a service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Calendar API** (APIs & Services → Library)
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Name it anything (e.g. `dashboard-reader`), click through without granting roles
6. On the service account page, go to **Keys → Add Key → Create new key → JSON**
7. Download the JSON file — keep it safe, never commit it

### 3b. Share each calendar with the service account

1. Open Google Calendar in a browser for each family member
2. Settings → click the calendar → **Share with specific people**
3. Add the `client_email` from the JSON file (looks like `dashboard-reader@project.iam.gserviceaccount.com`)
4. Set permission to **See all event details**

### 3c. Collect the values you'll need as secrets

From the downloaded JSON file:
- `client_email` → becomes `GOOGLE_SERVICE_EMAIL`
- `private_key` (the full PEM block including `-----BEGIN PRIVATE KEY-----`) → becomes `GOOGLE_SERVICE_KEY`

From each person's calendar settings page (Settings → the calendar → *Integrate calendar*), the **Calendar ID** (e.g. `alex@gmail.com` or a long `@group.calendar.google.com` address):
- `CAL_ALEX` — Fauzan
- `CAL_JORDAN` — Amanda (share her calendar with the service account too)

The dashboard shows only these two people. The ids `alex`/`jordan` are internal and match `js/data.js`.

---

## 4. Bring! shopping list

Just your Bring! account credentials — no extra setup:
- `BRING_EMAIL` — your Bring! login email
- `BRING_PASSWORD` — your Bring! password

The Worker fetches the first list in your account on every request.

---

## 5. Create `.dev.vars` for local testing

Create `dashboard/.dev.vars` (already in `.gitignore`):

```ini
GOOGLE_SERVICE_EMAIL=dashboard-reader@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqh...
-----END PRIVATE KEY-----
CAL_ALEX=fauzan@gmail.com
CAL_JORDAN=amanda@gmail.com
BRING_EMAIL=your@email.com
BRING_PASSWORD=yourpassword
DASH_TOKEN=<random string, see section 8>
```

Put `GOOGLE_SERVICE_KEY` on one line with literal `\n` between the parts (as in the downloaded JSON). The Worker handles that.

> **Note:** `WEATHER_*` and `BVG_*` values are plain vars in `wrangler.jsonc`, not secrets — no need to add them here.

---

## 6. Test locally

```bash
cd dashboard
npm run dev:live
```

Open the dashboard and check the **Network tab** in DevTools. You should see four `/api/*` requests returning 200:

| Endpoint | Expected response |
|---|---|
| `/api/weather` | `{ hi, lo, t, c, p }` |
| `/api/calendar` | array of event objects |
| `/api/shopping` | array of `{ name, note }` items |
| `/api/transit` | `{ stop, departures: [...] }` |

If an endpoint returns 503, the required secret or var is missing. If it returns a non-JSON error, check the Worker logs in the terminal running `wrangler dev`.

---

## 7. Deploy to Cloudflare

### 7a. Push secrets

Run once per secret (replace the value when prompted):

```bash
wrangler secret put GOOGLE_SERVICE_EMAIL
wrangler secret put GOOGLE_SERVICE_KEY
wrangler secret put CAL_ALEX
wrangler secret put CAL_JORDAN
wrangler secret put BRING_EMAIL
wrangler secret put BRING_PASSWORD
wrangler secret put DASH_TOKEN
# only if you use Home Assistant (section 9):
wrangler secret put HA_URL
wrangler secret put HA_TOKEN
```

`DASH_TOKEN` must be the same value you put in `dashboard/.env` as `VITE_DASH_TOKEN` **before** `npm run deploy` (it is baked into the build).

### 7b. Deploy

```bash
npm run deploy
```

Confirm the live URL shows real calendar events, current weather, your Bring! list, and live BVG departures.

---

---

## 8. Write access (DASH_TOKEN): shopping + Home control

Checking off, adding and deleting items on the Shopping view is written back to Bring!, and Home
control is written to Home Assistant, through `POST /api/shopping` and `POST /api/home`. Both need the
`X-Dash-Token` header to equal the `DASH_TOKEN` secret. Without it they answer 503/401 and the
dashboard just keeps its local state.

1. Make a random token: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
2. `dashboard/.dev.vars`: `DASH_TOKEN=<token>`  ·  `dashboard/.env` (gitignored): `VITE_DASH_TOKEN=<token>`
3. Deploy: `wrangler secret put DASH_TOKEN` (same value), then `npm run build` + deploy.

The token ships inside the page JavaScript, so it stops casual misuse only. Keep the Worker URL private.
Which Bring! list is used: the one named `home`, else the first; override with a `BRING_LIST` var.
Quantity is stored in the Bring! item note as `2× …`.

---

## 9. Google Home via Home Assistant (optional)

Google has no public web API for your Home devices, so the Home view talks to **Home Assistant (HA)**,
which can see Cast speakers/Nest devices (Cast integration) and your lights, locks and covers.

1. Install Home Assistant (HA OS, or the Docker image) and add your devices/integrations.
2. In HA: your profile → *Security* → **Long-lived access tokens** → create one.
3. Make HA reachable from Cloudflare: Nabu Casa Remote UI URL, or a Cloudflare Tunnel to HA. A plain
   `http://192.168…` address does **not** work, the Worker runs in the cloud.
4. Local test: `HA_URL=https://…` and `HA_TOKEN=…` in `.dev.vars`; `npm run dev:live`; `/api/home` should return `{devices, rooms, climate, media}`.
5. Deploy: `wrangler secret put HA_URL` and `HA_TOKEN`.

Controllable: lights (on/off/brightness), locks, covers (blinds/garage), the first climate entity, the playing media
player. Only those domains can be called. Without `HA_URL`/`HA_TOKEN` the Home view shows its mock data.
Not tested against a live HA in this repo, only the mapper (`node test/ha-map.test.mjs`).

---

## 10. Live cams (Photos → Live)

Cams are listed in `js/data.js` (`webcams`). Shipped: two berlin.de JPEG cams (Mitte, Charlottenburg), refreshed
every 60 s, credited on screen. Types: `img` (JPEG, safest on the frame), `yt` (YouTube live id; only if the owner allows
embedding), `hls` (.m3u8 through the WebView's own player; desktop Chrome can't play it). One feed runs at a time.
Check a feed before adding it: it must be https, return the image without a referer check, and its site's terms must allow it.

---

## 11. Frame time zone (the clock is live now)

The frame was set to `America/New_York`. Set it to Berlin over ADB, then restart the kiosk
(see `kiosk/README.md#time-zone`):

```bash
adb shell setprop persist.sys.timezone Europe/Berlin
adb shell service call alarm 3 s16 Europe/Berlin
adb shell am force-stop com.wesbos.homehq
adb shell am start -n com.wesbos.homehq/.MainActivity
```

---

## Quick reference: all configuration

| Key | Where | Description |
|---|---|---|
| `WEATHER_LAT` | `wrangler.jsonc` vars | Latitude for Open-Meteo |
| `WEATHER_LON` | `wrangler.jsonc` vars | Longitude for Open-Meteo |
| `WEATHER_TZ` | `wrangler.jsonc` vars | IANA timezone |
| `BVG_STOP_ID` | `wrangler.jsonc` vars | BVG stop ID |
| `BVG_STOP_NAME` | `wrangler.jsonc` vars | Stop display name |
| `GOOGLE_SERVICE_EMAIL` | secret | Service account email |
| `GOOGLE_SERVICE_KEY` | secret | Service account PEM private key |
| `CAL_ALEX` | secret | Google Calendar ID for Fauzan |
| `CAL_JORDAN` | secret | Google Calendar ID for Amanda |
| `DASH_TOKEN` | secret (+ `VITE_DASH_TOKEN` in `.env`) | Guards the write endpoints |
| `HA_URL` / `HA_TOKEN` | secrets | Home Assistant base URL + long-lived token (optional) |
| `BRING_LIST` | var (optional) | Bring! list name, default `home` |
| `BRING_EMAIL` | secret | Bring! account email |
| `BRING_PASSWORD` | secret | Bring! account password |
