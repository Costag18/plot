import { useEffect, useRef } from 'react'
import { useEditor } from './store'
import { calibrateImage, setImage as setImageDoc } from '@plot/document'
import { parseLength } from './ids'

// Length input shown after the two calibrate clicks. The user types the real
// length of the reference segment in the document unit; on Enter we rescale the
// image (calibrateImage) about the first reference point and commit (undoable).
// Absolutely positioned at the segment midpoint (NOT fixed) so it tracks the
// canvas region. Escape/blur cancels.
export function CalibrateInput() {
  const calibrating = useEditor((s) => s.calibrating)
  const units = useEditor((s) => s.doc().units)
  const setCalibrating = useEditor((s) => s.setCalibrating)
  const commit = useEditor((s) => s.commit)
  const inputRef = useRef<HTMLInputElement>(null)

  const active = calibrating !== null

  // Focus the input as soon as a calibration begins.
  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  if (!calibrating) return null

  function apply() {
    const c = useEditor.getState().calibrating
    if (!c) return
    const value = inputRef.current?.value ?? ''
    const doc = useEditor.getState().doc()
    const um = parseLength(value, doc.units)
    if (um !== null && doc.image) {
      const calibrated = calibrateImage(doc.image, c.a.x, c.a.y, c.b.x, c.b.y, um)
      commit(setImageDoc(doc, calibrated))
    }
    setCalibrating(null)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: calibrating.screen.x + 12,
        top: calibrating.screen.y + 12,
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
      <span style={{ opacity: 0.8 }}>length</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        placeholder={`length (${units})`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            apply()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setCalibrating(null)
          }
        }}
        onBlur={() => setCalibrating(null)}
        style={{ width: 90, fontSize: 12, padding: '2px 4px' }}
      />
    </div>
  )
}
