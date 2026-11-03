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
```

`DASH_TOKEN` must be the same value you put in `dashboard/.env` as `VITE_DASH_TOKEN` **before** `npm run deploy` (it is baked into the build).

### 7b. Deploy

```bash
npm run deploy
```

Confirm the live URL shows real calendar events, current weather, your Bring! list, and live BVG departures.

---

---

## 8. Write access (DASH_TOKEN): shopping

Checking off, adding and deleting items on the Shopping view is written back to Bring! through
`POST /api/shopping`. Writes need the
`X-Dash-Token` header to equal the `DASH_TOKEN` secret. Without it they answer 503/401 and the
dashboard just keeps its local state.

1. Make a random token: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
2. `dashboard/.dev.vars`: `DASH_TOKEN=<token>`  ·  `dashboard/.env` (gitignored): `VITE_DASH_TOKEN=<token>`
3. Deploy: `wrangler secret put DASH_TOKEN` (same value), then `npm run build` + deploy.

The token ships inside the page JavaScript, so it stops casual misuse only. Keep the Worker URL private.
Which Bring! list is used: the one named `home`, else the first; override with a `BRING_LIST` var.
Quantity is stored in the Bring! item note as `2× …`.

The Fridge view (`fridge` in `VIEWS`) uses a second Bring! list through `/api/fridge`: create a list
named `Fridge` in the Bring! app (override the name with a `BRING_FRIDGE_LIST` var). There is no
fallback list, so without it the view stays empty and nothing is written. Expiry dates are kept in the
item note as `bis 3.11.`, so they read naturally in the Bring! app too.

### Chores (TickTick)

The Chores view (`tasks` in `VIEWS`) reads a TickTick list named `Chores` (override with a
`TICKTICK_PROJECT` var) through TickTick's free Open API. Without a token it shows sample chores.

- **Who:** tag a task `Fauzan` or `Amanda`; untagged tasks are for *Anyone*.
- Shown as one list: open tasks due today, overdue ones, and undated ones.
- Ticking one completes it in TickTick 5 s later (after the Undo toast); repeating tasks move to their next date.
- The tiles at the bottom add a usual chore (list in `js/data.js`, `choreUsuals`) for the picked person:
  a new undated task in the list, tagged with their name.

One-time token (the Open API has no app passwords):

1. <https://developer.ticktick.com/manage> → *New App*. Set the redirect URL to `http://localhost:8080`.
2. Open in a browser (fill in the client id), approve, and copy `code=` from the address bar it lands on
   (the page itself fails to load, that's fine):
   `https://ticktick.com/oauth/authorize?scope=tasks:read%20tasks:write&client_id=<ID>&state=x&redirect_uri=http://localhost:8080&response_type=code`
3. Exchange it:
   `curl -u <ID>:<SECRET> -d code=<CODE> -d grant_type=authorization_code -d "scope=tasks:read tasks:write" -d redirect_uri=http://localhost:8080 https://ticktick.com/oauth/token`
4. Put `access_token` in `.dev.vars` as `TICKTICK_TOKEN=…` and `wrangler secret put TICKTICK_TOKEN`.

The token lasts months, not forever (check `expires_in`, in seconds). When chores fall back to sample
data and `wrangler tail` shows `TickTick projects: 401`, repeat steps 2–4.

---

## 9. Live cams (Photos → Live)

Cams are listed in `js/data.js` (`webcams`). Shipped: two berlin.de JPEG cams (Mitte, Charlottenburg), refreshed
every 60 s, credited on screen. Types: `img` (JPEG, safest on the frame), `yt` (YouTube live id; only if the owner allows
embedding), `hls` (.m3u8 through the WebView's own player; desktop Chrome can't play it). One feed runs at a time.
Check a feed before adding it: it must be https, return the image without a referer check, and its site's terms must allow it.

---

## 10. Frame time zone (the clock is live now)

The frame was set to `America/New_York`. Set it to Berlin over ADB, then restart the kiosk
(see `kiosk/README.md#time-zone`):

```bash
adb shell setprop persist.sys.timezone Europe/Berlin
adb shell service call alarm 3 s16 Europe/Berlin
adb shell am force-stop com.wesbos.homehq
adb shell am start -n com.wesbos.homehq/.MainActivity
```

---

## 11. Choosing which views the frame shows

The `VIEWS` var in `wrangler.jsonc` lists the views on the rail, in rail order. Default:
`"home,calendar,shopping,fridge,kitchen,photos"`. Valid names:
`home` (Today, always on), `calendar`, `tasks` (Chores), `shopping`, `fridge`, `kitchen` (calculator, conversions, timers), `photos`.
Unknown names are ignored; an empty/invalid value falls back to the default.

To change it: edit `VIEWS`, then `npm run deploy`. The frame polls `/api/config` every 5 minutes and applies the
list without a reload (if it is showing a view that just got hidden, it goes back to Today). The last list is
cached in the frame's localStorage, so a reboot without Wi-Fi still shows the right views.

Views are built when first opened and rebuilt after data changes the next time they are selected. Today also drops
the cards of hidden views (Chores and the photo tile) and the layout reflows. With Photos hidden the screensaver
shows only the clock and weather. `GET /api/config` shows what the Worker currently serves.

Demo tools (clock long-press panel, keyboard shortcuts, the startup tip) are off on the frame. Open the page with
`?demo` to turn them on (remembered), `?demo=0` to turn them off.

---

## 12. Cookidoo week plan (backend only so far)

`/api/meals` returns the Cookidoo planner week; `/api/meals/img` proxies recipe pictures from `assets.tmecosys.com`.
The Worker never logs in. It refreshes an OAuth token that you seed once into Workers KV. The API is unofficial
(reverse-engineered by [miaucl/cookidoo-api](https://github.com/miaucl/cookidoo-api)) and can change without notice.

1. Deploy once so Wrangler creates the `COOKIDOO_KV` namespace (`kv_namespaces` in `wrangler.jsonc`).
2. On your PC, get the refresh token (needs Python 3.13 and your Cookidoo email and password):

   ```sh
   pip install cookidoo-api
   EMAIL=you@example.com PASSWORD=... python ../scripts/cookidoo-refresh-token.py
   ```

3. Store it. Use the literal output of step 2 as the value:

   ```sh
   npx wrangler kv key put tokens '{"refresh":"<token>"}' --binding COOKIDOO_KV --remote
   ```

4. Check: open `/api/meals` on the Worker with the access cookie. An empty `days` list means a free week; a 502
   with `wrangler tail` showing `Cookidoo token refresh 4xx` means the token is wrong or revoked, repeat from step 2.

Vars: `COOKIDOO_HOST` (default `cookidoo.de`), `COOKIDOO_LANG` (default `de-DE`). The refresh token is a credential:
do not commit it or paste it into chats.

---

## Quick reference: all configuration

| Key | Where | Description |
|---|---|---|
| `WEATHER_LAT` | `wrangler.jsonc` vars | Latitude for Open-Meteo |
| `WEATHER_LON` | `wrangler.jsonc` vars | Longitude for Open-Meteo |
| `WEATHER_TZ` | `wrangler.jsonc` vars | IANA timezone |
| `BVG_STOP_ID` | `wrangler.jsonc` vars | BVG stop ID |
| `BVG_STOP_NAME` | `wrangler.jsonc` vars | Stop display name |
| `BVG_WALK_MIN` | `wrangler.jsonc` vars | Walk time to the stop; earlier departures are hidden |
| `GOOGLE_SERVICE_EMAIL` | secret | Service account email |
| `GOOGLE_SERVICE_KEY` | secret | Service account PEM private key |
| `CAL_ALEX` | secret | Google Calendar ID for Fauzan |
| `CAL_JORDAN` | secret | Google Calendar ID for Amanda |
| `DASH_TOKEN` | secret (+ `VITE_DASH_TOKEN` in `.env`) | Guards the write endpoints |
| `BRING_LIST` | var (optional) | Bring! list name, default `home` |
| `BRING_FRIDGE_LIST` | var (optional) | Bring! list for the Fridge view, default `fridge` |
| `TICKTICK_TOKEN` | secret (optional) | TickTick Open API token for the Chores view |
| `TICKTICK_PROJECT` | var (optional) | TickTick list for the Chores view, default `Chores` |
| `VIEWS` | var | Comma list of views shown on the frame (section 11) |
| `COOKIDOO_HOST` / `COOKIDOO_LANG` | vars | Cookidoo domain and language, default `cookidoo.de` / `de-DE` |
| `COOKIDOO_KV` | KV binding | Holds the Cookidoo token pair (section 12) |
| `BRING_EMAIL` | secret | Bring! account email |
| `BRING_PASSWORD` | secret | Bring! account password |
