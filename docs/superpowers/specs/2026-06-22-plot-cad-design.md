# Plot — Design Spec

**Date:** 2026-06-22
**Status:** Approved design (pre-implementation)
**One-line pitch:** A browser-based 2D drafting tool that feels as easy as Excalidraw but has a real CAD constraint solver underneath — sketch anything roughly, type in real-world dimensions, and it makes everything exact.

---

## 1. Goals & non-goals

### Goals
- **Simple first.** A non-expert can draw a shape and assign real dimensions within 60 seconds, with no CAD vocabulary to learn.
- **Real parametric power underneath.** A genuine geometric constraint solver enforces dimensions and relationships (coincident, horizontal/vertical, parallel, perpendicular, equal, distance, angle) so all proportions and math are automatic.
- **General-purpose 2D drafting.** Rooms, plots of land, garden beds, parts, layouts — any 2D top-down geometry. (v1 templates bias toward general drafting; the engine is domain-agnostic.)
- **Local-first and instant.** Works offline, no account required, autosaves continuously, opens fast. Installable PWA on desktop and tablet.
- **A generous set of quality-of-life features** (see §8).

### Non-goals (for now)
- No 3D. 2D top-down only.
- No professional-engineering certification, GD&T, or assemblies.
- No mandatory cloud account in v1 (cloud sync arrives in v2).
- No real-time multiplayer in v1 (v3).

### Target user
A normal person plotting their room, a hobbyist, a DIYer, a maker — not a professional engineer. They think in "this wall is 3.2 m," not in "add a coincident constraint."

---

## 2. The core idea: simple *and* powerful

The defining design decision is that **constraints are never a vocabulary the user learns**. They are a free byproduct of two actions:

1. **Draw roughly** (drag out geometry; snapping infers and silently records constraints).
2. **Type real numbers** (typing a value is the only thing that creates a locked dimension — the SolidWorks "dimension only if typed" rule).

Constraints surface only as small glyphs on hover, each deletable in one click. State is shown with a single color language plus a plain-English status pill:

- **Blue** = underdefined / still draggable
- **Black (ink)** = fully defined / locked
- **Amber/red** = conflict or over-defined

The drawing stays draggable while underdefined, so direct manipulation teaches the model. The app never hard-fails: an over-constraining edit produces a non-blocking, reversible toast ("That conflicts with the 3 m opposite side — replace it?"), never a solver error dialog. Everything is one `Ctrl+Z` away.

---

## 3. Design principles

1. **Constraints are a byproduct of drawing, never a command.** The casual path requires no "apply constraint" action.
2. **Draw rough, then make it exact.** Live dimension chip → type value (Tab cycles length/angle, Enter commits) → solver re-fits.
3. **One color language plus plain English.** Blue/black/red + a friendly status pill, not CAD jargon.
4. **Never hard-fail, never silently corrupt.** Conflicts are reversible toasts; undo-first design throughout.
5. **The geometry + constraint core is pure and framework-free.** No React/DOM/canvas in `core/`. Deterministic, fully unit-tested, solver swappable behind an adapter.
6. **The constraint network is the source of truth.** Solved coordinates are a re-solvable cache; rendered pixels are derived. One versioned JSON document is simultaneously the in-memory model, the autosave blob, and the shareable file.
7. **Local-first and instant.** Offline, no account, continuous autosave. Heavy solving runs in a Web Worker so the canvas never janks; React owns chrome only, the renderer owns the per-frame loop.
8. **Progressive disclosure.** The first 60 seconds are Excalidraw-simple. Glyphs, the health panel, parameters, and pro tooling stay collapsed until reached for.

---

## 4. Core user flow

1. **Empty state** offers three doors: Blank, a Template (generic shapes, room, garden bed, plot of land, part/bracket), or a 20-second "draw your first wall" coach mark. A real-world unit (m or ft) is chosen up front; grid and snapping are on by default.
2. **Draw.** Pick the Line/Rectangle/Polygon/Circle tool (or just start dragging) and drag out geometry roughly. A live heads-up **dimension chip** pins beside the cursor showing Length + Angle (or Width + Height for a rectangle).
3. **Infer while drawing.** The app continuously previews the most likely constraint from proximity — horizontal/vertical (colored axis hint), endpoint (filled dot), midpoint, on-edge, intersection, parallel, perpendicular, equal-length — as a ghost glyph plus a one-word tooltip. Holding `Ctrl/Cmd` suppresses the snap.
4. **Type to make exact.** The first digit focuses the Length field; `Tab` moves to Angle; `Enter` commits. Typing a value silently creates a locked dimension constraint; releasing a snap silently records the inferred constraint.
5. **Re-solve.** Each commit emits a Command; the document re-translates entities + constraints to solver primitives; the Web Worker solves; solved coordinates animate into place. Geometry stays draggable wherever still underdefined (blue), so the user can drag a corner to explore remaining freedom.
6. **Revise.** Double-click any dimension label → inline unit-aware input (`3.2m`, `12' 6"`); `Enter` re-solves and dependent geometry moves. Edge length, area, and perimeter labels update live. A status pill reads "Drag to adjust" or "Fully defined."
7. **Never break.** A conflicting dimension shows a non-blocking Replace/Cancel toast; nothing is corrupted; undo/redo covers everything. Hovering a shape reveals small constraint glyphs that can be clicked to delete. The document autosaves locally throughout and can be shared via a view link.

