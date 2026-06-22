# Plot v1 — Slice 1: Interactive Canvas Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the real Plot app skeleton: a versioned document model with undo/redo, a custom Canvas2D renderer (infinite pan/zoom, world↔screen transform, HiDPI, adaptive grid), analytic hit-testing, and a React + Zustand shell that renders a seeded document and supports pan, zoom-at-cursor, zoom-to-fit, hover, and click-to-select.

**Architecture:** Two new pure packages plus a React app, layered on the existing `@plot/core`. `@plot/document` wraps the core `Sketch` in a Zod-validated, versioned `PlotDocument` and provides a generic immutable undo/redo `History`. `@plot/render` provides pure camera math (`worldToScreen`/`screenToWorld`/`zoomAt`/`fitToBounds`), analytic hit-testing, and a layered Canvas2D `CanvasRenderer` (cached grid / geometry / overlay). `apps/web` is React + Zustand: the store holds `{ history<PlotDocument>, camera, selection, hover }`; `CanvasView` mounts three stacked canvases, wires pointer/wheel events, and drives the renderer. No editing or solving yet — this slice renders a pre-solved seed document and proves the viewport, picking, and undo plumbing.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Zod, React 19, Zustand 5, Vite 5. Builds on `@plot/core`.

**Scope note:** Slice 1 ONLY. Deferred to later v1 slices: draw tools + solver re-runs (slice 2), auto-inferred constraints + dimension chips + state colors + toast (slice 3), persistence/export/templates/PWA (slice 4). RBush spatial indexing is deferred — a linear analytic hit-test is correct and fast at slice-1 entity counts; swap in RBush when profiling demands it. Immer is not used yet — whole-document snapshot history is sufficient here.

---

## File structure

```
packages/document/                  @plot/document
  package.json
  tsconfig.json
  src/
    document.ts                     Zod schema, PlotDocument, create/parse/serialize/migrate
    history.ts                      generic immutable undo/redo
    index.ts
  test/
    document.test.ts
    history.test.ts
packages/render/                    @plot/render
  package.json
  tsconfig.json
  src/
    camera.ts                       Camera + world<->screen + pan/zoomAt/fitToBounds + bounds
    hittest.ts                      analytic point/segment hit-testing
    grid.ts                         niceStep helper for adaptive grid
    renderer.ts                     CanvasRenderer (3 stacked canvases)
    index.ts
  test/
    camera.test.ts
    hittest.test.ts
    grid.test.ts
apps/web/                           @plot/web (React app)
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx
    store.ts                        Zustand store
    seed.ts                         seeded PlotDocument (a solved 3x2 m rectangle)
    CanvasView.tsx                  canvas mount + pointer/wheel wiring
```

---

## Task 1: `@plot/document` — package + Zod document model

**Files:**
- Create: `packages/document/package.json`, `packages/document/tsconfig.json`, `packages/document/src/document.ts`, `packages/document/test/document.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/document/package.json`:
```json
{
  "name": "@plot/document",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@plot/core": "workspace:*",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/document/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: resolves `zod`.

- [ ] **Step 4: Write the failing test**

Create `packages/document/test/document.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDocument, serializeDocument, parseDocument, DocumentSchema } from '../src/document'

