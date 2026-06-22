import { describe, it, expect } from 'vitest'
import { buildSolveRequest } from '../src/translate'
import type { Sketch } from '../src/sketch'

const base: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 3000, y: 100, fixed: false },
    p2: { type: 'point', id: 'p2', x: 3100, y: 2000, fixed: false },
  },
  lines: {
    L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' },
    L1: { type: 'line', id: 'L1', a: 'p1', b: 'p2' },
  },
  constraints: [],
}

describe('buildSolveRequest', () => {
  it('maps every point with its fixed flag', () => {
    const req = buildSolveRequest(base)
    expect(req.points).toContainEqual({ id: 'p0', x: 0, y: 0, fixed: true })
    expect(req.points).toContainEqual({ id: 'p1', x: 3000, y: 100, fixed: false })
    expect(req.points).toHaveLength(3)
  })

  it('expands a horizontal line constraint into its endpoints', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'horizontal', line: 'L0' }],
    })
    expect(req.constraints).toEqual([{ kind: 'horizontal', p1: 'p0', p2: 'p1' }])
  })

  it('expands a distance line constraint with its value', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'distance', line: 'L0', value: 3_000_000 }],
    })
    expect(req.constraints).toEqual([
      { kind: 'distance', p1: 'p0', p2: 'p1', value: 3_000_000 },
    ])
  })

  it('expands parallel between two lines into endpoint pairs', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'parallel', l1: 'L0', l2: 'L1' }],
    })
    expect(req.constraints).toEqual([
      { kind: 'parallel', l1: ['p0', 'p1'], l2: ['p1', 'p2'] },
    ])
  })

  it('passes a coincident point constraint through unchanged', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'coincident', a: 'p1', b: 'p2' }],
    })
    expect(req.constraints).toEqual([{ kind: 'coincident', a: 'p1', b: 'p2' }])
  })

  it('skips a constraint that references a missing line', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'horizontal', line: 'NOPE' }],
    })
    expect(req.constraints).toEqual([])
  })

  it('expands a vertical line constraint into its endpoints', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'vertical', line: 'L0' }],
    })
    expect(req.constraints).toEqual([{ kind: 'vertical', p1: 'p0', p2: 'p1' }])
  })

  it('expands perpendicular between two lines into endpoint pairs', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'perpendicular', l1: 'L0', l2: 'L1' }],
    })
    expect(req.constraints).toEqual([
      { kind: 'perpendicular', l1: ['p0', 'p1'], l2: ['p1', 'p2'] },
    ])
  })

  it('expands equalLength between two lines into endpoint pairs', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'equalLength', l1: 'L0', l2: 'L1' }],
    })
    expect(req.constraints).toEqual([
      { kind: 'equalLength', l1: ['p0', 'p1'], l2: ['p1', 'p2'] },
    ])
  })
})
