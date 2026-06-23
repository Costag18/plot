import { describe, it, expect } from 'vitest'
import { sub, length, distance, add, snapToGrid } from '../src/vec2'

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

  it('adds two vectors', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 })
  })
})

describe('snapToGrid', () => {
  it('snaps to the nearest multiple of step', () => {
    expect(snapToGrid({ x: 13, y: 17 }, 10)).toEqual({ x: 10, y: 20 })
  })

  it('returns the input unchanged when step <= 0', () => {
    const v = { x: 13, y: 17 }
    expect(snapToGrid(v, 0)).toBe(v)
    expect(snapToGrid(v, -5)).toBe(v)
  })

  it('snaps negative coordinates to the nearest multiple', () => {
    expect(snapToGrid({ x: -13, y: -7 }, 10)).toEqual({ x: -10, y: -10 })
  })

  it('returns an exact multiple unchanged', () => {
    expect(snapToGrid({ x: 20, y: 30 }, 10)).toEqual({ x: 20, y: 30 })
  })
})
