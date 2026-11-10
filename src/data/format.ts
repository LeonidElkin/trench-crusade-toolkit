/** Russian counter labels; presentation only, never part of game mechanics. */
export function nounForm(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(count) % 100,
    last = n % 10
  return n >= 11 && n <= 14
    ? forms[2]
    : last === 1
      ? forms[0]
      : last >= 2 && last <= 4
        ? forms[1]
        : forms[2]
}
export const countLabel = (count: number, forms: readonly [string, string, string]) =>
  `${count} ${nounForm(count, forms)}`
