import type { PlotDocument } from '@plot/document'
import { distance } from '@plot/core'
import { formatLength } from '@plot/document'
import type { Vec2 } from '@plot/core'
import { worldToScreen } from './camera'
import { niceStep } from './grid'
import type { Camera } from './camera'
import type { Hit } from './hittest'

export type Draft =
  | { kind: 'line'; a: Vec2; b: Vec2 }
  | { kind: 'rect'; a: Vec2; b: Vec2 }

export type SnapHint =
  | { kind: 'horizontal'; at: Vec2 }
  | { kind: 'vertical'; at: Vec2 }
  | { kind: 'endpoint'; at: Vec2 }

export interface RenderImage {
  el: CanvasImageSource
  x: number
  y: number
  umPerPx: number
  opacity: number
  w: number
  h: number
}

export interface RenderState {
  doc: PlotDocument
  camera: Camera
  selection: ReadonlySet<string>
  hover: Hit | null
  draft?: Draft | null
  snap?: SnapHint | null
  image?: RenderImage | null
  marquee?: { a: Vec2; b: Vec2 } | null
}

const COLORS = {
  gridMinor: 'rgba(120,120,120,0.15)',
  gridMajor: 'rgba(120,120,120,0.30)',
  axis: 'rgba(120,120,120,0.5)',
  geometry: '#1d4ed8',
  point: '#1d4ed8',
  selected: '#f59e0b',
  hover: '#10b981',
}

const TARGET_GRID_PX = 80

export class CanvasRenderer {
  private gridCtx: CanvasRenderingContext2D
  private geomCtx: CanvasRenderingContext2D
  private overlayCtx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private dpr = 1

  constructor(gridCanvas: HTMLCanvasElement, geomCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.gridCtx = get2d(gridCanvas)
    this.geomCtx = get2d(geomCanvas)
    this.overlayCtx = get2d(overlayCanvas)
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.w = cssWidth
    this.h = cssHeight
    this.dpr = dpr
    for (const ctx of [this.gridCtx, this.geomCtx, this.overlayCtx]) {
      const canvas = ctx.canvas
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }

  render(s: RenderState): void {
    this.drawGrid(s.camera)
    this.drawGeometry(s)
    this.drawOverlay(s)
  }

  private clear(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.w, this.h)
  }

  private drawGrid(camera: Camera): void {
    const ctx = this.gridCtx
    this.clear(ctx)
    const stepWorld = niceStep(TARGET_GRID_PX / camera.scale)
    ctx.lineWidth = 1

    // Vertical lines: iterate world-X indices across the visible range. Indexing by
    // world coordinate (ix) keeps the "every 5th line is major" phase stable on pan.
    const leftWorldX = (0 - camera.tx) / camera.scale
    const rightWorldX = (this.w - camera.tx) / camera.scale
    for (let ix = Math.floor(leftWorldX / stepWorld); ix <= Math.ceil(rightWorldX / stepWorld); ix++) {
      const sx = ix * stepWorld * camera.scale + camera.tx
      ctx.strokeStyle = ix % 5 === 0 ? COLORS.gridMajor : COLORS.gridMinor
      line(ctx, Math.round(sx) + 0.5, 0, Math.round(sx) + 0.5, this.h)
    }

    // Horizontal lines: world is y-up, so screen top (sy=0) is the larger world-Y.
    const bottomWorldY = (camera.ty - this.h) / camera.scale
    const topWorldY = camera.ty / camera.scale
    for (let iy = Math.floor(bottomWorldY / stepWorld); iy <= Math.ceil(topWorldY / stepWorld); iy++) {
      const sy = -iy * stepWorld * camera.scale + camera.ty
      ctx.strokeStyle = iy % 5 === 0 ? COLORS.gridMajor : COLORS.gridMinor
      line(ctx, 0, Math.round(sy) + 0.5, this.w, Math.round(sy) + 0.5)
    }
  }

