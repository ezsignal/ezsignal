"use client";

import { useEffect, useState } from "react";
import { Bot, RefreshCw, Save, Send } from "lucide-react";

type TelegramState = {
  configured: boolean;
  enabled: boolean;
  chatId: string;
  tokenMasked: string | null;
  hasToken: boolean;
  updatedAt?: string | null;
};

type TelegramResponse = {
  ok: boolean;
  error?: string;
  telegram?: TelegramState;
};

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
}

export default function TelegramSettingsCard({ brandId }: { brandId: string }) {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hq/brands/${brandId}/telegram`, { cache: "no-store" });
      const json = (await response.json()) as TelegramResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed loading Telegram settings.");
        return;
      }
      const config = json.telegram;
      if (!config) return;
      setChatId(config.chatId ?? "");
      setEnabled(config.enabled !== false);
      setTokenMasked(config.tokenMasked ?? null);
      setUpdatedAt(config.updatedAt ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed loading Telegram settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, [brandId]);

  async function saveConfig() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/hq/brands/${brandId}/telegram`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          botToken: botToken.trim(),
          chatId: chatId.trim(),
          enabled,
        }),
      });
      const json = (await response.json()) as TelegramResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed saving Telegram settings.");
        return;
      }
      setBotToken("");
      setTokenMasked(json.telegram?.tokenMasked ?? tokenMasked);
      setMessage("Telegram settings saved.");
      await loadConfig();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed saving Telegram settings.");
    } finally {
      setSaving(false);
    }
  }

  async function testSend() {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/hq/brands/${brandId}/telegram`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "test",
          botToken: botToken.trim(),
          chatId: chatId.trim(),
        }),
      });
      const json = (await response.json()) as TelegramResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Failed Telegram test send.");
        return;
      }
      setMessage("Test message sent to Telegram.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Failed Telegram test send.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-slate-600" />
          <h2 className="text-lg font-black text-slate-950">Telegram Registration Alerts</h2>
        </div>
        <button type="button" className="text-button" onClick={() => void loadConfig()} disabled={loading || saving || testing}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mb-3 text-xs font-semibold text-slate-500">
        Alert untuk new registration di brand ini. Token disimpan selamat di HQ DB.
      </p>

      {tokenMasked ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
          Existing token: {tokenMasked}
        </p>
      ) : (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          No token saved yet.
        </p>
      )}

      <div className="grid gap-2">
        <input
          value={botToken}
          onChange={(event) => setBotToken(event.target.value)}
          placeholder="Bot Token (paste to add/replace)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          autoComplete="off"
        />
        <input
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          placeholder="Chat ID"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          autoComplete="off"
        />
        <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-900"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable alerts for this brand
        </label>
      </div>

      <div className="mt-2 grid gap-1 text-xs font-bold text-slate-600">
        <a
          href="https://t.me/BotFather"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-slate-900"
        >
          Create Telegram bot (BotFather)
        </a>
        <a
          href="https://t.me/UserInfoToBot"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-slate-900"
        >
          Get Telegram chat ID (UserInfoToBot)
        </a>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="text-button primary-button" onClick={() => void saveConfig()} disabled={saving || testing || loading}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="text-button" onClick={() => void testSend()} disabled={testing || saving || loading}>
          <Send className="h-4 w-4" />
          {testing ? "Sending..." : "Test Send"}
        </button>
      </div>

      <p className="mt-3 text-xs font-bold text-slate-500">Last update: {formatTime(updatedAt)}</p>
      {message ? (
        <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
