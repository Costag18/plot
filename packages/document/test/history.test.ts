import { describe, it, expect } from 'vitest'
import { createHistory, commit, undo, redo, canUndo, canRedo } from '../src/history'

describe('history', () => {
  it('starts with present and no past/future', () => {
    const h = createHistory(1)
    expect(h.present).toBe(1)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('commits a new present and remembers the past', () => {
    const h = commit(createHistory(1), 2)
    expect(h.present).toBe(2)
    expect(canUndo(h)).toBe(true)
  })

  it('ignores a commit equal to the current present (no-op)', () => {
    const h0 = createHistory(1)
    const h1 = commit(h0, 1)
    expect(h1).toBe(h0)
  })

  it('undo restores the previous present and enables redo', () => {
    const h = undo(commit(createHistory(1), 2))
    expect(h.present).toBe(1)
    expect(canRedo(h)).toBe(true)
  })

  it('redo re-applies an undone change', () => {
    const h = redo(undo(commit(createHistory(1), 2)))
    expect(h.present).toBe(2)
  })

  it('commit after undo clears the redo future', () => {
    const h = commit(undo(commit(createHistory(1), 2)), 3)
    expect(h.present).toBe(3)
    expect(canRedo(h)).toBe(false)
  })

  it('undo at the beginning is a no-op', () => {
    const h0 = createHistory(1)
    expect(undo(h0)).toBe(h0)
  })
})
