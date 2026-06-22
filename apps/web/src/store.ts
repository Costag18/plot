import { create } from 'zustand'
import { createHistory, commit, undo, redo, canUndo, canRedo, deleteEntity, setLineLength } from '@plot/document'
import type { History, PlotDocument } from '@plot/document'
import type { Unit } from '@plot/document'
import type { Camera, Hit, Draft, SnapHint } from '@plot/render'
import { buildSolveRequest, applySolveResult } from '@plot/core'
import { seedDocument } from './seed'
import { getSolver } from './solver'
import { idGen } from './ids'

export type Tool = 'select' | 'line' | 'rect'

export interface Editing {
  lineId: string
  screen: { x: number; y: number }
}

interface EditorState {
  history: History<PlotDocument>
  camera: Camera
  selection: Set<string>
  hover: Hit | null
  fitNonce: number
  tool: Tool
  draft: Draft | null
  preview: PlotDocument | null
  toast: string | null
  snap: SnapHint | null
  typedLength: number | null
  editing: Editing | null
  // CanvasView registers its line-commit routine here so the DimensionChip can
  // trigger the same commit path (inference + snap + merge + typed length) on Enter.
  commitLineDraft: (() => void) | null
  setCommitLineDraft: (fn: (() => void) | null) => void
  // CanvasView registers its PNG export routine here so App can trigger it.
  exportPNG: (() => Promise<Blob | null>) | null
  setExportPNG: (fn: (() => Promise<Blob | null>) | null) => void
  doc: () => PlotDocument
  setCamera: (c: Camera) => void
  setHover: (h: Hit | null) => void
  select: (h: Hit | null) => void
  setTool: (t: Tool) => void
  setDraft: (d: Draft | null) => void
  setPreview: (d: PlotDocument | null) => void
  clearPreview: () => void
  setToast: (msg: string | null) => void
  setSnap: (s: SnapHint | null) => void
  setTypedLength: (v: number | null) => void
  setEditing: (e: Editing | null) => void
  setUnits: (u: Unit) => void
  loadDocument: (doc: PlotDocument) => void
  commit: (next: PlotDocument) => void
  solveAndCommit: (next: PlotDocument) => Promise<void>
  solvePreview: (next: PlotDocument) => Promise<void>
  setLineLengthAndSolve: (lineId: string, valueUm: number) => Promise<void>
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

// Solve a document and report the solver's status (the slice-2 `solveSketch`
// helper swallowed it). On a non-ok solve `applySolveResult` returns the
// original sketch unchanged, so `doc` is always a coherent document.
async function solveDocStatus(
  next: PlotDocument,
): Promise<{ status: 'ok' | 'failed'; doc: PlotDocument }> {
  const res = await getSolver().solve(buildSolveRequest(next.sketch))
  return { status: res.status, doc: { ...next, sketch: applySolveResult(next.sketch, res) } }
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
  toast: null,
  snap: null,
  typedLength: null,
  editing: null,
  commitLineDraft: null,
  setCommitLineDraft: (commitLineDraft) => set({ commitLineDraft }),
  exportPNG: null,
  setExportPNG: (exportPNG) => set({ exportPNG }),
  // Preview (transient drag result) takes precedence over committed history.
  doc: () => get().preview ?? get().history.present,
  setCamera: (camera) => set({ camera }),
  setHover: (hover) => set({ hover }),
  select: (h) => set({ selection: h ? new Set([h.id]) : new Set() }),
  setTool: (tool) => set({ tool }),
  setDraft: (draft) => set({ draft }),
  setPreview: (preview) => set({ preview }),
  clearPreview: () => { ++solveSeq; set({ preview: null }) },
  setToast: (toast) => set({ toast }),
  setSnap: (snap) => set({ snap }),
  setTypedLength: (typedLength) => set({ typedLength }),
  setEditing: (editing) => set({ editing }),
  setUnits: (u) =>
    set((s) => ({ history: commit(s.history, { ...s.history.present, units: u }), preview: null })),
  loadDocument: (doc) => {
    ++solveSeq
    set({ history: createHistory(doc), preview: null, selection: new Set(), draft: null, snap: null, typedLength: null, editing: null, hover: null })
  },
  commit: (next) => { ++solveSeq; set((s) => ({ history: commit(s.history, next), preview: null })) },
  solveAndCommit: async (next) => {
    const token = ++solveSeq
    const { doc } = await solveDocStatus(next)
    // Drop stale solves so a newer commit wins.
    if (token !== solveSeq) return
    set((s) => ({ history: commit(s.history, doc), preview: null }))
  },
  solvePreview: async (next) => {
    const token = ++solveSeq
    const { doc } = await solveDocStatus(next)
    // Drop stale solves so a slower earlier solve can't overwrite a newer one.
    if (token !== solveSeq) return
    set({ preview: doc })
  },
  setLineLengthAndSolve: async (lineId, valueUm) => {
    const token = ++solveSeq
    const present = get().history.present
    const next = setLineLength(present, idGen, lineId, valueUm)
    const { status, doc } = await solveDocStatus(next)
    // A newer operation started while we were solving: drop this stale result.
    if (token !== solveSeq) return
    if (status !== 'ok') {
      // Over-constrained / conflicting: leave history.present as-is, drop preview.
      set({ preview: null, toast: 'That dimension conflicts — reverted.' })
      return
    }
    set((s) => ({ history: commit(s.history, doc), preview: null }))
  },
  deleteSelection: () => {
    ++solveSeq
    const s = get()
    const ids = [...s.selection]
    if (ids.length === 0) return
    let next = s.history.present
    for (const id of ids) next = deleteEntity(next, id)
    set({ history: commit(s.history, next), preview: null, selection: new Set() })
  },
  undo: () => { ++solveSeq; set((s) => ({ history: undo(s.history), preview: null })) },
  redo: () => { ++solveSeq; set((s) => ({ history: redo(s.history), preview: null })) },
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
  fit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}))
