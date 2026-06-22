# Plot v1 — Slice 2: Draw & Edit Geometry (with live solving) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the canvas editable: draw line segments and rectangles, select and drag points (the PlaneGCS solver keeps rectangles square as you drag a corner), see live edge-length labels in the document's units, and delete geometry — all undoable.

**Architecture:** Add pure, TDD'd document mutations to `@plot/document` (id generation, `addLineSegment`, `addRectangle` with horizontal/vertical constraints, `movePoint`, `setPointFixed`, `deleteEntity` with referential cleanup, and `formatLength`). Extend `@plot/render` to draw an in-progress draft and edge-length labels. Wire the existing `@plot/solver-worker` into `apps/web` (a worker-backed `ISolver`) and add a tool layer (select / line / rectangle) to the Zustand store + `CanvasView`: drawing commits geometry and runs the solver; dragging a point temporarily fixes it at the cursor and re-solves so constrained shapes follow.

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5, Vite 5; `@plot/core`, `@plot/document`, `@plot/render`, `@plot/solver-worker`.

**Scope note:** Slice 2 only. Deferred to Slice 3: auto-inferred constraints while drawing (snapping → constraints), the type-to-set dimension chip, double-click-to-edit dimensions, blue/black/red state coloring, and the over-constraint toast. Deferred to Slice 4: persistence/export/templates/PWA. Polygon/circle/arc tools are deferred (line + rectangle prove the loop). Rectangles get horizontal/vertical constraints so the solver visibly keeps them square; free lines carry no constraints yet.

---

## File structure

```
packages/document/
  src/
    ids.ts            NEW: IdGen factory
    mutate.ts         NEW: addLineSegment, addRectangle, movePoint, setPointFixed, deleteEntity
    format.ts         NEW: formatLength(um, unit)
    index.ts          MODIFY: export the three new modules
  test/
    ids.test.ts       NEW
    mutate.test.ts    NEW
    format.test.ts    NEW
packages/render/
  src/
    renderer.ts       MODIFY: RenderState gains optional `draft`; draw edge-length labels + draft preview
    index.ts          (re-exports unchanged; Draft type exported from renderer)
apps/web/
  src/
    solver.ts         NEW: module-singleton worker ISolver
    store.ts          MODIFY: tool mode, draft, drag state, solve-and-commit actions
    CanvasView.tsx    MODIFY: per-tool pointer handling, drag-with-solve, draft preview, delete key
    App.tsx           MODIFY: tool buttons (Select/Line/Rect) + shortcuts + Delete
```

---

## Task 1: `@plot/document` — id generation, mutations, formatting (pure, TDD)

**Files:**
- Create: `packages/document/src/ids.ts`, `packages/document/src/mutate.ts`, `packages/document/src/format.ts`, and tests; Modify: `packages/document/src/index.ts`

- [ ] **Step 1: Write the failing id test**

Create `packages/document/test/ids.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createIdGen } from '../src/ids'

describe('createIdGen', () => {
  it('produces sequential prefixed ids', () => {
    const gen = createIdGen()
    expect(gen('p')).toBe('p0')
    expect(gen('p')).toBe('p1')
    expect(gen('L')).toBe('L2')
  })

  it('can start from a given number', () => {
    const gen = createIdGen(10)
    expect(gen('c')).toBe('c10')
  })
})
```

- [ ] **Step 2: Write the failing format test**

Create `packages/document/test/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { formatLength } from '../src/format'

describe('formatLength', () => {
  it('formats micrometers per unit', () => {
    expect(formatLength(3_200_000, 'm')).toBe('3.20 m')
    expect(formatLength(3_200_000, 'cm')).toBe('320.0 cm')
    expect(formatLength(3_200_000, 'mm')).toBe('3200 mm')
  })

  it('formats feet to 2 decimals', () => {
    expect(formatLength(304_800, 'ft')).toBe('1.00 ft')
  })
})
```

- [ ] **Step 3: Write the failing mutate test**

