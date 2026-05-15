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

export function isHqAdminAuthorized(request: Request) {
  const candidates = getHqAdminKeyCandidates();
  if (candidates.length === 0) return process.env.NODE_ENV !== "production";
  const key = request.headers.get("x-admin-key")?.trim() ?? "";
  if (!key) return false;
  return candidates.includes(key);
}
