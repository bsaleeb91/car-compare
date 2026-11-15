import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applySql, baselineSql, checksum, parseCliJson, parseFileName, plan } from "../scripts/migrate-lib.mjs";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const m = (version: string, sum = "a") => ({ version, name: "x", checksum: sum });

describe("migration files", () => {
  it("are all named <14 digits>_<snake_name>.sql", () => {
    for (const f of files) expect(parseFileName(f), f).not.toBeNull();
  });

  // This app may share a Supabase project with another app. Its migrations must
  // stay inside its own schemas and never touch the project's shared history.
  it("never touch the public schema or Supabase's shared migration history", () => {
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8")
        .replace(/--.*$/gm, "") // ignore comments
        .toLowerCase();
      expect(sql, f).not.toMatch(/\bpublic\./);
      expect(sql, f).not.toMatch(/schema\s+public\b/);
      expect(sql, f).not.toMatch(/supabase_migrations/);
      expect(sql, f).not.toMatch(/\bon\s+all\s+(tables|functions|sequences)\s+in\s+schema\s+(?!car_compare\b)/);
    }
  });
});

describe("plan", () => {
  it("splits local files into applied, pending, changed and unknown", () => {
    const p = plan([m("20260101000000"), m("20260102000000", "new"), m("20260103000000")], [
      m("20260101000000"),
      m("20260102000000", "old"),
      m("20251231000000"),
    ]);
    expect(p.done.map((x: { version: string }) => x.version)).toEqual(["20260101000000"]);
    expect(p.changed.map((x: { version: string }) => x.version)).toEqual(["20260102000000"]);
    expect(p.pending.map((x: { version: string }) => x.version)).toEqual(["20260103000000"]);
    expect(p.unknown.map((x: { version: string }) => x.version)).toEqual(["20251231000000"]);
  });

  it("flags a pending file older than the newest applied one", () => {
    const p = plan([m("20260101000000"), m("20260105000000")], [m("20260105000000")]);
    expect(p.outOfOrder.map((x: { version: string }) => x.version)).toEqual(["20260101000000"]);
  });

  it("checksums ignore Windows line endings", () => {
    expect(checksum("a\r\nb\r\n")).toBe(checksum("a\nb\n"));
  });

  it("parses the CLI's JSON and surfaces its errors", () => {
    expect(parseCliJson('Target: x\n{"rows":[{"a":1}]}').rows).toEqual([{ a: 1 }]);
    expect(() => parseCliJson('{"_tag":"Error","error":{"message":"boom"}}')).toThrow(/boom/);
  });

  it("refuses unsafe values in generated SQL", () => {
    expect(() => baselineSql({ version: "1", name: "x'; drop table y; --", checksum: "a" })).toThrow();
  });
});

describe("applying against a database", () => {
  it("runs each migration and records it in its own history, hidden from API roles", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    `);
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      await db.exec(applySql({ ...parseFileName(f), checksum: checksum(sql) }, sql));
    }
    const rows = (await db.query<{ version: string }>("select version from car_compare_migrations.applied order by version")).rows;
    expect(rows.map((r) => r.version)).toEqual(files.map((f) => f.slice(0, 14)));
    const priv = (
      await db.query<{ a: boolean; u: boolean; s: boolean }>(`select
        has_schema_privilege('anon', 'car_compare_migrations', 'usage') a,
        has_schema_privilege('authenticated', 'car_compare_migrations', 'usage') u,
        has_schema_privilege('service_role', 'car_compare_migrations', 'usage') s`)
    ).rows[0];
    expect(priv).toEqual({ a: false, u: false, s: false });
    // A failing migration leaves no trace: not applied, not recorded.
    await expect(db.exec(applySql({ version: "20990101000000", name: "bad", checksum: "c" }, "create table car_compare.t (id int); select 1/0;"))).rejects.toThrow();
    await db.exec("rollback").catch(() => {});
    expect((await db.query("select to_regclass('car_compare.t') r")).rows[0]).toEqual({ r: null });
    expect((await db.query("select 1 from car_compare_migrations.applied where version = '20990101000000'")).rows).toHaveLength(0);
  });
});
