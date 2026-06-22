export interface PointEntity {
  type: 'point'
  id: string
  x: number
  y: number
  fixed: boolean
}

export interface LineEntity {
  type: 'line'
  id: string
  a: string
  b: string
}

export type Constraint =
  | { id: string; kind: 'coincident'; a: string; b: string }
  | { id: string; kind: 'horizontal'; line: string }
  | { id: string; kind: 'vertical'; line: string }
  | { id: string; kind: 'distance'; line: string; value: number }
  | { id: string; kind: 'parallel'; l1: string; l2: string }
  | { id: string; kind: 'perpendicular'; l1: string; l2: string }
  | { id: string; kind: 'equalLength'; l1: string; l2: string }

export interface Sketch {
  points: Record<string, PointEntity>
  lines: Record<string, LineEntity>
  constraints: Constraint[]
}

export const emptySketch = (): Sketch => ({ points: {}, lines: {}, constraints: [] })
