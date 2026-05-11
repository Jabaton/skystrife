# Sky Strife — project overview & gameplay guide

## What is it

Sky Strife is an **online blockchain RTS** built on the
[MUD](https://mud.dev) framework. All key game entities — units, buildings,
moves, gold, battles, player names, match ownership — are **records in
smart-contract tables**. The browser client subscribes to those tables via
RPC and renders the game with Phaser.

In short: "a Civilization-lite where the server is a smart contract."

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser client (packages/client)                           │
│  React + Phaser + Vite. Layers: Network → Headless →        │
│  Local → Renderer. Subscribed to onchain tables via MUD     │
│  store-sync. Submits transactions through a burner wallet.  │
└─────────────────────────────────────────────────────────────┘
                       ▲                       │
                       │ events                │ tx
                       │ (eth_subscribe-ish)   ▼
┌─────────────────────────────────────────────────────────────┐
│  MUD World (packages/contracts) — Solidity                  │
│  • Tables: Combat, Position, OwnedBy, Match, Gold, …        │
│  • Systems: MoveSystem, BuildSystem, MatchSystem, …         │
│  • One shared "World" contract with Namespace routing.      │
└─────────────────────────────────────────────────────────────┘
                       ▲                       ▲
                       │ RPC                   │
            ┌──────────┴──────────┐    ┌───────┴───────┐
            │  Anvil (:8545)      │    │  headless     │
            │  local EVM          │    │  client/      │
            │  (devnet 31337)     │    │  bot scripts  │
            └─────────────────────┘    └───────────────┘
                       ▲
                       │
            ┌──────────┴──────────┐
            │  Plugins WS (:1993) │
            │  hot-reload plugins │
            └─────────────────────┘
```

### Package breakdown

| Package | Purpose |
| ------- | ------- |
| `packages/contracts` | Smart contracts: World, Systems, Tables, unit templates (`ts/templates/templates.ts`), post-deploy scripts (`script/PostDeploy.s.sol`, `DeployTemplates`, `DeployOrbs`, `DeploySeasonPass`, `DeploySkyKey`). |
| `packages/client` | Web client. Layers: **Network** (RPC + table indexing), **Headless** (game logic, render-independent), **Local** (UI state, selection, hover), **Renderer/Phaser** (graphics). |
| `packages/phaserx` | A Phaser 3 wrapper (fork from MUD). |
| `packages/ecs-browser` | Sidebar panel in the client for debugging ECS state (what's in Position/Combat/Match for a selected entity). |
| `packages/art` | Sprites, tilesets, Tiled maps and an export plugin for the template format. |
| `packages/plugins` | WS server with hot-reload of user plugins. Files in `packages/plugins/dev/` are picked up immediately in the **Plugin Manager** UI. |
| `packages/headless-client` | Runs the World without a UI: `mapUploader.ts` uploads maps to the contract after deploy, `createDebugMatches.ts` creates test matches, `example.ts` is a bot example. |
| `packages/matchmaking-server` | Optional, for production — pulls matches. |
| `packages/discord-bot`, `packages/analytics-worker`, `packages/metadata-worker` | Prod infra (Discord, analytics, NFT Season Pass metadata). Not needed for local dev. |

### What lives in smart-contract tables (examples from `packages/contracts/mud.config.ts`)

- **Combat** — `health / maxHealth / armor / strength / minRange / maxRange / archetype` of a unit.
- **Position** — entity coordinates `(x, y)` inside a match.
- **OwnedBy** — who owns an entity (player).
- **Match** — which match an entity belongs to (`matchEntity`).
- **Gold** / **GoldOnKill** — economy.
- **Capturable** — structures you capture rather than destroy (Settlement, GoldMine, …).
- **Factory** — which units a Settlement can build and at what cost (`goldCosts: [100, 150, 200, 250, 400, 550, 700]`).
- **Untraversable**, **Stamina**, **Charger**, **MoveDifficulty** and dozens of others — used as enum/flag tables.

### Units (`packages/contracts/ts/templates/templates.ts`)

Reference templates are written in TypeScript and uploaded onchain during deploy. Examples:

- **Swordsman** — `hp 120k, str 50k, range 1, counter -30` (front-line).
- **Pikeman** — anti-cavalry.
- **Halberdier**, **Pillager**, **Knight**, **Dragoon**, **Brute** — various HP/damage/range mixes.
- **Archer**, **Catapult**, **Marksman** — ranged.
- **Settlement** — starting base with `Factory`, `Capturable=true`, `health 250k`.
- **GoldMine**, **GoldCache** — gold sources.

The full list of unit types is in the `UnitTypes` enum in `mud.config.ts`.

### Systems (`packages/contracts/src/systems/`)

Each "player command" is a separate System contract:

- **MatchSystem** — create match, start match, finish match.
- **LobbySystem** — join lobby, pick a hero.
- **PlayerRegisterSystem** / **PlayerDeregisterSystem** — player join/leave.
- **NameSystem** — pick a name.
- **MoveSystem** — move a unit (respects `Stamina`, `MoveDifficulty`, range).
- **BuildSystem** — order a unit from a Settlement (costs gold).
- **TemplateSpawnSystem** — spawn a unit from a template (internal helper).
- **CancelMatchSystem** — cancel a match.
- **CopyMapSystem** — copy a map.
- **LevelUploadSystem** / **OfficialLevelSystem** / **LevelRotationSystem** — map upload and rotation.
- **AllowListSystem** — whitelist players for private matches.
- **WithdrawSystem** — withdraw onchain assets (for prod).
- **SeasonPassSystem** / **CreateSeasonPassSystem** / **SeasonPassOnlySystem** — Season Pass NFT.
- **HeroConfigSystem** — hero configuration (starting units for a match).

Submitting a transaction to any System is just `world.call(systemId, calldata)`; the client does this through the MUD wrappers in `packages/client/src/mud/setupNetwork.ts`.

---

## Gameplay (summary)

1. **A match is created.** The admin (or a player with permissions) calls `MatchSystem.createMatch(...)`, specifying a map, player count, etc. The map already has tiles and starting positions uploaded via `LevelUpload`/`OfficialLevel`.
2. **Players join.** Each player calls `LobbySystem.joinMatch(...)` with their `matchEntity` and picks a hero (`HeroConfigSystem`).
3. **The match starts.** `MatchSystem.startMatch(...)` sets a flag and starts real-time play. From this point each player has starting gold, a Settlement and a hero with several units around it.
4. **Real-time turns (not turn-based):**
   - Move a unit (`MoveSystem.move(...)`) — costs Stamina.
   - Attack an enemy unit (via `MoveSystem.fightMove` / Combat) — damage is calculated onchain in Solidity using the `Combat` table and archetype.
   - Capture a **Settlement** / **GoldMine** — if the structure is `Capturable`, it changes owner on approach instead of being destroyed. Owning a GoldMine gives passive income.
   - From your Settlement, order new units (`BuildSystem.build(...)`) — spends gold per `Factory.goldCosts`, spawns a unit from a template.
   - Use your hero as a powerful piece (unique stat block).
5. **Victory** — typically "destroy/capture all of the opponent's Settlements" or map-specific objectives. Win conditions are encoded in Match tables + match systems.

For details, look directly at `packages/contracts/src/systems/MatchSystem.sol` and `MoveSystem.sol`.

---

## Playing locally

### 0. Start the stack

See `INSTALL.md`. After `pnpm dev` you should have:

- `http://localhost:1337` — client,
- `:1993` — plugins WS,
- `:8545` — anvil RPC.

Quick health check:

```bash
curl -s -o /dev/null -w "client  : %{http_code}\n" http://localhost:1337/
curl -s -o /dev/null -w "plugins : %{http_code}\n" http://localhost:1993/
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
```

### 1. Solo play (quick smoke test)

```
http://localhost:1337
```

The standard dev setup via `dev:create-debug-matches` already creates a test
match on a debug map. You won't get a winner without a second player, but you
can move units, attack neutrals, capture GoldMines, and train units in your
Settlement.

1. Click **PLAY**.
2. **SKIP** (skip Season Pass selection).
3. Click on your Settlement or hero to open the actions panel.
4. Click a unit → green cells (walkable) and red cells (attackable) appear.
5. Click a cell → a transaction is sent, anvil confirms it instantly,
   the client updates the state.

### 2. 2-player game (vs yourself)

In the first browser window (admin):

1. Open `http://localhost:1337`.
2. **PLAY → SKIP → + CREATE MATCH**.
3. Enter a name, pick a 2-player map, **CREATE AND JOIN MATCH**.
4. Pick a hero, **CREATE AND JOIN MATCH**, then **PLAY**.

In the second window (regular player) — open in **Incognito** or a different
browser profile:

1. `http://localhost:1337/?asPlayer`
2. **PLAY → SKIP**.
3. In the match list click **OPEN** on your match and join.

When both players are in — click **START** as the admin.

### 3. In-game controls

| Action | How |
| --- | --- |
| Select a unit | Left-click on it |
| Move | Click a green cell (costs Stamina) |
| Attack | Click a highlighted enemy |
| Capture | Walk your unit to a Settlement / GoldMine within range |
| Build a unit | Click your Settlement → pick a unit from the menu (costs gold) |
| Deselect | ESC or click an empty cell |
| Open Plugin Manager | Button in the top-right corner |
| Open ECS Browser (debug) | Sidebar panel (package `packages/ecs-browser`) |

### 4. What works locally

- Creating matches and joining them.
- All unit types from templates.ts.
- Capturing Settlements and GoldMines.
- Building units via Factory.
- Plugins from `packages/plugins/dev/` (via Plugin Manager in the top-right corner).
- Headless scenarios (`pnpm --filter headless-client run example`).

### 5. What does NOT work locally (and why that's fine)

- **Season Pass** as an NFT — deployed, but the prod marketplace is absent.
- **Matchmaking server** — only needed for prod instances.
- **Analytics / Discord / metadata worker** — all read from redstone/garnet indexers,
  not the local anvil.

---

## Useful exploration commands

```bash
# Which tables and systems are actually deployed to the World:
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["0xd3368e2ab87d53f4cde3c7d3a9306f284f2c5d90","latest"],"id":1}' \
  http://localhost:8545 | jq -r .result | head -c 200

# Table / enum config:
cat packages/contracts/mud.config.ts

# List systems:
ls packages/contracts/src/systems/

# Unit templates and their stats:
cat packages/contracts/ts/templates/templates.ts

# Maps available in dev:
ls packages/contracts/data/levels/ 2>/dev/null || ls packages/contracts/levels/ 2>/dev/null
```

## Where to dig deeper

- **Match logic** — `packages/contracts/src/systems/MatchSystem.sol`,
  `MoveSystem.sol`, `BuildSystem.sol`.
- **Client ECS cycle** — `packages/client/src/layers/Headless/` and
  `packages/client/src/layers/Local/` (state change → Phaser reaction).
- **Rendering** — `packages/client/src/layers/Renderer/Phaser/`.
- **Plugins** — `packages/plugins/dev/` + `packages/plugins/tutorials/`.
- **Headless bot** — `packages/headless-client/scripts/example.ts` (example of "how to write a TypeScript AI that moves units").
