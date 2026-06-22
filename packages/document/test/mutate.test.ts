import { describe, it, expect } from 'vitest'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addLineSegment, addRectangle, movePoint, setPointFixed, deleteEntity } from '../src/mutate'

describe('addLineSegment', () => {
  it('adds two points and a line, rounding coordinates', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100.4, 0)
    expect(Object.keys(doc.sketch.points)).toHaveLength(2)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(1)
    const line = doc.sketch.lines.L2!
    expect(doc.sketch.points[line.b]!.x).toBe(100)
  })
})

describe('addRectangle', () => {
  it('adds 4 points, 4 lines, and 4 H/V constraints normalized to min/max', () => {
    const doc = addRectangle(createDocument('m'), createIdGen(), 300, 200, 0, 0)
    expect(Object.keys(doc.sketch.points)).toHaveLength(4)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(4)
    expect(doc.sketch.constraints).toHaveLength(4)
    const xs = Object.values(doc.sketch.points).map((p) => p.x).sort((a, b) => a - b)
    const ys = Object.values(doc.sketch.points).map((p) => p.y).sort((a, b) => a - b)
    expect(xs).toEqual([0, 0, 300, 300])
    expect(ys).toEqual([0, 0, 200, 200])
    const kinds = doc.sketch.constraints.map((c) => c.kind).sort()
    expect(kinds).toEqual(['horizontal', 'horizontal', 'vertical', 'vertical'])
  })
})

describe('movePoint / setPointFixed', () => {
  it('moves a point (rounded) and leaves others alone', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    doc = movePoint(doc, 'p0', 5.6, -3.2)
    expect(doc.sketch.points.p0).toMatchObject({ x: 6, y: -3 })
  })

  it('toggles a point fixed flag immutably', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    const next = setPointFixed(doc, 'p0', true)
    expect(next.sketch.points.p0!.fixed).toBe(true)
    expect(doc.sketch.points.p0!.fixed).toBe(false)
  })

  it('ignores a missing point id', () => {
    const doc = createDocument('m')
    expect(movePoint(doc, 'nope', 1, 1)).toBe(doc)
  })
})

describe('deleteEntity', () => {
  it('deleting a point removes dependent lines and constraints', () => {
    const doc = addRectangle(createDocument('m'), createIdGen(), 0, 0, 300, 200)
    // points p0..p3, lines L4..L7, constraints c8..c11
    const next = deleteEntity(doc, 'p0')
    expect(next.sketch.points.p0).toBeUndefined()
    // p0 was in two lines (bottom + left); both removed
    expect(Object.keys(next.sketch.lines)).toHaveLength(2)
    // constraints on removed lines are gone
    expect(next.sketch.constraints.length).toBeLessThan(doc.sketch.constraints.length)
  })

  it('deleting a line removes the line and its constraints but keeps points', () => {
    const doc = addRectangle(createDocument('m'), createIdGen(), 0, 0, 300, 200)
    const next = deleteEntity(doc, 'L4')
    expect(next.sketch.lines.L4).toBeUndefined()
    expect(Object.keys(next.sketch.points)).toHaveLength(4)
    expect(next.sketch.constraints.every((c) => !('line' in c) || c.line !== 'L4')).toBe(true)
  })

  it('returns the same doc for an unknown id', () => {
    const doc = createDocument('m')
    expect(deleteEntity(doc, 'ghost')).toBe(doc)
  })
})
