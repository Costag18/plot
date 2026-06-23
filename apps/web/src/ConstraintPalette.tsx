import { useRef, useState, useEffect } from 'react'
import { useEditor } from './store'
import { parseLength } from './ids'

const BTN_STYLE: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  background: '#fff',
}

export function ConstraintPalette() {
  const selection = useEditor((s) => s.selection)
  const present = useEditor((s) => s.history.present)
  const applyParallel = useEditor((s) => s.applyParallel)
  const applyPerpendicular = useEditor((s) => s.applyPerpendicular)
  const applyEqual = useEditor((s) => s.applyEqual)
  const applyCoincident = useEditor((s) => s.applyCoincident)
  const applyAxis = useEditor((s) => s.applyAxis)
  const applyPointLineDistance = useEditor((s) => s.applyPointLineDistance)

  const [showDistInput, setShowDistInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Classify selection
  const selectedIds = [...selection]
  const sketch = present.sketch
  const lineIds = selectedIds.filter((id) => !!sketch.lines[id])
  const pointIds = selectedIds.filter((id) => !!sketch.points[id])

  const twoLines = lineIds.length === 2 && pointIds.length === 0
  const oneLine = lineIds.length === 1 && pointIds.length === 0
  const twoPoints = pointIds.length === 2 && lineIds.length === 0
  const onePointOneLine = pointIds.length === 1 && lineIds.length === 1

  const hasAny = twoLines || oneLine || twoPoints || onePointOneLine

  // Reset distance input when selection changes
  useEffect(() => {
    setShowDistInput(false)
  }, [selection])

  useEffect(() => {
    if (showDistInput) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [showDistInput])

  if (!hasAny) return null

  const commitDistance = (raw: string) => {
    const um = parseLength(raw, present.units)
    setShowDistInput(false)
    if (um !== null && um > 0) void applyPointLineDistance(um)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #ccc',
        borderRadius: 6,
        padding: '4px 8px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      {twoLines && (
        <>
          <button style={BTN_STYLE} onClick={() => { void applyParallel() }}>Parallel</button>
          <button style={BTN_STYLE} onClick={() => { void applyPerpendicular() }}>Perpendicular</button>
          <button style={BTN_STYLE} onClick={() => { void applyEqual() }}>Equal</button>
        </>
      )}
      {oneLine && (
        <>
          <button style={BTN_STYLE} onClick={() => { void applyAxis('horizontal') }}>Horizontal</button>
          <button style={BTN_STYLE} onClick={() => { void applyAxis('vertical') }}>Vertical</button>
        </>
      )}
      {twoPoints && (
        <button style={BTN_STYLE} onClick={() => { void applyCoincident() }}>Coincident</button>
      )}
      {onePointOneLine && (
        showDistInput ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            placeholder={`dist (${present.units})`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDistance((e.target as HTMLInputElement).value)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setShowDistInput(false)
              }
            }}
            onBlur={() => setShowDistInput(false)}
            style={{
              width: 100,
              fontSize: 12,
              padding: '2px 4px',
              border: '1px solid #1d4ed8',
              borderRadius: 4,
              outline: 'none',
            }}
          />
        ) : (
          <button style={BTN_STYLE} onClick={() => setShowDistInput(true)}>Distance</button>
        )
      )}
    </div>
  )
}
