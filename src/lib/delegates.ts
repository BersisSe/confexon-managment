// The same person can arrive in a roster from two sources (application and import).
// Show them once, keeping the application row. Nothing is removed from the database.
export function uniqueDelegates<T extends { country: string; display_name: string; source?: string }>(rows: T[]): T[] {
  const key = (r: T) => `${r.country}|${r.display_name}`.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ')
  const best = new Map<string, T>()
  for (const r of rows) {
    const k = key(r)
    if (!best.has(k) || r.source === 'application') best.set(k, r)
  }
  return rows.filter((r) => best.get(key(r)) === r)
}
