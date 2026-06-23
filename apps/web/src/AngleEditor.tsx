import { useEffect, useRef } from 'react'
import { useEditor } from './store'
import { cornerAngleOf } from '@plot/document'

export function AngleEditor() {
  const editingAngle = useEditor((s) => s.editingAngle)
  const setEditingAngle = useEditor((s) => s.setEditingAngle)
  const setCornerAngleAndSolve = useEditor((s) => s.setCornerAngleAndSolve)
  const present = useEditor((s) => s.history.present)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingAngle) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingAngle])

  if (!editingAngle) return null

  const { vertex, l1, l2 } = editingAngle
  const cur = cornerAngleOf(present.sketch, vertex, l1, l2)
  const defaultDisplay = cur !== null ? String(Math.round(Math.abs(cur) * 180 / Math.PI)) : ''

  const commitAngle = (raw: string) => {
    const deg = parseFloat(raw)
    setEditingAngle(null)
    if (Number.isFinite(deg) && deg > 0 && deg < 180) {
      // Read cur fresh at apply time to preserve the current turn direction.
      const fresh = useEditor.getState()
      const curFresh = cornerAngleOf(fresh.doc().sketch, vertex, l1, l2)
      const sign = (curFresh ?? 0) >= 0 ? 1 : -1
      const valueRad = sign * deg * Math.PI / 180
      void setCornerAngleAndSolve(vertex, l1, l2, valueRad)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: editingAngle.screen.x,
        top: editingAngle.screen.y,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        zIndex: 10,
      }}
    >
      <span style={{ fontSize: 10, color: '#555', userSelect: 'none' }}>angle</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          defaultValue={defaultDisplay}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitAngle((e.target as HTMLInputElement).value)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditingAngle(null)
            }
          }}
          onBlur={() => setEditingAngle(null)}
          style={{
            width: 60,
            fontSize: 12,
            padding: '2px 4px',
          }}
        />
        <span style={{ fontSize: 12, color: '#555', userSelect: 'none' }}>°</span>
      </div>
    </div>
  )
}
