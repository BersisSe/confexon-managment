<script setup lang="ts">
// Build a speakers list: tap a flag to queue that country, reorder on the right.
import { ArrowDown, ArrowUp, Search, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CountryFlag from '@/components/CountryFlag.vue'
import type { Delegate, Speaker } from '@/lib/types'

const props = defineProps<{
  delegates: Delegate[] // who may be added
  byId: Record<string, Delegate>
  queue: Speaker[] // the rows listed on the right
  firstNumber?: number
  closedText?: string // set when no more speakers may be added
}>()
const emit = defineEmits<{ add: [d: Delegate]; move: [s: Speaker, dir: -1 | 1]; remove: [s: Speaker] }>()
const { t } = useI18n()

const query = ref('')
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')
const matches = computed(() => props.delegates.filter((d) => plain(d.country).includes(plain(query.value.trim()))))
const queued = computed(() => new Set(props.queue.map((s) => s.delegate_id)))
const name = (s: Speaker) => props.byId[s.delegate_id]?.country ?? '—'

// Tapping a listed country takes it off the list again.
function toggle(d: Delegate) {
  const mine = props.queue.filter((s) => s.delegate_id === d.id)
  if (mine.length) mine.forEach((s) => emit('remove', s))
  else emit('add', d)
  query.value = ''
}
function enter() {
  const first = matches.value[0]
  // Enter only adds, so a repeated search never removes by surprise.
  if (first && query.value.trim() && !props.closedText && !queued.value.has(first.id)) toggle(first)
}
</script>

<template>
  <div class="sa">
    <div class="sa-card">
      <div class="sa-search">
        <Search :size="18" aria-hidden="true" />
        <input v-model="query" type="search" :placeholder="t('session.search')" :aria-label="t('session.search')" @keydown.enter.prevent="enter" />
      </div>
      <p v-if="closedText" class="sa-empty">{{ closedText }}</p>
      <p v-else-if="!matches.length" class="sa-empty">{{ t('modes.noCountry') }}</p>
      <ul v-else class="sa-grid">
        <li v-for="d in matches" :key="d.id">
          <button type="button" :class="{ in: queued.has(d.id) }" :aria-pressed="queued.has(d.id)" :title="d.display_name" @click="toggle(d)">
            <CountryFlag :name="d.country" /><span>{{ d.country }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="sa-card">
      <h3>{{ t('session.upcoming') }}<span v-if="queue.length" class="sa-count">{{ queue.length }}</span></h3>
      <p v-if="!queue.length" class="sa-empty">{{ t('session.addHint') }}</p>
      <TransitionGroup v-else tag="ol" name="sa" class="sa-list">
        <li v-for="(s, i) in queue" :key="s.id">
          <span class="sa-no">{{ i + (firstNumber ?? 1) }}</span>
          <span class="sa-name"><CountryFlag :name="name(s)" />{{ name(s) }}</span>
          <button :disabled="i === 0" :aria-label="t('session.moveUp')" @click="emit('move', s, -1)"><ArrowUp :size="16" /></button>
          <button :disabled="i === queue.length - 1" :aria-label="t('session.moveDown')" @click="emit('move', s, 1)"><ArrowDown :size="16" /></button>
          <button :aria-label="t('session.remove')" @click="emit('remove', s)"><X :size="16" /></button>
        </li>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.sa { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr); gap: 18px; align-items: start }
@media (max-width: 820px) { .sa { grid-template-columns: 1fr } }
.sa-card { display: grid; gap: 12px; min-width: 0; padding: 18px; border-radius: 22px; background: var(--white); border: 1px solid var(--divider); box-shadow: var(--shadow-sm) }
.sa-card h3 { display: flex; align-items: center; gap: 10px; margin: 0 }
.sa-count { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 8px; border-radius: 999px; background: var(--accent); color: #fff; font-family: var(--font-body); font-size: 13px }
.sa-search { position: relative; display: grid; align-items: center }
.sa-search svg { position: absolute; left: 14px; color: var(--text-tertiary); pointer-events: none }
.sa-search input { width: 100%; padding-left: 42px; border-radius: 999px }
.sa-grid { list-style: none; margin: 0; padding: 2px; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; max-height: 52vh; overflow: auto }
.sa-grid button { display: grid; justify-items: center; align-content: center; gap: 6px; width: 100%; height: 100%; min-height: 92px; padding: 10px 6px; border-radius: 16px; border: 2px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; line-height: 1.2; text-align: center; overflow-wrap: anywhere; cursor: pointer }
.sa-grid button:hover { border-color: var(--accent); background: var(--accent-soft) }
.sa-grid button.in { border-color: var(--success-text); background: var(--success-soft) }
.sa-grid button.in:hover { border-color: var(--danger); background: var(--danger-soft) }
.sa-grid .flag { width: 52px; height: 35px; object-fit: cover; margin: 0 }
.sa-empty { margin: 0; padding: 22px; text-align: center; border: 1px dashed var(--divider); border-radius: 14px; color: var(--text-tertiary) }
.sa-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 52vh; overflow: auto }
.sa-list li { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 999px; background: var(--cream) }
.sa-no { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--cream-deep); font-size: 13px; font-weight: 700 }
.sa-name { flex: 1; min-width: 0; font-weight: 700; overflow-wrap: anywhere }
.sa-list button { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--text-tertiary); cursor: pointer }
.sa-list button:hover:not(:disabled) { background: var(--cream-deep); color: var(--text) }
.sa-list button:disabled { opacity: .3; cursor: default }
.sa-enter-active, .sa-leave-active, .sa-move { transition: opacity .18s ease, transform .2s var(--ease-out) }
.sa-enter-from, .sa-leave-to { opacity: 0; transform: translateX(14px) }
</style>
