# Guide: REWE fridge view, step by step

Plain-language walkthrough of [PLAN-rewe-fridge.md](PLAN-rewe-fridge.md). The plan stays the source of truth for code
blocks (step numbers match: 1.4, 2.5, 3.2 ...). This guide adds the "where to click", "what to type" and "what to save".
Console labels change now and then. If a button is named slightly differently, use the search box at the top of the AWS
console and type the service name.

## 0. The idea in 60 seconds

Your frame cannot read your REWE eBon mails. So a tiny server does it for you:

1. **Three times a day** a timer (EventBridge Scheduler) switches a small AWS server (EC2) on.
2. The server boots, runs one script: read the eBon mail from Gmail, extract the items from the PDF, send them to your
   Cloudflare Worker.
3. The script finishes and the server switches itself off. You pay only for the few minutes it ran.
4. The Worker stores the items (KV). The frame asks the Worker and shows them.

| Word | Meaning |
|---|---|
| **EC2** | A rented virtual computer. "Stopped" = off, you pay only for its disk |
| **IAM** | AWS users and permissions. A **role** is a permission badge a service wears |
| **Security group** | The firewall of the server. Ours has no inbound rules, so nobody can connect in |
| **SSM Session Manager** | A shell on the server through AWS, no SSH keys, no open port |
| **EventBridge Scheduler** | The timer that starts and stops the server |
| **KV** | Cloudflare's small key-value store where the Worker keeps the fridge items |
| **Region** | Which AWS data centre. We use `eu-central-1` (Frankfurt). Check it top right in the console every time |

## 0.1 Your "save" sheet

Make one entry in your password manager called `shoplister-aws` and fill it as you go. Never put these in git, chat or
a screenshot.

| Item | Where it comes from | Used for |
|---|---|---|
| AWS account ID (12 digits) | Console, top right account menu | Reference |
| Root user password + MFA | Step 1 | Emergencies only |
| IAM user name + password | Step 1 | Console login for daily work |
| Access key ID + secret | Step 3 | Local `aws` CLI |
| `IID` (instance id, `i-...`) | Step 1.5 | Every later command |
| `SG` (security group id, `sg-...`) | Step 1.3 | Reference |
| `ROLE_ARN` | Step 1.10 | Creating schedules |
| Gmail app password | Step 1.1 | `EMAIL_PASS` on the server |
| `INGEST_KEY` | Step 1.9 | Shared secret server to Worker |
| `DASH_TOKEN` | Already exists | Reading `/api/fridge` |
| Worker URL | Cloudflare | `INGEST_URL` |
| Chosen budget amount | Step 2 | Cost alert |

`IID`, `SG` and `ROLE_ARN` are not secrets, but you need them again in a new terminal. If you close the terminal, they
are gone. Re-create them with:

```sh
export AWS_REGION=eu-central-1
IID=<i-...>
ROLE_ARN=$(aws iam get-role --role-name shoplister-scheduler-role --query Role.Arn --output text)
```

---

# Phase 1: AWS setup

## Step 1. Account, MFA, daily user

1. Go to `aws.amazon.com`, **Create an AWS Account**. It asks for a card. Choose the **Basic (free) support plan**.
2. Sign in as the **root user**. Top right, click your account name, **Security credentials**, **Assign MFA device**,
   choose **Authenticator app**, scan the QR code with an authenticator app, enter two consecutive codes.
3. Do not use root again. Create a daily user:
   - Search **IAM**, open it, **Users**, **Create user**.
   - User name `fauzan-admin`. Tick **Provide user access to the AWS Management Console**, choose **I want to create an
     IAM user**, set a password.
   - **Next**, **Attach policies directly**, tick `AdministratorAccess`, **Next**, **Create user**.
   - Save the console sign-in URL shown (it contains your account ID).
4. Sign out, sign in with that URL as `fauzan-admin`. Open the user, **Security credentials**, **Assign MFA device**
   again for this user.
5. Top right, set the region to **Europe (Frankfurt) eu-central-1**.

## Step 2. Billing guard (do this before anything else)

1. Search **Billing and Cost Management**, left menu **Budgets**, **Create budget**.
2. **Use a template (simplified)**, **Monthly cost budget**.
3. Budget name `monthly-guard`, amount: pick something low (a few euro), put your email, **Create budget**.

