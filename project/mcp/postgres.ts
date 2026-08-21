import { SQL } from "bun";
import { parse } from "pgsql-ast-parser";
import type { McpTool, McpUpstream } from "./gateway";

export type PostgresAccessMode = "read" | "readwrite";
export type PostgresSslMode = "require" | "disable";
export type PostgresStatementKind = "select" | "insert" | "update";

export type PostgresConfiguration = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  sslmode: PostgresSslMode;
  accessMode: PostgresAccessMode;
};

export type PostgresQueryResult = {
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
};

export type PostgresQueryFn = (
  sql: string,
  options: { readOnly: boolean },
) => Promise<PostgresQueryResult>;

export const POSTGRES_TOOLS = [
  "postgres.list_tables",
  "postgres.describe_table",
  "postgres.query",
] as const;

const ROW_LIMIT = 200;
const READ_KINDS = new Set(["select", "union", "union all", "values"]);
const WRITE_KINDS = new Set(["insert", "update"]);

const forbiddenMessage = "Postgres does not allow DELETE or schema changes";
const readOnlyMessage = "Postgres connection is read-only";

let cachedClient: { fingerprint: string; sql: SQL } | undefined;

function isStatementType(type: string): boolean {
  if (READ_KINDS.has(type) || WRITE_KINDS.has(type)) return true;
  if (
    type === "with" ||
    type === "delete" ||
    type === "do" ||
    type === "set" ||
    type === "begin" ||
    type === "commit" ||
    type === "rollback" ||
    type === "comment" ||
    type === "prepare" ||
    type === "execute" ||
    type === "deallocate"
  )
    return true;
  return /^(create|drop|alter|truncate)\b/.test(type);
}

function collectKinds(node: unknown, kinds: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectKinds(item, kinds);
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.type === "string" && isStatementType(record.type)) {
    kinds.add(record.type);
  }
  for (const value of Object.values(record)) collectKinds(value, kinds);
}

export function classifyPostgresSql(
  sql: string,
  accessMode: PostgresAccessMode,
): PostgresStatementKind {
  let statements;
  try {
    statements = parse(sql);
  } catch {
    throw new Error("Postgres query is invalid");
  }
  if (statements.length !== 1)
    throw new Error("Postgres allows one statement per call");

  const kinds = new Set<string>();
  collectKinds(statements[0], kinds);
  kinds.delete("with");

  if ([...kinds].some((kind) => !READ_KINDS.has(kind) && !WRITE_KINDS.has(kind)))
    throw new Error(forbiddenMessage);

  const writes = [...kinds].filter((kind) => WRITE_KINDS.has(kind));
  if (writes.length > 1) throw new Error(forbiddenMessage);
  if (writes.length === 1) {
    if (accessMode === "read") throw new Error(readOnlyMessage);
    return writes[0] as "insert" | "update";
  }
  return "select";
}

function nonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function sqlIdent(value: unknown, label: string): string {
  const raw = nonEmptyString(value, `${label} is required`);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw))
    throw new Error(`${label} must be a simple identifier`);
  return raw;
}

function optionalIdent(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return sqlIdent(value, label);
}

function requireOnly(
  args: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(args).some((key) => !keys.includes(key)))
    throw new Error("Invalid Postgres tool arguments");
}

function capRows(result: PostgresQueryResult): PostgresQueryResult {
  if (result.rows.length <= ROW_LIMIT) return result;
  return {
    rows: result.rows.slice(0, ROW_LIMIT),
    rowCount: result.rowCount,
    truncated: true,
  };
}

function normalizeResult(result: unknown): PostgresQueryResult {
  const rows = Array.isArray(result) ? result : [];
  return {
    rows,
    rowCount: rows.length,
    truncated: false,
  };
}

function fingerprintOf(config: PostgresConfiguration): string {
  return [
    config.host,
    String(config.port),
    config.database,
    config.user,
    config.password,
    config.sslmode,
  ].join("\0");
}

function clientFor(config: PostgresConfiguration): SQL {
  const fingerprint = fingerprintOf(config);
  if (cachedClient?.fingerprint === fingerprint) return cachedClient.sql;
  // ponytail: one pool for the single workspace Connection.
  void cachedClient?.sql.close();
  const sql = new SQL({
    adapter: "postgres",
    hostname: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    tls: config.sslmode === "require",
  });
  cachedClient = { fingerprint, sql };
  return sql;
}

function defaultQuery(config: PostgresConfiguration): PostgresQueryFn {
  return async (text, { readOnly }) => {
    const sql = clientFor(config);
    const exec = async (tx: { unsafe(query: string): Promise<unknown> }) => {
      await tx.unsafe("SET LOCAL statement_timeout = '15s'");
      return tx.unsafe(text);
    };
    const result = readOnly
      ? await sql.begin("read only", exec)
      : await sql.begin(exec);
    return normalizeResult(result);
  };
}

function toolsFor(accessMode: PostgresAccessMode): readonly McpTool[] {
  return [
    {
      name: "postgres.list_tables",
      description:
        "List tables and views in the workspace Postgres database, excluding system catalogs.",
      inputSchema: {
        type: "object",
        properties: {
          schema: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "postgres.describe_table",
      description: "Describe columns of a table in the workspace Postgres database.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", minLength: 1 },
          schema: { type: "string", minLength: 1 },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
    {
      name: "postgres.query",
      description:
        accessMode === "read"
          ? "Run one SELECT against the workspace Postgres database. INSERT, UPDATE, DELETE, and schema changes are not allowed. Results are capped at 200 rows."
          : "Run one SELECT, INSERT, or UPDATE against the workspace Postgres database. DELETE and schema changes are not allowed. Results are capped at 200 rows.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", minLength: 1 },
        },
        required: ["sql"],
        additionalProperties: false,
      },
    },
  ];
}

export function createPostgresMcpUpstream(
  options: PostgresConfiguration & { query?: PostgresQueryFn },
): McpUpstream {
  const query = options.query ?? defaultQuery(options);
  const tools = toolsFor(options.accessMode);

  const run = async (
    sql: string,
    readOnly: boolean,
  ): Promise<PostgresQueryResult> => {
    try {
      return capRows(await query(sql, { readOnly }));
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === forbiddenMessage ||
          error.message === readOnlyMessage ||
          error.message === "Postgres query is invalid" ||
          error.message === "Postgres allows one statement per call")
      )
        throw error;
      throw new Error("Postgres query failed");
    }
  };

  return {
    listTools: async () => tools,
    async callTool(name, args) {
      if (name === "postgres.list_tables") {
        requireOnly(args, ["schema"]);
        const schema = optionalIdent(args.schema, "Postgres schema");
        const sql = schema
          ? `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = '${schema}' ORDER BY table_schema, table_name`
          : "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name";
        return run(sql, true);
      }
      if (name === "postgres.describe_table") {
        requireOnly(args, ["table", "schema"]);
        const table = sqlIdent(args.table, "Postgres table");
        const schema = optionalIdent(args.schema, "Postgres schema") ?? "public";
        return run(
          `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' ORDER BY ordinal_position`,
          true,
        );
      }
      if (name === "postgres.query") {
        requireOnly(args, ["sql"]);
        const sql = nonEmptyString(args.sql, "Postgres sql is required");
        const kind = classifyPostgresSql(sql, options.accessMode);
        return run(sql, kind === "select");
      }
      throw new Error(`Unknown Postgres tool: ${name}`);
    },
  };
}
