import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, panBy, zoomAt, fitToBounds } from '../src/camera'
import type { Camera } from '../src/camera'

const cam: Camera = { scale: 2, tx: 100, ty: 50 }

describe('camera', () => {
  it('maps world to screen with y flipped (world y-up)', () => {
    expect(worldToScreen(cam, { x: 10, y: 5 })).toEqual({ x: 120, y: 40 })
  })

  it('round-trips world -> screen -> world', () => {
    const w = { x: 12.5, y: -7.25 }
    const s = worldToScreen(cam, w)
    const back = screenToWorld(cam, s)
    expect(back.x).toBeCloseTo(w.x, 9)
    expect(back.y).toBeCloseTo(w.y, 9)
  })

  it('panBy shifts the translation in screen pixels', () => {
    expect(panBy(cam, 10, -5)).toEqual({ scale: 2, tx: 110, ty: 45 })
  })

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const screenPt = { x: 200, y: 80 }
    const before = screenToWorld(cam, screenPt)
    const zoomed = zoomAt(cam, screenPt, 1.5)
    expect(zoomed.scale).toBeCloseTo(3, 9)
    const after = screenToWorld(zoomed, screenPt)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('fitToBounds centers the bounds in the viewport', () => {
    const c = fitToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 600, 50)
    const center = screenToWorld(c, { x: 400, y: 300 })
    expect(center.x).toBeCloseTo(50, 6)
    expect(center.y).toBeCloseTo(50, 6)
  })
})
