<script setup lang="ts">
// Pick one delegate's country from flag tiles. Typing filters, Enter takes the first match.
import { Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CountryFlag from '@/components/CountryFlag.vue'
import type { Delegate } from '@/lib/types'

const props = defineProps<{ delegates: Delegate[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const { t } = useI18n()

const query = ref('')
// Turkish-aware and accent-free, so "ingil" and "İngil" both match.
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')
const matches = computed(() => props.delegates.filter((d) => plain(d.country).includes(plain(query.value.trim()))))
const picked = computed(() => props.delegates.find((d) => d.id === props.modelValue))
function pick(id: string) {
  query.value = ''
  emit('update:modelValue', id)
}
function enter() {
  const first = matches.value[0]
  if (!first || !query.value.trim()) return
  pick(first.id)
}
</script>

<template>
  <!-- Once chosen, the list folds away and only the choice is shown. -->
  <div v-if="picked" :key="picked.id" class="cp-picked rise">
    <CountryFlag :name="picked.country" />
    <strong>{{ picked.country }}</strong>
    <button type="button" class="lang" @click="pick('')">{{ t('modes.change') }}</button>
  </div>
  <div v-else class="cp">
    <div class="cp-search">
      <Search :size="18" aria-hidden="true" />
      <input v-model="query" type="search" :placeholder="t('session.search')" :aria-label="t('session.search')" @keydown.enter.prevent="enter" />
    </div>
    <p v-if="!matches.length" class="cp-none">{{ t('modes.noCountry') }}</p>
    <ul v-else class="cp-grid">
      <li v-for="d in matches" :key="d.id">
        <button type="button" :title="d.display_name" @click="pick(d.id)">
          <CountryFlag :name="d.country" /><span>{{ d.country }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cp { display: grid; gap: 10px }
.cp-search { position: relative; display: grid; align-items: center }
.cp-search svg { position: absolute; left: 14px; color: var(--text-tertiary); pointer-events: none }
.cp-search input { width: 100%; padding-left: 42px; border-radius: 999px }
.cp-grid { list-style: none; margin: 0; padding: 2px; display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; max-height: 264px; overflow: auto }
.cp-grid button { display: grid; justify-items: center; align-content: center; gap: 4px; width: 100%; height: 100%; min-height: 80px; padding: 8px 6px; border-radius: 14px; border: 2px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; line-height: 1.2; text-align: center; overflow-wrap: anywhere; cursor: pointer }
.cp-grid button:hover { background: var(--cream-deep) }
.cp-grid .flag { width: 44px; height: 30px; object-fit: cover; margin: 0 }
.cp-picked { display: grid; justify-items: center; gap: 8px; padding: 20px; border-radius: 18px; border: 2px solid var(--accent); background: var(--accent-soft); text-align: center }
.cp-picked .flag { width: 120px; height: 80px; object-fit: cover; margin: 0 }
.cp-picked strong { font-family: var(--font-display); font-size: 1.8rem; line-height: 1.15; overflow-wrap: anywhere }
.cp-none { margin: 0; padding: 18px; text-align: center; color: var(--text-tertiary) }
</style>
