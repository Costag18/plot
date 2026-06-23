export interface SolvePoint {
  id: string
  x: number
  y: number
  fixed: boolean
}

export type SolveConstraint =
  | { kind: 'coincident'; a: string; b: string }
  | { kind: 'horizontal'; p1: string; p2: string }
  | { kind: 'vertical'; p1: string; p2: string }
  | { kind: 'distance'; p1: string; p2: string; value: number }
  | { kind: 'parallel'; l1: [string, string]; l2: [string, string] }
  | { kind: 'perpendicular'; l1: [string, string]; l2: [string, string] }
  | { kind: 'equalLength'; l1: [string, string]; l2: [string, string] }
  | { kind: 'angle'; l1: [string, string]; l2: [string, string]; value: number }

export interface SolveRequest {
  points: SolvePoint[]
  constraints: SolveConstraint[]
}

export interface SolveResult {
  status: 'ok' | 'failed'
  points: Array<{ id: string; x: number; y: number }>
}

export interface ISolver {
  solve(request: SolveRequest): Promise<SolveResult>
}
