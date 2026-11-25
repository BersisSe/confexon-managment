<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

export interface Staff {
  id: string; event_id: string; user_id: string; display_name: string | null; email: string | null
  kind: 'academy' | 'organization'; position: string; committee_id: string | null; source: 'manual' | 'confexon'
}

const props = defineProps<{
  member: Staff
  committees?: { id: string; name: string }[]
  assignable?: boolean
  stacked?: boolean
}>()
const emit = defineEmits<{ remove: []; assign: [committeeId: string] }>()
const { t, te } = useI18n()

const name = computed(() => props.member.display_name || props.member.email || '—')
const initials = computed(() =>
  name.value.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?',
)
const role = computed(() => (te(`team.roles.${props.member.position}`) ? t(`team.roles.${props.member.position}`) : props.member.position))
</script>

<template>
  <li class="mrow" :class="{ stacked }">
    <span class="av" aria-hidden="true">{{ initials }}</span>
    <span class="who">
      <strong>{{ name }}</strong>
      <small class="muted">
        <span class="role">{{ role }}</span>
        <span v-if="member.source === 'confexon'" class="src">· Confexon</span>
      </small>
    </span>
    <select
      v-if="assignable && committees"
      :value="member.committee_id ?? ''"
      :aria-label="t('team.assign')"
      @change="emit('assign', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ t('team.noCommittee') }}</option>
      <option v-for="c in committees" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <button class="rm" :aria-label="t('team.remove')" :title="t('team.remove')" @click="emit('remove')"><X :size="16" /></button>
  </li>
</template>

<style scoped>
.mrow { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 12px; background: var(--white); border: 1px solid var(--divider); list-style: none }
.mrow.stacked { display: grid; grid-template-columns: 36px minmax(0, 1fr) 32px; row-gap: 8px; align-items: center }
.mrow.stacked .rm { grid-column: 3; grid-row: 1 }
.mrow.stacked select { grid-column: 2 / 4; grid-row: 2; max-width: none; width: 100% }
.av { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-dark); font-weight: 700; font-size: 13px }
.who { flex: 1; min-width: 0; display: grid }
.who strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.who small { display: flex; gap: 4px; font-size: 12px }
.role { font-weight: 700; color: var(--accent-dark) }
select { min-height: 36px; max-width: 170px; border: 1px solid var(--divider); border-radius: 10px; padding: 0 8px; font: inherit; font-size: 13px; background: var(--white) }
.rm { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--text-tertiary); cursor: pointer }
.rm:hover { background: var(--danger-soft); color: var(--danger) }
@media (max-width: 560px) { select { max-width: 110px } }
</style>
