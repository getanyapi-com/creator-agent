# creator agent

<!-- "creator agent" is a working title. This heading is the only place the README names the app. -->

A research chat for finding TikTok creators, which you can self-host for free. You ask in plain
words, for example "creators under 10,000 followers who make Claude Code tutorials", and it
searches TikTok, looks at the creators it finds, reads transcripts and watches videos where the
caption is not enough, then answers with the creators that fit, a video of each that proves it,
and the checks it applied. You watch each step and its cost as it happens.

Data comes from [AnyAPI](https://getanyapi.com): one key, pay per request in USD, no
subscription.

## What it does

- **Researches one question at a time.** Searches by keyword, opens creator profiles and their
  recent posts, reads transcripts and watches videos when the caption does not settle it.
- **Shows its work while it runs.** Every search, creator, transcript and video appears as it
  happens, with the running cost against the question's limit and the time taken. A question
  takes about three minutes at the median; one that watches long videos can take about fourteen.
- **Answers with proof.** Each creator comes with the video that shows they fit, and the answer
  states which checks were applied (follower limits, topic, recency) and what was left out.
- **Asks back when the question is unclear**, instead of guessing and spending.
- **Keeps free answers public.** Every finished free question becomes a thread anyone can read;
  the person who asked is never shown. A question paid from a connected wallet stays private.

## What it never does

- **No outreach.** It never sends a message, email or follow to anyone.
- **No contact details on the page.** A creator's email address or phone number is never shown,
  except through Reveal to a signed-in account with a connected wallet, and then only the email
  the creator published in their own public bio.
- **No subscription.** There is no plan to buy here, in any tier.

## Five-minute self-host

You need Docker, a free [Clerk](https://clerk.com) application for sign-in, an
[AnyAPI](https://getanyapi.com) key for the data, and a
[Surplus Intelligence](https://surplusintelligence.ai) key for the models.

```bash
git clone <repo> creator-agent
cd creator-agent
cp .env.example .env
```

Paste your Clerk, AnyAPI and Surplus Intelligence keys into `.env`, then:

```bash
docker compose up
```

The app applies its own migrations on start and serves on <http://localhost:3000>. Sign up and
ask a question. `.env.example` sets `SELF_HOSTED=true`, so your instance has no per-account
question limit.

To let other people connect their own AnyAPI wallet instead of using your key, register this
instance as an OAuth client once, then put the printed id in `ANYAPI_OAUTH_CLIENT_ID` and
32 random bytes in `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`):

```bash
pnpm install
APP_URL=http://localhost:3000 pnpm --filter web anyapi:register
```

AnyAPI accepts an `https` address, or plain `http` only on `localhost` or a loopback address.

## Environment

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | yes | - | Postgres connection string. Compose sets it for you. |
| `APP_URL` | no | `http://localhost:3000` | Public origin. Must match the OAuth redirect you registered, `<APP_URL>/connect/callback`. |
| `ANYAPI_OAUTH_CLIENT_ID` | no | - | Printed by `pnpm --filter web anyapi:register`. Without it nobody can connect a wallet and every account is free. |
| `APP_ENCRYPTION_KEY` | with `ANYAPI_OAUTH_CLIENT_ID` | - | 32 random bytes, base64. Encrypts the stored AnyAPI tokens. |
| `SELF_HOSTED` | no | `false` (`true` under the Compose file) | `true` removes the per-account question limits, two a day and two at once. The hosted instance sets `false`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | - | Clerk publishable key. |
| `CLERK_SECRET_KEY` | yes | - | Clerk secret key. |
| `ANYAPI_HOUSE_API_KEY` | yes | - | The AnyAPI key free questions run on. |
| `SURPLUS_API_KEY` | yes | - | The Surplus Intelligence key the models run on. |
| `HOUSE_DATA_CAP_USD_PER_DAY` | no | `50` | Daily ceiling on data spend from the house key, at published prices. |
| `HOUSE_LLM_CAP_USD_PER_DAY` | no | `100` (`10` under the Compose file) | Daily ceiling on model spend. |
| `MAX_QUESTION_CHARS` | yes | `500` under the Compose file | The longest question accepted. |
| `RUNS_IN_FLIGHT` | no | unset: no limit | Questions being researched at once across the whole instance, counted in the database. The next asker is told to try again in a few minutes, and that question is not counted. |
| `DATA_CALLS_PER_MINUTE` | no | unset: no limit | AnyAPI data calls a minute across the server process, house and wallet alike. Calls are sent evenly spaced, one every 60/N seconds, first come first served; a call waits its turn and is never refused for waiting. Set it from the call rate your AnyAPI key's sources serve. |
| `VIDEO_INSPECTIONS_AT_ONCE` | no | unset: no limit | Video inspections at once across the server process, each from its file's download until the watch ends; the next waits its turn. Each re-encodes the video with ffmpeg, which on a 32-core test machine took up to 224 MiB, so set it from your machine's memory. |

When either daily ceiling is reached, new free questions are refused until the next UTC day and
the refused question is not counted. The model ceiling also refuses questions paid from a
connected wallet; the data ceiling does not, since the wallet pays for that data.
A ceiling is checked when a question starts, so questions
already running finish: the day can end above a ceiling by what they may still spend, up to
$0.10 each, data and model calls together (`FREE_BUDGET_USD` in `src/session.ts`), plus whatever
a model call bills above the amount held for it. With `RUNS_IN_FLIGHT` set, at most that many
questions are running; with it unset, there is no such bound.

## Tiers

| | Free | Connected wallet |
|---|---|---|
| Who | any signed-in account | a signed-in account that connected its AnyAPI wallet |
| Questions | 2 per rolling 24 hours, at most 2 at once | no daily limit, at most 2 at once |
| Spend per question | up to $0.10 of data at published prices plus model bills, paid by the instance's AnyAPI key | up to $0.10; the data is billed to your AnyAPI wallet at published prices, the models are paid by the instance |
| Platforms | TikTok | TikTok |
| Threads | public; the asker is never shown and can remove their thread | private: only the asker can open them, and they are not on the front page |
| Reveal a creator's contact details | not available | the email from the creator's public bio, when there is one, at no charge |

Reading needs no account: the front page and every public thread are open to anyone. Asking
needs one. A question that ends having spent nothing does not count against the two.

If the wallet runs out of money, reaches the spend limit you set for this app, or is
disconnected while a question is being researched, the research stops there, the answer keeps
what it found, and the thread says which it was and what to do.

## How a wallet connection works

Sign in and press Connect AnyAPI wallet in the header. You land on the AnyAPI consent screen,
where you set the spend limit this app may use, and come back connected. This app never sees or
stores an AnyAPI key: it holds a refresh token, encrypted with `APP_ENCRYPTION_KEY`, and swaps
it for a short-lived access token when it makes a call. Disconnect deletes the token here and
revokes it at AnyAPI; a connection you end at AnyAPI puts you back on the free tier the next
time the app tries to use it.

Self-hosting with `SELF_HOSTED=true` has no per-account limit. The question length and the two
daily ceilings still apply, and you set them, as you may the instance-wide `RUNS_IN_FLIGHT`,
`DATA_CALLS_PER_MINUTE` and `VIDEO_INSPECTIONS_AT_ONCE`.

## Costs, measured

70 free questions on 2026-11-21, twelve different questions asked five or six times each. Data
is what AnyAPI billed at published prices, which is what the cost meter on the page shows; the
model bill is what Surplus Intelligence billed.

| Per question | Median | Mean | Worst |
|---|---|---|---|
| Data at published prices | $0.0179 | $0.0198 | $0.0494 |
| Model bill | $0.0005 | $0.0010 | $0.0165 |

The $0.10 limit never stopped a run; the most any of them spent was about $0.05. On your own
AnyAPI key you pay the published prices above.

## Data we store, and for how long

In Postgres:

- **Each question**: its text, status, start and finish times, the account that asked (never
  shown to anyone), and whether its asker removed it.
- **The full research record**: every search, profile, post list and transcript the agent read,
  including any contact detail a creator published in their own public bio. It never leaves the
  server.
- **The answer and the steps** shown on the thread page.
- **Images**: creator avatars and video covers in the answer, saved when the question finishes,
  because TikTok's image links expire within hours. A save cut short by a restart carries on the
  next time the thread is opened; an image whose link has expired by then falls back.
- **Counts**: which account asked when, for the two-a-day limit, and the house's spend per UTC
  day, for the daily ceilings.
- **Wallet connections**: for an account that connected its AnyAPI wallet, the refresh and
  access tokens, encrypted, until it disconnects or AnyAPI ends the connection.

Nothing is deleted automatically yet. Removing a thread takes it off the front page and its
address for everyone; its rows stay in the database.

## Built on AnyAPI

Every TikTok call this app makes goes through [AnyAPI](https://getanyapi.com). That is the point
of giving it away: the cost of each step is printed beside the step.

- One key reaches TikTok search, profiles, posts, transcripts and video files.
- You pay per request in USD, from a wallet, with no plan and no minimum.
- Every call returns its own price, which is what the cost meter on the page is made of.
- A free trial key with starter credit and no card is a sign-up away at
  <https://getanyapi.com>.

## Hosting it on Azure

Self-hosting needs none of this. It is how the one hosted instance runs.

### Provision, once

`scripts/azure-provision.sh` creates everything in one resource group and is safe to run
again: every step checks for the resource first. Secrets are never arguments to it. They
live in `deploy/env.production`, which is gitignored, and the script generates the one you
should not choose yourself.

Run it on a machine with the Azure CLI signed in and Docker running: it builds the first
image there and pushes it to the new registry. That build uses the Server Actions key in
the gitignored `deploy/actions-key.env`; if the file does not exist the script makes it,
once, without printing it, and never replaces one that does ("Let GitHub deploy" says why
the key matters and how GitHub gets the same value).

```bash
mkdir -p deploy
cat > deploy/env.production <<'EOF'
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ANYAPI_HOUSE_API_KEY=
SURPLUS_API_KEY=
MAX_QUESTION_CHARS=
EOF

RESOURCE_GROUP=creator-agent-prod scripts/azure-provision.sh --dry-run
RESOURCE_GROUP=creator-agent-prod scripts/azure-provision.sh
```

All five are required. `HOUSE_DATA_CAP_USD_PER_DAY` and `HOUSE_LLM_CAP_USD_PER_DAY` may be
added to the same file to override their defaults, and `RUNS_IN_FLIGHT`,
`DATA_CALLS_PER_MINUTE` and `VIDEO_INSPECTIONS_AT_ONCE` to set those limits, which are off unless set.

It writes `PG_ADMIN_PASSWORD`, `APP_ENCRYPTION_KEY`, `DATABASE_URL` and `APP_URL` back into that
file, and sets the same values as Container App secrets. Nothing else holds them.

Wallets can connect once the instance has an AnyAPI OAuth client for its address. After the
first run prints the app url, register one, add the printed `ANYAPI_OAUTH_CLIENT_ID` to
`deploy/env.production`, and run the script again:

```bash
APP_URL=https://<app url> pnpm --filter web anyapi:register
```

What it creates, all in `centralus` by default and all on the smallest sensible tier:

| Resource | Tier |
|---|---|
| Container registry | Basic |
| Postgres flexible server, plus a database and a firewall rule for Azure services | Burstable `Standard_B1ms`, 32 GiB, version 17 |
| Container Apps environment | Consumption |
| Container app, one replica, port 3000, external ingress | 0.5 vCPU, 1 GiB |
| User-assigned managed identity with `AcrPull` on the registry | - |

The app is pinned to exactly one replica because a question is researched inside the server
process that started it, and the migrations run as the container starts.

### The custom domain

Set `DOMAIN` and the script prints the records to publish, adds the hostname, asks for a
managed certificate and binds it. If the records are not visible yet it says so and leaves
everything else provisioned, so it is safe to run again once DNS has propagated:

```bash
RESOURCE_GROUP=creator-agent-prod DOMAIN=agent.example.com scripts/azure-provision.sh
```

An apex domain such as `example.com` needs an `A` record to the environment's address, because a
CNAME cannot sit at the root of a zone; a subdomain gets a `CNAME` to the app instead. The
script picks the right shape and the matching certificate validation method for you.

Azure resolves those records itself to prove you own the name and to issue the certificate,
so they must be served as published. Behind a proxying CDN, Cloudflare's orange cloud
included, Azure sees the proxy's address and its certificate instead and validation never
passes. Set the records to DNS-only until the certificate is issued.

### Let GitHub deploy

`.github/workflows/deploy.yml` signs in with OpenID Connect, so no Azure password is stored
on GitHub. `scripts/azure-github-oidc.sh` creates the app registration, the federated
credential that trusts one repository and branch, and the two role assignments the workflow
needs:

```bash
GITHUB_REPO=owner/repo RESOURCE_GROUP=creator-agent-prod scripts/azure-github-oidc.sh --dry-run
GITHUB_REPO=owner/repo RESOURCE_GROUP=creator-agent-prod scripts/azure-github-oidc.sh
```

Then set these on the repository, with `gh variable set` and `gh secret set` or in the
repository settings:

| Repository variable | Where it comes from |
|---|---|
| `AZURE_RESOURCE_GROUP` | the resource group you provisioned |
| `AZURE_CONTAINER_REGISTRY` | registry name, printed by the provision script |
| `AZURE_CONTAINER_APP` | container app name, printed by the provision script |
| `APP_HEALTH_URL` | `https://<hostname>/api/health`, printed by the provision script |

| Repository secret | Where it comes from |
|---|---|
| `AZURE_CLIENT_ID` | printed by `scripts/azure-github-oidc.sh` |
| `AZURE_TENANT_ID` | printed by `scripts/azure-github-oidc.sh` |
| `AZURE_SUBSCRIPTION_ID` | printed by `scripts/azure-github-oidc.sh` |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | `openssl rand -base64 32`, once, kept in `deploy/actions-key.env`; never rotate it casually |

The encryption key salts every Server Action id, and Clerk's sign-in calls one when the
session changes. Built without it, each deploy gets a new random key, every id changes, and
any tab open across the deploy fails on its next sign-in or sign-out. The deploy refuses to
build without it. The provision script made it into the gitignored `deploy/actions-key.env`
when it built the first image, and the manual deploy below reads it from there. Give GitHub
the same value; neither line prints it, and the first only makes the file if it is missing:

```bash
[ -e deploy/actions-key.env ] || (umask 077; mkdir -p deploy; printf 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" > deploy/actions-key.env)
sed -n 's/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=//p' deploy/actions-key.env | gh secret set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
```

A deploy builds the image, pushes it, rolls the container app to a revision named after the
commit, and then polls `APP_HEALTH_URL` until it answers 200. Migrations are not a separate
job: `docker-entrypoint.sh` applies them before the server starts, and one replica means
they run once.

`scripts/deploy-manual.sh` does the same from a clean checkout, for when the workflow is
not an option:

```bash
RESOURCE_GROUP=creator-agent-prod scripts/deploy-manual.sh
```

It reads the key from `deploy/actions-key.env` in the checkout it runs from and stops if
that file has none. Copy the file from the machine that made it; a new key breaks every open
tab on the next deploy.

Both scripts build through `scripts/build-image.sh`, which pins `--platform linux/amd64`,
because an image built on an Apple Silicon Mac without it pushes fine and then fails to pull
with "not found".

## Development

The agent core and its bench are at the repository root; the web app is in `web/`.

```bash
pnpm install
cp .env.example web/.env.local    # fill in the keys; DATABASE_URL already points at the Compose Postgres
docker compose --env-file web/.env.local up -d postgres
pnpm --filter web db:migrate
pnpm --filter web dev
```

The checks CI runs:

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test
```

## Licence

MIT.
