"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";

export default function HqLayoutClient({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="shell">
      <header className="mobile-topbar">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="icon-button"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-950 text-xs font-black text-white">
            EZ
          </span>
          <span className="text-sm font-black tracking-[0.16em] text-slate-950">SIGNAL HQ</span>
        </Link>
      </header>

      {open ? (
        <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="sidebar-close icon-button"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
