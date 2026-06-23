# Plot v1 — Slice 6: Interaction QoL & Speed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make editing fast and fluid — multi-select (shift-click + marquee box), drag the whole selection, arrow-key nudge, duplicate / copy / paste, a full keyboard-shortcut set, and a live status bar (cursor coords, zoom, selection count).

**Architecture:** Add pure, TDD'd `@plot/document` helpers: `affectedPointIds`, `translateEntities` (move every point implied by a selection), `duplicateEntities` (clone selected points + lines + the constraints fully inside the selection, offset, returning the new ids), and `allSelectableIds`. Add a `marquee` box to `@plot/render`. In `apps/web`: selection becomes multi (shift-click toggles, marquee drag-box selects); dragging a selected entity moves the whole selection through the fix-translate-solve flow; arrow keys nudge; Ctrl/Cmd shortcuts for undo/redo/select-all/duplicate/copy/paste; a bottom status bar. Pan moves to middle-button or space-drag so left-drag on empty space is marquee.

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5; `@plot/core`, `@plot/document`, `@plot/render`.

**Scope note:** Slice 6 only. Deferred to **Slice 7**: polygon tool, templates/empty-state, PWA/offline, touch/pinch.

---

## File structure

```
packages/document/
  src/
    select.ts         NEW: affectedPointIds, translateEntities, duplicateEntities, allSelectableIds (pure)
    index.ts          MODIFY: export ./select
  test/
    select.test.ts    NEW
packages/render/
  src/
    renderer.ts       MODIFY: RenderState.marquee; draw dashed marquee box
apps/web/
  src/
    store.ts          MODIFY: selection as multi; toggleSelect, setSelection, marquee state, clipboard, nudge/duplicate/paste/selectAll actions
    CanvasView.tsx    MODIFY: shift-click, marquee drag-select, drag-move whole selection, pan→middle/space, arrow nudge, Ctrl shortcuts
    StatusBar.tsx     NEW: cursor coords + zoom % + selection count
    App.tsx           MODIFY: mount StatusBar
```

---

## Task 1: `@plot/document` — selection/translate/duplicate helpers (pure, TDD)

**Files:** Create `packages/document/src/select.ts`, `packages/document/test/select.test.ts`; Modify `packages/document/src/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/document/test/select.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { affectedPointIds, translateEntities, duplicateEntities, allSelectableIds } from '../src/select'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addRectangle, addLineSegment } from '../src/mutate'

function rect() {
  return addRectangle(createDocument('m'), createIdGen(), 0, 0, 400, 200) // p0..3, L4..7, c8..11
}

describe('affectedPointIds', () => {
  it('includes a selected point and both endpoints of a selected line', () => {
    const doc = rect()
    const ids = affectedPointIds(doc.sketch, ['p0', 'L5'])
    expect([...ids].sort()).toEqual(['p0', 'p1', 'p2']) // L5 = p1->p2
  })
})

describe('translateEntities', () => {
  it('moves all affected points by the delta (rounded)', () => {
    const doc = translateEntities(rect(), ['L4'], 10, -5) // L4 = p0->p1
    expect(doc.sketch.points.p0).toMatchObject({ x: 10, y: -5 })
    expect(doc.sketch.points.p1).toMatchObject({ x: 410, y: -5 })
    expect(doc.sketch.points.p2).toMatchObject({ x: 400, y: 200 }) // untouched
  })
})

describe('duplicateEntities', () => {
  it('clones a whole rectangle (points, lines, and interior constraints) offset', () => {
    const doc = rect()
    const ids = ['p0', 'p1', 'p2', 'p3', 'L4', 'L5', 'L6', 'L7']
    const { doc: next, newIds } = duplicateEntities(doc, createIdGen(100), ids, 1000, 1000)
    expect(Object.keys(next.sketch.points)).toHaveLength(8)
    expect(Object.keys(next.sketch.lines)).toHaveLength(8)
    expect(next.sketch.constraints).toHaveLength(8) // 4 original + 4 cloned
    // the clones are offset
    const clonePts = newIds.filter((id) => id.startsWith('p')).map((id) => next.sketch.points[id]!)
    expect(clonePts.some((p) => p.x === 1000 && p.y === 1000)).toBe(true) // p0 clone
    expect(newIds.length).toBe(8 + 4) // 4 pts + 4 lines + 4 constraints
  })
  it('does not clone a line whose endpoints are not both selected', () => {
    const doc = addLineSegment(createDocument('m'), createIdGen(), 0, 0, 100, 0) // p0,p1,L2
    const { doc: next } = duplicateEntities(doc, createIdGen(100), ['p0'], 5, 5) // only p0
    expect(Object.keys(next.sketch.points)).toHaveLength(3) // 2 + 1 clone of p0
    expect(Object.keys(next.sketch.lines)).toHaveLength(1) // L2 not cloned
  })
})

describe('allSelectableIds', () => {
  it('returns every point and line id', () => {
    const ids = allSelectableIds(rect().sketch)
    expect(ids).toHaveLength(8) // 4 points + 4 lines
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm --filter @plot/document test` — FAIL.

