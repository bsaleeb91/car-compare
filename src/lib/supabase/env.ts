/** All app tables live in this Postgres schema (the project is shared with other apps). */
export const DB_SCHEMA = "car_compare";

/** Tags accounts created here so other apps sharing the auth users can tell them apart. */
export const APP_TAG = "car_compare";

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
    );
  }
  return { url, key };
}
