# Plan: REWE eBon fridge view on scheduled EC2

Companion to [SPEC-home-bridge.md](SPEC-home-bridge.md), section 3a. Status: plan, nothing executed. Commands and code
are written from documentation and from what the shoplister session read. None of it has been run. Replace every
`<PLACEHOLDER>`.

**Target**

```text
EventBridge Scheduler ─ StartInstances ─▶ EC2 t4g.micro boots
  systemd rewe-job: fetch eBon (Gmail IMAP) ─ parse PDF ─ POST /api/ingest ─▶ Worker ─▶ KV
  ExecStopPost: poweroff unless /etc/shoplister/keep-on exists          ▲
EventBridge Scheduler ─ StopInstances (backstop, +20 min)               │
Frame ── GET /api/fridge ── Worker reads KV ────────────────────────────┘
```

**Phase order and one dependency.** Phase 2 ends at a dry run on the instance. The first real push to the Worker needs
the `/api/ingest` route from Phase 3, so the live test is step 3.8.

**Decide before starting**

| Decision | Default used in this plan |
|---|---|
| Runs per day | 12:30, 18:30, 21:30 Europe/Berlin |
| Region | `eu-central-1` |
| Base branch for the dashboard work | Not chosen. Cookidoo branch and HA branch have diverged (SPEC section 4) |
| Gmail account for IMAP | A separate account that receives forwarded eBon mails |

---

## Phase 1: AWS setup and prerequisites

Nothing from shoplister is deployed in this phase. The schedules are created disabled.

### 1.1 Accounts and local tools

- [ ] AWS account with MFA on the root user and an admin IAM user or SSO profile for daily work.
- [ ] AWS CLI v2 configured: `aws configure sso` or `aws configure`. Check with `aws sts get-caller-identity`.
- [ ] Session Manager plugin installed locally (AWS docs: "Install the Session Manager plugin"). Check with
      `session-manager-plugin --version`.
- [ ] Cloudflare account with the `home-dashboard` Worker deployed, and `npx wrangler whoami` working in `dashboard/`.
- [ ] Access to `github.com/fzn09/shoplister`, with `harden-auth-and-bring-cache` (commit `bd149f1`) merged.
- [ ] REWE digital receipts active, and at least one eBon mail from `ebon@mailing.rewe.de` with `REWE-eBon.pdf` in the
      Gmail account you will use.
- [ ] Gmail: 2-step verification on, then an app password for IMAP. If you forward eBon mails to a separate account,
      create the app password there.
- [ ] Note the delay between a purchase and its mail. It sets how useful three runs a day are.

### 1.2 Billing guard

AWS console, Billing, Budgets: create a monthly cost budget with an alert at an amount you choose, sent to your email.
Do this first. A job that fails to power off shows up here.

### 1.3 Network

```sh
export AWS_REGION=eu-central-1
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --group-name shoplister-sg \
  --description "shoplister, no inbound" --vpc-id "$VPC" --query GroupId --output text)
echo "$SG"
```

A new security group has no inbound rules and allows all outbound. Add none. The instance dials out to Gmail, to the
Worker and to the SSM service.

### 1.4 Instance role (for SSM only)

```sh
cat > ec2-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
aws iam create-role --role-name shoplister-ec2-role --assume-role-policy-document file://ec2-trust.json
aws iam attach-role-policy --role-name shoplister-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name shoplister-ec2-profile
aws iam add-role-to-instance-profile --instance-profile-name shoplister-ec2-profile --role-name shoplister-ec2-role
```

Wait about 10 seconds before launching, so the profile is visible to EC2. The role carries no other permission.

### 1.5 Launch the instance

```sh
AMI=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)

IID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.micro \
  --iam-instance-profile Name=shoplister-ec2-profile \
  --security-group-ids "$SG" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=16,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' \
  --metadata-options 'HttpTokens=required,HttpEndpoint=enabled' \
  --instance-initiated-shutdown-behavior stop \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=shoplister}]' \
  --query 'Instances[0].InstanceId' --output text)
echo "$IID"
```

