import type { Sketch, LineEntity } from './sketch'
import type { SolveRequest, SolveConstraint } from './solver'

const endpoints = (line: LineEntity): [string, string] => [line.a, line.b]

export function buildSolveRequest(sketch: Sketch): SolveRequest {
  const points = Object.values(sketch.points).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    fixed: p.fixed,
  }))

  const constraints: SolveConstraint[] = []
  for (const c of sketch.constraints) {
    switch (c.kind) {
      case 'coincident':
        constraints.push({ kind: 'coincident', a: c.a, b: c.b })
        break
      case 'horizontal': {
        const l = sketch.lines[c.line]
        if (l) constraints.push({ kind: 'horizontal', p1: l.a, p2: l.b })
        break
      }
      case 'vertical': {
        const l = sketch.lines[c.line]
        if (l) constraints.push({ kind: 'vertical', p1: l.a, p2: l.b })
        break
      }
      case 'distance': {
        const l = sketch.lines[c.line]
        if (l) constraints.push({ kind: 'distance', p1: l.a, p2: l.b, value: c.value })
        break
      }
      case 'parallel': {
        const a = sketch.lines[c.l1]
        const b = sketch.lines[c.l2]
        if (a && b) constraints.push({ kind: 'parallel', l1: endpoints(a), l2: endpoints(b) })
        break
      }
      case 'perpendicular': {
        const a = sketch.lines[c.l1]
        const b = sketch.lines[c.l2]
        if (a && b) constraints.push({ kind: 'perpendicular', l1: endpoints(a), l2: endpoints(b) })
        break
      }
      case 'equalLength': {
        const a = sketch.lines[c.l1]
        const b = sketch.lines[c.l2]
        if (a && b) constraints.push({ kind: 'equalLength', l1: endpoints(a), l2: endpoints(b) })
        break
      }
    }
  }

  return { points, constraints }
}
