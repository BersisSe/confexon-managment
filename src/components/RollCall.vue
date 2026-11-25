<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CountryFlag from '@/components/CountryFlag.vue'
import type { Delegate, Status } from '@/lib/types'

const props = defineProps<{ delegates: Delegate[]; attendance: Record<string, Status>; doneLabel: string }>()
const emit = defineEmits<{ status: [d: Delegate, status: Status]; all: []; done: [] }>()
const { t } = useI18n()

const statuses: Status[] = ['present', 'present_voting', 'absent']
const unmarked = computed(() => props.delegates.filter((d) => !props.attendance[d.id]).length)
const anyHere = computed(() => props.delegates.some((d) => props.attendance[d.id] && props.attendance[d.id] !== 'absent'))
</script>

<template>
  <section class="rc rise">
    <div class="rc-head">
      <h1>{{ t('session.rollCall') }}</h1>
      <button class="lang" @click="emit('all')">{{ t('session.allPresent') }}</button>
    </div>

    <ul class="rc-grid">
      <li v-for="d in delegates" :key="d.id" :class="attendance[d.id]">
        <div class="rc-who">
          <strong><CountryFlag :name="d.country" />{{ d.country }}</strong>
          <small>{{ d.display_name }}</small>
        </div>
        <div class="rc-seg">
          <button v-for="s in statuses" :key="s" :class="[s, { on: attendance[d.id] === s }]" :aria-pressed="attendance[d.id] === s" @click="emit('status', d, s)">
            {{ t('session.short.' + s) }}
          </button>
        </div>
      </li>
    </ul>

    <div class="rc-foot">
      <span v-if="unmarked">{{ t('roll.unmarked', { n: unmarked }) }}</span>
      <button class="btn" :disabled="!anyHere" @click="emit('done')"><Check :size="18" />&nbsp;{{ doneLabel }}</button>
    </div>
  </section>
</template>

<style scoped>
.rc { margin-top: 14px }
.rc-head { display: flex; justify-content: space-between; align-items: center; gap: 12px }
.rc-head h1 { margin: 0 }
.rc-grid { list-style: none; padding: 0; margin: 14px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px }
.rc-grid li { display: grid; gap: 12px; padding: 14px; border-radius: 18px; background: var(--white); border: 1px solid var(--divider); border-left: 4px solid var(--divider) }
.rc-grid li.present { border-left-color: #3e7c4f }
.rc-grid li.present_voting { border-left-color: var(--info) }
.rc-grid li.absent { border-left-color: var(--danger) }
.rc-who { display: grid; min-width: 0; overflow-wrap: anywhere }
.rc-who strong { font-size: 1.1rem }
.rc-who small { color: var(--text-tertiary) }
.rc-seg { display: flex; gap: 6px; flex-wrap: wrap; align-self: end }
.rc-seg button { flex: 1; min-height: 40px; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer }
.rc-seg .present.on { background: #3e7c4f; border-color: #3e7c4f; color: #fff }
.rc-seg .present_voting.on { background: var(--info); border-color: var(--info); color: var(--on-strong) }
.rc-seg .absent.on { background: var(--danger); border-color: var(--danger); color: var(--on-strong) }
.rc-foot { position: sticky; bottom: 16px; display: flex; justify-content: flex-end; align-items: center; gap: 14px; width: fit-content; margin: 18px 0 0 auto; padding: 8px 8px 8px 18px; border-radius: 999px; background: var(--surface-glass); backdrop-filter: blur(14px); border: 1px solid var(--divider); box-shadow: var(--shadow-lg); font-weight: 600 }
.rc-foot .btn { border-radius: 999px }
</style>
