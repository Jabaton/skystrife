# Sky Strife — пошаговая установка и запуск (Ubuntu / WSL Ubuntu)

Это инструкция, по которой проект **гарантированно стартует без ошибок** на чистой
Ubuntu 22.04 / WSL Ubuntu. Здесь учтены все подводные камни, на которых падает
сборка по «обычной» инструкции из README.

> **Важно:** версии тут не «рекомендуемые», а **обязательные**. Если поставить
> другие — что-то сломается (см. раздел «Почему именно эти версии» в конце).

---

## 1. Системные пакеты

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential pkg-config libssl-dev
```

## 2. Node.js 18.16.1 (строго эта версия)

Через `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 18.16.1
nvm alias default 18.16.1
nvm use 18.16.1

node -v   # должно быть v18.16.1
```

> Не ставьте Node из `apt` и не ставьте Node 20 — `tsx@3.13`, которым пользуется
> skystrife, ломается на новом Node 18.20+ и на Node 20.

## 3. pnpm 8 (для skystrife)

```bash
npm install -g pnpm@8
pnpm -v   # 8.x.x
```

> pnpm 9 не подойдёт: у skystrife `pnpm-lock.yaml` с `lockfileVersion: '6.0'`,
> который пишет именно pnpm 8.

## 4. Rust (нужен для Foundry)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustc --version
```

## 5. Foundry **версии 1.0.0** (строго)

```bash
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup -i 1.0.0
forge --version  # forge Version: 1.0.0-v1.0.0
anvil --version  # anvil Version: 1.0.0-v1.0.0
```

> **Не ставьте свежий Foundry (1.7.x).** В 1.7 включена проверка
> `Usage of address(this) detected in script contract`, из-за которой
> `PostDeploy` падает (skystrife использует `address(this)` в `CreateSeasonPassSystem`).

## 6. Клонируем skystrife и MUD

MUD кладём **рядом** с skystrife (не внутрь `packages/`!), потому что в
`packages/*/package.json` пути `link:../../../mud/packages/*`:

```bash
cd ~
git clone https://github.com/Jabaton/skystrife.git
git clone https://github.com/latticexyz/mud.git
```

## 7. Чекаут нужного коммита MUD

```bash
cd ~/mud
git checkout e85dc5349
```

> На любом коммите **до** `e85dc5349` (17 июля 2024, «feat(store,...): add table labels…»)
> код skystrife падает с `Overrides of \`name\` and \`namespace\` are not allowed
> for tables in a store config` — этот коммит первым включает поддержку
> `defineTable({ namespace, label, … })`, которой пользуется skystrife.

## 8. Сборка MUD (нужен pnpm 9 временно)

MUD на этом коммите требует pnpm 9. Поэтому ставим его, собираем MUD, потом
**возвращаемся** на pnpm 8 для skystrife:

```bash
npm install -g pnpm@9
cd ~/mud
pnpm install
NODE_OPTIONS="--max-old-space-size=8192" pnpm build   # OOM без флага
```

> `--max-old-space-size=8192` обязателен: на дефолтных 2ГБ воркер `store-sync`
> падает с `ERR_WORKER_OUT_OF_MEMORY`.

Возвращаем pnpm 8 для skystrife:

```bash
npm install -g pnpm@8
```

## 9. Патч MUD CLI (исправляем баг `--aws`)

В минифицированном CLI MUD есть баг: при не-KMS деплое в `argv` для
`forge script` попадает пустая строка `""`, и форж ругается
`encode length mismatch: expected 1 types, got 2`.

```bash
sed -i 's|"-vvv",s?"--aws":""|"-vvv",...(s?["--aws"]:[])|' \
  ~/mud/packages/cli/dist/commands-*.js
```

Проверка:

```bash
grep -l '"-vvv",\.\.\.(s?\["--aws"\]:\[\])' ~/mud/packages/cli/dist/commands-*.js
```

