import { create } from 'zustand'
import { createHistory, commit, undo, redo, canUndo, canRedo } from '@plot/document'
import type { History, PlotDocument } from '@plot/document'
import type { Camera, Hit } from '@plot/render'
import { seedDocument } from './seed'

interface EditorState {
  history: History<PlotDocument>
  camera: Camera
  selection: Set<string>
  hover: Hit | null
  fitNonce: number
  doc: () => PlotDocument
  setCamera: (c: Camera) => void
  setHover: (h: Hit | null) => void
  select: (h: Hit | null) => void
  commitDoc: (next: PlotDocument) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  fit: () => void
}

export const useEditor = create<EditorState>((set, get) => ({
  history: createHistory(seedDocument()),
  camera: { scale: 0.0001, tx: 100, ty: 400 },
  selection: new Set(),
  hover: null,
  fitNonce: 0,
  doc: () => get().history.present,
  setCamera: (camera) => set({ camera }),
  setHover: (hover) => set({ hover }),
  select: (h) => set({ selection: h ? new Set([h.id]) : new Set() }),
  commitDoc: (next) => set((s) => ({ history: commit(s.history, next) })),
  undo: () => set((s) => ({ history: undo(s.history) })),
  redo: () => set((s) => ({ history: redo(s.history) })),
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
  fit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}))