- No key pair, so no SSH. `HttpTokens=required` enforces IMDSv2.
- The instance gets an auto-assigned public IPv4 from the default subnet, which it needs for outbound traffic. Do not
  attach an Elastic IP: AWS releases the auto-assigned address on stop, and a held Elastic IP is billed while stopped.
  Check current AWS pricing for public IPv4.
- `--instance-initiated-shutdown-behavior stop` makes the job's poweroff stop the instance and keep the volume.

### 1.6 Connect through Session Manager

```sh
aws ec2 wait instance-running --instance-ids "$IID"
aws ssm describe-instance-information --query 'InstanceInformationList[].[InstanceId,PingStatus]' --output text
aws ssm start-session --target "$IID"
```

The instance must list as `Online`. This can take a few minutes after first boot. If it never appears, check the role,
the outbound rule and the public IPv4.

### 1.7 Operating system and file layout

Inside the session:

```sh
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install python3-venv python3-pip git unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades          # answer Yes

# 1 GiB swap
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# service user, directories
sudo adduser --system --group --home /opt/shoplister shoplister
sudo mkdir -p /etc/shoplister /opt/shoplister/app/data
sudo chown root:shoplister /etc/shoplister && sudo chmod 750 /etc/shoplister
sudo chown -R shoplister:shoplister /opt/shoplister
sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald   # keep logs across stop/start
```

| Path | Content | Owner, mode |
|---|---|---|
| `/opt/shoplister/app` | shoplister code, `WorkingDirectory` of the job | `shoplister` |
| `/opt/shoplister/app/data` | SQLite file and downloaded eBon PDFs. The code writes relative to the working directory. Confirm the DB path in `database.py` | `shoplister`, the only writable path for the job |
| `/opt/shoplister/venv` | Python virtualenv | `shoplister` |
| `/etc/shoplister/env` | Secrets | `root:shoplister`, 0640 |
| `/etc/shoplister/keep-on` | Optional flag file. If present, the instance does not power off | `root` |
| `/usr/local/bin/rewe-poweroff` | Poweroff helper | `root`, 0755 |

### 1.8 Read access to the repo

shoplister may be private. Use a read-only deploy key.

```sh
sudo -u shoplister mkdir -p /opt/shoplister/.ssh && sudo chmod 700 /opt/shoplister/.ssh
sudo -u shoplister ssh-keygen -t ed25519 -N "" -f /opt/shoplister/.ssh/id_ed25519
sudo -u shoplister sh -c 'ssh-keyscan github.com >> /opt/shoplister/.ssh/known_hosts'
sudo cat /opt/shoplister/.ssh/id_ed25519.pub
```

GitHub, `fzn09/shoplister`, Settings, Deploy keys: add the printed public key with write access off.

### 1.9 Generate the ingest secret

On your machine:

```sh
openssl rand -hex 32
```

Store the value in your password manager as `INGEST_KEY`. It goes into `/etc/shoplister/env` in Phase 2 and into the
Worker in Phase 3. Do not paste it into chat, a ticket or a repo.

### 1.10 Scheduler role

```sh
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
cat > sch-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
cat > sch-policy.json <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ec2:StartInstances","ec2:StopInstances"],
"Resource":"arn:aws:ec2:eu-central-1:${ACCOUNT}:instance/${IID}"}]}
EOF
aws iam create-role --role-name shoplister-scheduler-role --assume-role-policy-document file://sch-trust.json
aws iam put-role-policy --role-name shoplister-scheduler-role --policy-name start-stop --policy-document file://sch-policy.json
ROLE_ARN=$(aws iam get-role --role-name shoplister-scheduler-role --query Role.Arn --output text)
```

The role can start and stop this one instance and nothing else.

### 1.11 Schedules (created disabled)

Run the block once per time. Start times: 12:30, 18:30, 21:30. Stop backstops: 12:50, 18:50, 21:50.

