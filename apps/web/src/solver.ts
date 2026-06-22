import { createWorkerSolver } from '@plot/solver-worker'
import type { ISolver } from '@plot/core'

let solver: ISolver | null = null

export function getSolver(): ISolver {
  if (!solver) solver = createWorkerSolver()
  return solver
}
