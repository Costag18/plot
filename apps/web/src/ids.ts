import { createIdGen, parseLengthInput } from '@plot/document'
import type { Unit } from '@plot/document'

// Single id generator shared between the store and CanvasView so that ids stay
// unique across all mutations regardless of which module emits them. Seeded above
// the seed ids (p0..p3, L0..L3).
export const idGen = createIdGen(1000)

// Micrometers per one unit of each display unit. Inverse of `formatLength`.
const UM_PER_UNIT: Record<Unit, number> = {
  m: 1_000_000,
  cm: 10_000,
  mm: 1_000,
  ft: 304_800,
}

// Convert a length expressed in the document's display unit to micrometers.
// Delegates to parseLengthInput which supports bare numbers, metric suffixes,
// and feet-inches notation (12' 6", 18", 2ft, etc.).
export function parseLength(value: string | number, unit: Unit): number | null {
  const text = typeof value === 'number' ? String(value) : value
  return parseLengthInput(text, unit)
}

// Convert micrometers back to a display-unit number (for prefilling inputs).
export function umToDisplay(um: number, unit: Unit): number {
  return um / UM_PER_UNIT[unit]
}
