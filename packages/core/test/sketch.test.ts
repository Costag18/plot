import { describe, it, expect } from 'vitest'
import { emptySketch } from '../src/sketch'
import type { Sketch } from '../src/sketch'

describe('sketch', () => {
  it('creates an empty sketch', () => {
    const s = emptySketch()
    expect(s).toEqual({ points: {}, lines: {}, constraints: [] })
  })

  it('accepts a hand-built sketch with a point and a line', () => {
    const s: Sketch = {
      points: {
        p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
        p1: { type: 'point', id: 'p1', x: 1000, y: 0, fixed: false },
      },
      lines: { L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' } },
      constraints: [{ id: 'c0', kind: 'horizontal', line: 'L0' }],
    }
    expect(Object.keys(s.points)).toHaveLength(2)
    expect(s.lines.L0?.a).toBe('p0')
  })
})
