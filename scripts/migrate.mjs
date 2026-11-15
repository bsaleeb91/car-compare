#!/usr/bin/env node
// Applies supabase/migrations to a hosted Supabase project and tracks them in
// car_compare_migrations.applied, NOT in supabase_migrations. That keeps this
// app's history separate when it shares a project with another app, so the
// other app's `supabase db push` keeps working. Never run `supabase db push`
// for this app against a shared project.
//
//   npm run migrate -- status   --ref <project-ref>
//   npm run migrate -- up       --ref <project-ref> [--yes]
//   npm run migrate -- baseline --ref <project-ref> <version> [--yes]   (record an already-applied file)
//
// The ref can also come from SUPABASE_PROJECT_REF. Uses the Supabase CLI's login
// (`npx supabase login`); no database password or service-role key is needed.
// Writes ask the Supabase CLI for confirmation; --yes answers it.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HISTORY, applySql, baselineSql, checksum, parseCliJson, parseFileName, plan } from "./migrate-lib.mjs";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function usage(msg) {
  if (msg) console.error(msg);
  console.error("Usage: npm run migrate -- <status|up|baseline> --ref <project-ref> [version] [--yes]");
  process.exit(2);
}

const args = process.argv.slice(2);
const command = args[0];
const yes = args.includes("--yes");
const refIdx = args.indexOf("--ref");
const ref = refIdx >= 0 ? args[refIdx + 1] : process.env.SUPABASE_PROJECT_REF;
if (!["status", "up", "baseline"].includes(command)) usage();
if (!ref || !/^[a-z0-9]{20}$/.test(ref)) usage("Pass --ref <20-character project ref> or set SUPABASE_PROJECT_REF.");

function supabase(cliArgs) {
  // shell: true is needed to run npx on Windows; every argument here is validated or a temp path we made.
  const quoted = cliArgs.map((a) => (/^[\w=.:/\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`));
  const command = ["npx", "--yes", "supabase", ...quoted].join(" ");
  const r = spawnSync(command, { encoding: "utf8", shell: true, stdio: ["inherit", "pipe", "pipe"] });
  if (r.status !== 0 && !r.stdout.includes("{")) {
    throw new Error(`Supabase CLI failed:\n${r.stderr || r.stdout}`);
  }
  return parseCliJson(r.stdout);
}

function query(sql, { write = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cc-migrate-"));
  const file = join(dir, "query.sql");
  writeFileSync(file, sql);
  try {
    const flags = ["db", "query", `--remote=${ref}`, "-o", "json", "-f", file];
    flags.push(write ? (yes ? "--yes" : "") : "--read-only");
    return supabase(flags.filter(Boolean)).rows ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function localMigrations() {
  return readdirSync(MIGRATIONS)
    .map((file) => ({ file, parsed: parseFileName(file) }))
    .filter((f) => {
      if (!f.parsed && f.file.endsWith(".sql")) usage(`Bad migration file name: ${f.file} (want <14 digits>_<snake_name>.sql)`);
      return f.parsed;
    })
    .map(({ file, parsed }) => {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      return { ...parsed, file, sql, checksum: checksum(sql) };
    });
}

function appliedMigrations() {
  const [exists] = query(`select to_regclass('${HISTORY}') is not null as ok`);
  if (!exists?.ok) return [];
  return query(`select version, name, checksum from ${HISTORY} order by version`);
}

function report(p) {
  for (const m of p.done) console.log(`  applied   ${m.version}_${m.name}`);
  for (const m of p.pending) console.log(`  PENDING   ${m.version}_${m.name}`);
  for (const m of p.changed) console.log(`  CHANGED   ${m.version}_${m.name}  (edited after it was applied: add a new migration instead)`);
  for (const m of p.unknown) console.log(`  UNKNOWN   ${m.version}_${m.name}  (applied, but the file is missing here)`);
  for (const m of p.outOfOrder) console.log(`  warning: ${m.version}_${m.name} is older than the newest applied migration`);
}

const local = localMigrations();
const p = plan(local, appliedMigrations());
console.log(`Project ${ref}: ${p.done.length} applied, ${p.pending.length} pending`);
report(p);

if (command === "status") process.exit(p.changed.length || p.unknown.length ? 1 : 0);

if (p.changed.length || p.unknown.length) {
  console.error("Refusing to continue: local files and the recorded history disagree (see above).");
  process.exit(1);
}

if (command === "baseline") {
  const version = args.find((a, i) => /^\d{14}$/.test(a) && args[i - 1] !== "--ref");
  const m = p.pending.find((x) => x.version === version);
  if (!m) usage(`Give a pending version to record as already applied. Pending: ${p.pending.map((x) => x.version).join(", ") || "none"}`);
  query(baselineSql(m), { write: true });
  console.log(`Recorded ${m.version}_${m.name} as applied (it was not run).`);
  process.exit(0);
}

// up
if (p.outOfOrder.length) {
  console.error("Refusing to apply migrations out of order. Rename the file to a newer timestamp.");
  process.exit(1);
}
for (const m of p.pending) {
  console.log(`Applying ${m.version}_${m.name} ...`);
  query(applySql(m, m.sql), { write: true });
  console.log("  done");
}
console.log(p.pending.length ? "All migrations applied." : "Nothing to apply.");
