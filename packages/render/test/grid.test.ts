import { describe, it, expect } from 'vitest'
import { niceStep } from '../src/grid'

describe('niceStep', () => {
  it('snaps to 1/2/5 x powers of ten', () => {
    expect(niceStep(1)).toBe(1)
    expect(niceStep(1.3)).toBe(2)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(7)).toBe(10)
    expect(niceStep(170)).toBe(200)
    expect(niceStep(0.012)).toBe(0.02)
  })

  it('always returns a positive step', () => {
    expect(niceStep(0.0001)).toBeGreaterThan(0)
  })
})
