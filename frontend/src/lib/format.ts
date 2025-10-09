export function percent(x?: number, opts: { sign?: boolean } = {}): string {
  if (x == null || Number.isNaN(x)) return "—";
  const val = x * 100;
  const sign = opts.sign ? (val > 0 ? "+" : val < 0 ? "-" : "") : "";
  return `${sign}${Math.abs(val).toFixed(2)}%`;
}

export function fixed2(x?: number): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(2);
}
