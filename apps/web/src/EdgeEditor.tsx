import { useEffect, useRef } from 'react'
import { useEditor } from './store'
import { distance } from '@plot/core'
import { parseLength, umToDisplay } from './ids'

export function EdgeEditor() {
  const editing = useEditor((s) => s.editing)
  const setEditing = useEditor((s) => s.setEditing)
  const setLineLengthAndSolve = useEditor((s) => s.setLineLengthAndSolve)
  const present = useEditor((s) => s.history.present)
  const units = present.units
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  if (!editing) return null

  const line = present.sketch.lines[editing.lineId]
  if (!line) return null
  const a = present.sketch.points[line.a]
  const b = present.sketch.points[line.b]
  if (!a || !b) return null

  const currentUm = distance(a, b)
  const defaultDisplay = umToDisplay(currentUm, units)

  const commit = (raw: string) => {
    const um = parseLength(raw, units)
    setEditing(null)
    if (um !== null) void setLineLengthAndSolve(editing.lineId, um)
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min={0}
      step="any"
      defaultValue={defaultDisplay}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit((e.target as HTMLInputElement).value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(null)
        }
      }}
      onBlur={() => setEditing(null)}
      style={{
        position: 'absolute',
        left: editing.screen.x,
        top: editing.screen.y,
        width: 90,
        fontSize: 12,
        padding: '2px 4px',
        zIndex: 10,
        transform: 'translate(-50%, -50%)',
      }}
    />
  )
}
