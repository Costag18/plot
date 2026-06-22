import { umToMeters } from '@plot/core'
import type { Sketch } from '@plot/core'

const SCALE = 0.0001
const ORIGIN_X = 80
const ORIGIN_Y = 400

const sx = (xUm: number) => ORIGIN_X + xUm * SCALE
const sy = (yUm: number) => ORIGIN_Y - yUm * SCALE

export function render(ctx: CanvasRenderingContext2D, sketch: Sketch): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  ctx.strokeStyle = '#1d4ed8'
  ctx.lineWidth = 2
  for (const line of Object.values(sketch.lines)) {
    const a = sketch.points[line.a]
    const b = sketch.points[line.b]
    if (!a || !b) continue
    ctx.beginPath()
    ctx.moveTo(sx(a.x), sy(a.y))
    ctx.lineTo(sx(b.x), sy(b.y))
    ctx.stroke()

    const midX = (sx(a.x) + sx(b.x)) / 2
    const midY = (sy(a.y) + sy(b.y)) / 2
    const lenM = Math.hypot(umToMeters(b.x - a.x), umToMeters(b.y - a.y))
    ctx.fillStyle = '#111'
    ctx.font = '13px system-ui'
    ctx.fillText(`${lenM.toFixed(2)} m`, midX + 4, midY - 4)
  }

  ctx.fillStyle = '#111'
  for (const p of Object.values(sketch.points)) {
    ctx.beginPath()
    ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
