/**
 * SKETCH — contract-agnostic core types (HTTP / Kafka / AMQP).
 *
 * Type-only. Not wired into the working HTTP engine yet; it shows the shape the
 * engine would take to be reused across protocols. See docs/contract-agnostic-design.md.
 *
 * Mapping from today's HTTP code:
 *   SpecOperation  → CoverableUnit (kind "http-operation")
 *   RecordedCall   → Observation
 *   loadSpec       → ContractAdapter (HttpContractAdapter)
 *   createPathMatcher → UnitMatcher (HttpUnitMatcher)
 *   CallView       → ObservationView
 */

export type Protocol = "http" | "kafka" | "amqp" | "mqtt";

/** Where a value lives on a unit/observation (generalized parameter location). */
export type FieldLocation = "query" | "path" | "header" | "cookie" | "key" | "routing";

export interface FieldSpec {
  name: string;
  in: FieldLocation;
  required: boolean;
  enum?: unknown[];
  type?: string;
}

/** A property of a payload (request body / message payload), possibly nested ("a.b"). */
export interface PayloadProperty {
  name: string;
  required: boolean;
  enum?: unknown[];
  type?: string;
}

/** Optional response-like dimension (HTTP statuses, async RPC reply). */
export interface ResponseShape {
  /** HTTP: "200"/"2XX"/"default"; async RPC: reply status if any. */
  statuses: string[];
  /** Top-level property names declared in the response/reply schema. */
  properties: string[];
}

/** The unit coverage is attached to. */
export interface CoverableUnit {
  /** Stable id, e.g. "GET /products/{id}" or "publish orders.created". */
  id: string;
  kind: "http-operation" | "message-operation";
  /** HTTP: method; async: "publish" | "subscribe" (direction). */
  operation: string;
  /** HTTP: templated path; async: topic / routing-key pattern. */
  channel: string;
  tags: string[];
  deprecated: boolean;
  fields: FieldSpec[];
  hasPayload: boolean;
  payloadProperties: PayloadProperty[];
  /** Present for HTTP (and RPC-style async); absent for fire-and-forget. */
  response?: ResponseShape;
  /** Protocol-specific extras (exchange, schemaSubject, partitionKey, …). */
  meta: Record<string, unknown>;
}

export interface ParsedContract {
  protocol: Protocol;
  title?: string;
  source: string;
  /** Matching hints (HTTP base paths; could hold topic prefixes, etc.). */
  basePaths: string[];
  units: CoverableUnit[];
}

/** A normalized observed event (HTTP call OR produced/consumed message). */
export interface Observation {
  /** HTTP: method; async: "publish"/"subscribe". */
  operation: string;
  /** HTTP: concrete path; kafka: topic; amqp: routing key. */
  channel: string;
  fields: Record<string, string | string[]>;
  headers: Record<string, string>;
  /** Request body / message payload. */
  payload: unknown;
  /** HTTP status; absent for one-way messaging. */
  status?: string;
  /** Top-level field names of the response/reply payload, if observed. */
  responseFields?: string[];
  meta: Record<string, unknown>;
}

/** Parses a contract source into the generic model. */
export interface ContractAdapter {
  readonly protocol: Protocol;
  load(source: string, options?: Record<string, unknown>): Promise<ParsedContract>;
}

/** Resolves an observation to the unit it exercises (protocol-specific). */
export interface UnitMatcher {
  match(contract: ParsedContract, observation: Observation): CoverableUnit | null;
}

/** Read-only view the rules query (protocol-agnostic). */
export interface ObservationView {
  readonly status?: string;
  hasField(name: string, location: FieldLocation): boolean;
  fieldValues(name: string, location: FieldLocation): string[];
  readonly payloadProps: ReadonlySet<string>;
  payloadValues(name: string): string[];
  readonly responseProps: ReadonlySet<string>;
}

/**
 * A rule generates conditions for a unit. `appliesTo` lets protocol-specific
 * rules opt out (e.g. status rules only for units with a `response`).
 */
export interface Rule<TCondition> {
  readonly id: string;
  appliesTo(unit: CoverableUnit): boolean;
  createConditions(unit: CoverableUnit): TCondition[];
}

/** Collection side: protocol-specific, writes Observations to coverage-output/. */
export interface Collector {
  record(raw: Partial<Observation> & Pick<Observation, "operation" | "channel">): void;
  /** Number of buffered observations. */
  readonly size: number;
  /** Persist buffered observations (one file per test) and clear. */
  flush(): string | null;
}
