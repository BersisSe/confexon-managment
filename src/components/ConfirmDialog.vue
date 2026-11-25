<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { question } from '@/lib/confirm'

const { t } = useI18n()
const dlg = ref<HTMLDialogElement | null>(null)
const cancel = ref<HTMLButtonElement | null>(null)

watch(question, async (q) => {
  if (!q) return
  await nextTick()
  dlg.value?.showModal()
  cancel.value?.focus() // the safe choice gets Enter by default
})
</script>

<template>
  <!-- aria-modal also tells the speaker shortcuts to stay quiet. -->
  <dialog
    v-if="question" ref="dlg" class="cf" aria-modal="true" aria-labelledby="cf-title"
    @cancel.prevent="question.answer(false)" @click.self="question.answer(false)" @keydown.stop
  >
    <div class="cf-box">
      <span class="cf-icon" :class="{ danger: question.danger }" aria-hidden="true"><TriangleAlert :size="28" /></span>
      <h2 id="cf-title">{{ question.title }}</h2>
      <p v-if="question.text">{{ question.text }}</p>
      <div class="cf-acts">
        <button ref="cancel" type="button" class="cf-no" @click="question.answer(false)">{{ t('modes.cancel') }}</button>
        <button type="button" class="cf-yes" :class="{ danger: question.danger }" @click="question.answer(true)">{{ question.yes }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.cf { width: min(420px, calc(100% - 32px)); padding: 0; border: 1px solid var(--divider); border-radius: 24px; background: var(--white); color: var(--text); box-shadow: var(--shadow-lg) }
.cf[open] { animation: cf-in .2s var(--ease-out) }
.cf::backdrop { background: rgb(0 0 0 / .55); backdrop-filter: blur(3px) }
.cf-box { display: grid; justify-items: center; gap: 12px; padding: 28px 24px 22px; text-align: center }
.cf-icon { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-dark) }
.cf-icon.danger { background: var(--danger-soft); color: var(--danger) }
.cf h2 { margin: 0; font-size: 1.4rem; line-height: 1.25 }
.cf p { margin: 0; color: var(--text-muted) }
.cf-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-top: 8px }
.cf-acts button { min-height: 50px; border-radius: 999px; border: 1px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-weight: 700; cursor: pointer }
.cf-acts .cf-no:hover { background: var(--cream-deep) }
.cf-acts .cf-yes { background: var(--accent); border-color: var(--accent); color: #fff }
.cf-acts .cf-yes.danger { background: var(--danger); border-color: var(--danger); color: var(--on-strong) }
.cf-acts .cf-yes:hover { filter: brightness(1.1) }
@keyframes cf-in { from { opacity: 0; translate: 0 12px; scale: .96 } }
</style>
