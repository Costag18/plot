# Plot v1 — Slice 8: PWA/Offline + Touch/Pinch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the v1 MVP: make the app installable + offline (PWA) and usable on a tablet/phone (one-finger pan, two-finger pinch-zoom). Both changes are confined to `apps/web`.

**Scope note:** Final v1 slice. PWA service worker is enabled for production builds only (`devOptions.enabled: false`) so `pnpm dev` keeps working without SW caching. Touch uses Pointer Events.

---

## Task 1: PWA (installable + offline)

**Files:** Modify `apps/web/package.json` (add `vite-plugin-pwa`), `apps/web/vite.config.ts`, `apps/web/src/main.tsx`; Create `apps/web/public/icon.svg`.

- [ ] **Step 1: Add the dependency** — add `"vite-plugin-pwa": "^0.21.1"` to `apps/web` devDependencies; `pnpm install`.

- [ ] **Step 2: Icon** — create `apps/web/public/icon.svg` (a simple square logo, e.g. a blue rounded square with a white "P" or a grid glyph; viewBox 0 0 512 512). Keep it valid standalone SVG.

- [ ] **Step 3: vite.config.ts** — add the plugin alongside `react()` and keep the existing `worker`/`optimizeDeps` settings:
```ts
import { VitePWA } from 'vite-plugin-pwa'
// ...
plugins: [
  react(),
  VitePWA({
    registerType: 'autoUpdate',
    devOptions: { enabled: false },
    includeAssets: ['icon.svg'],
    workbox: {
      globPatterns: ['**/*.{js,css,html,wasm,svg}'],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // the planegcs wasm is ~0.5MB
    },
    manifest: {
      name: 'Plot',
      short_name: 'Plot',
      description: 'Simple 2D CAD that does the math for you.',
      theme_color: '#1d4ed8',
      background_color: '#111111',
      display: 'standalone',
      icons: [
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    },
  }),
],
```

- [ ] **Step 4: Register the SW** — in `apps/web/src/main.tsx`, register with auto-update:
```ts
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })
```
Add `/// <reference types="vite-plugin-pwa/client" />` to `apps/web/src/vite-env.d.ts` so the virtual module + `import.meta` types resolve.

- [ ] **Step 5: typecheck + build** — `pnpm --filter @plot/web typecheck` (0 errors); `pnpm --filter @plot/web build` — succeeds and the build output now includes `sw.js` (or `service-worker`) and `manifest.webmanifest` in `dist/`. Confirm by listing `dist/`.

- [ ] **Step 6: Commit** — `git add apps/web && git commit -m "feat(web): installable offline PWA"`

---

## Task 2: Touch — one-finger pan, two-finger pinch-zoom

**Files:** Modify `apps/web/src/CanvasView.tsx`.

Use Pointer Events (the overlay canvas already has `touch-action: none`). Track active touch pointers in a ref `Map<pointerId, {x,y}>` (canvas-local coords).

- [ ] **Step 1: Track touch pointers**
  - In `onPointerDown`: if `e.pointerType === 'touch'`, add the pointer to the map. If this makes exactly 2 active touch pointers, **begin a pinch**: record the initial distance and midpoint; set a `pinchingRef = true`; do NOT start marquee/draw/pan for touch while pinching. If exactly 1 touch pointer and the tool is `select`, treat a one-finger drag as **pan** (set panning), not marquee.
  - In `onPointerMove`: if `e.pointerType === 'touch'`, update the pointer's position in the map. If 2 touch pointers are active (`pinchingRef`): compute new distance + midpoint; `zoomAt(camera, midpointScreen, newDist/lastDist)` and `panBy` by the midpoint delta; update `lastDist`/`lastMid`. (Apply via `setCamera`.) Return early (skip mouse logic).
  - In `onPointerUp`/`onPointerCancel`: remove the pointer from the map. When fewer than 2 remain, end pinch; when 0 remain, end touch-pan.

- [ ] **Step 2: One-finger pan for touch**
  - For `pointerType === 'touch'` with a single active pointer in the `select` tool, route the drag to the existing pan path (reuse `panningRef` + `panBy`) instead of marquee. (In line/rect/polygon tools, a single touch still places points on tap — keep tap = click.) Keep mouse behavior (marquee on left-drag, space/middle pan) unchanged.

- [ ] **Step 3: Don't break mouse** — guard the new branches strictly on `e.pointerType === 'touch'`. Mouse/pen paths are unchanged.

- [ ] **Step 4: typecheck + build** — both pass. (Controller verifies touch behavior is wired without errors; real multi-touch needs a device.)

- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "feat(web): one-finger pan and two-finger pinch-zoom on touch"`

---

## Final verification
- [ ] `pnpm test` — all pass (no package changes; counts unchanged).
- [ ] `pnpm typecheck` — zero errors.
- [ ] `pnpm --filter @plot/web build` — succeeds; `dist/` contains the service worker + `manifest.webmanifest` + `icon.svg`.
- [ ] Controller verification: build output has PWA artifacts; the touch branches compile and are guarded by `pointerType === 'touch'` so desktop is unaffected.

## Self-review against the slice
- **Installable offline PWA (prod only, dev unaffected)** → Task 1. ✓
- **One-finger pan + two-finger pinch-zoom on touch, desktop unchanged** → Task 2. ✓
- **v1 MVP complete.** Remaining items (print-to-scale PDF, DXF, real-time collaboration, dimension variables/formulas, parallel/perp/equal auto-inference, per-entity constraint coloring/DOF) are v2/v3 per the design spec.
```
