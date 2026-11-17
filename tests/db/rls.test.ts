import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, as, bootDb } from "./harness";

const A1 = "00000000-0000-0000-0000-0000000000a1"; // household A owner
const A2 = "00000000-0000-0000-0000-0000000000a2"; // household A spouse
const B1 = "00000000-0000-0000-0000-0000000000b1"; // household B owner
const X = "00000000-0000-0000-0000-0000000000ee"; // signed in, no household

let db: PGlite;
let hA: string;
let hB: string;
let sharedVehicle: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}
async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await one<{ n: number }>(`select count(*)::int as n from (${sql}) s`, params);
  return Number(r.n);
}

beforeAll(async () => {
  db = await bootDb();
  await addUser(db, A1, "owner-a@example.com");
  await addUser(db, A2, "Spouse-A@Example.com");
  await addUser(db, B1, "owner-b@example.com");
  await addUser(db, X, "stranger@example.com");

  // Shared catalog row, inserted as superuser like a seed would be.
  sharedVehicle = (
    await one<{ id: string }>(
      "insert into car_compare.vehicles (make, model, generation_years, type, brand_origin) values ('Honda','Odyssey','2018-2024','minivan','Japan') returning id",
    )
  ).id;

  hA = (await as(db, A1, () => one<{ id: string }>("select car_compare.create_household('Household A', 'Owner A') as id"))).id;
  hB = (await as(db, B1, () => one<{ id: string }>("select car_compare.create_household('Household B', 'Owner B') as id"))).id;
});