Create `packages/document/test/mutate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addLineSegment, addRectangle, movePoint, setPointFixed, deleteEntity } from '../src/mutate'

describe('addLineSegment', () => {
  it('adds two points and a line, rounding coordinates', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100.4, 0)
    expect(Object.keys(doc.sketch.points)).toHaveLength(2)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(1)
    const line = doc.sketch.lines.L2!
    expect(doc.sketch.points[line.b]!.x).toBe(100)
  })
})

describe('addRectangle', () => {
  it('adds 4 points, 4 lines, and 4 H/V constraints normalized to min/max', () => {
    const doc = addRectangle(createDocument('m'), createIdGen(), 300, 200, 0, 0)
    expect(Object.keys(doc.sketch.points)).toHaveLength(4)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(4)
    expect(doc.sketch.constraints).toHaveLength(4)
    const xs = Object.values(doc.sketch.points).map((p) => p.x).sort((a, b) => a - b)
    const ys = Object.values(doc.sketch.points).map((p) => p.y).sort((a, b) => a - b)
    expect(xs).toEqual([0, 0, 300, 300])
    expect(ys).toEqual([0, 0, 200, 200])
    const kinds = doc.sketch.constraints.map((c) => c.kind).sort()
    expect(kinds).toEqual(['horizontal', 'horizontal', 'vertical', 'vertical'])
  })
})

describe('movePoint / setPointFixed', () => {
  it('moves a point (rounded) and leaves others alone', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    doc = movePoint(doc, 'p0', 5.6, -3.2)
    expect(doc.sketch.points.p0).toMatchObject({ x: 6, y: -3 })
  })

  it('toggles a point fixed flag immutably', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    const next = setPointFixed(doc, 'p0', true)
    expect(next.sketch.points.p0!.fixed).toBe(true)
    expect(doc.sketch.points.p0!.fixed).toBe(false)
  })

  it('ignores a missing point id', () => {
    const doc = createDocument('m')
    expect(movePoint(doc, 'nope', 1, 1)).toBe(doc)
  })
})

describe('deleteEntity', () => {
  it('deleting a point removes dependent lines and constraints', () => {
    const doc = addRectangle(createDocument('m'), createIdGen(), 0, 0, 300, 200)
    // points p0..p3, lines L4..L7, constraints c8..c11
    const next = deleteEntity(doc, 'p0')
    expect(next.sketch.points.p0).toBeUndefined()
    // p0 was in two lines (bottom + left); both removed
    expect(Object.keys(next.sketch.lines)).toHaveLength(2)
    // constraints on removed lines are gone
    expect(next.sketch.constraints.length).toBeLessThan(doc.sketch.constraints.length)
  })

  it('deleting a line removes the line and its constraints but keeps points', () => {
    const doc = addRectangle(createDocument('m'), createIdGen(), 0, 0, 300, 200)
    const next = deleteEntity(doc, 'L4')
    expect(next.sketch.lines.L4).toBeUndefined()
    expect(Object.keys(next.sketch.points)).toHaveLength(4)
    expect(next.sketch.constraints.every((c) => !('line' in c) || c.line !== 'L4')).toBe(true)
  })

  it('returns the same doc for an unknown id', () => {
    const doc = createDocument('m')
    expect(deleteEntity(doc, 'ghost')).toBe(doc)
  })
})
```
Note the id numbering: `createIdGen()` is shared across a single `addRectangle` call, which emits points first (`p0,p1,p2,p3`), then lines (`L4,L5,L6,L7`), then constraints (`c8,c9,c10,c11`). The tests above rely on this ordering — implement the emission order accordingly.

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @plot/document test`
Expected: FAIL — cannot resolve the new modules.

- [ ] **Step 5: Implement `ids.ts`**

Create `packages/document/src/ids.ts`:
```ts
export type IdGen = (prefix: string) => string

export function createIdGen(start = 0): IdGen {
  let n = start
  return (prefix: string) => `${prefix}${n++}`
}
```

- [ ] **Step 6: Implement `format.ts`**

Create `packages/document/src/format.ts`:
```ts
import type { Unit } from './document'

export function formatLength(um: number, unit: Unit): string {
  const m = um / 1_000_000
  switch (unit) {
    case 'mm':
      return `${(m * 1000).toFixed(0)} mm`
    case 'cm':
      return `${(m * 100).toFixed(1)} cm`
    case 'm':
      return `${m.toFixed(2)} m`
    case 'ft':
      return `${(m / 0.3048).toFixed(2)} ft`
  }
}
```

- [ ] **Step 7: Implement `mutate.ts`**

Create `packages/document/src/mutate.ts`:
```ts
import type { PlotDocument } from './document'
import type { IdGen } from './ids'

type Constraint = PlotDocument['sketch']['constraints'][number]

const round = (n: number): number => Math.round(n)

