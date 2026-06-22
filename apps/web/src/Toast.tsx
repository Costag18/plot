import { useEffect } from 'react'
import { useEditor } from './store'

const AUTO_CLEAR_MS = 3500

export function Toast() {
  const toast = useEditor((s) => s.toast)
  const setToast = useEditor((s) => s.setToast)

  useEffect(() => {
    if (toast === null) return
    const t = setTimeout(() => setToast(null), AUTO_CLEAR_MS)
    return () => clearTimeout(t)
  }, [toast, setToast])

  if (toast === null) return null

  return (
    <div
      role="status"
      onClick={() => setToast(null)}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        background: 'rgba(20,20,20,0.92)',
        color: '#fff',
        padding: '8px 14px',
        borderRadius: 6,
        fontSize: 13,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        zIndex: 10,
        maxWidth: '80%',
      }}
    >
      {toast}
    </div>
  )
}
