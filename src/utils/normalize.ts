export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function similarity(a: string, b: string): number {
  const x = normalize(a); const y = normalize(b);
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const dp = Array.from({ length: x.length + 1 }, (_, i) => Array(y.length + 1).fill(0).map((_, j) => i || j));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) {
    dp[i]![j] = x[i - 1] === y[j - 1] ? dp[i - 1]![j - 1]! : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
  }
  return 1 - dp[x.length]![y.length]! / Math.max(x.length, y.length, 1);
}
