import Link from "next/link"

import { site } from "@/lib/site"

const links = [
  { href: "/", label: "Compliance" },
  { href: "/tenders", label: "Tenders" },
  { href: "/loads", label: "Loads" },
  { href: "/activity", label: "Activity" },
]

/** Top navigation. Add your own pages to `links`. */
export function AppNav() {
  return (
    <header className="border-b">
      {/* Full width too when the page is (see data-full-width in layout). */}
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6 in-[body:has([data-full-width])]:max-w-none">
        <Link href="/" className="font-semibold tracking-tight">
          {site.name}
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
