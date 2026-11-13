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
      "insert into public.vehicles (make, model, generation_years, type, brand_origin) values ('Honda','Odyssey','2018-2024','minivan','Japan') returning id",
    )
  ).id;

  hA = (await as(db, A1, () => one<{ id: string }>("select public.create_household('Household A', 'Owner A') as id"))).id;
  hB = (await as(db, B1, () => one<{ id: string }>("select public.create_household('Household B', 'Owner B') as id"))).id;
});

describe("household creation", () => {
  it("creates owner membership, default preferences and the wishlist", async () => {
    await as(db, A1, async () => {
      const m = await one<{ role: string }>("select role from public.household_members where user_id = $1", [A1]);
      expect(m.role).toBe("owner");
      expect(await count("select 1 from public.preferences where household_id = $1", [hA])).toBe(1);
      expect(
        await count("select 1 from public.wishlist_items where household_id = $1 and tier = 'dont_care'", [hA]),
      ).toBe(45);
    });
  });

  it("rejects a second household for the same user", async () => {
    await expect(
      as(db, A1, () => db.query("select public.create_household('Again', 'Owner A')")),
    ).rejects.toThrow(/already belong/);
  });

  it("does not let users insert households or members directly", async () => {
    await expect(as(db, X, () => db.query("insert into public.households (name) values ('Sneaky')"))).rejects.toThrow();
    await expect(
      as(db, X, () =>
        db.query(
          "insert into public.household_members (household_id, user_id, display_name) values ($1, $2, 'x')",
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
      as(db, B1, () => db.query("insert into public.invites (household_id, email) values ($1, 'x@example.com')", [hA])),
    ).rejects.toThrow();
    token = (
      await as(db, A1, () =>
        one<{ token: string }>(
          "insert into public.invites (household_id, email) values ($1, 'spouse-a@example.com') returning token",
          [hA],
        ),
      )
    ).token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("outsiders cannot list another household's invites", async () => {
    await as(db, B1, async () => {
      expect(await count("select 1 from public.invites where household_id = $1", [hA])).toBe(0);
    });
  });

  it("rejects a forwarded link used by a different email", async () => {
    await expect(as(db, X, () => db.query("select public.accept_invite($1, 'X')", [token]))).rejects.toThrow(
      /different email/,
    );
  });

  it("accepts for the invited email (case-insensitive) and only once", async () => {
    const r = await as(db, A2, () => one<{ id: string }>("select public.accept_invite($1, 'Spouse A') as id", [token]));
    expect(r.id).toBe(hA);
    await expect(
      as(db, A2, () => db.query("select public.accept_invite($1, 'Spouse A')", [token])),
    ).rejects.toThrow(/already been used/);
  });

  it("members cannot promote themselves to owner", async () => {
    await expect(
      as(db, A2, () => db.query("update public.household_members set role = 'owner' where user_id = $1", [A2])),
    ).rejects.toThrow(/Only display_name/);
    await as(db, A2, () =>
      db.query("update public.household_members set display_name = 'Spouse' where user_id = $1", [A2]),
    );
  });
});

describe("data isolation between households", () => {
  let noteId: string;

  beforeAll(async () => {
    noteId = (
      await as(db, A1, () =>
        one<{ id: string }>(
          "insert into public.notes (household_id, vehicle_id, body) values ($1, $2, 'Third row is roomy') returning id",
          [hA, sharedVehicle],
        ),
      )
    ).id;
    await as(db, A2, () =>
      db.query(
        "insert into public.scores (household_id, vehicle_id, criterion, score) values ($1, $2, 'overall', 4)",
        [hA, sharedVehicle],
      ),
    );
  });

  it("spouse sees the owner's note and score; other households and strangers see nothing", async () => {
    await as(db, A2, async () => {
      expect(await count("select 1 from public.notes")).toBe(1);
      expect(await count("select 1 from public.scores")).toBe(1);
    });
    for (const u of [B1, X]) {
      await as(db, u, async () => {
        expect(await count("select 1 from public.notes")).toBe(0);
        expect(await count("select 1 from public.scores")).toBe(0);
        expect(await count("select 1 from public.preferences where household_id = $1", [hA])).toBe(0);
        expect(await count("select 1 from public.wishlist_items where household_id = $1", [hA])).toBe(0);
        expect(await count("select 1 from public.household_members where household_id = $1", [hA])).toBe(0);
        expect(await count("select 1 from public.households where id = $1", [hA])).toBe(0);
      });
    }
  });

  it("cannot write into another household", async () => {
    await expect(
      as(db, B1, () =>
        db.query("insert into public.notes (household_id, vehicle_id, body) values ($1, $2, 'hi')", [
          hA,
          sharedVehicle,
        ]),
      ),
    ).rejects.toThrow();
    await as(db, B1, async () => {
      const r = await db.query("update public.preferences set gas_price = 9 where household_id = $1", [hA]);
      expect(r.affectedRows).toBe(0);
    });
  });

  it("only the author can edit or delete a note", async () => {
    await as(db, A2, async () => {
      const r = await db.query("update public.notes set body = 'edited' where id = $1", [noteId]);
      expect(r.affectedRows).toBe(0);
      const d = await db.query("delete from public.notes where id = $1", [noteId]);
      expect(d.affectedRows).toBe(0);
    });
    await as(db, A1, async () => {
      const r = await db.query("update public.notes set body = 'edited' where id = $1", [noteId]);
      expect(r.affectedRows).toBe(1);
    });
  });

  it("cannot score as someone else", async () => {
    await expect(
      as(db, A1, () =>
        db.query(
          "insert into public.scores (household_id, vehicle_id, user_id, criterion, score) values ($1, $2, $3, 'cargo', 5)",
          [hA, sharedVehicle, A2],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("catalog", () => {
  it("shared catalog is readable by everyone signed in but not writable", async () => {
    await as(db, X, async () => {
      expect(await count("select 1 from public.vehicles where id = $1", [sharedVehicle])).toBe(1);
      const r = await db.query("update public.vehicles set hp = 999 where id = $1", [sharedVehicle]);
      expect(r.affectedRows).toBe(0);
    });
    await expect(
      as(db, X, () => db.query("insert into public.vehicles (make, model) values ('Fake', 'Car')")),
    ).rejects.toThrow();
  });

  it("household-added vehicles are private to that household", async () => {
    const v = (
      await as(db, B1, () =>
        one<{ id: string }>(
          "insert into public.vehicles (household_id, make, model) values ($1, 'Kia', 'Telluride') returning id",
          [hB],
        ),
      )
    ).id;
    await as(db, A1, async () => {
      expect(await count("select 1 from public.vehicles where id = $1", [v])).toBe(0);
      await expect(
        db.query("insert into public.shortlist (household_id, vehicle_id) values ($1, $2)", [hA, v]),
      ).rejects.toThrow();
    });
  });

  it("child rows can't point at another household's listing", async () => {
    const listing = (
      await as(db, B1, () =>
        one<{ id: string }>(
          "insert into public.listings (household_id, vehicle_id, asking_price) values ($1, $2, 30000) returning id",
          [hB, sharedVehicle],
        ),
      )
    ).id;
    await expect(
      as(db, A1, () =>
        db.query("insert into public.quotes (household_id, listing_id, otd_price) values ($1, $2, 1)", [hA, listing]),
      ),
    ).rejects.toThrow();
  });
});

describe("preferences constraints", () => {
  it("weights must total 100", async () => {
    await expect(
      as(db, A1, () =>
        db.query(`update public.preferences set weights = '{"cargo":50,"price":40}' where household_id = $1`, [hA]),
      ),
    ).rejects.toThrow();
  });
});
