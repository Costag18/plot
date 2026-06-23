import { describe, it, expect } from 'vitest'
import { PlaneGcsSolver } from '../src/planegcs-solver'
import {
  createDocument,
  createIdGen,
  addLineSegment,
  mergePoint,
  setPointFixed,
  setCornerAngle,
} from '@plot/document'
import { buildSolveRequest } from '@plot/core'

const M = 1_000_000

describe('PlaneGcsSolver angle constraint', () => {
  it('forces a ~45-degree corner to exactly 90 degrees', async () => {
    const gen = createIdGen(0)
    let doc = createDocument('m')

    // Line A: P=(0,0) -> A_far=(4M, 0). Far point fixed, so only B rotates.
    doc = addLineSegment(doc, gen, 0, 0, 4 * M, 0) // p0=P, p1=A_far, L2=lineA
    // Line B: its own vertex at (0,0) -> B_far=(3M, 3M) (~45 degrees from A).
    doc = addLineSegment(doc, gen, 0, 0, 3 * M, 3 * M) // p3=B_vertex, p4=B_far, L5=lineB

    // createIdGen is deterministic from 0.
    const P = 'p0'
    const aFar = 'p1'
    const lineA = 'L2'
    const bVertex = 'p3'
    const bFar = 'p4'
    const lineB = 'L5'

    // Merge B's vertex into P so both lines share a single corner vertex.
    doc = mergePoint(doc, P, bVertex)

    // Fix the vertex and line A's far endpoint so only B_far can move.
    doc = setPointFixed(doc, P, true)
    doc = setPointFixed(doc, aFar, true)

    // Constrain corner (A,B) at P to 90 degrees.
    doc = setCornerAngle(doc, gen, P, lineA, lineB, Math.PI / 2)

    const req = buildSolveRequest(doc.sketch)
    const solver = new PlaneGcsSolver()
    const result = await solver.solve(req)

    expect(result.status).toBe('ok')

    const byId = Object.fromEntries(result.points.map((p) => [p.id, p]))
    const p = byId[P]!
    const aF = byId[aFar]!
    const bF = byId[bFar]!

    // Angle between (A_far - P) and (B_far - P).
    const d1x = aF.x - p.x
    const d1y = aF.y - p.y
    const d2x = bF.x - p.x
    const d2y = bF.y - p.y
    const angle = Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y)
    const deg = (Math.abs(angle) * 180) / Math.PI

    expect(Math.abs(deg - 90)).toBeLessThan(0.5)
  }, 20_000)
})
