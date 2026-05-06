# Deploy to AWS (EC2 + Caddy + projects.ericdarko.com)

This recipe puts the Project Hub on a single small EC2 instance behind Caddy
(automatic HTTPS via Let's Encrypt) on the AWS Free Tier. It mirrors the Pi
deployment so you can move between hosts with no app changes.

## Why EC2 (and not App Runner / Amplify)

- **SSE works out of the box.** Live notifications use a long-lived
  `text/event-stream` connection from `/api/stream`. Amplify Hosting and
  CloudFront-fronted services routinely terminate idle connections in 30 s.
- **SQLite stays on disk.** No need to migrate to Postgres on day one.
- **Reuse the Pi runbook.** Same systemd unit, same Caddyfile, same env.

When the app outgrows one box → migrate to RDS Postgres + put the app behind
an ALB; the SSE route still works on a single ALB target group with sticky
sessions disabled.

---

## 0. Prerequisites

- AWS account with Free Tier active (`Sign in → Billing → confirm card`)
- A registered domain (`ericdarko.com`) with Route 53 or external DNS
- Local `aws` CLI logged in (`aws configure`) — optional but useful
- The repo on GitHub (already done — `edarko265-tech/sujuva-project-hub`)

---

## 1. Launch the EC2 instance

**Recommended:** `t4g.small` (ARM, 2 vCPU, 2 GB) — Free Tier eligible for
the first 12 months on `t2.micro`/`t3.micro`/`t4g.small` (whichever your
account is offered). ARM (`t4g`) is cheapest after Free Tier.

1. EC2 console → Launch instances
2. **Name:** `sujuva-projects`
3. **AMI:** Ubuntu Server 24.04 LTS (arm64 if you picked `t4g.*`, x86_64 otherwise)
4. **Instance type:** `t4g.small` (or `t3.micro` for strict Free Tier)
5. **Key pair:** create or pick one — save the `.pem` locally and `chmod 400`
6. **Network — security group rules** (create new):
   - SSH (22) ← `My IP`
   - HTTP (80) ← `Anywhere` (Caddy ACME challenge)
   - HTTPS (443) ← `Anywhere`
7. **Storage:** 20 GB gp3 (Free Tier allows 30 GB total)
8. Launch → wait for `Running`. Note the **public IPv4 address** and the
   instance ID.

> **Elastic IP (recommended):** EC2 → Elastic IPs → Allocate → Associate
> with the instance. This keeps the IP stable across stop/start, which is
> critical for the DNS A record below.

---

## 2. Point DNS at the instance

If `ericdarko.com` is in **Route 53**:

```
Hosted zone: ericdarko.com
Record name: projects
Type:        A
TTL:         60   (raise to 300+ once it's working)
Value:       <Elastic IP from step 1>
```

If your DNS is elsewhere (Cloudflare, Namecheap, etc.) add the same A record
there. Verify:

```bash
dig +short projects.ericdarko.com    # should print the EIP
```

---

## 3. SSH in and bootstrap

```bash
ssh -i ~/path/to/key.pem ubuntu@projects.ericdarko.com
```

Once on the host, paste the bootstrap script (or run the one committed at
[scripts/aws-bootstrap.sh](../scripts/aws-bootstrap.sh)):

```bash
curl -fsSL https://raw.githubusercontent.com/edarko265-tech/sujuva-project-hub/main/scripts/aws-bootstrap.sh | bash
```

What it does (idempotent):

- updates apt, installs Node 22 LTS, git, ufw, caddy
- enables ufw with SSH + 80 + 443
- creates a system user `sujuva`
- clones the repo into `/srv/sujuva-project-hub`
- runs `npm ci`, `prisma migrate deploy`, `prisma db seed`
- writes a systemd unit `sujuva.service`
- writes a Caddyfile reverse-proxying `projects.ericdarko.com → 127.0.0.1:3000`

---

## 4. Set the production .env

The bootstrap creates `/srv/sujuva-project-hub/.env` with placeholders. Edit:

```bash
sudo -u sujuva nano /srv/sujuva-project-hub/.env
```

Required keys:

```ini
DATABASE_URL="file:./prisma/prod.db"
SESSION_SECRET="<run: openssl rand -base64 48>"
OPENAI_API_KEY="sk-proj-…"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TRANSCRIBE_MODEL="whisper-1"
TELEGRAM_BOT_TOKEN=""           # optional
TELEGRAM_WEBHOOK_SECRET=""      # optional
NODE_ENV=production
PORT=3000
```

Then:

```bash
sudo systemctl restart sujuva
sudo systemctl status sujuva --no-pager
```

---

## 5. Verify

```bash
# from the host
curl -I http://127.0.0.1:3000/login              # 200
sudo journalctl -u sujuva -n 50 --no-pager

# from your laptop
curl -I https://projects.ericdarko.com/login     # 200, valid cert
```

Open `https://projects.ericdarko.com` in a browser → log in with the
seeded admin (`admin@sujuva.local` / `admin123`) → **change the password
immediately**.

---

## 6. Day-2 operations

### Deploy a new version

```bash
ssh ubuntu@projects.ericdarko.com
sudo -iu sujuva bash -c '
  cd /srv/sujuva-project-hub &&
  git pull &&
  npm ci --omit=dev &&
  npx prisma migrate deploy &&
  npm run build
'
sudo systemctl restart sujuva
```

### Backups (SQLite)

The DB is at `/srv/sujuva-project-hub/prisma/prod.db`. Daily snapshot:

```bash
sudo crontab -e
# add:
0 3 * * * sqlite3 /srv/sujuva-project-hub/prisma/prod.db ".backup '/srv/sujuva-project-hub/prisma/backup-$(date +\%F).db'" && find /srv/sujuva-project-hub/prisma -name 'backup-*.db' -mtime +14 -delete
```

For off-host backups, sync to S3:

```bash
aws s3 sync /srv/sujuva-project-hub/prisma/ s3://my-sujuva-backups/ --exclude '*' --include 'backup-*.db'
```

### Logs

```bash
sudo journalctl -u sujuva -f                 # app
sudo journalctl -u caddy -f                  # reverse proxy / TLS
```

### CloudWatch (optional, Free Tier includes 5 GB)

Install the CloudWatch agent and ship `journalctl` output:

```bash
sudo apt install -y amazon-cloudwatch-agent
# follow the wizard: sudo amazon-cloudwatch-agent-config-wizard
```

---

## 7. Cost ballpark

| Component                     | Free tier (Y1)        | After Y1   |
| ----------------------------- | --------------------- | ---------- |
| `t4g.small` 24×7              | included               | ~$12/mo    |
| 20 GB gp3 EBS                 | included (30 GB free)  | ~$1.60/mo  |
| Elastic IP (in use)           | free while attached    | $0         |
| Data transfer (~5 GB/mo)      | 100 GB free out        | ~$0.45/mo  |
| Route 53 hosted zone          | $0.50/mo               | $0.50/mo   |
| **Total**                     | **~$0.50/mo**          | **~$15/mo**|

OpenAI is billed separately (per-token, your existing key).

---

## 8. Hardening checklist

- [ ] Change the seeded admin password right after first login
- [ ] Set `SESSION_SECRET` to a fresh 48-byte random value (the bootstrap
      generates one if you leave it empty)
- [ ] Restrict SSH to your IP only (`security group → SSH → My IP`)
- [ ] Enable `unattended-upgrades` for security patches
- [ ] Enable AWS GuardDuty (free 30-day trial; cheap thereafter)
- [ ] Take an EBS snapshot before each deploy (or rely on the cron backup)

---

## 9. When you outgrow this

- Migrate `DATABASE_URL` to RDS Postgres (`prisma migrate deploy` handles it).
- Put the app behind an Application Load Balancer; keep WebSocket/SSE
  passthrough enabled, idle timeout ≥ 120 s.
- Use ECS Fargate or Auto Scaling Group for >1 instance — but you'll need
  a sticky session for SSE (or move to a hosted pub/sub like Redis/SNS for
  the activity bus).

That migration is described in `docs/SCALING.md` (TODO).
