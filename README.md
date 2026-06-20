# pw-radar

🇷🇺 [Русская версия](README.ru.md)

[![npm](https://img.shields.io/npm/v/pw-radar.svg)](https://www.npmjs.com/package/pw-radar)
[![example report](https://img.shields.io/badge/example-report-orange)](https://mnmlsniper.github.io/pw-radar/example-report.html)

API test coverage against an OpenAPI/Swagger specification — a TypeScript port of
[swagger-coverage](https://github.com/viclovsky/swagger-coverage), with no JVM required.

It answers: **which operations, parameters, statuses and body fields declared in your
spec were actually exercised by your tests?**

The tool has two decoupled halves connected only through a `coverage-output/` folder:

```
  Playwright tests ──(logger)──► coverage-output/*.json ──(CLI)──► HTML + JSON report
```

- **Logger** — a one-line wrapper around Playwright's `APIRequestContext` that records
  every request to a per-test file (safe across parallel workers).
- **Report CLI** — reads the spec + the recorded folder, evaluates coverage rules, and
  writes an HTML report, a JSON result, and a console summary.

## Install

```bash
npm install -D pw-radar
```

Node ≥ 18. `@playwright/test` is an optional peer dependency (only needed for the logger).

## 1. Collect coverage (Playwright)

Wrap the request context in your fixture with `recordContext`:

```js
import { test as base } from '@playwright/test';
import { recordContext } from 'pw-radar/playwright';
import { Api } from '../api/api.js';

export const test = base.extend({
  api: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    await use(new Api({ request: recordContext(context) }));   // ← one line
    await context.dispose();                                   // ← flushes automatically
  },
});
```

That's it — every call your tests make is recorded to `coverage-output/` (one JSON file
per test). Tests and service code stay untouched.

`recordContext(context, options)` accepts:

| Option | Default | Meaning |
|--------|---------|---------|
| `outputDir` | `"coverage-output"` | where per-test files are written |
| `sensitiveKeys` | common secrets | header/body keys whose values are masked |
| `excludeHeaders` | volatile headers | header names dropped from the record |
| `includeRequestBody` | `true` | record request bodies (values feed enum coverage) |
| `captureResponseFields` | `true` | record response field **names** (no values) to detect undeclared fields |

Response **values** are never recorded (speed + privacy) — only status, content-type, and
top-level response field *names* (for the `only-declared-response-field` rule).

### Request/response logging

Enable the built-in debug logger by passing a `log` option to `recordContext`.
It uses the same interception point as coverage recording — no extra wrapping needed.

```js
recordContext(context, {
  log: 'summary',   // 'summary' | 'verbose' | true | LogOptions
})
```

**`summary`** (recommended default): compact one-liner for successful calls; full detail
(headers + body + curl) for 4xx / 5xx / thrown requests.

**`verbose`**: expand everything — headers and body for every call.

```
✓ GET http://api.example.com/products/1 → 200
✗ POST http://api.example.com/login → 401
    headers: { "content-type": "application/json" }
    body: { "username": "neo", "password": "tr****23" }
    response: { "message": "Unauthorized" }
    curl: curl -X POST 'http://api.example.com/login' -H 'content-type: application/json' -d '{"username":"neo","password":"tr****23"}'
```

All values are **masked** by default (same `sensitiveKeys` as coverage). Sensitive headers
(Authorization, Cookie) are masked in both the log output and the generated `curl` command.

Full `LogOptions`:

| Option | Default | Meaning |
|--------|---------|---------|
| `level` | `'summary'` | `'summary'` = compact success + expanded error; `'verbose'` = expand all |
| `onlyErrors` | `false` | log only 4xx / 5xx / thrown requests |
| `sink` | `'console'` | `'console'` \| `'file'` \| custom `Sink` \| array of these |
| `mask` | `true` | mask sensitive headers/body; forced `true` for file sink (CI leak guard) |
| `maskKeys` | `[]` | extra key substrings to mask, in addition to `sensitiveKeys` |
| `color` | TTY autodetect | force-enable/disable ANSI color in the console sink |
| `fileFormat` | `'pretty'` | `'pretty'` \| `'jsonl'` (for the file sink) |
| `logDir` | `'logs'` | directory for the file sink |

#### Console sink

Outputs to `stderr` with ANSI color (auto-disabled on non-TTY). Under parallel workers each
line is prefixed with `[w<index>]` so you can `grep` a single worker's output. Color is
decorative — never in file output.

#### File sink

Writes one file per test to `logs/`, with the worker index in the filename (e.g.
`my-test-w2-<uuid>.log`), mirroring the same parallel-safety as `coverage-output/`. Masking
is always on for file output regardless of the `mask` option — token leaks into CI artifacts
are prevented by design.

```js
recordContext(context, {
  log: { sink: 'file', fileFormat: 'jsonl', logDir: 'logs' }
})
```

#### Custom sink (Allure, ELK, …)

Any `(entry: LogEntry) => void` function or `{ write, flush? }` object works as a sink.
Multiple sinks are supported as an array.

```js
// Allure attachment — automatically groups by test, no parallel interleaving
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

`LogEntry` always contains a ready-to-paste `curl` field — also for **thrown requests**
(timeout, connection refused) that never produce a response.

### Other test types — any HTTP client

`recordContext` is just sugar over a framework-agnostic recorder. Anything that observed a
`request → status` pair can feed it, so coverage isn't tied to Playwright's `request`.

**Plain requests in tests (`fetch` / `axios` / `supertest` / …)** — hand the recorder what
your client returned, then `flush()` at the end:

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

rec.flush();   // writes one coverage file
```

**Web / UI tests (browser-driven)** — capture the requests the app makes via network events
and feed the same recorder:

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

// ... run your UI scenario (clicks, forms) ...
rec.flush();
```

`method`, `url` and `status` are the minimum; request body, headers and response field names
are optional and unlock the deeper rules (enums, undeclared fields). `page.request` is also an
`APIRequestContext`, so direct API calls from a UI test can be wrapped with `recordContext`.

## 2. Build the report

```bash
npx pw-radar -s openapi.yaml -i coverage-output
```

```
Options:
  -s, --spec <path|url>   OpenAPI/Swagger spec (required; repeatable for many)
  -i, --input <dir>       Folder with recorded coverage files (required)
  -c, --config <path>     JSON config file
  -b, --base-path <p>     Prefix recorded paths carry but the spec omits (repeatable)
  -H, --header "K: V"     HTTP header for fetching a remote spec (repeatable)
  -l, --locale <en|ru>    Initial report language (an in-page EN/RU switcher is included)
      --theme <name>      Initial report theme: tech (default), terminal, monochrome, cyber
      --validate          Validate the spec (fail on invalid) instead of parse
  -q, --quiet             No console summary
  -v, --verbose           Print warnings
  -h, --help
```

> **Russian docs:** see [README.ru.md](README.ru.md).

Outputs `pw-radar-report.html` and `pw-radar-results.json`. The HTML is self-contained and
embeds all languages and themes. Runtime switchers (persisted in `localStorage`) let users
change both; `--locale` and `--theme` only set the **initial** values on first open.

### Base path

If your spec declares paths like `/products` but the API is served under `/api/v1/products`
(no `servers`/`basePath` in the spec), tell the matcher the prefix:

```bash
npx pw-radar -s openapi.yaml -i coverage-output -b /api/v1
```

(When the spec has `servers` or `basePath`, prefixes are detected automatically.)

### Multiple specs

Measuring a microservice setup? Pass `-s` more than once (or list the specs in the config).
One coverage folder is enough — calls are matched against every spec.

```bash
npx pw-radar -s users.yaml -s orders.yaml -i coverage-output
```

Or in the config, where each spec can carry its own `id` (report file suffix) and base paths:

```json
{
  "specs": [
    { "id": "users",  "spec": "users.yaml",  "basePaths": ["/api/v1"] },
    { "id": "orders", "spec": "orders.yaml", "basePaths": ["/api/v1"] }
  ]
}
```

You get **both views**:

- **Per-spec** reports (`report-<id>.html`) — each spec is measured against *all* recorded
  calls independently. An endpoint shared by two specs counts in both. The service name is
  shown in each report's *Generation* block.
- An **aggregate** report (`report.html`, plus `{ aggregate, perSpec }` in the JSON) — every
  call is routed to a single spec (longest matching base path wins, declaration order breaks
  ties), so overall figures and the global *Missed* list never double-count.

A single `-s` behaves exactly as before — one `report.html`, one `results.json`.

## Configuration

The config file is never auto-discovered — always pass it explicitly with `-c`:

```bash
npx pw-radar -s openapi.yaml -i coverage-output -c swagger-coverage.config.json
```

If `-c` is omitted the tool runs with built-in defaults (all rules enabled, no base-path
stripping, HTML + JSON output). If the path is provided but the file can't be read,
defaults apply silently. Example `swagger-coverage.config.json`:

```json
{
  "basePath": "/api/v1",
  "excludeDeprecated": true,
  "rules": {
    "status": { "filter": ["200", "201", "404"] },
    "empty-required-header": { "enable": false }
  },
  "writers": {
    "html": { "filename": "report.html", "locale": "ru", "theme": "terminal" },
    "json": { "filename": "results.json" }
  }
}
```

## Coverage rules

A condition is generated per declared item of an operation; an operation is **Full** when
all its conditions are covered, **Partial** when some are, **Empty** when none are.

| Rule id | Covered when… |
|---------|---------------|
| `status` | a call returned this declared status (supports `2XX` ranges and `default`) |
| `only-declared-status` | no **undeclared status** leaked through (spec drift) |
| `only-declared-response-field` | no **undeclared field** was returned by the server (spec drift) |
| `parameter-not-empty` | the parameter was sent non-empty |
| `enum-all-value` | every enum value of the parameter was used |
| `enum-another-value` | a value outside the enum was used (negative test) |
| `empty-required-header` | a call was made without this header |
| `not-empty-body` | a non-empty request body was sent |
| `property-not-empty` | the body property was present |
| `property-enum-all-value` | every enum value of the property was used |
| `property-enum-another-value` | a value outside the property enum was used |

Disable any rule via config (`"<id>": { "enable": false }`).

## Supported specs

OpenAPI 3.0 / 3.1 and Swagger 2.0. `$ref` (internal/external), `allOf`, enums and base
paths are handled. See `docs/report-comparison.md` for parity notes vs the original.

## License

Apache-2.0.
