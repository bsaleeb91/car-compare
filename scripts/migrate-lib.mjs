// Pure helpers for scripts/migrate.mjs (kept separate so they can be unit-tested).
import { createHash } from "node:crypto";

/** Car Compare's own migration history. Deliberately NOT supabase_migrations, which
 *  belongs to whichever app owns the Supabase project. Not exposed to the Data API. */
export const HISTORY = "car_compare_migrations.applied";

export const BOOTSTRAP_SQL = `
create schema if not exists car_compare_migrations;
revoke all on schema car_compare_migrations from public, anon, authenticated, service_role;
create table if not exists car_compare_migrations.applied (
  version text primary key,
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
);
revoke all on car_compare_migrations.applied from public, anon, authenticated, service_role;
`;

const FILE_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

/** Parses "20261113000000_init.sql" into { version, name }, or null if it isn't a migration file. */
export function parseFileName(file) {
  const m = FILE_RE.exec(file);
  return m ? { version: m[1], name: m[2] } : null;
}

/** sha256 of the file with line endings normalized, so a Windows checkout matches. */
export function checksum(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

/**
 * Compares local migration files with the recorded history.
 * local: [{ version, name, checksum }], applied: [{ version, name, checksum }]
 */
export function plan(local, applied) {
  const byVersion = new Map(applied.map((a) => [a.version, a]));
  const localVersions = new Set(local.map((l) => l.version));
  const sorted = [...local].sort((a, b) => a.version.localeCompare(b.version));
  const pending = [];
  const changed = [];
  const done = [];
  for (const l of sorted) {
    const a = byVersion.get(l.version);
    if (!a) pending.push(l);
    else if (a.checksum !== l.checksum) changed.push(l);
    else done.push(l);
  }
  const unknown = applied.filter((a) => !localVersions.has(a.version));
  // A pending migration older than the newest applied one was probably added out of order.
  const newestApplied = done.at(-1)?.version ?? "";
  const outOfOrder = pending.filter((p) => p.version < newestApplied);
  return { done, pending, changed, unknown, outOfOrder };
}

/** SQL that applies one migration and records it, all or nothing. */
export function applySql(migration, sql) {
  for (const [k, v] of Object.entries({ version: migration.version, name: migration.name, checksum: migration.checksum })) {
    if (!/^[a-z0-9_]+$/.test(v)) throw new Error(`Unsafe ${k}: ${v}`);
  }
  return [
    "begin;",
    BOOTSTRAP_SQL,
    sql,
    ";",
    `insert into ${HISTORY} (version, name, checksum) values ('${migration.version}', '${migration.name}', '${migration.checksum}');`,
    "commit;",
    "",
  ].join("\n");
}

/** SQL that records an already-applied migration without running it. */
export function baselineSql(migration) {
  for (const v of [migration.version, migration.name, migration.checksum]) {
    if (!/^[a-z0-9_]+$/.test(v)) throw new Error(`Unsafe value: ${v}`);
  }
  return [
    "begin;",
    BOOTSTRAP_SQL,
    `insert into ${HISTORY} (version, name, checksum) values ('${migration.version}', '${migration.name}', '${migration.checksum}');`,
    "commit;",
    "",
  ].join("\n");
}

/** The Supabase CLI prints a "Target: ..." line before its JSON; return the parsed JSON. */
export function parseCliJson(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`No JSON in Supabase CLI output:\n${stdout}`);
  const data = JSON.parse(stdout.slice(start));
  if (data._tag === "Error" || data.error) {
    throw new Error(`Supabase CLI error: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  return data;
}
