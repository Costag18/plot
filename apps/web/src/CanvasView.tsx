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
import type { Bounds } from '@plot/render'
import { useEditor } from './store'
import type { PlotDocument } from '@plot/document'

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

  const doc = useEditor((s) => s.history.present)
  const camera = useEditor((s) => s.camera)
  const selection = useEditor((s) => s.selection)
  const hover = useEditor((s) => s.hover)
  const fitNonce = useEditor((s) => s.fitNonce)
  const setCamera = useEditor((s) => s.setCamera)
  const setHover = useEditor((s) => s.setHover)
  const select = useEditor((s) => s.select)

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
        const currentDoc = useEditor.getState().history.present
        const cam = fitToBounds(documentBounds(currentDoc), cssW, cssH)
        setCamera(cam)
      } else {
        // Re-render with current state after resize
        const state = useEditor.getState()
        renderer.render({
          doc: state.history.present,
          camera: state.camera,
          selection: state.selection,
          hover: state.hover,
        })
      }
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [setCamera])

  // Re-render when doc/camera/selection/hover change
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.render({ doc, camera, selection, hover })
  }, [doc, camera, selection, hover])

  // Handle fitNonce: recompute fit when it increments
  useEffect(() => {
    if (fitNonce === 0) return
    const { w, h } = sizeRef.current
    if (w === 0 || h === 0) return
    const cam = fitToBounds(documentBounds(doc), w, h)
    setCamera(cam)
  }, [fitNonce, doc, setCamera])

  // Pointer state stored in refs (not React state, to avoid re-renders in hot path)
  const panningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  const hitAtDownRef = useRef<import('@plot/render').Hit | null>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const currentCamera = useEditor.getState().camera
    setCamera(zoomAt(currentCamera, cursor, factor))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e)
    pointerDownPosRef.current = pos
    const currentCamera = useEditor.getState().camera
    const currentDoc = useEditor.getState().history.present
    const world = screenToWorld(currentCamera, pos)
    const TOL_PX = 8
    const hit = hitTest(currentDoc.sketch, world, TOL_PX / currentCamera.scale)
    hitAtDownRef.current = hit
    if (hit) {
      // Potential click-select; don't pan
      panningRef.current = false
      panStartRef.current = null
    } else {
      // Begin panning
      panningRef.current = true
      panStartRef.current = pos
      lastPointerRef.current = pos
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e)
    if (panningRef.current && lastPointerRef.current) {
      const dx = pos.x - lastPointerRef.current.x
      const dy = pos.y - lastPointerRef.current.y
      lastPointerRef.current = pos
      const currentCamera = useEditor.getState().camera
      setCamera(panBy(currentCamera, dx, dy))
    } else if (!panningRef.current) {
      // Update hover
      const currentCamera = useEditor.getState().camera
      const currentDoc = useEditor.getState().history.present
      const world = screenToWorld(currentCamera, pos)
      const TOL_PX = 8
      const hit = hitTest(currentDoc.sketch, world, TOL_PX / currentCamera.scale)
      setHover(hit)
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e)
    if (!panningRef.current) {
      // Check for click (no significant drag)
      const downPos = pointerDownPosRef.current
      if (downPos) {
        const dx = pos.x - downPos.x
        const dy = pos.y - downPos.y
        const dist = Math.hypot(dx, dy)
        if (dist < 4) {
          select(hitAtDownRef.current)
        }
      }
    }
    // End pan
    if (panningRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    panningRef.current = false
    panStartRef.current = null
    lastPointerRef.current = null
    hitAtDownRef.current = null
    pointerDownPosRef.current = null
  }

  const onPointerLeave = () => {
    if (!panningRef.current) {
      setHover(null)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={gridRef} style={layer} />
      <canvas ref={geomRef} style={layer} />
      <canvas
        ref={overlayRef}
        style={{ ...layer, touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
    </div>
  )
}
