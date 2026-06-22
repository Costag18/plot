import { describe, it, expect } from 'vitest'
import { calibrateImage, setImage, clearImage, setImageOpacity } from '../src/image'
import type { RefImage } from '../src/image'
import { createDocument } from '../src/document'

const img: RefImage = { dataUrl: 'data:,', x: 0, y: 0, umPerPx: 1000, opacity: 0.5, w: 100, h: 80 }

describe('calibrateImage', () => {
  it('rescales umPerPx so the traced feature equals the entered length', () => {
    // reference drawn from (0,0) to (10000,0): 10000 µm at current scale
    // user says that is 20000 µm -> factor 2 -> umPerPx 2000
    const next = calibrateImage(img, 0, 0, 10_000, 0, 20_000)
    expect(next.umPerPx).toBe(2000)
  })
  it('keeps the first reference point anchored on its image feature', () => {
    // anchor at A=(0,0): image origin stays at 0 when A is at origin
    const next = calibrateImage(img, 0, 0, 10_000, 0, 20_000)
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })
  it('anchors a non-origin first point correctly', () => {
    const next = calibrateImage({ ...img, x: 0, y: 0 }, 5000, 0, 15_000, 0, 20_000) // dWorld=10000, f=2
    // x_new = ax - (ax - x_old)*f = 5000 - (5000-0)*2 = -5000
    expect(next.x).toBe(-5000)
  })
  it('returns the image unchanged for a zero-length reference', () => {
    expect(calibrateImage(img, 3, 3, 3, 3, 1000)).toBe(img)
  })
})

describe('setImage/clearImage/setImageOpacity', () => {
  it('sets and clears the document image', () => {
    const withImg = setImage(createDocument('m'), img)
    expect(withImg.image).toEqual(img)
    expect(clearImage(withImg).image).toBeNull()
  })
  it('updates opacity immutably', () => {
    const withImg = setImage(createDocument('m'), img)
    const dim = setImageOpacity(withImg, 0.2)
    expect(dim.image!.opacity).toBe(0.2)
    expect(withImg.image!.opacity).toBe(0.5)
  })
  it('opacity on a doc with no image is a no-op', () => {
    const doc = createDocument('m')
    expect(setImageOpacity(doc, 0.2)).toBe(doc)
  })
})
