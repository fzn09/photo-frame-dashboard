# Dashboard setup

This guide takes the dashboard from sample data to live data on the frame. Do Part 1 first, because the
deployed site does not open without `DASH_TOKEN`. The feeds in Part 2 are independent, so connect them in any
order and skip the ones you don't need. A feed with no credentials keeps its sample data.

**Contents**

- [Part 1: Prepare](#part-1-prepare)
  - [Step 1. Run it locally](#step-1-run-it-locally)
  - [Step 2. Create the access token](#step-2-create-the-access-token)
  - [Step 3. Create the local secrets file](#step-3-create-the-local-secrets-file)
- [Part 2: Connect the feeds](#part-2-connect-the-feeds)
  - [Weather](#weather)
  - [BVG departures](#bvg-departures)
  - [Google Calendar](#google-calendar)
  - [Bring! shopping and fridge](#bring-shopping-and-fridge)
  - [TickTick chores](#ticktick-chores)
  - [Cookidoo meals](#cookidoo-meals)
  - [Unsplash photos](#unsplash-photos)
  - [Live cams](#live-cams)
- [Part 3: Test and deploy](#part-3-test-and-deploy)
  - [Step 4. Test locally](#step-4-test-locally)
  - [Step 5. Add the secrets to Cloudflare](#step-5-add-the-secrets-to-cloudflare)
  - [Step 6. Deploy](#step-6-deploy)
- [Part 4: Set up the frame](#part-4-set-up-the-frame)
  - [Step 7. Point the kiosk at your dashboard](#step-7-point-the-kiosk-at-your-dashboard)
  - [Step 8. Set the frame's time zone](#step-8-set-the-frames-time-zone)
  - [Step 9. Choose which views to show](#step-9-choose-which-views-to-show)
- [Reference](#reference)
  - [Configuration](#configuration)
  - [What each feed needs](#what-each-feed-needs)
  - [API routes](#api-routes)
  - [Troubleshooting](#troubleshooting)

---

## Part 1: Prepare

### Step 1. Run it locally

```sh
cd dashboard
npm install
npm run dev      # http://localhost:5173, sample data only
```

`npm run dev` needs no credentials. Add `?demo` to the URL for the demo tools, or `?demo=0` to turn them off.

### Step 2. Create the access token

`DASH_TOKEN` does two jobs:

- **It gates the whole site.** Without the secret, the deployed Worker answers 503 to everything. With it, every
  page, asset and `/api/*` call needs the access cookie.
- **It guards writes.** `POST` calls also need a matching `X-Dash-Token` header.

1. Make a random token:

   ```sh
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Put it in `dashboard/.env` (git-ignored), so the build can bake it into the page:

   ```ini
   VITE_DASH_TOKEN=<token>
   ```

3. Use the same value for `DASH_TOKEN` in Step 3 and Step 5.

### Step 3. Create the local secrets file

Create `dashboard/.dev.vars` (git-ignored). `npm run dev:live` reads it. Start with the token, and add a line for
each feed you connect in Part 2:

```ini
DASH_TOKEN=<token>
GOOGLE_SERVICE_EMAIL=dashboard-reader@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqh...\n-----END PRIVATE KEY-----\n"
CAL_ALEX=fauzan@gmail.com
CAL_JORDAN=amanda@gmail.com
BRING_EMAIL=your@email.com
BRING_PASSWORD=yourpassword
TICKTICK_TOKEN=<token>
UNSPLASH_KEY=<access key>
```

Keep `GOOGLE_SERVICE_KEY` on one line with literal `\n`, as in the downloaded JSON. Values such as `WEATHER_*` and
`BVG_*` are plain vars in `wrangler.jsonc`, so they don't belong here.

---

## Part 2: Connect the feeds

### Weather

**Needs:** nothing. Open-Meteo is free and has no API key.

The defaults are set to Berlin. If the frame is elsewhere, edit these vars in `wrangler.jsonc`:

```jsonc
"WEATHER_LAT": "52.52",
"WEATHER_LON": "13.41",
"WEATHER_TZ": "Europe/Berlin"   // IANA name, e.g. "America/New_York"
```

The dashboard also uses the sunset from this feed to switch between the day and evening palettes.

### BVG departures

**Needs:** a stop ID. BVG transport.rest is public and has no API key.

1. Open `https://v6.bvg.transport.rest/locations?query=YourStopName` in a browser.
2. Copy the `id` of the stop you want.
3. Update `wrangler.jsonc`:

   ```jsonc
   "BVG_STOP_ID": "900110001",
   "BVG_STOP_NAME": "S+U Schönhauser Allee",
   "BVG_WALK_MIN": "10"            // departures leaving sooner than this are hidden
   ```

### Google Calendar

**Needs:** a Google service account and one calendar ID per person.

1. **Create the service account.**
   1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.
   2. Enable the **Google Calendar API** (APIs & Services → Library).
   3. Go to **IAM & Admin → Service Accounts → Create Service Account**, name it (e.g. `dashboard-reader`) and
      click through without granting roles.
   4. On its page, go to **Keys → Add Key → Create new key → JSON** and download the file. Never commit it.
2. **Share each calendar.** In Google Calendar, open Settings → the calendar → **Share with specific people**, add
   the `client_email` from the JSON file, and choose **See all event details**. Do this for both people.
3. **Collect the values.**

   | Value | Comes from | Becomes |
   |---|---|---|
   | `client_email` | JSON file | `GOOGLE_SERVICE_EMAIL` |
   | `private_key` (the full PEM block) | JSON file | `GOOGLE_SERVICE_KEY` |
   | Fauzan's Calendar ID | Calendar settings → *Integrate calendar* | `CAL_ALEX` |
   | Amanda's Calendar ID | Calendar settings → *Integrate calendar* | `CAL_JORDAN` |

The ids `alex` and `jordan` are internal and match `js/data.js`.

### Bring! shopping and fridge

**Needs:** your Bring! email and password in `BRING_EMAIL` and `BRING_PASSWORD`.

| View | List it uses | If that list is missing |
|---|---|---|
| Shopping | Named `home`, or set `BRING_LIST` | The first list in the account |
| Fridge | Named `Fridge`, or set `BRING_FRIDGE_LIST` | Stays empty and writes nothing |

Names match without regard to case. Checking off, adding and deleting items writes back to Bring!. Quantity is kept
in the item note as `2× …`, and fridge expiry dates as `bis 3.11.`, so both read naturally in the Bring! app.

### TickTick chores

**Needs:** a TickTick Open API token in `TICKTICK_TOKEN`. Without it, the Chores view shows sample chores.

The view reads a list named `Chores`, or the one set in `TICKTICK_PROJECT`.

- **Who:** tag a task `Fauzan` or `Amanda`. Untagged tasks are for *Anyone*.
- **What shows:** open tasks due today, overdue tasks and undated tasks, in one list.
- **Ticking:** completes the task in TickTick 5 s later, after the Undo toast. Repeating tasks move to their next date.
- **Quick-add tiles:** add a usual chore (`choreUsuals` in `js/data.js`) as an undated task tagged with the person.

Get the token once, because the Open API has no app passwords:

1. Go to <https://developer.ticktick.com/manage> → *New App* and set the redirect URL to `http://localhost:8080`.
2. Open this URL with your client id, approve, and copy `code=` from the address bar. The page itself fails to load,
   which is expected:

   ```text
   https://ticktick.com/oauth/authorize?scope=tasks:read%20tasks:write&client_id=<ID>&state=x&redirect_uri=http://localhost:8080&response_type=code
   ```

3. Exchange the code:

   ```sh
   curl -u <ID>:<SECRET> -d code=<CODE> -d grant_type=authorization_code -d "scope=tasks:read tasks:write" -d redirect_uri=http://localhost:8080 https://ticktick.com/oauth/token
   ```

4. Put `access_token` in `.dev.vars` as `TICKTICK_TOKEN`, and add it to Cloudflare in Step 5.

The token lasts months, not forever (`expires_in` is in seconds). When chores fall back to sample data and
`wrangler tail` shows `TickTick projects: 401`, repeat steps 2 to 4.

### Cookidoo meals

**Needs:** a refresh token stored once in Workers KV. Your Cookidoo password stays on your PC: the Worker never logs
in, it only refreshes the token.

The Cookidoo API is unofficial, reverse-engineered by
[miaucl/cookidoo-api](https://github.com/miaucl/cookidoo-api), and can change without notice.

**What it powers**

| Where | What shows |
|---|---|
| Meals view | The week as day tiles, the chosen day's recipes, and "Thermomix · paired" |
| Recipe sheet | Ingredients, steps with Thermomix settings, times, level, servings, energy and compatible models |
| Today | A shared band of today's meals above the two people |
| Calendar | Meals with the all-day items in Today, 3 Day and Week |

**What Cookidoo cannot provide**

- **Live Thermomix status.** Cook state has no endpoint. It reaches the phone app as a push message, so the dashboard
  shows only the paired model. Vorwerk describes remote monitoring as a TM7 feature, and showing it here would need
  an always-on listener outside the Worker.
- **A meal time.** The plan stores recipes per day, with no lunch or dinner slot, time or servings, so nothing on the
  dashboard implies a time.
- **Next week.** `/api/meals` returns the week containing today, Monday to Sunday.

**Set it up**

1. Check the KV namespace. `wrangler.jsonc` already holds the `COOKIDOO_KV` id for this deployment. On a new fork,
   remove the `id` line and deploy once, so Wrangler creates a namespace for you.
2. Get the refresh token. This needs Python 3.13. Run it from `dashboard/` in a POSIX shell, such as Git Bash on
   Windows:

   ```sh
   pip install cookidoo-api
   EMAIL=you@example.com PASSWORD=... python ../scripts/cookidoo-refresh-token.py
   ```

3. Store the printed token, in the same shell:

   ```sh
   npx wrangler kv key put tokens '{"refresh":"<token>"}' --binding COOKIDOO_KV --remote
   ```

4. After you deploy (Step 6), open `/api/meals` on the Worker with the access cookie:

   | Result | Meaning |
   |---|---|
   | `days` holds your recipes | Working |
   | `days` is empty | Nothing is planned this week |
   | 502, and `wrangler tail` shows `Cookidoo token refresh 4xx` | Token wrong or revoked: repeat from step 2 |

The refresh token is a credential, so don't commit it or paste it into chats. To use another country, set
`COOKIDOO_HOST` and `COOKIDOO_LANG`. To hide meals everywhere, drop `meals` from `VIEWS`.

### Unsplash photos

**Needs:** a free access key from [unsplash.com/developers](https://unsplash.com/developers) in `UNSPLASH_KEY`.

`/api/photos` returns a fresh stock set for the slideshow. Set the search term in the `PHOTO_QUERY` var, or remove
it to use any photo. Without a key, the slideshow keeps its sample photos.

### Live cams

**Needs:** nothing. Cams appear under Photos → Live and are listed in `js/data.js` (`webcams`). Two berlin.de JPEG
cams ship, refresh every 60 s and are credited on screen. One feed runs at a time.

| Type | What it is | Note |
|---|---|---|
| `img` | JPEG | Safest on the frame |
| `yt` | YouTube live id | Only if the owner allows embedding |
| `hls` | `.m3u8`, played by the WebView | Desktop Chrome can't play it |

Before you add a feed, check that it uses https, returns the image without a referer check, and that its site's
terms allow it.

---

## Part 3: Test and deploy

### Step 4. Test locally

```sh
cd dashboard
npm run build       # dev:live serves dist/
npm run dev:live
```

Open the printed URL with `?key=<token>` once to set the access cookie. Then check the Network tab in DevTools:

| Endpoint | Expected response |
|---|---|
| `/api/weather` | Weather object |
| `/api/calendar` | Array of events |
| `/api/shopping` | Array of `{ name, note }` |
| `/api/transit` | `{ stop, departures: [...] }` |
| `/api/meals` | `{ days: [...], device }` |

Run the checks too. They need no credentials or network:

```sh
node test/views.test.mjs
node test/gate.test.mjs
node test/cookidoo.test.mjs
node test/calc.test.mjs
node test/type-floor.test.mjs
```

### Step 5. Add the secrets to Cloudflare

Run this once per secret and paste the value when asked. Include only the feeds you use:

```sh
npx wrangler secret put DASH_TOKEN
npx wrangler secret put GOOGLE_SERVICE_EMAIL
npx wrangler secret put GOOGLE_SERVICE_KEY
npx wrangler secret put CAL_ALEX
npx wrangler secret put CAL_JORDAN
npx wrangler secret put BRING_EMAIL
npx wrangler secret put BRING_PASSWORD
npx wrangler secret put TICKTICK_TOKEN
npx wrangler secret put UNSPLASH_KEY
```

### Step 6. Deploy

Make sure `VITE_DASH_TOKEN` in `dashboard/.env` matches `DASH_TOKEN`, because it is baked into the build:

```sh
npm run deploy
```

Open `https://<worker>/?key=<token>` and confirm that your calendar, weather, lists, departures and meals appear.
The rail shows **Sample data** while any enabled feed has never loaded.

---

## Part 4: Set up the frame

### Step 7. Point the kiosk at your dashboard

Each device needs the access cookie once. It lasts a year. Save the URL with the key, so the frame sets its own
cookie:

```sh
adb shell am start -n com.wesbos.homehq/.MainActivity --es url "https://<worker>/?key=<token>"
```

See the [kiosk guide](kiosk/README.md#dashboard-url) for more, including starting at boot.

### Step 8. Set the frame's time zone

The clock and the "today" of every view follow the frame's time zone. Set it over ADB, then restart the kiosk (see
the [kiosk guide](kiosk/README.md#time-zone)):

```sh
adb shell setprop persist.sys.timezone Europe/Berlin
adb shell service call alarm 3 s16 Europe/Berlin
adb shell am force-stop com.wesbos.homehq
adb shell am start -n com.wesbos.homehq/.MainActivity
```

### Step 9. Choose which views to show

Edit the `VIEWS` var in `wrangler.jsonc`, then run `npm run deploy`. The rail order is fixed, so the order you write
doesn't matter. Unknown names are ignored, and an empty or invalid value falls back to all views.

| Name | Rail label | What it does | Feed |
|---|---|---|---|
| `home` | Today | Always on: clock, weather, departures, next up, people, meals, and a card per enabled view | All |
| `calendar` | Calendar | Today, 3 Day, Week and Month | Google Calendar, Cookidoo |
| `tasks` | Chores | Shared list with quick-add tiles | TickTick |
| `shopping` | Shopping | List with write-back | Bring! |
| `fridge` | Fridge | Contents and expiry dates | Bring! |
| `meals` | Meals | Week plan and recipes | Cookidoo |
| `kitchen` | Kitchen | Calculator, conversions and timers | None |
| `photos` | Photos | Slideshow and live cams | Unsplash, cams |

The frame checks `/api/config` every 5 minutes and applies the list without a reload. If it is showing a view that
just got hidden, it returns to Today. The last list is cached on the frame, so a reboot without Wi-Fi keeps it.
Today drops the cards of hidden views and reflows. With Photos hidden, the screensaver shows only the clock and
weather.

---

## Reference

### Configuration

**Vars, in `wrangler.jsonc`**

| Key | Required | Description |
|---|---|---|
| `WEATHER_LAT`, `WEATHER_LON` | For weather | Location for Open-Meteo |
| `WEATHER_TZ` | No | IANA time zone, also used for "today" in the Cookidoo call |
| `BVG_STOP_ID` | For departures | BVG stop ID |
| `BVG_STOP_NAME` | No | Stop name shown on screen |
| `BVG_WALK_MIN` | No | Walk time to the stop; sooner departures are hidden |
| `VIEWS` | No | Views on the frame ([Step 9](#step-9-choose-which-views-to-show)) |
| `PHOTO_QUERY` | No | Unsplash search term |
| `BRING_LIST` | No | Shopping list name, default `home` |
| `BRING_FRIDGE_LIST` | No | Fridge list name, default `fridge` |
| `TICKTICK_PROJECT` | No | Chores list name, default `Chores` |
| `COOKIDOO_HOST` | No | Cookidoo domain, default `cookidoo.de` |
| `COOKIDOO_LANG` | No | Cookidoo language, default `de-DE` |

**Secrets, set with `wrangler secret put`**

| Key | Required | Description |
|---|---|---|
| `DASH_TOKEN` | Yes | Site gate and write guard |
| `GOOGLE_SERVICE_EMAIL` | For calendar | Service account email |
| `GOOGLE_SERVICE_KEY` | For calendar | Service account PEM private key |
| `CAL_ALEX` | For calendar | Fauzan's Calendar ID |
| `CAL_JORDAN` | For calendar | Amanda's Calendar ID |
| `BRING_EMAIL`, `BRING_PASSWORD` | For shopping and fridge | Bring! login |
| `TICKTICK_TOKEN` | For chores | TickTick Open API token |
| `UNSPLASH_KEY` | For stock photos | Unsplash access key |

**Other**

| Key | Where | Description |
|---|---|---|
| `VITE_DASH_TOKEN` | `dashboard/.env` | Same value as `DASH_TOKEN`, baked in at build time |
| `COOKIDOO_KV` | KV binding in `wrangler.jsonc` | Holds the Cookidoo token pair under the key `tokens` |

### What each feed needs

| Feed | Account | Secret or setup | Without it |
|---|---|---|---|
| Weather | None | Vars have defaults | Sample data if lat/lon are unset |
| BVG | None | `BVG_STOP_ID` | Sample data |
| Google Calendar | Google | Service account | Sample data |
| Bring! | Bring! | Login | Sample data |
| TickTick | TickTick | `TICKTICK_TOKEN` | Sample chores |
| Cookidoo | Cookidoo | Refresh token in KV | Sample meals until the token is stored |
| Unsplash | Unsplash | `UNSPLASH_KEY` | Sample photos |

### API routes

Every route needs the access cookie, except that the manifest and icons are public. Reads are polled by the page, and
a failed poll keeps the last good data.

| Route | Source | Page polls | Notes |
|---|---|---|---|
| `GET /api/config` | `VIEWS` var | 5 min | Which views to show |
| `GET /api/weather` | Open-Meteo | 30 min | Forecast and sunset |
| `GET /api/calendar` | Google Calendar | 5 min | Both people's events |
| `GET /api/transit` | BVG transport.rest | 1 min | Departures from your stop |
| `GET`, `POST /api/shopping` | Bring! | 2 min | `POST` ops: `add`, `done`, `remove` |
| `GET`, `POST /api/fridge` | Bring! | 5 min | Same ops, on the fridge list |
| `GET`, `POST /api/chores` | TickTick | 5 min | `POST` completes a task, or adds one with `op: 'add'` |
| `GET /api/photos` | Unsplash | When the slideshow needs more | Stock photo set |
| `GET /api/meals` | Cookidoo | 30 min | `{ days, device }`: the week and paired model |
| `GET /api/meals/recipe?id=<id>` | Cookidoo | On demand | One recipe; add `&custom=1` for your own |
| `GET /api/meals/img?u=<url>` | `assets.tmecosys.com` | On demand | Image proxy, that host only |

Writes also need the `X-Dash-Token` header. The page sets it from `VITE_DASH_TOKEN`.

### Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| `DASH_TOKEN is not set` on every page | Secret missing | [Step 5](#step-5-add-the-secrets-to-cloudflare) |
| `Open this dashboard with its key link.` | No access cookie on this device | Open `/?key=<token>` once |
| `Wrong key` | Token doesn't match | Compare with the `DASH_TOKEN` secret |
| An `/api/*` route answers 503 | That feed has no credentials or var | Connect it in Part 2 |
| An `/api/*` route answers 502 | The upstream service failed | Run `wrangler tail` for the reason |
| Writes fail with a sync toast | `VITE_DASH_TOKEN` differs from `DASH_TOKEN` | Match them and run `npm run deploy` |
| Rail shows **Sample data** | An enabled feed has never loaded | Check which `/api/*` call fails |
| Chores back to sample data | TickTick token expired | Repeat the [token steps](#ticktick-chores) |
| Meals don't update | Cookidoo token revoked | Repeat the [Cookidoo steps](#cookidoo-meals) |
| `dev:live` shows an old build or a busy port | Stale `workerd` process or hashed files | Use a fresh port, and restart wrangler after each build |
