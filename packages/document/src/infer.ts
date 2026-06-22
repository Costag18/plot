import { distance } from '@plot/core'
import type { Sketch, Vec2 } from '@plot/core'

export function inferAxis(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tolDeg = 4,
): 'horizontal' | 'vertical' | null {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return null
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) // 0..180
  if (ang <= tolDeg || ang >= 180 - tolDeg) return 'horizontal'
  if (Math.abs(ang - 90) <= tolDeg) return 'vertical'
  return null
}

export function snapPoint(
  sketch: Sketch,
  world: Vec2,
  tolWorld: number,
  exclude: ReadonlySet<string> = new Set(),
): string | null {
  let best: { d: number; id: string } | null = null
  for (const p of Object.values(sketch.points)) {
    if (exclude.has(p.id)) continue
    const d = distance(world, p)
    if (d <= tolWorld && (best === null || d < best.d)) best = { d, id: p.id }
  }
  return best === null ? null : best.id
}