- [ ] **Step 3: Implement `select.ts`**

Create `packages/document/src/select.ts`:
```ts
import type { PlotDocument } from './document'
import type { IdGen } from './ids'

type Sketch = PlotDocument['sketch']
type Constraint = Sketch['constraints'][number]

const round = (n: number): number => Math.round(n)

export function affectedPointIds(sketch: Sketch, ids: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const id of ids) {
    if (sketch.points[id]) out.add(id)
    const l = sketch.lines[id]
    if (l) {
      out.add(l.a)
      out.add(l.b)
    }
  }
  return out
}

export function translateEntities(doc: PlotDocument, ids: readonly string[], dx: number, dy: number): PlotDocument {
  const affected = affectedPointIds(doc.sketch, ids)
  const points = { ...doc.sketch.points }
  for (const id of affected) {
    const p = points[id]
    if (!p) continue
    points[id] = { ...p, x: round(p.x + dx), y: round(p.y + dy) }
  }
  return { ...doc, sketch: { ...doc.sketch, points } }
}

export function allSelectableIds(sketch: Sketch): string[] {
  return [...Object.keys(sketch.points), ...Object.keys(sketch.lines)]
}

export function duplicateEntities(
  doc: PlotDocument,
  gen: IdGen,
  ids: readonly string[],
  dx: number,
  dy: number,
): { doc: PlotDocument; newIds: string[] } {
  const s = doc.sketch
  const newIds: string[] = []

  // 1. clone the affected points
  const pointMap = new Map<string, string>()
  const points = { ...s.points }
  for (const oldId of affectedPointIds(s, ids)) {
    const p = s.points[oldId]
    if (!p) continue
    const nid = gen('p')
    pointMap.set(oldId, nid)
    points[nid] = { ...p, id: nid, x: round(p.x + dx), y: round(p.y + dy) }
    newIds.push(nid)
  }

  // 2. clone selected lines whose both endpoints were cloned
  const lineMap = new Map<string, string>()
  const lines = { ...s.lines }
  for (const oldId of ids) {
    const l = s.lines[oldId]
    if (!l) continue
    const a = pointMap.get(l.a)
    const b = pointMap.get(l.b)
    if (!a || !b) continue
    const nid = gen('L')
    lineMap.set(oldId, nid)
    lines[nid] = { type: 'line', id: nid, a, b }
    newIds.push(nid)
  }

  // 3. clone constraints fully inside the cloned set
  const constraints = [...s.constraints]
  for (const c of s.constraints) {
    const cloned = cloneConstraint(c, pointMap, lineMap, gen)
    if (cloned) {
      constraints.push(cloned)
      newIds.push(cloned.id)
    }
  }

  return { doc: { ...doc, sketch: { points, lines, constraints } }, newIds }
}

function cloneConstraint(
  c: Constraint,
  pointMap: Map<string, string>,
  lineMap: Map<string, string>,
  gen: IdGen,
): Constraint | null {
  switch (c.kind) {
    case 'coincident': {
      const a = pointMap.get(c.a)
      const b = pointMap.get(c.b)
      return a && b ? { id: gen('c'), kind: 'coincident', a, b } : null
    }
    case 'horizontal':
    case 'vertical': {
      const line = lineMap.get(c.line)
      return line ? { id: gen('c'), kind: c.kind, line } : null
    }
    case 'distance': {
      const line = lineMap.get(c.line)
      return line ? { id: gen('c'), kind: 'distance', line, value: c.value } : null
    }
    case 'parallel':
    case 'perpendicular':
    case 'equalLength': {
      const l1 = lineMap.get(c.l1)
      const l2 = lineMap.get(c.l2)
      return l1 && l2 ? { id: gen('c'), kind: c.kind, l1, l2 } : null
    }
  }
}
```

