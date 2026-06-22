// Read a `File`, draw it to an offscreen canvas capped at `maxDim` on the long
// side, and return a JPEG data URL plus the downscaled pixel dimensions. The
// data URL lives in the document so the image autosaves and exports with the
// `.json`; downscaling keeps very large source photos from bloating autosave.
export async function loadAndDownscale(
  file: File,
  maxDim = 2000,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(img, 0, 0, w, h)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Load an image element from a URL (object URL or data URL). Resolves once the
// pixels are decoded so the caller can draw it immediately.
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
