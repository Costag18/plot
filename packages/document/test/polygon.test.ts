import { describe, it, expect } from 'vitest'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addPolygon } from '../src/mutate'

const pts = [ { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 } ]

describe('addPolygon', () => {
  it('closed triangle: 3 points, 3 lines', () => {
    const { doc, newIds } = addPolygon(createDocument('m'), createIdGen(), pts, true)
    expect(Object.keys(doc.sketch.points)).toHaveLength(3)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(3)
    expect(newIds).toHaveLength(6)
  })
  it('open polyline: 3 points, 2 lines', () => {
    const { doc } = addPolygon(createDocument('m'), createIdGen(), pts, false)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(2)
  })
  it('consecutive edges share a point id', () => {
    const { doc } = addPolygon(createDocument('m'), createIdGen(), pts, true)
    const lines = Object.values(doc.sketch.lines)
    const allPointIds = new Set(lines.flatMap((l) => [l.a, l.b]))
    expect(allPointIds.size).toBe(3) // 3 shared corners, not 6
  })
  it('fewer than 2 points is a no-op', () => {
    const doc0 = createDocument('m')
    expect(addPolygon(doc0, createIdGen(), [{ x: 0, y: 0 }], true).doc).toBe(doc0)
  })
})