```sh
mk() {  # name, cron minute, cron hour, action (startInstances|stopInstances)
  aws scheduler "${SCH_CMD:-create-schedule}" --name "$1" --state "${SCH_STATE:-DISABLED}" \
    --schedule-expression "cron($2 $3 * * ? *)" --schedule-expression-timezone "Europe/Berlin" \
    --flexible-time-window Mode=OFF \
    --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ec2:$4\",\"RoleArn\":\"$ROLE_ARN\",\"Input\":\"{\\\"InstanceIds\\\":[\\\"$IID\\\"]}\"}"
}
mk shoplister-start-1230 30 12 startInstances
mk shoplister-stop-1250  50 12 stopInstances
mk shoplister-start-1830 30 18 startInstances
mk shoplister-stop-1850  50 18 stopInstances
mk shoplister-start-2130 30 21 startInstances
mk shoplister-stop-2150  50 21 stopInstances
```

### 1.12 Test start and stop by hand

```sh
state() { aws ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].[State.Name,PublicIpAddress]' --output text; }
aws ec2 stop-instances --instance-ids "$IID" && aws ec2 wait instance-stopped --instance-ids "$IID" && state
aws ec2 start-instances --instance-ids "$IID" && aws ec2 wait instance-running --instance-ids "$IID" && state
```

Expected: `stopped None`, then `running <new IP>`. Then test the Scheduler path with a one-off schedule that deletes itself:

```sh
aws scheduler create-schedule --name shoplister-test-stop --action-after-completion DELETE \
  --schedule-expression "at(<YYYY-MM-DDTHH:MM:SS, a few minutes ahead>)" --schedule-expression-timezone "Europe/Berlin" \
  --flexible-time-window Mode=OFF \
  --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ec2:stopInstances\",\"RoleArn\":\"$ROLE_ARN\",\"Input\":\"{\\\"InstanceIds\\\":[\\\"$IID\\\"]}\"}"
```

The instance must read `stopped` after the time passes. If it does not, read the schedule's error in the console and check
the role's resource ARN.

### Phase 1 exit checks

- [ ] `aws ssm start-session` works, and the security group has zero inbound rules.
- [ ] Manual stop/start works, and the public IP is `None` while stopped.
- [ ] The one-off schedule stopped the instance.
- [ ] The six schedules exist with state `DISABLED`.
- [ ] Budget alert exists. Deploy key added. `INGEST_KEY` stored.

---

## Phase 2: deploy shoplister and the fetch job

Work happens in `fzn09/shoplister`, on a branch from the merged `harden-auth-and-bring-cache`.

### 2.1 Add the job command

New file `rewe_job.py` at the repo root. The sketch below is untested.

```python
"""Fetch REWE eBon items and push them to the dashboard Worker. Run by systemd at boot."""
import argparse, datetime as dt, json, os, sys, time
import urllib.error, urllib.request
from dotenv import load_dotenv

load_dotenv()


def build_payload(items, status="ok", message=""):
    return {
        "status": status,
        "message": message[:200],
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "items": [
            {"name": i.get("name"), "qty": i.get("qty", 1),
             "total_price": i.get("total_price"), "purchase_date": i.get("purchase_date")}
            for i in items
        ],
    }


def push(payload):
    req = urllib.request.Request(
        os.environ["INGEST_URL"], data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + os.environ["INGEST_KEY"],
                 "User-Agent": "shoplister-rewe-job/1"},   # Cloudflare can reject the default Python UA
    )
    last = None
    for wait in (0, 5, 20):
        time.sleep(wait)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
    raise RuntimeError("push failed: %s" % last)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="write data/last_payload.json, do not push")
    args = ap.parse_args()
    try:
        from rewe_service import load_rewe_purchases
        from database import get_latest_rewe_bons
        items = load_rewe_purchases(force_refresh=True)
        if get_latest_rewe_bons(10) and not items:
            raise RuntimeError("bons found but parser returned no items")
        payload = build_payload(items)
    except Exception as e:                      # report the failure, keep the last good data on the Worker
        payload = build_payload([], status="error", message=str(e))
    if args.dry_run:
        with open("data/last_payload.json", "w") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(payload["status"], len(payload["items"]), "items")
    else:
        push(payload)
    return 0 if payload["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
```