---

## 5. Architecture

Strictly downward-depending modules. The geometry + solver core is pure and independently testable; UI never enters the per-frame render loop. Enforce dependency direction via separate workspace packages.

| Module | Purpose | Depends on |
|---|---|---|
| `core/` | Pure TypeScript: vectors, primitives (point/line/arc/circle/polyline/region), tolerant geometric predicates with disciplined epsilon handling, a typed discriminated-union constraint model, and a thin async facade over the solver. Translates entity+constraint sets into solver primitives, solves, maps coordinates back. **Deterministic, 100% unit-tested, no React/DOM/canvas.** | solver (wrapped) |
| `solver-worker/` | Hosts the WASM solver in a Web Worker via Comlink. Manages WASM lifecycle (async init, apply solution, destroy module to avoid heap leaks), debounces solves during drag, uses temporary/SQP constraints for live drag and a full solve on release, time-boxes/cancels stale solves, returns results applied on the next animation frame. | `core/`, solver, comlink |
| `document/` | The versioned, Zod-validated JSON document: id-keyed `entities{}`, `constraints{}`, `dimensions{}`, `layers{}`, plus `meta` (units, precision, viewport, referenceImages). Points are the only entities carrying x/y; everything else references point ids. Owns referential integrity (cascade/orphan cleanup on delete), canonical unit storage, undo/redo via a Command pattern over Immer snapshots, and re-solve orchestration after each apply/undo. | `core/`, zod, immer |
| `persistence/` | Dexie/IndexedDB store (one row per document holding the JSON, plus thumbnails and reference-image blobs), debounced (~500 ms) autosave, named save/open, File System Access import/export of the same `.json` file with schema-version migration hooks. Export generators: SVG, print-to-scale PDF (pdf-lib), PNG. Shareable view link. | `document/`, dexie, pdf-lib |
| `render/` | Custom Canvas2D renderer with a world-coordinate model and manual world→screen transform so stroke widths, handles, dimension labels, snap glyphs, and grid spacing stay constant in screen pixels at any zoom. Three stacked canvases (cached static grid/axes; dynamic geometry redrawn on dirty-flag via rAF; ephemeral overlay for cursor/snap/marquee), HiDPI backing-store scaling, adaptive round-unit grid, and an RBush spatial index for viewport culling and analytic sub-shape hit-testing. | `document/`, rbush |
| `tools/` | One finite state machine per tool (select, line, rectangle/room, polygon, circle, arc, dimension, measure, pan). Tools own ALL ephemeral interaction state and translate pointer/keyboard/touch events into document Commands and solver calls, committing to the persisted document only on release. Hosts the auto-inference engine and type-to-dimension heads-up logic. | `document/`, `render/`, `solver-worker/` |
| `ui/` | React shell: modeless toolbar with single-letter shortcuts, dimension input chips, right-click context menu, status pill, layers/outliner panel, unit picker, empty-state with templates and coach mark, and touch affordances. Zustand for global/editor/UI state with fine-grained selectors; kept strictly out of the per-frame render loop. | `tools/`, `document/`, `render/`, zustand |

---

## 6. Constraint solver

