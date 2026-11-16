"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/compare", label: "Compare" },
  { href: "/scores", label: "Scores" },
  { href: "/preferences", label: "Preferences" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="mx-auto max-w-5xl overflow-x-auto px-2 [scrollbar-width:none]">
      <ul className="flex gap-1 py-2">
        {links.map((l) => {
          // A car's own page belongs under Compare.
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href) || (l.href === "/compare" && path.startsWith("/cars/"));
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-white text-[#3b26b8] shadow" : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
