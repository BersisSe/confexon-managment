<script setup lang="ts">
// Placeholder in the shape of what is coming: a spinner and shimmering cards.
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{ cards?: number }>(), { cards: 8 })
const { t } = useI18n()
</script>

<template>
  <div class="ld" role="status">
    <div class="ld-head">
      <i class="ld-spin" aria-hidden="true" />
      <span>{{ t('loading') }}</span>
    </div>
    <div class="ld-grid" aria-hidden="true">
      <i v-for="n in cards" :key="n" class="ld-card" />
    </div>
  </div>
</template>

<style scoped>
.ld { margin-top: 18px }
.ld-head { display: flex; justify-content: center; align-items: center; gap: 12px; padding: 14px; font-weight: 700; color: var(--text-muted) }
.ld-spin { width: 24px; height: 24px; border-radius: 50%; border: 3px solid var(--divider); border-top-color: var(--accent); animation: ld-turn .7s linear infinite }
.ld-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px }
.ld-card { height: 130px; border-radius: 18px; border: 1px solid var(--divider); background: linear-gradient(100deg, var(--white) 35%, var(--cream-deep) 50%, var(--white) 65%); background-size: 250% 100%; animation: ld-shine 1.3s linear infinite }
@keyframes ld-turn { to { transform: rotate(360deg) } }
@keyframes ld-shine { from { background-position: 100% 0 } to { background-position: -50% 0 } }
</style>
