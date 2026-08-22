import { expect, test } from "bun:test";
import {
  classifyPostgresSql,
  createPostgresMcpUpstream,
  type PostgresConfiguration,
  type PostgresQueryResult,
} from "./postgres";
import { createMcpGateway } from "./gateway";
import { createPostgresAdapter } from "../agents/software-engineer-adapters";

const config = (accessMode: PostgresConfiguration["accessMode"]): PostgresConfiguration => ({
  host: "db.example",
  port: 5432,
  database: "app",
  user: "colony",
  password: "secret-db-password",
  sslmode: "require",
  accessMode,
});

const emptyResult = (): PostgresQueryResult => ({
  rows: [],
  rowCount: 0,
  truncated: false,
});

test("classifier allows SELECT in read and INSERT/UPDATE in write", () => {
  expect(classifyPostgresSql("SELECT 1", "read")).toBe("select");
  expect(
    classifyPostgresSql("WITH x AS (SELECT 1) SELECT * FROM x", "read"),
  ).toBe("select");
  expect(classifyPostgresSql("INSERT INTO t VALUES (1)", "readwrite")).toBe(
    "insert",
  );
  expect(classifyPostgresSql("UPDATE t SET a = 1", "readwrite")).toBe("update");
  expect(
    classifyPostgresSql(
      "WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x",
      "readwrite",
    ),
  ).toBe("insert");
});

test("classifier rejects writes in read mode and never allows DELETE or DDL", () => {
  expect(() => classifyPostgresSql("INSERT INTO t VALUES (1)", "read")).toThrow(
    "Postgres connection is read-only",
  );
  expect(() => classifyPostgresSql("DELETE FROM t", "read")).toThrow(
    "Postgres does not allow DELETE or schema changes",
  );
  expect(() => classifyPostgresSql("DELETE FROM t", "readwrite")).toThrow(
    "Postgres does not allow DELETE or schema changes",
  );
  expect(() =>
    classifyPostgresSql(
      "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x",
      "readwrite",
    ),
  ).toThrow("Postgres does not allow DELETE or schema changes");
  expect(() => classifyPostgresSql("TRUNCATE t", "readwrite")).toThrow(
    "Postgres does not allow DELETE or schema changes",
  );
  expect(() => classifyPostgresSql("DROP TABLE t", "readwrite")).toThrow(
    "Postgres does not allow DELETE or schema changes",
  );
  expect(() =>
    classifyPostgresSql("ALTER TABLE t ADD COLUMN a int", "readwrite"),
  ).toThrow("Postgres does not allow DELETE or schema changes");
  expect(() =>
    classifyPostgresSql("CREATE TABLE t (a int)", "readwrite"),
  ).toThrow("Postgres does not allow DELETE or schema changes");
  expect(() => classifyPostgresSql("GRANT SELECT ON t TO u", "read")).toThrow(
    "Postgres query is invalid",
  );
  expect(() => classifyPostgresSql("SELECT 1; SELECT 2", "read")).toThrow(
    "Postgres allows one statement per call",
  );
});

test("schema tools and query call through the injected executor", async () => {
  const calls: Array<{ sql: string; readOnly: boolean }> = [];
  const upstream = createPostgresMcpUpstream({
    ...config("read"),
    query: async (sql, { readOnly }) => {
      calls.push({ sql, readOnly });
      return {
        rows: [{ table_schema: "public", table_name: "items", table_type: "BASE TABLE" }],
        rowCount: 1,
        truncated: false,
      };
    },
  });

  await expect(upstream.callTool("postgres.list_tables", {})).resolves.toEqual({
    rows: [{ table_schema: "public", table_name: "items", table_type: "BASE TABLE" }],
    rowCount: 1,
    truncated: false,
  });
  await expect(
    upstream.callTool("postgres.describe_table", { table: "items" }),
  ).resolves.toMatchObject({ rowCount: 1 });
  await expect(
    upstream.callTool("postgres.query", { sql: "SELECT 1" }),
  ).resolves.toMatchObject({ rowCount: 1 });

  expect(calls.map((call) => call.readOnly)).toEqual([true, true, true]);
  expect(calls[0]?.sql).toContain("information_schema.tables");
  expect(calls[1]?.sql).toContain("table_name = 'items'");
  expect(calls[1]?.sql).toContain("table_schema = 'public'");
  expect(calls[2]?.sql).toBe("SELECT 1");
});

test("read mode does not execute INSERT", async () => {
  let called = false;
  const upstream = createPostgresMcpUpstream({
    ...config("read"),
    query: async () => {
      called = true;
      return emptyResult();
    },
  });

  await expect(
    upstream.callTool("postgres.query", { sql: "INSERT INTO t VALUES (1)" }),
  ).rejects.toThrow("Postgres connection is read-only");
  expect(called).toBe(false);
});

test("write mode executes INSERT and UPDATE but not DELETE", async () => {
  const sqls: string[] = [];
  const upstream = createPostgresMcpUpstream({
    ...config("readwrite"),
    query: async (sql, { readOnly }) => {
      sqls.push(sql);
      expect(readOnly).toBe(false);
      return emptyResult();
    },
  });

  await upstream.callTool("postgres.query", { sql: "INSERT INTO t VALUES (1)" });
  await upstream.callTool("postgres.query", { sql: "UPDATE t SET a = 1" });
  await expect(
    upstream.callTool("postgres.query", { sql: "DELETE FROM t" }),
  ).rejects.toThrow("Postgres does not allow DELETE or schema changes");
  expect(sqls).toEqual(["INSERT INTO t VALUES (1)", "UPDATE t SET a = 1"]);
});

test("Postgres exposes its three tools and keeps the password out of errors", async () => {
  const password = "secret-db-password";
  const upstream = createPostgresMcpUpstream({
    ...config("read"),
    password,
    query: async () => {
      throw new Error(`boom ${password}`);
    },
  });
  const gateway = createMcpGateway({
    upstream,
    createToken: () => "run-token",
  });
  const session = gateway.createSession({
    tools: [
      "postgres.list_tables",
      "postgres.describe_table",
      "postgres.query",
    ],
    expiresAt: new Date(Date.now() + 60_000),
  });

  expect(
    (await gateway.listTools(session.token)).map((tool) => tool.name),
  ).toEqual([
    "postgres.list_tables",
    "postgres.describe_table",
    "postgres.query",
  ]);
  await expect(
    gateway.callTool(session.token, "postgres.query", { sql: "SELECT 1" }),
  ).rejects.toThrow("Postgres query failed");
  await expect(
    gateway.callTool(session.token, "postgres.drop_table", {}),
  ).rejects.toThrow("MCP tool is not granted");
  try {
    await gateway.callTool(session.token, "postgres.query", { sql: "SELECT 1" });
  } catch (error) {
    expect(String(error)).not.toContain(password);
  }
});

test("Postgres adapter grants postgres.sql", async () => {
  const adapter = createPostgresAdapter(config("readwrite"));
  expect(adapter.capability?.id).toBe("postgres.sql");
  expect(
    (await adapter.capability!.createUpstream({}).listTools()).map(
      (tool) => tool.name,
    ),
  ).toEqual([
    "postgres.list_tables",
    "postgres.describe_table",
    "postgres.query",
  ]);
});
