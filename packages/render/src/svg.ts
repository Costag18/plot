import { distance } from '@plot/core'
import { formatLength } from '@plot/document'
import type { PlotDocument } from '@plot/document'
import { boundsOf } from './bounds'

const UM_PER_MM = 1000

// Export at 1 SVG user unit = 1 mm, world y-up flipped to SVG y-down.
export function toSVG(doc: PlotDocument, padding = 10): string {
  const b = boundsOf(doc.sketch)
  const toMM = (um: number) => um / UM_PER_MM
  const w = toMM(b.maxX - b.minX) + padding * 2
  const h = toMM(b.maxY - b.minY) + padding * 2
  const X = (x: number) => toMM(x - b.minX) + padding
  const Y = (y: number) => toMM(b.maxY - y) + padding // flip

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(w)} ${round(h)}" width="${round(w)}mm" height="${round(h)}mm">`,
  )
  parts.push(`<rect x="0" y="0" width="${round(w)}" height="${round(h)}" fill="white"/>`)
  for (const l of Object.values(doc.sketch.lines)) {
    const a = doc.sketch.points[l.a]
    const c = doc.sketch.points[l.b]
    if (!a || !c) continue
    parts.push(
      `<line x1="${round(X(a.x))}" y1="${round(Y(a.y))}" x2="${round(X(c.x))}" y2="${round(Y(c.y))}" stroke="#1d4ed8" stroke-width="0.5"/>`,
    )
    const lenUm = distance(a, c)
    if (lenUm > 0) {
      const mx = X((a.x + c.x) / 2)
      const my = Y((a.y + c.y) / 2)
      parts.push(
        `<text x="${round(mx)}" y="${round(my)}" font-size="3" fill="#111" text-anchor="middle">${escapeXml(formatLength(lenUm, doc.units))}</text>`,
      )
    }
  }
  parts.push('</svg>')
  return parts.join('')
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (ch) =>
    ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch === "'" ? '&apos;' : '&quot;',
  )
}
