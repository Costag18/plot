import type { Sketch } from '@plot/core'
import type { Bounds } from './camera'

export function boundsOf(sketch: Sketch): Bounds {
  const pts = Object.values(sketch.points)
  if (pts.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}