export function addLineSegment(
  doc: PlotDocument,
  gen: IdGen,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): PlotDocument {
  const a = { type: 'point' as const, id: gen('p'), x: round(ax), y: round(ay), fixed: false }
  const b = { type: 'point' as const, id: gen('p'), x: round(bx), y: round(by), fixed: false }
  const l = { type: 'line' as const, id: gen('L'), a: a.id, b: b.id }
  return {
    ...doc,
    sketch: {
      ...doc.sketch,
      points: { ...doc.sketch.points, [a.id]: a, [b.id]: b },
      lines: { ...doc.sketch.lines, [l.id]: l },
    },
  }
}

export function addRectangle(
  doc: PlotDocument,
  gen: IdGen,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PlotDocument {
  const minX = round(Math.min(x0, x1))
  const maxX = round(Math.max(x0, x1))
  const minY = round(Math.min(y0, y1))
  const maxY = round(Math.max(y0, y1))

  const p0 = { type: 'point' as const, id: gen('p'), x: minX, y: minY, fixed: false }
  const p1 = { type: 'point' as const, id: gen('p'), x: maxX, y: minY, fixed: false }
  const p2 = { type: 'point' as const, id: gen('p'), x: maxX, y: maxY, fixed: false }
  const p3 = { type: 'point' as const, id: gen('p'), x: minX, y: maxY, fixed: false }

  const L0 = { type: 'line' as const, id: gen('L'), a: p0.id, b: p1.id }
  const L1 = { type: 'line' as const, id: gen('L'), a: p1.id, b: p2.id }
  const L2 = { type: 'line' as const, id: gen('L'), a: p2.id, b: p3.id }
  const L3 = { type: 'line' as const, id: gen('L'), a: p3.id, b: p0.id }

  const cs: Constraint[] = [
    { id: gen('c'), kind: 'horizontal', line: L0.id },
    { id: gen('c'), kind: 'horizontal', line: L2.id },
    { id: gen('c'), kind: 'vertical', line: L1.id },
    { id: gen('c'), kind: 'vertical', line: L3.id },
  ]

  return {
    ...doc,
    sketch: {
      points: { ...doc.sketch.points, [p0.id]: p0, [p1.id]: p1, [p2.id]: p2, [p3.id]: p3 },
      lines: { ...doc.sketch.lines, [L0.id]: L0, [L1.id]: L1, [L2.id]: L2, [L3.id]: L3 },
      constraints: [...doc.sketch.constraints, ...cs],
    },
  }
}

export function movePoint(doc: PlotDocument, id: string, x: number, y: number): PlotDocument {
  const p = doc.sketch.points[id]
  if (!p) return doc
  return {
    ...doc,
    sketch: { ...doc.sketch, points: { ...doc.sketch.points, [id]: { ...p, x: round(x), y: round(y) } } },
  }
}

export function setPointFixed(doc: PlotDocument, id: string, fixed: boolean): PlotDocument {
  const p = doc.sketch.points[id]
  if (!p) return doc
  return {
    ...doc,
    sketch: { ...doc.sketch, points: { ...doc.sketch.points, [id]: { ...p, fixed } } },
  }
}

function refsLine(c: Constraint, lineId: string): boolean {
  switch (c.kind) {
    case 'horizontal':
    case 'vertical':
    case 'distance':
      return c.line === lineId
    case 'parallel':
    case 'perpendicular':
    case 'equalLength':
      return c.l1 === lineId || c.l2 === lineId
    case 'coincident':
      return false
  }
}

export function deleteEntity(doc: PlotDocument, id: string): PlotDocument {
  const s = doc.sketch

  if (s.points[id]) {
    const removedLineIds = new Set(
      Object.values(s.lines).filter((l) => l.a === id || l.b === id).map((l) => l.id),
    )
    const points = { ...s.points }
    delete points[id]
    const lines = Object.fromEntries(Object.entries(s.lines).filter(([lid]) => !removedLineIds.has(lid)))
    const constraints = s.constraints.filter((c) => {
      if (c.kind === 'coincident') return c.a !== id && c.b !== id
      return ![...removedLineIds].some((lid) => refsLine(c, lid))
    })
    return { ...doc, sketch: { points, lines, constraints } }
  }

  if (s.lines[id]) {
    const lines = { ...s.lines }
    delete lines[id]
    const constraints = s.constraints.filter((c) => !refsLine(c, id))
    return { ...doc, sketch: { ...s, lines, constraints } }
  }

  return doc
}
```

- [ ] **Step 8: Update the barrel**

Modify `packages/document/src/index.ts` to add:
```ts
export * from './ids'
export * from './mutate'
export * from './format'
```

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm --filter @plot/document test` (all pass) and `pnpm --filter @plot/document typecheck` (zero errors).

- [ ] **Step 10: Commit**

```bash
git add packages/document
git commit -m "feat(document): geometry mutations, id gen, and length formatting"
```

---

## Task 2: `@plot/render` — draft preview + edge-length labels

Extend the renderer so it can draw an in-progress draft (the shape being drawn) and a length label centered on each edge. Labels are screen-space, drawn with a small translucent background pill for legibility, using `formatLength(distanceUm, doc.units)`.

**Files:**
- Modify: `packages/render/src/renderer.ts` (and ensure `Draft` is exported via the barrel, which re-exports `./renderer`)

- [ ] **Step 1: Extend `RenderState` and add a `Draft` type**

In `packages/render/src/renderer.ts`, add near the top (after imports):
```ts
import { distance } from '@plot/core'
import { formatLength } from '@plot/document'
import type { Vec2 } from '@plot/core'
```
Add the `Draft` type and extend `RenderState`:
```ts
export type Draft =
  | { kind: 'line'; a: Vec2; b: Vec2 }
  | { kind: 'rect'; a: Vec2; b: Vec2 }
```
Add an optional `draft` field to `RenderState`:
```ts
export interface RenderState {
  doc: PlotDocument
  camera: Camera
  selection: ReadonlySet<string>
  hover: Hit | null
  draft?: Draft | null
}
```

- [ ] **Step 2: Draw edge-length labels in `drawGeometry`**

After the loop that strokes each line (still inside `drawGeometry`), add a labels pass that, for each line, computes the world-space length and draws the formatted label at the screen-space midpoint:
```ts
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
```
(`drawGeometry` currently receives `s: RenderState` — use `s.doc.units`. If it only destructured `sketch`/`c`, keep those and reference `s.doc.units`.)

- [ ] **Step 3: Draw the draft in `drawOverlay`**

At the end of `drawOverlay`, render the in-progress draft as a dashed preview:
```ts
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
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @plot/render typecheck`
Expected: zero errors. (`@plot/document` is already a dependency of `@plot/render`.)

- [ ] **Step 5: Commit**

```bash
git add packages/render
git commit -m "feat(render): draft preview and edge-length labels"
```

---

## Task 3: `apps/web` — tools, solver wiring, drag-to-solve, delete

Wire the worker solver and add a tool layer. Drawing commits geometry and re-solves; dragging a point temporarily fixes it at the cursor and re-solves so rectangles stay square; Delete removes the selection. Verified by the controller in a browser.

**Files:**
- Create: `apps/web/src/solver.ts`
- Modify: `apps/web/src/store.ts`, `apps/web/src/CanvasView.tsx`, `apps/web/src/App.tsx`

- [ ] **Step 1: Create the solver singleton**

Create `apps/web/src/solver.ts`:
```ts
import { createWorkerSolver } from '@plot/solver-worker'
import type { ISolver } from '@plot/core'

let solver: ISolver | null = null

export function getSolver(): ISolver {
  if (!solver) solver = createWorkerSolver()
  return solver
}
```

- [ ] **Step 2: Extend the store**

Modify `apps/web/src/store.ts` to add tool mode, draft, drag state, and solve-aware actions. Add to the state interface and implementation:
- `tool: 'select' | 'line' | 'rect'` and `setTool(tool)`.
- `draft: Draft | null` and `setDraft(d)`.
- `commit(next: PlotDocument): void` — push to history (no solve), for structural edits where you'll solve separately, and for delete.
- `solveAndCommit(next: PlotDocument): Promise<void>` — run `solveSketch(next, getSolver())`, then `commit` the solved document. Used after creating a rectangle and after finishing a drag.
- `preview: PlotDocument | null` and `setPreview(doc)` — a transient document shown during drag without touching history; `doc()` selector should return `preview ?? history.present`.
- `solvePreview(next: PlotDocument): Promise<void>` — solve `next` and store as `preview` (latest-wins: ignore a resolved solve if a newer one started; track an incrementing token).
- `clearPreview(): void`.
Import `Draft` from `@plot/render`, `solveSketch` from `@plot/core`, `getSolver` from `./solver`. Keep `doc()` returning `preview ?? history.present` so the renderer shows live drag results.

- [ ] **Step 3: Per-tool interaction in `CanvasView`**

Modify `apps/web/src/CanvasView.tsx` pointer handling to branch on `tool` (read via `useEditor.getState().tool`). Keep the camera pan/zoom on the appropriate gestures (pan should remain available — bind panning to the middle button or to left-drag-on-empty only in `select` tool; in `line`/`rect` tools, left-click draws). Behaviors:
- **select tool** (existing + drag): pointerdown hit a point → begin dragging it: `setPointFixed(present, id, true)` as the drag base; on each pointermove, `movePoint(base, id, world)` then `solvePreview(moved)`; on pointerup, take the current solved `preview`, restore the point's original `fixed` flag via `setPointFixed`, `solveAndCommit` (or `commit` if already solved), and `clearPreview`. If pointerdown hits nothing → pan (as today). Click with no drag and no hit → clear selection; click on a hit with no drag → select it.
- **line tool**: first click sets the start world point and a `draft = { kind:'line', a, b:a }`; pointermove updates `draft.b` to the cursor world point; second click calls `addLineSegment(present, idGen, a.x,a.y,b.x,b.y)` then `solveAndCommit`, and clears the draft. Esc cancels the draft.
- **rect tool**: first click sets corner `a` and `draft = { kind:'rect', a, b:a }`; pointermove updates `draft.b`; second click calls `addRectangle(present, idGen, a.x,a.y,b.x,b.y)` then `solveAndCommit`, clears draft. Esc cancels.
- Use one module-level `createIdGen()` seeded high enough to avoid colliding with seed ids (e.g. `createIdGen(1000)`), or re-seed from the current max id; simplest: `createIdGen(Date.now() % 100000)` is NOT allowed (non-determinism in tests is irrelevant here, but prefer a simple counter) — use a module-level `createIdGen(1000)`; collisions with the 4 seed ids (`p0..p3`,`L0..L3`) are avoided because the generator starts at 1000.
- Set the draft into the store (`setDraft`) so the renderer draws the preview; pass `draft` into `renderer.render({ ..., draft })`.
- Update the render effect and its dependency list to include `draft` (and `preview` via `doc()`).

- [ ] **Step 4: Delete key + tool shortcuts**

In `CanvasView` (or App), add a `keydown` listener: `Delete`/`Backspace` → for each id in selection, `deleteEntity`, then `commit` and clear selection; `v`→select, `l`→line, `r`→rect, `Escape`→cancel draft/clear selection. Register/cleanup in a `useEffect`.

- [ ] **Step 5: Toolbar buttons**

Modify `apps/web/src/App.tsx` to add tool buttons (Select / Line / Rect) that call `setTool`, showing the active tool (e.g. bold or a border). Keep Undo/Redo/Fit. Add a Delete button that triggers the same delete path as the key.

- [ ] **Step 6: Install/typecheck/build**

Run:
```bash
pnpm --filter @plot/web typecheck
pnpm --filter @plot/web build
```
Expected: zero typecheck errors; build succeeds.
Do NOT do interactive browser testing — the controller verifies runtime behavior.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): draw tools, solver wiring, drag-to-solve, delete"
```

---

## Final verification

- [ ] `pnpm test` — all unit tests pass (core, document incl. new mutate/ids/format, render, solver-worker).
- [ ] `pnpm typecheck` — zero errors across all packages.
- [ ] `pnpm --filter @plot/web build` — succeeds.
- [ ] Manual (controller-driven) browser check: pick the Rect tool, draw a rectangle (two clicks) → it appears with edge-length labels; switch to Select, drag a corner → the rectangle resizes and stays axis-aligned (solver enforcing H/V); draw a Line; select an edge and press Delete → it's removed; Undo restores it; the grid/labels stay crisp through zoom.

---

## Self-review against the slice

- **Geometry mutations (add line/rect, move, fix, delete + cleanup) pure & TDD** → Task 1. ✓
- **Rectangle carries H/V constraints so the solver keeps it square** → Task 1 (`addRectangle`) + Task 3 (solve-and-commit / drag-solve). ✓
- **Length formatting + edge labels + draft preview** → Task 1 (`formatLength`) + Task 2. ✓
- **Solver wired into the editor (worker ISolver), drawing & dragging re-solve** → Task 3. ✓
- **Select/Line/Rect tools, drag, delete, shortcuts, toolbar** → Task 3. ✓
- **Deferred (not gaps):** auto-inferred constraints, dimension chips/type-to-set, double-click edit, state coloring, over-constraint toast (Slice 3); polygon/circle/arc; persistence/export/PWA (Slice 4).
```
