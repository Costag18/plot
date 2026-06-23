import { useEffect, useRef } from 'react'
import { useEditor } from './store'
import { worldToScreen } from '@plot/render'
import { distance } from '@plot/core'
import { formatLength } from '@plot/document'
import { parseLength } from './ids'

export function DimensionChip() {
  const draft = useEditor((s) => s.draft)
  const camera = useEditor((s) => s.camera)
  const units = useEditor((s) => s.doc().units)
  const setTypedLength = useEditor((s) => s.setTypedLength)
  const commitLineDraft = useEditor((s) => s.commitLineDraft)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLine = draft?.kind === 'line'

  // Focus the input as soon as a line draft begins.
  useEffect(() => {
    if (isLine) inputRef.current?.focus()
  }, [isLine])

  if (!draft || draft.kind !== 'line') return null

  const screen = worldToScreen(camera, draft.b)
  const liveUm = distance(draft.a, draft.b)

  return (
    <div
      style={{
        position: 'absolute',
        left: screen.x + 12,
        top: screen.y + 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(20,20,20,0.92)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <span style={{ opacity: 0.8 }}>{formatLength(liveUm, units)}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        placeholder={`length (${units})`}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') {
            setTypedLength(null)
            return
          }
          setTypedLength(parseLength(v, units))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitLineDraft?.()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            useEditor.getState().setDraft(null)
            useEditor.getState().setTypedLength(null)
            useEditor.getState().setSnap(null)
          }
        }}
        style={{ width: 80, fontSize: 12, padding: '2px 4px' }}
      />
    </div>
  )
}
