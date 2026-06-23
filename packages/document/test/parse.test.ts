import { describe, it, expect } from 'vitest'
import { parseLengthInput } from '../src/parse'

describe('parseLengthInput', () => {
  // --- Explicit metric suffixes ---
  it('parses metres suffix', () => {
    expect(parseLengthInput('3.2m', 'mm')).toBe(3_200_000)
    expect(parseLengthInput('2m', 'mm')).toBe(2_000_000)
    expect(parseLengthInput('3.2 m', 'mm')).toBe(3_200_000)
    expect(parseLengthInput('3.2M', 'mm')).toBe(3_200_000)
  })

  it('parses centimetres suffix', () => {
    expect(parseLengthInput('300cm', 'mm')).toBe(3_000_000)
    expect(parseLengthInput('300 cm', 'mm')).toBe(3_000_000)
    expect(parseLengthInput('300CM', 'mm')).toBe(3_000_000)
  })

  it('parses millimetres suffix', () => {
    expect(parseLengthInput('1500mm', 'm')).toBe(1_500_000)
    expect(parseLengthInput('1500 mm', 'm')).toBe(1_500_000)
    expect(parseLengthInput('1500MM', 'm')).toBe(1_500_000)
  })

  // --- Feet / inches formats ---
  it('parses feet-inches with space (12\' 6")', () => {
    expect(parseLengthInput("12' 6\"", 'mm')).toBe(12 * 304_800 + 6 * 25_400)
  })

  it("parses feet-inches without space (12'6\")", () => {
    expect(parseLengthInput("12'6\"", 'mm')).toBe(12 * 304_800 + 6 * 25_400)
  })

  it("parses feet only (12')", () => {
    expect(parseLengthInput("12'", 'mm')).toBe(12 * 304_800)
  })

  it('parses inches only (18")', () => {
    expect(parseLengthInput('18"', 'mm')).toBe(18 * 25_400)
  })

  it('parses ft suffix (2ft)', () => {
    expect(parseLengthInput('2ft', 'mm')).toBe(2 * 304_800)
    expect(parseLengthInput('2 ft', 'mm')).toBe(2 * 304_800)
    expect(parseLengthInput('2FT', 'mm')).toBe(2 * 304_800)
  })

  it('parses in suffix (6in)', () => {
    expect(parseLengthInput('6in', 'mm')).toBe(6 * 25_400)
    expect(parseLengthInput('6 in', 'mm')).toBe(6 * 25_400)
    expect(parseLengthInput('6IN', 'mm')).toBe(6 * 25_400)
  })

  it('parses fractional feet and inches', () => {
    expect(parseLengthInput("1.5'", 'mm')).toBe(Math.round(1.5 * 304_800))
    expect(parseLengthInput('1.5"', 'mm')).toBe(Math.round(1.5 * 25_400))
  })

  // --- Bare number uses current unit ---
  it('bare number with unit mm', () => {
    expect(parseLengthInput('1500', 'mm')).toBe(1_500_000)
  })

  it('bare number with unit cm', () => {
    expect(parseLengthInput('300', 'cm')).toBe(3_000_000)
  })

  it('bare number with unit m', () => {
    expect(parseLengthInput('3.2', 'm')).toBe(3_200_000)
  })

  it('bare number with unit ft', () => {
    expect(parseLengthInput('2', 'ft')).toBe(2 * 304_800)
  })

  it('bare decimal with unit m → 32000 µm', () => {
    expect(parseLengthInput('3.2', 'cm')).toBe(32_000)
  })

  // --- Null / rejected cases ---
  it('returns null for empty string', () => {
    expect(parseLengthInput('', 'mm')).toBeNull()
  })

  it('returns null for whitespace-only', () => {
    expect(parseLengthInput('   ', 'mm')).toBeNull()
  })

  it('returns null for non-numeric text', () => {
    expect(parseLengthInput('abc', 'mm')).toBeNull()
  })

  it('returns null for negative value', () => {
    expect(parseLengthInput('-5', 'mm')).toBeNull()
  })

  it('returns null for zero', () => {
    expect(parseLengthInput('0', 'mm')).toBeNull()
  })

  it('returns null for zero with suffix', () => {
    expect(parseLengthInput('0m', 'mm')).toBeNull()
  })

  it('returns null for just a quote character', () => {
    expect(parseLengthInput("'", 'mm')).toBeNull()
  })

  it('returns null for just a double-quote character', () => {
    expect(parseLengthInput('"', 'mm')).toBeNull()
  })
})
