import { describe, it, expect } from 'vitest'
import { hitTest } from '../src/hittest'
import type { Sketch } from '@plot/core'

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 100, y: 0, fixed: false },
  },
  lines: { L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' } },
  constraints: [],
}

describe('hitTest', () => {
  it('returns null when nothing is within tolerance', () => {
    expect(hitTest(sketch, { x: 50, y: 50 }, 5)).toBeNull()
  })

  it('hits a point when within tolerance', () => {
    expect(hitTest(sketch, { x: 2, y: 1 }, 5)).toEqual({ kind: 'point', id: 'p0' })
  })

  it('prefers a point over a line when both are in range', () => {
    expect(hitTest(sketch, { x: 100, y: 2 }, 10)).toEqual({ kind: 'point', id: 'p1' })
  })

  it('hits the line segment between endpoints', () => {
    expect(hitTest(sketch, { x: 50, y: 3 }, 5)).toEqual({ kind: 'line', id: 'L0' })
  })

  it('does not hit the infinite extension beyond the segment', () => {
    expect(hitTest(sketch, { x: 200, y: 0 }, 5)).toBeNull()
  })
})
