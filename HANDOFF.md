# Sky Strife — Handoff document

> This file is a snapshot of where the project stands and what's next.
> Read this **first** before doing any work on Phase B / Phase C.

---

## 0. Project at a glance

- **What it is.** Sky Strife is an onchain RTS built on the [MUD](https://mud.dev) framework. All gameplay logic lives in Solidity contracts in `packages/contracts/`. The client (Vite + React + Phaser) is mostly a renderer.
- **Local-only chain.** We run **anvil** on `127.0.0.1:8545` and deploy the MUD World to it on `pnpm dev`. There is no testnet, no Redstone, no real ETH. Every "transaction" is free — anvil pre-funds the burner with 10000 ETH.
- **Authentication (this is the new part).** Players must log in with **Discord** and then **bind a Phantom Solana wallet**. Auth-server (Express on `:3002`) issues a JWT cookie. The MUD burner wallet sits *behind* this auth and the player never sees MetaMask.
- **Money for matches.** SOL on **Solana devnet**, custodial escrow. Backend (`packages/auth-server`) holds the escrow keypair, accepts player stakes via Phantom-signed transactions, and pays the winner.
- **Open PR.** [PR #2](https://github.com/Jabaton/skystrife/pull/2) on branch `devin/1778491814-discord-phantom-auth`. **Everything below has been merged into this PR.** Do not open a new PR for Phase B — push to the same branch.

---

## 1. What is done (Phase A — already in PR #2)

### 1.1 Auth-server (`packages/auth-server/`)
- Express + sqlite (`.auth-data/auth.db`) + JWT cookie (`skystrife_session`, 30 days).
- Discord OAuth code-flow: `/api/auth/discord/start` → Discord → `/api/auth/discord/callback` → user upsert → cookie → redirect home.
- `/api/auth/me` returns the current user with `is_admin = (discord_id == DISCORD_ADMIN_USER_ID)`.
- Phantom SIWS-style wallet bind: `/api/auth/wallet/nonce` returns a message, `/api/auth/wallet/bind` verifies Ed25519 via `tweetnacl`.
- Auto-invite to guild via `PUT /guilds/{id}/members/{user}` using the bot token.
- SOL stake escrow endpoints:
  - `POST /api/stake/match` (admin only) — create a stake match with `stake_sol`
  - `POST /api/stake/match/:id/join` — accepts a Phantom-signed `signature`, verifies on devnet, records the player
  - `POST /api/stake/match/:id/finish` (admin only) — admin picks winner, escrow sends 2× to winner
  - `POST /api/stake/match/:id/cancel` (admin only) — refunds all stakers

### 1.2 Client auth layer (`packages/client/src/auth/`)
- `AuthProvider` + `useAuth()` hook bootstraps the session on mount.
- `LoginScreen` — two-step splash (Discord → Phantom). Auto-reconnects Phantom via `connect({ onlyIfTrusted: true })`.
- `AuthGate` wraps `/`, `/match`, `/admin`, `/pool` so unauthenticated users always see `LoginScreen`.

### 1.3 UI cleanup (matches the user's screenshots)
- **Splash** — removed the bottom legal links (`lattice.xyz | join discord | terms of service`), the "I agree" GDPR checkbox, and the "running on Redstone" wording. **`LoginScreen` is the new splash.**
- **Main page** — `AmalgemaUIRoot` no longer mounts `WelcomeToSkyStrifeModal` (the Redstone-gas modal), `SeasonInactiveModal`, `WelcomeBanner`, `MatchCountdown`, or the GDPR banner.
- **Header** — removed the "powered by MUD" line.
- **Sidebar (`InventorySidebar.tsx`)** — fully redesigned. Removed: Season card, Orb balance, Match Creation Cost, Match Reward, Session Wallet warning. Added: Discord avatar, `global_name`, `@username`, Solana address (truncated), cluster label, `unbind wallet` / `logout` buttons, "SOL Stake Pool →" link.
- **Twitter icon → X** (`packages/client/src/app/ui/Theme/SkyStrife/Icons/Twitter.tsx`).

### 1.4 Admin gate
- Sidebar Create Match button is now gated on `useAuth().isAdmin` (was `isSeasonActive`).

### 1.5 SOL Stake Pool (`/pool`, `packages/client/src/app/Pool.tsx`)
- Admin creates matches with arbitrary SOL stake amount.
- Players join by clicking **stake X SOL & join** → Phantom popup → tx signed and sent to devnet → backend verifies and records.
- Admin clicks **finish & pay** to send 2× to a chosen winner, or **cancel & refund** to send everyone back their stake.
- Every transaction is linked to Solana Explorer (`https://explorer.solana.com/...`).

### 1.6 Startup
- `./start.sh --background` brings up: anvil, contracts deploy, client, plugins WS, **and** auth-server on :3002.
- `pnpm dev` (mprocs) now has 5 panels: `dev:contracts`, `dev:client`, `dev:node`, `dev:plugins`, `dev:auth`.

### 1.7 Docs (all in English)
- `INSTALL.md` — setup from scratch + §12a (auth-server `.env`)
- `GAMEPLAY.md` — architecture, packages, units, systems, controls
- `TEST_PLAN.md` — 13-section end-to-end test checklist
- `start.sh` — comments + messages all English

---

## 2. What is NOT done (Phase B — pick this up next)

The user wants the following changes. The numbers below match the user's own list in the previous chat.

### **#1 — Remove the purple Orb currency for match creation**

- The Orb is `Orb_Balance` table in MUD. Match creation in `SummonIsland/Footer.tsx` currently calls `createMatchSkyKey` or similar, which deducts orbs.
- Replace with a frictionless local create: clicking "create match" should call the MUD `createMatch` system **without any cost**. Easiest path:
  - On the client, stop reading `useOrbBalance` and stop showing Orb-amount UI in the create modal.
  - In `packages/contracts/src/systems/CreateMatchSystem.sol` (or whichever creates matches), short-circuit the `IERC20Mintable(orbToken).transferFrom(...)` call when running locally. For dev simplicity, just call `createMatchSkyKey` (the path that doesn't require orbs) for everyone.
- Search hints: `Orb_Balance`, `useOrbBalance`, `MatchCreationCost`, `SkyKey`, `createMatchSkyKey`.

### **#2 — Remove Season Pass entirely; unlock everything it gates**

**What Season Pass currently gates** (confirmed by reading source):
- **Private matches.** `usePrivateMatchLimit` (`hooks/usePrivateMatchLimit.ts`) reads `SeasonPassPrivateMatchLimit` and `PrivateMatchesCreated`. Without Season Pass, the player has 0 private matches.
- **Season Pass-only heroes.** `HeroSelect.tsx:99` checks `HeroInSeasonPassRotation` — some heroes are locked out if you don't own the pass.
- **Joining Season Pass-only matches.** `MatchTable/hooks.ts:36` and `OpenMatches.tsx:45` filter rows the player can join based on `hasSeasonPass`.
- **The "Season Pass" sidebar card and modal** — `SeasonPass.tsx`, `SeasonPassImg.tsx`, `SeasonPassIcon.tsx`, `WelcomeBanner.tsx`.
- **Match type selector** (`SummonIsland/MatchType.tsx`) — "season-pass" is one of three options (public / private / season-pass).
- **Entrance fees + rewards** — `EntranceFee.tsx` and `RewardPercentages` are coupled to "do you have a Season Pass".

**How to remove:**
1. In `useSeasonPass.ts`, `useSeasonPassExternalWallet.ts` — make them return `true` always. That instantly unlocks everything.
2. Hide every Season Pass UI element: delete the cards from sidebar/main page, drop the `season-pass` choice from `MatchType.tsx`, remove `WelcomeBanner.tsx` mount, remove `SeasonPass.tsx` route.
3. Replace `usePrivateMatchLimit` with `{ limit: Infinity, created: 0 }`.
4. **Don't** touch the contracts unless you also want to clean up `Season_Pass*` tables — they can stay deployed and unused.

### **#3 — Private match: always available, optional password**

- Today private match = "whitelist by ETH address" + Season Pass gate.
- New design: any user can create a private match, with an **optional password** field.
- Schema change needed (one of two paths):
  - **A. Store password on backend.** Add `private_password_hash` to the stake-server's match row. On `POST /api/stake/match/:id/join`, require `{password}` body and compare to `password_hash`. UI on join: if match is private, show a password input.
  - **B. Store password on the MUD contract.** Add a `Password` table keyed by `matchEntity`. Joining checks the hash. More work, but trustless.
- Recommend **A** for now — the password is part of the stake-server flow, not MUD.

### **#4 — Casual vs Reward match**

- Add a toggle on `/pool` create form: **Casual** (no stake) vs **Reward** (with stake).
- Casual → skip the SOL transaction entirely. Just call MUD `createMatch`. Backend doesn't track a stake row.
- Reward → existing flow (admin sets `stake_sol`, players stake via Phantom).
- This should be a single field `mode: "casual" | "reward"` on the stake-server's match row. UI hides the "stake" amount when mode = casual.

### **#5 — Map gating**

Three maps in dev: **gm island**, **vortex**, **two players**.
- Regular players (`!isAdmin`) → see only **two players** as a choice in the level picker.
- Admins → see all three.
- Implement in `SummonIsland/ChooseLevel.tsx` by filtering `levelOptions` on `useAuth().isAdmin`.

### **#6 — In-game balance shows SOL, not Orbs**

- The "Your Balance" panel inside an active match (sidebar in the lobby — see screenshot 1) currently shows `Orb_Balance`.
- Replace with the user's live Solana wallet balance — fetch via `Connection(rpcUrl).getBalance(new PublicKey(user.wallet_pubkey))` from `auth-server/src/solana.ts`, expose as `GET /api/auth/wallet/balance`, and the client reads that.
- Hide the Orb icon, replace with Solana logo (or just text "SOL").

---

## 3. Pending UX/infra fixes from the user's questions

### **#7 — Does the game eat ETH? Will it last forever?**

**No — the game uses anvil locally.** It is a fresh disposable EVM that resets on every `pnpm dev`. Default `anvil` pre-funds 10 deterministic accounts with 10,000 ETH each. Every contract call is free (`--base-fee 0` is set in `packages/contracts/package.json:13`). There is **no real ETH involved**, no faucet needed, no mainnet, no Redstone. When the player closes the app and reopens, the anvil chain restarts from block 0 and the contracts are redeployed.

**TL;DR:** This is a developer setup. ETH is fake and infinite. The user never sees ETH or MetaMask. The only real money in the system is **SOL on devnet** for the stake pool, and even devnet SOL is free from `https://faucet.solana.com`.

If we ever ship to production, we'd need to either:
- Pick a permanent L2 (Redstone, Garnet, base, etc.) and pay real gas → kills the "no MetaMask" UX.
- Or move everything off-chain to a Node.js backend and lose MUD entirely.

For now: **stay on local anvil. Hide all references to "ETH" from the UI.**

### **#8 — "Desynced (Consider Reloading) — latest block: 0"**

**Root cause:** `anvil --base-fee 0` is launched without `--block-time`, so anvil mines a new block **only when a transaction arrives**. When the player is staring at the lobby without clicking anything, no blocks are mined for >10 seconds. The client's `useSyncStatus.ts` (line 38–43) marks any gap > 10 seconds as `syncStatus = "bad"`, which is what shows "Desynced".

**Fix:** Change `packages/contracts/package.json:13` from
```json
"devnode": "anvil --base-fee 0"
```
to
```json
"devnode": "anvil --base-fee 0 --block-time 1"
```
Anvil will then mine an empty block every second, the client will always be "Synced", and the warning goes away.

**Why "block: 0"** — that's just the `latestSyncedBlockNumber` state default. It's `0` until the indexer has seen at least one block log for the current view. With `--block-time 1` it'll start ticking up immediately.

### **#9 — What is "Plugin Manager"?**

It's a MUD feature, **inherited from the upstream Sky Strife code**. See [latticexyz/skystrife-public/packages/plugins/README.md](https://github.com/latticexyz/skystrife-public/blob/main/packages/plugins/README.md).

**What it does:** lets a player drop a TypeScript file into `packages/plugins/dev/` and the client picks it up at runtime via a WebSocket on `:1993`. Plugins can:
- subscribe to MUD tables (e.g. `Combat`, `Position`)
- read and modify Phaser UI elements
- show overlay panels (like the "Frenzy v0.2" and "Opponent Gold" boxes the user saw in screenshot 1)
- bind keyboard shortcuts

Examples in the repo:
- `dev/frenzy.ts` — bind F to "attack the best damage target with the selected unit"
- `dev/opponentGold.ts` — show the opponent's gold per turn
- `dev/playerDetails.ts` — show player metadata

**Is it needed for us?** No, but it's also harmless. We can either:
- **Remove the Plugin Manager button** and the `packages/plugins` startup — would shrink the UI by one button, simpler for end users.
- **Keep it**, it's already there, costs nothing, useful for QA/devs.

Recommendation: **keep it for now**, hide the "+ ADD PLUGIN" button for non-admins so casual players don't accidentally open it. If the user explicitly says "remove plugin manager entirely", do this:
1. Delete the Plugin Manager button trigger in `Header.tsx` (or wherever it's mounted).
2. Remove `dev:plugins` from `package.json:dev`.
3. Stop spawning the plugins server in `start.sh`.

---

## 4. How to continue

### Branch / PR

- **Branch:** `devin/1778491814-discord-phantom-auth`
- **PR:** [#2](https://github.com/Jabaton/skystrife/pull/2)
- **Do NOT** create a new PR. Push commits to the same branch — user wants a single PR to test against.

### Local dev setup (for whoever picks this up)

1. Read `INSTALL.md` cover-to-cover. Don't skip.
2. `git clone https://github.com/Jabaton/skystrife.git && cd skystrife`
3. `git checkout devin/1778491814-discord-phantom-auth`
4. `pnpm install` (workspace, ~3 min on first run)
5. `cp packages/auth-server/.env.example packages/auth-server/.env` → fill in:
   - `DISCORD_*` — six values, the user has them in Devin secrets, names: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID`, `DISCORD_ADMIN_USER_ID`
   - `JWT_SECRET` — `openssl rand -base64 64`, must be ≥ 32 chars
   - `SOLANA_ESCROW_PRIVATE_KEY` — base58 secret key for a devnet wallet (generate with `solana-keygen new --no-bip39-passphrase`)
   - `SOLANA_ESCROW_PUBKEY` — corresponding pubkey
6. In Discord Developer Portal → OAuth2 → Redirects → add **exactly** `http://localhost:1337/api/auth/discord/callback`
7. Invite the bot to your guild: `https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot+applications.commands&permissions=84993`
8. Phantom → Settings → Developer Settings → switch to **Devnet**. Fund your wallet + the escrow with ~0.05 SOL each via `https://faucet.solana.com`.
9. `pnpm dev` (mprocs) — all 5 panels should turn green.
10. Open `http://localhost:1337` → "Sign in with Discord" should redirect to Discord and back.

### Suggested commit order for Phase B

1. **Easy infra wins first.** Add `--block-time 1` to anvil (fixes desync). Set `useSeasonPass` to always return `true` (unlocks everything Season-Pass-gated). One small commit, immediately testable.
2. **Sidebar / main page cleanup.** Strip remaining Orb UI, Season Pass cards, "Match Creation Cost" labels.
3. **Map gating** — easiest user-facing change, just filter `ChooseLevel`.
4. **Match type rework.** Replace "public / private / season-pass" with "casual / reward" + optional password. Backend (`auth-server/src/stake.ts`) needs a `mode` column and a `password_hash` column.
5. **In-game SOL balance.** Add `GET /api/auth/wallet/balance` to auth-server, plug into the lobby's "Your Balance" widget.
6. **Plugin Manager** — defer until user says yes/no on removing it.

### Useful files (where to start reading)

| Feature | File |
| --- | --- |
| Auth backend | `packages/auth-server/src/main.ts` |
| Auth UI | `packages/client/src/auth/LoginScreen.tsx`, `AuthContext.tsx` |
| Sidebar (the one to clean) | `packages/client/src/app/amalgema-ui/InventorySidebar.tsx` |
| Create-match modal (Orbs live here) | `packages/client/src/app/amalgema-ui/SummonIsland/Footer.tsx`, `MatchType.tsx`, `EntranceFee.tsx` |
| Level picker | `packages/client/src/app/amalgema-ui/SummonIsland/ChooseLevel.tsx` |
| In-game balance | `packages/client/src/layers/Local/...` or search `Orb_Balance` |
| Sync indicator | `packages/client/src/app/ui/hooks/useSyncStatus.ts`, `packages/contracts/package.json` |
| Stake pool UI | `packages/client/src/app/Pool.tsx` |
| Stake backend | `packages/auth-server/src/stake.ts` |

### Things to know that are NOT obvious

- **`pnpm install` is mandatory after every pull.** New deps land regularly (e.g. `@solana/web3.js` was added in Phase A). Vite will throw a cryptic `Failed to resolve import` if you skip it.
- **`better-sqlite3` is native.** If the user is on a fresh Ubuntu/WSL box without `build-essential` and `python3`, the auth-server will crash at startup. Document this in the setup steps.
- **Discord redirect URI is case-sensitive and exact.** `http://localhost:1337/api/auth/discord/callback` — anything else gets `invalid_redirect_uri`.
- **The MUD burner wallet auto-funds itself from anvil's default accounts on every page load.** This is fine for dev; in prod it would not work.
- **No CI.** Manual testing only, via `TEST_PLAN.md`.
- **No Russian anywhere.** User explicitly required English-only. Don't reintroduce Russian even in comments.

---

## 5. Open questions for the user (ask before Phase B starts)

1. **Plugin Manager** — do you want it removed entirely, hidden from non-admins, or left as-is?
2. **Casual matches** — should a casual match still cost the admin anything (e.g. a fixed admin gas, like 0.001 SOL), or completely free?
3. **In-match SOL balance** — should it update live (poll every 5s) or only on lobby open?
4. **Cancel match policy** — currently only admin can cancel. Should players be able to forfeit (= cancel just their own stake)? If yes, what happens to the match?
5. **Auto-payout on MatchFinished** — should the backend listen for the MUD `MatchFinished` event and auto-call `/finish` with the winner, or should the admin always confirm manually?

---

## 6. Reference: PR #1 (already merged or open separately)

PR #1 (https://github.com/Jabaton/skystrife/pull/1) was a separate "fix local dev setup + add INSTALL.md" PR. It documented Node 18.16.1, pnpm 8, Foundry 1.0.0, MUD checkout pinned to `e85dc5349`. **It does not need to be re-done.** Just keep an eye on it — if it merges to `main` while Phase B is in flight, you may need to rebase PR #2 on top of it.

---

*Last updated: 2026-05-10. Phase A complete + pushed to PR #2.*
