# Sky Strife — Discord + Phantom + Solana test plan

End-to-end test checklist for everything in PR #2.
Walk top-to-bottom, tick boxes as you go, drop broken-item numbers (with
a screenshot/log) as PR comments.

---

## 0. Prerequisites

- [ ] Node 18.16.1, pnpm 8, Foundry 1.0.0 — see `INSTALL.md` sections 1–5.
- [ ] MUD cloned as a sibling at commit `e85dc5349`, built — `INSTALL.md` sections 6–9.
- [ ] At repo root `pnpm install` completes without errors.
- [ ] Phantom wallet installed in your browser (https://phantom.app/download).
- [ ] Phantom is switched to **Devnet** (Settings → Developer Settings → Testnet Mode → Devnet).
- [ ] Your Phantom wallet has at least **0.05 SOL** on devnet (faucet: https://faucet.solana.com).

## 1. auth-server configuration

- [ ] `packages/auth-server/.env` exists (copy from `.env.example`).
- [ ] Filled in:
  - [ ] `DISCORD_CLIENT_ID`
  - [ ] `DISCORD_CLIENT_SECRET`
  - [ ] `DISCORD_BOT_TOKEN`
  - [ ] `DISCORD_GUILD_ID`
  - [ ] `DISCORD_CHANNEL_ID`
  - [ ] `DISCORD_ADMIN_USER_ID` (your Discord user id)
  - [ ] `JWT_SECRET` (long random string)
  - [ ] `SOLANA_ESCROW_PRIVATE_KEY` (base58)
  - [ ] `SOLANA_ESCROW_PUBKEY` (base58, must match the private key)
  - [ ] `SOLANA_CLUSTER=devnet`
- [ ] In the Discord Developer Portal → OAuth2 → Redirects you added:
  `http://localhost:1337/api/auth/discord/callback`.
- [ ] The Discord bot is **already a member** of guild `DISCORD_GUILD_ID`
      (use the bot invite URL Devin shared). Otherwise `guilds.join` won't work.
- [ ] The escrow wallet (`SOLANA_ESCROW_PUBKEY`) has at least 0.05 SOL on devnet,
      so it can pay the tiny network fee on payout/refund transactions
      (faucet: https://faucet.solana.com → paste the escrow address).

## 2. Stack startup

- [ ] `./start.sh --background` finishes successfully and prints something like:
  ```
  ok  client:  http://localhost:1337
  ok  plugins: http://localhost:1993
  ok  RPC:     http://localhost:8545
  ok  auth:    http://localhost:3002 (Discord+Solana)
  ```
- [ ] `curl -s http://localhost:3002/health` → `{"ok":true}`
- [ ] `curl -s http://localhost:3002/api/stake/escrow`
      → `{"cluster":"devnet","pubkey":"…"}` showing your escrow address.

## 3. Splash screen and LoginScreen

- [ ] Opening `http://localhost:1337/` does NOT show
      "I agree" / lattice.xyz bottom links / "join discord" / terms.
- [ ] Instead you see the **LoginScreen** with step 1 "Sign in with Discord".
- [ ] No ETH-wallet / MetaMask popups appear at startup.

## 4. Discord OAuth

- [ ] Clicking "Sign in with Discord" redirects you to `discord.com/oauth2/authorize?...`.
- [ ] After Approve you are redirected back to `/` without errors.
- [ ] If you were not in the guild, the bot added you automatically
      (Discord notification: "You've been added to <server>").
- [ ] The UI shows your `global_name` (display name), not `username#1234`.

## 5. Phantom wallet bind

- [ ] LoginScreen moved to step 2 "Connect Phantom".
- [ ] Clicking "Connect Phantom Wallet" → Phantom opens, asks to approve connect.
- [ ] After approve Phantom asks you to sign the SIWS message
      ("Sky Strife wants you to sign in with your Solana account: …").
- [ ] After signing, LoginScreen disappears and the main menu (Amalgema) opens.
- [ ] **Reload the page** — main menu loads immediately, no LoginScreen
      (the JWT session cookie is good for 30 days).

## 6. Main-menu UI cleanup

On `/`, confirm:

- [ ] The header has no "powered by MUD".
- [ ] No "Sky Strife Season 2!" / season banner.
- [ ] No "Match Creation Cost in Orbs" / "MINT 0.030 ETH".
- [ ] No "Welcome to Sky Strife / Redstone gas" modal.
- [ ] No "Synced — Switch to Foundry" indicator.
- [ ] The social icon in the right column is **X** (square logo), not the bird.
- [ ] The right sidebar shows a Discord profile card:
  - [ ] Discord avatar
  - [ ] `global_name`
  - [ ] `@username`
  - [ ] `ADMIN` (gold label) if your id equals `DISCORD_ADMIN_USER_ID`
  - [ ] Solana wallet address (truncated `XXXX…YYYY`)
  - [ ] Cluster label `devnet`
  - [ ] `unbind wallet` / `logout` buttons

## 7. Admin gate

Logged in as **admin** (id matches `DISCORD_ADMIN_USER_ID`):

- [ ] The **create match** button is visible above the match list.

Logged in as **non-admin** (different Discord, or temporarily set
`DISCORD_ADMIN_USER_ID` to someone else and restart auth-server):

- [ ] The **create match** button is hidden.
- [ ] Only the **Matchmaking** button (join a random match) is visible.

## 8. Solana Pool — admin flow

Open `http://localhost:1337/pool` (or click **SOL Stake Pool →** in the sidebar).

- [ ] You see the "Solana Stake Pool" heading.
- [ ] The Escrow card shows the address and current SOL balance.
- [ ] As admin you see the "create new stake match" form:
  - [ ] Enter `0.01` → click "create match" → a new row appears.
  - [ ] Status `open`, players 0, pool 0 SOL.
- [ ] As non-admin the form is hidden, only the list is visible.

## 9. Solana Pool — player join

As any player (the admin works fine too):

- [ ] On an open match click **stake X SOL & join**.
- [ ] Phantom prompts you to approve a transfer of X SOL to the escrow.
- [ ] After approve the button shows `…signing`, then disappears.
- [ ] The row gains an entry `XXXX… (you) X SOL`.
- [ ] `https://explorer.solana.com/address/{escrow}?cluster=devnet`
      shows the incoming transaction.
- [ ] Clicking "stake" again → error "already joined".
- [ ] If the wallet is empty → Phantom error "insufficient funds".

## 10. Solana Pool — finish & payout

This needs **two** stakers (e.g. two browsers / two Discord accounts,
both stake into the same match).

As admin:

- [ ] The match row now has a row of "finish & pay: [me] [XXXX] …" buttons,
      one per staker.
- [ ] Clicking the chosen winner → match status flips to `paid`,
      a "Winner paid Y SOL. tx: …" line appears.
- [ ] The winner's wallet got 2× the stake (minus a tiny network fee).
- [ ] The loser lost their stake — balance did not return.

## 11. Solana Pool — cancel & refund

- [ ] Create a fresh match, stake from two players.
- [ ] Admin clicks **cancel & refund** → confirmation.
- [ ] Match status → `cancelled`.
- [ ] Both players got their stake back (minus a tiny network fee).

## 12. Logout

- [ ] Click `logout` in the sidebar → redirected back to LoginScreen.
- [ ] Page reload — LoginScreen persists.

## 13. Error states (optional)

- [ ] If auth-server is down (e.g. `kill $(cat .start-logs/pids/auth.pid)`)
      the client shows "Failed to start Discord login" or similar — does not
      crash to a white screen.
- [ ] If Phantom is not installed, the button shows the
      https://phantom.app/download link.
- [ ] If `.env` lacks `DISCORD_ADMIN_USER_ID`, `POST /api/stake/match` returns
      403 "admin only".

---

## Known limitations in this PR

1. **In-game match and SOL pool are two separate things.**
   `/pool` is pure Solana logic; it is NOT yet linked to creating a MUD game match.
   The admin still creates a MUD match via the old `create match` button (the
   legacy Orb flow inside MUD), and SOL stakes are managed independently on `/pool`.
   The "create MUD match → automatically create the SOL stake → auto-payout on
   MatchFinished" wiring will be done in the next commit on this same branch
   once the foundation is confirmed working.

2. **Auto-payout on the MatchFinished event.**
   For now the admin picks the winner via the UI button. The next commit will
   make auth-server listen to MUD's `MatchFinished` event on local anvil and
   call `/finish` automatically with the right `winner_discord_id`.

3. **In-game username = Discord global_name.**
   The sidebar already pulls the name from Discord, but inside `/match`
   the unit labels still use the on-chain `Name`. That'll be a follow-up.

4. **ETH fees under the hood.**
   Game transactions to MUD are still signed by the session wallet on local
   anvil. The user doesn't see this and ETH fees are free (anvil), but the
   underlying layer remains. The visible ETH removal in the UI is complete;
   full removal from the network layer is Phase B.

---

## Where to report bugs

Comment directly inline on PR #2 with the section number from this checklist
and a screenshot.
