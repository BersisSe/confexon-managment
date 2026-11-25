// Free-text country name (English or Turkish) -> ISO 3166-1 alpha-2, or null.
const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/ı/g, 'i').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'saint').replace(/^the /, '').trim()

// Spellings Intl does not know, including typos seen in real allocations.
const aliases: Record<string, string[]> = {
  AE: ['uae'], BA: ['bosnia'], CD: ['democratic republic of the congo', 'dr congo'], CG: ['republic of the congo'],
  CI: ['ivory coast'], CV: ['cabo verde'], CZ: ['czech republic'], GB: ['uk', 'great britain'], MM: ['myanmar', 'burma'],
  KP: ['dprk', 'democratic people s republic of korea'], KR: ['republic of korea', 'korea'], PH: ['philipines'],
  PS: ['palestine', 'state of palestine', 'filistin'], RU: ['russian federation'], SG: ['singapoure'],
  SY: ['syrian arab republic'], TR: ['turkey', 'turkiye'], US: ['usa', 'united states of america', 'united state of america', 'abd'],
  VA: ['vatican', 'holy see'], VN: ['viet nam'],
}

let table: Map<string, string> | null = null
function build() {
  const map = new Map<string, string>()
  const names = ['en', 'tr'].map((l) => new Intl.DisplayNames([l], { type: 'region', fallback: 'none' }))
  const az = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const a of az) {
    for (const b of az) {
      const code = a + b
      // Skip retired codes (DD, SU, UK...) so they cannot shadow current ones.
      if (Intl.getCanonicalLocales('und-' + code)[0] !== 'und-' + code) continue
      if (/^(X.|ZZ|EU|EZ|UN|QO)$/.test(code)) continue
      for (const n of names) {
        const name = n.of(code)
        if (name) map.set(norm(name), code)
      }
    }
  }
  for (const [code, list] of Object.entries(aliases)) for (const name of list) map.set(norm(name), code)
  return map
}

export const countryCode = (name: string): string | null => (table ??= build()).get(norm(name)) ?? null
