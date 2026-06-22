# Plot v1 — Slice 4: Persistence & Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Never lose work and be able to get drawings out. Local-first IndexedDB autosave with load-on-startup, `.json` save/open, SVG and PNG export, and a unit picker that switches the document's display units.

**Architecture:** Add a pure, TDD'd `toSVG(doc)` and `boundsOf(sketch)` to `@plot/render` (geometry → SVG string at a real-world mm scale; bounds reused by fit + SVG). In `apps/web`, add a Dexie/IndexedDB persistence module (debounced autosave of the current document + load on startup), `.json` export/import, PNG export (composite the grid+geometry canvases onto white), an SVG export (download `toSVG`), and a units `<select>` wired to a store `setUnits` action.

**Tech Stack:** TypeScript, Vitest, React 19, Zustand 5, Vite 5, Dexie 4; `@plot/core`, `@plot/document` (`serializeDocument`/`parseDocument`/`UNITS`/`Unit`/`formatLength`), `@plot/render`.

**Scope note:** Slice 4 only. Deferred to a final **Slice 5**: reference-image tracing + calibrate-to-scale, templates/empty-state, PWA/offline (vite-plugin-pwa), and advanced touch (pinch). Print-to-scale PDF and DXF are v2 per the design spec.

---

## File structure

```
packages/render/
  src/
    bounds.ts         NEW: boundsOf(sketch) -> Bounds
    svg.ts            NEW: toSVG(doc) -> string
    index.ts          MODIFY: export ./bounds, ./svg
  test/
    bounds.test.ts    NEW
    svg.test.ts       NEW
apps/web/
  package.json        MODIFY: add dexie
  src/
    persistence.ts    NEW: Dexie autosave/load + json/png/svg download + json import
    store.ts          MODIFY: setUnits action; expose a way to load a doc + autosave hookup
    App.tsx           MODIFY: unit <select>, Save/Open(.json)/PNG/SVG buttons
    CanvasView.tsx    MODIFY (small): expose the two canvases for PNG compositing (or a render-to-canvas helper)
    bootstrap.ts      NEW (optional): load-on-startup + autosave subscription wiring
```

---

## Task 1: `@plot/render` — `boundsOf` + `toSVG` (pure, TDD)

**Files:** Create `packages/render/src/bounds.ts`, `packages/render/src/svg.ts`, tests; Modify `packages/render/src/index.ts`. (If a `documentBounds`-style helper currently lives in `apps/web`, this becomes the shared source of truth.)

- [ ] **Step 1: Write the failing bounds test**

Create `packages/render/test/bounds.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { boundsOf } from '../src/bounds'
import type { Sketch } from '@plot/core'

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: -100, y: 50, fixed: false },
    p1: { type: 'point', id: 'p1', x: 300, y: 200, fixed: false },
  },
  lines: {},
  constraints: [],
}

describe('boundsOf', () => {
  it('computes the min/max box over all points', () => {
    expect(boundsOf(sketch)).toEqual({ minX: -100, minY: 50, maxX: 300, maxY: 200 })
  })
  it('returns a small default box for an empty sketch', () => {
    const b = boundsOf({ points: {}, lines: {}, constraints: [] })
    expect(b.maxX).toBeGreaterThan(b.minX)
    expect(b.maxY).toBeGreaterThan(b.minY)
  })
})
```

- [ ] **Step 2: Write the failing svg test**

