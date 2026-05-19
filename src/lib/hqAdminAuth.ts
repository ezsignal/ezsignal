export function getHqAdminKeyCandidates() {
  const single = process.env.ADMIN_CRM_KEY?.trim() ?? "";
  const multi = process.env.ADMIN_CRM_KEYS?.trim() ?? "";
  const dispatchToken = process.env.HQ_DISPATCH_RUN_TOKEN?.trim() ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  return [
    ...multi.split(",").map((value) => value.trim()).filter(Boolean),
    single,
    dispatchToken,
    cronSecret,
  ].filter(Boolean);
}

export function isValidHqAdminKey(key: string) {
  const candidates = getHqAdminKeyCandidates();
  if (candidates.length === 0) return process.env.NODE_ENV !== "production";
  const normalized = key.trim();
  if (!normalized) return false;
  return candidates.includes(normalized);
}

export function isHqAdminAuthorized(request: Request) {
  const key = request.headers.get("x-admin-key")?.trim() ?? "";
  return isValidHqAdminKey(key);
}
