# Sky Strife — step-by-step install & run (Ubuntu / WSL Ubuntu)

This is the install guide that the project is **guaranteed to start from on
a clean Ubuntu 22.04 / WSL Ubuntu**. It covers every gotcha that breaks the
"standard" README build.

> **Important:** versions here are not "recommended", they are **required**.
> Pick something else and something will break (see "Why these exact versions"
> at the end).

---

## 1. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential pkg-config libssl-dev
```

## 2. Node.js 18.16.1 (strictly this version)

Via `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 18.16.1
nvm alias default 18.16.1
nvm use 18.16.1

node -v   # must be v18.16.1
```

> Do not install Node from `apt`, and do not install Node 20: `tsx@3.13`
> (which Sky Strife uses) breaks on Node 18.20+ and on Node 20.

## 3. pnpm 8 (for Sky Strife)

```bash
npm install -g pnpm@8
pnpm -v   # 8.x.x
```

> pnpm 9 will not work: Sky Strife's `pnpm-lock.yaml` is `lockfileVersion: '6.0'`,
> which only pnpm 8 writes.

## 4. Rust (needed by Foundry)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustc --version
```

## 5. Foundry **version 1.0.0** (strictly)

```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup -i 1.0.0
forge --version  # forge Version: 1.0.0-v1.0.0
anvil --version  # anvil Version: 1.0.0-v1.0.0
```

> **Do not install the latest Foundry (1.7.x).** 1.7 enables the
> `Usage of address(this) detected in script contract` check, which makes
> `PostDeploy` fail (Sky Strife uses `address(this)` in `CreateSeasonPassSystem`).

## 6. Clone Sky Strife and MUD

MUD goes **next to** Sky Strife (not inside `packages/`!), because the
`packages/*/package.json` files link via `link:../../../mud/packages/*`:

```bash
cd ~
git clone https://github.com/Jabaton/skystrife.git
git clone https://github.com/latticexyz/mud.git
```

## 7. Check out the right MUD commit

```bash
cd ~/mud
git checkout e85dc5349
```

> On any commit **before** `e85dc5349` (July 17 2024, "feat(store,...): add table labels…"),
> Sky Strife code fails with `Overrides of \`name\` and \`namespace\` are not allowed
> for tables in a store config` — this commit is the first one that adds support for
> `defineTable({ namespace, label, … })`, which Sky Strife uses.

## 8. Build MUD (needs pnpm 9 temporarily)

MUD at this commit requires pnpm 9. Install it, build MUD, then **switch back**
to pnpm 8 for Sky Strife:

```bash
npm install -g pnpm@9
cd ~/mud
pnpm install
NODE_OPTIONS="--max-old-space-size=8192" pnpm build   # OOM without the flag
```

> `--max-old-space-size=8192` is required: on the default 2 GB the
> `store-sync` worker dies with `ERR_WORKER_OUT_OF_MEMORY`.

Switch pnpm 8 back for Sky Strife:

```bash
npm install -g pnpm@8
```

## 9. Patch the MUD CLI (fix the `--aws` bug)

The minified MUD CLI has a bug: on a non-KMS deploy it puts an empty string `""`
into the `argv` array for `forge script`, and forge complains with
`encode length mismatch: expected 1 types, got 2`.

```bash
sed -i 's|"-vvv",s?"--aws":""|"-vvv",...(s?["--aws"]:[])|' \
  ~/mud/packages/cli/dist/commands-*.js
```

Verify:

```bash
grep -l '"-vvv",\.\.\.(s?\["--aws"\]:\[\])' ~/mud/packages/cli/dist/commands-*.js
```

Exactly one file (`commands-XXXXXXX.js`) should match.

## 10. `fs.watch` fix for plugins

On Linux + Node 18 the `recursive: true` option for `fs.watch` is not supported —
the plugin server dies with `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`. In
`~/skystrife/packages/plugins/index.mjs` wrap the `fs.watch(...)` call in a
try/catch with a fallback to non-recursive watch:

```js
function startWatcher(options) {
  return fs.watch(pluginPath, options, (eventType, filename) => {
    if (filename) {
      console.log(`File changed: ${filename}`);
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            eventType,
            path: path.join(pluginDirName, filename),
          }));
        }
      });
    }
  });
}

try {
  startWatcher({ recursive: true });
} catch (err) {
  if (err && err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
    console.warn('Recursive fs.watch unavailable; falling back to non-recursive watch.');
    startWatcher({});
  } else {
    throw err;
  }
}
```

(In this repo the file is already fixed.)

## 11. Anvil auto-mine

In `~/skystrife/packages/contracts/package.json` you must remove `--block-time 2`
from the `devnode` script:

```json
"devnode": "anvil --base-fee 0",
```

> With `--block-time 2`, `mud deploy` hits a nonce race: it sends ~150 transactions
> faster than anvil mines them, and some get dropped. With auto-mine each transaction
> is confirmed synchronously, deploy completes in ~15 seconds.

