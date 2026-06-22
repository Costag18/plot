# Plot

A browser-based 2D drafting tool that feels as easy as Excalidraw but has a real CAD constraint solver underneath: sketch a room, garden, plot of land, or part roughly, type in real-world dimensions, and a geometric constraint solver makes everything exact.

> **Status:** v0 prototype. The core technical bet is proven end-to-end — a pure, unit-tested geometry + constraint core whose sketches are solved by FreeCAD's PlaneGCS (WebAssembly) running in a Web Worker, demonstrated by a throwaway canvas that turns a rough quadrilateral into an exact 3 m × 2 m rectangle.

## Monorepo layout

| Package | Responsibility |
| --- | --- |
| `packages/core` | Pure TypeScript geometry + typed constraint model + a solver-agnostic neutral `SolveRequest`/`SolveResult` behind an `ISolver` interface. No DOM/WASM. Fully unit-tested. |
| `packages/solver-worker` | The only package that depends on PlaneGCS. Translates neutral requests into PlaneGCS primitives, runs the WASM solver, and exposes it over a Comlink Web Worker. |
| `apps/playground` | Throwaway Vite + vanilla-TS canvas wiring the core to the worker (rough quad → exact rectangle). |

## Develop

```bash
pnpm install
pnpm test         # unit tests (core) + real-WASM integration test (solver-worker)
pnpm typecheck
pnpm dev          # run the playground at http://localhost:5173
```

Requires Node 20+ and pnpm 9.

## Design docs

- Design spec: [`docs/superpowers/specs/2026-06-22-plot-cad-design.md`](docs/superpowers/specs/2026-06-22-plot-cad-design.md)
- v0 implementation plan: [`docs/superpowers/plans/2026-06-22-plot-v0-prototype.md`](docs/superpowers/plans/2026-06-22-plot-v0-prototype.md)

## Credits

Constraint solving is powered by [PlaneGCS](https://github.com/Salusoft89/planegcs) (`@salusoft89/planegcs`), a WebAssembly build of FreeCAD's geometric constraint solver, licensed under **LGPL-2.1**.
