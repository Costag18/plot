import { describe, it, expect } from 'vitest'
import { applySolveResult, applySolvedPoints, solveSketch } from '../src/apply'
import { emptySketch } from '../src/sketch'
import type { Sketch } from '../src/sketch'
import type { ISolver, SolveResult } from '../src/solver'

const sketch = (): Sketch => ({
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 10, y: 10, fixed: false },
  },
  lines: {},
  constraints: [],
})

describe('applySolvedPoints', () => {
  it('applies rounded coords to matching points', () => {
    const next = applySolvedPoints(sketch(), [{ id: 'p1', x: 2_999_999.6, y: 0.4 }])
    expect(next.points.p1).toEqual({ type: 'point', id: 'p1', x: 3_000_000, y: 0, fixed: false })
  })

  it('ignores unknown ids and leaves other points untouched', () => {
    const s = sketch()
    const next = applySolvedPoints(s, [{ id: 'ghost', x: 5, y: 5 }])
    expect(next.points.ghost).toBeUndefined()
    expect(next.points.p0).toEqual(s.points.p0)
    expect(next.points.p1).toEqual(s.points.p1)
  })

  it('leaves points not in the solved list untouched', () => {
    const s = sketch()
    const next = applySolvedPoints(s, [{ id: 'p1', x: 1_000_000, y: 2_000_000 }])
    expect(next.points.p0).toEqual(s.points.p0)
    expect(next.points.p1?.x).toBe(1_000_000)
  })
})

describe('applySolveResult', () => {
  it('updates point coordinates, rounding to whole micrometers', () => {
    const result: SolveResult = {
      status: 'ok',
      points: [{ id: 'p1', x: 2_999_999.6, y: 0.4 }],
    }
    const next = applySolveResult(sketch(), result)
    expect(next.points.p1).toEqual({ type: 'point', id: 'p1', x: 3_000_000, y: 0, fixed: false })
  })

  it('returns the input unchanged when the solve failed', () => {
    const s = sketch()
    const result: SolveResult = { status: 'failed', points: [] }
    expect(applySolveResult(s, result)).toBe(s)
  })

  it('ignores result points that are not in the sketch', () => {
    const next = applySolveResult(sketch(), { status: 'ok', points: [{ id: 'ghost', x: 1, y: 1 }] })
    expect(next.points.ghost).toBeUndefined()
  })
})

describe('solveSketch', () => {
  it('builds a request, calls the solver, and applies the result', async () => {
    let received = 0
    const fake: ISolver = {
      async solve(req) {
        received = req.points.length
        return { status: 'ok', points: [{ id: 'p1', x: 5_000_000, y: 0 }] }
      },
    }
    const next = await solveSketch(sketch(), fake)
    expect(received).toBe(2)
    expect(next.points.p1?.x).toBe(5_000_000)
  })

  it('returns an empty sketch unchanged through a no-op solver', async () => {
    const fake: ISolver = { async solve() { return { status: 'ok', points: [] } } }
    const next = await solveSketch(emptySketch(), fake)
    expect(next).toEqual(emptySketch())
  })
})
