import Dexie, { type Table } from 'dexie'
import { serializeDocument, parseDocument } from '@plot/document'
import type { PlotDocument } from '@plot/document'

interface DocRow {
  id: string
  json: string
  updated: number
}

class PlotDB extends Dexie {
  docs!: Table<DocRow, string>
  constructor() {
    super('plot')
    this.version(1).stores({ docs: 'id' })
  }
}

const db = new PlotDB()
const CURRENT = 'current'

export async function saveCurrent(doc: PlotDocument): Promise<void> {
  await db.docs.put({ id: CURRENT, json: serializeDocument(doc), updated: Date.now() })
}

export async function loadCurrent(): Promise<PlotDocument | null> {
  const row = await db.docs.get(CURRENT)
  if (!row) return null
  try {
    return parseDocument(row.json)
  } catch {
    return null
  }
}

export function downloadJSON(doc: PlotDocument, filename = 'drawing.json'): void {
  download(new Blob([serializeDocument(doc)], { type: 'application/json' }), filename)
}

export function downloadText(text: string, type: string, filename: string): void {
  download(new Blob([text], { type }), filename)
}

export function downloadBlob(blob: Blob, filename: string): void {
  download(blob, filename)
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function importJSONFile(file: File): Promise<PlotDocument> {
  const text = await file.text()
  return parseDocument(text)
}
