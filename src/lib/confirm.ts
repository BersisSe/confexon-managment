// In-app replacement for window.confirm(). One question at a time.
import { ref } from 'vue'

export interface Question { title: string; text?: string; yes: string; danger?: boolean }

export const question = ref<(Question & { answer: (ok: boolean) => void }) | null>(null)

export function ask(q: Question): Promise<boolean> {
  question.value?.answer(false)
  return new Promise((resolve) => {
    question.value = {
      ...q,
      answer: (ok) => {
        question.value = null
        resolve(ok)
      },
    }
  })
}
