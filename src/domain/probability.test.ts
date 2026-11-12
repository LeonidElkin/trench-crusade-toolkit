import { describe, expect, it } from 'vitest'
import {
  actionProbabilities,
  actionOutcome,
  injuryProbabilities,
  injuryOutcome,
  percent,
  rollDistribution,
} from './probability'
const spec = { baseDice: 2, positiveDice: 0, negativeDice: 0 }
describe('exact probability calculations', () => {
  it('matches the source 2D6 action table', () => {
    const p = actionProbabilities(spec)
    expect(p).toEqual({
      failure: { numerator: 15n, denominator: 36n },
      success: { numerator: 20n, denominator: 36n },
      critical: { numerator: 1n, denominator: 36n },
    })
  })
  it('matches the source injury thresholds and armour modifiers', () => {
    const p = injuryProbabilities(spec)
    expect([p.none.numerator, p.minor.numerator, p.down.numerator, p.out.numerator]).toEqual([
      0n,
      15n,
      11n,
      10n,
    ])
    const armour = injuryProbabilities(spec, 0, 3)
    expect(armour.none.numerator).toBe(6n)
    expect(injuryOutcome(1)).toBe('none')
    expect(injuryOutcome(6)).toBe('minor')
    expect(injuryOutcome(8)).toBe('down')
    expect(injuryOutcome(9)).toBe('out')
    expect(actionOutcome(6)).toBe('failure')
    expect(actionOutcome(7)).toBe('success')
    expect(actionOutcome(12)).toBe('critical')
  })
  it('cancels positive and negative dice before selecting the pool', () => {
    expect(actionProbabilities({ ...spec, positiveDice: 4, negativeDice: 4 })).toEqual(
      actionProbabilities(spec),
    )
    expect(injuryProbabilities({ ...spec, positiveDice: 5, negativeDice: 3 }, 3, 2)).toEqual(
      injuryProbabilities({ ...spec, positiveDice: 2 }, 1),
    )
  })
  it('keeps exact 100% totals across boundary cases', () => {
    for (const positiveDice of [0, 1, 2, 5, 8, 12])
      for (const negativeDice of [0, 1, 3, 8, 12]) {
        const s = { ...spec, positiveDice, negativeDice }
        for (const fixed of [-20, -3, 0, 2, 20]) {
          const values = Object.values(
            injuryProbabilities(s, Math.max(0, fixed), Math.max(0, -fixed)),
          )
          expect(values.reduce((n, p) => n + p.numerator, 0n)).toBe(values[0]!.denominator)
          expect(values.every((p) => percent(p) >= 0 && percent(p) <= 100)).toBe(true)
        }
      }
  })
  it('matches an independent exhaustive enumeration for small pools', () => {
    for (const baseDice of [1, 2, 3, 4])
      for (const modifier of [-2, -1, 0, 1, 2]) {
        const reference = new Map<number, bigint>(),
          n = baseDice + Math.abs(modifier)
        function enumerate(values: number[]) {
          if (values.length < n) {
            for (let face = 1; face <= 6; face++) enumerate([...values, face])
            return
          }
          const sorted = values.sort((a, b) => (modifier >= 0 ? b - a : a - b)),
            sum = sorted.slice(0, baseDice).reduce((a, b) => a + b, 0)
          reference.set(sum, (reference.get(sum) ?? 0n) + 1n)
        }
        enumerate([])
        expect(
          rollDistribution({
            baseDice,
            positiveDice: Math.max(0, modifier),
            negativeDice: Math.max(0, -modifier),
          }).distribution,
        ).toEqual(reference)
      }
  })
  it('supports 3D6 and 4D6 without forcing two retained dice', () => {
    expect(rollDistribution({ baseDice: 3, positiveDice: 1, negativeDice: 0 }).total).toBe(1296n)
    const four = rollDistribution({ baseDice: 4, positiveDice: 0, negativeDice: 0 })
    expect([...four.distribution.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 4),
    )
    expect(four.distribution.get(24)).toBe(1n)
    expect(rollDistribution({ ...spec, sumExtraDice: 1 })).toEqual(
      rollDistribution({ baseDice: 3, positiveDice: 0, negativeDice: 0 }),
    )
  })
  it('applies the bloodbath pool before selecting modifier dice (core PDF pp.6 and 9)', () => {
    for (const originalPool of [2, 3]) {
      const baseDice = originalPool + 1
      for (const modifier of [-1, 1]) {
        const actual = injuryProbabilities({ baseDice, positiveDice: Math.max(0, modifier), negativeDice: Math.max(0, -modifier) })
        const counts = { none: 0n, minor: 0n, down: 0n, out: 0n }
        function enumerate(dice: number[]) {
          if (dice.length < baseDice + 1) {
            for (let face = 1; face <= 6; face++) enumerate([...dice, face])
            return
          }
          const sum = [...dice].sort((a, b) => modifier > 0 ? b - a : a - b).slice(0, baseDice).reduce((a, b) => a + b, 0)
          counts[injuryOutcome(sum)]++
        }
        enumerate([])
        expect(Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, value.numerator]))).toEqual(counts)
      }
    }
    expect(injuryProbabilities({ baseDice: 3, positiveDice: 1, negativeDice: 0 }))
      .not.toEqual(injuryProbabilities({ baseDice: 2, positiveDice: 1, negativeDice: 0, sumExtraDice: 1 }))
  })
  it('validates bounds and protects cached results from mutation', () => {
    expect(() => rollDistribution({ ...spec, baseDice: 0 })).toThrow(RangeError)
    expect(() => rollDistribution({ ...spec, positiveDice: -1 })).toThrow(RangeError)
    expect(() => rollDistribution({ ...spec, positiveDice: 1.5 })).toThrow(RangeError)
    expect(() => injuryProbabilities(spec, -1)).toThrow(RangeError)
    const p = rollDistribution(spec)
    p.distribution.clear()
    expect(rollDistribution(spec).distribution.size).toBe(11)
  })
})
