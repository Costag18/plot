import { describe, it, expect } from 'vitest'
import { connectedPointIds } from '../src/select'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addRectangle, addLineSegment } from '../src/mutate'

function rect() {
  // addRectangle produces: p0..p3 (corners), L4..L7 (edges), c8..c11 (constraints)
  return addRectangle(createDocument('m'), createIdGen(), 0, 0, 400, 200)
}

describe('connectedPointIds', () => {
  it('returns all 4 corner ids when seeded from any edge of a rectangle', () => {
    const doc = rect()
    const ids = connectedPointIds(doc.sketch, 'L4')
    expect([...ids].sort()).toEqual(['p0', 'p1', 'p2', 'p3'])
  })

  it('returns the same set regardless of which rectangle edge is used as seed', () => {
    const doc = rect()
    const fromL5 = connectedPointIds(doc.sketch, 'L5')
    const fromL6 = connectedPointIds(doc.sketch, 'L6')
    const fromL7 = connectedPointIds(doc.sketch, 'L7')
    expect([...fromL5].sort()).toEqual(['p0', 'p1', 'p2', 'p3'])
    expect([...fromL6].sort()).toEqual(['p0', 'p1', 'p2', 'p3'])
    expect([...fromL7].sort()).toEqual(['p0', 'p1', 'p2', 'p3'])
  })

  it('returns only the 2 endpoints of an isolated segment (two separate segments)', () => {
    // First segment: p0, p1, L2
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    // Second segment: p3, p4, L5 (using a fresh idgen seeded at 3 to avoid collision)
    doc = addLineSegment(doc, createIdGen(3), 200, 0, 300, 0)
    // Seed from first segment — should not reach second segment's points
    const ids = connectedPointIds(doc.sketch, 'L2')
    expect([...ids].sort()).toEqual(['p0', 'p1'])
  })

  it('returns an empty set when the seed line id is missing', () => {
    const doc = rect()
    const ids = connectedPointIds(doc.sketch, 'nonexistent')
    expect(ids.size).toBe(0)
  })

  it('returns an empty set on an empty sketch', () => {
    const doc = createDocument('m')
    const ids = connectedPointIds(doc.sketch, 'L0')
    expect(ids.size).toBe(0)
  })
})
