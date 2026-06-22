import { describe, it, expect } from 'vitest'
import { formatLength } from '../src/format'

describe('formatLength', () => {
  it('formats micrometers per unit', () => {
    expect(formatLength(3_200_000, 'm')).toBe('3.20 m')
    expect(formatLength(3_200_000, 'cm')).toBe('320.0 cm')
    expect(formatLength(3_200_000, 'mm')).toBe('3200 mm')
  })

  it('formats feet to 2 decimals', () => {
    expect(formatLength(304_800, 'ft')).toBe('1.00 ft')
  })
})
