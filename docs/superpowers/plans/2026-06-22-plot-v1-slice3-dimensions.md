# Plot v1 — Slice 3: Type Real Dimensions + Inference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deliver the headline interaction — draw rough, then type the real length and the solver makes it exact. Double-click any edge to set its exact length; type a length while drawing a line; near-horizontal/vertical lines auto-gain H/V constraints; a line endpoint snaps to a nearby existing point (coincident via merge); a conflicting dimension is reverted with a non-blocking toast.

**Architecture:** Add pure, TDD'd helpers to `@plot/document` (`setLineLength` = add-or-update a distance constraint, `addAxisConstraint`, `mergePoint`) and `@plot/document/infer.ts` (`inferAxis`, `snapPoint`). Extend `@plot/render` to draw snap hints. In `apps/web`, give the store a status-aware solve so over-constraint can be detected and reverted with a toast, add a DOM dimension chip (type-to-set while drawing) and a double-click inline edge editor, and wire axis inference + endpoint snap into the draw tools.

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5, Vite 5; `@plot/core` (`buildSolveRequest`, `applySolveResult`, `ISolver`, `distance`, `umToMeters`), `@plot/document`, `@plot/render`, `@plot/solver-worker`.

**Scope note:** Slice 3 only. Deferred: parallel/perpendicular/equal-length *inference* (the constraints exist in core; only auto-inference of them is deferred); per-entity blue/black "fully defined" coloring and a DOF-based status pill (needs solver DOF data the PlaneGCS npm wrapper doesn't expose — a v2 item); polygon/circle/arc. Deferred to Slice 4: persistence/export/templates/PWA. Angle entry in the chip is deferred — length only this slice.

---

## File structure

```
packages/document/
  src/
    infer.ts          NEW: inferAxis, snapPoint (pure)
    mutate.ts         MODIFY: setLineLength, addAxisConstraint, mergePoint
    index.ts          MODIFY: export ./infer
  test/
    infer.test.ts     NEW
    mutate.test.ts    MODIFY: add tests for the 3 new mutations
packages/render/
  src/
    renderer.ts       MODIFY: RenderState gains optional `snap`; draw snap hints
apps/web/
  src/
    store.ts          MODIFY: status-aware solve, setLineLengthAndSolve (revert+toast), toast state, snap state
    CanvasView.tsx    MODIFY: axis inference + endpoint snap on draw, snap-hint feedback, double-click edge editor trigger
    DimensionChip.tsx NEW: type-to-set length input while drawing
    EdgeEditor.tsx    NEW: inline length editor on double-click
    Toast.tsx         NEW: transient message
    App.tsx           MODIFY: mount Toast
```

---

## Task 1: `@plot/document` — dimension/axis/merge mutations + inference (pure, TDD)

**Files:** Create `packages/document/src/infer.ts`, `packages/document/test/infer.test.ts`; Modify `packages/document/src/mutate.ts`, `packages/document/src/index.ts`, `packages/document/test/mutate.test.ts`

- [ ] **Step 1: Write the failing infer test**

Create `packages/document/test/infer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { inferAxis, snapPoint } from '../src/infer'
import type { Sketch } from '@plot/core'

describe('inferAxis', () => {
  it('detects near-horizontal within tolerance', () => {
    expect(inferAxis(0, 0, 100, 2)).toBe('horizontal')
    expect(inferAxis(0, 0, 100, 0)).toBe('horizontal')
    expect(inferAxis(0, 0, -100, 1)).toBe('horizontal')
  })
  it('detects near-vertical within tolerance', () => {
    expect(inferAxis(0, 0, 2, 100)).toBe('vertical')
  })
  it('returns null for diagonal lines', () => {
    expect(inferAxis(0, 0, 100, 100)).toBeNull()
  })
  it('returns null for a zero-length segment', () => {
    expect(inferAxis(5, 5, 5, 5)).toBeNull()
  })
})

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: false },
    p1: { type: 'point', id: 'p1', x: 1000, y: 0, fixed: false },
  },
  lines: {},
  constraints: [],
}

describe('snapPoint', () => {
  it('returns the nearest point within tolerance', () => {
    expect(snapPoint(sketch, { x: 30, y: 0 }, 50)).toBe('p0')
  })
  it('returns null when none in range', () => {
    expect(snapPoint(sketch, { x: 500, y: 500 }, 50)).toBeNull()
  })
  it('excludes given ids', () => {
    expect(snapPoint(sketch, { x: 10, y: 0 }, 50, new Set(['p0']))).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing mutate tests (append to `mutate.test.ts`)**

Append to `packages/document/test/mutate.test.ts`:
```ts
import { setLineLength, addAxisConstraint, mergePoint } from '../src/mutate'

describe('setLineLength', () => {
  it('adds a distance constraint when none exists', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    const next = setLineLength(doc, createIdGen(50), 'L2', 3_000_000)
    const d = next.sketch.constraints.find((c) => c.kind === 'distance')
    expect(d).toMatchObject({ kind: 'distance', line: 'L2', value: 3_000_000 })
  })
  it('updates the existing distance constraint value (no duplicate)', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    doc = setLineLength(doc, createIdGen(50), 'L2', 3_000_000)
    const next = setLineLength(doc, createIdGen(60), 'L2', 5_000_000)
    const ds = next.sketch.constraints.filter((c) => c.kind === 'distance')
    expect(ds).toHaveLength(1)
    expect(ds[0]).toMatchObject({ value: 5_000_000 })
  })
  it('ignores an unknown line', () => {
    const doc = createDocument('m')
    expect(setLineLength(doc, createIdGen(), 'nope', 1)).toBe(doc)
  })
})

