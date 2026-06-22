import { describe, it, expect } from 'vitest'
import { boundsOf } from '../src/bounds'
import type { Sketch } from '@plot/core'

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: -100, y: 50, fixed: false },
    p1: { type: 'point', id: 'p1', x: 300, y: 200, fixed: false },
  },
  lines: {},
  constraints: [],
}

describe('boundsOf', () => {
  it('computes the min/max box over all points', () => {
    expect(boundsOf(sketch)).toEqual({ minX: -100, minY: 50, maxX: 300, maxY: 200 })
  })
  it('returns a small default box for an empty sketch', () => {
    const b = boundsOf({ points: {}, lines: {}, constraints: [] })
    expect(b.maxX).toBeGreaterThan(b.minX)
    expect(b.maxY).toBeGreaterThan(b.minY)
  })
})