describe("household creation", () => {
  it("creates owner membership, default preferences and the wishlist", async () => {
    await as(db, A1, async () => {
      const m = await one<{ role: string }>("select role from car_compare.household_members where user_id = $1", [A1]);
      expect(m.role).toBe("owner");
      expect(await count("select 1 from car_compare.preferences where household_id = $1", [hA])).toBe(1);
      expect(
        await count("select 1 from car_compare.wishlist_items where household_id = $1 and tier = 'dont_care'", [hA]),
      ).toBe(45);
    });
  });

  it("rejects a second household for the same user", async () => {
    await expect(
      as(db, A1, () => db.query("select car_compare.create_household('Again', 'Owner A')")),
    ).rejects.toThrow(/already belong/);
  });

  it("does not let users insert households or members directly", async () => {
    await expect(as(db, X, () => db.query("insert into car_compare.households (name) values ('Sneaky')"))).rejects.toThrow();
    await expect(
      as(db, X, () =>
        db.query(
          "insert into car_compare.household_members (household_id, user_id, display_name) values ($1, $2, 'x')",
          [hA, X],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("invites", () => {
  let token: string;

  it("only the owner can create invites", async () => {
    await expect(
      as(db, B1, () => db.query("insert into car_compare.invites (household_id, email) values ($1, 'x@example.com')", [hA])),
    ).rejects.toThrow();
    token = (
      await as(db, A1, () =>
        one<{ token: string }>(
          "insert into car_compare.invites (household_id, email) values ($1, 'spouse-a@example.com') returning token",
          [hA],
        ),
      )
    ).token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("outsiders cannot list another household's invites", async () => {
    await as(db, B1, async () => {
      expect(await count("select 1 from car_compare.invites where household_id = $1", [hA])).toBe(0);
    });
  });

  it("rejects a forwarded link used by a different email", async () => {
    await expect(as(db, X, () => db.query("select car_compare.accept_invite($1, 'X')", [token]))).rejects.toThrow(
      /different email/,
    );
  });

  it("accepts for the invited email (case-insensitive) and only once", async () => {
    const r = await as(db, A2, () => one<{ id: string }>("select car_compare.accept_invite($1, 'Spouse A') as id", [token]));
    expect(r.id).toBe(hA);
    await expect(
      as(db, A2, () => db.query("select car_compare.accept_invite($1, 'Spouse A')", [token])),
    ).rejects.toThrow(/already been used/);
  });

  it("members cannot promote themselves to owner", async () => {
    await expect(
      as(db, A2, () => db.query("update car_compare.household_members set role = 'owner' where user_id = $1", [A2])),
    ).rejects.toThrow(/Only display_name/);
    await as(db, A2, () =>
      db.query("update car_compare.household_members set display_name = 'Spouse' where user_id = $1", [A2]),
    );
  });
});

describe("data isolation between households", () => {
  let noteId: string;

  beforeAll(async () => {
    noteId = (
      await as(db, A1, () =>
        one<{ id: string }>(
          "insert into car_compare.notes (household_id, vehicle_id, body) values ($1, $2, 'Third row is roomy') returning id",
          [hA, sharedVehicle],
        ),
      )
    ).id;
    await as(db, A2, () =>
      db.query(
        "insert into car_compare.scores (household_id, vehicle_id, criterion, score) values ($1, $2, 'overall', 4)",
        [hA, sharedVehicle],
      ),
    );
  });

  it("spouse sees the owner's note and score; other households and strangers see nothing", async () => {
    await as(db, A2, async () => {
      expect(await count("select 1 from car_compare.notes")).toBe(1);
      expect(await count("select 1 from car_compare.scores")).toBe(1);
    });
    for (const u of [B1, X]) {
      await as(db, u, async () => {
        expect(await count("select 1 from car_compare.notes")).toBe(0);
        expect(await count("select 1 from car_compare.scores")).toBe(0);
        expect(await count("select 1 from car_compare.preferences where household_id = $1", [hA])).toBe(0);
        expect(await count("select 1 from car_compare.wishlist_items where household_id = $1", [hA])).toBe(0);
        expect(await count("select 1 from car_compare.household_members where household_id = $1", [hA])).toBe(0);
        expect(await count("select 1 from car_compare.households where id = $1", [hA])).toBe(0);
      });
    }
  });

  it("cannot write into another household", async () => {
    await expect(
      as(db, B1, () =>
        db.query("insert into car_compare.notes (household_id, vehicle_id, body) values ($1, $2, 'hi')", [
          hA,
          sharedVehicle,
        ]),
      ),
    ).rejects.toThrow();
    await as(db, B1, async () => {
      const r = await db.query("update car_compare.preferences set gas_price = 9 where household_id = $1", [hA]);
      expect(r.affectedRows).toBe(0);
    });
  });

  it("only the author can edit or delete a note", async () => {
    await as(db, A2, async () => {
      const r = await db.query("update car_compare.notes set body = 'edited' where id = $1", [noteId]);
      expect(r.affectedRows).toBe(0);
      const d = await db.query("delete from car_compare.notes where id = $1", [noteId]);
      expect(d.affectedRows).toBe(0);
    });
    await as(db, A1, async () => {
      const r = await db.query("update car_compare.notes set body = 'edited' where id = $1", [noteId]);
      expect(r.affectedRows).toBe(1);
    });
  });

  it("cannot score as someone else", async () => {
    await expect(
      as(db, A1, () =>
        db.query(
          "insert into car_compare.scores (household_id, vehicle_id, user_id, criterion, score) values ($1, $2, $3, 'cargo', 5)",
          [hA, sharedVehicle, A2],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("catalog", () => {
  it("shared catalog is readable by everyone signed in but not writable", async () => {
    await as(db, X, async () => {
      expect(await count("select 1 from car_compare.vehicles where id = $1", [sharedVehicle])).toBe(1);
      const r = await db.query("update car_compare.vehicles set hp = 999 where id = $1", [sharedVehicle]);
      expect(r.affectedRows).toBe(0);
    });
    await expect(
      as(db, X, () => db.query("insert into car_compare.vehicles (make, model) values ('Fake', 'Car')")),
    ).rejects.toThrow();
  });

  it("household-added vehicles are private to that household", async () => {
    const v = (
      await as(db, B1, () =>
        one<{ id: string }>(
          "insert into car_compare.vehicles (household_id, make, model) values ($1, 'Kia', 'Telluride') returning id",
          [hB],
        ),
      )
    ).id;
    await as(db, A1, async () => {
      expect(await count("select 1 from car_compare.vehicles where id = $1", [v])).toBe(0);
      await expect(
        db.query("insert into car_compare.shortlist (household_id, vehicle_id) values ($1, $2)", [hA, v]),
      ).rejects.toThrow();
    });
  });

  it("child rows can't point at another household's listing", async () => {
    const listing = (
      await as(db, B1, () =>
        one<{ id: string }>(
          "insert into car_compare.listings (household_id, vehicle_id, asking_price) values ($1, $2, 30000) returning id",
          [hB, sharedVehicle],
        ),
      )
    ).id;
    await expect(
      as(db, A1, () =>
        db.query("insert into car_compare.quotes (household_id, listing_id, otd_price) values ($1, $2, 1)", [hA, listing]),
      ),
    ).rejects.toThrow();
  });
});

describe("preferences constraints", () => {
  it("weights must total 100", async () => {
    await expect(
      as(db, A1, () =>
        db.query(`update car_compare.preferences set weights = '{"cargo":50,"price":40}' where household_id = $1`, [hA]),
      ),
    ).rejects.toThrow();
  });
});

describe("sharing a Supabase project with other apps", () => {
  it("creates nothing in the public schema", async () => {
    const n = await count(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname <> 'other_app'
       union all
       select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname <> 'other_app_fn'`,
    );
    expect(n).toBe(0);
  });

  it("leaves another app's grants in public untouched", async () => {
    const r = await one<Record<string, boolean>>(`select
      has_table_privilege('anon', 'public.other_app', 'select,insert,update,delete') as anon_t,
      has_table_privilege('authenticated', 'public.other_app', 'select,insert,update,delete') as auth_t,
      has_table_privilege('service_role', 'public.other_app', 'select,insert,update,delete') as svc_t,
      has_function_privilege('anon', 'public.other_app_fn()', 'execute') as anon_f`);
    expect(r).toEqual({ anon_t: true, auth_t: true, svc_t: true, anon_f: true });
  });

  it("anon and service_role cannot reach any car_compare table or function", async () => {
    const r = await one<Record<string, boolean>>(`select
      has_schema_privilege('anon', 'car_compare', 'usage') as anon_usage,
      has_schema_privilege('service_role', 'car_compare', 'usage') as svc_usage,
      (select bool_or(has_table_privilege(role, c.oid, 'select,insert,update,delete,truncate'))
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              unnest(array['anon','service_role']) role
        where n.nspname = 'car_compare' and c.relkind = 'r') as any_table,
      (select bool_or(has_function_privilege(role, p.oid, 'execute'))
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              unnest(array['anon','service_role']) role
        where n.nspname = 'car_compare') as any_fn`);
    expect(r).toEqual({ anon_usage: false, svc_usage: false, any_table: false, any_fn: false });
  });

  it("signed-in users cannot write the catalog or the AI usage log directly", async () => {
    await expect(
      as(db, A1, () => db.query("insert into car_compare.feature_catalog (key, name, category, sort_order) values ('x','x','x',1)")),
    ).rejects.toThrow();
    await expect(
      as(db, A1, () => db.query("insert into car_compare.ai_usage (household_id, route) values ($1, 'x')", [hA])),
    ).rejects.toThrow();
  });
});

describe("AI call quota", () => {
  it("allows 30 calls per household per hour, shared by members", async () => {
    await db.query("delete from car_compare.ai_usage");
    for (let i = 0; i < 29; i++) {
      expect((await as(db, A1, () => one<{ ok: boolean }>("select car_compare.consume_ai_call('compare') as ok"))).ok).toBe(true);
    }
    // The spouse's call counts against the same household.
    expect((await as(db, A2, () => one<{ ok: boolean }>("select car_compare.consume_ai_call('compare') as ok"))).ok).toBe(true);
    expect((await as(db, A1, () => one<{ ok: boolean }>("select car_compare.consume_ai_call('compare') as ok"))).ok).toBe(false);
    // Another household is unaffected, and members only see their own household's usage.
    expect((await as(db, B1, () => one<{ ok: boolean }>("select car_compare.consume_ai_call('compare') as ok"))).ok).toBe(true);
    expect(await as(db, B1, () => count("select 1 from car_compare.ai_usage"))).toBe(1);
  });

  it("frees up slots after an hour", async () => {
    await db.query("update car_compare.ai_usage set created_at = now() - interval '61 minutes' where household_id = $1", [hA]);
    expect((await as(db, A1, () => one<{ ok: boolean }>("select car_compare.consume_ai_call('compare') as ok"))).ok).toBe(true);
  });

  it("requires a household and a valid route name", async () => {
    await expect(as(db, X, () => db.query("select car_compare.consume_ai_call('compare')"))).rejects.toThrow(/household/);
    await expect(as(db, A1, () => db.query("select car_compare.consume_ai_call('Bad Route!')"))).rejects.toThrow();
  });
});

describe("starter catalog seed", () => {
  it("has 8 shared, unverified vehicles that every signed-in user can see but not change", async () => {
    const seeded = await count(
      "select 1 from car_compare.vehicles where household_id is null and specs_verified = false and generation_years <> '2018-2024'",
    );
    expect(seeded).toBe(8);
    expect(await as(db, X, () => count("select 1 from car_compare.vehicles where household_id is null"))).toBe(9);
    await as(db, A1, () => db.query("update car_compare.vehicles set hp = 1 where household_id is null"));
    expect(await count("select 1 from car_compare.vehicles where hp = 1")).toBe(0);
  });
});

describe("starter trims seed", () => {
  it("seeds the six Odyssey trims as shared, unverified rows, with Touring adding the family features", async () => {
    const q = "select name, features from car_compare.trims t join car_compare.vehicles v on v.id = t.vehicle_id where t.household_id is null and v.model = 'Odyssey' and t.specs_verified = false";
    const rows = (await as(db, X, () => db.query<{ name: string; features: Record<string, boolean> }>(q))).rows;
    expect(rows.map((r) => r.name).sort()).toEqual(["EX", "EX-L", "Elite", "LX", "Sport", "Touring"]);
    expect(rows.every((r) => r.features.backup_camera === true)).toBe(true);
    const touring = rows.find((r) => r.name === "Touring")!.features;
    expect([touring.parking_sensors, touring.rear_camera, touring.intercom, touring.rear_entertainment]).toEqual([true, true, true, true]);
    expect(rows.find((r) => r.name === "EX")!.features.parking_sensors).toBe(false);
  });

  it("lets a household mark a shared trim as a target, and only that household sees the mark", async () => {
    const { rows } = await db.query<{ id: string }>("select id from car_compare.trims where name = 'Touring' and household_id is null limit 1");
    await as(db, A1, () =>
      db.query("insert into car_compare.trim_shortlist (household_id, trim_id, status) values ($1, $2, 'target') on conflict do nothing", [hA, rows[0].id]),
    );
    expect(await as(db, A1, () => count("select 1 from car_compare.trim_shortlist where trim_id = $1", [rows[0].id]))).toBe(1);
    expect(await as(db, B1, () => count("select 1 from car_compare.trim_shortlist where trim_id = $1", [rows[0].id]))).toBe(0);
  });
});

describe("removing a car from the shortlist", () => {
  it("members can remove and restore; other households can't touch it", async () => {
    await as(db, A1, () =>
      db.query("insert into car_compare.shortlist (household_id, vehicle_id) values ($1, $2) on conflict do nothing", [hA, sharedVehicle]),
    );
    const setStatus = async (user: string, status: string) =>
      (
        await as(db, user, () =>
          db.query("update car_compare.shortlist set status = $3 where household_id = $1 and vehicle_id = $2 returning 1", [
            hA,
            sharedVehicle,
            status,
          ]),
        )
      ).rows.length;
    expect(await setStatus(B1, "rejected")).toBe(0); // invisible to household B
    expect(await setStatus(A1, "rejected")).toBe(1);
    expect(await setStatus(A1, "considering")).toBe(1);
  });
});
