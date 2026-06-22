import type { PlotDocument } from './document'
import type { IdGen } from './ids'

type Constraint = PlotDocument['sketch']['constraints'][number]

const round = (n: number): number => Math.round(n)

export function addLineSegment(
  doc: PlotDocument,
  gen: IdGen,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): PlotDocument {
  const a = { type: 'point' as const, id: gen('p'), x: round(ax), y: round(ay), fixed: false }
  const b = { type: 'point' as const, id: gen('p'), x: round(bx), y: round(by), fixed: false }
  const l = { type: 'line' as const, id: gen('L'), a: a.id, b: b.id }
  return {
    ...doc,
    sketch: {
      ...doc.sketch,
      points: { ...doc.sketch.points, [a.id]: a, [b.id]: b },
      lines: { ...doc.sketch.lines, [l.id]: l },
    },
  }
}

export function addRectangle(
  doc: PlotDocument,
  gen: IdGen,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PlotDocument {
  const minX = round(Math.min(x0, x1))
  const maxX = round(Math.max(x0, x1))
  const minY = round(Math.min(y0, y1))
  const maxY = round(Math.max(y0, y1))

  const p0 = { type: 'point' as const, id: gen('p'), x: minX, y: minY, fixed: false }
  const p1 = { type: 'point' as const, id: gen('p'), x: maxX, y: minY, fixed: false }
  const p2 = { type: 'point' as const, id: gen('p'), x: maxX, y: maxY, fixed: false }
  const p3 = { type: 'point' as const, id: gen('p'), x: minX, y: maxY, fixed: false }

  const L0 = { type: 'line' as const, id: gen('L'), a: p0.id, b: p1.id }
  const L1 = { type: 'line' as const, id: gen('L'), a: p1.id, b: p2.id }
  const L2 = { type: 'line' as const, id: gen('L'), a: p2.id, b: p3.id }
  const L3 = { type: 'line' as const, id: gen('L'), a: p3.id, b: p0.id }

  const cs: Constraint[] = [
    { id: gen('c'), kind: 'horizontal', line: L0.id },
    { id: gen('c'), kind: 'horizontal', line: L2.id },
    { id: gen('c'), kind: 'vertical', line: L1.id },
    { id: gen('c'), kind: 'vertical', line: L3.id },
  ]

  return {
    ...doc,
    sketch: {
      points: { ...doc.sketch.points, [p0.id]: p0, [p1.id]: p1, [p2.id]: p2, [p3.id]: p3 },
      lines: { ...doc.sketch.lines, [L0.id]: L0, [L1.id]: L1, [L2.id]: L2, [L3.id]: L3 },
      constraints: [...doc.sketch.constraints, ...cs],
    },
  }
}

export function movePoint(doc: PlotDocument, id: string, x: number, y: number): PlotDocument {
  const p = doc.sketch.points[id]
  if (!p) return doc
  return {
    ...doc,
    sketch: { ...doc.sketch, points: { ...doc.sketch.points, [id]: { ...p, x: round(x), y: round(y) } } },
  }
}

export function setPointFixed(doc: PlotDocument, id: string, fixed: boolean): PlotDocument {
  const p = doc.sketch.points[id]
  if (!p) return doc
  return {
    ...doc,
    sketch: { ...doc.sketch, points: { ...doc.sketch.points, [id]: { ...p, fixed } } },
  }
}

function refsLine(c: Constraint, lineId: string): boolean {
  switch (c.kind) {
    case 'horizontal':
    case 'vertical':
    case 'distance':
      return c.line === lineId
    case 'parallel':
    case 'perpendicular':
    case 'equalLength':
      return c.l1 === lineId || c.l2 === lineId
    case 'coincident':
      return false
  }
}

export function deleteEntity(doc: PlotDocument, id: string): PlotDocument {
  const s = doc.sketch

  if (s.points[id]) {
    const removedLineIds = new Set(
      Object.values(s.lines).filter((l) => l.a === id || l.b === id).map((l) => l.id),
    )
    const points = { ...s.points }
    delete points[id]
    const lines = Object.fromEntries(Object.entries(s.lines).filter(([lid]) => !removedLineIds.has(lid)))
    const constraints = s.constraints.filter((c) => {
      if (c.kind === 'coincident') return c.a !== id && c.b !== id
      return ![...removedLineIds].some((lid) => refsLine(c, lid))
    })
    return { ...doc, sketch: { points, lines, constraints } }
  }

  if (s.lines[id]) {
    const lines = { ...s.lines }
    delete lines[id]
    const constraints = s.constraints.filter((c) => !refsLine(c, id))
    return { ...doc, sketch: { ...s, lines, constraints } }
  }

  return doc
}
