import { describe, it, expect } from 'vitest'
import { createDocument, serializeDocument, parseDocument, DocumentSchema } from '../src/document'

describe('document', () => {
  it('creates a versioned empty document with the chosen unit', () => {
    const doc = createDocument('m')
    expect(doc.version).toBe(1)
    expect(doc.units).toBe('m')
    expect(doc.sketch).toEqual({ points: {}, lines: {}, constraints: [] })
  })

  it('round-trips through serialize/parse', () => {
    const doc = createDocument('cm')
    doc.sketch.points.p0 = { type: 'point', id: 'p0', x: 0, y: 0, fixed: true }
    doc.sketch.points.p1 = { type: 'point', id: 'p1', x: 1000, y: 0, fixed: false }
    doc.sketch.lines.L0 = { type: 'line', id: 'L0', a: 'p0', b: 'p1' }
    doc.sketch.constraints.push({ id: 'c0', kind: 'horizontal', line: 'L0' })
    const parsed = parseDocument(serializeDocument(doc))
    expect(parsed).toEqual(doc)
  })

  it('rejects malformed json with a Zod error', () => {
    expect(() => parseDocument('{"version":1,"units":"furlongs","sketch":{}}')).toThrow()
  })

  it('exposes a schema whose parse accepts a valid document', () => {
    const doc = createDocument('mm')
    expect(() => DocumentSchema.parse(doc)).not.toThrow()
  })
})
