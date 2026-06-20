# pw-radar

[![npm](https://img.shields.io/npm/v/pw-radar.svg)](https://www.npmjs.com/package/pw-radar)
[![пример отчёта](https://img.shields.io/badge/пример-отчёт-orange)](https://mnmlsniper.github.io/pw-radar/example-report.html)

Покрытие API-тестами относительно OpenAPI/Swagger-спецификации — TypeScript-порт
[swagger-coverage](https://github.com/viclovsky/swagger-coverage), без необходимости в JVM.

Отвечает на вопрос: **какие операции, параметры, статусы и поля тела, описанные в спеке,
реально были задействованы тестами?**

Инструмент состоит из двух развязанных частей, связанных только папкой `coverage-output/`:

```
  Playwright-тесты ──(логгер)──► coverage-output/*.json ──(CLI)──► HTML + JSON отчёт
```

- **Логгер** — обёртка в одну строку вокруг `APIRequestContext` Playwright, которая
  записывает каждый запрос в файл на тест (безопасно для параллельных воркеров).
- **CLI-движок** — читает спеку и папку записей, прогоняет правила покрытия и пишет
  HTML-отчёт, JSON-результат и сводку в консоль.

## Установка

```bash
npm install -D pw-radar
```

Node ≥ 18. `@playwright/test` — опциональная peer-зависимость (нужна только логгеру).

## 1. Сбор покрытия (Playwright)

Оберните request-контекст в вашей фикстуре через `recordContext`:

```js
import { test as base } from '@playwright/test';
import { recordContext } from 'pw-radar/playwright';
import { Api } from '../api/api.js';

export const test = base.extend({
  api: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    await use(new Api({ request: recordContext(context) }));   // ← одна строка
    await context.dispose();                                   // ← сброс происходит сам
  },
});
```

Готово — каждый вызов теста пишется в `coverage-output/` (по файлу на тест). Сами тесты и
сервисы не меняются.

`recordContext(context, options)` принимает:

| Опция | По умолчанию | Что делает |
|-------|--------------|------------|
| `outputDir` | `"coverage-output"` | куда писать файлы |
| `sensitiveKeys` | типичные секреты | ключи заголовков/тела, чьи значения маскируются |
| `excludeHeaders` | служебные заголовки | какие заголовки выкинуть из записи |
| `includeRequestBody` | `true` | писать тело запроса (значения нужны для покрытия enum) |
| `captureResponseFields` | `true` | писать **имена** полей ответа (без значений) для детекта недокументированных полей |

**Значения** ответа никогда не записываются (скорость + приватность) — только статус,
content-type и **имена** полей верхнего уровня (для правила `only-declared-response-field`).

### Логирование запросов и ответов

Передайте опцию `log` в `recordContext` — и встроенный дебаг-логгер заработает.
Та же точка перехвата, что и у записи покрытия: ничего дополнительно оборачивать не нужно.

```js
recordContext(context, {
  log: 'summary',   // 'summary' | 'verbose' | true | LogOptions
})
```

**`summary`** (рекомендуемый дефолт): короткая строка для успешных запросов; полный разворот
(заголовки + тело + curl) для 4xx / 5xx / брошенных запросов.

**`verbose`**: раскрывает всё — заголовки и тело для каждого запроса.

```
✓ GET http://api.example.com/products/1 → 200
✗ POST http://api.example.com/login → 401
    headers: { "content-type": "application/json" }
    body: { "username": "neo", "password": "tr****23" }
    response: { "message": "Unauthorized" }
    curl: curl -X POST 'http://api.example.com/login' -H 'content-type: application/json' -d '{"username":"neo","password":"tr****23"}'
```

Все значения **маскируются** по умолчанию (те же `sensitiveKeys`, что и у записи покрытия).
Чувствительные заголовки (Authorization, Cookie) маскируются и в выводе, и в `curl`.

Полный `LogOptions`:

| Опция | По умолчанию | Что делает |
|-------|--------------|------------|
| `level` | `'summary'` | `'summary'` = компактный успех + развёрнутая ошибка; `'verbose'` = разворачивать всё |
| `onlyErrors` | `false` | логировать только 4xx / 5xx / брошенные запросы |
| `sink` | `'console'` | `'console'` \| `'file'` \| кастомный `Sink` \| массив |
| `mask` | `true` | маскировать чувствительные данные; для file-sink принудительно всегда |
| `maskKeys` | `[]` | дополнительные ключи для маскировки (добавляются к `sensitiveKeys`) |
| `color` | автодетект TTY | принудительно включить/выключить ANSI-цвет в console-sink |
| `fileFormat` | `'pretty'` | `'pretty'` \| `'jsonl'` (для file-sink) |
| `logDir` | `'logs'` | папка для file-sink |

#### Console-sink

Пишет в `stderr` с ANSI-цветом (автовыключается на non-TTY). При параллельном прогоне
каждая строка получает префикс `[w<индекс>]` — грепаете по нужному воркеру. Цвет —
только на экране, никогда в файлах.

#### File-sink

Один файл на тест в папке `logs/`, с индексом воркера в имени (например
`my-test-w2-<uuid>.log`). Та же модель параллельной безопасности, что и у `coverage-output/`.
Маскировка принудительно включена для файлового вывода — утечка токенов в CI-артефакты
исключена конструктивно.

```js
recordContext(context, {
  log: { sink: 'file', fileFormat: 'jsonl', logDir: 'logs' }
})
```

#### Кастомный sink (Allure, ELK, …)

Любая функция `(entry: LogEntry) => void` или объект `{ write, flush? }` работает как sink.
Поддерживается массив из нескольких sink'ов одновременно.

```js
// Allure-attachment — автоматически группирует по тесту, никакой каши из воркеров
recordContext(context, {
  log: {
    level: 'verbose',
    sink: (entry) => {
      allure.attachment('curl', entry.curl, 'text/plain');
      if (entry.responseBody !== undefined)
        allure.attachment('response', JSON.stringify(entry.responseBody, null, 2), 'application/json');
    },
  },
})
```

В `LogEntry` всегда есть готовый `curl` — в том числе для **брошенных запросов**
(timeout, connection refused), у которых нет ответа.

### Другие виды тестов — любой HTTP-клиент

`recordContext` — лишь обёртка над фреймворк-независимым рекордером. Скормить ему можно
всё, что видело пару `запрос → статус`, поэтому покрытие не привязано к `request` Playwright.

**Просто запросы в тестах (`fetch` / `axios` / `supertest` / …)** — отдаёте рекордеру то,
что вернул клиент, и в конце вызываете `flush()`:

```js
import { createRecorder } from 'pw-radar';

const rec = createRecorder({ outputDir: 'coverage-output' });

const res = await fetch('https://api.demo/users/42');
rec.record({
  method: 'GET',
  url: res.url,
  status: res.status,
  responseContentType: res.headers.get('content-type'),
});

rec.flush();   // пишет один файл покрытия
```

**Web / UI-тесты (браузерные)** — ловите запросы приложения через network-события и
кормите тот же рекордер:

```js
const rec = createRecorder({ outputDir: 'coverage-output' });

page.on('response', (res) => {
  const req = res.request();
  if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
    rec.record({
      method: req.method(),
      url: res.url(),
      status: res.status(),
      responseContentType: res.headers()['content-type'],
    });
  }
});

// ... прогоняете UI-сценарий (клики, формы) ...
rec.flush();
```

`method`, `url` и `status` — минимум; тело запроса, заголовки и имена полей ответа
опциональны и включают более глубокие правила (enum, недекларированные поля). `page.request`
— это тоже `APIRequestContext`, так что прямые API-вызовы из UI-теста можно обернуть
`recordContext`.

## 2. Сборка отчёта

```bash
npx pw-radar -s openapi.yaml -i coverage-output
```

```
Опции:
  -s, --spec <путь|url>   OpenAPI/Swagger спека (обязательно; можно несколько)
  -i, --input <папка>     Папка с записями покрытия (обязательно)
  -c, --config <путь>     JSON-файл конфигурации
  -b, --base-path <p>     Префикс, который есть в записях, но не в спеке (можно несколько)
  -H, --header "K: V"     HTTP-заголовок для загрузки удалённой спеки (можно несколько)
  -l, --locale <en|ru>    Начальный язык отчёта (в HTML встроен переключатель EN/RU)
      --theme <name>      Начальная тема: tech (по умолчанию), terminal, monochrome, cyber
      --validate          Валидировать спеку (падать на невалидной), а не просто парсить
  -q, --quiet             Без сводки в консоль
  -v, --verbose           Печатать предупреждения
  -h, --help
```

На выходе — `pw-radar-report.html` и `pw-radar-results.json`. HTML самодостаточен: все языки
и темы зашиты внутрь. Переключатели в футере сохраняют выбор в `localStorage`; `--locale`
и `--theme` задают лишь начальные значения при первом открытии.

### Базовый путь

Если в спеке пути вида `/products`, а API отдаётся под `/api/v1/products` (в спеке нет
`servers`/`basePath`), укажите префикс:

```bash
npx pw-radar -s openapi.yaml -i coverage-output -b /api/v1
```

Когда в спеке есть `servers` или `basePath` (в т.ч. на уровне пути/операции), префиксы
определяются автоматически.

### Удалённая спека с авторизацией

```bash
npx pw-radar -s https://host/openapi.json -i coverage-output \
  -H "Authorization: Bearer $TOKEN"
```

### Несколько спек

Микросервисы? Передайте `-s` несколько раз (или перечислите спеки в конфиге). Одной папки
покрытия достаточно — вызовы сопоставляются со всеми спеками.

```bash
npx pw-radar -s users.yaml -s orders.yaml -i coverage-output
```

Либо в конфиге, где у каждой спеки может быть свой `id` (суффикс файла отчёта) и базовые пути:

```json
{
  "specs": [
    { "id": "users",  "spec": "users.yaml",  "basePaths": ["/api/v1"] },
    { "id": "orders", "spec": "orders.yaml", "basePaths": ["/api/v1"] }
  ]
}
```

Вы получаете **оба среза**:

- **По сервисам** (`report-<id>.html`) — каждая спека считается против *всех* записанных
  вызовов независимо. Эндпоинт, общий для двух спек, засчитывается в обеих. Имя сервиса
  выводится в блоке *Generation* каждого отчёта.
- **Сводный** отчёт (`report.html` + `{ aggregate, perSpec }` в JSON) — каждый вызов
  относится к одной спеке (приоритет: самый длинный совпавший базовый путь, тай-брейк —
  порядок в списке), поэтому общие цифры и единый список *Missed* не задваиваются.

Один `-s` работает ровно как раньше — один `report.html`, один `results.json`.

## Конфигурация

Конфиг **никогда не ищется автоматически** — путь к нему всегда передаётся явно флагом `-c`:

```bash
npx pw-radar -s openapi.yaml -i coverage-output -c swagger-coverage.config.json
```

Если `-c` не передан, инструмент работает с дефолтами (все правила включены, без
обрезки базового пути, HTML + JSON на выходе). Если путь передан, но файл не читается —
дефолты применяются молча. Пример `swagger-coverage.config.json`:

```json
{
  "basePath": "/api/v1",
  "excludeDeprecated": true,
  "rules": {
    "status": { "filter": ["200", "201", "404"] },
    "empty-required-header": { "enable": false }
  },
  "writers": {
    "html": { "filename": "report.html", "locale": "ru", "theme": "terminal", "numberFormat": "0.##" },
    "json": { "filename": "results.json" }
  }
}
```

## Правила покрытия

### Как это считается

Каждое правило, глядя на **одну операцию спеки** (`METHOD + path`), порождает ноль или
несколько **условий**. После прогона всех записанных вызовов, попавших в эту операцию,
каждое условие получает статус *покрыто / не покрыто*, а операция классифицируется так:

- **Full** — покрыты **все** условия;
- **Partial** — покрыта **часть**;
- **Empty** — не покрыто **ни одного** (в т.ч. если в операцию не попало ни одного вызова —
  она же попадёт в секцию *Never called*);
- **Deprecated** — операция помечена `deprecated` и включён `exclude-deprecated`
  (исключается из статистики).

Условия бывают двух типов:
- **бинарные** — становятся покрытыми, как только **хотя бы один** вызов их удовлетворил
  (`status`, `parameter-not-empty`, `not-empty-body`, `property-not-empty`, `empty-required-header`);
- **накопительные** — решение принимается после **всех** вызовов (`only-declared-status`,
  `only-declared-response-field`, все enum-правила): они собирают наблюдённое множество и
  сравнивают с объявленным.

Сопоставление вызова с операцией — по методу и шаблону пути (`/products/{id}` ↔
`/products/123`), с учётом `basePath`/`servers` и флага `-b/--base-path`.

### Статусы ответа

| id | Создаётся | Покрыто, когда |
|----|-----------|----------------|
| `status` | по одному условию на **каждый объявленный** код в `responses` | пришёл вызов с этим кодом. Поддержаны диапазоны `2XX`/`4XX`/`5XX` и `default` (тогда условие закрывает любой подходящий код). Через конфиг можно сузить (`filter`) или игнорировать (`ignore`) коды |
| `only-declared-status` | одно условие на операцию | были вызовы и **все** наблюдённые коды объявлены в спеке. **Не покрыто** → сервер вернул недокументированный статус (`reason: Undeclared status: 500`) — признак дрейфа спеки или серверной ошибки |

### Поля ответа

| id | Создаётся | Покрыто, когда |
|----|-----------|----------------|
| `only-declared-response-field` | одно условие на операцию (только если в спеке описана схема ответа) | сервер не вернул ни одного поля верхнего уровня, **отсутствующего** в схеме ответа. **Не покрыто** → `reason: Undeclared fields: …` (дрейф спеки). Логгер пишет только **имена** полей ответа, без значений |

### Параметры (query / path / header / cookie)

| id | Создаётся | Покрыто, когда |
|----|-----------|----------------|
| `parameter-not-empty` | по условию на **каждый** параметр операции | параметр был передан непустым хотя бы в одном вызове |
| `enum-all-value` | по условию на каждый параметр с `enum` | в вызовах встретились **все** значения enum. **Не покрыто** → `reason: Missed values […]`. Значения берутся в т.ч. из `items` (массивы) и мульти-query |
| `enum-another-value` | по условию на каждый параметр с `enum` | встречено значение **вне** enum (негативный тест) |
| `empty-required-header` | по условию на каждый **header**-параметр | был вызов **без** этого заголовка (проверка пустого заголовка) |

### Тело запроса

| id | Создаётся | Покрыто, когда |
|----|-----------|----------------|
| `not-empty-body` | одно условие, если у операции есть `requestBody` | передано непустое тело |
| `property-not-empty` | по условию на **каждое** свойство тела, включая вложенные (`address.city`) и поля элементов массивов (`items.sku`) | свойство присутствовало в теле хотя бы раз |
| `property-enum-all-value` | по условию на каждое свойство с `enum` | встретились все enum-значения свойства |
| `property-enum-another-value` | по условию на каждое свойство с `enum` | встречено значение свойства вне enum |

Вложенность раскрывается в dot-нотацию (объекты и массивы объектов «прозрачны»), с защитой
от циклов и лимитом глубины. `const` (3.1) трактуется как enum из одного значения.

### Важно про «негативные» правила

`enum-another-value`, `property-enum-another-value` и `empty-required-header` закрываются
только **негативными** тестами (значение вне enum, отсутствующий заголовок). Если вы их не
пишете, операция честно останется **Partial**. Эти правила можно отключить, если такая
проверка не нужна.

### Отключение и настройка

Любое правило выключается через конфиг:

```json
{ "rules": { "empty-required-header": { "enable": false } } }
```

Для `status` дополнительно доступны `filter` (учитывать только эти коды) и `ignore`
(пропускать эти коды).

## Поддерживаемые спеки

OpenAPI 3.0 / 3.1 и Swagger 2.0. Обрабатываются `$ref` (внутренние/внешние),
`allOf`/`oneOf`/`anyOf`, enum (в т.ч. на `items` массивов), content-typed параметры,
базовые пути и серверы (включая уровень пути/операции). Подробности паритета с оригиналом —
в `docs/report-comparison.md`.

## Лицензия

Apache-2.0.
