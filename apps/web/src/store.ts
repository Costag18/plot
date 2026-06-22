import { create } from 'zustand'
import { createHistory, commit, undo, redo, canUndo, canRedo, deleteEntity } from '@plot/document'
import type { History, PlotDocument } from '@plot/document'
import type { Camera, Hit, Draft } from '@plot/render'
import { solveSketch } from '@plot/core'
import { seedDocument } from './seed'
import { getSolver } from './solver'

export type Tool = 'select' | 'line' | 'rect'

interface EditorState {
  history: History<PlotDocument>
  camera: Camera
  selection: Set<string>
  hover: Hit | null
  fitNonce: number
  tool: Tool
  draft: Draft | null
  preview: PlotDocument | null
  doc: () => PlotDocument
  setCamera: (c: Camera) => void
  setHover: (h: Hit | null) => void
  select: (h: Hit | null) => void
  setTool: (t: Tool) => void
  setDraft: (d: Draft | null) => void
  setPreview: (d: PlotDocument | null) => void
  clearPreview: () => void
  commit: (next: PlotDocument) => void
  solveAndCommit: (next: PlotDocument) => Promise<void>
  solvePreview: (next: PlotDocument) => Promise<void>
  deleteSelection: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  fit: () => void
}

// Latest-wins token for async preview solves: each solvePreview captures the
// current value, and only applies its result if no newer solve has started.
let solveSeq = 0

async function solveDoc(next: PlotDocument): Promise<PlotDocument> {
  const sketch = await solveSketch(next.sketch, getSolver())
  return { ...next, sketch }
}

export const useEditor = create<EditorState>((set, get) => ({
  history: createHistory(seedDocument()),
  camera: { scale: 0.0001, tx: 100, ty: 400 },
  selection: new Set(),
  hover: null,
  fitNonce: 0,
  tool: 'select',
  draft: null,
  preview: null,
  // Preview (transient drag result) takes precedence over committed history.
  doc: () => get().preview ?? get().history.present,
  setCamera: (camera) => set({ camera }),
  setHover: (hover) => set({ hover }),
  select: (h) => set({ selection: h ? new Set([h.id]) : new Set() }),
  setTool: (tool) => set({ tool }),
  setDraft: (draft) => set({ draft }),
  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),
  commit: (next) => set((s) => ({ history: commit(s.history, next), preview: null })),
  solveAndCommit: async (next) => {
    const solved = await solveDoc(next)
    set((s) => ({ history: commit(s.history, solved), preview: null }))
  },
  solvePreview: async (next) => {
    const token = ++solveSeq
    const solved = await solveDoc(next)
    // Drop stale solves so a slower earlier solve can't overwrite a newer one.
    if (token !== solveSeq) return
    set({ preview: solved })
  },
  deleteSelection: () => {
    const s = get()
    const ids = [...s.selection]
    if (ids.length === 0) return
    let next = s.history.present
    for (const id of ids) next = deleteEntity(next, id)
    set({ history: commit(s.history, next), preview: null, selection: new Set() })
  },
  undo: () => set((s) => ({ history: undo(s.history), preview: null })),
  redo: () => set((s) => ({ history: redo(s.history), preview: null })),
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
  fit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}))
