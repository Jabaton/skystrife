# Sky Strife — Discord + Phantom + Solana test plan

Этот документ — чек-лист по новому функционалу из PR #2.
Идём сверху вниз, отмечаем галочкой пройденные пункты, в комментах PR пишем
номера тех, что сломались, со скриншотом/логом.

---

## 0. Prerequisites

- [ ] Node 18.16.1, pnpm 8, Foundry 1.0.0 — см. `INSTALL.md §1–§5`.
- [ ] Mud сиблингом, на коммите `e85dc5349`, собран — `INSTALL.md §6–§9`.
- [ ] В корне проекта выполнен `pnpm install` без ошибок.
- [ ] Установлен Phantom wallet в браузере (https://phantom.app/download).
- [ ] Phantom переключён на **Devnet** (Settings → Developer Settings → Testnet Mode → Devnet).
- [ ] В Phantom есть хотя бы **0.05 SOL** на devnet (попроси через https://faucet.solana.com).

## 1. Конфигурация auth-server

- [ ] `packages/auth-server/.env` создан по образцу `.env.example`.
- [ ] В нём заполнены:
  - [ ] `DISCORD_CLIENT_ID`
  - [ ] `DISCORD_CLIENT_SECRET`
  - [ ] `DISCORD_BOT_TOKEN`
  - [ ] `DISCORD_GUILD_ID`
  - [ ] `DISCORD_CHANNEL_ID`
  - [ ] `DISCORD_ADMIN_USER_ID` (твой Discord user id)
  - [ ] `JWT_SECRET` (длинная случайная строка)
  - [ ] `SOLANA_ESCROW_PRIVATE_KEY` (base58)
  - [ ] `SOLANA_ESCROW_PUBKEY` (base58, соответствует приватнику)
  - [ ] `SOLANA_CLUSTER=devnet`
- [ ] В Discord Developer Portal → OAuth2 → Redirects добавлен:
  `http://localhost:1337/api/auth/discord/callback`.
- [ ] Discord-бот **уже состоит** в гильдии `DISCORD_GUILD_ID` (иначе `guilds.join` не сработает).
- [ ] Эскроу-кошелёк (адрес `SOLANA_ESCROW_PUBKEY`) зафанжен хотя бы на 0.05 SOL
      на devnet, чтобы хватило на gas при выплатах
      (https://faucet.solana.com → вставить адрес).

## 2. Запуск стека

- [ ] `./start.sh --background` отрабатывает без ошибок и пишет в конце:
  ```
  ok  client:  http://localhost:1337
  ok  plugins: http://localhost:1993
  ok  RPC:     http://localhost:8545
  ok  auth:    http://localhost:3002 (Discord+Solana)
  ```
- [ ] `curl -s http://localhost:3002/health` → `{"ok":true}`
- [ ] `curl -s http://localhost:3002/api/stake/escrow`
      → `{"cluster":"devnet","pubkey":"…"}` с твоим адресом эскроу.

## 3. Splash screen и LoginScreen

- [ ] При открытии `http://localhost:1337/` НЕ показывается
      "I agree" / нижние линки lattice.xyz / join discord / terms.
- [ ] Вместо этого виден **LoginScreen** с шагом 1 "Войти через Discord".
- [ ] Никаких ETH-кошельков / MetaMask-попапов на старте **не появляется**.

## 4. Discord OAuth

- [ ] Клик "Войти через Discord" редиректит на `discord.com/oauth2/authorize?...`.
- [ ] После approve редирект обратно на `/` без ошибок.
- [ ] Если ты не был в гильдии, бот сам тебя добавил
      (Discord-уведомление "You've been added to <server>").
- [ ] В UI отображается твой `global_name` (display name), а не `username#1234`.

## 5. Phantom wallet bind

- [ ] LoginScreen перешёл к шагу 2 "Подключи Phantom".
- [ ] Клик "Connect Phantom" → Phantom открывается, просит approve connect.
- [ ] После approve Phantom просит подписать SIWS-сообщение
      ("Sky Strife wants you to sign in with your Solana account: …").
- [ ] После подписи LoginScreen пропадает, открывается главное меню (Amalgema).
- [ ] **Перезагрузи страницу** — должно сразу открыться главное меню,
      без LoginScreen (сессия в JWT-cookie сохранилась 30 дней).

## 6. UI чистка главного меню

Проверь, что в главном меню (`/`):

- [ ] В шапке нет "powered by MUD".
- [ ] Нет "Sky Strife Season 2!" / Season-баннера.
- [ ] Нет "Match Creation Cost in Orbs" / "MINT 0.030 ETH".
- [ ] Нет "Welcome to Sky Strife / Redstone gas" модалки.
- [ ] Нет "Synced — Switch to Foundry" индикатора.
- [ ] Иконка соцсети в правой колонке — **X** (квадратный логотип), не птица.
- [ ] В сайдбаре справа показана карточка Discord-профиля:
  - [ ] аватарка из Discord
  - [ ] `global_name`
  - [ ] `@username`
  - [ ] `ADMIN` (золотая надпись), если ты — `DISCORD_ADMIN_USER_ID`
  - [ ] адрес Solana wallet (укорочен `XXXX…YYYY`)
  - [ ] метка кластера `devnet`
  - [ ] кнопки `unbind wallet` / `logout`

## 7. Admin gate

Зайди под **админ-аккаунтом** (id == `DISCORD_ADMIN_USER_ID`):

- [ ] Кнопка **create match** видна над списком матчей.

Залогинься под **не-админ** аккаунтом (другой Discord, или временно поменяй
`DISCORD_ADMIN_USER_ID` на чужой и перезапусти auth-server):

- [ ] Кнопка **create match** скрыта.
- [ ] Видна только кнопка **Matchmaking** (присоединиться к случайному).

## 8. Solana Pool — admin flow

Откройте `http://localhost:1337/pool` (или через кнопку **SOL Stake Pool →** в сайдбаре).

- [ ] Видим заголовок "Solana Stake Pool".
- [ ] В блоке Escrow показан адрес и текущий баланс в SOL.
- [ ] Под админ-аккаунтом видна форма "create new stake match":
  - [ ] Ввод 0.01 → "create match" → новая строка появилась.
  - [ ] Status `open`, players 0, pool 0 SOL.
- [ ] Под НЕ-админом этой формы нет, есть только список матчей.

## 9. Solana Pool — player join

Под обычным игроком (или тем же админом — это нормально):

- [ ] На своей открытой матче клик **stake X SOL & join**.
- [ ] Phantom попросил approve transfer X SOL на эскроу.
- [ ] После approve кнопка ушла в `…signing`, потом исчезла.
- [ ] В строке появилась запись `XXXX… (you) X SOL`.
- [ ] `https://explorer.solana.com/address/{escrow}?cluster=devnet` показывает
      входящую транзакцию.
- [ ] Если повторно нажать "stake" — ошибка "already joined".
- [ ] Если кошелёк пустой — ошибка от Phantom "insufficient funds".

## 10. Solana Pool — finish & payout

Для этого нужно **двух** игроков (можно через два браузера / два Discord-аккаунта,
оба должны застейкать в один матч).

Под админом:

- [ ] У строки матча появился ряд кнопок "finish & pay: [me] [XXXX] …"
      (по одной на каждого застейкавшегося).
- [ ] Клик по нужному игроку → status матча меняется на `paid`,
      появляется строка "Winner paid Y SOL. tx: …".
- [ ] Кошелёк победителя пополнился на 2× ставку (минус сетевая комиссия).
- [ ] Проигравший потерял свою ставку — баланс не вернулся.

## 11. Solana Pool — cancel & refund

- [ ] Создай новый матч, застейкай в него 2 игроков.
- [ ] Админ нажал **cancel & refund** → подтверждение.
- [ ] Статус матча → `cancelled`.
- [ ] Оба игрока получили обратно свою ставку (минус сетевая комиссия).

## 12. Logout

- [ ] Клик `logout` в сайдбаре → редирект на LoginScreen.
- [ ] Перезагрузка страницы — LoginScreen остаётся.

## 13. Тест ошибок (необязательно)

- [ ] Если auth-server упал (kill `pid auth.pid`) — клиент при логине
      показывает "Failed to start Discord login" или похожую ошибку,
      не падает в белый экран.
- [ ] Если Phantom не установлен — кнопка показывает ссылку на
      https://phantom.app/download.
- [ ] Если в .env нет `DISCORD_ADMIN_USER_ID` — auth-server при создании
      матча (`POST /api/stake/match`) возвращает 403 "admin only".

---

## Что ЕЩЁ НЕ работает в этом PR (известные ограничения)

1. **Игровой матч и SOL pool — две отдельные сущности.**
   В этом PR `/pool` — чистая Solana-логика, она пока **не связана** с
   созданием игрового MUD-матча. То есть админ создаёт MUD-матч обычной
   кнопкой `create match` (старый Orb-flow MUD), а ставки на SOL
   управляет отдельно в `/pool`.

   Связку "создал MUD-матч → автоматически создаётся SOL stake" сделаю в
   следующем коммите этого же PR, как только подтвердишь, что нижняя
   часть (auth + pool) работает.

2. **Авто-выплата по событию MatchFinished.**
   Сейчас победителя в SOL pool выбирает админ кнопкой. В следующем
   коммите auth-server будет слушать MUD `MatchFinished`-событие и
   автоматически дёргать `/finish` с правильным `winner_discord_id`.

3. **In-game username = Discord global_name.**
   В сайдбаре имя из Discord, но если зайдёшь в `/match`, юниты
   подписаны старым on-chain `Name`. Это поправлю отдельным коммитом.

4. **ETH-комиссии под капотом.**
   Игровые транзакции к MUD всё ещё подписываются session wallet'ом на
   локальном anvil — пользователь это не видит, ETH-комиссии бесплатные
   (anvil), но архитектурно слой остаётся. Полное удаление ETH из UI
   завершено; полное удаление из network layer — в Phase B.

---

## Куда писать про ошибки

Прямо в PR #2 inline-комментариями, или в issues — приложи скриншот и
номер пункта из чек-листа.
