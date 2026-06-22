# Plot v1 — Slice 5: Reference Image Tracing + Calibrate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Import a photo/floorplan as a faint underlay, trace over it with the normal tools, and calibrate real-world scale by drawing a line over a feature of known length and typing that length — so a user can "plot my room" from a picture.

**Architecture:** Extend `PlotDocument` with an optional `image` (Zod, backward-compatible) holding a downscaled data URL, pixel size, world placement (`x`,`y` of the top-left in µm), `umPerPx` scale, and `opacity`. Add a pure, TDD'd `calibrateImage(img, ax,ay,bx,by, realLengthUm)` (rescales the image about the first reference point so the traced feature becomes the entered length) plus trivial `setImage`/`clearImage`/`setImageOpacity` doc helpers. `@plot/render` draws the image under the geometry (mapped world→screen, with opacity). `apps/web` imports + downscales an image, keeps a loaded `HTMLImageElement` for rendering, adds an opacity slider, a Calibrate tool (two clicks + length), and a Remove button. The image data URL lives in the document, so it autosaves and exports with the `.json` automatically.

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5, Vite 5; `@plot/core`, `@plot/document`, `@plot/render`.

**Scope note:** Slice 5 only. Deferred to a final **Slice 6**: templates/empty-state, PWA/offline, and touch/pinch. Storing the image as a (downscaled, ~≤2000px, JPEG) data URL keeps it portable in the `.json` and simple to persist; very large source images are downscaled on import to keep autosave light.

---

## File structure

```
packages/document/
  src/
    image.ts          NEW: RefImage type, calibrateImage (pure), setImage/clearImage/setImageOpacity
    document.ts       MODIFY: optional `image` in the Zod schema
    index.ts          MODIFY: export ./image
  test/
    image.test.ts     NEW
packages/render/
  src/
    renderer.ts       MODIFY: RenderState.image; draw it under geometry with opacity
apps/web/
  src/
    image.ts          NEW: loadAndDownscale(file) -> { dataUrl, w, h }
    store.ts          MODIFY: setImage/clearImage/setImageOpacity actions; 'calibrate' tool; calibrating state
    CanvasView.tsx    MODIFY: load HTMLImageElement from doc.image.dataUrl; pass image to render; calibrate tool (2 clicks)
    CalibrateInput.tsx NEW: length input shown after the 2-click reference
    App.tsx           MODIFY: Import image, opacity slider, Calibrate tool button, Remove image
```

---

## Task 1: `@plot/document` — image model + calibrate (pure, TDD)

**Files:** Create `packages/document/src/image.ts`, `packages/document/test/image.test.ts`; Modify `packages/document/src/document.ts`, `packages/document/src/index.ts`.

- [ ] **Step 1: Write the failing image test**

Create `packages/document/test/image.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { calibrateImage, setImage, clearImage, setImageOpacity } from '../src/image'
import type { RefImage } from '../src/image'
import { createDocument } from '../src/document'

const img: RefImage = { dataUrl: 'data:,', x: 0, y: 0, umPerPx: 1000, opacity: 0.5, w: 100, h: 80 }

describe('calibrateImage', () => {
  it('rescales umPerPx so the traced feature equals the entered length', () => {
    // reference drawn from (0,0) to (10000,0): 10000 µm at current scale
    // user says that is 20000 µm -> factor 2 -> umPerPx 2000
    const next = calibrateImage(img, 0, 0, 10_000, 0, 20_000)
    expect(next.umPerPx).toBe(2000)
  })
  it('keeps the first reference point anchored on its image feature', () => {
    // anchor at A=(0,0): image origin stays at 0 when A is at origin
    const next = calibrateImage(img, 0, 0, 10_000, 0, 20_000)
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })
  it('anchors a non-origin first point correctly', () => {
    const next = calibrateImage({ ...img, x: 0, y: 0 }, 5000, 0, 15_000, 0, 20_000) // dWorld=10000, f=2
    // x_new = ax - (ax - x_old)*f = 5000 - (5000-0)*2 = -5000
    expect(next.x).toBe(-5000)
  })
  it('returns the image unchanged for a zero-length reference', () => {
    expect(calibrateImage(img, 3, 3, 3, 3, 1000)).toBe(img)
  })
})

describe('setImage/clearImage/setImageOpacity', () => {
  it('sets and clears the document image', () => {
    const withImg = setImage(createDocument('m'), img)
    expect(withImg.image).toEqual(img)
    expect(clearImage(withImg).image).toBeNull()
  })
  it('updates opacity immutably', () => {
    const withImg = setImage(createDocument('m'), img)
    const dim = setImageOpacity(withImg, 0.2)
    expect(dim.image!.opacity).toBe(0.2)
    expect(withImg.image!.opacity).toBe(0.5)
  })
  it('opacity on a doc with no image is a no-op', () => {
    const doc = createDocument('m')
    expect(setImageOpacity(doc, 0.2)).toBe(doc)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm --filter @plot/document test` — FAIL.

