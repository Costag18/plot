import type { PlotDocument } from './document'
import type { IdGen } from './ids'

type Sketch = PlotDocument['sketch']
type Constraint = Sketch['constraints'][number]

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
      ...doc.sketch,
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
    case 'angle':
      return c.l1 === lineId || c.l2 === lineId
    case 'pointLineDistance':
      return c.line === lineId
    case 'coincident':
      return false
  }
}

/**
 * Current signed corner angle (radians, atan2-based) from edge l1 to edge l2 at
 * the shared vertex, where each edge direction points from the vertex toward the
 * line's other endpoint. Returns null if either line does not touch the vertex or
 * a referenced point is missing.
 */
export function cornerAngleOf(
  sketch: Sketch,
  vertex: string,
  l1: string,
  l2: string,
): number | null {
  const P = sketch.points[vertex]
  const a = sketch.lines[l1]
  const b = sketch.lines[l2]
  if (!P || !a || !b) return null

  const otherEndpoint = (line: typeof a): string | null => {
    if (line.a === vertex) return line.b
    if (line.b === vertex) return line.a
    return null
  }
  const o1Id = otherEndpoint(a)
  const o2Id = otherEndpoint(b)
  if (!o1Id || !o2Id) return null

  const o1 = sketch.points[o1Id]
  const o2 = sketch.points[o2Id]
  if (!o1 || !o2) return null

  const d1x = o1.x - P.x
  const d1y = o1.y - P.y
  const d2x = o2.x - P.x
  const d2y = o2.y - P.y
  return Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y)
}

/**
 * Constrain the corner angle (signed radians) between lines l1 and l2 at the shared
 * vertex. If an angle constraint already exists for the same unordered pair {l1,l2}
 * at the same vertex, its value is updated; otherwise a new constraint is appended.
 * Returns the document unchanged if either line or the vertex is missing.
 */
export function setCornerAngle(
  doc: PlotDocument,
  gen: IdGen,
  vertex: string,
  l1: string,
  l2: string,
  valueRad: number,
): PlotDocument {
  const s = doc.sketch
  if (!s.points[vertex] || !s.lines[l1] || !s.lines[l2]) return doc

  const samePair = (c: Constraint): boolean =>
    c.kind === 'angle' &&
    c.vertex === vertex &&
    ((c.l1 === l1 && c.l2 === l2) || (c.l1 === l2 && c.l2 === l1))

  const idx = s.constraints.findIndex(samePair)
  if (idx >= 0) {
    const constraints = s.constraints.map((c, i) =>
      i === idx && c.kind === 'angle' ? { ...c, value: valueRad } : c,
    )
    return { ...doc, sketch: { ...s, constraints } }
  }
  const c: Constraint = { id: gen('c'), kind: 'angle', l1, l2, vertex, value: valueRad }
  return { ...doc, sketch: { ...s, constraints: [...s.constraints, c] } }
}

export function addAxisConstraint(
  doc: PlotDocument,
  gen: IdGen,
  lineId: string,
  axis: 'horizontal' | 'vertical',
): PlotDocument {
  if (!doc.sketch.lines[lineId]) return doc
  const exists = doc.sketch.constraints.some((c) => c.kind === axis && 'line' in c && c.line === lineId)
  if (exists) return doc
  const c: Constraint = { id: gen('c'), kind: axis, line: lineId }
  return { ...doc, sketch: { ...doc.sketch, constraints: [...doc.sketch.constraints, c] } }
}

export function setLineLength(doc: PlotDocument, gen: IdGen, lineId: string, valueUm: number): PlotDocument {
  if (!doc.sketch.lines[lineId]) return doc
  const value = round(valueUm)
  const idx = doc.sketch.constraints.findIndex((c) => c.kind === 'distance' && 'line' in c && c.line === lineId)
  if (idx >= 0) {
    const constraints = doc.sketch.constraints.map((c, i) =>
      i === idx && c.kind === 'distance' ? { ...c, value } : c,
    )
    return { ...doc, sketch: { ...doc.sketch, constraints } }
  }
  const c: Constraint = { id: gen('c'), kind: 'distance', line: lineId, value }
  return { ...doc, sketch: { ...doc.sketch, constraints: [...doc.sketch.constraints, c] } }
}

/**
 * Add a constraint between two lines (parallel / perpendicular / equalLength).
 * Both lines must exist; returns the document unchanged if either is missing or a
 * constraint of the same kind already exists for the unordered pair {l1,l2}.
 */
function addLinePairConstraint(
  doc: PlotDocument,
  gen: IdGen,
  kind: 'parallel' | 'perpendicular' | 'equalLength',
  l1: string,
  l2: string,
): PlotDocument {
  const s = doc.sketch
  if (!s.lines[l1] || !s.lines[l2]) return doc
  const exists = s.constraints.some(
    (c) =>
      c.kind === kind &&
      ((c.l1 === l1 && c.l2 === l2) || (c.l1 === l2 && c.l2 === l1)),
  )
  if (exists) return doc
  const c: Constraint = { id: gen('c'), kind, l1, l2 }
  return { ...doc, sketch: { ...s, constraints: [...s.constraints, c] } }
}