If your IAM user cannot see Billing: root user, account menu, **Account**, scroll to **IAM user and role access to
Billing information**, **Edit**, activate.

**Check:** the budget appears in the list. **Save:** the amount you chose.

## Step 3. Install and configure the AWS CLI (Windows)

You run the plan's commands in **Git Bash** (comes with Git for Windows). They use `export`, `$(...)` and heredocs, so
plain PowerShell will not work. WSL also works.

1. Install the CLI. In PowerShell:

   ```powershell
   winget install Amazon.AWSCLI
   ```

   Close and reopen the terminal, then `aws --version`. Expect `aws-cli/2.x`.
2. Create an access key in the console: **IAM**, **Users**, `fauzan-admin`, **Security credentials**, **Create access
   key**, use case **Command Line Interface**, tick the confirmation, **Create**. Copy **Access key ID** and **Secret
   access key** now. The secret is shown once. Save both in your password manager.
3. Configure:

   ```sh
   aws configure
   ```

   Answers, one by one:

   | Prompt | Type |
   |---|---|
   | AWS Access Key ID | the key id |
   | AWS Secret Access Key | the secret |
   | Default region name | `eu-central-1` |
   | Default output format | `json` |

4. Check who you are:

   ```sh
   aws sts get-caller-identity
   ```

   Expect your account ID and `user/fauzan-admin`. If you get `InvalidClientTokenId`, a key was mistyped: run
   `aws configure` again.

Credentials land in `C:\Users\<you>\.aws\credentials`. Never commit that folder. (The plan also allows `aws configure
sso`. That is safer because keys expire, but needs IAM Identity Center first. The access key is the shorter path.)

## Step 4. Session Manager plugin (the way into the server)

1. Download the Windows installer from AWS docs, page "Install the Session Manager plugin on Windows", run it.
2. New terminal: `session-manager-plugin --version`. It prints a version, no error.

## Step 5. The other prerequisites (plan 1.1)

- **Gmail app password.** Google Account, **Security**, make sure **2-Step Verification** is on, then search **App
  passwords**, name it `shoplister`, copy the 16 characters. Write it **without spaces** into your save sheet. Do this in
  the account that actually holds the eBon mails (or the separate account you forward them to).
- **eBon mail exists.** In that Gmail, search `from:ebon@mailing.rewe.de` and confirm one mail has `REWE-eBon.pdf`.
  Note how long after shopping it arrives.
- **Cloudflare.** In `dashboard/`, run `npx wrangler whoami`. It must show your account.
- **shoplister repo.** Check `harden-auth-and-bring-cache` is merged on `github.com/fzn09/shoplister`.

## Step 1.3 Network (security group)

In Git Bash:

```sh
export AWS_REGION=eu-central-1
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --group-name shoplister-sg \
  --description "shoplister, no inbound" --vpc-id "$VPC" --query GroupId --output text)
echo "$SG"
```

**Check (console):** EC2, **Security Groups**, `shoplister-sg`, **Inbound rules** tab is empty. Leave it empty.
**Save:** `SG`.

## Step 1.4 Instance role

Copy the block from plan 1.4 and run it. It creates a role that lets the server talk to Session Manager and nothing else.

**Check (console):** IAM, **Roles**, search `shoplister-ec2-role`, **Permissions** shows `AmazonSSMManagedInstanceCore`.
Wait 10 seconds before the next step.

## Step 1.5 Launch the server

Copy the block from plan 1.5. It prints the instance id, for example `i-0abc123...`.

**Save:** `IID`.

**Check (console):** EC2, **Instances**. A row named `shoplister`, type `t4g.micro`, state **Running**. Select it,
**Storage** tab: 16 GiB, encrypted.

If `run-instances` says `Invalid IAM Instance Profile name`, wait a minute and repeat.

## Step 1.6 Connect

```sh
aws ec2 wait instance-running --instance-ids "$IID"
aws ssm describe-instance-information --query 'InstanceInformationList[].[InstanceId,PingStatus]' --output text
aws ssm start-session --target "$IID"
```

The second command must show your `i-...` with `Online`. Empty output: wait 2 to 5 minutes and retry. Still empty:
role not attached (EC2 console, instance, **Actions**, **Security**, **Modify IAM role**), or no public IPv4 (instance
**Networking** tab).

