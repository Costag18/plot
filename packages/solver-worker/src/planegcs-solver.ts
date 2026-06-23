import { init_planegcs_module, GcsWrapper } from '@salusoft89/planegcs'
import type { SketchPrimitive, SketchPoint } from '@salusoft89/planegcs'
import type { ISolver, SolveRequest, SolveResult, SolveConstraint } from '@plot/core'

// PlaneGCS `solve_system` return codes (see SolveStatus in the package enums):
// 0 = Success, 1 = Converged are good; 2 = Failed, 3 = SuccessfulSolutionInvalid are not.
const SOLVE_SUCCESS = 0
const SOLVE_CONVERGED = 1

// init_planegcs_module() loads the WASM. In Node it resolves planegcs.wasm relative
// to the package's planegcs.js via import.meta.url + fs, so no locateFile is needed.
// In a browser/worker bundle the host (e.g. Vite) wires the .wasm asset. Memoized so
// repeated solves reuse one module instance.
let modulePromise: ReturnType<typeof init_planegcs_module> | null = null

/**
 * Translate a neutral SolveRequest into the flat list of PlaneGCS sketch primitives
 * (geometry + constraints) consumed by GcsWrapper.push_primitives_and_params.
 *
 * Pure and side-effect free: ids for the synthetic helper lines and constraints are
 * generated from a local counter, so the same request always yields the same output.
 * Referenced primitives are emitted before the primitives that reference them (points,
 * then helper lines, then constraints), which is what PlaneGCS requires.
 */
export function toPrimitives(req: SolveRequest): SketchPrimitive[] {
  const out: SketchPrimitive[] = []
  let lineSeq = 0
  let consSeq = 0
  const lineId = (): string => `__line_${lineSeq++}`
  const consId = (): string => `__c_${consSeq++}`

  const lineFor = (pair: [string, string]): string => {
    const id = lineId()
    out.push({ id, type: 'line', p1_id: pair[0], p2_id: pair[1] })
    return id
  }

  for (const p of req.points) {
    out.push({ id: p.id, type: 'point', x: p.x, y: p.y, fixed: p.fixed })
  }

  for (const c of req.constraints) {
    pushConstraint(c, out, consId, lineFor)
  }

  return out
}

function pushConstraint(
  c: SolveConstraint,
  out: SketchPrimitive[],
  consId: () => string,
  lineFor: (pair: [string, string]) => string,
): void {
  switch (c.kind) {
    case 'coincident':
      out.push({ id: consId(), type: 'p2p_coincident', p1_id: c.a, p2_id: c.b })
      break
    case 'horizontal':
      out.push({ id: consId(), type: 'horizontal_pp', p1_id: c.p1, p2_id: c.p2 })
      break
    case 'vertical':
      out.push({ id: consId(), type: 'vertical_pp', p1_id: c.p1, p2_id: c.p2 })
      break
    case 'distance':
      out.push({ id: consId(), type: 'p2p_distance', p1_id: c.p1, p2_id: c.p2, distance: c.value })
      break
    case 'parallel': {
      const l1_id = lineFor(c.l1)
      const l2_id = lineFor(c.l2)
      out.push({ id: consId(), type: 'parallel', l1_id, l2_id })
      break
    }
    case 'perpendicular': {
      const l1_id = lineFor(c.l1)
      const l2_id = lineFor(c.l2)
      out.push({ id: consId(), type: 'perpendicular_ll', l1_id, l2_id })
      break
    }
    case 'equalLength': {
      const l1_id = lineFor(c.l1)
      const l2_id = lineFor(c.l2)
      out.push({ id: consId(), type: 'equal_length', l1_id, l2_id })
      break
    }
    case 'angle': {
      const l1_id = lineFor(c.l1)
      const l2_id = lineFor(c.l2)
      out.push({ id: consId(), type: 'l2l_angle_ll', l1_id, l2_id, angle: c.value })
      break
    }
    case 'pointLineDistance': {
      const l_id = lineFor(c.l)
      out.push({ id: consId(), type: 'p2l_distance', p_id: c.point, l_id, distance: c.value })
      break
    }
  }
}

export class PlaneGcsSolver implements ISolver {
  async solve(request: SolveRequest): Promise<SolveResult> {
    const mod = await (modulePromise ??= init_planegcs_module())
    const gcs = new GcsWrapper(new mod.GcsSystem())
    try {
      gcs.push_primitives_and_params(toPrimitives(request))
      const code = gcs.solve()
      gcs.apply_solution()

      const points = gcs.sketch_index
        .get_primitives()
        .filter((p): p is SketchPoint => p.type === 'point')
        .map((p) => ({ id: p.id, x: Number(p.x), y: Number(p.y) }))

      const converged = code === SOLVE_SUCCESS || code === SOLVE_CONVERGED
      const finite = points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

      if (!finite) {
        return { status: 'failed', points: [] }
      }
      return { status: converged ? 'ok' : 'failed', points }
    } catch (e) {
      console.error('[PlaneGcsSolver] unexpected error during solve:', e)
      return { status: 'failed', points: [] }
    } finally {
      gcs.destroy_gcs_module()
    }
  }
}
