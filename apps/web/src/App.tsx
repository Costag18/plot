import { useEditor } from './store'
import type { Tool } from './store'
import { CanvasView } from './CanvasView'
import { Toast } from './Toast'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'line', label: 'Line' },
  { id: 'rect', label: 'Rect' },
]

export function App() {
  const selection = useEditor((s) => s.selection)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const undoFn = useEditor((s) => s.undo)
  const redoFn = useEditor((s) => s.redo)
  const canU = useEditor((s) => s.canUndo())
  const canR = useEditor((s) => s.canRedo())
  const fitFn = useEditor((s) => s.fit)
  const deleteFn = useEditor((s) => s.deleteSelection)

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd', alignItems: 'center' }}>
        <strong>Plot</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              aria-pressed={tool === t.id}
              style={{
                fontWeight: tool === t.id ? 700 : 400,
                border: tool === t.id ? '2px solid #1d4ed8' : '1px solid #ccc',
                borderRadius: 4,
                padding: '2px 8px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span style={{ width: 1, alignSelf: 'stretch', background: '#ddd' }} />
        <button onClick={undoFn} disabled={!canU}>Undo</button>
        <button onClick={redoFn} disabled={!canR}>Redo</button>
        <button onClick={fitFn}>Fit</button>
        <button onClick={deleteFn} disabled={selection.size === 0}>Delete</button>
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>
          {selection.size > 0 ? `Selected: ${[...selection].join(', ')}` : 'Nothing selected'}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <CanvasView />
        <Toast />
      </div>
    </div>
  )
}
