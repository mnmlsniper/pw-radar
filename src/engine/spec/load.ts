import SwaggerParser from "@apidevtools/swagger-parser";
import {
  type ParsedSpec,
  type SpecBodyProperty,
  type SpecOperation,
  type SpecParameter,
  type SpecVersion,
} from "./model.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

type Obj = Record<string, unknown>;

function asObj(value: unknown): Obj | undefined {
  return value && typeof value === "object" ? (value as Obj) : undefined;
}

function detectVersion(spec: Obj): SpecVersion {
  if (typeof spec["swagger"] === "string") return "2.0";
  const openapi = spec["openapi"];
  if (typeof openapi === "string" && openapi.startsWith("3.1")) return "3.1";
  return "3.0";
}

/**
 * Flattens schema composition (`allOf`/`oneOf`/`anyOf`) into a single schema-ish
 * object by unioning their properties. `allOf` also unions `required`; `oneOf`/
 * `anyOf` do not (a property required in only one branch isn't always required).
 */
function flattenSchema(schema: Obj | undefined): Obj {
  if (!schema) return {};
  const allOf = Array.isArray(schema["allOf"]) ? (schema["allOf"] as unknown[]) : [];
  const oneOf = Array.isArray(schema["oneOf"]) ? (schema["oneOf"] as unknown[]) : [];
  const anyOf = Array.isArray(schema["anyOf"]) ? (schema["anyOf"] as unknown[]) : [];
  if (allOf.length === 0 && oneOf.length === 0 && anyOf.length === 0) return schema;

  const merged: Obj = { ...schema };
  const props: Obj = { ...(asObj(schema["properties"]) ?? {}) };
  const required = new Set<string>(Array.isArray(schema["required"]) ? (schema["required"] as string[]) : []);

  for (const part of allOf) {
    const partObj = flattenSchema(asObj(part));
    Object.assign(props, asObj(partObj["properties"]) ?? {});
    for (const r of Array.isArray(partObj["required"]) ? (partObj["required"] as string[]) : []) {
      required.add(r);
    }
  }
  for (const part of [...oneOf, ...anyOf]) {
    const partObj = flattenSchema(asObj(part));
    Object.assign(props, asObj(partObj["properties"]) ?? {});
  }

  merged["properties"] = props;
  merged["required"] = [...required];
  return merged;
}

function schemaEnum(schema: Obj | undefined): unknown[] | undefined {
  const e = schema?.["enum"];
  if (Array.isArray(e)) return e;
  // OpenAPI 3.1 `const` is a single allowed value — treat as a one-item enum.
  if (schema && "const" in schema && schema["const"] !== undefined) return [schema["const"]];
  return undefined;
}

function schemaType(schema: Obj | undefined): string | undefined {
  const t = schema?.["type"];
  if (typeof t === "string") return t;
  // v3.1 type arrays: pick the first non-null type.
  if (Array.isArray(t)) return t.find((x) => x !== "null") as string | undefined;
  return undefined;
}

const MAX_BODY_DEPTH = 5;

/**
 * Recursively extracts body properties as dotted paths (`address.city`),
 * descending into nested objects and arrays of objects. Array nesting is
 * transparent: `tags` (array of objects) yields `tags` and `tags.id`. Cycles
 * (from resolved `$ref`s) and excessive depth are guarded.
 */
function collectBodyProps(
  schema: Obj | undefined,
  prefix: string,
  depth: number,
  seen: WeakSet<object>,
  out: SpecBodyProperty[],
): void {
  if (!schema || depth > MAX_BODY_DEPTH || seen.has(schema)) return;
  seen.add(schema);

  const flat = flattenSchema(schema);

  // Arrays are transparent — descend into items keeping the same prefix.
  if (schemaType(flat) === "array") {
    collectBodyProps(asObj(flat["items"]), prefix, depth + 1, seen, out);
    return;
  }

  const props = asObj(flat["properties"]);
  if (!props) return;
  const required = new Set<string>(
    Array.isArray(flat["required"]) ? (flat["required"] as string[]) : [],
  );

  for (const [name, raw] of Object.entries(props)) {
    const propSchema = asObj(raw);
    const dotted = prefix ? `${prefix}.${name}` : name;
    out.push({
      name: dotted,
      required: required.has(name),
      enum: schemaEnum(propSchema),
      type: schemaType(propSchema),
    });
    collectBodyProps(propSchema, dotted, depth + 1, seen, out);
  }
}

function bodyProperties(schema: Obj | undefined): SpecBodyProperty[] {
  const out: SpecBodyProperty[] = [];
  collectBodyProps(schema, "", 0, new WeakSet(), out);
  return out;
}

