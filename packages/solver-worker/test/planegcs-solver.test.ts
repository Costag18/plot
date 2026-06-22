import { describe, it, expect } from 'vitest'
import { PlaneGcsSolver } from '../src/planegcs-solver'
import type { SolveRequest } from '@plot/core'

const M = 1_000_000

function roughQuad(): SolveRequest {
  return {
    points: [
      { id: 'p0', x: 0, y: 0, fixed: true },
      { id: 'p1', x: 2_800_000, y: 50_000, fixed: false },
      { id: 'p2', x: 2_900_000, y: 2_100_000, fixed: false },
      { id: 'p3', x: 20_000, y: 1_950_000, fixed: false },
    ],
    constraints: [
      { kind: 'horizontal', p1: 'p0', p2: 'p1' },
      { kind: 'distance', p1: 'p0', p2: 'p1', value: 3 * M },
      { kind: 'distance', p1: 'p3', p2: 'p0', value: 2 * M },
      { kind: 'perpendicular', l1: ['p0', 'p1'], l2: ['p3', 'p0'] },
      { kind: 'parallel', l1: ['p0', 'p1'], l2: ['p2', 'p3'] },
      { kind: 'parallel', l1: ['p3', 'p0'], l2: ['p1', 'p2'] },
    ],
  }
}

const near = (a: number, b: number, tol = 2000) => Math.abs(a - b) <= tol

describe('PlaneGcsSolver', () => {
  it('solves a rough quad into an exact 3x2 m rectangle', async () => {
    const solver = new PlaneGcsSolver()
    const result = await solver.solve(roughQuad())

    expect(result.status).toBe('ok')
    const byId = Object.fromEntries(result.points.map((p) => [p.id, p]))

    expect(near(byId.p0!.x, 0)).toBe(true)
    expect(near(byId.p0!.y, 0)).toBe(true)
    expect(near(byId.p1!.x, 3 * M)).toBe(true)
    expect(near(byId.p1!.y, 0)).toBe(true)
    expect(near(byId.p3!.x, 0)).toBe(true)
    expect(near(byId.p3!.y, 2 * M)).toBe(true)
    expect(near(byId.p2!.x, 3 * M)).toBe(true)
    expect(near(byId.p2!.y, 2 * M)).toBe(true)
  }, 20_000)
})
