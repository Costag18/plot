import * as Comlink from 'comlink'
import { PlaneGcsSolver } from './planegcs-solver'
import type { SolveRequest } from '@plot/core'

const solver = new PlaneGcsSolver()

const api = {
  solve: (request: SolveRequest) => solver.solve(request),
}

export type SolverWorkerApi = typeof api

Comlink.expose(api)
