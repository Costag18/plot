import { createDocument } from '@plot/document'
import type { PlotDocument } from '@plot/document'

const M = 1_000_000

export function seedDocument(): PlotDocument {
  const doc = createDocument('m')
  doc.sketch.points = {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 3 * M, y: 0, fixed: false },
    p2: { type: 'point', id: 'p2', x: 3 * M, y: 2 * M, fixed: false },
    p3: { type: 'point', id: 'p3', x: 0, y: 2 * M, fixed: false },
  }
  doc.sketch.lines = {
    L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' },
    L1: { type: 'line', id: 'L1', a: 'p1', b: 'p2' },
    L2: { type: 'line', id: 'L2', a: 'p2', b: 'p3' },
    L3: { type: 'line', id: 'L3', a: 'p3', b: 'p0' },
  }
  return doc
}
