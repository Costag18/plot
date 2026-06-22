import type { PlotDocument } from './document'

export interface RefImage {
  dataUrl: string
  x: number
  y: number
  umPerPx: number
  opacity: number
  w: number
  h: number
}

export function calibrateImage(
  img: RefImage,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  realLengthUm: number,
): RefImage {
  const dWorld = Math.hypot(bx - ax, by - ay)
  if (dWorld === 0) return img
  const f = realLengthUm / dWorld
  return {
    ...img,
    umPerPx: img.umPerPx * f,
    x: ax - (ax - img.x) * f,
    y: ay - (ay - img.y) * f,
  }
}

export function setImage(doc: PlotDocument, image: RefImage): PlotDocument {
  return { ...doc, image }
}

export function clearImage(doc: PlotDocument): PlotDocument {
  return { ...doc, image: null }
}

export function setImageOpacity(doc: PlotDocument, opacity: number): PlotDocument {
  if (!doc.image) return doc
  return { ...doc, image: { ...doc.image, opacity } }
}