Rules the Worker applies to this payload (Phase 3): `status: "error"` keeps the previous items and records the message.
`status: "ok"` replaces them.

### 2.2 Dependencies and tests

- `requirements-job.txt`: `imap-tools`, `pdfplumber`, `python-dotenv`, each pinned to the version you test with. The job
  does not import FastAPI, aiohttp or the Bring! client, so the venv stays small on 1 GiB.
- Keep the existing `requirements.txt` for the web UI.
- Add `test_rewe_job.py` for `build_payload` (field names, `status: "error"` path, empty list) with a fixture list. Run
  it directly, as the other `test-*.py` files in this project style do.

### 2.3 Run it on your own machine first

With a local `.env` holding `EMAIL_USER` and `EMAIL_PASS`:

```sh
python rewe_job.py --dry-run && python -m json.tool data/last_payload.json | head -40
```

Compare item names, quantities and totals with one real eBon PDF. Quantities default to 1.0 unless an "N Stk x price"
line follows, so differences there are expected. Stop and report if names or totals are wrong: the parser is the risk in
this design, not the infrastructure. Check whether deposit and bag lines appear, since the fridge view needs a decision
on them.

### 2.4 Install on the instance

Start the instance if it is stopped (`aws ec2 start-instances`), open a session, then:

```sh
sudo -u shoplister git clone git@github.com:fzn09/shoplister.git /opt/shoplister/app
cd /opt/shoplister/app && sudo -u shoplister git checkout <BRANCH>
sudo -u shoplister python3 -m venv /opt/shoplister/venv
sudo -u shoplister /opt/shoplister/venv/bin/pip install -r requirements-job.txt
```

Create `/etc/shoplister/env` with `sudoedit`:

```ini
EMAIL_USER=<gmail address>
EMAIL_PASS=<gmail app password, written without spaces>
REWE_SENDER_EMAIL=ebon@mailing.rewe.de
REWE_LOOKBACK_DAYS=30
INGEST_URL=https://<worker-host>/api/ingest
INGEST_KEY=<value from step 1.9>
```

```sh
sudo chown root:shoplister /etc/shoplister/env && sudo chmod 640 /etc/shoplister/env
```

The code loads `.env` with `python-dotenv` from the working directory, and systemd supplies the same variables through
`EnvironmentFile=`. Do not create a `.env` in the repo on the instance.

Dry run as the service user:

```sh
cd /opt/shoplister/app
sudo -u shoplister env $(sudo cat /etc/shoplister/env | xargs) /opt/shoplister/venv/bin/python rewe_job.py --dry-run
sudo -u shoplister python3 -m json.tool data/last_payload.json | head -40
```

The item count must match what you saw on your own machine.

### 2.5 Poweroff helper and systemd unit

`/usr/local/bin/rewe-poweroff`:

```sh
#!/bin/sh
[ -e /etc/shoplister/keep-on ] && exit 0
/usr/bin/systemctl --no-block poweroff
```

```sh
sudo chmod 755 /usr/local/bin/rewe-poweroff
```

`/etc/systemd/system/rewe-job.service`:

```ini
[Unit]
Description=Fetch REWE eBon and push to the dashboard
Wants=network-online.target time-sync.target
After=network-online.target time-sync.target

[Service]
Type=oneshot
User=shoplister
Group=shoplister
WorkingDirectory=/opt/shoplister/app
EnvironmentFile=/etc/shoplister/env
ExecStart=/opt/shoplister/venv/bin/python rewe_job.py
ExecStopPost=+/usr/local/bin/rewe-poweroff
TimeoutStartSec=300
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/shoplister/app/data

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload && sudo systemctl enable rewe-job.service
```

