import type { Unit } from './document'

// Micrometers per one display-unit (mirrors ids.ts in apps/web for the pure
// document-layer parse that has no React dependency).
const UM_PER_UNIT: Record<Unit, number> = {
  m: 1_000_000,
  cm: 10_000,
  mm: 1_000,
  ft: 304_800,
}

const UM_PER_INCH = 25_400
const UM_PER_FOOT = 304_800

// Feet-inches: optional feet part + optional inches part (at least one).
// Accepts: 12' 6"  12'6"  12'  18"  12ft  6in  12ft 6in  1.5'  1.5"
// Uses  '  ft  for feet  and  "  in  for inches.
const FEET_INCHES_RE =
  /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in))?$/i

// Numeric value followed by a metric suffix (mm | cm | m).
// Order matters: mm/cm checked before bare m.
const METRIC_SUFFIX_RE = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/i

/**
 * Parse a free-form length string into integer micrometers.
 *
 * Accepts (case-insensitive, spaces optional):
 *   "3.2m" | "300cm" | "1500mm"
 *   "12' 6\"" | "12'6\"" | "12'" | "18\"" | "12ft" | "6in"
 *   bare number -> interpreted in `unit`
 *
 * Returns null for empty / whitespace / non-numeric / zero / negative.
 */
export function parseLengthInput(text: string, unit: Unit): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  // 1. Feet / inches
  // Only attempt if the string contains ', ", ft, or in (case-insensitive).
  if (/['"]|ft|in/i.test(trimmed)) {
    const m = FEET_INCHES_RE.exec(trimmed)
    if (m) {
      const feetStr = m[1]
      const inchStr = m[2]
      // Reject if both groups are absent (e.g. a lone quote character).
      if (!feetStr && !inchStr) return null
      const feet = feetStr !== undefined ? parseFloat(feetStr) : 0
      const inches = inchStr !== undefined ? parseFloat(inchStr) : 0
      if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null
      const um = Math.round(feet * UM_PER_FOOT + inches * UM_PER_INCH)
      return um > 0 ? um : null
    }
    return null
  }

  // 2. Metric suffix (mm | cm | m)
  const mm = METRIC_SUFFIX_RE.exec(trimmed)
  if (mm) {
    const n = parseFloat(mm[1]!)
    const suffix = mm[2]!.toLowerCase() as 'mm' | 'cm' | 'm'
    if (!Number.isFinite(n)) return null
    const um = Math.round(n * UM_PER_UNIT[suffix])
    return um > 0 ? um : null
  }

  // 3. Bare number -- use the document's current unit
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  const um = Math.round(n * UM_PER_UNIT[unit])
  return um > 0 ? um : null
}