You are in when the prompt changes to `$` on the server. Type `exit` to leave. Everything in the next steps that says
"inside the session" runs there.

Console alternative: EC2, tick the instance, **Connect**, tab **Session Manager**, **Connect**. Same shell in the browser.

## Step 1.7 Prepare the server

Inside the session, paste the block from plan 1.7. In short: update the OS, enable automatic security updates, add 1 GiB
swap (the server has 1 GiB RAM), create the `shoplister` service user and its folders.

The `dpkg-reconfigure` command opens a blue dialog: pick **Yes** with the arrow keys and Enter.

**Check:** `ls -ld /etc/shoplister /opt/shoplister/app/data` shows both folders. `free -h` shows about 1 GiB swap.

## Step 1.8 Let the server read your repo

1. Inside the session, run the four commands in plan 1.8. The last one prints a line starting `ssh-ed25519`. Copy it.
2. On GitHub: `fzn09/shoplister`, **Settings**, **Deploy keys**, **Add deploy key**. Title `shoplister-ec2`, paste the
   key, leave **Allow write access** unticked, **Add key**.

## Step 1.9 Make the ingest secret

On your PC in Git Bash:

```sh
openssl rand -hex 32
```

Copy the 64 characters into the password manager as `INGEST_KEY`. Do not paste it anywhere else yet.

## Step 1.10 Scheduler role

Run the block in plan 1.10 on your PC (needs `IID` and `SG` still set). It makes a role that may start and stop this one
server. **Save:** `ROLE_ARN` (it prints from the last line if you `echo "$ROLE_ARN"`).

## Step 1.11 Create the six timers (disabled)

Run the `mk` function and the six `mk ...` lines from plan 1.11. They are created disabled, so nothing happens yet.

**Check (console):** search **EventBridge**, left menu **Scheduler**, **Schedules**. Six rows named
`shoplister-start-*` and `shoplister-stop-*`, status **Disabled**, timezone Europe/Berlin.

## Step 1.12 Test stop and start by hand

Run the two lines from plan 1.12. Expected output: `stopped None`, then `running <some IP>`. The IP changes on each
start. That is normal and is why we do not use fixed addresses.

Then run the one-off schedule from plan 1.12. Replace the time with **a few minutes from now** in this exact form:
`at(2026-11-05T14:30:00)` (Berlin time, because of the timezone flag). Wait, then check the instance state. It must read
`stopped`. If not: console, Scheduler, open the schedule, look at **Execution** / dead-letter errors, then check the role's
resource ARN.

## Phase 1 done when

- [ ] Session Manager works and the security group has no inbound rules.
- [ ] Manual stop and start work.
- [ ] The one-off timer stopped the server.
- [ ] Six disabled schedules exist.
- [ ] Budget exists, deploy key added, `INGEST_KEY` saved.

At this point the server is running (from the test). Stop it if you will pause here:
`aws ec2 stop-instances --instance-ids "$IID"`.

---

# Phase 2: the fetch job on the server

Goal: the server can read Gmail, parse the PDF and write a JSON file. The Worker is not involved yet.

## Step 2.1 Write the job (in the shoplister repo)

Open the `fzn09/shoplister` repo on your PC, branch from the merged hardening branch, and add `rewe_job.py` from plan 2.1.
It does three things: parse eBons using shoplister's existing code, build a JSON payload, POST it with the bearer key.
`--dry-run` writes `data/last_payload.json` instead of posting. Commit and push the branch.

## Step 2.2 Dependencies and tests

Add `requirements-job.txt` with `imap-tools`, `pdfplumber`, `python-dotenv`, pinned to the versions you test. Add
`test_rewe_job.py`. Run it directly with `python test_rewe_job.py`.

## Step 2.3 Try it on your PC first (the important step)

1. In the shoplister folder create `.env` (git-ignored) with `EMAIL_USER=<gmail>` and `EMAIL_PASS=<app password>`.
2. `python rewe_job.py --dry-run`
3. Open `data/last_payload.json` and compare with a real eBon PDF: names, quantities, totals.

If the items are wrong, **stop**. The parser is the risk, not AWS. Also note whether deposit (Pfand) and bag lines
show up and decide if you want them in the fridge.

## Step 2.4 Install on the server

