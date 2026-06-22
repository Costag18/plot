import * as Comlink from 'comlink'
import type { ISolver, SolveRequest, SolveResult } from '@plot/core'
import type { SolverWorkerApi } from './worker'

export function createWorkerSolver(): ISolver {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const api = Comlink.wrap<SolverWorkerApi>(worker)
  return {
    solve: (request: SolveRequest): Promise<SolveResult> => api.solve(request),
  }
}