- **Engine:** `@salusoft89/planegcs` — FreeCAD's PlaneGCS 2D solver compiled to WebAssembly with full TypeScript types (LGPL-2.1). It is the only browser-ready, actively maintained, CAD-kernel-derived solver implementing the full constraint set (coincident, horizontal, vertical, parallel, perpendicular, equal, distance/dimension, angle, tangent, symmetric, point-on-object, fixed) with robust algorithms (DogLeg default, Levenberg-Marquardt, BFGS, auto-SQP for drag).
- **Wrapped behind a thin adapter** (`core/`): our geometry model → solver JSON primitives → solve → apply solution back. The engine stays **swappable**.
- **Off the main thread:** all solving runs in a Web Worker. Use PlaneGCS `temporary` constraints (auto-SQP) for live drag-to-explore and `driving:false` constraints for reference/measure dimensions that don't move geometry.
- **v1 constraint set (deliberately small, casual-friendly):** coincident, horizontal, vertical, parallel, perpendicular, equal-length, distance/dimension, angle, fixed/lock, point-on-line. Geometry: points, line segments, circles/arcs (defer ellipses/conics).
- **Solver state feedback (v1):** fully vs underdefined via color/pill; graceful, reversible over-constraint toast.
- **Deferred to v2+:** rich DOF/conflict diagnostics that highlight the exact conflicting constraint (the PlaneGCS npm wrapper does not surface FreeCAD's `dofsNumber()`/conflicting/redundant lists; best-in-class diagnostics require extending the WASM wrapper from FreeCAD source). Also deferred: tangent/symmetric constraints, conics, constraint-priority tuning, multi-solution branch selection UI, any custom solver.
- **Licensing note:** LGPL-2.1 is workable for a hosted web app where the WASM stays a separate, replaceable module with attribution. Document the attribution; do not statically bundle a modified solver in a way that changes obligations.

---

## 7. Data model, units & persistence

- **Entities & constraints:** id-keyed maps. Points carry `x/y`; lines/arcs/circles/polylines/regions reference point ids. Constraints are first-class entities referencing entity/point ids. Dimensions are constraints flagged as driving (typed) vs reference (measured).
- **Canonical unit:** **integer micrometers** internally (exact equality, no float drift on equal/coincident comparisons), displayed in m/cm/mm or ft-in. (Decision: micrometers; chosen day-one because later migration is painful. Requires care in arc/angle math.)
- **Precision/rounding:** per-document display precision and rounding settings.
- **Document format:** a single **versioned, Zod-validated JSON** object with a `version` field and migration functions from day one. It is simultaneously the in-memory model, the autosave blob, and the shareable/exportable file.
- **Undo/redo:** Command pattern over Immer structural-sharing snapshots, routed through a small set of mutation functions; designed so it can later become diff-based for CRDT collaboration. Undo triggers a re-solve.
- **Persistence:** Dexie/IndexedDB (typed tables; never localStorage). Debounced autosave. Reference-image bytes stored as blobs.
- **Reference image underlay:** import an image as a tracing underlay, then draw a line over a known distance and type its real length to calibrate the whole drawing's scale.
- **Export:** PNG (canvas), SVG (hand-emitted with world→paper transform), print-to-scale PDF (pdf-lib, true mm→point scale with a 1:50-style label) — PDF/DXF maturing in v2.
- **Collaboration (v3):** real-time multiplayer via Yjs; model is already id-keyed so entities/constraints migrate to `Y.Map`-of-`Y.Map` with `y-indexeddb` + `y-websocket`, reconciling CRDT merge order with command/undo and solver re-runs.

---

## 8. Quality-of-life features

Grouped, with v1 (MVP) vs later. v1 is "Excalidraw that knows real-world dimensions" and already carries most of these.

| Group | v1 (MVP) | Later (v2–v3) |
|---|---|---|
| **Measure & math** | Live length/area/perimeter, angle readouts, running cursor coords, set scale from a known distance, tape-measure tool | Quick area-sum across selection, chain/overall dimension strings, auto-dimension a whole shape |
| **Drawing aids** | Grid snap; point/endpoint/midpoint snap; ortho/angle-lock (Shift); 15° snap; Figma-style alignment guides; snap toggle/strength | Tangent/perpendicular/intersection snap, persistent ruler guides, construction (reference-only) geometry, auto-square corners |
| **Editing** | Undo/redo, copy/paste/duplicate, multi-select (drag-box + shift-click), move/rotate/scale handles, numeric move/rotate, mirror/flip, nudge with arrows, align & distribute, group/ungroup | Array/repeat, offset/parallel duplicate (wall thickness), trim/extend/split, eyedropper, fillet/chamfer, boolean union/subtract |
| **Units** | Metric/imperial; mm/cm/m + in/ft; feet-and-inches input; rounding control; snap-increment setting | Fractional inches, drawing-scale presets, locale-aware defaults |
| **Organize** | Layers (show/hide/lock/reorder), named objects & rooms, color & fill, lock/hide/isolate, text labels & annotations | Object outliner panel, tags/categories, reusable custom symbols/favorites |
| **Import/Export** | PNG + SVG export, image-as-tracing-underlay + calibrate to scale, shareable view link | Print-to-scale PDF, DXF import/export, multi-page sheets & tiled print, cut/shopping list + cost estimate |
| **Persist & collab** | Local-first autosave, offline PWA, named save/open, `.json` import/export | Cloud sync across devices, version history/restore, real-time multiplayer (Yjs), comments/pins |
| **Navigate & input** | Pan/zoom (incl. pinch), zoom-to-fit/selection, zoom %, space-drag pan, recenter; full keyboard shortcuts; touch & pen; dark mode; tooltips; right-click context menu; on-canvas numeric keypad; magnet toggle | Minimap, command palette, gesture shortcuts, high-contrast/UI scale, read-only review mode |
| **Onboarding** | Templates, friendly empty state, coach mark, one-tap close shape | Interactive first-run tutorial, sample project to remix, furniture/symbol library, door/window openings |

**Top delight-per-effort wins to prioritize:** type-to-set dimension + live length-on-create; set scale from a known distance; live area/perimeter; smart alignment guides; snap to points/grid; ortho + angle snap; undo/redo; metric/imperial switching; image tracing underlay; autosave + offline.

---

## 9. Tech stack

- **Vite + React 19 + TypeScript** (strict; `noUncheckedIndexedAccess`; branded id/unit types). A heavily client-side canvas editor — no SSR/hydration friction around window/Canvas/WASM. **Not Next.js.**
- **`@salusoft89/planegcs`** (PlaneGCS via WASM, LGPL-2.1) behind a swappable adapter.
- **Web Worker + Comlink** for off-main-thread solving.
- **Custom Canvas2D renderer + RBush** R-tree (Konva is the only acceptable timeline-pressure fallback, with `strokeScaleEnabled=false` and custom edge/point hit math).
- **Zustand** for UI/editor state; document state in a separate command-driven store.
- **Immer + Command pattern** for undo/redo.
- **Dexie/IndexedDB** for local-first storage.
- **Zod-validated versioned JSON** schema with migrations from day one.
- **pdf-lib** (PDF), native canvas (PNG), hand-emitted SVG export.
- **vite-plugin-pwa** (injectManifest) for an installable, offline app shell with WASM precache; deployed to **Vercel** as a static SPA.
- **Vitest** for `core/`/`document/` units (the bulk) + **Playwright** / Vitest browser-mode for canvas snapshot and one draw→constrain→solve e2e.

---

## 10. Roadmap

### v0 — Prototype (internal, throwaway-OK)
**Goal:** prove the hard technical bet end to end — PlaneGCS-in-a-worker driving a live draw-and-dimension loop at interactive speed.
- Vite + React + TS monorepo scaffold with enforced package boundaries (`core`, `document`, `render`, `tools`, `ui`).
- Pure `core/` with vectors, point/line primitives, tolerant predicates, and the typed constraint set — Vitest-tested.
- PlaneGCS wired up in a Web Worker via Comlink behind the swappable solver facade, with correct WASM init/teardown.
- Throwaway single-canvas renderer: draw a few line segments, assign a length, watch the solver re-fit. No persistence, no polish.
- QoL included: pan & zoom; snap to grid.

### v1 — MVP ("Excalidraw that knows real-world dimensions")
**Goal:** a genuinely shippable, simple-feeling drafting tool: draw rough, type real dimensions, solver makes it exact, never lose work.
- Custom Canvas2D renderer (world model, manual transform, three stacked canvases, HiDPI, RBush culling + analytic sub-shape hit-testing).
- Core draw tools as state machines (Select, Line, Rectangle/Room, Polygon, Circle); live heads-up dimension chip with type-to-set length and Tab-to-angle; typed value = locked dimension.
- Auto-inference of everyday constraints from snapping (H/V with axis hint, endpoint, midpoint, on-edge, intersection, parallel, perpendicular, equal-length), previewed with glyph + one-word tooltip, recorded silently, suppressible with Ctrl/Cmd.
- Double-click-to-edit dimension labels with unit-aware input and live re-solve; drag-to-adjust underdefined geometry.
- Single color convention (blue/black/red) + plain-language status pill; non-blocking reversible over-constraint toast.
- Versioned Zod-validated JSON document model, referential integrity on delete, snapshot-based undo/redo, re-solve after each step.
- Local-first persistence (Dexie autosave, named save/open, `.json` import/export with version+migration hook, shareable view link).
- Reference-image underlay with draw-a-line-and-type-its-length calibration.
- Export PNG and SVG. PWA (offline shell + WASM precache), deployed to Vercel.
- Empty state with Blank/Template/coach-mark; a handful of general-drafting templates; unit picker; right-click context menu; Measure (read-only) tool.
- Touch basics: large hit targets, on-canvas numeric keypad, two-handed pan/zoom-while-draw, magnet toggle.
- QoL included: the entire v1 column of §8.

### v2 — Depth (more CAD power, still simple)
**Goal:** the constraint and editing depth that turns a delightful sketcher into a real general-purpose drafting tool, plus print/handoff.
- Tangent and symmetric constraints; arcs/radius dimensions matured; construction geometry.
- Rich over/under-constrained diagnostics (extend the PlaneGCS wrapper to surface DOF/conflicting/redundant lists) so the UI highlights the exact offending constraint.
- Auto-constrain-on-draw / one-click "clean up my sketch" with previewed proposal; drag-to-explore within constraints; auto-square corners.
- Editing depth: array/repeat, offset/parallel duplicate, trim/extend/split, eyedropper.
- Print-to-scale PDF and DXF export; auto-dimension a whole shape; chain/overall dimension strings.
- Snap to intersections/on-edge, tangent/perpendicular snap, draggable ruler guides; drawing-scale presets; fractional inches.
- Cloud sync across devices and version history; duplicate-as-template; object outliner.
- Command palette; symbol library; templates browser; interactive tutorial; sample project.
- Minimap; adjustable UI scale/high-contrast; gesture shortcuts; review mode.

### v3 — Collaboration, parameters & pro reach
**Goal:** multi-user and parametric power for repeat/serious users without compromising the simple default surface.
- Real-time multiplayer via Yjs; comments/pins on canvas.
- Named dimension variables, formulas, and equations (change one value, whole drawing updates).
- Fillet/chamfer; boolean union/subtract for L-shapes, alcoves, cutouts; quick-shape freehand recognition.
- DXF/SVG import with tolerant flattening and a skipped-entity report; multi-page sheets and tiled print-to-scale.
- Export dimensioned cut/shopping list and cost/quantity estimate; reusable custom symbols/favorites; tags/categories.
- Optional accounts + cloud share links (a small backend service kept separate from the Vite editor island).

---

## 11. Biggest risks & mitigations

1. **Inference "fightiness"** (wrong auto-snaps) — the single biggest threat to "simple." → tuned snap priorities, a clear Ctrl/Cmd suppress modifier, one-click glyph deletion, the "dimension only if typed" rule.
2. **Surprise geometry jumps / solution-branch flips** on underdefined solves. → seed the solver from the user's rough drawing, animate transitions, keep last-good coordinates when a solve fails to converge.
3. **Solver performance/jank in-browser, especially on tablets.** → Web Worker + Comlink, temporary/SQP solving during drag and full solve on release, debouncing, stale-solve cancellation.
4. **Over/under-constrained UX without rich diagnostics** (npm wrapper lacks DOF/conflict lists). → v1 degrades gracefully with reversible toasts; extend the wrapper in v2 for precise conflict highlighting.
5. **WASM lifecycle and bundle weight** (async init, Vite `?url`/locateFile, manual memory management). → disciplined worker-side lifecycle handling and lazy-load.
6. **Architectural boundary erosion** (React in the per-frame loop, or scene-graph leaking into the document). → enforce dependency direction via separate workspace packages.
7. **Schema/float-precision foundations chosen too late.** → ship the canonical micrometer unit and a versioned Zod schema with migrations on day one.
8. **Touch precision.** → large targets, offset dimension chips, and the on-canvas keypad from v1, not bolted on later.

---

## 12. Decisions made

- **Product name:** Plot.
- **Platform:** browser web app (desktop + tablet), installable PWA, deployed to Vercel.
- **Scope:** 2D top-down only; general-purpose 2D drafting; v1 templates bias toward general drafting (not a single vertical).
- **Math model:** parametric constraints via PlaneGCS, surfaced through the draw-rough-then-type-numbers UX.
- **Canonical internal unit:** integer micrometers.
- **Solver:** `@salusoft89/planegcs` behind a swappable adapter, in a Web Worker.
- **Framework:** Vite + React + TypeScript SPA (not Next.js).
- **Renderer:** custom Canvas2D + RBush (Konva fallback only under timeline pressure).
- **Next step:** write the implementation plan.

## 13. Open decisions (revisit, not blocking v1)

- Whether/when a marketing site + accounts + cloud backend become imminent (would justify a separate surface; otherwise stay fully static/local-first through v2).
- Default unit + decimal precision presets per region, and whether to auto-detect from locale.
- Exact v1 template starter set within the general-drafting bias.
- Whether to invest in extending the PlaneGCS WASM wrapper for DOF/conflict diagnostics in v2 vs accepting reversible-toast handling longer.
- LGPL-2.1 attribution/replaceability obligation: document explicitly; confirm no plan to statically bundle a modified solver.
