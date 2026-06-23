import type React from 'react'
import { useEditor } from './store'
import { blank, room, lShape } from './templates'

// Centered card shown over the canvas while the sketch has no geometry and no
// reference image. Picking a template loads it; it disappears the moment any
// geometry (or an image) exists. The wrapper is inert (pointer-events:none) so it
// never blocks canvas interaction; only the card itself accepts clicks.
const wrap: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const card: React.CSSProperties = {
  pointerEvents: 'auto',
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  padding: '20px 24px',
  textAlign: 'center',
  maxWidth: 360,
}

const btn: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 4,
  padding: '6px 14px',
  background: '#f8f8f8',
  cursor: 'pointer',
  fontSize: 14,
}

export function EmptyState() {
  const doc = useEditor((s) => s.doc())
  const loadDocument = useEditor((s) => s.loadDocument)

  const hasLines = Object.keys(doc.sketch.lines).length > 0
  const hasImage = !!doc.image
  if (hasLines || hasImage) return null

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Start a drawing</div>
        <div style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>Pick a template to get going.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button style={btn} onClick={() => loadDocument(blank())}>Blank</button>
          <button style={btn} onClick={() => loadDocument(room())}>Room</button>
          <button style={btn} onClick={() => loadDocument(lShape())}>L-shape</button>
        </div>
        <div style={{ color: '#888', fontSize: 12, marginTop: 16 }}>
          …or just start drawing — R rectangle, L line, P polygon
        </div>
      </div>
    </div>
  )
}