/** Merges path-level and operation-level parameters (operation wins). */
function mergeParameters(pathParams: unknown, opParams: unknown): Obj[] {
  const byKey = new Map<string, Obj>();
  for (const list of [pathParams, opParams]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const p = asObj(raw);
      if (!p) continue;
      byKey.set(`${String(p["in"])}:${String(p["name"])}`, p);
    }
  }
  return [...byKey.values()];
}

/** enum from a schema, falling back to its array `items` (array parameters). */
function effectiveEnum(schema: Obj | undefined): unknown[] | undefined {
  return schemaEnum(schema) ?? schemaEnum(asObj(schema?.["items"]));
}

function normalizeV2Parameter(p: Obj): SpecParameter | null {
  const loc = p["in"];
  if (loc !== "query" && loc !== "path" && loc !== "header") return null;
  // v2 array parameter keeps enum on `items`.
  const fromItems = schemaEnum(asObj(p["items"]));
  return {
    name: String(p["name"]),
    in: loc,
    required: p["required"] === true,
    enum: schemaEnum(p) ?? fromItems,
    type: typeof p["type"] === "string" ? (p["type"] as string) : undefined,
    deprecated: p["deprecated"] === true,
    default: p["default"],
  };
}

function normalizeV3Parameter(p: Obj): SpecParameter | null {
  const loc = p["in"];
  if (loc !== "query" && loc !== "path" && loc !== "header" && loc !== "cookie") return null;
  // Content-typed parameter (`parameter.content`) falls back to the media schema.
  let schema = asObj(p["schema"]);
  if (!schema) {
    const content = asObj(p["content"]);
    const firstMedia = content ? asObj(Object.values(content)[0]) : undefined;
    schema = asObj(firstMedia?.["schema"]);
  }
  return {
    name: String(p["name"]),
    in: loc,
    required: p["required"] === true,
    enum: effectiveEnum(schema),
    type: schemaType(schema),
    deprecated: p["deprecated"] === true,
    default: schema?.["default"],
  };
}

function responseStatuses(operation: Obj): string[] {
  const responses = asObj(operation["responses"]);
  return responses ? Object.keys(responses) : [];
}

/** Top-level property names of a schema, unwrapping arrays and `allOf`. */
function schemaPropertyNames(schema: Obj | undefined): string[] {
  let s = flattenSchema(schema);
  const items = asObj(s["items"]);
  if (schemaType(s) === "array" && items) s = flattenSchema(items);
  const props = asObj(s["properties"]);
  return props ? Object.keys(props) : [];
}

/** Collects property names declared across all response schemas of an operation. */
function responsePropertyNames(operation: Obj, version: SpecVersion): string[] {
  const responses = asObj(operation["responses"]);
  if (!responses) return [];
  const names = new Set<string>();
  for (const raw of Object.values(responses)) {
    const resp = asObj(raw);
    if (!resp) continue;
    if (version === "2.0") {
      for (const n of schemaPropertyNames(asObj(resp["schema"]))) names.add(n);
    } else {
      const content = asObj(resp["content"]);
      if (!content) continue;
      for (const mt of Object.values(content)) {
        for (const n of schemaPropertyNames(asObj(asObj(mt)?.["schema"]))) names.add(n);
      }
    }
  }
  return [...names];
}

function buildOperation(
  method: string,
  path: string,
  operation: Obj,
  parameters: SpecParameter[],
  hasBody: boolean,
  props: SpecBodyProperty[],
  version: SpecVersion,
): SpecOperation {
  return {
    method: method.toUpperCase(),
    path,
    operationId: typeof operation["operationId"] === "string" ? (operation["operationId"] as string) : undefined,
    description: typeof operation["description"] === "string" ? (operation["description"] as string) : undefined,
    tags: Array.isArray(operation["tags"]) ? (operation["tags"] as string[]) : [],
    deprecated: operation["deprecated"] === true,
    parameters,
    hasBody,
    bodyProperties: props,
    responseStatuses: responseStatuses(operation),
    responseProperties: responsePropertyNames(operation, version),
  };
}

function normalizeV2(spec: Obj, version: SpecVersion): SpecOperation[] {
  const paths = asObj(spec["paths"]) ?? {};
  const operations: SpecOperation[] = [];

  for (const [path, rawItem] of Object.entries(paths)) {
    const pathItem = asObj(rawItem);
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = asObj(pathItem[method]);
      if (!operation) continue;

      const merged = mergeParameters(pathItem["parameters"], operation["parameters"]);
      const params: SpecParameter[] = [];
      let hasBody = false;
      let props: SpecBodyProperty[] = [];

      for (const p of merged) {
        if (p["in"] === "body") {
          hasBody = true;
          props = bodyProperties(asObj(p["schema"]));
        } else if (p["in"] === "formData") {
          hasBody = true;
          props.push({ name: String(p["name"]), required: p["required"] === true, enum: schemaEnum(p) });
        } else {
          const np = normalizeV2Parameter(p);
          if (np) params.push(np);
        }
      }

      operations.push(buildOperation(method, path, operation, params, hasBody, props, version));
    }
  }
  return operations;
}

