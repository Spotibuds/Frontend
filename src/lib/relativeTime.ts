const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" });

export function formatRelativeTime(value: string, now: number): string | null {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return null;
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 86400],
    ["month", 30 * 86400],
    ["week", 7 * 86400],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const [unit, length] = units.find(([, length]) => seconds >= length)!;
  return relative.format(-Math.floor(seconds / length), unit);
}
