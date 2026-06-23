import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import {
  CanvasRenderer,
  fitToBounds,
  screenToWorld,
  panBy,
  zoomAt,
  hitTest,
  worldToScreen,
} from '@plot/render'
import type { Bounds } from '@plot/render'
import { useEditor } from './store'
import { loadImage } from './image'
import { CalibrateInput } from './CalibrateInput'
import {
  addLineSegment,
  addRectangle,
  setPointFixed,
  setLineLength,
  addAxisConstraint,
  mergePoint,
  inferAxis,
  snapPoint,
  affectedPointIds,
  translateEntities,
} from '@plot/document'
import type { PlotDocument } from '@plot/document'
import type { Vec2 } from '@plot/core'
import { idGen } from './ids'
import { DimensionChip } from './DimensionChip'
import { EdgeEditor } from './EdgeEditor'

function documentBounds(doc: PlotDocument): Bounds {
  const xs: number[] = []
  const ys: number[] = []
  for (const p of Object.values(doc.sketch.points)) {
    xs.push(p.x)
    ys.push(p.y)
  }
  if (xs.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

// Marquee box selection: every point whose (x,y) falls inside the normalized box,
// plus every line whose BOTH endpoints fall inside. `a`/`b` are the drag corners
// in world coords.
function entitiesInBox(doc: PlotDocument, a: Vec2, b: Vec2): string[] {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  const inside = (id: string): boolean => {
    const p = doc.sketch.points[id]
    return !!p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  }
  const ids: string[] = []
  for (const id of Object.keys(doc.sketch.points)) {
    if (inside(id)) ids.push(id)
  }
  for (const [id, line] of Object.entries(doc.sketch.lines)) {
    if (inside(line.a) && inside(line.b)) ids.push(id)
  }
  return ids
}

// World-pixel tolerance for snapping a draft endpoint to an existing point.
const SNAP_TOL_PX = 8

const layer: React.CSSProperties = { position: 'absolute', inset: 0 }

export function CanvasView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLCanvasElement>(null)
  const geomRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CanvasRenderer | null>(null)
  // Track whether we've done the first fit
  const didFitRef = useRef(false)
  // Store the last measured size so we can refit
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })

  const doc = useEditor((s) => s.doc())
  const camera = useEditor((s) => s.camera)
  const selection = useEditor((s) => s.selection)
  const hover = useEditor((s) => s.hover)
  const draft = useEditor((s) => s.draft)
  const snap = useEditor((s) => s.snap)
  const marquee = useEditor((s) => s.marquee)
  const fitNonce = useEditor((s) => s.fitNonce)
  const setCamera = useEditor((s) => s.setCamera)
  const setHover = useEditor((s) => s.setHover)

  // Cache the decoded reference-image element. It is keyed only on the data URL,
  // so calibrate (which changes x/y/umPerPx but not dataUrl) does NOT reload it;
  // a fresh import (new dataUrl) does. `imgTick` bumps on load to force a
  // re-render once the pixels are ready. `imgEl` is null until loaded or when
  // there is no image.
  const imageUrl = doc.image?.dataUrl ?? null
  const imgElRef = useRef<HTMLImageElement | null>(null)
  const [imgTick, setImgTick] = useState(0)

  useEffect(() => {
    if (!imageUrl) {
      imgElRef.current = null
      setImgTick((t) => t + 1)
      return
    }
    let cancelled = false
    void loadImage(imageUrl).then(
      (el) => {
        if (cancelled) return
        imgElRef.current = el
        setImgTick((t) => t + 1)
      },
      () => {
        if (cancelled) return
        imgElRef.current = null
        setImgTick((t) => t + 1)
      },
    )
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  // Create renderer on mount
  useEffect(() => {
    const grid = gridRef.current
    const geom = geomRef.current
    const overlay = overlayRef.current
    if (!grid || !geom || !overlay) return
    rendererRef.current = new CanvasRenderer(grid, geom, overlay)
  }, [])

  // ResizeObserver: resize renderer and do first fit
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width: cssW, height: cssH } = entry.contentRect
      sizeRef.current = { w: cssW, h: cssH }
      const renderer = rendererRef.current
      if (!renderer) return
      renderer.resize(cssW, cssH, window.devicePixelRatio)
      if (!didFitRef.current) {
        didFitRef.current = true
        const currentDoc = useEditor.getState().doc()
        const cam = fitToBounds(documentBounds(currentDoc), cssW, cssH)
        setCamera(cam)
      } else {
        // Re-render with current state after resize (keep the underlay).
        const state = useEditor.getState()
        const d = state.doc()
        const imgEl = imgElRef.current
        const image =
          d.image && imgEl
            ? { el: imgEl, x: d.image.x, y: d.image.y, umPerPx: d.image.umPerPx, opacity: d.image.opacity, w: d.image.w, h: d.image.h }
            : null
        renderer.render({
          doc: d,
          camera: state.camera,
          selection: state.selection,
          hover: state.hover,
          draft: state.draft,
          snap: state.snap,
          marquee: state.marquee,
          image,
        })
      }
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [setCamera])

  // Re-render when doc/camera/selection/hover/draft/snap/image change.
  // Build the render-time image from the doc placement + cached element; null
  // until the element has decoded (or when there is no image).
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const imgEl = imgElRef.current
    const image =
      doc.image && imgEl
        ? {
            el: imgEl,
            x: doc.image.x,
            y: doc.image.y,
            umPerPx: doc.image.umPerPx,
            opacity: doc.image.opacity,
            w: doc.image.w,
            h: doc.image.h,
          }
        : null
    renderer.render({ doc, camera, selection, hover, draft, snap, marquee, image })
    // imgTick is intentionally a dep: it bumps when the cached element finishes
    // loading so the underlay paints once pixels are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, camera, selection, hover, draft, snap, marquee, imgTick])

  // Handle fitNonce: recompute fit when it increments
  // Read doc from store directly so document edits don't re-trigger this effect
  useEffect(() => {
    if (fitNonce === 0) return
    const { w, h } = sizeRef.current
    if (w === 0 || h === 0) return
    const currentDoc = useEditor.getState().doc()
    const cam = fitToBounds(documentBounds(currentDoc), w, h)
    setCamera(cam)
  }, [fitNonce, setCamera])

  // Pointer state stored in refs (not React state, to avoid re-renders in hot path)
  const panningRef = useRef(false)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  // Move-drag state (select tool): drag the whole current selection. `base` is
  // `history.present` with every affected point fixed, so translating those points
  // and solving moves the rest of the sketch around the dragged set. `origFixed`
  // records each affected point's original fixed flag (restored on commit). `last`
  // is the most recent unsolved doc so finishDrag solves from the final cursor
  // position even if a preview solve is still in flight. `startWorld` is the world
  // position at pointerdown; the world delta is applied to `base` each move.
  const dragRef = useRef<{
    ids: string[]
    affected: string[]
    base: PlotDocument
    origFixed: Map<string, boolean>
    startWorld: Vec2
    last: PlotDocument
  } | null>(null)
  const dragMovedRef = useRef(false)
  // Marquee drag (select tool, left-drag on empty space). Start world position;
  // the box is `{ a: start, b: cursor }` mirrored into the store for rendering.
  const marqueeRef = useRef<{ start: Vec2 } | null>(null)
  // Whether Space is currently held — left-drag then pans (instead of marquee).
  const spaceDownRef = useRef(false)

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // Non-passive wheel listener so preventDefault() actually works (React 19 registers onWheel passive)
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setCamera(zoomAt(useEditor.getState().camera, cursor, factor))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [setCamera])

  // Track Space held so left-drag pans (leaving plain left-drag for marquee).
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceDownRef.current = true
        e.preventDefault()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDownRef.current = false
    }
    const onBlur = () => {
      spaceDownRef.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Keyboard: undo/redo, select-all, duplicate/copy/paste, nudge, fit/zoom,
  // delete, tool shortcuts, escape. Guarded while typing in a form field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in a form field
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const st = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey

      // Ctrl/Cmd shortcuts.
      if (mod) {
        const k = e.key.toLowerCase()
        if (k === 'z') {
          if (e.shiftKey) st.redo()
          else st.undo()
          e.preventDefault()
          return
        }
        if (k === 'y') {
          st.redo()
          e.preventDefault()
          return
        }
        if (k === 'a') {
          st.selectAll()
          e.preventDefault()
          return
        }
        if (k === 'd') {
          st.duplicateSelection()
          e.preventDefault()
          return
        }
        if (k === 'c') {
          st.copySelection()
          e.preventDefault()
          return
        }
        if (k === 'v') {
          st.paste(200000, 200000)
          e.preventDefault()
          return
        }
        return
      }

      // Arrow-key nudge (Shift = larger step). Steps in micrometers.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (st.selection.size === 0) return
        const step = e.shiftKey ? 100000 : 10000
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step
        else if (e.key === 'ArrowUp') dy = step
        else dy = -step
        void st.nudge(dx, dy)
        e.preventDefault()
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelection()
        e.preventDefault()
      } else if (e.key === 'v' || e.key === 'V') {
        st.setDraft(null)
        st.setHover(null)
        st.setSnap(null)
        st.setTypedLength(null)
        st.setTool('select')
      } else if (e.key === 'l' || e.key === 'L') {
        st.setDraft(null)
        st.setHover(null)
        st.setSnap(null)
        st.setTypedLength(null)
        st.setTool('line')
      } else if (e.key === 'r' || e.key === 'R') {
        st.setDraft(null)
        st.setHover(null)
        st.setSnap(null)
        st.setTypedLength(null)
        st.setTool('rect')
      } else if (e.key === '0') {
        st.fit()
      } else if (e.key === '=' || e.key === '+') {
        const { w, h } = sizeRef.current
        setCamera(zoomAt(useEditor.getState().camera, { x: w / 2, y: h / 2 }, 1.1))
      } else if (e.key === '-' || e.key === '_') {
        const { w, h } = sizeRef.current
        setCamera(zoomAt(useEditor.getState().camera, { x: w / 2, y: h / 2 }, 1 / 1.1))
      } else if (e.key === 'Escape') {
        st.setDraft(null)
        st.setSnap(null)
        st.setMarquee(null)
        st.setTypedLength(null)
        st.setCalibrating(null)
        st.select(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setCamera])

  // ---- Tool pointer handling ----

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e)
    pointerDownPosRef.current = pos
    const state = useEditor.getState()
    const tool = state.tool
    const currentCamera = state.camera
    const present = state.history.present
    const world = screenToWorld(currentCamera, pos)
    const TOL_PX = 8
    const hit = hitTest(present.sketch, world, TOL_PX / currentCamera.scale)

    // Pan: middle-button drag, or left-drag while Space is held. Available in
    // every tool so the canvas can always be panned.
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      panningRef.current = true
      lastPointerRef.current = pos
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (tool === 'select') {
      if (hit) {
        // Resolve the selection for this press, then drag the whole selection.
        if (e.shiftKey) {
          state.toggleSelect(hit.id)
        } else if (!state.selection.has(hit.id)) {
          state.setSelection([hit.id])
        }
        // Read the (now-updated) selection and begin a move-drag. Fix every point
        // implied by the selection so translating them moves the rest via solve.
        const sel = [...useEditor.getState().selection]
        if (sel.length > 0) {
          const affected = [...affectedPointIds(present.sketch, sel)]
          const origFixed = new Map<string, boolean>()
          let base = present
          for (const pid of affected) {
            const p = present.sketch.points[pid]
            origFixed.set(pid, p ? p.fixed : false)
            base = setPointFixed(base, pid, true)
          }
          dragRef.current = { ids: sel, affected, base, origFixed, startWorld: world, last: base }
          dragMovedRef.current = false
        }
        panningRef.current = false
        e.currentTarget.setPointerCapture(e.pointerId)
      } else {
        // Empty space: begin a marquee box selection.
        marqueeRef.current = { start: world }
        state.setMarquee({ a: world, b: world })
        panningRef.current = false
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      return
    }

    // line / rect / calibrate tools: handled on pointer up (click semantics).
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e)
    const state = useEditor.getState()
    const tool = state.tool
    const currentCamera = state.camera
    const world = screenToWorld(currentCamera, pos)
    // Status-bar cursor coordinates track every move.
    state.setCursor(world)

    // Move-dragging the whole selection (select tool)
    const drag = dragRef.current
    if (drag) {
      const downPos = pointerDownPosRef.current
      if (downPos && Math.hypot(pos.x - downPos.x, pos.y - downPos.y) >= 4) {
        dragMovedRef.current = true
      }
      const dx = world.x - drag.startWorld.x
      const dy = world.y - drag.startWorld.y
      // Translate every affected point on the fixed base, then solve.
      const moved = translateEntities(drag.base, drag.ids, dx, dy)
      drag.last = moved
      // Fire-and-forget; latest-wins inside the store drops stale solves.
      void state.solvePreview(moved)
      return
    }

    // Marquee box (select tool, left-drag on empty space)
    const marq = marqueeRef.current
    if (marq) {
      state.setMarquee({ a: marq.start, b: world })
      return
    }

    // Panning
    if (panningRef.current && lastPointerRef.current) {
      const dx = pos.x - lastPointerRef.current.x
      const dy = pos.y - lastPointerRef.current.y
      lastPointerRef.current = pos
      setCamera(panBy(currentCamera, dx, dy))
      return
    }

    // Update an in-progress draft (line/rect tools)
    const draftNow = state.draft
    if (tool === 'line' && draftNow && draftNow.kind === 'line') {
      // Axis inference + endpoint snap while drawing a line.
      const a = draftNow.a
      let b = { x: world.x, y: world.y }
      const axis = inferAxis(a.x, a.y, b.x, b.y)
      if (axis === 'horizontal') {
        b = { x: b.x, y: a.y }
        state.setSnap({ kind: 'horizontal', at: b })
      } else if (axis === 'vertical') {
        b = { x: a.x, y: b.y }
        state.setSnap({ kind: 'vertical', at: b })
      } else {
        const present = state.history.present
        const snapId = snapPoint(present.sketch, world, SNAP_TOL_PX / currentCamera.scale)
        const p = snapId ? present.sketch.points[snapId] : undefined
        if (p) {
          b = { x: p.x, y: p.y }
          state.setSnap({ kind: 'endpoint', at: b })
        } else {
          state.setSnap(null)
        }
      }
      state.setDraft({ ...draftNow, b })
      return
    }
    if (tool === 'rect' && draftNow) {
      state.setDraft({ ...draftNow, b: { x: world.x, y: world.y } })
      return
    }
    // Calibrate: live-preview the reference segment (no snap/inference).
    if (tool === 'calibrate' && draftNow && draftNow.kind === 'line') {
      state.setDraft({ ...draftNow, b: { x: world.x, y: world.y } })
      return
    }

    // Otherwise update hover (select tool, no drag/pan)
    if (tool === 'select') {
      const TOL_PX = 8
      const hit = hitTest(state.history.present.sketch, world, TOL_PX / currentCamera.scale)
      setHover(hit)
    }
  }

  // Commit the in-progress line draft: build the segment, then apply a typed
  // length (distance constraint), an inferred H/V axis constraint, and merge each
  // endpoint that lands on an existing point. Solve + commit, then clear transient
  // draft/snap/typedLength state. Shared by the second-click and the chip's Enter.
  function commitLineDraft() {
    const state = useEditor.getState()
    const draftNow = state.draft
    if (!draftNow || draftNow.kind !== 'line') return
    const present = state.history.present
    const a = draftNow.a
    const b = draftNow.b

    // Drop a zero-length draft.
    if (a.x === b.x && a.y === b.y) {
      state.setDraft(null)
      state.setSnap(null)
      state.setTypedLength(null)
      return
    }

    const axis = inferAxis(a.x, a.y, b.x, b.y)
    const typedLength = state.typedLength

    // Identify the ids the segment will create by diffing keys before/after.
    const beforePoints = new Set(Object.keys(present.sketch.points))
    const beforeLines = new Set(Object.keys(present.sketch.lines))
    let next = addLineSegment(present, idGen, a.x, a.y, b.x, b.y)
    const newPointIds = Object.keys(next.sketch.points).filter((id) => !beforePoints.has(id))
    const newLineId = Object.keys(next.sketch.lines).find((id) => !beforeLines.has(id))
    // addLineSegment emits point a first, then point b.
    const [newAId, newBId] = newPointIds
    if (!newLineId || !newAId || !newBId || newPointIds.length !== 2) {
      // Defensive: bail without corrupting state.
      state.setDraft(null)
      state.setSnap(null)
      state.setTypedLength(null)
      return
    }

    if (typedLength !== null) {
      next = setLineLength(next, idGen, newLineId, typedLength)
    }
    if (axis) {
      next = addAxisConstraint(next, idGen, newLineId, axis)
    }

    // Merge each new endpoint onto a nearby existing point (excluding the just-made
    // points). When axis was inferred we don't snap-merge (the axis lock already
    // moved b), but the start point can still merge.
    const excludeNew = new Set(newPointIds)
    const tolWorld = SNAP_TOL_PX / state.camera.scale
    const mergePairs: Array<[string, string]> = []
    const startSnap = snapPoint(present.sketch, a, tolWorld, excludeNew)
    if (startSnap) mergePairs.push([startSnap, newAId])
    // Only snap-merge the end if it wasn't axis-locked (axis lock owns b).
    if (!axis) {
      const endSnap = snapPoint(present.sketch, b, tolWorld, excludeNew)
      if (endSnap && endSnap !== startSnap) mergePairs.push([endSnap, newBId])
    }
    for (const [keepId, dropId] of mergePairs) {
      next = mergePoint(next, keepId, dropId)
    }

    state.setDraft(null)
    state.setSnap(null)
    state.setTypedLength(null)
    void state.solveAndCommit(next)
  }

  // Register the line-commit routine so the DimensionChip can trigger it on Enter.
  useEffect(() => {
    useEditor.getState().setCommitLineDraft(commitLineDraft)
    return () => useEditor.getState().setCommitLineDraft(null)
    // commitLineDraft reads everything fresh from the store, so it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // PNG compositor: composites grid + geometry canvases onto a white offscreen
  // canvas at the current CSS size × devicePixelRatio, skipping the transient overlay.
  function exportPNG(): Promise<Blob | null> {
    const grid = gridRef.current
    const geom = geomRef.current
    const container = containerRef.current
    if (!grid || !geom || !container) return Promise.resolve(null)
    const dpr = window.devicePixelRatio || 1
    const cssW = container.clientWidth
    const cssH = container.clientHeight
    const offscreen = document.createElement('canvas')
    offscreen.width = cssW * dpr
    offscreen.height = cssH * dpr
    const ctx = offscreen.getContext('2d')
    if (!ctx) return Promise.resolve(null)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, offscreen.width, offscreen.height)
    ctx.drawImage(grid, 0, 0)
    ctx.drawImage(geom, 0, 0)
    return new Promise<Blob | null>((resolve) => offscreen.toBlob(resolve, 'image/png'))
  }

  // Register the PNG export routine so App toolbar can call it.
  useEffect(() => {
    useEditor.getState().setExportPNG(exportPNG)
    return () => useEditor.getState().setExportPNG(null)
    // exportPNG reads canvas refs directly; it is stable for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle-button release: just clean up pan state; never fall through to draw paths.
    if (e.button === 1) {
      if (panningRef.current) {
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
      }
      clearPointerState()
      return
    }

    const pos = getCanvasPos(e)
    const state = useEditor.getState()
    const tool = state.tool

    // Finish a selection move-drag.
    const drag = dragRef.current
    if (drag) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      if (dragMovedRef.current) {
        finishDrag(drag)
      } else {
        // No real movement: selection was already resolved at pointerdown; just
        // discard the transient preview.
        state.clearPreview()
      }
      clearPointerState()
      return
    }

    // Finish a marquee box selection.
    const marq = marqueeRef.current
    if (marq) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      const world = screenToWorld(state.camera, pos)
      const downPos = pointerDownPosRef.current
      const dragged = downPos ? Math.hypot(pos.x - downPos.x, pos.y - downPos.y) >= 4 : false
      if (dragged) {
        const ids = entitiesInBox(state.history.present, marq.start, world)
        state.setSelection(ids)
      } else {
        // Plain click on empty space: clear the selection.
        state.select(null)
      }
      state.setMarquee(null)
      clearPointerState()
      return
    }

    const downPos = pointerDownPosRef.current
    const moved = downPos ? Math.hypot(pos.x - downPos.x, pos.y - downPos.y) : 0
    const isClick = moved < 4

    if (tool === 'select') {
      if (panningRef.current) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      clearPointerState()
      return
    }

    // Calibrate: two clicks define a world reference segment over an image
    // feature. No geometry is created — the second click hands off to
    // CalibrateInput (via `calibrating`) to collect the real length.
    if (tool === 'calibrate') {
      if (!isClick) {
        clearPointerState()
        return
      }
      const world = screenToWorld(state.camera, pos)
      const draftNow = state.draft
      if (!draftNow) {
        // First click: start the reference segment.
        state.setDraft({ kind: 'line', a: { x: world.x, y: world.y }, b: { x: world.x, y: world.y } })
      } else if (draftNow.kind === 'line') {
        // Second click: anchor the segment, position the length input at the
        // segment midpoint (in canvas px), and clear the draft.
        const a = draftNow.a
        const b = { x: world.x, y: world.y }
        if (a.x === b.x && a.y === b.y) {
          // Zero-length reference: ignore, keep waiting for a real second point.
          clearPointerState()
          return
        }
        const mid = worldToScreen(state.camera, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
        state.setDraft(null)
        state.setSnap(null)
        state.setCalibrating({ a, b, screen: { x: mid.x, y: mid.y } })
      }
      clearPointerState()
      return
    }

    // line / rect: place a click point.
    if (tool === 'line' || tool === 'rect') {
      if (!isClick) {
        clearPointerState()
        return
      }
      const world = screenToWorld(state.camera, pos)
      const draftNow = state.draft
      if (!draftNow) {
        // First click: start the draft. For a line, snap the start onto an
        // existing point if one is nearby.
        let a = { x: world.x, y: world.y }
        if (tool === 'line') {
          const snapId = snapPoint(state.history.present.sketch, world, SNAP_TOL_PX / state.camera.scale)
          const p = snapId ? state.history.present.sketch.points[snapId] : undefined
          if (p) a = { x: p.x, y: p.y }
        }
        state.setDraft({ kind: tool, a, b: a })
      } else if (tool === 'line') {
        // Second click: commit via the shared line-commit path.
        commitLineDraft()
      } else {
        // Rect second click: keep slice-2 behavior (no typed length / inference).
        const present = state.history.present
        const a = draftNow.a
        const next = addRectangle(present, idGen, a.x, a.y, world.x, world.y)
        state.setDraft(null)
        void state.solveAndCommit(next)
      }
      clearPointerState()
      return
    }

    clearPointerState()
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const state = useEditor.getState()
    const world = screenToWorld(state.camera, pos)
    const TOL_PX = 8
    const hit = hitTest(state.history.present.sketch, world, TOL_PX / state.camera.scale)
    if (hit && hit.kind === 'line') {
      state.setEditing({ lineId: hit.id, screen: pos })
    }
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Don't leave a drag half-fixed: reuse the drag cleanup path.
    const drag = dragRef.current
    if (drag) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // pointer may already be released
      }
      if (dragMovedRef.current) {
        finishDrag(drag)
      } else {
        useEditor.getState().clearPreview()
      }
    } else if (marqueeRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // pointer may already be released
      }
      useEditor.getState().setMarquee(null)
    } else if (panningRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
    clearPointerState()
  }

  const onPointerLeave = () => {
    if (!panningRef.current && !dragRef.current) {
      setHover(null)
    }
  }

  // Commit a move-drag: restore each affected point's ORIGINAL fixed flag (captured
  // at drag start), then solve+commit. Solve from `drag.last` (points at the final
  // cursor) so the committed result matches the cursor even if a preview solve is
  // still in flight.
  function finishDrag(drag: NonNullable<typeof dragRef.current>) {
    const state = useEditor.getState()
    let restored = drag.last
    for (const pid of drag.affected) {
      restored = setPointFixed(restored, pid, drag.origFixed.get(pid) ?? false)
    }
    void state.solveAndCommit(restored)
  }

  function clearPointerState() {
    panningRef.current = false
    lastPointerRef.current = null
    pointerDownPosRef.current = null
    dragRef.current = null
    dragMovedRef.current = false
    marqueeRef.current = null
  }

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={gridRef} style={layer} />
      <canvas ref={geomRef} style={layer} />
      <canvas
        ref={overlayRef}
        style={{ ...layer, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
      />
      <DimensionChip />
      <EdgeEditor />
      <CalibrateInput />
    </div>
  )
}
