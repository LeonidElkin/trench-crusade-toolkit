import type { Category, Item } from '../domain/schema'

export const equipmentCategories: Category[] = ['ranged', 'melee', 'armour', 'equipment']

export function weaponHands(item?: Item) {
  if (!item || (item.category !== 'ranged' && item.category !== 'melee')) return
  if (item.keywords.includes('GRENADE') || item.definition.type === 'Граната') return 'Граната'
  if (item.id === 'core-item-unarmed') return 'Атака без оружия'
  if (item.hands === 1) return 'Одноручное'
  if (item.hands === 2) return 'Двуручное'
  if (item.hands === 0) return 'Не занимает рук'
  if (item.hands !== null) return `Рук: ${item.hands}`
  return 'Число рук не подтверждено'
}
