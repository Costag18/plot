import { describe, it, expect } from 'vitest'
import { sub, length, distance, add } from '../src/vec2'

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
