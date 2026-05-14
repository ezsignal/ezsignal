"use client";

import { useEffect, useState } from "react";
import { MoonStar, Sun } from "lucide-react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "hq-theme-mode";

function applyTheme(next: ThemeMode) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.toggle("dark", next === "dark");
}

export default function HqThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const initial: ThemeMode = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function switchTheme(next: ThemeMode) {
    setTheme(next);
    applyTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
      <button
        type="button"
        onClick={() => switchTheme("light")}
        className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-black transition ${
          theme === "light" ? "bg-white text-slate-950" : "text-slate-600 hover:bg-white"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        Light
      </button>
      <button
        type="button"
        onClick={() => switchTheme("dark")}
        className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-black transition ${
          theme === "dark" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
        }`}
      >
        <MoonStar className="h-3.5 w-3.5" />
        Dark
      </button>
    </div>
  );
}

