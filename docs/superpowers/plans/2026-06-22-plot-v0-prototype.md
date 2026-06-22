# Plot v0 Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the core technical bet end-to-end — a pure, unit-tested geometry+constraint core whose sketches are solved by FreeCAD's PlaneGCS (WASM) running in a Web Worker, demonstrated by a throwaway canvas that turns a rough quadrilateral into an exact 3×2 m rectangle.

**Architecture:** A pnpm monorepo with three packages. `@plot/core` is pure TypeScript (no DOM/WASM): it owns the sketch model, a typed constraint set, and a *solver-agnostic* neutral `SolveRequest`/`SolveResult` format behind an `ISolver` interface. `@plot/solver-worker` owns the only PlaneGCS dependency: it translates the neutral format into PlaneGCS primitives, runs the WASM solver, and is exposed to the app over Comlink as an `ISolver`. `apps/playground` is a throwaway Vite + vanilla-TS canvas that wires them together.

**Tech Stack:** pnpm workspaces, TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Vite, `@salusoft89/planegcs` (PlaneGCS via WASM), Comlink.

**Scope note:** This is v0 only. The custom layered renderer, React UI shell, Zod document model, IndexedDB persistence, auto-inference, and the full constraint/QoL set described in the design spec are intentionally deferred to the v1 plan. v0 keeps coordinates in canonical integer **micrometers** (the spec's day-one decision) but otherwise prioritizes proving the loop.

---

## File structure

```
plot/
  package.json                      root workspace, scripts
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  packages/
    core/
      package.json                  @plot/core
      tsconfig.json
      src/
        vec2.ts                     2D vector helpers
        units.ts                    meters <-> micrometers
        solver.ts                   neutral SolveRequest/Result + ISolver
        sketch.ts                   Sketch model (points, lines, constraints)
        translate.ts                Sketch -> neutral SolveRequest
        apply.ts                    SolveResult -> updated Sketch; solveSketch()
        index.ts                    public barrel
      test/
        vec2.test.ts
        units.test.ts
        translate.test.ts
        apply.test.ts
    solver-worker/
      package.json                  @plot/solver-worker
      tsconfig.json
      src/
        planegcs-solver.ts          ISolver impl backed by PlaneGCS
        worker.ts                   Comlink expose
        client.ts                   createWorkerSolver(): ISolver
        index.ts                    barrel
      test/
        planegcs-solver.test.ts     Node integration test (real WASM)
  apps/
    playground/
      package.json                  @plot/playground (private)
      index.html
      vite.config.ts
      tsconfig.json
      src/
        main.ts                     wire sketch + worker solver + UI
        renderer.ts                 throwaway Canvas2D draw
```

---

## Task 1: Scaffold the monorepo and tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`

- [ ] **Step 1: Initialize git**

Run:
```bash
git init
```
Expected: "Initialized empty Git repository".

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore`:
```
node_modules
dist
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 3: Create the workspace manifest**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 4: Create the root `package.json`**

Create `package.json`:
```json
{
  "name": "plot",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev": "pnpm --filter @plot/playground dev"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 5: Create the base TypeScript config**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 6: Install root dev dependencies**

Run:
```bash
pnpm install
```
Expected: completes without error; creates `node_modules` and `pnpm-lock.yaml`.

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo and tooling"
```

---

## Task 2: `@plot/core` package skeleton + Vec2

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/vec2.ts`, `packages/core/test/vec2.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/core/package.json`:
```json
{
  "name": "@plot/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/core/test/vec2.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { sub, length, distance } from '../src/vec2'

describe('vec2', () => {
  it('subtracts two vectors', () => {
    expect(sub({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 })
  })

  it('computes length of a 3-4-5 triangle', () => {
    expect(length({ x: 3, y: 4 })).toBe(5)
  })

  it('computes distance between two points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @plot/core test`
Expected: FAIL — cannot resolve `../src/vec2`.

- [ ] **Step 5: Implement Vec2**

Create `packages/core/src/vec2.ts`:
```ts
export interface Vec2 {
  x: number
  y: number
}

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const length = (v: Vec2): number => Math.hypot(v.x, v.y)
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b))
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @plot/core test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add @plot/core package with Vec2 helpers"
```

---

## Task 3: Units (meters <-> micrometers)

**Files:**
- Create: `packages/core/src/units.ts`, `packages/core/test/units.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/units.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { metersToUm, umToMeters, UM_PER_M } from '../src/units'

describe('units', () => {
  it('defines one million micrometers per meter', () => {
    expect(UM_PER_M).toBe(1_000_000)
  })

  it('converts meters to integer micrometers', () => {
    expect(metersToUm(3.2)).toBe(3_200_000)
  })

  it('rounds to the nearest micrometer', () => {
    expect(metersToUm(0.0000004)).toBe(0)
    expect(metersToUm(0.0000006)).toBe(1)
  })

  it('converts micrometers back to meters', () => {
    expect(umToMeters(2_000_000)).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plot/core test`
Expected: FAIL — cannot resolve `../src/units`.

- [ ] **Step 3: Implement units**

Create `packages/core/src/units.ts`:
```ts
export const UM_PER_M = 1_000_000

export const metersToUm = (m: number): number => Math.round(m * UM_PER_M)
export const umToMeters = (um: number): number => um / UM_PER_M
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @plot/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add micrometer canonical-unit conversions"
```

---

## Task 4: Neutral solver contract + sketch model

This task adds only types (no behavior to TDD yet). Verification is a typecheck, then a small constructor test.

**Files:**
- Create: `packages/core/src/solver.ts`, `packages/core/src/sketch.ts`, `packages/core/test/sketch.test.ts`

- [ ] **Step 1: Define the neutral solver contract**

Create `packages/core/src/solver.ts`:
```ts
export interface SolvePoint {
  id: string
  x: number
  y: number
  fixed: boolean
}

export type SolveConstraint =
  | { kind: 'coincident'; a: string; b: string }
  | { kind: 'horizontal'; p1: string; p2: string }
  | { kind: 'vertical'; p1: string; p2: string }
  | { kind: 'distance'; p1: string; p2: string; value: number }
  | { kind: 'parallel'; l1: [string, string]; l2: [string, string] }
  | { kind: 'perpendicular'; l1: [string, string]; l2: [string, string] }
  | { kind: 'equalLength'; l1: [string, string]; l2: [string, string] }

export interface SolveRequest {
  points: SolvePoint[]
  constraints: SolveConstraint[]
}

export interface SolveResult {
  status: 'ok' | 'failed'
  points: Array<{ id: string; x: number; y: number }>
}

export interface ISolver {
  solve(request: SolveRequest): Promise<SolveResult>
}
```

- [ ] **Step 2: Define the sketch model**

Create `packages/core/src/sketch.ts`:
```ts
export interface PointEntity {
  type: 'point'
  id: string
  x: number
  y: number
  fixed: boolean
}

export interface LineEntity {
  type: 'line'
  id: string
  a: string
  b: string
}

export type Constraint =
  | { id: string; kind: 'coincident'; a: string; b: string }
  | { id: string; kind: 'horizontal'; line: string }
  | { id: string; kind: 'vertical'; line: string }
  | { id: string; kind: 'distance'; line: string; value: number }
  | { id: string; kind: 'parallel'; l1: string; l2: string }
  | { id: string; kind: 'perpendicular'; l1: string; l2: string }
  | { id: string; kind: 'equalLength'; l1: string; l2: string }

export interface Sketch {
  points: Record<string, PointEntity>
  lines: Record<string, LineEntity>
  constraints: Constraint[]
}

export const emptySketch = (): Sketch => ({ points: {}, lines: {}, constraints: [] })
```

- [ ] **Step 3: Write a constructor test**

Create `packages/core/test/sketch.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { emptySketch } from '../src/sketch'
import type { Sketch } from '../src/sketch'

describe('sketch', () => {
  it('creates an empty sketch', () => {
    const s = emptySketch()
    expect(s).toEqual({ points: {}, lines: {}, constraints: [] })
  })

  it('accepts a hand-built sketch with a point and a line', () => {
    const s: Sketch = {
      points: {
        p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
        p1: { type: 'point', id: 'p1', x: 1000, y: 0, fixed: false },
      },
      lines: { L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' } },
      constraints: [{ id: 'c0', kind: 'horizontal', line: 'L0' }],
    }
    expect(Object.keys(s.points)).toHaveLength(2)
    expect(s.lines.L0?.a).toBe('p0')
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @plot/core test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @plot/core typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add neutral solver contract and sketch model"
```

---

## Task 5: Translate a Sketch into a neutral SolveRequest

**Files:**
- Create: `packages/core/src/translate.ts`, `packages/core/test/translate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/translate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildSolveRequest } from '../src/translate'
import type { Sketch } from '../src/sketch'

const base: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 3000, y: 100, fixed: false },
    p2: { type: 'point', id: 'p2', x: 3100, y: 2000, fixed: false },
  },
  lines: {
    L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' },
    L1: { type: 'line', id: 'L1', a: 'p1', b: 'p2' },
  },
  constraints: [],
}

describe('buildSolveRequest', () => {
  it('maps every point with its fixed flag', () => {
    const req = buildSolveRequest(base)
    expect(req.points).toContainEqual({ id: 'p0', x: 0, y: 0, fixed: true })
    expect(req.points).toContainEqual({ id: 'p1', x: 3000, y: 100, fixed: false })
    expect(req.points).toHaveLength(3)
  })

  it('expands a horizontal line constraint into its endpoints', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'horizontal', line: 'L0' }],
    })
    expect(req.constraints).toEqual([{ kind: 'horizontal', p1: 'p0', p2: 'p1' }])
  })

  it('expands a distance line constraint with its value', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'distance', line: 'L0', value: 3_000_000 }],
    })
    expect(req.constraints).toEqual([
      { kind: 'distance', p1: 'p0', p2: 'p1', value: 3_000_000 },
    ])
  })

  it('expands parallel between two lines into endpoint pairs', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'parallel', l1: 'L0', l2: 'L1' }],
    })
    expect(req.constraints).toEqual([
      { kind: 'parallel', l1: ['p0', 'p1'], l2: ['p1', 'p2'] },
    ])
  })

  it('passes a coincident point constraint through unchanged', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'coincident', a: 'p1', b: 'p2' }],
    })
    expect(req.constraints).toEqual([{ kind: 'coincident', a: 'p1', b: 'p2' }])
  })

  it('skips a constraint that references a missing line', () => {
    const req = buildSolveRequest({
      ...base,
      constraints: [{ id: 'c', kind: 'horizontal', line: 'NOPE' }],
    })
    expect(req.constraints).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plot/core test`
Expected: FAIL — cannot resolve `../src/translate`.

- [ ] **Step 3: Implement the translator**

Create `packages/core/src/translate.ts`:
```ts
import type { Sketch, LineEntity } from './sketch'
import type { SolveRequest, SolveConstraint } from './solver'

const endpoints = (line: LineEntity): [string, string] => [line.a, line.b]

export function buildSolveRequest(sketch: Sketch): SolveRequest {
  const points = Object.values(sketch.points).map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    fixed: p.fixed,
  }))

  const constraints: SolveConstraint[] = []
  for (const c of sketch.constraints) {
    switch (c.kind) {
      case 'coincident':
        constraints.push({ kind: 'coincident', a: c.a, b: c.b })
        break
      case 'horizontal': {
        const l = sketch.lines[c.line]
        if (l) constraints.push({ kind: 'horizontal', p1: l.a, p2: l.b })
        break
      }
      case 'vertical': {
        const l = sketch.lines[c.line]
        if (l) constraints.push({ kind: 'vertical', p1: l.a, p2: l.b })
        break
      }
      case 'distance': {
        const l = sketch.lines[c.line]
        if (l) constraints.push({ kind: 'distance', p1: l.a, p2: l.b, value: c.value })
        break
      }
      case 'parallel': {
        const a = sketch.lines[c.l1]
        const b = sketch.lines[c.l2]
        if (a && b) constraints.push({ kind: 'parallel', l1: endpoints(a), l2: endpoints(b) })
        break
      }
      case 'perpendicular': {
        const a = sketch.lines[c.l1]
        const b = sketch.lines[c.l2]
        if (a && b) constraints.push({ kind: 'perpendicular', l1: endpoints(a), l2: endpoints(b) })
        break
      }
      case 'equalLength': {
        const a = sketch.lines[c.l1]
        const b = sketch.lines[c.l2]
        if (a && b) constraints.push({ kind: 'equalLength', l1: endpoints(a), l2: endpoints(b) })
        break
      }
    }
  }

  return { points, constraints }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @plot/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): translate sketches into neutral solve requests"
```

---

## Task 6: Apply results + solveSketch orchestration + barrel export

**Files:**
- Create: `packages/core/src/apply.ts`, `packages/core/src/index.ts`, `packages/core/test/apply.test.ts`

- [ ] **Step 1: Write the failing test (uses an in-test FakeSolver)**

Create `packages/core/test/apply.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { applySolveResult, solveSketch } from '../src/apply'
import { emptySketch } from '../src/sketch'
import type { Sketch } from '../src/sketch'
import type { ISolver, SolveResult } from '../src/solver'

const sketch = (): Sketch => ({
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 10, y: 10, fixed: false },
  },
  lines: {},
  constraints: [],
})

describe('applySolveResult', () => {
  it('updates point coordinates, rounding to whole micrometers', () => {
    const result: SolveResult = {
      status: 'ok',
      points: [{ id: 'p1', x: 2_999_999.6, y: 0.4 }],
    }
    const next = applySolveResult(sketch(), result)
    expect(next.points.p1).toEqual({ type: 'point', id: 'p1', x: 3_000_000, y: 0, fixed: false })
  })

  it('returns the input unchanged when the solve failed', () => {
    const s = sketch()
    const result: SolveResult = { status: 'failed', points: [] }
    expect(applySolveResult(s, result)).toBe(s)
  })

  it('ignores result points that are not in the sketch', () => {
    const next = applySolveResult(sketch(), { status: 'ok', points: [{ id: 'ghost', x: 1, y: 1 }] })
    expect(next.points.ghost).toBeUndefined()
  })
})

describe('solveSketch', () => {
  it('builds a request, calls the solver, and applies the result', async () => {
    let received = 0
    const fake: ISolver = {
      async solve(req) {
        received = req.points.length
        return { status: 'ok', points: [{ id: 'p1', x: 5_000_000, y: 0 }] }
      },
    }
    const next = await solveSketch(sketch(), fake)
    expect(received).toBe(2)
    expect(next.points.p1?.x).toBe(5_000_000)
  })

  it('returns an empty sketch unchanged through a no-op solver', async () => {
    const fake: ISolver = { async solve() { return { status: 'ok', points: [] } } }
    const next = await solveSketch(emptySketch(), fake)
    expect(next).toEqual(emptySketch())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plot/core test`
Expected: FAIL — cannot resolve `../src/apply`.

- [ ] **Step 3: Implement apply + orchestration**

Create `packages/core/src/apply.ts`:
```ts
import type { Sketch } from './sketch'
import type { ISolver, SolveResult } from './solver'
import { buildSolveRequest } from './translate'

export function applySolveResult(sketch: Sketch, result: SolveResult): Sketch {
  if (result.status !== 'ok') return sketch
  const points = { ...sketch.points }
  for (const sp of result.points) {
    const existing = points[sp.id]
    if (!existing) continue
    points[sp.id] = { ...existing, x: Math.round(sp.x), y: Math.round(sp.y) }
  }
  return { ...sketch, points }
}

export async function solveSketch(sketch: Sketch, solver: ISolver): Promise<Sketch> {
  const request = buildSolveRequest(sketch)
  const result = await solver.solve(request)
  return applySolveResult(sketch, result)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @plot/core test`
Expected: PASS (all core tests).

- [ ] **Step 5: Create the public barrel**

Create `packages/core/src/index.ts`:
```ts
export * from './vec2'
export * from './units'
export * from './solver'
export * from './sketch'
export * from './translate'
export * from './apply'
```

- [ ] **Step 6: Typecheck the whole package**

Run: `pnpm --filter @plot/core typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): apply solve results and orchestrate solveSketch"
```

---

## Task 7: PlaneGCS solver adapter (`@plot/solver-worker`)

This is the one place the WASM solver lives. The integration test is the contract: a rough quad must solve to an exact 3×2 m rectangle. The adapter code below is a complete first implementation; the PlaneGCS primitive `type` strings and the result-reading call are the only externally-defined names — the package ships full TypeScript types, so let the compiler and this test confirm them and adjust if the installed version differs.

**Files:**
- Create: `packages/solver-worker/package.json`, `packages/solver-worker/tsconfig.json`, `packages/solver-worker/src/planegcs-solver.ts`, `packages/solver-worker/test/planegcs-solver.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/solver-worker/package.json`:
```json
{
  "name": "@plot/solver-worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./worker": "./src/worker.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@plot/core": "workspace:*",
    "@salusoft89/planegcs": "^1.1.7",
    "comlink": "^4.4.1"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/solver-worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
pnpm install
```
Expected: resolves `@salusoft89/planegcs` and `comlink`.

- [ ] **Step 4: Inspect the installed PlaneGCS API**

Run:
```bash
cat node_modules/@salusoft89/planegcs/dist/index.d.ts
```
Expected: shows the exported `init_planegcs_module`, `GcsWrapper`, and the `SketchPrimitive` / constraint union. Note the exact constraint `type` strings (e.g. for horizontal, p2p distance, parallel, perpendicular) and the method that returns solved primitives — you will confirm the Step 7 mapping against these names.

- [ ] **Step 5: Write the failing integration test**

Create `packages/solver-worker/test/planegcs-solver.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PlaneGcsSolver } from '../src/planegcs-solver'
import type { SolveRequest } from '@plot/core'

const M = 1_000_000

function roughQuad(): SolveRequest {
  return {
    points: [
      { id: 'p0', x: 0, y: 0, fixed: true },
      { id: 'p1', x: 2_800_000, y: 50_000, fixed: false },
      { id: 'p2', x: 2_900_000, y: 2_100_000, fixed: false },
      { id: 'p3', x: 20_000, y: 1_950_000, fixed: false },
    ],
    constraints: [
      { kind: 'horizontal', p1: 'p0', p2: 'p1' },
      { kind: 'distance', p1: 'p0', p2: 'p1', value: 3 * M },
      { kind: 'distance', p1: 'p3', p2: 'p0', value: 2 * M },
      { kind: 'perpendicular', l1: ['p0', 'p1'], l2: ['p3', 'p0'] },
      { kind: 'parallel', l1: ['p0', 'p1'], l2: ['p2', 'p3'] },
      { kind: 'parallel', l1: ['p3', 'p0'], l2: ['p1', 'p2'] },
    ],
  }
}

const near = (a: number, b: number, tol = 2000) => Math.abs(a - b) <= tol

describe('PlaneGcsSolver', () => {
  it('solves a rough quad into an exact 3x2 m rectangle', async () => {
    const solver = new PlaneGcsSolver()
    const result = await solver.solve(roughQuad())

    expect(result.status).toBe('ok')
    const byId = Object.fromEntries(result.points.map((p) => [p.id, p]))

    expect(near(byId.p0!.x, 0)).toBe(true)
    expect(near(byId.p0!.y, 0)).toBe(true)
    expect(near(byId.p1!.x, 3 * M)).toBe(true)
    expect(near(byId.p1!.y, 0)).toBe(true)
    expect(near(byId.p3!.x, 0)).toBe(true)
    expect(near(byId.p3!.y, 2 * M)).toBe(true)
    expect(near(byId.p2!.x, 3 * M)).toBe(true)
    expect(near(byId.p2!.y, 2 * M)).toBe(true)
  }, 20_000)
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @plot/solver-worker test`
Expected: FAIL — cannot resolve `../src/planegcs-solver`.

- [ ] **Step 7: Implement the adapter**

Create `packages/solver-worker/src/planegcs-solver.ts`:
```ts
import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs'
import type { ISolver, SolveRequest, SolveResult, SolveConstraint } from '@plot/core'

type Primitive = Record<string, unknown> & { id: string; type: string }

let modulePromise: ReturnType<typeof init_planegcs_module> | null = null

let lineSeq = 0
let consSeq = 0
const lineId = () => `__line_${lineSeq++}`
const consId = () => `__c_${consSeq++}`

function lineFor(pair: [string, string], out: Primitive[]): string {
  const id = lineId()
  out.push({ id, type: 'line', p1_id: pair[0], p2_id: pair[1] })
  return id
}

function toPrimitives(req: SolveRequest): Primitive[] {
  const out: Primitive[] = []
  for (const p of req.points) {
    out.push({ id: p.id, type: 'point', x: p.x, y: p.y, fixed: p.fixed })
  }
  for (const c of req.constraints) {
    pushConstraint(c, out)
  }
  return out
}

function pushConstraint(c: SolveConstraint, out: Primitive[]): void {
  switch (c.kind) {
    case 'coincident':
      out.push({ id: consId(), type: 'p2p_coincident', p1_id: c.a, p2_id: c.b })
      break
    case 'horizontal':
      out.push({ id: consId(), type: 'horizontal_pp', p1_id: c.p1, p2_id: c.p2 })
      break
    case 'vertical':
      out.push({ id: consId(), type: 'vertical_pp', p1_id: c.p1, p2_id: c.p2 })
      break
    case 'distance':
      out.push({ id: consId(), type: 'p2p_distance', p1_id: c.p1, p2_id: c.p2, distance: c.value })
      break
    case 'parallel':
      out.push({ id: consId(), type: 'parallel', l1_id: lineFor(c.l1, out), l2_id: lineFor(c.l2, out) })
      break
    case 'perpendicular':
      out.push({ id: consId(), type: 'perpendicular', l1_id: lineFor(c.l1, out), l2_id: lineFor(c.l2, out) })
      break
    case 'equalLength':
      out.push({ id: consId(), type: 'equal', param1: lineFor(c.l1, out), param2: lineFor(c.l2, out) })
      break
  }
}

export class PlaneGcsSolver implements ISolver {
  async solve(request: SolveRequest): Promise<SolveResult> {
    const mod = await (modulePromise ??= init_planegcs_module())
    const gcs = new GcsWrapper(new mod.GcsSystem())
    try {
      gcs.push_primitives_and_params(toPrimitives(request) as never)
      gcs.solve()
      gcs.apply_solution()
      const solved = gcs.get_primitives() as Primitive[]
      const points = solved
        .filter((p) => p.type === 'point')
        .map((p) => ({ id: p.id, x: Number(p.x), y: Number(p.y) }))
      return { status: 'ok', points }
    } catch {
      return { status: 'failed', points: [] }
    } finally {
      gcs.destroy_gcs_module()
    }
  }
}
```

- [ ] **Step 8: Run the test; fix mapping names if needed, then verify it passes**

Run: `pnpm --filter @plot/solver-worker test`
Expected: PASS. If it fails on a primitive `type` or method name, reconcile `toPrimitives`/`get_primitives` with the names found in Step 4 (the d.ts is authoritative) and re-run until the rectangle assertions pass.

- [ ] **Step 9: Commit**

```bash
git add packages/solver-worker
git commit -m "feat(solver): PlaneGCS adapter solving neutral requests"
```

---

## Task 8: Expose the solver over a Comlink worker

The worker path is verified by the playground in Task 9 (browser-only). Here we add the worker entry, the typed client, and the barrel, and confirm they typecheck.

**Files:**
- Create: `packages/solver-worker/src/worker.ts`, `packages/solver-worker/src/client.ts`, `packages/solver-worker/src/index.ts`

- [ ] **Step 1: Create the worker entry**

Create `packages/solver-worker/src/worker.ts`:
```ts
import * as Comlink from 'comlink'
import { PlaneGcsSolver } from './planegcs-solver'
import type { SolveRequest } from '@plot/core'

const solver = new PlaneGcsSolver()

const api = {
  solve: (request: SolveRequest) => solver.solve(request),
}

export type SolverWorkerApi = typeof api

Comlink.expose(api)
```

- [ ] **Step 2: Create the typed client**

Create `packages/solver-worker/src/client.ts`:
```ts
import * as Comlink from 'comlink'
import type { ISolver, SolveRequest, SolveResult } from '@plot/core'
import type { SolverWorkerApi } from './worker'

export function createWorkerSolver(): ISolver {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const api = Comlink.wrap<SolverWorkerApi>(worker)
  return {
    solve: (request: SolveRequest): Promise<SolveResult> => api.solve(request),
  }
}
```

- [ ] **Step 3: Create the barrel**

Create `packages/solver-worker/src/index.ts`:
```ts
export { PlaneGcsSolver } from './planegcs-solver'
export { createWorkerSolver } from './client'
export type { SolverWorkerApi } from './worker'
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @plot/solver-worker typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/solver-worker
git commit -m "feat(solver): expose solver over a Comlink worker"
```

---

## Task 9: Playground app — rough quad to exact rectangle

A throwaway Vite + vanilla-TS canvas. Verification is manual in the browser: click the button and watch the rough quad snap into a clean rectangle, with solved dimensions printed.

**Files:**
- Create: `apps/playground/package.json`, `apps/playground/index.html`, `apps/playground/vite.config.ts`, `apps/playground/tsconfig.json`, `apps/playground/src/renderer.ts`, `apps/playground/src/main.ts`

- [ ] **Step 1: Create the package manifest**

Create `apps/playground/package.json`:
```json
{
  "name": "@plot/playground",
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
    "@plot/solver-worker": "workspace:*"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create the Vite config**

Create `apps/playground/vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@salusoft89/planegcs'] },
})
```

- [ ] **Step 3: Create the app tsconfig**

Create `apps/playground/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create the HTML entry**

Create `apps/playground/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plot playground</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 24px; }
      canvas { border: 1px solid #ccc; display: block; margin: 12px 0; }
      button { font-size: 15px; padding: 8px 14px; }
      #status { font-variant-numeric: tabular-nums; color: #333; }
    </style>
  </head>
  <body>
    <h1>Plot — v0 solver loop</h1>
    <button id="solve">Make 3 × 2 m rectangle</button>
    <p id="status">Rough quad. Click the button to solve.</p>
    <canvas id="c" width="640" height="480"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the renderer**

Create `apps/playground/src/renderer.ts`:
```ts
import { umToMeters } from '@plot/core'
import type { Sketch } from '@plot/core'

const SCALE = 0.0001
const ORIGIN_X = 80
const ORIGIN_Y = 400

const sx = (xUm: number) => ORIGIN_X + xUm * SCALE
const sy = (yUm: number) => ORIGIN_Y - yUm * SCALE

export function render(ctx: CanvasRenderingContext2D, sketch: Sketch): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  ctx.strokeStyle = '#1d4ed8'
  ctx.lineWidth = 2
  for (const line of Object.values(sketch.lines)) {
    const a = sketch.points[line.a]
    const b = sketch.points[line.b]
    if (!a || !b) continue
    ctx.beginPath()
    ctx.moveTo(sx(a.x), sy(a.y))
    ctx.lineTo(sx(b.x), sy(b.y))
    ctx.stroke()

    const midX = (sx(a.x) + sx(b.x)) / 2
    const midY = (sy(a.y) + sy(b.y)) / 2
    const lenM = Math.hypot(umToMeters(b.x - a.x), umToMeters(b.y - a.y))
    ctx.fillStyle = '#111'
    ctx.font = '13px system-ui'
    ctx.fillText(`${lenM.toFixed(2)} m`, midX + 4, midY - 4)
  }

  ctx.fillStyle = '#111'
  for (const p of Object.values(sketch.points)) {
    ctx.beginPath()
    ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
```

- [ ] **Step 6: Create the app entry**

Create `apps/playground/src/main.ts`:
```ts
import { createWorkerSolver } from '@plot/solver-worker'
import { solveSketch, umToMeters } from '@plot/core'
import type { Sketch } from '@plot/core'
import { render } from './renderer'

const M = 1_000_000

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 2_800_000, y: 50_000, fixed: false },
    p2: { type: 'point', id: 'p2', x: 2_900_000, y: 2_100_000, fixed: false },
    p3: { type: 'point', id: 'p3', x: 20_000, y: 1_950_000, fixed: false },
  },
  lines: {
    L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' },
    L1: { type: 'line', id: 'L1', a: 'p1', b: 'p2' },
    L2: { type: 'line', id: 'L2', a: 'p2', b: 'p3' },
    L3: { type: 'line', id: 'L3', a: 'p3', b: 'p0' },
  },
  constraints: [
    { id: 'c0', kind: 'horizontal', line: 'L0' },
    { id: 'c1', kind: 'distance', line: 'L0', value: 3 * M },
    { id: 'c2', kind: 'distance', line: 'L3', value: 2 * M },
    { id: 'c3', kind: 'perpendicular', l1: 'L0', l2: 'L3' },
    { id: 'c4', kind: 'parallel', l1: 'L0', l2: 'L2' },
    { id: 'c5', kind: 'parallel', l1: 'L3', l2: 'L1' },
  ],
}

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const status = document.getElementById('status') as HTMLParagraphElement
const button = document.getElementById('solve') as HTMLButtonElement

let current: Sketch = sketch
render(ctx, current)

const solver = createWorkerSolver()

button.addEventListener('click', async () => {
  status.textContent = 'Solving…'
  current = await solveSketch(current, solver)
  render(ctx, current)
  const p1 = current.points.p1!
  const p3 = current.points.p3!
  const w = umToMeters(p1.x).toFixed(2)
  const h = umToMeters(p3.y).toFixed(2)
  status.textContent = `Solved: ${w} m × ${h} m`
})
```

- [ ] **Step 7: Install dependencies**

Run:
```bash
pnpm install
```
Expected: links `@plot/core` and `@plot/solver-worker` into the app.

- [ ] **Step 8: Manually verify the loop**

Run:
```bash
pnpm --filter @plot/playground dev
```
Then open the printed local URL in a browser.
Expected: a skewed quadrilateral with off-round side labels. Click **Make 3 × 2 m rectangle** — the shape snaps to an upright rectangle, edge labels read `3.00 m` and `2.00 m`, and the status line reads `Solved: 3.00 m × 2.00 m`. (If the worker fails to load the WASM, check the browser console and apply the Vite WASM setup from the `@salusoft89/planegcs` README — typically ensuring the `.wasm` asset is served and not pre-bundled, which Step 2's `optimizeDeps.exclude` handles.)

- [ ] **Step 9: Typecheck the app**

Run: `pnpm --filter @plot/playground typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/playground
git commit -m "feat(playground): rough quad solves into an exact rectangle"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `pnpm test`
Expected: all `@plot/core` unit tests and the `@plot/solver-worker` integration test pass.

- [ ] **Typecheck everything**

Run: `pnpm typecheck`
Expected: no errors across all packages.

- [ ] **Confirm the manual demo** (Task 9, Step 8) still works end-to-end through the worker.

---

## Self-review against the spec

- **Pure, unit-tested geometry+constraint core, solver swappable behind an adapter** → Tasks 2–6 (`@plot/core`, no DOM/WASM imports; `ISolver` interface; FakeSolver test). ✓
- **PlaneGCS in a Web Worker via Comlink, correct WASM init/teardown** → Tasks 7–8 (`init_planegcs_module` memoized, `destroy_gcs_module` in `finally`, Comlink expose/wrap). ✓
- **Throwaway renderer: draw segments, assign a length, watch it re-fit** → Task 9. ✓
- **Enforced package boundaries (core / solver / app)** → Task 1 workspace + per-package manifests; only `solver-worker` depends on `@salusoft89/planegcs`. ✓
- **Canonical micrometers from day one** → Task 3 + integer rounding in `applySolveResult` (Task 6). ✓
- **QoL for v0: pan & zoom, snap to grid** → Intentionally deferred. v0's renderer is fixed-view and the demo is button-driven; pan/zoom/grid-snap belong to the v1 custom renderer. Flagged here so the omission is explicit, not accidental.

**Deferred to the v1 plan (not gaps):** custom layered Canvas2D renderer with world↔screen transform, RBush hit-testing, interactive draw tools + auto-inference, dimension chips, React shell, Zod document model, IndexedDB persistence, export, the full constraint/QoL set.
