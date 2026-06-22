import { createWorkerSolver } from '@plot/solver-worker'
import { solveSketch, umToMeters } from '@plot/core'
import type { Sketch } from '@plot/core'
import { render } from './renderer'

const M = 1_000_000

const sketch: Sketch = {
  points: {
    p0: { type: 'point', id: 'p0', x: 0, y: 0, fixed: true },
    p1: { type: 'point', id: 'p1', x: 2_800_000, y: 50_000, fixed: false },
    p2: { type: 'point', id: 'p2', x: 2_900_000, y: 2_100_000, fixed: false },
    p3: { type: 'point', id: 'p3', x: 20_000, y: 1_950_000, fixed: false },
  },
  lines: {
    L0: { type: 'line', id: 'L0', a: 'p0', b: 'p1' },
    L1: { type: 'line', id: 'L1', a: 'p1', b: 'p2' },
    L2: { type: 'line', id: 'L2', a: 'p2', b: 'p3' },
    L3: { type: 'line', id: 'L3', a: 'p3', b: 'p0' },
  },
  constraints: [
    { id: 'c0', kind: 'horizontal', line: 'L0' },
    { id: 'c1', kind: 'distance', line: 'L0', value: 3 * M },
    { id: 'c2', kind: 'distance', line: 'L3', value: 2 * M },
    { id: 'c3', kind: 'perpendicular', l1: 'L0', l2: 'L3' },
    { id: 'c4', kind: 'parallel', l1: 'L0', l2: 'L2' },
    { id: 'c5', kind: 'parallel', l1: 'L3', l2: 'L1' },
  ],
}

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const status = document.getElementById('status') as HTMLParagraphElement
const button = document.getElementById('solve') as HTMLButtonElement

let current: Sketch = sketch
render(ctx, current)

const solver = createWorkerSolver()

button.addEventListener('click', async () => {
  status.textContent = 'Solving…'
  current = await solveSketch(current, solver)
  render(ctx, current)
  const p1 = current.points.p1!
  const p3 = current.points.p3!
  const w = umToMeters(p1.x).toFixed(2)
  const h = umToMeters(p3.y).toFixed(2)
  status.textContent = `Solved: ${w} m × ${h} m`
})