- [ ] **Step 4: Barrel**

In `packages/document/src/index.ts` add `export * from './select'`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @plot/document test` (all pass) and `pnpm --filter @plot/document typecheck` (zero errors).

- [ ] **Step 6: Commit**

```bash
git add packages/document
git commit -m "feat(document): multi-select translate/duplicate helpers"
```

---

## Task 2: `@plot/render` — marquee box

**Files:** Modify `packages/render/src/renderer.ts`.

- [ ] **Step 1: Add `RenderState.marquee`**

Add `marquee?: { a: Vec2; b: Vec2 } | null` to `RenderState` (world coords).

- [ ] **Step 2: Draw it in `drawOverlay`**

After the snap block in `drawOverlay`:
```ts
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
```

- [ ] **Step 3: Typecheck + test**

Run: `pnpm --filter @plot/render typecheck` (zero errors) and `pnpm --filter @plot/render test` (existing pass).

- [ ] **Step 4: Commit**

```bash
git add packages/render
git commit -m "feat(render): marquee selection box"
```

---

## Task 3: `apps/web` — multi-select, drag-move, nudge, duplicate/copy/paste, shortcuts, status bar

**Files:** Modify `apps/web/src/store.ts`, `apps/web/src/CanvasView.tsx`, `apps/web/src/App.tsx`; Create `apps/web/src/StatusBar.tsx`.

- [ ] **Step 1: Store changes**

In `store.ts`:
- Selection is already a `Set<string>`. Add `setSelection(ids: string[])`, `toggleSelect(id: string)` (add/remove), and keep `select(hit)` for single (clear when null).
- Add `marquee: { a: Vec2; b: Vec2 } | null` + `setMarquee`.
- Add `cursor: Vec2 | null` + `setCursor` (world coords, for the status bar).
- Add `clipboard: string[] | null` + actions:
  - `selectAll()` → `setSelection(allSelectableIds(history.present.sketch))`.
  - `duplicateSelection(dx=200000, dy=200000)` → `duplicateEntities(present, idGen, [...selection], dx, dy)`; commit; `setSelection(newIds)`.
  - `copySelection()` → `clipboard = [...selection]`.
  - `paste(dx, dy)` → if clipboard, `duplicateEntities(present, idGen, clipboard, dx, dy)`; commit; select new ids.
  - `nudge(dx, dy)` → `translateEntities(present, [...selection], dx, dy)` then `solveAndCommit`.
Import `allSelectableIds`, `translateEntities`, `duplicateEntities` from `@plot/document`; `Vec2` from `@plot/core`; share `idGen` from `./ids`.

- [ ] **Step 2: CanvasView — selection, marquee, drag-move, pan**

In `CanvasView.tsx` (select tool):
- **pointerdown** on a hit: if shift held → `toggleSelect(hit.id)`; else if hit not in selection → `setSelection([hit.id])`. Start a potential **move-drag** of the whole current selection: capture base = `history.present` with all affected points fixed (`setPointFixed` for each `affectedPointIds(selection)`), record start world. On a hit already in a multi-selection without shift, keep the selection and drag it.
- **pointerdown** on empty (no hit), no modifier → start a **marquee**: record start world, `setMarquee({a,b:a})`. (Middle-button OR space-held → pan instead.)
- **pointermove**: if move-dragging → translate all affected points by world delta on the fixed base, `solvePreview`; if marquee → update `setMarquee({a,b:cursorWorld})`; else update hover + always `setCursor(world)`.
- **pointerup**: if move-drag (moved >threshold) → restore original fixed flags, `solveAndCommit`, clearPreview; if marquee → compute selected = all entities whose representative point(s) fall inside the box (points inside; lines if both endpoints inside), `setSelection(those)`, `setMarquee(null)`; if a plain click (no move) on empty → clear selection.
- Pan: bind to middle-button drag and to left-drag while Space is held (track a `spaceDown` ref via keydown/keyup). Keep wheel-zoom.
- Pass `marquee` into `renderer.render({...})` and deps.

- [ ] **Step 3: Keyboard shortcuts**

Extend the keydown handler (guard when typing in inputs):
- `Ctrl/Cmd+Z` → undo; `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` → redo.
- `Ctrl/Cmd+A` → `selectAll()` (preventDefault).
- `Ctrl/Cmd+D` → `duplicateSelection()` (preventDefault).
- `Ctrl/Cmd+C` → `copySelection()`; `Ctrl/Cmd+V` → `paste(offset, offset)`.
- Arrow keys → `nudge` by a step (Shift+arrow = larger step; base step e.g. `10000` µm = 10 mm).
- `0` → fit; `=`/`+` → zoom in at center; `-` → zoom out at center.
- Keep `v/l/r`, Delete/Backspace, Escape.

- [ ] **Step 4: `StatusBar.tsx`**

Create a bottom bar (normal flow, not fixed) showing: cursor coords as `x, y` in the doc unit (via `umToMeters`/`formatLength`-style, or `formatLength` per axis), current zoom `%` (from camera.scale — display `Math.round(scale-relative)`; simplest: show `${Math.round(scaleToPercent)}%` using a reference where scale that fits ~1px/mm = 100%? keep it simple: show `${(camera.scale*1000).toFixed(0)}%`-ish or just zoom factor), and selection count. Subscribe to `cursor`, `camera`, `selection`.

- [ ] **Step 5: Mount + typecheck/build**

Mount `<StatusBar/>` in `App.tsx` (below the canvas region). Run `pnpm --filter @plot/web typecheck` and `pnpm --filter @plot/web build` — both pass. Do NOT interactive-test; controller verifies.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): multi-select, marquee, drag-move, nudge, duplicate/copy/paste, shortcuts, status bar"
```

---

## Final verification

- [ ] `pnpm test` — all pass (incl. new select tests).
- [ ] `pnpm typecheck` — zero errors.
- [ ] `pnpm --filter @plot/web build` — succeeds.
- [ ] Controller verification (live store / browser): `duplicateEntities`/`translateEntities`/`allSelectableIds` behave (unit-tested); shift-click + marquee multi-select; dragging a selection moves it; arrow nudge; Ctrl+D/C/V duplicate/paste; Ctrl+A select-all; Ctrl+Z/Y; status bar updates.

---

## Self-review against the slice

- **Multi-select translate/duplicate/select-all (pure, TDD)** → Task 1. ✓
- **Marquee box** → Task 2 + Task 3 wiring. ✓
- **Shift-click, marquee, drag-move, nudge, duplicate/copy/paste, shortcuts, status bar; pan→middle/space** → Task 3. ✓
- **Deferred to Slice 7 (not gaps):** polygon tool, templates/empty-state, PWA/offline, touch/pinch.
```