  private drawGeometry(s: RenderState): void {
    const ctx = this.geomCtx
    this.clear(ctx)
    const { sketch } = s.doc
    const c = s.camera

    if (s.image) {
      const img = s.image
      const tl = worldToScreen(c, { x: img.x, y: img.y })
      const sw = img.w * img.umPerPx * c.scale
      const sh = img.h * img.umPerPx * c.scale
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, img.opacity))
      ctx.drawImage(img.el, tl.x, tl.y, sw, sh)
      ctx.restore()
    }

    ctx.lineWidth = 2
    ctx.strokeStyle = COLORS.geometry
    for (const l of Object.values(sketch.lines)) {
      const a = sketch.points[l.a]
      const b = sketch.points[l.b]
      if (!a || !b) continue
      const sa = worldToScreen(c, a)
      const sb = worldToScreen(c, b)
      line(ctx, sa.x, sa.y, sb.x, sb.y)
    }

    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const l of Object.values(sketch.lines)) {
      const a = sketch.points[l.a]
      const b = sketch.points[l.b]
      if (!a || !b) continue
      const lenUm = distance(a, b)
      if (lenUm === 0) continue
      const label = formatLength(lenUm, s.doc.units)
      const mid = worldToScreen(c, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      const w = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(20,20,20,0.7)'
      ctx.fillRect(mid.x - w / 2 - 4, mid.y - 9, w + 8, 18)
      ctx.fillStyle = '#e8e8e8'
      ctx.fillText(label, mid.x, mid.y)
    }

    ctx.fillStyle = COLORS.point
    for (const p of Object.values(sketch.points)) {
      const sp = worldToScreen(c, p)
      dot(ctx, sp.x, sp.y, 4)
    }
  }

  private drawOverlay(s: RenderState): void {
    const ctx = this.overlayCtx
    this.clear(ctx)
    const { sketch } = s.doc
    const c = s.camera

    const drawEntity = (id: string, color: string, widthBoost: number): void => {
      const line0 = sketch.lines[id]
      if (line0) {
        const a = sketch.points[line0.a]
        const b = sketch.points[line0.b]
        if (a && b) {
          ctx.strokeStyle = color
          ctx.lineWidth = 2 + widthBoost
          const sa = worldToScreen(c, a)
          const sb = worldToScreen(c, b)
          line(ctx, sa.x, sa.y, sb.x, sb.y)
        }
        return
      }
      const pt = sketch.points[id]
      if (pt) {
        const sp = worldToScreen(c, pt)
        ctx.fillStyle = color
        dot(ctx, sp.x, sp.y, 6)
      }
    }

    if (s.hover) drawEntity(s.hover.id, COLORS.hover, 1)
    for (const id of s.selection) drawEntity(id, COLORS.selected, 2)

    if (s.draft) {
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = COLORS.hover
      ctx.lineWidth = 1.5
      const a = worldToScreen(c, s.draft.a)
      const b = worldToScreen(c, s.draft.b)
      if (s.draft.kind === 'line') {
        line(ctx, a.x, a.y, b.x, b.y)
      } else {
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      }
      ctx.restore()
    }

    if (s.snap) {
      const at = worldToScreen(c, s.snap.at)
      if (s.snap.kind === 'endpoint') {
        ctx.strokeStyle = COLORS.hover
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(at.x, at.y, 7, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.save()
        ctx.strokeStyle = s.snap.kind === 'horizontal' ? '#ef4444' : '#22c55e'
        ctx.globalAlpha = 0.6
        ctx.lineWidth = 1
        if (s.snap.kind === 'horizontal') line(ctx, 0, at.y, this.w, at.y)
        else line(ctx, at.x, 0, at.x, this.h)
        ctx.restore()
      }
    }

    if (s.marquee) {
      const a = worldToScreen(c, s.marquee.a)
      const b = worldToScreen(c, s.marquee.b)
      ctx.save()
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = COLORS.selected
      ctx.fillStyle = 'rgba(245,158,11,0.08)'
      ctx.lineWidth = 1
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const w = Math.abs(b.x - a.x)
      const h = Math.abs(b.y - a.y)
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      ctx.restore()
    }
  }
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return ctx
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
