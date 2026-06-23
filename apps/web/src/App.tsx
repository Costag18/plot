import { useRef } from 'react'
import type React from 'react'
import { useEditor } from './store'
import type { Tool } from './store'
import { CanvasView } from './CanvasView'
import { StatusBar } from './StatusBar'
import { Toast } from './Toast'
import { UNITS } from '@plot/document'
import type { RefImage } from '@plot/document'
import { toSVG } from '@plot/render'
import { downloadJSON, downloadText, downloadBlob, importJSONFile } from './persistence'
import { loadAndDownscale } from './image'

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
  // Subscribe to history.present so units display updates on undo/redo/open
  const docUnits = useEditor((s) => s.history.present.units)
  const setUnits = useEditor((s) => s.setUnits)
  const loadDocument = useEditor((s) => s.loadDocument)
  const setToast = useEditor((s) => s.setToast)
  const exportPNGSlot = useEditor((s) => s.exportPNG)
  const doc = useEditor((s) => s.doc)
  // Subscribe to history.present.image so the image controls (opacity/Calibrate/
  // Remove) appear and the slider reflects the current opacity reactively.
  const image = useEditor((s) => s.history.present.image)
  const setImage = useEditor((s) => s.setImage)
  const clearImage = useEditor((s) => s.clearImage)
  const setImageOpacity = useEditor((s) => s.setImageOpacity)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  async function handlePNG() {
    if (!exportPNGSlot) return
    const blob = await exportPNGSlot()
    if (blob) downloadBlob(blob, 'drawing.png')
  }

  function handleSVG() {
    downloadText(toSVG(doc()), 'image/svg+xml', 'drawing.svg')
  }

  function handleSave() {
    downloadJSON(doc())
  }

  function handleOpenClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be reopened
    e.target.value = ''
    try {
      const parsed = await importJSONFile(file)
      loadDocument(parsed)
    } catch {
      setToast('Could not open that file.')
    }
  }

  function handleImageClick() {
    imageInputRef.current?.click()
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-imported.
    e.target.value = ''
    try {
      const { dataUrl, w, h } = await loadAndDownscale(file)
      // Default placement: top-left at world origin, 1 mm/px, 50% opacity. The
      // user then calibrates to set the real-world scale.
      const img: RefImage = { dataUrl, x: 0, y: 0, umPerPx: 1000, opacity: 0.5, w, h }
      setImage(img)
    } catch {
      setToast('Could not load that image.')
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <span style={{ width: 1, alignSelf: 'stretch', background: '#ddd' }} />
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          Units:
          <select
            value={docUnits}
            onChange={(e) => setUnits(e.target.value as typeof docUnits)}
            style={{ fontSize: 13 }}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
        <span style={{ width: 1, alignSelf: 'stretch', background: '#ddd' }} />
        <button onClick={handleSave}>Save</button>
        <button onClick={handleOpenClick}>Open</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => { void handleFileChange(e) }}
        />
        <button onClick={() => { void handlePNG() }}>PNG</button>
        <button onClick={handleSVG}>SVG</button>
        <span style={{ width: 1, alignSelf: 'stretch', background: '#ddd' }} />
        <button onClick={handleImageClick}>Image</button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { void handleImageChange(e) }}
        />
        {image && (
          <>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              Opacity:
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={image.opacity}
                onChange={(e) => setImageOpacity(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() => setTool('calibrate')}
              aria-pressed={tool === 'calibrate'}
              style={{
                fontWeight: tool === 'calibrate' ? 700 : 400,
                border: tool === 'calibrate' ? '2px solid #1d4ed8' : '1px solid #ccc',
                borderRadius: 4,
                padding: '2px 8px',
              }}
            >
              Calibrate
            </button>
            <button onClick={clearImage}>Remove</button>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#666', fontSize: 13 }}>
          {selection.size > 0 ? `Selected: ${[...selection].join(', ')}` : 'Nothing selected'}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <CanvasView />
        <Toast />
      </div>
      <StatusBar />
    </div>
  )
}
