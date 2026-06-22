import { describe, it, expect } from 'vitest'
import { inferAxis, snapPoint } from '../src/infer'
import type { Sketch } from '@plot/core'

describe('inferAxis', () => {
  it('detects near-horizontal within tolerance', () => {
    expect(inferAxis(0, 0, 100, 2)).toBe('horizontal')
    expect(inferAxis(0, 0, 100, 0)).toBe('horizontal')
    expect(inferAxis(0, 0, -100, 1)).toBe('horizontal')
  })
  it('detects near-vertical within tolerance', () => {
    expect(inferAxis(0, 0, 2, 100)).toBe('vertical')
  })
  it('returns null for diagonal lines', () => {
    expect(inferAxis(0, 0, 100, 100)).toBeNull()
  })
  it('returns null for a zero-length segment', () => {
    expect(inferAxis(5, 5, 5, 5)).toBeNull()
  })
})

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: false },
    p1: { type: 'point', id: 'p1', x: 1000, y: 0, fixed: false },
  },
  lines: {},
  constraints: [],
}

describe('snapPoint', () => {
  it('returns the nearest point within tolerance', () => {
    expect(snapPoint(sketch, { x: 30, y: 0 }, 50)).toBe('p0')
  })
  it('returns null when none in range', () => {
    expect(snapPoint(sketch, { x: 500, y: 500 }, 50)).toBeNull()
  })
  it('excludes given ids', () => {
    expect(snapPoint(sketch, { x: 10, y: 0 }, 50, new Set(['p0']))).toBeNull()
  })
})
