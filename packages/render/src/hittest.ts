import { distance } from '@plot/core'
import type { Sketch, Vec2 } from '@plot/core'

export type Hit = { kind: 'point'; id: string } | { kind: 'line'; id: string }

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

export function hitTest(sketch: Sketch, world: Vec2, tolWorld: number): Hit | null {
  let best: { d: number; hit: Hit } | null = null

  for (const p of Object.values(sketch.points)) {
    const d = distance(world, p)
    if (d <= tolWorld && (best === null || d < best.d)) best = { d, hit: { kind: 'point', id: p.id } }
  }
  if (best !== null) return best.hit

  for (const l of Object.values(sketch.lines)) {
    const a = sketch.points[l.a]
    const b = sketch.points[l.b]
    if (!a || !b) continue
    const d = pointSegmentDistance(world, a, b)
    if (d <= tolWorld && (best === null || d < best.d)) best = { d, hit: { kind: 'line', id: l.id } }
  }
  return best === null ? null : best.hit
}
