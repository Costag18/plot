import { describe, it, expect } from 'vitest'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addLineSegment, addRectangle, movePoint, setPointFixed, deleteEntity, setLineLength, addAxisConstraint, mergePoint, setCornerAngle, cornerAngleOf, addParallel, addPerpendicular, addEqualLength, addCoincident, addPointLineDistance } from '../src/mutate'

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

describe('setLineLength', () => {
  it('adds a distance constraint when none exists', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    const next = setLineLength(doc, createIdGen(50), 'L2', 3_000_000)
    const d = next.sketch.constraints.find((c) => c.kind === 'distance')
    expect(d).toMatchObject({ kind: 'distance', line: 'L2', value: 3_000_000 })
  })
  it('updates the existing distance constraint value (no duplicate)', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    doc = setLineLength(doc, createIdGen(50), 'L2', 3_000_000)
    const next = setLineLength(doc, createIdGen(60), 'L2', 5_000_000)
    const ds = next.sketch.constraints.filter((c) => c.kind === 'distance')
    expect(ds).toHaveLength(1)
    expect(ds[0]).toMatchObject({ value: 5_000_000 })
  })
  it('ignores an unknown line', () => {
    const doc = createDocument('m')
    expect(setLineLength(doc, createIdGen(), 'nope', 1)).toBe(doc)
  })
})

describe('addAxisConstraint', () => {
  it('adds a horizontal constraint to a line', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    const next = addAxisConstraint(doc, createIdGen(50), 'L2', 'horizontal')
    expect(next.sketch.constraints).toContainEqual({ id: 'c50', kind: 'horizontal', line: 'L2' })
  })
  it('does not duplicate an existing axis constraint', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    doc = addAxisConstraint(doc, createIdGen(50), 'L2', 'horizontal')
    const next = addAxisConstraint(doc, createIdGen(60), 'L2', 'horizontal')
    expect(next.sketch.constraints.filter((c) => c.kind === 'horizontal')).toHaveLength(1)
  })
})

describe('mergePoint', () => {
  it('remaps line endpoints from dropId to keepId and removes the dropped point', () => {
    // two separate segments sharing nothing
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0) // p0,p1,L2
    doc = addLineSegment(doc, createIdGen(3), 100, 5, 200, 0) // p3,p4,L5
    // merge p3 onto p1 (join the two segments at that corner)
    const next = mergePoint(doc, 'p1', 'p3')
    expect(next.sketch.points.p3).toBeUndefined()
    expect(next.sketch.lines.L5!.a).toBe('p1')
    expect(Object.keys(next.sketch.points)).toHaveLength(3)
  })
  it('drops a line that becomes degenerate after merge', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0) // p0,p1,L2
    const next = mergePoint(doc, 'p0', 'p1') // L2 becomes p0->p0
    expect(next.sketch.lines.L2).toBeUndefined()
    expect(next.sketch.points.p1).toBeUndefined()
  })
  it('returns same doc when ids equal or missing', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    expect(mergePoint(doc, 'p0', 'p0')).toBe(doc)
    expect(mergePoint(doc, 'p0', 'ghost')).toBe(doc)
  })
})

// Builds a corner at p0=(0,0): line L2 = p0->(100,0) [+x], line L5 = p0->(0,100) [+y].
function corner() {
  const gen = createIdGen()
  let doc = addLineSegment(createDocument('m'), gen, 0, 0, 100, 0) // p0,p1,L2
  doc = addLineSegment(doc, gen, 0, 0, 0, 100) // p3,p4,L5
  doc = mergePoint(doc, 'p0', 'p3') // L5 now p0->p4
  return doc
}

describe('cornerAngleOf', () => {
  it('returns the signed angle from edge l1 to edge l2 at the vertex', () => {
    const doc = corner()
    const a = cornerAngleOf(doc.sketch, 'p0', 'L2', 'L5')! // +x to +y
    expect(a).toBeCloseTo(Math.PI / 2, 6)
    const b = cornerAngleOf(doc.sketch, 'p0', 'L5', 'L2')! // +y to +x (opposite sign)
    expect(b).toBeCloseTo(-Math.PI / 2, 6)
  })
  it('returns null when a line does not touch the vertex or a point is missing', () => {
    const doc = corner()
    expect(cornerAngleOf(doc.sketch, 'p1', 'L2', 'L5')).toBeNull() // p1 not on L5
    expect(cornerAngleOf(doc.sketch, 'ghost', 'L2', 'L5')).toBeNull()
    expect(cornerAngleOf(doc.sketch, 'p0', 'L2', 'ghost')).toBeNull()
  })
})

describe('setCornerAngle', () => {
  it('appends an angle constraint for a fresh corner pair', () => {
    const doc = setCornerAngle(corner(), createIdGen(50), 'p0', 'L2', 'L5', Math.PI / 3)
    const cs = doc.sketch.constraints.filter((c) => c.kind === 'angle')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ kind: 'angle', l1: 'L2', l2: 'L5', vertex: 'p0', value: Math.PI / 3 })
  })
  it('updates the value for the same unordered pair instead of duplicating', () => {
    let doc = setCornerAngle(corner(), createIdGen(50), 'p0', 'L2', 'L5', Math.PI / 3)
    // swapped order references the same pair {L2,L5} at the same vertex
    doc = setCornerAngle(doc, createIdGen(60), 'p0', 'L5', 'L2', Math.PI / 4)
    const cs = doc.sketch.constraints.filter((c) => c.kind === 'angle')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ value: Math.PI / 4 })
  })
  it('returns the same doc when a line or the vertex is missing', () => {
    const doc = corner()
    expect(setCornerAngle(doc, createIdGen(), 'p0', 'L2', 'ghost', 1)).toBe(doc)
    expect(setCornerAngle(doc, createIdGen(), 'ghost', 'L2', 'L5', 1)).toBe(doc)
  })
})

