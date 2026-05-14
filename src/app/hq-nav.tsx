"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleAlert,
  Database,
  KeyRound,
  Layers3,
  LockKeyhole,
  Radio,
  RadioTower,
  Settings2,
} from "lucide-react";

const navItems = [
  { label: "Overview", href: "/", icon: Layers3 },
  { label: "Brands", href: "/brands", icon: Settings2 },
  { label: "Access Keys", href: "/access-keys", icon: KeyRound },
  { label: "Signals", href: "/signals", icon: RadioTower },
  { label: "Performance", href: "/performance", icon: CircleAlert },
  { label: "Webhook", href: "/webhook", icon: Radio },
  { label: "Supabase", href: "/supabase", icon: Database },
  { label: "Security", href: "/security", icon: LockKeyhole },
] as const;

export default function HqNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-extrabold transition ${
              active
                ? "bg-slate-950 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