`ExecStopPost` runs after success, failure and timeout, so every outcome ends in a stop. `ProtectHome=true` hides
`/home`, `/root` and `/run/user`. The service user's home is `/opt/shoplister`, which stays readable.

### 2.6 Boot test with the flag set

```sh
sudo touch /etc/shoplister/keep-on
exit
```

From your machine: `aws ec2 stop-instances`, wait, `aws ec2 start-instances`, reconnect via SSM, then:

```sh
journalctl -u rewe-job.service -b --no-pager | tail -30
```

Expected before the Worker route exists: the job runs, the push fails after three tries, the unit ends `failed`, and the
instance stays up because of `keep-on`. A failed push with a good dry run confirms the wiring. Switch the unit to a
dry-run `ExecStart` for this test if you want a clean `success`.

### 2.7 Boot test without the flag

```sh
sudo rm /etc/shoplister/keep-on
```

Stop and start the instance from your machine, record the time, and poll `state` until it reads `stopped`. The elapsed
time is the real cost per run. Replace the estimate in the spec with it.

### 2.8 Failure tests

| Test | Expected |
|---|---|
| Wrong `EMAIL_PASS` | Job posts `status: error` (once the Worker exists), exits 1, instance stops |
| Hang the job (`sleep 600` as `ExecStart`) | Unit killed at 300 s, `ExecStopPost` runs, instance stops |
| `keep-on` present | Instance stays up |
| Stop backstop | Start by hand at the backstop minute minus 5. The scheduled stop fires |

### 2.9 Patching routine

Monthly: `touch /etc/shoplister/keep-on`, start the instance, run `sudo apt-get update && sudo apt-get -y upgrade`,
reboot if required, remove `keep-on`, stop the instance. `unattended-upgrades` also runs during the short run windows.

### Phase 2 exit checks

- [ ] Dry run on the instance matches a real eBon.
- [ ] Without `keep-on`, a boot ends in `stopped`, and the duration is recorded.
- [ ] The hang test stops the instance.
- [ ] `/etc/shoplister/env` is 0640 `root:shoplister`. No secret is in the repo, the shell history or the AMI.

---

## Phase 3: dashboard changes

Branch from the base you chose: `git checkout -b feat/fridge-rewe <base>`. Paths are under `dashboard/`.

### 3.1 Pure mapper and tests

New `rewe-map.js`, the same pattern as `calc.js` and `views.js`:

- `mapIngest(payload)`: accepts `{status, message, updated_at, items[]}`. Rejects anything that is not an object, and
  caps items at 200 and strings at 80 characters. Returns `{status, message, updatedAt, items}` with items
  `{id, name, qty, total, date}`.
- `id`: a short hash of `date|name|n`, where `n` counts repeats of the same date and name in the payload. The same
  purchase gets the same id across runs, which the "used up" flag needs.
- `applyUsed(items, usedIds)`: sets `used` on each item.
- `test/rewe-map.test.mjs`: valid payload, error payload, oversize payload, repeated names on one date, bad types.

### 3.2 Worker: ingest route and gate exemption

Edit `worker.js`:

1. Route `POST /api/ingest` before `gate()`. The job has no cookie and no `X-Dash-Token`. Its own bearer check is the only
   control on this route. Every other path stays behind the gate.
2. Compare the bearer without a timing signal:

   ```js
   async function sameSecret(a, b) {
     const enc = new TextEncoder();
     const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
     return crypto.subtle.timingSafeEqual(x, y);
   }
   ```

3. Handler rules: 503 if `INGEST_KEY` or the KV binding is missing, 401 on a bad bearer, 413 above 256 KB, 400 on bad
   JSON. On `status: "ok"`, write `rewe:latest` with the mapped items. On `status: "error"`, keep the previous items and
   store the message and time. Prune `rewe:used` to ids present in the new items.