Create `packages/render/test/svg.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toSVG } from '../src/svg'
import { createDocument } from '@plot/document'

function rectDoc() {
  const doc = createDocument('m')
  doc.sketch.points = {
    a: { type: 'point', id: 'a', x: 0, y: 0, fixed: false },
    b: { type: 'point', id: 'b', x: 2_000_000, y: 0, fixed: false },
    c: { type: 'point', id: 'c', x: 2_000_000, y: 1_000_000, fixed: false },
    d: { type: 'point', id: 'd', x: 0, y: 1_000_000, fixed: false },
  }
  doc.sketch.lines = {
    L0: { type: 'line', id: 'L0', a: 'a', b: 'b' },
    L1: { type: 'line', id: 'L1', a: 'b', b: 'c' },
    L2: { type: 'line', id: 'L2', a: 'c', b: 'd' },
    L3: { type: 'line', id: 'L3', a: 'd', b: 'a' },
  }
  return doc
}

describe('toSVG', () => {
  it('produces an svg with a viewBox and one line per edge', () => {
    const svg = toSVG(rectDoc())
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox')
    expect((svg.match(/<line /g) || []).length).toBe(4)
  })
  it('includes a length label in the document units', () => {
    const svg = toSVG(rectDoc())
    expect(svg).toContain('2.00 m')
  })
  it('escapes nothing unexpected and is non-empty for an empty doc', () => {
    const svg = toSVG(createDocument('m'))
    expect(svg.startsWith('<svg')).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `pnpm --filter @plot/render test` — FAIL (missing modules).

- [ ] **Step 4: Implement `bounds.ts`**

Create `packages/render/src/bounds.ts`:
```ts
import type { Sketch } from '@plot/core'
import type { Bounds } from './camera'