export function addParallel(doc: PlotDocument, gen: IdGen, l1: string, l2: string): PlotDocument {
  return addLinePairConstraint(doc, gen, 'parallel', l1, l2)
}

export function addPerpendicular(doc: PlotDocument, gen: IdGen, l1: string, l2: string): PlotDocument {
  return addLinePairConstraint(doc, gen, 'perpendicular', l1, l2)
}

export function addEqualLength(doc: PlotDocument, gen: IdGen, l1: string, l2: string): PlotDocument {
  return addLinePairConstraint(doc, gen, 'equalLength', l1, l2)
}

/**
 * Add a coincident constraint between two points. Both points must exist; returns
 * the document unchanged if either is missing, the ids are equal, or a coincident
 * constraint already exists for the unordered pair {p1,p2}.
 */
export function addCoincident(doc: PlotDocument, gen: IdGen, p1: string, p2: string): PlotDocument {
  if (p1 === p2) return doc
  const s = doc.sketch
  if (!s.points[p1] || !s.points[p2]) return doc
  const exists = s.constraints.some(
    (c) =>
      c.kind === 'coincident' &&
      ((c.a === p1 && c.b === p2) || (c.a === p2 && c.b === p1)),
  )
  if (exists) return doc
  const c: Constraint = { id: gen('c'), kind: 'coincident', a: p1, b: p2 }
  return { ...doc, sketch: { ...s, constraints: [...s.constraints, c] } }
}

/**
 * Constrain the perpendicular distance (µm, ≥ 0) from a point to a line. If a
 * pointLineDistance constraint already exists for the same {point,line} pair its
 * value is updated; otherwise a new constraint is appended. Returns the document
 * unchanged if the point or the line is missing.
 */
export function addPointLineDistance(
  doc: PlotDocument,
  gen: IdGen,
  point: string,
  line: string,
  valueUm: number,
): PlotDocument {
  const s = doc.sketch
  if (!s.points[point] || !s.lines[line]) return doc
  const value = round(valueUm)
  const idx = s.constraints.findIndex(
    (c) => c.kind === 'pointLineDistance' && c.point === point && c.line === line,
  )
  if (idx >= 0) {
    const constraints = s.constraints.map((c, i) =>
      i === idx && c.kind === 'pointLineDistance' ? { ...c, value } : c,
    )
    return { ...doc, sketch: { ...s, constraints } }
  }
  const c: Constraint = { id: gen('c'), kind: 'pointLineDistance', point, line, value }
  return { ...doc, sketch: { ...s, constraints: [...s.constraints, c] } }
}

export function mergePoint(doc: PlotDocument, keepId: string, dropId: string): PlotDocument {
  if (keepId === dropId) return doc
  const s = doc.sketch
  if (!s.points[keepId] || !s.points[dropId]) return doc

  const lines: typeof s.lines = {}
  for (const [id, l] of Object.entries(s.lines)) {
    const a = l.a === dropId ? keepId : l.a
    const b = l.b === dropId ? keepId : l.b
    if (a === b) continue // degenerate line collapses
    lines[id] = { ...l, a, b }
  }
  const removedLineIds = new Set(Object.keys(s.lines).filter((id) => !lines[id]))

  const points = { ...s.points }
  delete points[dropId]

  const constraints: Constraint[] = []
  for (const c of s.constraints) {
    if (c.kind === 'coincident') {
      const a = c.a === dropId ? keepId : c.a
      const b = c.b === dropId ? keepId : c.b
      if (a === b) continue
      constraints.push({ ...c, a, b })
    } else if (![...removedLineIds].some((lid) => refsLine(c, lid))) {
      constraints.push(c)
    }
  }
  return { ...doc, sketch: { points, lines, constraints } }
}

export function addPolygon(
  doc: PlotDocument,
  gen: IdGen,
  pts: ReadonlyArray<{ x: number; y: number }>,
  closed: boolean,
): { doc: PlotDocument; newIds: string[] } {
  if (pts.length < 2) return { doc, newIds: [] }
  const newIds: string[] = []
  const points = { ...doc.sketch.points }
  const ids: string[] = []
  for (const p of pts) {
    const id = gen('p')
    points[id] = { type: 'point', id, x: round(p.x), y: round(p.y), fixed: false }
    ids.push(id)
    newIds.push(id)
  }
  const lines = { ...doc.sketch.lines }
  const edgeCount = closed ? pts.length : pts.length - 1
  for (let i = 0; i < edgeCount; i++) {
    const a = ids[i]!
    const b = ids[(i + 1) % ids.length]!
    const id = gen('L')
    lines[id] = { type: 'line', id, a, b }
    newIds.push(id)
  }
  return { doc: { ...doc, sketch: { ...doc.sketch, points, lines } }, newIds }
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