describe('addAxisConstraint', () => {
  it('adds a horizontal constraint to a line', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    const next = addAxisConstraint(doc, createIdGen(50), 'L2', 'horizontal')
    expect(next.sketch.constraints).toContainEqual({ id: 'c50', kind: 'horizontal', line: 'L2' })
  })
  it('does not duplicate an existing axis constraint', () => {
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    doc = addAxisConstraint(doc, createIdGen(50), 'L2', 'horizontal')
    const next = addAxisConstraint(doc, createIdGen(60), 'L2', 'horizontal')
    expect(next.sketch.constraints.filter((c) => c.kind === 'horizontal')).toHaveLength(1)
  })
})

describe('mergePoint', () => {
  it('remaps line endpoints from dropId to keepId and removes the dropped point', () => {
    // two separate segments sharing nothing
    let doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0) // p0,p1,L2
    doc = addLineSegment(doc, createIdGen(3), 100, 5, 200, 0) // p3,p4,L5
    // merge p3 onto p1 (join the two segments at that corner)
    const next = mergePoint(doc, 'p1', 'p3')
    expect(next.sketch.points.p3).toBeUndefined()
    expect(next.sketch.lines.L5!.a).toBe('p1')
    expect(Object.keys(next.sketch.points)).toHaveLength(3)
  })
  it('drops a line that becomes degenerate after merge', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0) // p0,p1,L2
    const next = mergePoint(doc, 'p0', 'p1') // L2 becomes p0->p0
    expect(next.sketch.lines.L2).toBeUndefined()
    expect(next.sketch.points.p1).toBeUndefined()
  })
  it('returns same doc when ids equal or missing', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0)
    expect(mergePoint(doc, 'p0', 'p0')).toBe(doc)
    expect(mergePoint(doc, 'p0', 'ghost')).toBe(doc)
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `pnpm --filter @plot/document test` — FAIL (missing exports).

- [ ] **Step 4: Implement `infer.ts`**

