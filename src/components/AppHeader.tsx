import Link from "next/link";
import type { Membership } from "@/lib/session";

export function AppHeader({ membership }: { membership: Membership }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="min-w-0">
          <p className="text-xs text-muted">Car Compare</p>
          <p className="truncate font-semibold">{membership.household.name}</p>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/settings" className="btn-secondary min-h-10 px-3 text-sm">
            Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className="btn min-h-10 px-3 text-sm text-muted hover:text-foreground">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
