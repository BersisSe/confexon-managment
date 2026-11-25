// Undo stack for the chair console. Each entry knows how to reverse one action
// (using the same offline-safe db layer). Cleared when the console closes.
import { computed, ref } from 'vue'

interface Entry { label: string; revert: () => Promise<unknown> | unknown }

const stack = ref<Entry[]>([])

export const canUndo = computed(() => stack.value.length > 0)
export const lastLabel = computed(() => stack.value[stack.value.length - 1]?.label ?? '')

export function pushUndo(label: string, revert: Entry['revert']) {
  stack.value = [...stack.value.slice(-29), { label, revert }]
}
export async function undoLast() {
  const e = stack.value[stack.value.length - 1]
  if (!e) return
  stack.value = stack.value.slice(0, -1)
  await e.revert()
}
export const clearUndo = () => { stack.value = [] }
