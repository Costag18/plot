# Plot v1 — Slice 7: Polygon Tool + Templates/Empty-State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Create shapes faster — a polygon tool (multi-click, close to finish) and a friendly empty-state offering Blank + ready-made templates (room, L-shape).

**Architecture:** Add a pure, TDD'd `addPolygon(doc, gen, pts, closed)` to `@plot/document` (shared points between consecutive edges). Extend `@plot/render`'s `Draft` with a `polygon` variant and draw it. In `apps/web`: a `polygon` tool (click to add vertices, double-click / Enter / click-near-start to finish), an `EmptyState` overlay shown when the sketch has no geometry, and a small `templates.ts` of prebuilt documents.

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5; `@plot/core`, `@plot/document`, `@plot/render`.

**Scope note:** Slice 7 only. Deferred to **Slice 8**: PWA/offline + touch/pinch. Polygon edges are plain geometry (no auto-constraints) this slice — dimension/constrain them afterward with the existing tools.

---

## Task 1: `@plot/document` — `addPolygon` (pure, TDD)

**Files:** Create `packages/document/test/polygon.test.ts`; Modify `packages/document/src/mutate.ts` (append), `packages/document/src/index.ts` (already exports mutate).

- [ ] **Step 1: Failing test** — Create `packages/document/test/polygon.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createDocument } from '../src/document'
import { createIdGen } from '../src/ids'
import { addPolygon } from '../src/mutate'

const pts = [ { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 } ]

describe('addPolygon', () => {
  it('closed triangle: 3 points, 3 lines', () => {
    const { doc, newIds } = addPolygon(createDocument('m'), createIdGen(), pts, true)
    expect(Object.keys(doc.sketch.points)).toHaveLength(3)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(3)
    expect(newIds).toHaveLength(6)
  })
  it('open polyline: 3 points, 2 lines', () => {
    const { doc } = addPolygon(createDocument('m'), createIdGen(), pts, false)
    expect(Object.keys(doc.sketch.lines)).toHaveLength(2)
  })
  it('consecutive edges share a point id', () => {
    const { doc } = addPolygon(createDocument('m'), createIdGen(), pts, true)
    const lines = Object.values(doc.sketch.lines)
    const allPointIds = new Set(lines.flatMap((l) => [l.a, l.b]))
    expect(allPointIds.size).toBe(3) // 3 shared corners, not 6
  })
  it('fewer than 2 points is a no-op', () => {
    const doc0 = createDocument('m')
    expect(addPolygon(doc0, createIdGen(), [{ x: 0, y: 0 }], true).doc).toBe(doc0)
  })
})
```

- [ ] **Step 2: Run → fail.** `pnpm --filter @plot/document test`

- [ ] **Step 3: Implement** — append to `packages/document/src/mutate.ts`:
```ts
export function addPolygon(
  doc: PlotDocument,
  gen: IdGen,
  pts: ReadonlyArray<{ x: number; y: number }>,
  closed: boolean,
): { doc: PlotDocument; newIds: string[] } {
  if (pts.length < 2) return { doc, newIds: [] }
  const newIds: string[] = []
  const points = { ...doc.sketch.points }
  const ids: string[] = []
  for (const p of pts) {
    const id = gen('p')
    points[id] = { type: 'point', id, x: round(p.x), y: round(p.y), fixed: false }
    ids.push(id)
    newIds.push(id)
  }
  const lines = { ...doc.sketch.lines }
  const edgeCount = closed ? pts.length : pts.length - 1
  for (let i = 0; i < edgeCount; i++) {
    const a = ids[i]!
    const b = ids[(i + 1) % ids.length]!
    const id = gen('L')
    lines[id] = { type: 'line', id, a, b }
    newIds.push(id)
  }
  return { doc: { ...doc, sketch: { ...doc.sketch, points, lines } }, newIds }
}
```

- [ ] **Step 4: Run → pass; typecheck.**

- [ ] **Step 5: Commit** — `git add packages/document && git commit -m "feat(document): addPolygon (open/closed)"`

---

## Task 2: `@plot/render` — polygon draft

**Files:** Modify `packages/render/src/renderer.ts`.

- [ ] **Step 1:** Extend the `Draft` union with `| { kind: 'polygon'; pts: Vec2[] }`.

