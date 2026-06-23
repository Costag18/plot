import { describe, it, expect } from 'vitest'
import { affectedPointIds, translateEntities, duplicateEntities, allSelectableIds } from '../src/select'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addRectangle, addLineSegment } from '../src/mutate'

function rect() {
  return addRectangle(createDocument('m'), createIdGen(), 0, 0, 400, 200) // p0..3, L4..7, c8..11
}

describe('affectedPointIds', () => {
  it('includes a selected point and both endpoints of a selected line', () => {
    const doc = rect()
    const ids = affectedPointIds(doc.sketch, ['p0', 'L5'])
    expect([...ids].sort()).toEqual(['p0', 'p1', 'p2']) // L5 = p1->p2
  })
})

describe('translateEntities', () => {
  it('moves all affected points by the delta (rounded)', () => {
    const doc = translateEntities(rect(), ['L4'], 10, -5) // L4 = p0->p1
    expect(doc.sketch.points.p0).toMatchObject({ x: 10, y: -5 })
    expect(doc.sketch.points.p1).toMatchObject({ x: 410, y: -5 })
    expect(doc.sketch.points.p2).toMatchObject({ x: 400, y: 200 }) // untouched
  })
})

describe('duplicateEntities', () => {
  it('clones a whole rectangle (points, lines, and interior constraints) offset', () => {
    const doc = rect()
    const ids = ['p0', 'p1', 'p2', 'p3', 'L4', 'L5', 'L6', 'L7']
    const { doc: next, newIds } = duplicateEntities(doc, createIdGen(100), ids, 1000, 1000)
    expect(Object.keys(next.sketch.points)).toHaveLength(8)
    expect(Object.keys(next.sketch.lines)).toHaveLength(8)
    expect(next.sketch.constraints).toHaveLength(8) // 4 original + 4 cloned
    // the clones are offset
    const clonePts = newIds.filter((id) => id.startsWith('p')).map((id) => next.sketch.points[id]!)
    expect(clonePts.some((p) => p.x === 1000 && p.y === 1000)).toBe(true) // p0 clone
    expect(newIds.length).toBe(8 + 4) // 4 pts + 4 lines + 4 constraints
  })
  it('does not clone a line whose endpoints are not both selected', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0) // p0,p1,L2
    const { doc: next } = duplicateEntities(doc, createIdGen(100), ['p0'], 5, 5) // only p0
    expect(Object.keys(next.sketch.points)).toHaveLength(3) // 2 + 1 clone of p0
    expect(Object.keys(next.sketch.lines)).toHaveLength(1) // L2 not cloned
  })
})

describe('allSelectableIds', () => {
  it('returns every point and line id', () => {
    const ids = allSelectableIds(rect().sketch)
    expect(ids).toHaveLength(8) // 4 points + 4 lines
  })
})