Create `packages/document/src/infer.ts`:
```ts
import { distance } from '@plot/core'
import type { Sketch, Vec2 } from '@plot/core'

export function inferAxis(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tolDeg = 4,
): 'horizontal' | 'vertical' | null {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return null
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) // 0..180
  if (ang <= tolDeg || ang >= 180 - tolDeg) return 'horizontal'
  if (Math.abs(ang - 90) <= tolDeg) return 'vertical'
  return null
}

export function snapPoint(
  sketch: Sketch,
  world: Vec2,
  tolWorld: number,
  exclude: ReadonlySet<string> = new Set(),
): string | null {
  let best: { d: number; id: string } | null = null
  for (const p of Object.values(sketch.points)) {
    if (exclude.has(p.id)) continue
    const d = distance(world, p)
    if (d <= tolWorld && (best === null || d < best.d)) best = { d, id: p.id }
  }
  return best === null ? null : best.id
}
```

- [ ] **Step 5: Implement the three mutations (append to `mutate.ts`)**

Append to `packages/document/src/mutate.ts`:
```ts
export function addAxisConstraint(
  doc: PlotDocument,
  gen: IdGen,
  lineId: string,
  axis: 'horizontal' | 'vertical',
): PlotDocument {
  if (!doc.sketch.lines[lineId]) return doc
  const exists = doc.sketch.constraints.some((c) => c.kind === axis && 'line' in c && c.line === lineId)
  if (exists) return doc
  const c: Constraint = { id: gen('c'), kind: axis, line: lineId }
  return { ...doc, sketch: { ...doc.sketch, constraints: [...doc.sketch.constraints, c] } }
}

export function setLineLength(doc: PlotDocument, gen: IdGen, lineId: string, valueUm: number): PlotDocument {
  if (!doc.sketch.lines[lineId]) return doc
  const value = round(valueUm)
  const idx = doc.sketch.constraints.findIndex((c) => c.kind === 'distance' && 'line' in c && c.line === lineId)
  if (idx >= 0) {
    const constraints = doc.sketch.constraints.map((c, i) =>
      i === idx && c.kind === 'distance' ? { ...c, value } : c,
    )
    return { ...doc, sketch: { ...doc.sketch, constraints } }
  }
  const c: Constraint = { id: gen('c'), kind: 'distance', line: lineId, value }
  return { ...doc, sketch: { ...doc.sketch, constraints: [...doc.sketch.constraints, c] } }
}

export function mergePoint(doc: PlotDocument, keepId: string, dropId: string): PlotDocument {
  if (keepId === dropId) return doc
  const s = doc.sketch
  if (!s.points[keepId] || !s.points[dropId]) return doc

  const lines: typeof s.lines = {}
  for (const [id, l] of Object.entries(s.lines)) {
    const a = l.a === dropId ? keepId : l.a
    const b = l.b === dropId ? keepId : l.b
    if (a === b) continue // degenerate line collapses
    lines[id] = { ...l, a, b }
  }
  const removedLineIds = new Set(Object.keys(s.lines).filter((id) => !lines[id]))

  const points = { ...s.points }
  delete points[dropId]

  const constraints: Constraint[] = []
  for (const c of s.constraints) {
    if (c.kind === 'coincident') {
      const a = c.a === dropId ? keepId : c.a
      const b = c.b === dropId ? keepId : c.b
      if (a === b) continue
      constraints.push({ ...c, a, b })
    } else if (![...removedLineIds].some((lid) => refsLine(c, lid))) {
      constraints.push(c)
    }
  }
  return { ...doc, sketch: { points, lines, constraints } }
}
```

- [ ] **Step 6: Update the barrel**

In `packages/document/src/index.ts` add: `export * from './infer'`.

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @plot/document test` (all pass) and `pnpm --filter @plot/document typecheck` (zero errors).

- [ ] **Step 8: Commit**

```bash
git add packages/document
git commit -m "feat(document): set-line-length, axis constraint, point merge, inference"
```

---

## Task 2: `@plot/render` — snap hints

Add an optional `snap` to `RenderState` and draw it on the overlay: an axis hint (a faint full-width/height colored line through the cursor) for horizontal/vertical, and a ring for an endpoint snap.

**Files:** Modify `packages/render/src/renderer.ts`

- [ ] **Step 1: Add the `SnapHint` type and `RenderState.snap`**

In `renderer.ts` add:
```ts
export type SnapHint =
  | { kind: 'horizontal'; at: Vec2 }
  | { kind: 'vertical'; at: Vec2 }
  | { kind: 'endpoint'; at: Vec2 }
