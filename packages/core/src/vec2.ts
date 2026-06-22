export interface Vec2 {
  x: number
  y: number
}

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const length = (v: Vec2): number => Math.hypot(v.x, v.y)
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b))
