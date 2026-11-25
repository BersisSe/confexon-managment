import { createI18n } from 'vue-i18n'
import tr from './locales/tr'
import en from './locales/en'

export const SUPPORTED = ['tr', 'en'] as const
export type Locale = (typeof SUPPORTED)[number]

function initial(): Locale {
  try {
    const saved = localStorage.getItem('locale')
    if (saved && (SUPPORTED as readonly string[]).includes(saved)) return saved as Locale
  } catch {}
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: initial(),
  fallbackLocale: 'en',
  messages: { tr, en },
})

export function setLocale(l: Locale) {
  i18n.global.locale.value = l
  document.documentElement.lang = l
  try { localStorage.setItem('locale', l) } catch {}
}
