// Light / dark theme. Follows the system until the user picks one.
import { ref, watchEffect } from 'vue'

const KEY = 'cmd-theme'
function initial(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved === 'dark'
  } catch { /* storage unavailable */ }
  return matchMedia('(prefers-color-scheme: dark)').matches
}

export const dark = ref(initial())
watchEffect(() => (document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'))

export function toggleTheme() {
  dark.value = !dark.value
  try { localStorage.setItem(KEY, dark.value ? 'dark' : 'light') } catch { /* storage unavailable */ }
}
