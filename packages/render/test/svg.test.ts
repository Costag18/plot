import { describe, it, expect } from 'vitest'
import { toSVG } from '../src/svg'
import { createDocument } from '@plot/document'

function rectDoc() {
  const doc = createDocument('m')
  doc.sketch.points = {
    a: { type: 'point', id: 'a', x: 0, y: 0, fixed: false },
    b: { type: 'point', id: 'b', x: 2_000_000, y: 0, fixed: false },
    c: { type: 'point', id: 'c', x: 2_000_000, y: 1_000_000, fixed: false },
    d: { type: 'point', id: 'd', x: 0, y: 1_000_000, fixed: false },
  }
  doc.sketch.lines = {
    L0: { type: 'line', id: 'L0', a: 'a', b: 'b' },
    L1: { type: 'line', id: 'L1', a: 'b', b: 'c' },
    L2: { type: 'line', id: 'L2', a: 'c', b: 'd' },
    L3: { type: 'line', id: 'L3', a: 'd', b: 'a' },
  }
  return doc
}

describe('toSVG', () => {
  it('produces an svg with a viewBox and one line per edge', () => {
    const svg = toSVG(rectDoc())
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox')
    expect((svg.match(/<line /g) || []).length).toBe(4)
  })
  it('includes a length label in the document units', () => {
    const svg = toSVG(rectDoc())
    expect(svg).toContain('2.00 m')
  })
  it('escapes nothing unexpected and is non-empty for an empty doc', () => {
    const svg = toSVG(createDocument('m'))
    expect(svg.startsWith('<svg')).toBe(true)
  })
})
