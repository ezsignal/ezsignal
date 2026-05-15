export type TradingDayBoundary = {
  startHourMy: number;
  startMinuteMy: number;
};

export const DEFAULT_TRADING_DAY_BOUNDARY: TradingDayBoundary = {
  startHourMy: 7,
  startMinuteMy: 0,
};

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function normalizeTradingDayBoundary(
  input?: Partial<TradingDayBoundary> | null,
): TradingDayBoundary {
  const hour = clamp(input?.startHourMy ?? DEFAULT_TRADING_DAY_BOUNDARY.startHourMy, 0, 23);
  const minute = clamp(input?.startMinuteMy ?? DEFAULT_TRADING_DAY_BOUNDARY.startMinuteMy, 0, 59);
  return {
    startHourMy: hour,
    startMinuteMy: minute,
  };
}

export function formatTradingDayBoundaryLabel(boundary: TradingDayBoundary) {
  const hour = String(boundary.startHourMy).padStart(2, "0");
  const minute = String(boundary.startMinuteMy).padStart(2, "0");
  return `${hour}:${minute} MYT`;
}

function getCurrentTradingDayStartUtcMs(boundary: TradingDayBoundary, nowUtcMs = Date.now()) {
  const nowMyMs = nowUtcMs + MYT_OFFSET_MS;
  const nowMy = new Date(nowMyMs);

  let boundaryMyUtcMs = Date.UTC(
    nowMy.getUTCFullYear(),
    nowMy.getUTCMonth(),
    nowMy.getUTCDate(),
    boundary.startHourMy,
    boundary.startMinuteMy,
    0,
    0,
  );

  if (nowMyMs < boundaryMyUtcMs) {
    boundaryMyUtcMs -= DAY_MS;
  }

  return boundaryMyUtcMs - MYT_OFFSET_MS;
}

export function getTradingDayRangeIso(boundaryInput?: Partial<TradingDayBoundary> | null, nowUtcMs = Date.now()) {
  const boundary = normalizeTradingDayBoundary(boundaryInput);
  const startUtcMs = getCurrentTradingDayStartUtcMs(boundary, nowUtcMs);
  const endUtcMs = startUtcMs + DAY_MS - 1;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

export function getTradingWeekStartIso(boundaryInput?: Partial<TradingDayBoundary> | null, nowUtcMs = Date.now()) {
  const boundary = normalizeTradingDayBoundary(boundaryInput);
  const dayStartUtcMs = getCurrentTradingDayStartUtcMs(boundary, nowUtcMs);
  const dayStartMyMs = dayStartUtcMs + MYT_OFFSET_MS;
  const dayStartMy = new Date(dayStartMyMs);
  const dayOfWeek = dayStartMy.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  const weekStartUtcMs = dayStartUtcMs - (daysFromMonday * DAY_MS);
  return new Date(weekStartUtcMs).toISOString();
}
