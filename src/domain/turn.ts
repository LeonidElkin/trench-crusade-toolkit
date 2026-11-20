import { z } from 'zod'
import { WarbandSchema } from './schema'

const PartySchema = z.object({
  band: WarbandSchema,
  mode: z.enum(['saved', 'quick']),
  side: z.string().max(80),
})
const BattleSchema = z.object({
  version: z.literal(1),
  turn: z.number().int().positive(),
  parties: z.array(PartySchema).max(24),
  opening: z.string().nullable(),
  next: z.string().nullable(),
  activations: z
    .array(z.object({ partyId: z.string(), modelIds: z.array(z.string()).min(1).max(2) }))
    .max(7200),
  out: z.array(z.string()).max(7200),
})
export type Battle = z.infer<typeof BattleSchema>
export type BattleParty = z.infer<typeof PartySchema>
export const BATTLE_KEY = 'trench-toolkit.turn.v1'

export function newBattle(): Battle {
  return { version: 1, turn: 1, parties: [], opening: null, next: null, activations: [], out: [] }
}

export function loadBattle(storage: Pick<Storage, 'getItem'>): Battle {
  const raw = storage.getItem(BATTLE_KEY)
  if (!raw) return newBattle()
  return BattleSchema.parse(JSON.parse(raw))
}

const fighterKey = (partyId: string, modelId: string) => JSON.stringify([partyId, modelId])
export const isOut = (battle: Battle, partyId: string, modelId: string) =>
  battle.out.includes(fighterKey(partyId, modelId))
export const isActivated = (battle: Battle, partyId: string, modelId: string) =>
  battle.activations.some(
    (activation) => activation.partyId === partyId && activation.modelIds.includes(modelId),
  )

export function living(battle: Battle, party: BattleParty) {
  return party.band.units.filter((model) => !isOut(battle, party.band.id, model.id))
}

export function ready(battle: Battle, party: BattleParty) {
  return living(battle, party).filter((model) => !isActivated(battle, party.band.id, model.id))
}

export function battleOrder(battle: Battle) {
  const playing = battle.parties.filter((party) => party.band.units.length > 0)
  const candidates = playing.filter((party) => ready(battle, party).length)
  const manual =
    playing.length > 2 || (playing.length === 2 && playing[0]!.side === playing[1]!.side)
  if (candidates.length < 2) return { candidates, manual, current: candidates[0] }
  if (manual)
    return {
      candidates,
      manual,
      current: candidates.find((party) => party.band.id === battle.next),
    }
  const previous = battle.activations.at(-1)?.partyId
  const next = previous
    ? candidates.find((party) => party.band.id !== previous)?.band.id
    : battle.opening
  return { candidates, manual, current: candidates.find((party) => party.band.id === next) }
}

export function setActingParty(battle: Battle, partyId: string): Battle {
  const order = battleOrder(battle)
  if (!order.candidates.some((party) => party.band.id === partyId)) return battle
  if (order.manual) return { ...battle, next: partyId }
  return battle.activations.length ? battle : { ...battle, opening: partyId }
}

export function toggleActivation(
  battle: Battle,
  partyId: string,
  modelId: string,
  partnerId?: string,
): Battle {
  if (isActivated(battle, partyId, modelId)) {
    return {
      ...battle,
      next: null,
      activations: battle.activations.flatMap((activation) => {
        if (activation.partyId !== partyId || !activation.modelIds.includes(modelId))
          return [activation]
        const remaining = activation.modelIds.filter((id) => id !== modelId)
        return remaining.length ? [{ ...activation, modelIds: remaining }] : []
      }),
    }
  }
  const party = battleOrder(battle).current
  if (!party || party.band.id !== partyId) return battle
  const models = ready(battle, party)
  if (!models.some((model) => model.id === modelId)) return battle
  const ids =
    partnerId && partnerId !== modelId && models.some((model) => model.id === partnerId)
      ? [modelId, partnerId]
      : [modelId]
  return {
    ...battle,
    opening: battle.opening ?? partyId,
    next: null,
    activations: [...battle.activations, { partyId, modelIds: ids }],
  }
}

export function toggleOut(battle: Battle, partyId: string, modelId: string): Battle {
  if (
    !battle.parties.some(
      (party) =>
        party.band.id === partyId && party.band.units.some((model) => model.id === modelId),
    )
  )
    return battle
  const key = fighterKey(partyId, modelId)
  return {
    ...battle,
    out: battle.out.includes(key) ? battle.out.filter((id) => id !== key) : [...battle.out, key],
  }
}

export const nextTurn = (battle: Battle): Battle => ({
  ...battle,
  turn: battle.turn + 1,
  opening: null,
  next: null,
  activations: [],
})

export function numberFighters(party: BattleParty, profileName: (id: string) => string) {
  const totals = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const model of party.band.units)
    totals.set(model.unitId, (totals.get(model.unitId) ?? 0) + 1)
  return party.band.units.map((model) => {
    const n = (seen.get(model.unitId) ?? 0) + 1
    seen.set(model.unitId, n)
    return {
      model,
      name: `${model.name || profileName(model.unitId)}${(totals.get(model.unitId) ?? 0) > 1 ? ` №${n}` : ''}`,
    }
  })
}
