import { useEditor } from './store'
import { CanvasView } from './CanvasView'

export function App() {
  const selection = useEditor((s) => s.selection)
  const undoFn = useEditor((s) => s.undo)
  const redoFn = useEditor((s) => s.redo)
  const canU = useEditor((s) => s.canUndo())
  const canR = useEditor((s) => s.canRedo())
  const fitFn = useEditor((s) => s.fit)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd', alignItems: 'center' }}>
        <strong>Plot</strong>
        <button onClick={undoFn} disabled={!canU}>Undo</button>
        <button onClick={redoFn} disabled={!canR}>Redo</button>
        <button onClick={fitFn}>Fit</button>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>
          {selection.size > 0 ? `Selected: ${[...selection].join(', ')}` : 'Nothing selected'}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        <CanvasView />
      </div>
    </div>
  )
}