- [ ] **Step 3: Implement `image.ts`**

Create `packages/document/src/image.ts`:
```ts
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
```

- [ ] **Step 4: Add `image` to the Zod schema**

In `packages/document/src/document.ts`, define and include an image schema (backward-compatible optional + nullable):
```ts
const ImageSchema = z.object({
  dataUrl: z.string(),
  x: z.number(),
  y: z.number(),
  umPerPx: z.number(),
  opacity: z.number(),
  w: z.number(),
  h: z.number(),
})
```
and add to `DocumentSchema`: `image: ImageSchema.nullable().optional()`. (Existing docs without `image` still parse.) Confirm `PlotDocument` (the `z.infer`) now has `image?: ... | null`.

- [ ] **Step 5: Barrel**

In `packages/document/src/index.ts` add `export * from './image'`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @plot/document test` (all pass) and `pnpm --filter @plot/document typecheck` (zero errors).

- [ ] **Step 7: Commit**

```bash
git add packages/document
git commit -m "feat(document): reference image model and calibrate-to-scale"
```

---

## Task 2: `@plot/render` — draw the reference image under geometry

**Files:** Modify `packages/render/src/renderer.ts`.

- [ ] **Step 1: Extend `RenderState`**

Add a render-time image type (carries the loaded element + placement):
```ts
export interface RenderImage {
  el: CanvasImageSource
  x: number
  y: number
  umPerPx: number
  opacity: number
  w: number
  h: number
}
```
and add `image?: RenderImage | null` to `RenderState`.

- [ ] **Step 2: Draw it first in `drawGeometry`**

At the START of `drawGeometry` (right after `this.clear(ctx)` and computing `c`), draw the image beneath everything:
```ts
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
```
(`img.x`,`img.y` are the world coords of the image top-left; world is y-up so the top-left maps to the smallest screen-y; `worldToScreen` already flips y, and the image extends downward in screen space by `sh`.)

- [ ] **Step 3: Typecheck + test**

Run: `pnpm --filter @plot/render typecheck` (zero errors) and `pnpm --filter @plot/render test` (existing tests pass).

- [ ] **Step 4: Commit**

```bash
git add packages/render
git commit -m "feat(render): draw reference image underlay"
```

---

## Task 3: `apps/web` — import/downscale, render, opacity, calibrate, remove

**Files:** Create `apps/web/src/image.ts`, `apps/web/src/CalibrateInput.tsx`; Modify `apps/web/src/store.ts`, `apps/web/src/CanvasView.tsx`, `apps/web/src/App.tsx`.

- [ ] **Step 1: `apps/web/src/image.ts` — load + downscale**

Create a helper that reads a `File`, draws it to an offscreen canvas capped at 2000px on the long side, and returns a JPEG data URL + pixel dims:
```ts
export async function loadAndDownscale(file: File, maxDim = 2000): Promise<{ dataUrl: string; w: number; h: number }> {
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

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
```

- [ ] **Step 2: Store actions + calibrate state**

In `store.ts` add: `setImage(img: RefImage)` (commit `setImage(present, img)`), `clearImage()` (commit `clearImage(present)`), `setImageOpacity(o)` (commit), and tool `'calibrate'` (extend the `tool` union + `setTool`). Add `calibrating: { a: Vec2; b: Vec2; screen: {x:number;y:number} } | null` + `setCalibrating`. Import `RefImage`, `setImage`, `clearImage`, `setImageOpacity` from `@plot/document`, `Vec2` from `@plot/core`. `setImageOpacity` should commit (undoable) — or, to avoid flooding history while dragging a slider, apply via a lightweight `commit` only on slider release; simplest acceptable: commit on each change (fine for v1).

- [ ] **Step 3: Render the image in `CanvasView`**

Keep an `HTMLImageElement | null` in a ref, loaded via `loadImage(doc.image.dataUrl)` in a `useEffect` keyed on `doc.image?.dataUrl` (set ref + trigger a re-render when it loads; clear when no image). In the render effect, pass `image` to `renderer.render(...)` as `doc.image && imgEl ? { el: imgEl, x, y, umPerPx, opacity, w, h } : null`. Add the image (and its load tick) to the render effect deps.

- [ ] **Step 4: Calibrate tool in `CanvasView`**

When `tool === 'calibrate'`: two clicks define a world reference segment (reuse the `draft` of kind `'line'` for the preview). After the second click, instead of committing geometry, set `calibrating = { a, b, screen: midpoint-in-canvas-px }` and clear the draft. `CalibrateInput` (Step 5) then collects the length. Escape cancels (clear draft + calibrating).

- [ ] **Step 5: `CalibrateInput.tsx`**

When `calibrating` is set, render an absolutely-positioned `<input type="number">` (in the document unit) at `calibrating.screen`, focused. On Enter: `parseLength(value, doc().units)` → if a `doc().image` exists, `commit(setImageWith(calibrateImage(image, a.x,a.y,b.x,b.y, um)))` — i.e. build a new doc with the calibrated image and commit; then `setCalibrating(null)`. On Escape/blur: `setCalibrating(null)`. (Reuse `parseLength` from `apps/web/src/ids.ts`.)

- [ ] **Step 6: `App.tsx` controls**

Add: an **Image** button → hidden file input (accept `image/*`) → `loadAndDownscale(file)` → build a `RefImage` placed sensibly (e.g. `x:0, y:0`, `umPerPx: 1000` (1 mm/px default), `opacity: 0.5`) → `setImage`. When `doc().image` exists, show an **opacity** range slider (0–1, calls `setImageOpacity`), a **Calibrate** tool button (`setTool('calibrate')`), and a **Remove** button (`clearImage`). Wrap import in try/catch → `setToast('Could not load that image.')`. Keep all existing controls and mount `<CalibrateInput/>` in the canvas region.

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @plot/web typecheck` and `pnpm --filter @plot/web build` — both pass. Do NOT do interactive browser testing — the controller verifies.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): reference image import, underlay, opacity, calibrate, remove"
```

---

## Final verification

- [ ] `pnpm test` — all unit tests pass (incl. new image tests).
- [ ] `pnpm typecheck` — zero errors across all packages.
- [ ] `pnpm --filter @plot/web build` — succeeds.
- [ ] Controller verification (via the live store / browser): set a `doc.image` (calibrate math is unit-tested); confirm `calibrateImage` changes `umPerPx`/origin as expected; confirm an imported image persists in the doc (autosave) and round-trips through `.json`; confirm the renderer accepts `image` in `RenderState` without error.

---

## Self-review against the slice

- **Reference image model + calibrate-to-scale (pure, TDD)** → Task 1. ✓
- **Image rendered as an underlay with opacity** → Task 2. ✓
- **Import/downscale, opacity, calibrate tool, remove; image autosaves/export via the doc** → Task 3. ✓
- **Deferred to Slice 6 (not gaps):** templates/empty-state, PWA/offline, touch/pinch. PDF/DXF + collab remain v2/v3 by design.
```
