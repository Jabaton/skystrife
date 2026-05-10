# Sky Strife — как устроен проект и как играть

## Что это

Sky Strife — это **онлайн-RTS на блокчейне**, написанная на фреймворке
[MUD](https://mud.dev). Все ключевые игровые сущности — юниты, постройки,
ходы, золото, бои, имена игроков, владение матчем — это **записи в смарт-контрактных
таблицах**. Клиент в браузере подписывается на эти таблицы через RPC и
рендерит игру через Phaser.

Если коротко: «Civilization-меньше-Civilization, где сервер — это смарт-контракт».

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Browser client (packages/client)                           │
│  React + Phaser + Vite. Layers: Network → Headless →        │
│  Local → Renderer. Подписан на onchain-таблицы через MUD    │
│  store-sync. Сабмитит транзакции через burner-wallet.       │
└─────────────────────────────────────────────────────────────┘
                       ▲                       │
                       │ events                │ tx
                       │ (eth_subscribe-ish)   ▼
┌─────────────────────────────────────────────────────────────┐
│  MUD World (packages/contracts) — Solidity                  │
│  • Tables: Combat, Position, OwnedBy, Match, Gold, …        │
│  • Systems: MoveSystem, BuildSystem, MatchSystem, …         │
│  • Один общий "World"-контракт с Namespace-routing.         │
└─────────────────────────────────────────────────────────────┘
                       ▲                       ▲
                       │ RPC                   │
            ┌──────────┴──────────┐    ┌───────┴───────┐
            │  Anvil (:8545)      │    │  headless     │
            │  локальная EVM      │    │  client/      │
            │  (devnet 31337)     │    │  bot scripts  │
            └─────────────────────┘    └───────────────┘
                       ▲
                       │
            ┌──────────┴──────────┐
            │  Plugins WS (:1993) │
            │  hot-reload плагинов│
            └─────────────────────┘
```

### Что делает каждый пакет

| Пакет | Зачем нужен |
| ----- | ----------- |
| `packages/contracts` | Смарт-контракты: World, Systems, Tables, шаблоны юнитов (`ts/templates/templates.ts`), пост-деплой скрипты (`script/PostDeploy.s.sol`, `DeployTemplates`, `DeployOrbs`, `DeploySeasonPass`, `DeploySkyKey`). |
| `packages/client` | Веб-клиент. Внутри слои: **Network** (RPC + индексация таблиц), **Headless** (игровая логика, не зависящая от рендера), **Local** (UI-стейт, выделение, hover), **Renderer/Phaser** (графика). |
| `packages/phaserx` | Обёртка над Phaser 3 (форк из MUD). |
| `packages/ecs-browser` | Боковая панель в клиенте для отладки ECS-стейта (что лежит в Position/Combat/Match для выбранной сущности). |
| `packages/art` | Спрайты, тайлсеты, Tiled-карты и плагин экспорта в формат шаблонов. |
| `packages/plugins` | WS-сервер с hot-reload пользовательских плагинов. Файлы из `packages/plugins/dev/` сразу подхватываются в **Plugin Manager** в клиенте. |
| `packages/headless-client` | Запускает World без UI: `mapUploader.ts` заливает карты в контракт после деплоя, `createDebugMatches.ts` создаёт тестовые матчи, `example.ts` — пример игры ботом. |
| `packages/matchmaking-server` | Опциональный, для prod — пуллит матчи. |
| `packages/discord-bot`, `packages/analytics-worker`, `packages/metadata-worker` | Прод-инфра (Discord, аналитика, метаданные NFT Season Pass). На локальном dev не нужны. |

### Что лежит в smart-contract таблицах (примеры из `packages/contracts/mud.config.ts`)

- **Combat** — `health / maxHealth / armor / strength / minRange / maxRange / archetype` юнита.
- **Position** — координаты `(x, y)` сущности внутри матча.
- **OwnedBy** — владелец сущности (игрок).
- **Match** — какому матчу принадлежит сущность (`matchEntity`).
- **Gold** / **GoldOnKill** — экономика.
- **Capturable** — структура, которую можно «захватить», а не убить (Settlement, GoldMine, …).
- **Factory** — какие юниты могут заказываться в Settlement и за сколько (`goldCosts: [100, 150, 200, 250, 400, 550, 700]`).
- **Untraversable**, **Stamina**, **Charger**, **MoveDifficulty** и десятки других — оставлены как enum-таблицы.

### Юниты (`packages/contracts/ts/templates/templates.ts`)

Эталонные шаблоны — это TypeScript, который при деплое заливается в onchain Templates. Примеры:

- **Swordsman** — `hp 120k, str 50k, range 1, counter -30` (front-line).
- **Pikeman** — анти-кавалерия.
- **Halberdier**, **Pillager**, **Knight**, **Dragoon**, **Brute** — разный микс HP/урон/радиус.
- **Archer**, **Catapult**, **Marksman** — рейндж.
- **Settlement** — стартовая база с `Factory`, `Capturable=true`, `health 250k`.
- **GoldMine**, **GoldCache** — источники золота.

Перечень типов юнитов фиксирован в enum `UnitTypes` в `mud.config.ts`.

### Системы (`packages/contracts/src/systems/`)

Каждая «команда игрока» — отдельный System-контракт:

- **MatchSystem** — создать матч, начать матч, завершить матч.
- **LobbySystem** — присоединиться к лобби, выбрать героя.
- **PlayerRegisterSystem** / **PlayerDeregisterSystem** — игрок входит/выходит.
- **NameSystem** — выбрать ник.
- **MoveSystem** — двигать юнита (учитывает `Stamina`, `MoveDifficulty`, дальность).
- **BuildSystem** — заказать постройку юнита в Settlement (тратит золото).
- **TemplateSpawnSystem** — спавн юнита по шаблону (внутренний хелпер).
- **CancelMatchSystem** — отменить матч.
- **CopyMapSystem** — копирование карты.
- **LevelUploadSystem** / **OfficialLevelSystem** / **LevelRotationSystem** — заливка карт и ротация.
- **AllowListSystem** — белые списки игроков на приватных матчах.
- **WithdrawSystem** — вывод onchain-активов (для prod).
- **SeasonPassSystem** / **CreateSeasonPassSystem** / **SeasonPassOnlySystem** — Season Pass NFT.
- **HeroConfigSystem** — настройка героев (стартовых юнитов матча).

Сабмит транзакции в любой System — это просто `world.call(systemId, calldata)`; клиент это делает через MUD-обёртки в `packages/client/src/mud/setupNetwork.ts`.

---

## Игровой процесс (вкратце)

1. **Создаётся матч.** Админ (или игрок с правами) вызывает `MatchSystem.createMatch(...)`,
   указывает карту, число игроков, и т.д. На карту через `LevelUpload`/`OfficialLevel`
   уже залиты тайлы и стартовые позиции.
2. **Игроки присоединяются.** Каждый делает `LobbySystem.joinMatch(...)` со своим
   `matchEntity`, выбирает героя (`HeroConfigSystem`).
3. **Матч стартует.** `MatchSystem.startMatch(...)` ставит флаг и запускает реальное
   время. С этого момента у каждого игрока есть стартовое золото, Settlement и герой
   с несколькими юнитами вокруг.
4. **Ход за ходом (real-time, не пошагово):**
   - Двигай юнита (`MoveSystem.move(...)`) — расходует Stamina.
   - Атакуй чужого юнита (входит в `MoveSystem.fightMove` / Combat) — расчёт ущерба
     онлайн в Solidity по `Combat`-таблице и архетипу.
   - Захватывай **Settlement** / **GoldMine** — если структура `Capturable`, она при
     приближении меняет владельца, а не умирает. Своя GoldMine даёт пассивный доход.
   - Из своего Settlement заказывай новые юниты (`BuildSystem.build(...)`) —
     спишет золото по `Factory.goldCosts`, заспавнит юнит по шаблону.
   - Используй героя как сильную фигуру (у него уникальные стат-блоки).
5. **Победа** — обычно «уничтожить/захватить все Settlement противника» или цели
   карты. Условие зашито в Match-таблицы + системы матча.

Подробности логики стоит смотреть прямо в `packages/contracts/src/systems/MatchSystem.sol` и `MoveSystem.sol`.

---

## Как открыть и сыграть локально

### 0. Запустить стек

См. `INSTALL.md`. После `pnpm dev` должны быть подняты:

- `http://localhost:1337` — клиент,
- `:1993` — plugins WS,
- `:8545` — anvil RPC.

Проверка:

```bash
curl -s -o /dev/null -w "client  : %{http_code}\n" http://localhost:1337/
curl -s -o /dev/null -w "plugins : %{http_code}\n" http://localhost:1993/
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
```

### 1. Соло-игра (быстрый smoke-test)

```
http://localhost:1337
```

Стандартный dev-сетап через `dev:create-debug-matches` уже создаёт тестовый
матч на отладочной карте. Победителя без второго игрока не будет, но можно
двигать юнитов, атаковать нейтралов, захватывать GoldMine, тренировать
юнитов в Settlement.

1. Нажми **PLAY**.
2. **SKIP** (пропустить выбор Season Pass).
3. Кликни на свой Settlement или героя, чтобы открыть панель действий.
4. Клик по юниту → видны зелёные клетки (куда можно идти) и красные (кого атаковать).
5. Клик по клетке — отправляется транзакция, анвил её мгновенно подтверждает,
   клиент обновляет состояние.

### 2. Игра вдвоём (vs самого себя)

В первом окне браузера (админ):

1. Открой `http://localhost:1337`.
2. **PLAY → SKIP → + CREATE MATCH**.
3. Имя матча, карта на 2 игрока, **CREATE AND JOIN MATCH**.
4. Выбери героя, **CREATE AND JOIN MATCH**, потом **PLAY**.

Во втором окне (обычный игрок) — открой в **инкогнито** или другом профиле
браузера:

1. `http://localhost:1337/?asPlayer`
2. **PLAY → SKIP**.
3. В списке матчей нажми **OPEN** на твоём матче и присоединись.

Когда оба игрока на месте — нажми **START** у админа.

### 3. Управление в бою

| Действие | Как |
| --- | --- |
| Выбрать юнита | Левый клик по нему |
| Двигаться | Клик по зелёной клетке (тратит Stamina) |
| Атаковать | Клик по подсвеченному врагу |
| Захватить | Дойти до Settlement / GoldMine и попасть в радиус |
| Заказать юнита | Кликни Settlement → выбери юнит из меню (списывается золото) |
| Снять выделение | ESC или клик по пустой клетке |
| Открыть Plugin Manager | Кнопка в правом верхнем углу |
| Открыть ECS Browser (debug) | Боковая панель (пакет `packages/ecs-browser`) |

### 4. Что точно работает на локалке

- Создание матчей и присоединение.
- Все типы юнитов из templates.ts.
- Захват Settlement и GoldMine.
- Заказ юнитов через Factory.
- Плагины из `packages/plugins/dev/` (через Plugin Manager в правом верхнем углу клиента).
- Headless-сценарии (`pnpm --filter headless-client run example`).

### 5. Что не работает на локалке (и почему это нормально)

- **Season Pass** как NFT — задеплоен, но прод-маркетплейс отсутствует.
- **Matchmaking server** — нужен только для прод-инстансов.
- **Analytics / Discord / metadata worker** — все читают индексеры redstone/garnet,
  а не локальный anvil.

---

## Полезные команды для исследования

```bash
# Какие таблицы и системы реально задеплоены в World:
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["0xd3368e2ab87d53f4cde3c7d3a9306f284f2c5d90","latest"],"id":1}' \
  http://localhost:8545 | jq -r .result | head -c 200

# Конфиг таблиц/энумов:
cat packages/contracts/mud.config.ts

# Список систем:
ls packages/contracts/src/systems/

# Шаблоны юнитов и их статы:
cat packages/contracts/ts/templates/templates.ts

# Карты, доступные на dev:
ls packages/contracts/data/levels/  2>/dev/null || ls packages/contracts/levels/ 2>/dev/null
```

## Куда копать дальше

- **Логика матча** — `packages/contracts/src/systems/MatchSystem.sol`,
  `MoveSystem.sol`, `BuildSystem.sol`.
- **Клиентский ECS-цикл** — `packages/client/src/layers/Headless/` и
  `packages/client/src/layers/Local/` (что-то меняется в стейте → реакция в Phaser).
- **Рендер** — `packages/client/src/layers/Renderer/Phaser/`.
- **Плагины** — `packages/plugins/dev/` + `packages/plugins/tutorials/`.
- **headless-бот** — `packages/headless-client/scripts/example.ts` (пример «как написать AI на тайпскрипте, который двигает юнитами»).
