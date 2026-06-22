import type { Unit } from './document'

export function formatLength(um: number, unit: Unit): string {
  const m = um / 1_000_000
  switch (unit) {
    case 'mm':
      return `${(m * 1000).toFixed(0)} mm`
    case 'cm':
      return `${(m * 100).toFixed(1)} cm`
    case 'm':
      return `${m.toFixed(2)} m`
    case 'ft':
      return `${(m / 0.3048).toFixed(2)} ft`
  }
}