```
and add `snap?: SnapHint | null` to `RenderState`.

- [ ] **Step 2: Draw the snap hint at the end of `drawOverlay`**

After the draft block in `drawOverlay`:
```ts
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
```

- [ ] **Step 3: Typecheck + test**

Run: `pnpm --filter @plot/render typecheck` (zero errors) and `pnpm --filter @plot/render test` (existing tests pass).

- [ ] **Step 4: Commit**

```bash
git add packages/render
git commit -m "feat(render): snap hints (axis lines and endpoint ring)"
```

---

## Task 3: `apps/web` — status-aware solve, dimension chip, double-click editor, inference/snap, toast

**Files:** Create `apps/web/src/DimensionChip.tsx`, `apps/web/src/EdgeEditor.tsx`, `apps/web/src/Toast.tsx`; Modify `apps/web/src/store.ts`, `apps/web/src/CanvasView.tsx`, `apps/web/src/App.tsx`

- [ ] **Step 1: Status-aware solve + toast + new state in `store.ts`**

Replace the internal solve helper so the store knows the solver status (the existing `solveSketch` swallows it). Use `@plot/core`'s `buildSolveRequest` + `applySolveResult` + `getSolver()`:
```ts
import { buildSolveRequest, applySolveResult } from '@plot/core'
// returns { status, doc }
async function solveDocStatus(next) {
  const res = await getSolver().solve(buildSolveRequest(next.sketch))
  return { status: res.status, doc: { ...next, sketch: applySolveResult(next.sketch, res) } }
}
```
Add store state/actions:
- `toast: string | null`, `setToast(msg)`, auto-clear handled by the `Toast` component.
- `snap: SnapHint | null`, `setSnap(s)` (imported from `@plot/render`).
- Rework `solveAndCommit(next)` and `solvePreview(next)` to use `solveDocStatus` (preserve the `solveSeq` latest-wins token from Slice 2 and the commit-bumps-token fix).
- `setLineLengthAndSolve(lineId, valueUm): Promise<void>`: build `setLineLength(history.present, idGen, lineId, valueUm)`; `solveDocStatus`; if `status !== 'ok'`, `setToast('That dimension conflicts — reverted.')` and DO NOT commit (leave history.present as-is, clear preview); else `commit(solved)`. (Use a module-level `createIdGen` shared with CanvasView, or pass one in — keep a single generator so ids stay unique; simplest is to export the generator from a small `apps/web/src/ids.ts` and import it in both store and CanvasView.)

- [ ] **Step 2: `Toast.tsx`**

Create `apps/web/src/Toast.tsx`: subscribes to `toast`; when non-null, renders a small fixed-flow banner (position it within the canvas container, not `position:fixed`) and auto-clears after ~3.5s via `setTimeout` in a `useEffect` (clear timer on change/unmount). Calls `setToast(null)` on dismiss.

- [ ] **Step 3: `DimensionChip.tsx`**

Create `apps/web/src/DimensionChip.tsx`: shown while a line draft exists (`draft?.kind === 'line'`). Renders an absolutely-positioned input near the draft's `b` endpoint (convert world→screen via the store camera). Displays the current draft length using `formatLength`; an `<input type="number">` lets the user type a length in the document's display unit. The actual commit is driven by CanvasView (second click) — the chip writes the typed value into store state `typedLength: number | null` (add `typedLength`/`setTypedLength` to the store) so CanvasView can read it on commit. Focus the input when it appears. Enter in the input should also trigger commit (dispatch the same path as a second click via a store flag or callback — simplest: call a `commitLineDraft()` store action). Keep it minimal.

- [ ] **Step 4: `EdgeEditor.tsx`**

Create `apps/web/src/EdgeEditor.tsx`: when the store has `editing: { lineId, screen: {x,y} } | null` set (by a double-click in CanvasView), render an absolutely-positioned `<input type="number">` at `screen`, prefilled with the line's current length (compute from its endpoints via `distance` + `umToMeters`/unit). On Enter: convert the entered display value to micrometers and call `setLineLengthAndSolve(lineId, um)`, then clear `editing`. On Escape/blur: clear `editing`.

- [ ] **Step 5: Wire inference, snap, double-click in `CanvasView.tsx`**

- During **line draw** (pointermove updating `draft.b`): compute `inferAxis(a.x,a.y,b.x,b.y)`; if non-null, snap `draft.b` onto the axis (set b.y=a.y for horizontal, b.x=a.x for vertical) and `setSnap({kind, at:b})`, else compute `snapPoint(present.sketch, world, 8/scale, excludeStartId?)` and if found set `setSnap({kind:'endpoint', at: that point})` and use that point's coords for `b`; else `setSnap(null)`.
- On **line commit** (second click): determine start/end snap points (endpoint snaps) and inferred axis. Steps: `addLineSegment(present, idGen, a.x,a.y,b.x,b.y)` → if a typed length is present, `setLineLength(..., newLineId, um)` → if axis inferred, `addAxisConstraint(..., newLineId, axis)` → for each endpoint that snapped to an existing point, `mergePoint(doc, existingId, newEndpointId)` → `solveAndCommit`. Clear draft, snap, typedLength. (Track the new line/point ids from the gen sequence: `addLineSegment` with a fresh-but-shared gen emits `p{n},p{n+1},L{n+2}`.)
- For **rect commit**: keep slice-2 behavior (no per-side typed length this slice); editing rect sides is done via the double-click editor afterward.
- **Double-click** handler on the overlay canvas: hitTest for a line under the cursor; if found, set store `editing = { lineId, screen: clientToCanvas(point) }` to open `EdgeEditor`.
- Clear `setSnap(null)` when leaving line tool / on Escape.

- [ ] **Step 6: Mount overlays in `App.tsx`**

Render `<Toast/>`, and ensure `<DimensionChip/>` and `<EdgeEditor/>` are mounted inside the canvas container (in `CanvasView`'s returned container or in App over the canvas region) so they position correctly. Keep the toolbar.

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @plot/web typecheck` (zero errors) and `pnpm --filter @plot/web build` (succeeds). Do NOT do interactive browser testing — the controller verifies.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): type-to-set dimensions, double-click edit, inference, snap, toast"
```

---

## Final verification

- [ ] `pnpm test` — all unit tests pass (incl. new infer + mutate tests).
- [ ] `pnpm typecheck` — zero errors across all packages.
- [ ] `pnpm --filter @plot/web build` — succeeds.
- [ ] Controller verification (browser or via the running dev server's live store): (a) double-click a rectangle edge, enter a length → that edge becomes exactly that length and the rectangle stays square; (b) draw a near-horizontal line → it gains a horizontal constraint (auto-flattens); (c) drawing a line whose end is near an existing point snaps/merges to it; (d) entering a conflicting dimension shows the revert toast and does not corrupt the drawing.

---

## Self-review against the slice

- **Type-to-set length (chip while drawing + double-click edit) → distance constraint + solve** → Task 1 (`setLineLength`) + Task 3 (`DimensionChip`, `EdgeEditor`, `setLineLengthAndSolve`). ✓
- **Auto H/V inference on drawn lines** → Task 1 (`inferAxis`, `addAxisConstraint`) + Task 3 wiring. ✓
- **Endpoint snap (merge → shared point)** → Task 1 (`snapPoint`, `mergePoint`) + Task 3 wiring. ✓
- **Snap hints rendered** → Task 2. ✓
- **Over-constraint reversible toast (status-aware solve)** → Task 3 (`solveDocStatus`, `setLineLengthAndSolve`, `Toast`). ✓
- **Deferred (not gaps):** parallel/perp/equal inference; per-entity color state + DOF status pill (needs solver DOF — v2); polygon/circle/arc; angle entry; persistence/export (Slice 4).
```
