import { describe, it, expect } from 'vitest'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addLineSegment, addRectangle } from '../src/mutate'
import { rotateEntities } from '../src/select'

describe('rotateEntities', () => {
  it('rotating a single point 90° about the origin maps (1000,0) to (0,1000)', () => {
    // addLineSegment creates p0=(0,0), p1=(1000,0), L2
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 1000, 0)
    const next = rotateEntities(doc, ['L2'], 0, 0, Math.PI / 2)
    const line = next.sketch.lines.L2!
    const pa = next.sketch.points[line.a]!
    const pb = next.sketch.points[line.b]!
    // p0=(0,0) rotated 90° about origin stays (0,0)
    expect(pa).toMatchObject({ x: 0, y: 0 })
    // p1=(1000,0) rotated 90° about origin → (0,1000)
    expect(pb).toMatchObject({ x: 0, y: 1000 })
  })

  it('both endpoints of a line rotate correctly about a non-origin center', () => {
    // p0=(0,0), p1=(200,0), rotate 90° about (100,0)
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 200, 0)
    const next = rotateEntities(doc, ['L2'], 100, 0, Math.PI / 2)
    const line = next.sketch.lines.L2!
    const pa = next.sketch.points[line.a]! // was (0,0): dx=-100,dy=0 → (100+0, 0-100) = (100,-100)
    const pb = next.sketch.points[line.b]! // was (200,0): dx=100,dy=0 → (100+0, 0+100) = (100,100)
    expect(pa).toMatchObject({ x: 100, y: -100 })
    expect(pb).toMatchObject({ x: 100, y: 100 })
  })

  it('rotating a square rectangle 90° about its center maps corners correctly', () => {
    // addRectangle(doc, gen, x0, y0, x1, y1): corners at (0,0),(200,0),(200,200),(0,200)
    const doc = addRectangle(createDocument('m'), createIdGen(), 0, 0, 200, 200)
    const lineIds = Object.keys(doc.sketch.lines)
    const cx = 100
    const cy = 100
    const next = rotateEntities(doc, lineIds, cx, cy, Math.PI / 2)
    // A 200×200 square rotated 90° about its center stays a 200×200 square:
    // x-span = 200, y-span = 200
    const pts = Object.values(next.sketch.points)
    const xs = pts.map((p) => p.x).sort((a, b) => a - b)
    const ys = pts.map((p) => p.y).sort((a, b) => a - b)
    expect(xs[3]! - xs[0]!).toBe(200)
    expect(ys[3]! - ys[0]!).toBe(200)
    // distinct values are 0 and 200 (use Math.abs to normalise -0)
    const uniqueXs = [...new Set(xs.map((v) => Math.abs(v)))].sort((a, b) => a - b)
    const uniqueYs = [...new Set(ys.map((v) => Math.abs(v)))].sort((a, b) => a - b)
    expect(uniqueXs).toEqual([0, 200])
    expect(uniqueYs).toEqual([0, 200])
  })

  it('rotating a 4×3 rectangle 90° about its center swaps width and height footprint', () => {
    // corners at (0,0),(400,0),(400,300),(0,300), center=(200,150)
    const doc = addRectangle(createDocument('m'), createIdGen(), 0, 0, 400, 300)
    const lineIds = Object.keys(doc.sketch.lines)
    const cx = 200
    const cy = 150
    const next = rotateEntities(doc, lineIds, cx, cy, Math.PI / 2)
    // After 90° rotation the footprint becomes 3 wide × 4 tall (centered at same point)
    const xs = Object.values(next.sketch.points).map((p) => p.x).sort((a, b) => a - b)
    const ys = Object.values(next.sketch.points).map((p) => p.y).sort((a, b) => a - b)
    // width (x-span) = 300, height (y-span) = 400
    expect(xs[0]).toBe(xs[1])
    expect(xs[2]).toBe(xs[3])
    expect(xs[3]! - xs[0]!).toBe(300)
    expect(ys[3]! - ys[0]!).toBe(400)
  })

  it('points NOT in the selection are untouched', () => {
    // Two separate lines: L2=(p0,p1) and L5=(p3,p4)
    const gen = createIdGen()
    let doc = addLineSegment(createDocument('m'), gen, 0, 0, 100, 0) // p0,p1,L2
    doc = addLineSegment(doc, gen, 500, 500, 600, 500) // p3,p4,L5
    // Only rotate L2
    const next = rotateEntities(doc, ['L2'], 0, 0, Math.PI / 2)
    // L5's points must be untouched
    expect(next.sketch.points.p3).toMatchObject({ x: 500, y: 500 })
    expect(next.sketch.points.p4).toMatchObject({ x: 600, y: 500 })
    // L2's points must have moved
    expect(next.sketch.points.p1).toMatchObject({ x: 0, y: 100 })
  })

  it('rotating by 0 leaves coordinates unchanged', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 50)
    const next = rotateEntities(doc, ['L2'], 0, 0, 0)
    expect(next.sketch.points.p0).toMatchObject({ x: 0, y: 0 })
    expect(next.sketch.points.p1).toMatchObject({ x: 100, y: 50 })
  })
})