export function boundsOf(sketch: Sketch): Bounds {
  const pts = Object.values(sketch.points)
  if (pts.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}
```

- [ ] **Step 5: Implement `svg.ts`**

Create `packages/render/src/svg.ts`:
```ts
import { distance, umToMeters } from '@plot/core'
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
```
(`umToMeters` is imported only if used; if the linter flags it as unused, drop it — `formatLength` already does unit conversion.)

- [ ] **Step 6: Update the barrel**

In `packages/render/src/index.ts` add: `export * from './bounds'` and `export * from './svg'`.

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @plot/render test` (all pass) and `pnpm --filter @plot/render typecheck` (zero errors).

- [ ] **Step 8: Commit**

```bash
git add packages/render
git commit -m "feat(render): boundsOf and toSVG export"
```

---

## Task 2: `apps/web` — Dexie persistence (autosave + load) + .json import/export

**Files:** Modify `apps/web/package.json` (add `dexie`); Create `apps/web/src/persistence.ts`; Modify `apps/web/src/store.ts`, `apps/web/src/main.tsx` (or a `bootstrap.ts`).

- [ ] **Step 1: Add Dexie**

In `apps/web/package.json` dependencies add `"dexie": "^4.0.8"`, then run `pnpm install`.

- [ ] **Step 2: Create `persistence.ts`**

Create `apps/web/src/persistence.ts`:
```ts
import Dexie, { type Table } from 'dexie'
import { serializeDocument, parseDocument } from '@plot/document'
import type { PlotDocument } from '@plot/document'

interface DocRow {
  id: string
  json: string
  updated: number
}

class PlotDB extends Dexie {
  docs!: Table<DocRow, string>
  constructor() {
    super('plot')
    this.version(1).stores({ docs: 'id' })
  }
}

const db = new PlotDB()
const CURRENT = 'current'

export async function saveCurrent(doc: PlotDocument): Promise<void> {
  await db.docs.put({ id: CURRENT, json: serializeDocument(doc), updated: Date.now() })
}

export async function loadCurrent(): Promise<PlotDocument | null> {
  const row = await db.docs.get(CURRENT)
  if (!row) return null
  try {
    return parseDocument(row.json)
  } catch {
    return null
  }
}

export function downloadJSON(doc: PlotDocument, filename = 'drawing.json'): void {
  download(new Blob([serializeDocument(doc)], { type: 'application/json' }), filename)
}

export function downloadText(text: string, type: string, filename: string): void {
  download(new Blob([text], { type }), filename)
}

export function downloadBlob(blob: Blob, filename: string): void {
  download(blob, filename)
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function importJSONFile(file: File): Promise<PlotDocument> {
  const text = await file.text()
  return parseDocument(text)
}
```

- [ ] **Step 3: Store: load-doc + autosave hookup**

In `apps/web/src/store.ts`:
- Add a `loadDocument(doc: PlotDocument)` action that resets history to `createHistory(doc)` (fresh history, clear preview/selection/draft).
- Keep `commit`/`solveAndCommit` as the mutation points.
Expose enough that a bootstrap can subscribe to `history.present` and autosave.

- [ ] **Step 4: Bootstrap autosave + load-on-startup**

In `apps/web/src/main.tsx` (or a new `bootstrap.ts` imported there), before/after render:
```ts
import { useEditor } from './store'
import { loadCurrent, saveCurrent } from './persistence'

// load once on startup
loadCurrent().then((doc) => { if (doc) useEditor.getState().loadDocument(doc) })

// debounced autosave on document changes
let timer: ReturnType<typeof setTimeout> | null = null
let lastSaved: unknown = null
useEditor.subscribe((s) => {
  const doc = s.history.present
  if (doc === lastSaved) return
  lastSaved = doc
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void saveCurrent(doc) }, 500)
})
```
Wire this so it runs once at app start (module side-effect imported by `main.tsx`).

- [ ] **Step 5: typecheck + build**

Run: `pnpm --filter @plot/web typecheck` and `pnpm --filter @plot/web build` — both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): local-first autosave/load and json import/export"
```

---

## Task 3: `apps/web` — export buttons (PNG/SVG/JSON) + unit picker

**Files:** Modify `apps/web/src/store.ts` (`setUnits`), `apps/web/src/App.tsx`, and `apps/web/src/CanvasView.tsx` (expose a PNG compositor).

- [ ] **Step 1: `setUnits` in the store**

Add `setUnits(u: Unit)` that commits `{ ...history.present, units: u }` (import `Unit` from `@plot/document`). Label rendering already reads `doc.units`, so a re-render reflects it.

- [ ] **Step 2: PNG compositor in `CanvasView`**

Expose a function that produces a PNG blob of the current view: create an offscreen `<canvas>` at the current css size × dpr, fill white, `drawImage` the grid canvas then the geometry canvas (skip the transient overlay), and `toBlob`. Wire it to a store-registered slot (like `commitLineDraft`) or a module ref so `App` can call it. Signature: `exportPNG(): Promise<Blob | null>`. Use the existing canvas refs.

- [ ] **Step 3: Toolbar in `App.tsx`**

Add to the toolbar:
- A units `<select>` over `UNITS` (`import { UNITS } from '@plot/document'`) bound to `doc().units`, calling `setUnits` on change.
- **Save** → `downloadJSON(doc())`.
- **Open** → a hidden `<input type="file" accept="application/json">`; on change `importJSONFile(file).then(loadDocument)` (guard parse errors with a toast).
- **PNG** → `exportPNG()` → `downloadBlob(blob, 'drawing.png')`.
- **SVG** → `downloadText(toSVG(doc()), 'image/svg+xml', 'drawing.svg')` (`import { toSVG } from '@plot/render'`).
Keep existing tool buttons, Undo/Redo/Fit/Delete, and the Toast mount.

- [ ] **Step 4: typecheck + build**

Run: `pnpm --filter @plot/web typecheck` and `pnpm --filter @plot/web build` — both pass. Do NOT do interactive browser testing — the controller verifies.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): PNG/SVG/JSON export and unit picker"
```

---

## Final verification

- [ ] `pnpm test` — all unit tests pass (incl. new bounds + svg tests).
- [ ] `pnpm typecheck` — zero errors across all packages.
- [ ] `pnpm --filter @plot/web build` — succeeds.
- [ ] Controller verification (browser or live store): (a) draw something, reload the page → it's still there (autosave + load); (b) change the unit picker → edge labels switch units; (c) Save downloads a `.json`; Open re-loads it; (d) `toSVG(doc())` returns valid SVG (verify via the live store import); PNG export produces a blob.

---

## Self-review against the slice

- **`toSVG` + `boundsOf` (pure, TDD)** → Task 1. ✓
- **Local-first autosave + load-on-startup + `.json` import/export** → Task 2. ✓
- **PNG + SVG + JSON export, unit picker** → Task 3. ✓
- **Deferred to Slice 5 (not gaps):** reference-image tracing + calibrate, templates/empty-state, PWA/offline, advanced touch/pinch. Print-to-scale PDF + DXF remain v2 per the design spec.
```
