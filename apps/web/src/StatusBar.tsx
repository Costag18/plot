import type React from 'react'
import { useEditor } from './store'
import { formatLength } from '@plot/document'

// Bottom status bar (normal document flow, NOT position:fixed): live cursor
// coordinates in the document unit, a zoom indicator, and the selection count.
// Zoom is expressed as a percentage where 100% == 1 screen pixel per millimetre
// (camera.scale is screen-px per world-µm, so px/mm = scale * 1000).
export function StatusBar() {
  const cursor = useEditor((s) => s.cursor)
  const camera = useEditor((s) => s.camera)
  const selectionSize = useEditor((s) => s.selection.size)
  const units = useEditor((s) => s.history.present.units)

  const zoomPct = Math.round(camera.scale * 1000 * 100)
  const coords = cursor
    ? `${formatLength(cursor.x, units)}, ${formatLength(cursor.y, units)}`
    : '—'

  const cell: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4 }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '4px 10px',
        borderTop: '1px solid #ddd',
        background: '#fafafa',
        color: '#444',
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={cell} title="Cursor position">
        <span style={{ color: '#888' }}>x, y:</span>
        <span>{coords}</span>
      </span>
      <span style={cell} title="Zoom">
        <span style={{ color: '#888' }}>Zoom:</span>
        <span>{zoomPct}%</span>
      </span>
      <span style={{ ...cell, marginLeft: 'auto' }} title="Selection count">
        <span style={{ color: '#888' }}>Selected:</span>
        <span>{selectionSize}</span>
      </span>
    </div>
  )
}
