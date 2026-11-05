# REWE fridge view: complete setup guide

One start-to-finish guide. It replaces the old separate guide and plan. Follow it top to bottom, nothing jumps elsewhere.
Background and reasons are in [SPEC-home-bridge.md](SPEC-home-bridge.md), section 3a.

**Status:** Phase 1 is partly done (see [You are here](#you-are-here)). Phases 2 and 3 have not started. Commands are
written from the AWS docs and checked for PowerShell syntax, but most have not yet run against real AWS. If one fails,
stop and read the error before trying a variation.

---

# Part A: read this first

## The idea in 60 seconds

Your frame cannot read your REWE eBon mails, so a tiny server does it:

1. **Three times a day** a timer (EventBridge Scheduler) switches a small AWS server (EC2) on.
2. The server boots and runs one script: read the eBon mail from Gmail, pull the items out of the PDF, send them to your
   Cloudflare Worker.
3. The script finishes and the server switches itself off. You pay only for the few minutes it ran.
4. The Worker stores the items (KV). The frame asks the Worker and shows them.

```text
EventBridge Scheduler ─ StartInstances ─▶ EC2 t4g.micro boots
  systemd rewe-job: fetch eBon (Gmail IMAP) ─ parse PDF ─ POST /api/ingest ─▶ Worker ─▶ KV
  ExecStopPost: poweroff unless /etc/shoplister/keep-on exists          ▲
EventBridge Scheduler ─ StopInstances (backstop, +20 min)               │
Frame ── GET /api/fridge ── Worker reads KV ────────────────────────────┘
```

| Word | Meaning |
|---|---|
| **EC2** | A rented virtual computer. "Stopped" means off, and you pay only for its disk |
| **IAM** | AWS users and permissions. A **role** is a permission badge a service wears |
| **Security group** | The server's firewall. Ours has no inbound rules, so nobody can connect in |
| **Session Manager (SSM)** | A shell on the server through AWS. No SSH keys, no open port |
| **EventBridge Scheduler** | The timer that starts and stops the server |
| **systemd** | Linux's service manager. A "unit" file tells it what to run at boot |
| **KV** | Cloudflare's small key-value store, where the Worker keeps the fridge items |
| **Region** | Which AWS data centre. We use `eu-central-1` (Frankfurt). Check it top right in the console every time |

## The two places you type

This is the most important thing in the guide. Every command block below is labelled with where it runs.

| Label | What it is | How to open it | The prompt looks like |
|---|---|---|---|
| **LAPTOP** | PowerShell in VS Code | VS Code, **Terminal**, **New Terminal** | `PS D:\Projects\...>` |
| **SERVER** | A Linux shell in your browser | See below | `ssm-user@ip-172-...$` or `$` |
| **FILE** | Text to put in a file. Do not run it | | |

**Set up LAPTOP once.** Press `Ctrl+Shift+P`, run **Terminal: Select Default Profile**, choose **Windows PowerShell**, and
open a new terminal. Do not use Git Bash for this project. It rewrites paths that start with `/` and its window garbles
pasted commands.

**Open SERVER each time.**

1. Sign in to the AWS console as `fauzan-admin`. The region top right must be **Europe (Frankfurt)**.
2. Search **EC2**, open **Instances**, tick `shoplister`.
3. Click **Connect**, tab **Session Manager**, **Connect**. A terminal opens in a browser tab.

Paste with `Ctrl+V` or right-click, **Paste** (allow clipboard access if the browser asks). Do not press `Ctrl+W`, it
closes the tab. The session drops after about 20 idle minutes. Just connect again.

The server has to be running and `Online` for this. If the tab has no Connect button, wait a few minutes.

Optional: the **AWS Toolkit** extension for VS Code can also open a server terminal inside VS Code. It is not needed and
this guide does not use it. `aws ssm start-session --target $IID` from LAPTOP works too.

**Wrong window?**

| You see | Meaning |
|---|---|
| `aws: not found` | You ran a LAPTOP command on the SERVER |
| Windows says `sudo is disabled` | You ran a SERVER command on the LAPTOP |
| `The term 'sudo' is not recognized` | Same, you are on the LAPTOP |

## Start of every LAPTOP window

PowerShell forgets everything when the window closes. So at the start of **every new LAPTOP window**, paste this whole
block. It finds your server by name and defines the short commands used later (`state`, `stopnow`, `maint`, `testboot`).

**LAPTOP:**

```powershell
$env:AWS_REGION = 'eu-central-1'
$env:AWS_DEFAULT_REGION = 'eu-central-1'
$env:AWS_PAGER = ''
$IID = aws ec2 describe-instances --filters 'Name=tag:Name,Values=shoplister' 'Name=instance-state-name,Values=pending,running,stopping,stopped' --query 'Reservations[0].Instances[0].InstanceId' --output text
$SG = aws ec2 describe-security-groups --filters 'Name=group-name,Values=shoplister-sg' --query 'SecurityGroups[0].GroupId' --output text
$ROLE_ARN = aws iam get-role --role-name shoplister-scheduler-role --query Role.Arn --output text 2>$null

# Is the server on?
function state {
  aws ec2 describe-instances --instance-ids $IID --query 'Reservations[0].Instances[0].[State.Name,PublicIpAddress]' --output text
}

# Turn the server off and wait until it is off.
function stopnow {
  aws ec2 stop-instances --instance-ids $IID | Out-Null
  aws ec2 wait instance-stopped --instance-ids $IID
  state
}

# Start the server for maintenance: sets keep-on so it does not switch itself off under you.
function maint {
  aws ec2 start-instances --instance-ids $IID | Out-Null
  aws ec2 wait instance-running --instance-ids $IID
  do {
    Start-Sleep 5
    $c = aws ssm send-command --instance-ids $IID --document-name AWS-RunShellScript --parameters 'commands=touch /etc/shoplister/keep-on' --query Command.CommandId --output text 2>$null
  } until ($c)
  'Sent. In a minute or two open SERVER and check with: sudo ls /etc/shoplister'
}

# Start the server, wait until it switches itself off, say how long it took.
function testboot {
  $t0 = Get-Date
  aws ec2 start-instances --instance-ids $IID | Out-Null
  aws ec2 wait instance-running --instance-ids $IID
  aws ec2 wait instance-stopped --instance-ids $IID
  state
  "Took $([int]((Get-Date) - $t0).TotalSeconds) seconds"
}

"IID=$IID  SG=$SG  ROLE=$ROLE_ARN"
```

The last line should print `IID=i-...  SG=sg-...`. `None` or a blank is normal for anything you have not created yet.
`ROLE` stays blank until step 1.10.

## Rules for the whole guide

- `<ANGLE BRACKETS>` are placeholders. Replace them, brackets included.
- Secrets never go in git, chat, a screenshot, or a command typed at a prompt. Never pass the Gmail app password or
  `INGEST_KEY` through `aws ssm send-command`, because AWS stores command parameters.
- Stop the server when you pause: `stopnow`. A running server costs money.
- Console labels change now and then. If a button has a slightly different name, use the search box at the top of the AWS
  console.

**Save sheet.** Keep one entry called `shoplister-aws` in your password manager.

| Item | Comes from | Used for |
|---|---|---|
| Root user password + MFA | Step 1.1 | Emergencies only |
| IAM user name + password | Step 1.1 | Console login |
| Access key ID + secret | Step 1.2 | LAPTOP `aws` commands |
| Gmail app password | Step 1.2 | `EMAIL_PASS` on the server |
| `INGEST_KEY` | Step 1.9 | Shared secret between server and Worker |
| `DASH_TOKEN` | Already exists | Reading `/api/fridge` |
| Worker URL | Step 3.8 | `INGEST_URL` |

`IID`, `SG` and `ROLE_ARN` need no saving. The start block looks them up.

## Decisions

| Decision | Choice |
|---|---|
| Runs per day | 12:30, 18:30, 21:30 Europe/Berlin |
| Region | `eu-central-1` |
| Gmail account for IMAP | A separate account that receives forwarded eBon mails |
| Base branch for the dashboard work | **Not chosen yet.** Decide at step 3.1 |

## You are here

As of 2026-11-05. Steps 1.3 to 1.8 are done, with some things not confirmed. Do these next.

1. **LAPTOP:** paste the [start block](#start-of-every-laptop-window). `IID` must start with `i-`. Then check the region:

   ```powershell
   aws ec2 describe-instances --instance-ids $IID --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' --output text
   state
   ```

   The first line must start with `eu-central-1`. If `IID` is `None`, the server is in another region: stop here and find
   it in the console (EC2, **EC2 Global View**).
2. **SERVER:** open it and paste this. It only reads, it changes nothing.

   ```sh
   sudo ls -ld /etc/shoplister /opt/shoplister/app/data /var/log/journal
   free -h | grep -i swap
   grep -c '^/swapfile' /etc/fstab
   dpkg -s python3-venv python3-pip git unattended-upgrades | grep -c 'install ok installed'
   cat /etc/apt/apt.conf.d/20auto-upgrades
   ```

   | Line | Must show |
   |---|---|
   | `ls` | `/etc/shoplister` is `root shoplister`, `app/data` is `shoplister shoplister`, `/var/log/journal` exists |
   | Swap | About `1.0Gi` |
   | `/swapfile` count | `1` |
   | Package count | `4` |
   | `20auto-upgrades` | Two lines, both ending `"1";` |

3. **Budget:** check that step 1.1 part 3 exists. It was not in your notes.
4. **Deploy key:** do the GitHub half of step 1.8.
5. **New `INGEST_KEY`:** the old one was visible in a screenshot, so it is burned. Do step 1.9 again.
6. Carry on from step 1.10.

---

# Phase 1: AWS setup

Goal: a server you can reach, and timers that can switch it. Nothing from shoplister is deployed yet, and the timers are
created disabled.

## 1.1 AWS account, budget, daily user

1. Go to `aws.amazon.com`, **Create an AWS Account**. It asks for a card. Choose the **Basic (free) support plan**.
2. Sign in as the **root user**. Click your account name top right, **Security credentials**, **Assign MFA device**,
   **Authenticator app**, scan the QR code, enter two consecutive codes.
3. **Budget, before anything else.** Search **Billing and Cost Management**, **Budgets**, **Create budget**, **Use a
   template (simplified)**, **Monthly cost budget**. Name it `monthly-guard`, pick a low amount (a few euro), enter your
   email, **Create budget**. A job that fails to power off shows up here.
4. Create a daily user so you never use root again. Search **IAM**, **Users**, **Create user**:
   - User name `fauzan-admin`. Tick **Provide user access to the AWS Management Console**, choose **I want to create an
     IAM user**, set a password.
   - **Next**, **Attach policies directly**, tick `AdministratorAccess`, **Next**, **Create user**.
   - Save the console sign-in URL shown. It contains your account ID.
5. Allow that user to see billing: as root, account menu, **Account**, **IAM user and role access to Billing
   information**, **Edit**, activate.
6. Sign out, sign in with that URL as `fauzan-admin`. Open the user, **Security credentials**, **Assign MFA device**.
7. Set the region top right to **Europe (Frankfurt) eu-central-1**.

## 1.2 Laptop tools and other accounts

**AWS CLI.**

**LAPTOP:**

```powershell
winget install Amazon.AWSCLI
```

Close the terminal, open a new one, run `aws --version`. Expect `aws-cli/2.x`.

Create an access key: console, **IAM**, **Users**, `fauzan-admin`, **Security credentials**, **Create access key**, use
case **Command Line Interface**, confirm, **Create**. Copy both values now, because the secret is shown once.

**LAPTOP:**

```powershell
aws configure
```

| Prompt | Type |
|---|---|
| AWS Access Key ID | the key id |
| AWS Secret Access Key | the secret |
| Default region name | `eu-central-1` |
| Default output format | `json` |

**LAPTOP:**

```powershell
aws sts get-caller-identity
```

Expect your account ID and `user/fauzan-admin`. `InvalidClientTokenId` means a key was mistyped: run `aws configure`
again. Credentials land in `C:\Users\<you>\.aws\credentials`. Never commit that folder.

**Session Manager plugin.** Only needed for `aws ssm start-session`, not for the browser terminal. Download the Windows
installer from the AWS docs page "Install the Session Manager plugin on Windows" and run it. Then, in a **new** terminal
(old ones do not see it), `session-manager-plugin --version` prints a version.

**Gmail app password.** Use the account that holds the eBon mails. Google Account, **Security**, make sure **2-Step
Verification** is on, search **App passwords**, name it `shoplister`, copy the 16 characters **without spaces**.

**REWE eBon.** Digital receipts must be active. In that Gmail search `from:ebon@mailing.rewe.de` and confirm a mail has
`REWE-eBon.pdf`. Note how long after shopping it arrives. That sets how useful three runs a day are.

**Cloudflare.** The `home-dashboard` Worker must be deployed.

**LAPTOP:**

```powershell
cd D:\Projects\photo_frame_dashboard\dashboard
npx wrangler whoami
```

It must show your account.

## 1.3 Firewall (security group)

**LAPTOP:**

```powershell
$VPC = aws ec2 describe-vpcs --filters 'Name=is-default,Values=true' --query 'Vpcs[0].VpcId' --output text
$SG = aws ec2 create-security-group --group-name shoplister-sg --description 'shoplister, no inbound' --vpc-id $VPC --query GroupId --output text
$SG
```

A new security group has no inbound rules and allows all outbound. Add none. The server only dials out, to Gmail, the
Worker and Session Manager.

**Check (console):** EC2, **Security Groups**, `shoplister-sg`, **Inbound rules** is empty.

## 1.4 Server role

This lets the server talk to Session Manager and nothing else.

**LAPTOP:**

```powershell
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content "$env:TEMP\ec2-trust.json" -Encoding ascii
aws iam create-role --role-name shoplister-ec2-role --assume-role-policy-document "file://$env:TEMP\ec2-trust.json"
aws iam attach-role-policy --role-name shoplister-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name shoplister-ec2-profile
aws iam add-role-to-instance-profile --instance-profile-name shoplister-ec2-profile --role-name shoplister-ec2-role
```

Wait 10 seconds so EC2 can see the profile.

JSON always goes through a file in this guide, because Windows PowerShell strips the `"` from JSON typed directly on a
command line. `-Encoding ascii` matters too: other encodings add an invisible marker that makes the AWS CLI reject the
file.

**Check (console):** IAM, **Roles**, `shoplister-ec2-role`, **Permissions** shows `AmazonSSMManagedInstanceCore`.

## 1.5 Launch the server

**LAPTOP:** (`$SG` must be set: paste the start block if the window is new.)

```powershell
$AMI = aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text
$IID = aws ec2 run-instances --image-id $AMI --instance-type t4g.micro `
  --iam-instance-profile Name=shoplister-ec2-profile `
  --security-group-ids $SG `
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=16,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' `
  --metadata-options 'HttpTokens=required,HttpEndpoint=enabled' `
  --instance-initiated-shutdown-behavior stop `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=shoplister}]' `
  --query 'Instances[0].InstanceId' --output text
$IID
```

`Invalid IAM Instance Profile name`: wait a minute and repeat.

Why these options:

- No key pair, so no SSH. `HttpTokens=required` enforces IMDSv2.
- The server gets an automatic public IPv4 address, which it needs to dial out. Do not attach an Elastic IP: a held one
  is billed while the server is stopped.
- `--instance-initiated-shutdown-behavior stop` makes the job's poweroff stop the server and keep the disk.

**Check (console):** EC2, **Instances**: `shoplister`, type `t4g.micro`, **Running**. **Storage** tab: 16 GiB, encrypted.

## 1.6 Connect

**LAPTOP:**

```powershell
aws ec2 wait instance-running --instance-ids $IID
aws ssm describe-instance-information --query 'InstanceInformationList[].[InstanceId,PingStatus]' --output text
```

It must show your `i-...` with `Online`. Empty output: wait 2 to 5 minutes and retry. Still empty: the role is not
attached (console, instance, **Actions**, **Security**, **Modify IAM role**), or there is no public IPv4 (**Networking**
tab).

Now open [SERVER](#the-two-places-you-type) in the browser.

## 1.7 Prepare the server

**SERVER:** (update the OS, switch on automatic security updates, add 1 GiB swap because the server has only 1 GiB RAM,
create the `shoplister` service user and its folders)

```sh
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install python3-venv python3-pip git unattended-upgrades
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades

sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo adduser --system --group --home /opt/shoplister shoplister
sudo mkdir -p /etc/shoplister /opt/shoplister/app/data
sudo chown root:shoplister /etc/shoplister && sudo chmod 750 /etc/shoplister
sudo chown -R shoplister:shoplister /opt/shoplister
sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald
```

If `apt-get upgrade` shows a pink or blue dialog, press Enter to accept the default.

**Check:** the same five-line check as in [You are here](#you-are-here), step 2.

What lives where:

| Path | Content | Owner, mode |
|---|---|---|
| `/opt/shoplister/app` | shoplister code, where the job runs | `shoplister` |
| `/opt/shoplister/app/data` | SQLite file and downloaded eBon PDFs. The only path the job may write | `shoplister` |
| `/opt/shoplister/venv` | Python virtualenv | `shoplister` |
| `/etc/shoplister/env` | Secrets | `root:shoplister`, 0640 |
| `/etc/shoplister/keep-on` | Optional switch. If this file exists, the server does not power off | `root` |
| `/usr/local/bin/rewe-poweroff` | Poweroff helper | `root`, 0755 |

## 1.8 Let the server read your repo

`fzn09/shoplister` is private, so the server needs a read-only deploy key.

**SERVER:**

```sh
sudo -u shoplister mkdir -p /opt/shoplister/.ssh && sudo chmod 700 /opt/shoplister/.ssh
sudo -u shoplister ssh-keygen -t ed25519 -N "" -f /opt/shoplister/.ssh/id_ed25519
sudo -u shoplister sh -c 'ssh-keyscan github.com >> /opt/shoplister/.ssh/known_hosts'
sudo cat /opt/shoplister/.ssh/id_ed25519.pub
```

The last line prints the public key, starting `ssh-ed25519`. Print it again any time with that same line. It is safe to
copy. Do not run the `ssh-keygen` line twice.

On GitHub: `fzn09/shoplister`, **Settings**, **Deploy keys**, **Add deploy key**. Title `shoplister-ec2`, paste the key,
leave **Allow write access** off, **Add key**.

## 1.9 Make the ingest secret

**LAPTOP:** (this puts the key straight in your clipboard, so it never shows on screen or in a screenshot)

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
(($b | ForEach-Object { $_.ToString('x2') }) -join '') | Set-Clipboard
Remove-Variable b
'Copied. Paste it into your password manager now.'
```

Paste it into your password manager as `INGEST_KEY`. It goes into the server at step 2.4 and into the Worker at step 3.8.

## 1.10 Timer role

This role may start and stop this one server and nothing else.

**LAPTOP:** (needs `$IID`)

```powershell
$ACCOUNT = aws sts get-caller-identity --query Account --output text
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Set-Content "$env:TEMP\sch-trust.json" -Encoding ascii
$policy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ec2:StartInstances","ec2:StopInstances"],"Resource":"arn:aws:ec2:eu-central-1:ACCOUNT:instance/INSTANCE"}]}'
$policy.Replace('ACCOUNT', $ACCOUNT).Replace('INSTANCE', $IID) | Set-Content "$env:TEMP\sch-policy.json" -Encoding ascii
aws iam create-role --role-name shoplister-scheduler-role --assume-role-policy-document "file://$env:TEMP\sch-trust.json"
aws iam put-role-policy --role-name shoplister-scheduler-role --policy-name start-stop --policy-document "file://$env:TEMP\sch-policy.json"
$ROLE_ARN = aws iam get-role --role-name shoplister-scheduler-role --query Role.Arn --output text
$ROLE_ARN
```

## 1.11 Create the six timers, disabled

Each run has a start, and a stop 20 minutes later as a backstop in case the job fails to power off.

**LAPTOP:** (needs `$IID` and `$ROLE_ARN`)

```powershell
$schCmd = 'create-schedule'
$schState = 'DISABLED'
$timers = @(
  @('shoplister-start-1230', '30', '12', 'startInstances'),
  @('shoplister-stop-1250',  '50', '12', 'stopInstances'),
  @('shoplister-start-1830', '30', '18', 'startInstances'),
  @('shoplister-stop-1850',  '50', '18', 'stopInstances'),
  @('shoplister-start-2130', '30', '21', 'startInstances'),
  @('shoplister-stop-2150',  '50', '21', 'stopInstances')
)
foreach ($t in $timers) {
  @{ Arn = "arn:aws:scheduler:::aws-sdk:ec2:$($t[3])"; RoleArn = $ROLE_ARN; Input = (@{ InstanceIds = @($IID) } | ConvertTo-Json -Compress) } |
    ConvertTo-Json -Compress | Set-Content "$env:TEMP\shoplister-target.json" -Encoding ascii
  aws scheduler $schCmd --name $t[0] --state $schState `
    --schedule-expression "cron($($t[1]) $($t[2]) * * ? *)" --schedule-expression-timezone 'Europe/Berlin' `
    --flexible-time-window Mode=OFF --target "file://$env:TEMP\shoplister-target.json"
}
aws scheduler list-schedules --query 'Schedules[].[Name,State]' --output text
```

**Check:** six names, all `DISABLED`. In the console: search **EventBridge**, **Scheduler**, **Schedules**.

## 1.12 Test stop and start

By hand first.

**LAPTOP:**

```powershell
stopnow
aws ec2 start-instances --instance-ids $IID | Out-Null
aws ec2 wait instance-running --instance-ids $IID
state
```

Expected: `stopped None`, then `running <some IP>`. The IP changes on each start. That is normal.

Now prove the timer can do it, in both directions. Each one-off timer fires 3 minutes from now and deletes itself. The
time is computed for you, in UTC.

**LAPTOP:**

```powershell
foreach ($action in 'stopInstances', 'startInstances') {
  @{ Arn = "arn:aws:scheduler:::aws-sdk:ec2:$action"; RoleArn = $ROLE_ARN; Input = (@{ InstanceIds = @($IID) } | ConvertTo-Json -Compress) } |
    ConvertTo-Json -Compress | Set-Content "$env:TEMP\shoplister-target.json" -Encoding ascii
  $when = (Get-Date).ToUniversalTime().AddMinutes(3).ToString('yyyy-MM-ddTHH:mm:ss')
  aws scheduler create-schedule --name "shoplister-test-$action" --action-after-completion DELETE `
    --schedule-expression "at($when)" --schedule-expression-timezone UTC `
    --flexible-time-window Mode=OFF --target "file://$env:TEMP\shoplister-target.json"
  if ($action -eq 'stopInstances') { aws ec2 wait instance-stopped --instance-ids $IID } else { aws ec2 wait instance-running --instance-ids $IID }
  state
}
```

This takes about 7 minutes and must end with `stopped None`, then `running <some IP>`. If a `wait` fails, open the
schedule in the console (EventBridge, Scheduler), read its error, and check the role's resource ARN.

## Phase 1 done when

- [ ] SERVER opens, and the security group has no inbound rules.
- [ ] Manual stop and start work, and the IP is `None` while stopped.
- [ ] The one-off timers stopped and started the server.
- [ ] Six `DISABLED` schedules exist.
- [ ] Budget exists, deploy key added, new `INGEST_KEY` saved.

Pausing here? `stopnow`.

---

# Phase 2: the fetch job

Goal: the server reads Gmail, parses the PDF, and switches itself off. The Worker is not involved yet, so the push to it
fails until step 3.8. That is expected.

## 2.1 Write the job

The code lives in `fzn09/shoplister`, which is already on your laptop at `D:\Projects\shoplister`.

Two things about that repo:

- **`harden-auth-and-bring-cache` is not merged**, but it is not a blocker. It changes only `app.py` and
  `bring_service.py`, and the job imports neither.
- **Your laptop's `master` has commits GitHub does not have.** Pushing the new branch publishes them to your private repo.
  The third line below lists them, so look before you push.

**LAPTOP:**

```powershell
cd D:\Projects\shoplister
git config --global --add safe.directory D:/Projects/shoplister
git fetch origin
git log --oneline origin/master..master
git switch -c rewe-job master
```

The `safe.directory` line is needed once, because the folder was created under another Windows user.

Create `rewe_job.py` in the repo root:

**FILE** `rewe_job.py`:

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
        import database
        from rewe_service import load_rewe_purchases   # importing this creates data/rewe_pdf
        database.DB = "data/shopping.db"               # the systemd sandbox only allows writes under data/
        database.init_db()                             # only app.py does this, and the job does not run app.py
        items = load_rewe_purchases(force_refresh=True)
        if database.get_latest_rewe_bons(10) and not items:
            raise RuntimeError("bons found but parser returned no items")
        payload = build_payload(items)
    except Exception as e:                      # report the failure, keep the last good data on the Worker
        payload = build_payload([], status="error", message=str(e))
    if args.dry_run:
        with open("data/last_payload.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(payload["status"], len(payload["items"]), "items")
        if payload["message"]:
            print(payload["message"])
    else:
        push(payload)
    return 0 if payload["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
```

The Worker treats the two statuses differently (Phase 3): `ok` replaces the items, `error` keeps the old ones and records
the message.

## 2.2 Dependencies and a test

**FILE** `requirements-job.txt`:

```text
imap-tools
pdfplumber
python-dotenv
```

After step 2.3 works, pin each to the version you tested (`.\venv\Scripts\python.exe -m pip freeze` shows them). The job
does not need FastAPI, aiohttp or the Bring! client, so the server stays small. Leave `requirements.txt` as it is.

Add `test_rewe_job.py` for `build_payload`: field names, the `status: "error"` path, an empty list, with a small invented
item list and plain `assert`s.

## 2.3 Try it on your laptop first

This is the important step. The parser is the risk in this project, not AWS.

Your `.env` in `D:\Projects\shoplister` needs `EMAIL_USER=<gmail>` and `EMAIL_PASS=<app password>`. It is git-ignored.

**LAPTOP:** (in `D:\Projects\shoplister`)

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements-job.txt
.\venv\Scripts\python.exe test_rewe_job.py
.\venv\Scripts\python.exe rewe_job.py --dry-run
code data\last_payload.json
```

Expect `ok <number> items`. Compare the file with a real eBon PDF: names, quantities, totals.

- Quantities default to 1 unless an `N Stk x price` line follows, so small differences there are expected.
- The parser already skips lines containing `PFAND`. It skips by plain text match on `BON`, `KASSE`, `TOTAL` and similar,
  so a product like `BONBONS` goes missing too. Look for that.
- Check whether the bag line shows up, and decide if you want it in the fridge.

If names or totals are wrong, **stop**. Fix the parser before touching the server.

When it works, commit and push.

**LAPTOP:**

```powershell
git add rewe_job.py requirements-job.txt test_rewe_job.py
git commit -m "Add REWE job for the dashboard fridge"
git push -u origin rewe-job
```

## 2.4 Install on the server

If the server is stopped: **LAPTOP** `aws ec2 start-instances --instance-ids $IID`, wait for `Online`, open **SERVER**.

The empty folders from step 1.7 are removed first, because `git clone` refuses a folder that already has something in it.

**SERVER:**

```sh
sudo rmdir /opt/shoplister/app/data /opt/shoplister/app
sudo -u shoplister git clone git@github.com:fzn09/shoplister.git /opt/shoplister/app
sudo -u shoplister mkdir -p /opt/shoplister/app/data
cd /opt/shoplister/app && sudo -u shoplister git checkout rewe-job
sudo -u shoplister python3 -m venv /opt/shoplister/venv
sudo -u shoplister /opt/shoplister/venv/bin/pip install -r requirements-job.txt
```

Now the secrets file. This must be typed in SERVER, and it is the only place on the server that holds secrets. Do not
create a `.env` in the repo there.

**SERVER:**

```sh
sudoedit /etc/shoplister/env
```

A small editor opens. Paste this, then fill in your values. The `INGEST_URL` is a placeholder until step 3.8.

**FILE** `/etc/shoplister/env`:

```ini
EMAIL_USER=<gmail address>
EMAIL_PASS=<gmail app password, without spaces>
REWE_SENDER_EMAIL=ebon@mailing.rewe.de
REWE_LOOKBACK_DAYS=30
INGEST_URL=https://example.invalid/api/ingest
INGEST_KEY=<INGEST_KEY from your password manager>
```

Save with `Ctrl+O`, Enter. Exit with `Ctrl+X`. Then lock the file and do a dry run as the service user.

**SERVER:**

```sh
sudo chown root:shoplister /etc/shoplister/env && sudo chmod 640 /etc/shoplister/env
cd /opt/shoplister/app
sudo -u shoplister env $(sudo cat /etc/shoplister/env | xargs) /opt/shoplister/venv/bin/python rewe_job.py --dry-run
sudo -u shoplister python3 -m json.tool data/last_payload.json | head -40
```

The item count must equal what you saw on your laptop.

## 2.5 Auto power-off and the boot service

At boot the service waits for the network, runs the job, then (success, failure or timeout) runs the poweroff helper,
unless `/etc/shoplister/keep-on` exists. That file is your "do not shut down, I am working" switch.

**SERVER:**

```sh
sudo tee /usr/local/bin/rewe-poweroff >/dev/null <<'EOF'
#!/bin/sh
[ -e /etc/shoplister/keep-on ] && exit 0
/usr/bin/systemctl --no-block poweroff
EOF
sudo chmod 755 /usr/local/bin/rewe-poweroff

sudo tee /etc/systemd/system/rewe-job.service >/dev/null <<'EOF'
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
EOF
sudo systemctl daemon-reload && sudo systemctl enable rewe-job.service
```

**From now on, every boot ends in a shutdown** unless `keep-on` exists. So when you need to work on the server, do not
start it normally. Run **`maint`** on LAPTOP. It starts the server and sets `keep-on` before the job finishes. When you
are done, in SERVER run `sudo rm /etc/shoplister/keep-on`, then on LAPTOP run `stopnow`.

Never leave `keep-on` behind: the server would then run until the backstop timer on every run.

## 2.6 Boot test, staying on

**SERVER:**

```sh
sudo touch /etc/shoplister/keep-on
```

**LAPTOP:**

```powershell
stopnow
aws ec2 start-instances --instance-ids $IID | Out-Null
aws ec2 wait instance-running --instance-ids $IID
```

Wait about 3 minutes, then open SERVER.

**SERVER:**

```sh
sudo journalctl -u rewe-job.service -b --no-pager | tail -30
```

Expected for now: the job runs, the push fails after three tries (the Worker has no ingest route yet), the unit ends
`failed`, and the server stays up. That proves the wiring. A database error here means the unit cannot write: check
`ReadWritePaths`.

## 2.7 Boot test, switching off

**SERVER:**

```sh
sudo rm /etc/shoplister/keep-on
```

**LAPTOP:**

```powershell
stopnow
testboot
```

It must end `stopped None`. The `Took ... seconds` line is your real cost per run. Write it into the spec in place of the
estimate.

## 2.8 Failure tests

**Wrong password.** The server must still switch off.

1. **LAPTOP:** `maint`, then open SERVER.
2. **SERVER:** `sudoedit /etc/shoplister/env`, change `EMAIL_PASS` to something wrong, save. `sudo rm
   /etc/shoplister/keep-on`.
3. **LAPTOP:** `stopnow`, then `testboot`. It must end `stopped None`.
4. **LAPTOP:** `maint`. **SERVER:** restore `EMAIL_PASS`.

**Hung job.** The service must be killed at 300 seconds and the server must still switch off.

**SERVER:** (still in the session from the test above)

```sh
sudo mkdir -p /etc/systemd/system/rewe-job.service.d
printf '[Service]\nExecStart=\nExecStart=/bin/sleep 600\n' | sudo tee /etc/systemd/system/rewe-job.service.d/hang.conf
sudo systemctl daemon-reload
sudo rm /etc/shoplister/keep-on
```

**LAPTOP:** `stopnow`, then `testboot`. It must end `stopped None` after about 5 to 6 minutes.

Now remove the hang.

**LAPTOP:** `maint`, then open SERVER.

**SERVER:**

```sh
sudo rm /etc/systemd/system/rewe-job.service.d/hang.conf
sudo systemctl daemon-reload
sudo rm /etc/shoplister/keep-on
```

**LAPTOP:** `stopnow`.

**`keep-on` present:** already proven at step 2.6. **Timer backstop:** the schedules are still disabled, so that test is
at step 3.9.

## 2.9 Monthly patching

Automatic security updates also run during the short run windows, but do this once a month.

1. **LAPTOP:** `maint`, then open SERVER.
2. **SERVER:** `sudo apt-get update && sudo apt-get -y upgrade`. If `/var/run/reboot-required` exists, `sudo reboot` and
   reconnect.
3. **SERVER:** `sudo rm /etc/shoplister/keep-on`.
4. **LAPTOP:** `stopnow`.

## Phase 2 done when

- [ ] The dry run on the server matches a real eBon.
- [ ] A boot without `keep-on` ends in `stopped`, duration noted.
- [ ] The hang test stopped the server, and `hang.conf` is gone.
- [ ] `sudo ls -l /etc/shoplister/env` shows `-rw-r----- root shoplister`. No secret is in the repo or the shell history.

---

# Phase 3: dashboard and Worker

Everything here is in `dashboard/` of this repo, in LAPTOP. Steps 3.1 to 3.6 are code changes. You can hand them to Claude
Code as they are: "implement steps 3.1 to 3.6 of `dashboard/PLAN-rewe-fridge.md`".

## 3.1 Branch and pure mapper

Pick the base branch first. The Cookidoo and Home Assistant work have diverged (SPEC section 4), so this choice matters.

**LAPTOP:**

```powershell
cd D:\Projects\photo_frame_dashboard
git switch -c feat/fridge-rewe <base branch>
```

New `rewe-map.js`, the same pattern as `calc.js` and `views.js`:

- `mapIngest(payload)`: accepts `{status, message, updated_at, items[]}`. Rejects anything that is not an object, and
  caps items at 200 and strings at 80 characters. Returns `{status, message, updatedAt, items}` with items
  `{id, name, qty, total, date}`.
- `id`: a short hash of `date|name|n`, where `n` counts repeats of the same date and name in the payload. The same
  purchase gets the same id across runs, which the "used up" flag needs.
- `applyUsed(items, usedIds)`: sets `used` on each item.
- `test/rewe-map.test.mjs`: valid payload, error payload, oversize payload, repeated names on one date, bad types.

## 3.2 Worker and KV

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

Create the KV namespace.

**LAPTOP:**

```powershell
cd D:\Projects\photo_frame_dashboard\dashboard
npx wrangler kv namespace create FRIDGE_KV
```

It prints an `id`. `wrangler.jsonc` already has a `kv_namespaces` list with `COOKIDOO_KV`: add a second entry with binding
`FRIDGE_KV` and that id. Also list the `INGEST_KEY` secret in the comment block, drop the `BRING_FRIDGE_LIST` mention, and
update the route comment at the top of `worker.js`.

Tests: extend `test/gate.test.mjs` (ingest reachable without cookie, everything else still 401), add
`test/ingest.test.mjs` with a fake KV in the style of `cookidoo.test.mjs` (auth cases, ok replaces, error keeps, prune,
size limit).

## 3.3 Page data

- `js/data.js`: replace `fridge` and `fridgeUsuals` with `fridge: []` of REWE-shaped sample items and `fridgeMeta`
  `{updatedAt, status}`. Remove the Bring! comment.
- `js/fetch.js`: new `updateFridge(data)` sets `D.fridge`, `D.fridgeMeta`, `D.fridgeAt` and emits `'data'` and
  `'fridge'`. Replace `App.fridgeSync` with `App.fridgeUse(id, used)` that posts `{op, id}`. The 5 s, 15 s, 1 min retry
  stays. Poll `/api/fridge` every 5 minutes while `fridge` is enabled, because the Today tile reads it too. Remove the
  comment about Bring! logging in on every call.

## 3.4 Fridge view

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

## 3.5 Today tile

`js/views/home.js` `fridge()` currently sorts by days left with `daysLeft`. Replace it with: count of unused items, the
date of the latest purchase, and the three newest unused items. Remove the `calc.js` import if nothing else uses it.
`calc.js` `withExpiry` and `daysLeft` then have no caller: delete them and their cases in `calc.test.mjs`, or keep them
for the estimated use-by idea in the spec. Decide before merging.

## 3.6 Docs

- `SETUP.md`: replace the Bring! fridge paragraph with the REWE feed, `INGEST_KEY`, and a pointer to this guide. Update
  the "What each feed needs" and routes tables.
- `ARCHITECTURE.md`: storage row (KV now also holds the fridge feed), route table, the view table row for Fridge, and the
  Request flow diagram with the ingest arrow.
- `PRODUCT.md`: no change unless the Thermomix work lands in the same branch.

## 3.7 Test locally

Add `test/fixtures/ingest-ok.json` with invented items, never real receipts. In `dashboard/.dev.vars` add the line
`INGEST_KEY=test-key` and keep what is already there, including `DASH_TOKEN`.

**LAPTOP:** (first window)

```powershell
cd D:\Projects\photo_frame_dashboard\dashboard
foreach ($f in Get-ChildItem test\*.test.mjs) { node $f.FullName; if ($LASTEXITCODE -ne 0) { break } }
npm run build
npm run dev:live
```

Leave that running. It prints its local URL, normally port 8787. Open a second terminal.

**LAPTOP:** (second window, in `dashboard/`. Note `curl.exe`: plain `curl` in Windows PowerShell is a different command.)

```powershell
$DASH_TOKEN = Read-Host 'DASH_TOKEN from .dev.vars'
curl.exe -sS -X POST http://localhost:8787/api/ingest -H 'Authorization: Bearer test-key' -H 'Content-Type: application/json' -d '@test/fixtures/ingest-ok.json'
curl.exe -sS -H "Cookie: hq=$DASH_TOKEN" http://localhost:8787/api/fridge
```

The POST must succeed and the GET must return your invented items. Also check:

- The same POST without the `Authorization` header returns 401.
- `GET /api/fridge` without the cookie returns 401.
- A payload with `status: "error"` leaves the previous items in place.

Run the `frame-compat-reviewer` agent on the diff (it checks against `docs/building-for-the-frame.md`). Stale `workerd`
processes can hold the port, so use a fresh port and restart wrangler after each rebuild.

## 3.8 Go live

Do these in order.

1. Store the real secret in Cloudflare. It asks you to paste the value: use `INGEST_KEY` from your password manager.

   **LAPTOP:**

   ```powershell
   cd D:\Projects\photo_frame_dashboard\dashboard
   npx wrangler secret put INGEST_KEY
   npm run deploy
   ```

   Note the Worker URL `npm run deploy` prints.
2. Open `/?key=<DASH_TOKEN>` once on the frame if the cookie is not set.
3. **LAPTOP:** `maint` (paste the start block first if the window is new), then open SERVER.
4. Point the server at the Worker, then run the job by hand. In the editor set
   `INGEST_URL=https://<your-worker-host>/api/ingest`.

   **SERVER:**

   ```sh
   sudoedit /etc/shoplister/env
   sudo systemctl start rewe-job.service
   sudo journalctl -u rewe-job.service --no-pager | tail
   ```

   Expect exit code 0 and no errors.
5. Check what the Worker stored.

   **LAPTOP:**

   ```powershell
   $DASH_TOKEN = Read-Host 'DASH_TOKEN'
   curl.exe -sS -H "Cookie: hq=$DASH_TOKEN" https://<your-worker-host>/api/fridge
   ```

   `updatedAt` must be current and the items must match your dry run.
6. **On the frame:** reload the dashboard in Firefox, open **Fridge**, and check the items, the age, a used-up tap, undo,
   and the Today tile.
7. **Switch it on.** **SERVER:** `sudo rm /etc/shoplister/keep-on`. **LAPTOP:** `stopnow`, then enable the timers. This is
   the block from step 1.11 with `update-schedule` and `ENABLED`.

   **LAPTOP:**

   ```powershell
   $schCmd = 'update-schedule'
   $schState = 'ENABLED'
   $timers = @(
     @('shoplister-start-1230', '30', '12', 'startInstances'),
     @('shoplister-stop-1250',  '50', '12', 'stopInstances'),
     @('shoplister-start-1830', '30', '18', 'startInstances'),
     @('shoplister-stop-1850',  '50', '18', 'stopInstances'),
     @('shoplister-start-2130', '30', '21', 'startInstances'),
     @('shoplister-stop-2150',  '50', '21', 'stopInstances')
   )
   foreach ($t in $timers) {
     @{ Arn = "arn:aws:scheduler:::aws-sdk:ec2:$($t[3])"; RoleArn = $ROLE_ARN; Input = (@{ InstanceIds = @($IID) } | ConvertTo-Json -Compress) } |
       ConvertTo-Json -Compress | Set-Content "$env:TEMP\shoplister-target.json" -Encoding ascii
     aws scheduler $schCmd --name $t[0] --state $schState `
       --schedule-expression "cron($($t[1]) $($t[2]) * * ? *)" --schedule-expression-timezone 'Europe/Berlin' `
       --flexible-time-window Mode=OFF --target "file://$env:TEMP\shoplister-target.json"
   }
   aws scheduler list-schedules --query 'Schedules[].[Name,State]' --output text
   ```

   **Check:** all six say `ENABLED`.

## 3.9 First day checks

- **Next day:** `updatedAt` has moved three times, and `state` shows `stopped` between runs.
- **Backstop test.** About 10 minutes before a `:50` stop time, on LAPTOP run `maint`. `keep-on` holds the server up, so
  the stop timer has to be what stops it. Watch `state` turn `stopped` just after `:50`. Then remove the flag: LAPTOP
  `maint`, SERVER `sudo rm /etc/shoplister/keep-on`, LAPTOP `stopnow`. Do not skip that last part.

## Phase 3 done when

- [ ] All tests pass and `npm run build` succeeds.
- [ ] Ingest without the bearer returns 401. Fridge without the cookie returns 401.
- [ ] A scheduled run moves `updatedAt` with nobody touching anything.
- [ ] The frame shows the REWE items and age, and keeps its last data when the Worker is unreachable.
- [ ] After a day, the bill shows no running hours outside the run windows (console, **Billing**, **Bills** or **Cost
      Explorer**. Data lags up to a day).

---

# When something goes wrong

| Symptom | Look here |
|---|---|
| `aws: not found`, or Windows says `sudo is disabled` | Wrong window. See [the two places you type](#the-two-places-you-type) |
| `Unable to locate credentials` | Run `aws configure`, then `aws sts get-caller-identity` |
| `$IID` blank, or `Invalid length for parameter`, or `--instance-ids` errors | New window. Paste the [start block](#start-of-every-laptop-window) |
| Command works but resource not found | Wrong region. Paste the start block, check the console top right |
| `npx` or `npm` says "running scripts is disabled" | Once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `session-manager-plugin` not recognised | Open a new terminal. If still missing, reinstall the plugin |
| A `.json` error from `aws` | Use the exact `Set-Content ... -Encoding ascii` line from the step |
| Server not `Online` | Role attached? Public IPv4 present? Wait 5 minutes after boot |
| Server keeps shutting down while you work | Use `maint`, not a plain start |
| `maint` loops forever | The server is not coming online. Press `Ctrl+C`, then run the `aws ssm send-command` line by hand without `2>$null` to see the error |
| Server did not turn off | SERVER: `sudo journalctl -u rewe-job.service`, and `sudo ls /etc/shoplister` for a forgotten `keep-on`. The stop timer still kills it at +20 min |
| Timer did not fire | Console, EventBridge, Scheduler, open the schedule, check state and role ARN. Times are Berlin local |
| Job log says login failed | Wrong `EMAIL_PASS`: use the app password, no spaces |
| Job log says `no such table` | `rewe_job.py` lost its `database.init_db()` line |
| Job log says `readonly database` or `unable to open database` | `database.DB` must point under `data/`, and `data/` must be owned by `shoplister` |
| `git clone` says destination is not empty | Run the `rmdir` line from step 2.4 first |
| Worker returns 401 on ingest | `INGEST_KEY` differs between `/etc/shoplister/env` and `wrangler secret` |
| Worker returns 503 on ingest | KV binding or `INGEST_KEY` missing in the deployed Worker |

# Risks to watch

| Risk | Mitigation |
|---|---|
| Parser misreads a receipt layout change | Job reports `error` when bons exist and no items parse. The page keeps old data and shows the message |
| Server fails to power off | `TimeoutStartSec`, the stop timer, and the budget alert |
| KV delay on a used-up tap from another device | Single frame. The tapping device updates first |
| Gmail app password exposure | Separate account, forwarding rule, secret only in `/etc/shoplister/env` |
| Public IPv4 and disk charges | Automatic IP only, 16 GB disk. Check current AWS pricing |

# Pause or roll back

**Pause everything.** Run the block from step 3.8 part 7 with `$schCmd = 'update-schedule'` and `$schState = 'DISABLED'`,
then `stopnow`. The frame keeps showing the last data.

**Old Worker back.**

**LAPTOP:**

```powershell
cd D:\Projects\photo_frame_dashboard\dashboard
npx wrangler rollback
```

The Bring! fridge list was never edited, so the old fridge view works again as soon as that Worker is live. Delete the
Bring! "Fridge" list only after the new view has run for a few weeks.

# Remove it all

If you abandon this:

1. Delete the six schedules: console, EventBridge, Scheduler, select all, **Delete**.
2. EC2, select the server, **Instance state**, **Terminate**. This deletes the disk.
3. Delete security group `shoplister-sg`, roles `shoplister-ec2-role` and `shoplister-scheduler-role`, and instance
   profile `shoplister-ec2-profile`.
4. Delete the GitHub deploy key and the Gmail app password.
5. Delete the IAM access key: IAM, Users, Security credentials, **Deactivate**, **Delete**.
