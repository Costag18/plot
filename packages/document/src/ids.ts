export type IdGen = (prefix: string) => string

export function createIdGen(start = 0): IdGen {
  let n = start
  return (prefix: string) => `${prefix}${n++}`
}
