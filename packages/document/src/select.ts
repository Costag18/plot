import type { PlotDocument } from './document'
import type { IdGen } from './ids'

type Sketch = PlotDocument['sketch']
type Constraint = Sketch['constraints'][number]

const round = (n: number): number => Math.round(n)

export function affectedPointIds(sketch: Sketch, ids: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    if (sketch.points[id]) out.add(id)
    const l = sketch.lines[id]
    if (l) {
      out.add(l.a)
      out.add(l.b)
    }
  }
  return out
}

export function translateEntities(doc: PlotDocument, ids: readonly string[], dx: number, dy: number): PlotDocument {
  const affected = affectedPointIds(doc.sketch, ids)
  const points = { ...doc.sketch.points }
  for (const id of affected) {
    const p = points[id]
    if (!p) continue
    points[id] = { ...p, x: round(p.x + dx), y: round(p.y + dy) }
  }
  return { ...doc, sketch: { ...doc.sketch, points } }
}

export function allSelectableIds(sketch: Sketch): string[] {
  return [...Object.keys(sketch.points), ...Object.keys(sketch.lines)]
}

export function duplicateEntities(
  doc: PlotDocument,
  gen: IdGen,
  ids: readonly string[],
  dx: number,
  dy: number,
): { doc: PlotDocument; newIds: string[] } {
  const s = doc.sketch
  const newIds: string[] = []

  // 1. clone the affected points
  const pointMap = new Map<string, string>()
  const points = { ...s.points }
  for (const oldId of affectedPointIds(s, ids)) {
    const p = s.points[oldId]
    if (!p) continue
    const nid = gen('p')
    pointMap.set(oldId, nid)
    points[nid] = { ...p, id: nid, x: round(p.x + dx), y: round(p.y + dy) }
    newIds.push(nid)
  }

  // 2. clone selected lines whose both endpoints were cloned
  const lineMap = new Map<string, string>()
  const lines = { ...s.lines }
  for (const oldId of ids) {
    const l = s.lines[oldId]
    if (!l) continue
    const a = pointMap.get(l.a)
    const b = pointMap.get(l.b)
    if (!a || !b) continue
    const nid = gen('L')
    lineMap.set(oldId, nid)
    lines[nid] = { type: 'line', id: nid, a, b }
    newIds.push(nid)
  }

  // 3. clone constraints fully inside the cloned set
  const constraints = [...s.constraints]
  for (const c of s.constraints) {
    const cloned = cloneConstraint(c, pointMap, lineMap, gen)
    if (cloned) {
      constraints.push(cloned)
      newIds.push(cloned.id)
    }
  }

  return { doc: { ...doc, sketch: { points, lines, constraints } }, newIds }
}

function cloneConstraint(
  c: Constraint,
  pointMap: Map<string, string>,
  lineMap: Map<string, string>,
  gen: IdGen,
): Constraint | null {
  switch (c.kind) {
    case 'coincident': {
      const a = pointMap.get(c.a)
      const b = pointMap.get(c.b)
      return a && b ? { id: gen('c'), kind: 'coincident', a, b } : null
    }
    case 'horizontal':
    case 'vertical': {
      const line = lineMap.get(c.line)
      return line ? { id: gen('c'), kind: c.kind, line } : null
    }
    case 'distance': {
      const line = lineMap.get(c.line)
      return line ? { id: gen('c'), kind: 'distance', line, value: c.value } : null
    }
    case 'parallel':
    case 'perpendicular':
    case 'equalLength': {
      const l1 = lineMap.get(c.l1)
      const l2 = lineMap.get(c.l2)
      return l1 && l2 ? { id: gen('c'), kind: c.kind, l1, l2 } : null
    }
    case 'angle': {
      const l1 = lineMap.get(c.l1)
      const l2 = lineMap.get(c.l2)
      const vertex = pointMap.get(c.vertex)
      return l1 && l2 && vertex
        ? { id: gen('c'), kind: 'angle', l1, l2, vertex, value: c.value }
        : null
    }
  }
}