4. `GET /api/fridge`: read `rewe:latest` and `rewe:used`, return `{items, updatedAt, status, message}`. Answer 503 with an
   empty body when there is no entry, so the page keeps sample data.
5. `POST /api/fridge`: body `{op: 'use' | 'unuse', id}`, guarded by `guard()` like other writes. It reads, edits and
   writes `rewe:used`. KV is eventually consistent and limits writes to one per second per key. That is fine for one
   household. The page updates first and refreshes after.
6. Remove the Bring! fridge path: `which === 'fridge'` in `bringSession`, `BRING_FRIDGE_LIST`, and the `/api/fridge`
   branch in the shopping/fridge route. Shopping stays on Bring!.

`wrangler.jsonc`: add a KV binding `FRIDGE_KV` (create with `npx wrangler kv namespace create FRIDGE_KV`), list the
`INGEST_KEY` secret in the comment block, drop `BRING_FRIDGE_LIST`. Update the route comment in `worker.js` line 2.

Tests: extend `gate.test.mjs` (ingest reachable without cookie, everything else still 401), add `ingest.test.mjs` with a
fake KV in the style of `cookidoo.test.mjs` (auth cases, ok replaces, error keeps, prune, size limit).

### 3.3 Page data

- `js/data.js`: replace `fridge` and `fridgeUsuals` with `fridge: []` of REWE-shaped sample items and `fridgeMeta`
  `{updatedAt, status}`. Remove the Bring! comment at line 149.
- `js/fetch.js`: new `updateFridge(data)` sets `D.fridge`, `D.fridgeMeta`, `D.fridgeAt` and emits `'data'` and
  `'fridge'`. Replace `App.fridgeSync` with `App.fridgeUse(id, used)` that posts `{op, id}`. The 5 s, 15 s, 1 min retry
  stays. Poll `/api/fridge` every 5 minutes while `fridge` is enabled, because the Today tile reads it too. Remove the
  comment about Bring! logging in on every call.

### 3.4 Fridge view

Rewrite `js/views/fridge.js` and `css/views/fridge.css`. Remove the quick-add form, usuals, suggestions and expiry
presets.

- Header: "REWE", item count, total in EUR, "updated N min ago". One cached
  `Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR'})`.
- Body: rows grouped by purchase date, newest first (Today, Yesterday, then weekday and date). A row shows name, quantity
  when above 1, and price. Reuse the `.shop`, `.s-cat`, `.s-row` and `.s-name` classes from the Shopping stylesheet.
- Tap a row to mark it used up. A toast offers Undo and calls `App.fridgeUse`. A toggle shows used items.
- States: empty ("No eBon yet"), stale (age above 18 hours shows an "Overdue" chip, since the longest gap between runs is
  about 15 hours), error status (shows the stored message in small text, data stays).
- Frame rules: `rgba()` only, nothing under 16 px, no infinite animation, no `innerHTML` rebuild on timers, no
  `toSorted` or `Object.groupBy`. Repaint only when `App.current === 'fridge'`.

### 3.5 Today tile

`js/views/home.js` `fridge()` currently sorts by days left with `daysLeft`. Replace it with: count of unused items, the
date of the latest purchase, and the three newest unused items. Remove the `calc.js` import if nothing else uses it.
`calc.js` `withExpiry` and `daysLeft` then have no caller: delete them and their cases in `calc.test.mjs`, or keep them
for the estimated use-by idea in the spec. Decide before merging.

### 3.6 Docs

- `SETUP.md`: replace the Bring! fridge paragraph with the REWE feed, `INGEST_KEY`, and a pointer to this plan. Update
  the "What each feed needs" and routes tables.
- `ARCHITECTURE.md`: storage row (KV now also holds the fridge feed), route table, the view table row for Fridge, and the
  Request flow diagram with the ingest arrow.
- `PRODUCT.md`: no change unless the Thermomix work lands in the same branch.

### 3.7 Local verification