// Two separate segments: L2 = p0->p1, L5 = p3->p4.
function twoLines() {
  const gen = createIdGen()
  let doc = addLineSegment(createDocument('m'), gen, 0, 0, 100, 0) // p0,p1,L2
  doc = addLineSegment(doc, gen, 0, 50, 100, 50) // p3,p4,L5
  return doc
}

describe('addParallel', () => {
  it('appends a parallel constraint for two lines', () => {
    const next = addParallel(twoLines(), createIdGen(50), 'L2', 'L5')
    const cs = next.sketch.constraints.filter((c) => c.kind === 'parallel')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ kind: 'parallel', l1: 'L2', l2: 'L5' })
  })
  it('dedups by the unordered pair {l1,l2}', () => {
    let doc = addParallel(twoLines(), createIdGen(50), 'L2', 'L5')
    doc = addParallel(doc, createIdGen(60), 'L5', 'L2') // swapped order, same pair
    expect(doc.sketch.constraints.filter((c) => c.kind === 'parallel')).toHaveLength(1)
  })
  it('returns the same doc when a line is missing', () => {
    const doc = twoLines()
    expect(addParallel(doc, createIdGen(), 'L2', 'ghost')).toBe(doc)
  })
})

describe('addPerpendicular', () => {
  it('appends a perpendicular constraint for two lines', () => {
    const next = addPerpendicular(twoLines(), createIdGen(50), 'L2', 'L5')
    const cs = next.sketch.constraints.filter((c) => c.kind === 'perpendicular')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ kind: 'perpendicular', l1: 'L2', l2: 'L5' })
  })
  it('dedups by the unordered pair {l1,l2}', () => {
    let doc = addPerpendicular(twoLines(), createIdGen(50), 'L2', 'L5')
    doc = addPerpendicular(doc, createIdGen(60), 'L5', 'L2')
    expect(doc.sketch.constraints.filter((c) => c.kind === 'perpendicular')).toHaveLength(1)
  })
  it('returns the same doc when a line is missing', () => {
    const doc = twoLines()
    expect(addPerpendicular(doc, createIdGen(), 'ghost', 'L5')).toBe(doc)
  })
})

describe('addEqualLength', () => {
  it('appends an equalLength constraint for two lines', () => {
    const next = addEqualLength(twoLines(), createIdGen(50), 'L2', 'L5')
    const cs = next.sketch.constraints.filter((c) => c.kind === 'equalLength')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ kind: 'equalLength', l1: 'L2', l2: 'L5' })
  })
  it('dedups by the unordered pair {l1,l2}', () => {
    let doc = addEqualLength(twoLines(), createIdGen(50), 'L2', 'L5')
    doc = addEqualLength(doc, createIdGen(60), 'L5', 'L2')
    expect(doc.sketch.constraints.filter((c) => c.kind === 'equalLength')).toHaveLength(1)
  })
  it('returns the same doc when a line is missing', () => {
    const doc = twoLines()
    expect(addEqualLength(doc, createIdGen(), 'L2', 'ghost')).toBe(doc)
  })
})

describe('addCoincident', () => {
  it('appends a coincident constraint between two points', () => {
    const next = addCoincident(twoLines(), createIdGen(50), 'p1', 'p3')
    const cs = next.sketch.constraints.filter((c) => c.kind === 'coincident')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ kind: 'coincident', a: 'p1', b: 'p3' })
  })
  it('dedups by the unordered pair {p1,p2}', () => {
    let doc = addCoincident(twoLines(), createIdGen(50), 'p1', 'p3')
    doc = addCoincident(doc, createIdGen(60), 'p3', 'p1') // swapped order, same pair
    expect(doc.sketch.constraints.filter((c) => c.kind === 'coincident')).toHaveLength(1)
  })
  it('ignores when the two ids are equal', () => {
    const doc = twoLines()
    expect(addCoincident(doc, createIdGen(), 'p1', 'p1')).toBe(doc)
  })
  it('returns the same doc when a point is missing', () => {
    const doc = twoLines()
    expect(addCoincident(doc, createIdGen(), 'p1', 'ghost')).toBe(doc)
  })
})

describe('addPointLineDistance', () => {
  it('appends a pointLineDistance constraint, rounding the value', () => {
    const next = addPointLineDistance(twoLines(), createIdGen(50), 'p1', 'L5', 2_000_000.6)
    const cs = next.sketch.constraints.filter((c) => c.kind === 'pointLineDistance')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ kind: 'pointLineDistance', point: 'p1', line: 'L5', value: 2_000_001 })
  })
  it('updates the value for the same {point,line} pair instead of duplicating', () => {
    let doc = addPointLineDistance(twoLines(), createIdGen(50), 'p1', 'L5', 2_000_000)
    doc = addPointLineDistance(doc, createIdGen(60), 'p1', 'L5', 5_000_000)
    const cs = doc.sketch.constraints.filter((c) => c.kind === 'pointLineDistance')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ value: 5_000_000 })
  })
  it('returns the same doc when the point or the line is missing', () => {
    const doc = twoLines()
    expect(addPointLineDistance(doc, createIdGen(), 'ghost', 'L5', 1_000_000)).toBe(doc)
    expect(addPointLineDistance(doc, createIdGen(), 'p1', 'ghost', 1_000_000)).toBe(doc)
  })
})