- [ ] **Step 2:** In `drawOverlay`'s draft block, handle `'polygon'`: draw a dashed polyline through `s.draft.pts` (consecutive `line()` segments) using `COLORS.hover`, width 1.5, `setLineDash([6,4])`. (Don't auto-close the preview.) Keep the existing line/rect handling.
```ts
} else if (s.draft.kind === 'polygon') {
  ctx.save(); ctx.setLineDash([6,4]); ctx.strokeStyle = COLORS.hover; ctx.lineWidth = 1.5
  const p = s.draft.pts
  for (let i = 0; i + 1 < p.length; i++) {
    const a = worldToScreen(c, p[i]!); const b = worldToScreen(c, p[i+1]!)
    line(ctx, a.x, a.y, b.x, b.y)
  }
  ctx.restore()
}
```
(Refactor the existing `if (s.draft.kind === 'line')` / rect branch into the if/else-if chain as needed.)

- [ ] **Step 3:** Typecheck + tests pass.

- [ ] **Step 4:** Commit — `git add packages/render && git commit -m "feat(render): polygon draft preview"`

---

## Task 3: `apps/web` — polygon tool + templates + empty-state

**Files:** Create `apps/web/src/templates.ts`, `apps/web/src/EmptyState.tsx`; Modify `apps/web/src/store.ts`, `apps/web/src/CanvasView.tsx`, `apps/web/src/App.tsx`.

- [ ] **Step 1: store** — extend `Tool` with `'polygon'`. The polygon in-progress vertices live in `draft` as `{ kind:'polygon', pts }`. No new store state required beyond what exists (`setDraft`). Ensure `setTool` already clears `draft` (it does).

- [ ] **Step 2: templates.ts** — export functions returning `PlotDocument`:
  - `blank(units?)` → `createDocument(units)`.
  - `room()` → a 4×3 m rectangle via `addRectangle(createDocument('m'), createIdGen(), 0,0, 4_000_000, 3_000_000)`.
  - `lShape()` → an L-shaped closed polygon via `addPolygon` (6 points).
  Import `createDocument`, `createIdGen`, `addRectangle`, `addPolygon` from `@plot/document`.

- [ ] **Step 3: CanvasView polygon tool** — when `tool === 'polygon'`:
  - pointerup (click): append the clicked world point to the polygon draft (`draft = { kind:'polygon', pts:[...prev, world] }`). If there is no draft yet, start one with `[world]`.
  - pointermove: show a rubber-band by passing `draft.pts` plus the live cursor as a transient last point to the renderer — simplest: keep committed pts in the store `draft`, and in the render effect append the live cursor. Cleanest within existing patterns: on pointermove, set `draft = { kind:'polygon', pts:[...committedRef.current, world] }` where `committedRef` holds the clicked vertices; the last entry is the moving cursor.
  - finish: double-click, or Enter, or click within ~10px of the FIRST vertex → commit `addPolygon(present, idGen, committedPts, closed=true)` (closed if finished by clicking near start or by a `c`/Enter-with-close) then `solveAndCommit`; Enter (not near start) → `closed=false`. Clear the draft + committed ref. Escape cancels.
  - Keep it pragmatic: maintain a `polygonRef` (array of committed world vertices) in CanvasView; the store `draft` mirrors it (+ live cursor) for rendering. On finish, build from `polygonRef`.

- [ ] **Step 4: EmptyState.tsx** — shown (absolutely positioned, centered, not fixed) when `doc().sketch` has no lines AND no image. Buttons: "Blank", "Room", "L-shape" → `loadDocument(template())`. A short hint line ("Pick a template or just start drawing — press R for rectangle, L for line, P for polygon"). Mount in the canvas region; pointer-events only on the card so it doesn't block drawing once dismissed (it disappears as soon as geometry exists).

- [ ] **Step 5: App.tsx** — add a **Polygon** tool button (`setTool('polygon')`, key `p` already? add `p` to the keyboard tool shortcuts in CanvasView) and mount `<EmptyState/>`.

- [ ] **Step 6: keyboard** — add `p` → `setTool('polygon')` in the existing tool-key handler (alongside v/l/r), and ensure Enter/double-click finish + Escape cancel work for polygon. (`c` optional to close.)

- [ ] **Step 7: typecheck + build.** `pnpm --filter @plot/web typecheck` + `build` — pass. No interactive test (controller verifies).

- [ ] **Step 8: Commit** — `git add apps/web && git commit -m "feat(web): polygon tool, templates, empty-state"`

---

## Final verification
- [ ] `pnpm test` — all pass (incl. addPolygon tests).
- [ ] `pnpm typecheck` — zero errors.
- [ ] `pnpm --filter @plot/web build` — succeeds.
- [ ] Controller verification: `addPolygon` (unit-tested); a blank doc shows the empty-state; picking Room/L-shape loads it; polygon tool draws a multi-segment shape and closes; `p` selects polygon.

## Self-review against the slice
- **Polygon (pure addPolygon + draft render + tool)** → Tasks 1–3. ✓
- **Templates + empty-state** → Task 3. ✓
- **Deferred to Slice 8:** PWA/offline, touch/pinch.
```