Должен найтись ровно один файл (`commands-XXXXXXX.js`).

## 10. Фикс `fs.watch` в плагинах

На Linux + Node 18 опция `recursive: true` для `fs.watch` не поддерживается —
плагин-сервер падает с `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`. В файле
`~/skystrife/packages/plugins/index.mjs` блок `fs.watch(...)` нужно завернуть
в try/catch с фолбэком на обычный watch:

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

(В этом репозитории файл уже исправлен.)

## 11. Анвилу — auto-mine

В `~/skystrife/packages/contracts/package.json` нужно убрать `--block-time 2`
у скрипта `devnode`:

```json
"devnode": "anvil --base-fee 0",
```

> С `--block-time 2` `mud deploy` ловит гонку nonce: отправляет ~150 транзакций
> быстрее, чем анвил их майнит, и часть теряется. На auto-mine каждая транзакция
> подтверждается синхронно — деплой проходит за ~15 секунд.

(В этом репозитории это уже сделано.)

## 12. Установка зависимостей skystrife

```bash
cd ~/skystrife
pnpm install
```

> Первый раз это долго (5–10 минут) — нормально.

## 13. Запуск

В одном терминале — локальная сеть и контракты + загрузка карт:

```bash
cd ~/skystrife
pnpm run dev:node            # терминал 1: анвил на :8545
```

В другом терминале — деплой и наполнение:

```bash
cd ~/skystrife
pnpm run dev:contracts       # деплой World + PostDeploy + Templates/Orbs/SeasonPass/SkyKey
pnpm run dev:upload-map      # загружает карты GM Island / Two Player / Vortex
pnpm run dev:create-debug-matches   # (опционально) создаёт тестовые матчи
```

И ещё два терминала — клиент и плагин-сервер:

```bash
pnpm run dev:client          # http://localhost:1337
pnpm run dev:plugins         # ws://localhost:1993
```

Либо одной командой через `mprocs` (как в стандартном `pnpm dev`):

```bash
pnpm dev
```

Открыть в браузере: <http://localhost:1337>.

## 14. Проверка, что всё живо

```bash
curl -s -o /dev/null -w "client  : %{http_code}\n" http://localhost:1337/
curl -s -o /dev/null -w "plugins : %{http_code}\n" http://localhost:1993/
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
```

Должно быть `200`, `200`, и JSON с номером блока.

---

## Почему именно эти версии

| Компонент      | Версия               | Причина                                                                                                  |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Node           | **18.16.1**          | `tsx@3.13` ломается на 18.20+ (`tx must be loaded with --import instead of --loader`).                   |
| pnpm (skystrife)| **8**               | `pnpm-lock.yaml` skystrife — `lockfileVersion: 6.0`, его пишет только pnpm 8.                            |
| pnpm (mud)     | **9**                | Любой коммит mud после мая 2024 требует pnpm 9 в `engines`.                                              |
| Foundry        | **1.0.0**            | На 1.7+ форж блокирует `address(this)` в скриптах → PostDeploy падает.                                   |
| MUD коммит     | **e85dc5349**        | До этого коммита `defineTable({ namespace, … })` запрещён валидацией. После — ок.                        |

## Что пошло не так в исходной install.docx

1. Сказано клонировать MUD внутрь `packages/` — а пути в `package.json`
   у skystrife: `link:../../../mud/packages/*`, значит MUD должен быть
   **сиблингом** skystrife, не внутри `packages/`.
2. Не сказано, какой коммит MUD брать. С последним `main` mud (v2.2.x)
   skystrife собирается, но требует Node 20 + pnpm 9 для самого mud, а у
   skystrife свой Node 18 + pnpm 8. На коммитах mud старше июля 2024
   skystrife не валидируется (см. таблицу).
3. Не сказано про версию Foundry — на свежем 1.7 проект просто не деплоится.
4. Не упомянуты баги в плагин-сервере (`fs.watch recursive`) и в MUD CLI
   (`--aws ""`).
