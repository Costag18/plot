import { z } from 'zod'
import { emptySketch } from '@plot/core'
import type { Sketch } from '@plot/core'

export const UNITS = ['mm', 'cm', 'm', 'ft'] as const
export type Unit = (typeof UNITS)[number]

export const CURRENT_VERSION = 1

const PointSchema = z.object({
  type: z.literal('point'),
  id: z.string(),
  x: z.number(),
  y: z.number(),
  fixed: z.boolean(),
})

const LineSchema = z.object({
  type: z.literal('line'),
  id: z.string(),
  a: z.string(),
  b: z.string(),
})

const ConstraintSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('coincident'), a: z.string(), b: z.string() }),
  z.object({ id: z.string(), kind: z.literal('horizontal'), line: z.string() }),
  z.object({ id: z.string(), kind: z.literal('vertical'), line: z.string() }),
  z.object({ id: z.string(), kind: z.literal('distance'), line: z.string(), value: z.number() }),
  z.object({ id: z.string(), kind: z.literal('parallel'), l1: z.string(), l2: z.string() }),
  z.object({ id: z.string(), kind: z.literal('perpendicular'), l1: z.string(), l2: z.string() }),
  z.object({ id: z.string(), kind: z.literal('equalLength'), l1: z.string(), l2: z.string() }),
  z.object({
    id: z.string(),
    kind: z.literal('angle'),
    l1: z.string(),
    l2: z.string(),
    vertex: z.string(),
    value: z.number(),
  }),
])

const SketchSchema = z.object({
  points: z.record(z.string(), PointSchema),
  lines: z.record(z.string(), LineSchema),
  constraints: z.array(ConstraintSchema),
})

const ImageSchema = z.object({
  dataUrl: z.string(),
  x: z.number(),
  y: z.number(),
  umPerPx: z.number(),
  opacity: z.number(),
  w: z.number(),
  h: z.number(),
})

export const DocumentSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  units: z.enum(UNITS),
  sketch: SketchSchema,
  image: ImageSchema.nullable().optional(),
})

export type PlotDocument = z.infer<typeof DocumentSchema>

export function createDocument(units: Unit = 'm'): PlotDocument {
  const sketch: Sketch = emptySketch()
  return { version: CURRENT_VERSION, units, sketch }
}

export function serializeDocument(doc: PlotDocument): string {
  return JSON.stringify(doc)
}

function migrate(raw: unknown): unknown {
  // v1 is the first persisted version. Future versions branch on (raw as {version}).version here.
  return raw
}

export function parseDocument(json: string): PlotDocument {
  return DocumentSchema.parse(migrate(JSON.parse(json)))
}
