import { describe, it, expect } from 'vitest'
import { createIdGen } from '../src/ids'

describe('createIdGen', () => {
  it('produces sequential prefixed ids', () => {
    const gen = createIdGen()
    expect(gen('p')).toBe('p0')
    expect(gen('p')).toBe('p1')
    expect(gen('L')).toBe('L2')
  })

  it('can start from a given number', () => {
    const gen = createIdGen(10)
    expect(gen('c')).toBe('c10')
  })
})
