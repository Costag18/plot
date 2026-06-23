import { createDocument, createIdGen, addRectangle, addPolygon } from '@plot/document'
import type { PlotDocument } from '@plot/document'

// Prebuilt starter documents for the empty-state. Coordinates are in micrometers
// (the document's internal unit); these all use metric ('m') display units.

// An empty metric document.
export function blank(): PlotDocument {
  return createDocument('m')
}

// A 4 m × 3 m room (axis-constrained rectangle).
export function room(): PlotDocument {
  return addRectangle(createDocument('m'), createIdGen(), 0, 0, 4_000_000, 3_000_000)
}

// An L-shaped closed polygon: a 4 m × 3 m footprint with a 2 m × 1.5 m notch cut
// out of the top-right corner. Six corners, walked counter-clockwise.
export function lShape(): PlotDocument {
  const pts = [
    { x: 0, y: 0 },
    { x: 4_000_000, y: 0 },
    { x: 4_000_000, y: 1_500_000 },
    { x: 2_000_000, y: 1_500_000 },
    { x: 2_000_000, y: 3_000_000 },
    { x: 0, y: 3_000_000 },
  ]
  return addPolygon(createDocument('m'), createIdGen(), pts, true).doc
}