(In this repo this is already done.)

## 12. Install Sky Strife dependencies

```bash
cd ~/skystrife
pnpm install
```

> First time this is slow (5-10 minutes) — that's normal.

## 12a. Auth-server for Discord and Solana

PR #2 adds a new package `packages/auth-server` that hosts Discord OAuth,
JWT sessions and the Solana stake escrow. Without it the client renders
the LoginScreen but login will not work.

1. Copy the example config:

   ```bash
   cp packages/auth-server/.env.example packages/auth-server/.env
   ```

2. Fill in your values in `.env`:

   - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — from the Discord Developer Portal
   - `DISCORD_BOT_TOKEN` — the bot token of the same application
   - `DISCORD_GUILD_ID` — your Discord server id
   - `DISCORD_CHANNEL_ID` — the channel the bot will invite players to
   - `DISCORD_ADMIN_USER_ID` — your Discord user id (only this id can create matches)
   - `JWT_SECRET` — a long random string (`openssl rand -base64 64`)
   - `SOLANA_ESCROW_PRIVATE_KEY` — base58 private key of the custodial escrow wallet
     (e.g. generate one with `solana-keygen new -o /tmp/escrow.json --no-bip39-passphrase`
     and read the base58 secret from the JSON)
   - `SOLANA_ESCROW_PUBKEY` — the matching public address
   - `SOLANA_CLUSTER` — `devnet` (recommended for development)

3. In the Discord Developer Portal → OAuth2 → Redirects add:

   ```
   http://localhost:1337/api/auth/discord/callback
   ```

4. The bot must be a member of the guild whose id you set in
   `DISCORD_GUILD_ID`, with scopes `bot` and `applications.commands` — so it
   can call `guilds.join` for new players.

> Without `.env` for the auth-server, `start.sh --background` still starts
> client/anvil/plugins but prints a warning and the LoginScreen can't talk
> to anyone. In plain `pnpm dev` (mprocs) the auth-server is not launched
> yet — use `./start.sh --background` or start it separately:
>
> ```bash
> pnpm --filter auth-server run start
> ```

## 13. Run

In one terminal — local network, contracts and map uploads:

```bash
cd ~/skystrife
pnpm run dev:node            # terminal 1: anvil on :8545
```

In another terminal — deploy + seeding:

```bash
cd ~/skystrife
pnpm run dev:contracts       # deploy World + PostDeploy + Templates/Orbs/SeasonPass/SkyKey
pnpm run dev:upload-map      # uploads maps GM Island / Two Player / Vortex
pnpm run dev:create-debug-matches   # (optional) creates test matches
```

And two more terminals — client and plugin server:

```bash
pnpm run dev:client          # http://localhost:1337
pnpm run dev:plugins         # ws://localhost:1993
```

Or all-in-one via `mprocs` (the regular `pnpm dev`):

```bash
pnpm dev
```

Or via `./start.sh --background`, which also brings up the
**auth-server** (Discord+Solana) — if `packages/auth-server/.env`
is filled in:

```bash
./start.sh --background     # also brings up auth on :3002
./start.sh --stop           # stop everything
```

Open in the browser: <http://localhost:1337>.

## 14. Smoke test

```bash
curl -s -o /dev/null -w "client  : %{http_code}\n" http://localhost:1337/
curl -s -o /dev/null -w "plugins : %{http_code}\n" http://localhost:1993/
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
```

Expected: `200`, `200`, and a JSON body with a block number.

---

## Why these exact versions

| Component       | Version       | Reason                                                                                                  |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| Node            | **18.16.1**   | `tsx@3.13` breaks on 18.20+ (`tx must be loaded with --import instead of --loader`).                    |
| pnpm (skystrife)| **8**         | Sky Strife's `pnpm-lock.yaml` is `lockfileVersion: 6.0`, which only pnpm 8 produces.                    |
| pnpm (mud)      | **9**         | Any post-May-2024 MUD commit requires pnpm 9 in its `engines`.                                          |
| Foundry         | **1.0.0**     | On 1.7+ forge blocks `address(this)` in scripts -> PostDeploy fails.                                    |
| MUD commit      | **e85dc5349** | Earlier commits forbid `defineTable({ namespace, … })` via validation; this one is the first to allow it.|

## What went wrong in the original install.docx

1. It said to clone MUD inside `packages/` — but the paths in Sky Strife's
   `package.json` are `link:../../../mud/packages/*`, so MUD has to be a
   **sibling** of Sky Strife, not inside `packages/`.
2. It didn't say which MUD commit to use. With the latest mud `main` (v2.2.x),
   Sky Strife builds but requires Node 20 + pnpm 9 for mud itself, while
   Sky Strife wants Node 18 + pnpm 8. On mud commits older than July 2024
   Sky Strife fails validation (see the table above).