describe('document', () => {
  it('creates a versioned empty document with the chosen unit', () => {
    const doc = createDocument('m')
    expect(doc.version).toBe(1)
    expect(doc.units).toBe('m')
    expect(doc.sketch).toEqual({ points: {}, lines: {}, constraints: [] })
  })

  it('round-trips through serialize/parse', () => {
    const doc = createDocument('cm')
    doc.sketch.points.p0 = { type: 'point', id: 'p0', x: 0, y: 0, fixed: true }
    doc.sketch.points.p1 = { type: 'point', id: 'p1', x: 1000, y: 0, fixed: false }
    doc.sketch.lines.L0 = { type: 'line', id: 'L0', a: 'p0', b: 'p1' }
    doc.sketch.constraints.push({ id: 'c0', kind: 'horizontal', line: 'L0' })
    const parsed = parseDocument(serializeDocument(doc))
    expect(parsed).toEqual(doc)
  })

  it('rejects malformed json with a Zod error', () => {
    expect(() => parseDocument('{"version":1,"units":"furlongs","sketch":{}}')).toThrow()
  })

  it('exposes a schema whose parse accepts a valid document', () => {
    const doc = createDocument('mm')
    expect(() => DocumentSchema.parse(doc)).not.toThrow()
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @plot/document test`
Expected: FAIL — cannot resolve `../src/document`.

- [ ] **Step 6: Implement the document model**

Create `packages/document/src/document.ts`:
```ts
import { z } from 'zod'
import { emptySketch } from '@plot/core'
import type { Sketch } from '@plot/core'

export const UNITS = ['mm', 'cm', 'm', 'ft'] as const
export type Unit = (typeof UNITS)[number]

export const CURRENT_VERSION = 1

const PointSchema = z.object({
  type: z.literal('point'),
  id: z.string(),
  x: z.number(),
  y: z.number(),
  fixed: z.boolean(),
})

const LineSchema = z.object({
  type: z.literal('line'),
  id: z.string(),
  a: z.string(),
  b: z.string(),
})

const ConstraintSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('coincident'), a: z.string(), b: z.string() }),
  z.object({ id: z.string(), kind: z.literal('horizontal'), line: z.string() }),
  z.object({ id: z.string(), kind: z.literal('vertical'), line: z.string() }),
  z.object({ id: z.string(), kind: z.literal('distance'), line: z.string(), value: z.number() }),
  z.object({ id: z.string(), kind: z.literal('parallel'), l1: z.string(), l2: z.string() }),
  z.object({ id: z.string(), kind: z.literal('perpendicular'), l1: z.string(), l2: z.string() }),
  z.object({ id: z.string(), kind: z.literal('equalLength'), l1: z.string(), l2: z.string() }),
])

const SketchSchema = z.object({
  points: z.record(z.string(), PointSchema),
  lines: z.record(z.string(), LineSchema),
  constraints: z.array(ConstraintSchema),
})

export const DocumentSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  units: z.enum(UNITS),
  sketch: SketchSchema,
})

export type PlotDocument = z.infer<typeof DocumentSchema>

export function createDocument(units: Unit = 'm'): PlotDocument {
  const sketch: Sketch = emptySketch()
  return { version: CURRENT_VERSION, units, sketch }
}

export function serializeDocument(doc: PlotDocument): string {
  return JSON.stringify(doc)
}

function migrate(raw: unknown): unknown {
  // v1 is the first persisted version. Future versions branch on (raw as {version}).version here.
  return raw
}

export function parseDocument(json: string): PlotDocument {
  return DocumentSchema.parse(migrate(JSON.parse(json)))
}
```

Note on types: `z.infer` of `SketchSchema` is structurally identical to `@plot/core`'s `Sketch` (same fields), so `PlotDocument.sketch` is interchangeable with `Sketch` at call sites. If the compiler complains at a boundary, prefer importing/using the value as `Sketch` rather than widening — do not change `@plot/core`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @plot/document test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/document pnpm-lock.yaml
git commit -m "feat(document): add versioned Zod document model"
```

---

## Task 2: `@plot/document` — undo/redo history + barrel

**Files:**
- Create: `packages/document/src/history.ts`, `packages/document/src/index.ts`, `packages/document/test/history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/document/test/history.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createHistory, commit, undo, redo, canUndo, canRedo } from '../src/history'

describe('history', () => {
  it('starts with present and no past/future', () => {
    const h = createHistory(1)
    expect(h.present).toBe(1)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('commits a new present and remembers the past', () => {
    const h = commit(createHistory(1), 2)
    expect(h.present).toBe(2)
    expect(canUndo(h)).toBe(true)
  })

  it('ignores a commit equal to the current present (no-op)', () => {
    const h0 = createHistory(1)
    const h1 = commit(h0, 1)
    expect(h1).toBe(h0)
  })

  it('undo restores the previous present and enables redo', () => {
    const h = undo(commit(createHistory(1), 2))
    expect(h.present).toBe(1)
    expect(canRedo(h)).toBe(true)
  })

  it('redo re-applies an undone change', () => {
    const h = redo(undo(commit(createHistory(1), 2)))
    expect(h.present).toBe(2)
  })

  it('commit after undo clears the redo future', () => {
    const h = commit(undo(commit(createHistory(1), 2)), 3)
    expect(h.present).toBe(3)
    expect(canRedo(h)).toBe(false)
  })

  it('undo at the beginning is a no-op', () => {
    const h0 = createHistory(1)
    expect(undo(h0)).toBe(h0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plot/document test`
