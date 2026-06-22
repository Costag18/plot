import type { Sketch } from './sketch'
import type { ISolver, SolveResult } from './solver'
import { buildSolveRequest } from './translate'

export function applySolveResult(sketch: Sketch, result: SolveResult): Sketch {
  if (result.status !== 'ok') return sketch
  const points = { ...sketch.points }
  for (const sp of result.points) {
    const existing = points[sp.id]
    if (!existing) continue
    points[sp.id] = { ...existing, x: Math.round(sp.x), y: Math.round(sp.y) }
  }
  return { ...sketch, points }
}

export async function solveSketch(sketch: Sketch, solver: ISolver): Promise<Sketch> {
  const request = buildSolveRequest(sketch)
  const result = await solver.solve(request)
  return applySolveResult(sketch, result)
}
