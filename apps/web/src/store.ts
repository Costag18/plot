import { create } from 'zustand'
import {
  createHistory,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  deleteEntity,
  setLineLength,
  setImage as setImageDoc,
  clearImage as clearImageDoc,
  setImageOpacity as setImageOpacityDoc,
  allSelectableIds,
  translateEntities,
  duplicateEntities,
  setCornerAngle,
  cornerAngleOf,
} from '@plot/document'
import type { History, PlotDocument, RefImage } from '@plot/document'
import type { Unit } from '@plot/document'
import type { Camera, Hit, Draft, SnapHint } from '@plot/render'
import { buildSolveRequest, applySolveResult, applySolvedPoints, distance } from '@plot/core'
import type { Vec2 } from '@plot/core'
import { seedDocument } from './seed'
import { getSolver } from './solver'
import { idGen } from './ids'

export type Tool = 'select' | 'line' | 'rect' | 'polygon' | 'calibrate'

export interface Editing {
  lineId: string
  screen: { x: number; y: number }
}

export interface EditingAngle {
  vertex: string
  l1: string
  l2: string
  screen: { x: number; y: number }
}

// Pending calibration: the two world-space reference points (a, b) drawn over an
// image feature, plus the canvas-pixel midpoint where CalibrateInput renders its
// length field. Set after the second calibrate click; cleared on commit/cancel.
export interface Calibrating {
  a: Vec2
  b: Vec2
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
  // Marquee selection box in world coords (drag-to-select). Null when not active.
  marquee: { a: Vec2; b: Vec2 } | null
  // Grid snapping. When `gridSnap` is on, draw clicks and drags snap world points
  // to the nearest `gridStep` (micrometers) lattice. Off by default.
  gridSnap: boolean
  gridStep: number
  // Last pointer position in world coords (for the status bar). Null until first move.
  cursor: Vec2 | null
  // Copied entity ids, captured on copy; pasted by re-duplicating from the present.
  clipboard: string[] | null
  typedLength: number | null
  editing: Editing | null
  editingAngle: EditingAngle | null
  // Pending calibration (two reference points + length-input anchor). Null when
  // no calibration is in progress.
  calibrating: Calibrating | null
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
  setSelection: (ids: string[]) => void
  toggleSelect: (id: string) => void
  setMarquee: (m: { a: Vec2; b: Vec2 } | null) => void
  toggleGridSnap: () => void
  setGridStep: (n: number) => void
  setCursor: (c: Vec2 | null) => void
  selectAll: () => void
  duplicateSelection: (dx?: number, dy?: number) => void
  copySelection: () => void
  paste: (dx: number, dy: number) => void
  nudge: (dx: number, dy: number) => Promise<void>
  setTool: (t: Tool) => void
  setDraft: (d: Draft | null) => void
  setPreview: (d: PlotDocument | null) => void
  clearPreview: () => void
  setToast: (msg: string | null) => void
  setSnap: (s: SnapHint | null) => void
  setTypedLength: (v: number | null) => void
  setEditing: (e: Editing | null) => void
  setEditingAngle: (e: EditingAngle | null) => void
  setCalibrating: (c: Calibrating | null) => void
  setImage: (img: RefImage) => void
  clearImage: () => void
  setImageOpacity: (o: number) => void
  setUnits: (u: Unit) => void
  loadDocument: (doc: PlotDocument) => void
  commit: (next: PlotDocument) => void
  solveAndCommit: (next: PlotDocument) => Promise<void>
  solvePreview: (next: PlotDocument) => Promise<void>
  setLineLengthAndSolve: (lineId: string, valueUm: number) => Promise<void>
  setCornerAngleAndSolve: (vertex: string, l1: string, l2: string, valueRad: number) => Promise<void>
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
  marquee: null,
  gridSnap: false,
  gridStep: 100_000,
  cursor: null,
  clipboard: null,
  typedLength: null,
  editing: null,
  editingAngle: null,
  calibrating: null,
  commitLineDraft: null,
  setCommitLineDraft: (commitLineDraft) => set({ commitLineDraft }),
  exportPNG: null,
  setExportPNG: (exportPNG) => set({ exportPNG }),
  // Preview (transient drag result) takes precedence over committed history.
  doc: () => get().preview ?? get().history.present,
  setCamera: (camera) => set({ camera }),
  setHover: (hover) => set({ hover }),
  select: (h) => set({ selection: h ? new Set([h.id]) : new Set() }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selection)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selection: next }
    }),
  setMarquee: (marquee) => set({ marquee }),
  toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  setGridStep: (gridStep) => set({ gridStep }),
  setCursor: (cursor) => set({ cursor }),
  selectAll: () => set((s) => ({ selection: new Set(allSelectableIds(s.history.present.sketch)) })),
  duplicateSelection: (dx = 200000, dy = 200000) => {
    ++solveSeq
    const s = get()
    const ids = [...s.selection]
    if (ids.length === 0) return
    const { doc, newIds } = duplicateEntities(s.history.present, idGen, ids, dx, dy)
    set({ history: commit(s.history, doc), preview: null, selection: new Set(newIds) })
  },
  copySelection: () => set((s) => ({ clipboard: [...s.selection] })),
  paste: (dx, dy) => {
    const s = get()
    const ids = s.clipboard
    if (!ids || ids.length === 0) return
    ++solveSeq
    const { doc, newIds } = duplicateEntities(s.history.present, idGen, ids, dx, dy)
    set({ history: commit(s.history, doc), preview: null, selection: new Set(newIds) })
  },
  nudge: async (dx, dy) => {
    const s = get()
    if (s.selection.size === 0) return
    ++solveSeq
    const next = translateEntities(s.history.present, [...s.selection], dx, dy)
    await get().solveAndCommit(next)
  },
  setTool: (tool) => set({ tool, draft: null, snap: null, calibrating: null, typedLength: null, marquee: null, editingAngle: null }),
  setDraft: (draft) => set({ draft }),
  setPreview: (preview) => set({ preview }),
  clearPreview: () => { ++solveSeq; set({ preview: null }) },
  setToast: (toast) => set({ toast }),
  setSnap: (snap) => set({ snap }),
  setTypedLength: (typedLength) => set({ typedLength }),
  setEditing: (editing) => set({ editing }),
  setEditingAngle: (editingAngle) => set({ editingAngle }),
  setCalibrating: (calibrating) => set({ calibrating }),
  // Image actions build on the committed present and commit (undoable). The
  // image (a data URL) lives in the document, so these autosave/export with it.
  setImage: (img) =>
    set((s) => ({ history: commit(s.history, setImageDoc(s.history.present, img)), preview: null })),
  clearImage: () =>
    set((s) => ({ history: commit(s.history, clearImageDoc(s.history.present)), preview: null })),
  setImageOpacity: (o) =>
    set((s) => ({ history: commit(s.history, setImageOpacityDoc(s.history.present, o)), preview: null })),
  setUnits: (u) =>
    set((s) => ({ history: commit(s.history, { ...s.history.present, units: u }), preview: null })),
  loadDocument: (doc) => {
    ++solveSeq
    set({ history: createHistory(doc), preview: null, selection: new Set(), draft: null, snap: null, marquee: null, typedLength: null, editing: null, editingAngle: null, calibrating: null, hover: null })
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
    const res = await getSolver().solve(buildSolveRequest(next.sketch))
    // A newer operation started while we were solving: drop this stale result.
    if (token !== solveSeq) return
    // Apply best-effort solved points regardless of solver status, then measure
    // the achieved length to decide whether the constraint was actually satisfiable.
    const solvedSketch = applySolvedPoints(next.sketch, res.points)
    const line = solvedSketch.lines[lineId]
    const pa = line ? solvedSketch.points[line.a] : undefined
    const pb = line ? solvedSketch.points[line.b] : undefined
    const achieved = pa && pb ? distance(pa, pb) : NaN
    // Tolerance: 0.2% of requested length, minimum 2 mm (2000 µm).
    const tol = Math.max(2000, valueUm * 0.002)
    if (Number.isFinite(achieved) && Math.abs(achieved - valueUm) <= tol) {
      set((s) => ({ history: commit(s.history, { ...next, sketch: solvedSketch }), preview: null }))
    } else {
      // Geometry did not reach the requested length — truly over-constrained or diverged.
      set({ preview: null, toast: 'That dimension conflicts — reverted.' })
    }
  },
  setCornerAngleAndSolve: async (vertex, l1, l2, valueRad) => {
    const token = ++solveSeq
    const present = get().history.present
    const next = setCornerAngle(present, idGen, vertex, l1, l2, valueRad)
    const res = await getSolver().solve(buildSolveRequest(next.sketch))
    if (token !== solveSeq) return
    const solvedSketch = applySolvedPoints(next.sketch, res.points)
    const achieved = cornerAngleOf(solvedSketch, vertex, l1, l2)
    const tol = (0.5 * Math.PI) / 180 // 0.5 degrees
    if (achieved !== null && Math.abs(Math.abs(achieved) - Math.abs(valueRad)) <= tol) {
      set((s) => ({ history: commit(s.history, { ...next, sketch: solvedSketch }), preview: null }))
    } else {
      set({ preview: null, toast: 'That angle conflicts — reverted.' })
    }
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
