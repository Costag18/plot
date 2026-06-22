export const UM_PER_M = 1_000_000

export const metersToUm = (m: number): number => Math.round(m * UM_PER_M)
export const umToMeters = (um: number): number => um / UM_PER_M
