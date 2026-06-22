import { describe, it, expect } from 'vitest'
import { metersToUm, umToMeters, UM_PER_M } from '../src/units'

describe('units', () => {
  it('defines one million micrometers per meter', () => {
    expect(UM_PER_M).toBe(1_000_000)
  })

  it('converts meters to integer micrometers', () => {
    expect(metersToUm(3.2)).toBe(3_200_000)
  })

  it('rounds to the nearest micrometer', () => {
    expect(metersToUm(0.0000004)).toBe(0)
    expect(metersToUm(0.0000006)).toBe(1)
  })

  it('converts micrometers back to meters', () => {
    expect(umToMeters(2_000_000)).toBe(2)
  })
})
