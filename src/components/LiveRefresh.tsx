"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DB_SCHEMA } from "@/lib/supabase/env";

/**
 * Re-renders the page (server data included) when another household member changes one
 * of `tables`. Inserts and updates are filtered to this household (and checked by RLS).
 * Deletes can't be filtered by column, so any delete in those tables triggers a refresh;
 * the payload holds only the deleted row's id, so nothing leaks. Bursts are debounced.
 */
export function LiveRefresh({ householdId, tables }: { householdId: string; tables: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    let channel = supabase.channel(`live:${householdId}:${key}`);
    for (const table of key.split(",")) {
      const filter = `household_id=eq.${householdId}`;
      channel = channel
        .on("postgres_changes", { event: "INSERT", schema: DB_SCHEMA, table, filter }, refresh)
        .on("postgres_changes", { event: "UPDATE", schema: DB_SCHEMA, table, filter }, refresh)
        .on("postgres_changes", { event: "DELETE", schema: DB_SCHEMA, table }, refresh);
    }
    // Realtime needs the user's token to apply RLS; make sure it's set before subscribing.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [householdId, key, router]);

  return null;
}