Expected: FAIL — cannot resolve `../src/history`.

- [ ] **Step 3: Implement history**

Create `packages/document/src/history.ts`:
```ts
export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] }
}

export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h
  return { past: [...h.past, h.present], present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1]
  if (prev === undefined) return h
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0]
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @plot/document test`
Expected: PASS (all document tests).

- [ ] **Step 5: Create the barrel**

Create `packages/document/src/index.ts`:
```ts
export * from './document'
export * from './history'
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @plot/document typecheck`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add packages/document
git commit -m "feat(document): add immutable undo/redo history"
```

---

## Task 3: `@plot/render` — package + camera math

**Files:**
- Create: `packages/render/package.json`, `packages/render/tsconfig.json`, `packages/render/src/camera.ts`, `packages/render/test/camera.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/render/package.json`:
```json
{
  "name": "@plot/render",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@plot/core": "workspace:*",
    "@plot/document": "workspace:*"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/render/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/render/test/camera.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, panBy, zoomAt, fitToBounds } from '../src/camera'
import type { Camera } from '../src/camera'

const cam: Camera = { scale: 2, tx: 100, ty: 50 }

describe('camera', () => {
  it('maps world to screen with y flipped (world y-up)', () => {
    expect(worldToScreen(cam, { x: 10, y: 5 })).toEqual({ x: 120, y: 40 })
  })

  it('round-trips world -> screen -> world', () => {
    const w = { x: 12.5, y: -7.25 }
    const s = worldToScreen(cam, w)
    const back = screenToWorld(cam, s)
    expect(back.x).toBeCloseTo(w.x, 9)
    expect(back.y).toBeCloseTo(w.y, 9)
  })

  it('panBy shifts the translation in screen pixels', () => {
    expect(panBy(cam, 10, -5)).toEqual({ scale: 2, tx: 110, ty: 45 })
  })

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const screenPt = { x: 200, y: 80 }
    const before = screenToWorld(cam, screenPt)
    const zoomed = zoomAt(cam, screenPt, 1.5)
    expect(zoomed.scale).toBeCloseTo(3, 9)
    const after = screenToWorld(zoomed, screenPt)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('fitToBounds centers the bounds in the viewport', () => {
    const c = fitToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 600, 50)
    const center = screenToWorld(c, { x: 400, y: 300 })
    expect(center.x).toBeCloseTo(50, 6)
    expect(center.y).toBeCloseTo(50, 6)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @plot/render test`
Expected: FAIL — cannot resolve `../src/camera`.

- [ ] **Step 5: Implement the camera**

Create `packages/render/src/camera.ts`:
```ts
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @plot/render test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/render pnpm-lock.yaml
git commit -m "feat(render): add @plot/render package with camera math"
```

---

## Task 4: `@plot/render` — adaptive grid step + analytic hit-testing

**Files:**
- Create: `packages/render/src/grid.ts`, `packages/render/src/hittest.ts`, `packages/render/test/grid.test.ts`, `packages/render/test/hittest.test.ts`

- [ ] **Step 1: Write the failing grid test**

Create `packages/render/test/grid.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { niceStep } from '../src/grid'

describe('niceStep', () => {
  it('snaps to 1/2/5 x powers of ten', () => {
    expect(niceStep(1)).toBe(1)
    expect(niceStep(1.3)).toBe(2)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(7)).toBe(10)
    expect(niceStep(170)).toBe(200)
    expect(niceStep(0.012)).toBe(0.02)
  })

  it('always returns a positive step', () => {
    expect(niceStep(0.0001)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Write the failing hit-test test**

Create `packages/render/test/hittest.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { hitTest } from '../src/hittest'
import type { Sketch } from '@plot/core'

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 100, y: 0, fixed: false },
  },
  lines: { L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' } },
  constraints: [],
}

describe('hitTest', () => {
  it('returns null when nothing is within tolerance', () => {
    expect(hitTest(sketch, { x: 50, y: 50 }, 5)).toBeNull()
  })

  it('hits a point when within tolerance', () => {
    expect(hitTest(sketch, { x: 2, y: 1 }, 5)).toEqual({ kind: 'point', id: 'p0' })
  })

  it('prefers a point over a line when both are in range', () => {
    expect(hitTest(sketch, { x: 100, y: 2 }, 10)).toEqual({ kind: 'point', id: 'p1' })
  })

  it('hits the line segment between endpoints', () => {
    expect(hitTest(sketch, { x: 50, y: 3 }, 5)).toEqual({ kind: 'line', id: 'L0' })
  })

  it('does not hit the infinite extension beyond the segment', () => {
    expect(hitTest(sketch, { x: 200, y: 0 }, 5)).toBeNull()
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm --filter @plot/render test`
Expected: FAIL — cannot resolve `../src/grid` and `../src/hittest`.

- [ ] **Step 4: Implement the grid step**

Create `packages/render/src/grid.ts`:
```ts
export function niceStep(target: number): number {
  const safe = Math.max(target, Number.EPSILON)
  const pow = Math.pow(10, Math.floor(Math.log10(safe)))
  const f = safe / pow
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return m * pow
}
```

- [ ] **Step 5: Implement hit-testing**

Create `packages/render/src/hittest.ts`:
```ts
import { distance } from '@plot/core'
import type { Sketch, Vec2 } from '@plot/core'

export type Hit = { kind: 'point'; id: string } | { kind: 'line'; id: string }

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

export function hitTest(sketch: Sketch, world: Vec2, tolWorld: number): Hit | null {
  let best: { d: number; hit: Hit } | null = null

  for (const p of Object.values(sketch.points)) {
    const d = distance(world, p)
    if (d <= tolWorld && (best === null || d < best.d)) best = { d, hit: { kind: 'point', id: p.id } }
  }
  if (best !== null) return best.hit

  for (const l of Object.values(sketch.lines)) {
    const a = sketch.points[l.a]
    const b = sketch.points[l.b]
    if (!a || !b) continue
    const d = pointSegmentDistance(world, a, b)
    if (d <= tolWorld && (best === null || d < best.d)) best = { d, hit: { kind: 'line', id: l.id } }
  }
  return best === null ? null : best.hit
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @plot/render test`
Expected: PASS (camera + grid + hittest).

- [ ] **Step 7: Commit**

```bash
git add packages/render
git commit -m "feat(render): add adaptive grid step and analytic hit-testing"
```

---

## Task 5: `@plot/render` — layered Canvas2D renderer + barrel

The renderer is verified visually via the app (Task 6); here we implement it and confirm it typechecks. It draws into three stacked canvases supplied by the caller: a cached grid layer, a geometry layer, and an overlay layer for hover/selection. All stroke widths, point radii, and grid lines are kept constant in screen pixels (geometry positions come from the world→screen transform; sizes do not scale with zoom).

**Files:**
- Create: `packages/render/src/renderer.ts`, `packages/render/src/index.ts`

- [ ] **Step 1: Implement the renderer**

Create `packages/render/src/renderer.ts`:
```ts
import type { PlotDocument } from '@plot/document'
import { worldToScreen } from './camera'
import { niceStep } from './grid'
import type { Camera } from './camera'
import type { Hit } from './hittest'

export interface RenderState {
  doc: PlotDocument
  camera: Camera
  selection: ReadonlySet<string>
  hover: Hit | null
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
```

- [ ] **Step 2: Create the barrel**

Create `packages/render/src/index.ts`:
```ts
export * from './camera'
export * from './grid'
export * from './hittest'
export * from './renderer'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @plot/render typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/render
git commit -m "feat(render): add layered Canvas2D renderer"
```

---

## Task 6: `apps/web` — React + Zustand shell with pan/zoom/select

A real React app that mounts three stacked canvases, drives `CanvasRenderer`, and wires interaction through a Zustand store. It loads a seeded, pre-solved document (a 3×2 m rectangle) and supports: wheel zoom at cursor, drag-to-pan (on empty space), hover highlight, click-to-select, a "Fit" button (zoom-to-fit), and Undo/Redo buttons wired to the history (even though no edits exist yet, selection-independent history plumbing is proven by a no-op-safe path; the buttons reflect `canUndo`/`canRedo` and are disabled at slice 1 since nothing commits — that is expected and correct).

Verification is manual in the browser (controller will drive it). Your job: correct files, clean typecheck, successful build, committed.

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/seed.ts`, `apps/web/src/store.ts`, `apps/web/src/CanvasView.tsx`, `apps/web/src/App.tsx`, `apps/web/src/main.tsx`

- [ ] **Step 1: Create the manifest**

Create `apps/web/package.json`:
```json
{
  "name": "@plot/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@plot/core": "workspace:*",
    "@plot/document": "workspace:*",
    "@plot/render": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create the Vite config**

Create `apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 3: Create the app tsconfig**

Create `apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "rootDir": "."
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create the HTML entry**

Create `apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plot</title>
    <style>
      html, body, #root { height: 100%; margin: 0; }
      body { font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the seed document**

Create `apps/web/src/seed.ts`:
```ts
import { createDocument } from '@plot/document'
import type { PlotDocument } from '@plot/document'

const M = 1_000_000

export function seedDocument(): PlotDocument {
  const doc = createDocument('m')
  doc.sketch.points = {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 3 * M, y: 0, fixed: false },
    p2: { type: 'point', id: 'p2', x: 3 * M, y: 2 * M, fixed: false },
    p3: { type: 'point', id: 'p3', x: 0, y: 2 * M, fixed: false },
  }
  doc.sketch.lines = {
    L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' },
    L1: { type: 'line', id: 'L1', a: 'p1', b: 'p2' },
    L2: { type: 'line', id: 'L2', a: 'p2', b: 'p3' },
    L3: { type: 'line', id: 'L3', a: 'p3', b: 'p0' },
  }
  return doc
}
```

- [ ] **Step 6: Create the store**

Create `apps/web/src/store.ts`:
```ts
import { create } from 'zustand'
import { createHistory, commit, undo, redo, canUndo, canRedo } from '@plot/document'
import type { History, PlotDocument } from '@plot/document'
import type { Camera, Hit } from '@plot/render'
import { seedDocument } from './seed'

interface EditorState {
  history: History<PlotDocument>
  camera: Camera
  selection: Set<string>
  hover: Hit | null
  doc: () => PlotDocument
  setCamera: (c: Camera) => void
  setHover: (h: Hit | null) => void
  select: (h: Hit | null) => void
  commitDoc: (next: PlotDocument) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useEditor = create<EditorState>((set, get) => ({
  history: createHistory(seedDocument()),
  camera: { scale: 0.0001, tx: 100, ty: 400 },
  selection: new Set(),
  hover: null,
  doc: () => get().history.present,
  setCamera: (camera) => set({ camera }),
  setHover: (hover) => set({ hover }),
  select: (h) => set({ selection: h ? new Set([h.id]) : new Set() }),
  commitDoc: (next) => set((s) => ({ history: commit(s.history, next) })),
  undo: () => set((s) => ({ history: undo(s.history) })),
  redo: () => set((s) => ({ history: redo(s.history) })),
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
}))
```

- [ ] **Step 7: Create the canvas view**

Create `apps/web/src/CanvasView.tsx`. Requirements (write idiomatic React; the contract is precise):
- Renders a relatively-positioned container filling its parent, with three absolutely-positioned, stacked `<canvas>` elements (grid, geometry, overlay) in that DOM order.
- On mount: create one `CanvasRenderer` (from `@plot/render`) over the three canvases (use refs). Observe the container size with a `ResizeObserver`; on resize call `renderer.resize(cssW, cssH, window.devicePixelRatio)` and re-render. On first measure, set the camera with `fitToBounds(documentBounds, cssW, cssH)` so the seed rectangle is framed.
- Subscribe to the store (`doc`, `camera`, `selection`, `hover`) and call `renderer.render({ doc, camera, selection, hover })` whenever any of them change (a `useEffect` depending on those values is fine).
- Pointer interaction (attach to the top/overlay canvas):
  - `wheel`: `preventDefault`; compute the cursor position relative to the canvas; `setCamera(zoomAt(camera, cursor, factor))` where `factor = e.deltaY < 0 ? 1.1 : 1/1.1`.
  - `pointerdown`: compute world point via `screenToWorld`; `hitTest(doc.sketch, world, tolPx / camera.scale)` with `tolPx = 8`. If there is a hit, remember it as a potential click selection AND do not start panning. If no hit, begin panning: record the start screen point.
  - `pointermove`: if panning, `setCamera(panBy(camera, dx, dy))` using the screen delta since the last move. If not panning, update hover via `hitTest` and `setHover`.
  - `pointerup`: if not panning and the up is on the same spot as down (no significant drag, e.g. < 4px), `select(hitAtDownOrNull)`. End panning. (Use `setPointerCapture` on down / release on up for robust dragging.)
- Convert client coordinates to canvas-local coordinates using `canvas.getBoundingClientRect()`.

Reference skeleton (fill in the bodies per the requirements above):
```tsx
import { useEffect, useRef } from 'react'
import { CanvasRenderer, fitToBounds, screenToWorld, panBy, zoomAt, hitTest } from '@plot/render'
import { useEditor } from './store'

function documentBounds(doc: ReturnType<typeof useEditor.getState>['history']['present']) {
  const xs: number[] = []
  const ys: number[] = []
  for (const p of Object.values(doc.sketch.points)) { xs.push(p.x); ys.push(p.y) }
  if (xs.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLCanvasElement>(null)
  const geomRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CanvasRenderer | null>(null)
  // ... create renderer on mount, ResizeObserver, pointer handlers, render effect ...
  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={gridRef} style={layer} />
      <canvas ref={geomRef} style={layer} />
      <canvas ref={overlayRef} style={{ ...layer, touchAction: 'none' }} />
    </div>
  )
}

const layer: React.CSSProperties = { position: 'absolute', inset: 0 }
```
The `fitToBounds` initial camera should be applied once after the first resize measurement. Expose a `fitView()` capability the toolbar can call — simplest is to keep a module-level or ref'd function, or recompute and `setCamera(fitToBounds(...))` in an effect triggered by a `fitNonce` counter in the store. Pick the cleaner approach; document your choice in the report.

- [ ] **Step 8: Create the App shell**

Create `apps/web/src/App.tsx`:
```tsx
import { useEditor } from './store'
import { CanvasView } from './CanvasView'

export function App() {
  const selection = useEditor((s) => s.selection)
  const undoFn = useEditor((s) => s.undo)
  const redoFn = useEditor((s) => s.redo)
  const canU = useEditor((s) => s.canUndo())
  const canR = useEditor((s) => s.canRedo())

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd', alignItems: 'center' }}>
        <strong>Plot</strong>
        <button onClick={undoFn} disabled={!canU}>Undo</button>
        <button onClick={redoFn} disabled={!canR}>Redo</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('plot:fit'))}>Fit</button>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>
          {selection.size > 0 ? `Selected: ${[...selection].join(', ')}` : 'Nothing selected'}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        <CanvasView />
      </div>
    </div>
  )
}
```
Wire the "Fit" button via the `plot:fit` window event (listen in `CanvasView` and recompute `fitToBounds`), or replace this with a store-based `fitNonce` if you prefer — either is acceptable; keep it simple and note your choice.

- [ ] **Step 9: Create the entry**

Create `apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 10: Install, typecheck, build**

Run:
```bash
pnpm install
pnpm --filter @plot/web typecheck
pnpm --filter @plot/web build
```
Expected: typecheck zero errors; build succeeds and emits `dist/`.

- [ ] **Step 11: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): React+Zustand shell with pan/zoom/select"
```

---

## Final verification

- [ ] Run `pnpm test` — all `@plot/core`, `@plot/document`, `@plot/render` unit tests pass (plus the existing `@plot/solver-worker` integration test).
- [ ] Run `pnpm typecheck` — zero errors across all packages.
- [ ] Run `pnpm --filter @plot/web build` — succeeds.
- [ ] Manual (controller-driven) browser check: `pnpm --filter @plot/web dev`, open the app; the seed rectangle is framed by Fit; mouse wheel zooms toward the cursor; dragging empty space pans; hovering an edge/point highlights it green; clicking selects it (amber) and the toolbar shows its id; the grid stays crisp and adapts spacing as you zoom.

---

## Self-review against the slice

- **Versioned document model (Zod) + undo/redo** → Tasks 1–2. ✓
- **Camera math (world↔screen, pan, zoom-at-cursor, fit)** → Task 3. ✓
- **Hit-testing (point preferred over line, segment not infinite ray)** → Task 4. ✓
- **Adaptive grid step** → Task 4 (`niceStep`), used by renderer in Task 5. ✓
- **Layered Canvas2D renderer, HiDPI, constant screen-space sizes** → Task 5. ✓
- **React + Zustand shell: pan, zoom, fit, hover, select** → Task 6. ✓
- **Deferred (not gaps):** draw tools + solving (slice 2), constraint inference + dimension chips + state colors + toast (slice 3), persistence/export/templates/PWA (slice 4), RBush, Immer. Documented above.
```
