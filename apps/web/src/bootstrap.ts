import { useEditor } from './store'
import { loadCurrent, saveCurrent } from './persistence'

// Load the persisted document once at startup.
loadCurrent().then((doc) => {
  if (doc) useEditor.getState().loadDocument(doc)
})

// Debounced autosave: save history.present (not the transient preview) on changes.
let timer: ReturnType<typeof setTimeout> | null = null
let lastSaved: unknown = null

const unsubscribe = useEditor.subscribe((s) => {
  const doc = s.history.present
  if (doc === lastSaved) return
  lastSaved = doc
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void saveCurrent(doc)
  }, 500)
})

// Avoid a duplicate subscription if this module is hot-reloaded in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  })
}
