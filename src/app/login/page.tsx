"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/hq/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setLoading(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Login failed.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-black text-slate-900">EZ SIGNAL HQ Login</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">Enter admin key to continue.</p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
          placeholder="Admin key"
          required
        />
        {error ? <p className="mt-2 text-xs font-bold text-rose-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-black text-white disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}