```sh
cd dashboard
for t in test/*.test.mjs; do node "$t" || break; done
npm run build
# .dev.vars: DASH_TOKEN=..., INGEST_KEY=test-key
npm run dev:live
curl -sS -X POST http://localhost:8787/api/ingest -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" -d @test/fixtures/ingest-ok.json
curl -sS -H "Cookie: hq=<DASH_TOKEN>" http://localhost:8787/api/fridge
```

Also check: the same POST without the bearer returns 401, `GET /api/fridge` without the cookie returns 401, and a
`status: "error"` payload leaves the previous items in place. Add `test/fixtures/ingest-ok.json` with invented items,
never real receipts. The `frame-compat-reviewer` agent named in `CLAUDE.md` is not present in this checkout (no
`.claude/` directory), so review the diff by hand against `docs/building-for-the-frame.md`. Stale `workerd` processes can hold the `dev:live`
port, so use a fresh port and restart wrangler after each rebuild.

### 3.8 Deploy and first live run

1. `npx wrangler secret put INGEST_KEY` with the value from step 1.9.
2. `npm run deploy`. Open `/?key=<DASH_TOKEN>` once on the frame if the cookie is not set.
3. Set `INGEST_URL` in `/etc/shoplister/env` to the deployed `/api/ingest` URL.
4. On the instance with `keep-on` set: `sudo systemctl start rewe-job.service`, then
   `journalctl -u rewe-job.service --no-pager | tail`. Expect exit 0.
5. `curl` `/api/fridge` with the cookie. `updatedAt` must be current and the items must match the dry run.
6. Frame: reload the kiosk, open Fridge, check the header age, a used-up tap and undo, and the Today tile. For
   debugging use `adb -d reverse tcp:5173 tcp:5173`, launch the kiosk with `--ez debug true`, and open
   `chrome://inspect`.
7. Remove `keep-on`. Enable the six schedules:

   ```sh
   export SCH_CMD=update-schedule SCH_STATE=ENABLED     # with IID and ROLE_ARN still set from Phase 1
   mk shoplister-start-1230 30 12 startInstances
   mk shoplister-stop-1250  50 12 stopInstances
   mk shoplister-start-1830 30 18 startInstances
   mk shoplister-stop-1850  50 18 stopInstances
   mk shoplister-start-2130 30 21 startInstances
   mk shoplister-stop-2150  50 21 stopInstances
   aws scheduler list-schedules --query 'Schedules[].[Name,State]' --output text
   ```

   `update-schedule` replaces the whole definition, which is why the `mk` function is reused. Define `mk` again first if
   the shell was closed.
8. Next day: confirm three `updatedAt` values moved and the instance reads `stopped` between runs.

### Rollback

- Disable the schedules (`--state DISABLED`) and stop the instance. The frame keeps the last KV data.
- Redeploy the previous Worker version (`npx wrangler rollback`). The Bring! fridge list was never edited, so the old
  fridge view works again as soon as that Worker is live.
- Delete the Bring! "Fridge" list only after the new view has run for a few weeks.

### Phase 3 exit checks

- [ ] All `node test/*.test.mjs` pass and `npm run build` succeeds.
- [ ] Ingest without the bearer returns 401. Fridge without the cookie returns 401.
- [ ] A scheduled run moves `updatedAt` without anyone touching the instance.
- [ ] The frame shows the REWE items, the age, and survives the Worker being unreachable by keeping its last data.
- [ ] After a day, the AWS bill shows no running hours outside the run windows.

---

## Risks to watch

| Risk | Mitigation |
|---|---|
| Parser misreads a receipt layout change | Job reports `error` when bons exist and no items parse. The page keeps old data and shows the message |
| Instance fails to power off | `TimeoutStartSec`, the stop backstop, and the budget alert |
| Eventual consistency in KV delays a used-up tap on another device | Single frame. The tapping device updates first |
| Gmail app password exposure | Separate account, forwarding rule, secret only in `/etc/shoplister/env` |
| Public IPv4 and EBS charges | Auto-assigned IP only, volume 16 GB. Check current AWS pricing |
