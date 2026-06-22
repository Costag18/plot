export function niceStep(target: number): number {
  const safe = Math.max(target, Number.EPSILON)
  const pow = Math.pow(10, Math.floor(Math.log10(safe)))
  const f = safe / pow
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return m * pow
}
