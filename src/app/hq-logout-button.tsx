"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";

export default function HqLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/hq/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={() => void logout()} disabled={loading} className="text-button w-full justify-center">
      <LogOut className="h-4 w-4" />
      {loading ? "Signing out..." : "Logout"}
    </button>
  );
}

