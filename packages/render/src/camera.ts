import type { Vec2 } from '@plot/core'

export interface Camera {
  scale: number
  tx: number
  ty: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const worldToScreen = (c: Camera, w: Vec2): Vec2 => ({
  x: w.x * c.scale + c.tx,
  y: -w.y * c.scale + c.ty,
})

export const screenToWorld = (c: Camera, s: Vec2): Vec2 => ({
  x: (s.x - c.tx) / c.scale,
  y: -(s.y - c.ty) / c.scale,
})

export const panBy = (c: Camera, dxScreen: number, dyScreen: number): Camera => ({
  scale: c.scale,
  tx: c.tx + dxScreen,
  ty: c.ty + dyScreen,
})

export function zoomAt(c: Camera, screenPt: Vec2, factor: number): Camera {
  const w = screenToWorld(c, screenPt)
  const scale = c.scale * factor
  return { scale, tx: screenPt.x - w.x * scale, ty: screenPt.y + w.y * scale }
}

export function fitToBounds(b: Bounds, viewW: number, viewH: number, padding = 40): Camera {
  const bw = Math.max(b.maxX - b.minX, 1)
  const bh = Math.max(b.maxY - b.minY, 1)
  const scale = Math.min((viewW - 2 * padding) / bw, (viewH - 2 * padding) / bh)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return { scale, tx: viewW / 2 - cx * scale, ty: viewH / 2 + cy * scale }
}
