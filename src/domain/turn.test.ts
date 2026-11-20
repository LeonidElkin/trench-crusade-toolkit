import { describe, expect, it } from 'vitest'
import type { Model, Warband } from './schema'
import {
  battleOrder,
  isActivated,
  isOut,
  newBattle,
  nextTurn,
  numberFighters,
  setActingParty,
  toggleActivation,
  toggleOut,
  type BattleParty,
} from './turn'

function party(id: string, size: number, side = id): BattleParty {
  const units: Model[] = Array.from({ length: size }, (_, n) => ({
    id: `${id}-${n}`,
    unitId: 'trooper',
    name: 'Боец',
    equipment: [],
    upgrades: [],
    loadouts: {},
    notes: '',
    fireteam: '',
  }))
  return { band: { id, units } as Warband, mode: 'quick', side }
}

describe('battle activations', () => {
  it('waits for the confirmed first player, alternates and lets the remaining band finish', () => {
    let battle = { ...newBattle(), parties: [party('a', 2), party('b', 1)] }
    expect(battleOrder(battle).current).toBeUndefined()
    expect(toggleActivation(battle, 'a', 'a-0')).toBe(battle)
    battle = setActingParty(battle, 'a')
    battle = toggleActivation(battle, 'a', 'a-0')
    expect(battleOrder(battle).current?.band.id).toBe('b')
    expect(toggleActivation(battle, 'a', 'a-1')).toBe(battle)
    battle = toggleActivation(battle, 'b', 'b-0')
    battle = toggleActivation(battle, 'a', 'a-1')
    expect(battleOrder(battle).candidates).toEqual([])
  })
  it('handles a joint activation and preserves casualties across turns', () => {
    let battle = { ...newBattle(), parties: [party('a', 3)] }
    battle = toggleActivation(battle, 'a', 'a-0', 'a-1')
    expect(isActivated(battle, 'a', 'a-1')).toBe(true)
    battle = toggleOut(battle, 'a', 'a-2')
    expect(battleOrder(battle).candidates).toEqual([])
    battle = nextTurn(battle)
    expect(battle.turn).toBe(2)
    expect(isActivated(battle, 'a', 'a-1')).toBe(false)
    expect(isOut(battle, 'a', 'a-2')).toBe(true)
    expect(toggleActivation(battle, 'a', 'a-2')).toBe(battle)
    expect(numberFighters(battle.parties[0]!, () => 'Боец').map((entry) => entry.name)).toEqual([
      'Боец №1',
      'Боец №2',
      'Боец №3',
    ])
  })
  it('requests explicit order for multiple warbands and recalculates after undo', () => {
    let battle = {
      ...newBattle(),
      parties: [party('a', 1, 'first'), party('b', 1, 'first'), party('c', 1)],
    }
    expect(battleOrder(battle).manual).toBe(true)
    battle = toggleActivation(setActingParty(battle, 'c'), 'c', 'c-0')
    expect(battleOrder(battle).current).toBeUndefined()
    battle = toggleActivation(setActingParty(battle, 'a'), 'a', 'a-0')
    expect(battleOrder(battle).current?.band.id).toBe('b')
    battle = toggleActivation(battle, 'c', 'c-0')
    expect(battleOrder(battle).candidates.map((p) => p.band.id)).toEqual(['b', 'c'])
    expect(battleOrder(battle).current).toBeUndefined()
  })
})
