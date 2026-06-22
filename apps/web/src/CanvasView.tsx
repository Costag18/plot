import { useEffect, useRef } from 'react'
import type React from 'react'
import {
  CanvasRenderer,
  fitToBounds,
  screenToWorld,
  panBy,
  zoomAt,
  hitTest,
} from '@plot/render'
import type { Bounds, SnapHint } from '@plot/render'
import { useEditor } from './store'
import {
  addLineSegment,
  addRectangle,
  movePoint,
  setPointFixed,
  setLineLength,
  addAxisConstraint,
  mergePoint,
  inferAxis,
  snapPoint,
} from '@plot/document'
import type { PlotDocument } from '@plot/document'
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
  const fitNonce = useEditor((s) => s.fitNonce)
  const setCamera = useEditor((s) => s.setCamera)
  const setHover = useEditor((s) => s.setHover)

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
        // Re-render with current state after resize
        const state = useEditor.getState()
        renderer.render({
          doc: state.doc(),
          camera: state.camera,
          selection: state.selection,
          hover: state.hover,
          draft: state.draft,
          snap: state.snap,
        })
      }
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [setCamera])

  // Re-render when doc/camera/selection/hover/draft/snap change
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.render({ doc, camera, selection, hover, draft, snap })
  }, [doc, camera, selection, hover, draft, snap])

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
  const hitAtDownRef = useRef<import('@plot/render').Hit | null>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  // Drag-a-point state (select tool). `last` is the most recent unsolved doc
  // (point moved to cursor); finishDrag solves from this so the committed result
  // reflects the final cursor position even if a preview solve is still in flight.
  const dragRef = useRef<{
    id: string
    base: PlotDocument
    origFixed: boolean
    last: PlotDocument
  } | null>(null)
  const dragMovedRef = useRef(false)

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

  // Keyboard: delete, tool shortcuts, escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in a form field
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const st = useEditor.getState()
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
      } else if (e.key === 'Escape') {
        st.setDraft(null)
        st.setSnap(null)
        st.setTypedLength(null)
        st.select(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
    hitAtDownRef.current = hit

    if (tool === 'select') {
      if (hit && hit.kind === 'point') {
        // Begin dragging this point. Fix it so the solver moves the rest.
        const p = present.sketch.points[hit.id]
        const origFixed = p ? p.fixed : false
        const base = setPointFixed(present, hit.id, true)
        dragRef.current = { id: hit.id, base, origFixed, last: base }
        dragMovedRef.current = false
        panningRef.current = false
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (hit) {
        // Line hit: potential click-select; don't pan.
        panningRef.current = false
      } else {
        // Empty: begin panning.
        panningRef.current = true
        lastPointerRef.current = pos
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      return
    }

    // line / rect tools: handled on pointer up (click semantics).
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e)
    const state = useEditor.getState()
    const tool = state.tool
    const currentCamera = state.camera
    const world = screenToWorld(currentCamera, pos)

    // Dragging a point (select tool)
    const drag = dragRef.current
    if (drag) {
      const downPos = pointerDownPosRef.current
      if (downPos && Math.hypot(pos.x - downPos.x, pos.y - downPos.y) >= 4) {
        dragMovedRef.current = true
      }
      const moved = movePoint(drag.base, drag.id, world.x, world.y)
      drag.last = moved
      // Fire-and-forget; latest-wins inside the store drops stale solves.
      void state.solvePreview(moved)
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
    const pos = getCanvasPos(e)
    const state = useEditor.getState()
    const tool = state.tool

    // Finish a point drag.
    const drag = dragRef.current
    if (drag) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      if (dragMovedRef.current) {
        finishDrag(drag)
      } else {
        // No real movement: treat as a click-select, discard the transient preview.
        state.clearPreview()
        state.select(hitAtDownRef.current)
      }
      clearPointerState()
      return
    }

    const downPos = pointerDownPosRef.current
    const moved = downPos ? Math.hypot(pos.x - downPos.x, pos.y - downPos.y) : 0
    const isClick = moved < 4

    if (tool === 'select') {
      if (panningRef.current) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } else if (isClick) {
        // Click select / clear (hitAtDown captured at pointerdown).
        state.select(hitAtDownRef.current)
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

  // Commit a drag: restore the point's original fixed flag, then solve+commit.
  // Solve from `drag.last` (point at the final cursor) so the committed result
  // matches the cursor even if a preview solve is still in flight.
  function finishDrag(drag: NonNullable<typeof dragRef.current>) {
    const state = useEditor.getState()
    const restored = setPointFixed(drag.last, drag.id, drag.origFixed)
    void state.solveAndCommit(restored)
  }

  function clearPointerState() {
    panningRef.current = false
    lastPointerRef.current = null
    hitAtDownRef.current = null
    pointerDownPosRef.current = null
    dragRef.current = null
    dragMovedRef.current = false
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
    </div>
  )
}
