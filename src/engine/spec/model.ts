/**
 * Internal, version-agnostic representation of an API specification.
 * Both Swagger 2.0 and OpenAPI 3.x are normalized into this model, which is
 * the only thing the coverage rules ever see.
 */

export type ParameterLocation = "query" | "path" | "header" | "cookie";

export interface SpecParameter {
  name: string;
  in: ParameterLocation;
  required: boolean;
  /** Declared enum values, if any (used by enum-coverage rules). */
  enum?: unknown[];
  /** Primitive type hint ("string", "integer", "array", ...), if known. */
  type?: string;
  /** Whether the parameter is marked deprecated. */
  deprecated?: boolean;
  /** Declared default value, if any. */
  default?: unknown;
}

export interface SpecBodyProperty {
  /** Top-level property name in the request body schema. */
  name: string;
  required: boolean;
  enum?: unknown[];
  type?: string;
}

export interface SpecOperation {
  /** Upper-case HTTP method. */
  method: string;
  /** Templated path as written in the spec, e.g. "/products/{id}". */
  path: string;
  operationId?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: SpecParameter[];
  /** Whether the operation declares a request body at all. */
  hasBody: boolean;
  bodyProperties: SpecBodyProperty[];
  /** Declared response status keys: "200", "2XX", "default", ... */
  responseStatuses: string[];
  /** Top-level property names declared across response schemas. */
  responseProperties: string[];
}

export type SpecVersion = "2.0" | "3.0" | "3.1";

export interface ParsedSpec {
  version: SpecVersion;
  title?: string;
  /**
   * Base path prefixes (from v2 basePath or v3 server URLs). Used by the path
   * matcher to reconcile recorded full paths with templated spec paths.
   */
  basePaths: string[];
  operations: SpecOperation[];
}
