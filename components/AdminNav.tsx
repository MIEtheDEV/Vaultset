"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Reviews",   href: "/admin/reviews"   },
  { label: "Users",     href: "/admin/users"     },
  { label: "Reports",   href: "/admin/reports"   },
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Activity",  href: "/admin/activity"  },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b border-border pb-4 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`shrink-0 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            pathname.startsWith(tab.href)
              ? "bg-surface-raised text-foreground font-medium"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