function jsonBodySchema(requestBody: Obj | undefined): Obj | undefined {
  const content = asObj(requestBody?.["content"]);
  if (!content) return undefined;
  // Prefer application/json, otherwise the first media type with a schema.
  const json = asObj(content["application/json"]);
  const chosen = json ?? asObj(Object.values(content).find((v) => asObj(v)?.["schema"]));
  return asObj(chosen?.["schema"]);
}

function normalizeV3(spec: Obj, version: SpecVersion): SpecOperation[] {
  const paths = asObj(spec["paths"]) ?? {};
  const operations: SpecOperation[] = [];

  for (const [path, rawItem] of Object.entries(paths)) {
    const pathItem = asObj(rawItem);
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = asObj(pathItem[method]);
      if (!operation) continue;

      const merged = mergeParameters(pathItem["parameters"], operation["parameters"]);
      const params: SpecParameter[] = [];
      for (const p of merged) {
        const np = normalizeV3Parameter(p);
        if (np) params.push(np);
      }

      const requestBody = asObj(operation["requestBody"]);
      const bodySchema = jsonBodySchema(requestBody);
      const hasBody = requestBody !== undefined;
      const props = bodyProperties(bodySchema);

      operations.push(buildOperation(method, path, operation, params, hasBody, props, version));
    }
  }
  return operations;
}

function urlToPathPrefix(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.startsWith("/") ? url : "";
  }
  return pathname.replace(/\/+$/, "");
}

/** Server URL with `{var}` placeholders replaced by their declared defaults. */
function resolveServerUrl(server: Obj): string | undefined {
  const url = server["url"];
  if (typeof url !== "string") return undefined;
  const vars = asObj(server["variables"]);
  if (!vars) return url;
  return url.replace(/\{([^}]+)\}/g, (whole, name: string) => {
    const def = asObj(vars[name])?.["default"];
    return typeof def === "string" ? def : whole;
  });
}

function addServerPrefixes(servers: unknown, into: Set<string>): void {
  if (!Array.isArray(servers)) return;
  for (const raw of servers) {
    const server = asObj(raw);
    if (!server) continue;
    const url = resolveServerUrl(server);
    if (url) {
      const prefix = urlToPathPrefix(url);
      if (prefix) into.add(prefix);
    }
  }
}

function collectBasePaths(spec: Obj, version: SpecVersion): string[] {
  if (version === "2.0") {
    const bp = spec["basePath"];
    return typeof bp === "string" && bp !== "/" ? [bp.replace(/\/+$/, "")] : [];
  }
  const prefixes = new Set<string>();
  // Top-level, path-level and operation-level servers (v3).
  addServerPrefixes(spec["servers"], prefixes);
  const paths = asObj(spec["paths"]) ?? {};
  for (const rawItem of Object.values(paths)) {
    const pathItem = asObj(rawItem);
    if (!pathItem) continue;
    addServerPrefixes(pathItem["servers"], prefixes);
    for (const method of HTTP_METHODS) {
      addServerPrefixes(asObj(pathItem[method])?.["servers"], prefixes);
    }
  }
  return [...prefixes];
}

export interface LoadSpecOptions {
  /** HTTP headers used when fetching a remote spec / external `$ref`s. */
  httpHeaders?: Record<string, string>;
  /** Run full OpenAPI validation (throws on invalid) instead of plain parse. */
  validate?: boolean;
}

/** Loads a spec from a path/URL/object, dereferences `$ref`s and normalizes it. */
export async function loadSpec(
  source: string | object,
  options: LoadSpecOptions = {},
): Promise<ParsedSpec> {
  const parserOptions: Record<string, unknown> = options.httpHeaders
    ? { resolve: { http: { headers: options.httpHeaders } } }
    : {};

  // The strict overloads don't expose the deep resolver options; call loosely.
  const run = (options.validate ? SwaggerParser.validate : SwaggerParser.dereference) as (
    api: string | object,
    opts: Record<string, unknown>,
  ) => Promise<unknown>;

  let dereferenced: Obj;
  try {
    dereferenced = (await run(source, parserOptions)) as Obj;
  } catch (err) {
    throw new Error(`Failed to load/parse specification: ${(err as Error).message}`);
  }

  const version = detectVersion(dereferenced);
  const operations =
    version === "2.0" ? normalizeV2(dereferenced, version) : normalizeV3(dereferenced, version);
  const info = asObj(dereferenced["info"]);

  return {
    version,
    title: typeof info?.["title"] === "string" ? (info["title"] as string) : undefined,
    basePaths: collectBasePaths(dereferenced, version),
    operations: operations.sort((a, b) =>
      a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
    ),
  };
}
