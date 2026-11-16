import Link from "next/link";
import type { Membership } from "@/lib/session";
import { NavLinks } from "./NavLinks";

export function AppHeader({ membership }: { membership: Membership }) {
  return (
    <header className="hero sticky top-0 z-20 shadow-lg shadow-accent/20">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <CarIcon />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-white/75">Car Compare</span>
            <span className="block truncate font-semibold">{membership.household.name}</span>
          </span>
        </Link>
        <form action="/auth/signout" method="post">
          <button className="btn min-h-10 px-3 text-sm text-white/80 hover:bg-white/10 hover:text-white">Sign out</button>
        </form>
      </div>
      <NavLinks />
    </header>
  );
}

export function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17h14M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-2" />
      <path d="M3 13v4h2" />
      <circle cx="7.5" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
      <path d="M3 13h18" />
    </svg>
  );
}
