# pw-radar

[![npm](https://img.shields.io/npm/v/pw-radar.svg)](https://www.npmjs.com/package/pw-radar)

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

## 2. Build the report

```bash
npx pw-radar -s openapi.yaml -i coverage-output
```

```
Options:
  -s, --spec <path|url>   OpenAPI/Swagger spec (required)
  -i, --input <dir>       Folder with recorded coverage files (required)
  -c, --config <path>     JSON config file
  -b, --base-path <p>     Prefix recorded paths carry but the spec omits (repeatable)
  -H, --header "K: V"     HTTP header for fetching a remote spec (repeatable)
  -l, --locale <en|ru>    Initial report language (an in-page EN/RU switcher is included)
      --validate          Validate the spec (fail on invalid) instead of parse
  -q, --quiet             No console summary
  -v, --verbose           Print warnings
  -h, --help
```

> **Russian docs:** see [README.ru.md](README.ru.md).

Outputs `pw-radar-report.html` and `pw-radar-results.json`. The HTML embeds all languages
and has an in-page **EN/RU switcher** (choice persisted in `localStorage`); `--locale` only
sets the initial language.

### Base path

If your spec declares paths like `/products` but the API is served under `/api/v1/products`
(no `servers`/`basePath` in the spec), tell the matcher the prefix:

```bash
npx pw-radar -s openapi.yaml -i coverage-output -b /api/v1
```

(When the spec has `servers` or `basePath`, prefixes are detected automatically.)

## Configuration

Optional `swagger-coverage.config.json`:

```json
{
  "basePath": "/api/v1",
  "excludeDeprecated": true,
  "rules": {
    "status": { "filter": ["200", "201", "404"] },
    "empty-required-header": { "enable": false }
  },
  "writers": {
    "html": { "filename": "report.html", "locale": "ru" },
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
