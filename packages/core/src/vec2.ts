export interface Vec2 {
  x: number
  y: number
}

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const length = (v: Vec2): number => Math.hypot(v.x, v.y)
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b))

export const snapToGrid = (v: Vec2, step: number): Vec2 =>
  step <= 0 ? v : { x: Math.round(v.x / step) * step, y: Math.round(v.y / step) * step }