1. Start the server: `aws ec2 start-instances --instance-ids "$IID"`, wait, `aws ssm start-session --target "$IID"`.
2. Run the clone, venv and pip lines from plan 2.4. Replace `<BRANCH>` with your branch name.
3. Create the secrets file:

   ```sh
   sudoedit /etc/shoplister/env
   ```

   `sudoedit` opens `nano`. Paste the six lines from plan 2.4, fill in your values, save with `Ctrl+O`, Enter, exit with
   `Ctrl+X`. For now `INGEST_URL` can be any placeholder URL, you fix it in step 3.8.
4. Lock the file: the two `chown`/`chmod` lines from plan 2.4.
5. Dry run as the service user (plan 2.4, last block). The printed item count must equal what you saw on your PC.

**Never** create a `.env` file in the repo on the server. Secrets live only in `/etc/shoplister/env`.

## Step 2.5 Auto power-off and systemd

systemd is Linux's service manager. A "unit" file tells it what to run at boot.

1. Create the helper with `sudoedit /usr/local/bin/rewe-poweroff`, paste the 3 lines from plan 2.5, then
   `sudo chmod 755 /usr/local/bin/rewe-poweroff`.
2. Create the unit with `sudoedit /etc/systemd/system/rewe-job.service`, paste the unit from plan 2.5.
3. `sudo systemctl daemon-reload && sudo systemctl enable rewe-job.service`

What it does at boot: wait for network, run the job, then (success or failure) run the poweroff helper, unless the file
`/etc/shoplister/keep-on` exists. That file is your "do not shut down, I am working" switch.

## Step 2.6 Boot test with the safety flag

```sh
sudo touch /etc/shoplister/keep-on
exit
```

On your PC: stop, wait, start the server, reconnect, then read the log:

```sh
journalctl -u rewe-job.service -b --no-pager | tail -30
```

Expected for now: the job runs, the push fails three times (the Worker has no ingest route yet), the unit ends
`failed`, the server stays up. That proves the wiring.

## Step 2.7 Boot test without the flag

Inside the session: `sudo rm /etc/shoplister/keep-on`, `exit`. On your PC stop and start the server, note the time,
then poll the state (the `state` function from plan 1.12) until it says `stopped`. That duration is your real cost per
run. Write it into the spec.

## Step 2.8 Failure tests

Run the four tests in the plan's table (wrong password, hung job, keep-on, backstop). Each must end as the table says.

## Phase 2 done when

- [ ] Server dry run matches a real eBon.
- [ ] A boot without `keep-on` ends in `stopped`, duration noted.
- [ ] The hang test stops the server.
- [ ] `ls -l /etc/shoplister/env` shows `-rw-r----- root shoplister`.

---

# Phase 3: dashboard and Worker

Everything below is in `dashboard/` of this repo.

## Step 3.1 Branch

```sh
git checkout -b feat/fridge-rewe <base>
```

The base branch is still undecided (see plan "Decide before starting"). Pick one before you start. Cookidoo and
Home Assistant work have diverged, so this choice matters.

## Step 3.1 to 3.6 Code changes

Follow plan 3.1 to 3.6. Order that works best:

1. `rewe-map.js` and `test/rewe-map.test.mjs` (pure functions, easy to test).
2. Worker: `POST /api/ingest`, `GET` and `POST /api/fridge`, remove the Bring! fridge code.
3. KV namespace and `wrangler.jsonc` (below).
4. Page: `data.js`, `fetch.js`, the fridge view and CSS, the Today tile.
5. Docs: `SETUP.md`, `ARCHITECTURE.md`.

### Create the KV namespace

```sh
cd dashboard
npx wrangler kv namespace create FRIDGE_KV
```

It prints a JSON snippet with an `id`. Paste that into `wrangler.jsonc` under `kv_namespaces` with binding
`FRIDGE_KV`, as the plan says. KV is Cloudflare's, not AWS's: you can also see it in the Cloudflare dashboard under
**Storage & Databases**, **KV**.

## Step 3.7 Test locally

1. `.dev.vars` in `dashboard/`: `DASH_TOKEN=...` and `INGEST_KEY=test-key`.
2. Run all tests, build, start the live server:

   ```sh
   for t in test/*.test.mjs; do node "$t" || break; done
   npm run build
   npm run dev:live
   ```
