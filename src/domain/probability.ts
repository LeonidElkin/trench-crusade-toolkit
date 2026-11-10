/** Exact ordered dice distributions. Floating point is used only for presentation. */
export interface RollSpec {
  baseDice: number
  positiveDice: number
  negativeDice: number
  sumExtraDice?: number
}
export interface Fraction {
  numerator: bigint
  denominator: bigint
}
export type Distribution = Map<number, bigint>
const cache = new Map<string, { distribution: Distribution; total: bigint }>()
function integer(value: number, min: number, max: number, name: string) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(`${name}: ${min}…${max}`)
}
const factorial = [1n]
for (let i = 1; i <= 24; i++) factorial[i] = factorial[i - 1]! * BigInt(i)
export function rollDistribution(spec: RollSpec): { distribution: Distribution; total: bigint } {
  integer(spec.baseDice, 1, 8, 'baseDice')
  integer(spec.positiveDice, 0, 12, 'positiveDice')
  integer(spec.negativeDice, 0, 12, 'negativeDice')
  const extra = spec.sumExtraDice ?? 0
  integer(extra, 0, 4, 'sumExtraDice')
  const modifier = spec.positiveDice - spec.negativeDice
  const n = spec.baseDice + Math.abs(modifier),
    key = `${spec.baseDice}/${modifier}/${extra}`
  const cached = cache.get(key)
  if (cached) return { distribution: new Map(cached.distribution), total: cached.total }
  const distribution: Distribution = new Map(),
    counts = Array<number>(6).fill(0)
  function collect(face: number, left: number) {
    if (face < 5) {
      for (let count = 0; count <= left; count++) {
        counts[face] = count
        collect(face + 1, left - count)
      }
      return
    }
    counts[5] = left
    let divisor = 1n
    for (const count of counts) divisor *= factorial[count]!
    const ways = factorial[n]! / divisor
    let keep = spec.baseDice,
      sum = 0
    for (let i = 0; i < 6 && keep; i++) {
      const index = modifier >= 0 ? 5 - i : i,
        taken = Math.min(keep, counts[index]!)
      sum += taken * (index + 1)
      keep -= taken
    }
    distribution.set(sum, (distribution.get(sum) ?? 0n) + ways)
  }
  collect(0, n)
  let result = distribution
  for (let i = 0; i < extra; i++) {
    const next: Distribution = new Map()
    for (const [sum, count] of result)
      for (let face = 1; face <= 6; face++)
        next.set(sum + face, (next.get(sum + face) ?? 0n) + count)
    result = next
  }
  const value = { distribution: result, total: 6n ** BigInt(n + extra) }
  cache.set(key, value)
  return { distribution: new Map(value.distribution), total: value.total }
}
export type ActionOutcome = 'failure' | 'success' | 'critical'
export type InjuryOutcome = 'none' | 'minor' | 'down' | 'out'
export const actionOutcome = (value: number): ActionOutcome =>
  value <= 6 ? 'failure' : value <= 11 ? 'success' : 'critical'
export const injuryOutcome = (value: number): InjuryOutcome =>
  value <= 1 ? 'none' : value <= 6 ? 'minor' : value <= 8 ? 'down' : 'out'
export function probabilities<T extends string>(
  spec: RollSpec,
  outcomes: readonly T[],
  classify: (sum: number) => T,
  fixedPositive = 0,
  fixedNegative = 0,
): Record<T, Fraction> {
  integer(fixedPositive, 0, 100, 'fixedPositive')
  integer(fixedNegative, 0, 100, 'fixedNegative')
  const { distribution, total } = rollDistribution(spec)
  const results = Object.fromEntries(
    outcomes.map((k) => [k, { numerator: 0n, denominator: total }]),
  ) as Record<T, Fraction>
  for (const [sum, count] of distribution)
    results[classify(sum + fixedPositive - fixedNegative)].numerator += count
  return results
}
export const actionProbabilities = (spec: RollSpec) =>
  probabilities(spec, ['failure', 'success', 'critical'] as const, actionOutcome)
export const injuryProbabilities = (spec: RollSpec, positive = 0, negative = 0) =>
  probabilities(spec, ['none', 'minor', 'down', 'out'] as const, injuryOutcome, positive, negative)
export function reduceFraction(f: Fraction): Fraction {
  let a = f.numerator,
    b = f.denominator
  while (b) {
    const t = b
    b = a % b
    a = t
  }
  return { numerator: f.numerator / a, denominator: f.denominator / a }
}
export const percent = (fraction: Fraction) =>
  (Number(fraction.numerator) / Number(fraction.denominator)) * 100