3. In a second terminal run the two `curl` lines from plan 3.7. The first (POST with `Bearer test-key`) must succeed,
   the GET must return your fake items.
4. Also check the three failure cases listed in the plan (no bearer gives 401, no cookie gives 401, an error payload
   keeps old items).

Use invented receipt data in `test/fixtures/ingest-ok.json`, never real ones.

## Step 3.8 Go live

Do these in order.

1. Store the real secret in Cloudflare:

   ```sh
   npx wrangler secret put INGEST_KEY
   ```

   It asks you to paste the value. Use the `INGEST_KEY` from your save sheet.
2. `npm run deploy`. Note the Worker URL it prints. **Save:** it as `INGEST_URL` base.
3. On the server (start it, open a session): `sudoedit /etc/shoplister/env`, set
   `INGEST_URL=https://<your-worker-host>/api/ingest`. Also `sudo touch /etc/shoplister/keep-on` so it stays up.
4. Run it by hand:

   ```sh
   sudo systemctl start rewe-job.service
   journalctl -u rewe-job.service --no-pager | tail
   ```

   Expect exit code 0 and no errors.
5. From your PC check what the Worker stored:

   ```sh
   curl -sS -H "Cookie: hq=<DASH_TOKEN>" https://<your-worker-host>/api/fridge
   ```

   `updatedAt` is now and the items equal your dry run.
6. On the frame: reload, open **Fridge**, check items, age, tap an item (used-up) and undo, and the Today tile.
7. **Switch it on.** In the server session `sudo rm /etc/shoplister/keep-on`, `exit`. On your PC, set the variables
   and enable the six schedules with the `update-schedule` block in plan 3.8 (define the `mk` function again first if
   the terminal is new, plus `IID` and `ROLE_ARN`).

   **Check (console):** EventBridge, Scheduler, Schedules: all six show **Enabled**.
8. **Next day:** `updatedAt` should have moved three times, and EC2 should show `stopped` between runs.

## Rollback

- Pause everything: set the six schedules to `DISABLED` (same block with `SCH_STATE=DISABLED`), then
  `aws ec2 stop-instances --instance-ids "$IID"`. The frame keeps the last data.
- Old Worker back: `npx wrangler rollback`.

## Phase 3 done when

- [ ] All tests pass and the build works.
- [ ] Ingest without bearer: 401. Fridge without cookie: 401.
- [ ] A scheduled run updates the fridge with nobody touching anything.
- [ ] The frame shows REWE items and age.
- [ ] After a day, Billing shows no running hours outside the run windows. (Console: **Billing**, **Bills**, or
  **Cost Explorer**. Data lags up to a day.)

---

# Where to look when something breaks

| Symptom | Look here |
|---|---|
| `aws` says "Unable to locate credentials" | Re-run `aws configure`, then `aws sts get-caller-identity` |
| Command works but resource not found | Wrong region. `export AWS_REGION=eu-central-1` and check console top right |
| Variables empty (`$IID` blank) | New terminal. Re-set them from the save sheet |
| Server not `Online` in SSM | Role attached? Public IPv4 present? Wait 5 minutes after boot |
| Server did not turn off | `sudo journalctl -u rewe-job.service`. The stop timer should still kill it at +20 min. Check Billing |
| Schedule did not fire | EventBridge, Scheduler, open schedule, check state and role ARN. Time is Berlin local |
| Job log says login failed | Wrong `EMAIL_PASS`: use the app password, no spaces |
| Worker returns 401 on ingest | `INGEST_KEY` differs between `/etc/shoplister/env` and `wrangler secret` |
| Worker returns 503 on ingest | KV binding or `INGEST_KEY` missing in the deployed Worker |

# Cleanup, if you ever abandon this

1. Delete the six schedules (EventBridge, Scheduler, select all, **Delete**).
2. EC2, select instance, **Instance state**, **Terminate**. This deletes the disk.
3. Delete security group `shoplister-sg`, roles `shoplister-ec2-role` and `shoplister-scheduler-role`, instance profile
   `shoplister-ec2-profile`.
4. Delete the GitHub deploy key and the Gmail app password.
5. Delete the IAM access key (IAM, Users, Security credentials, **Deactivate**, **Delete**).
