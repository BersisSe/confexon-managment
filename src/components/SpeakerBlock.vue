<script setup lang="ts">
import { ArrowUp, ArrowDown, X, Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fmt, left } from '@/lib/time'
import * as ops from '@/lib/speakerOps'
import { db } from '@/lib/db'
import { pushUndo } from '@/lib/undo'
import SpeakerStage from './SpeakerStage.vue'
import type { Delegate, Speaker, Status } from '@/lib/types'

const props = defineProps<{
  sessionId: string
  motionId: string
  list: 'mod' | 'single'
  delegates: Delegate[]
  attendance: Record<string, Status>
  speakers: Speaker[]
  now: number
  seconds: number
  motionElapsed?: number
}>()
const emit = defineEmits<{ log: [kind: string, data: Record<string, unknown>] }>()
const { t } = useI18n()
const search = ref('')
const manage = ref(false)

const byId = computed(() => Object.fromEntries(props.delegates.map((d) => [d.id, d])))
const queue = computed(() =>
  props.speakers
    .filter((s) => s.list === props.list && s.motion_id === props.motionId && !s.finished_at)
    .sort((a, b) => a.position - b.position),
)
const current = computed(() => queue.value[0] ?? null)
const upcoming = computed(() => queue.value.slice(1))
const remaining = computed(() =>
  current.value
    ? left(current.value.duration_seconds * 1000, current.value.elapsed_ms, current.value.running_since, props.now)
    : props.seconds * 1000,
)
const addable = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.delegates.filter(
    (d) => props.attendance[d.id] && props.attendance[d.id] !== 'absent' && d.country.toLowerCase().includes(q),
  )
})
const canAdd = computed(() => props.list === 'mod' || queue.value.length === 0)
const country = (s: Speaker) => byId.value[s.delegate_id]?.country ?? '—'

function add(d: Delegate) {
  ops.addSpeaker(props.sessionId, d.id, props.seconds, props.speakers, t('undo.addSpeaker', { c: d.country }), {
    list: props.list, motion_id: props.motionId,
  })
  emit('log', 'speaker_added', { country: d.country })
}
function next() {
  const s = current.value
  if (!s) return
  const label = t('undo.nextSpeaker', { c: country(s) })
  const undoSpeaker = ops.finishRaw(s)
  let undoTotal = () => {}
  if (props.list === 'mod') {
    // The time actually used (capped at the allotted time) is taken off the caucus total.
    const used = Math.min(ops.elapsedNow(s), s.duration_seconds * 1000)
    const prev = props.motionElapsed ?? 0
    db.update('cmd_motions', { elapsed_ms: prev + used }, { id: props.motionId })
    undoTotal = () => db.update('cmd_motions', { elapsed_ms: prev }, { id: props.motionId })
  }
  pushUndo(label, () => { undoTotal(); undoSpeaker() })
  emit('log', 'speaker_done', { country: country(s) })
}
</script>

<template>
  <div>
    <SpeakerStage
      :current="current ? country(current) : null"
      :clock="fmt(remaining)"
      :total="fmt((current?.duration_seconds ?? seconds) * 1000)"
      :remaining-ms="remaining"
      :running="!!current?.running_since"
      :next="upcoming.map(country)"
      :show-next="list === 'mod'"
      :done-label="list === 'single' ? t('modes.done') : undefined"
      @play="current && ops.toggleTimer(current)"
      @reset="current && ops.resetTimer(current, t('undo.resetTimer'))"
      @adjust="(s) => current && ops.adjustTime(current, s, t('undo.adjustTime'))"
      @done="next"
    />

    <div class="manage">
      <button class="lang" :aria-expanded="manage" @click="manage = !manage">
        {{ manage ? t('session.hideManage') : t('session.manage') }}
      </button>
    </div>

    <div v-if="manage" class="c-card c-add">
      <ul v-if="upcoming.length" class="c-rows soft">
        <li v-for="(s, i) in upcoming" :key="s.id">
          <span>{{ i + 2 }}. {{ country(s) }}</span>
          <span class="c-acts">
            <button class="c-x" :disabled="i === 0" :aria-label="t('session.moveUp')" @click="ops.moveSpeaker(queue, s, -1, t('undo.moveSpeaker'))"><ArrowUp :size="16" /></button>
            <button class="c-x" :disabled="i === upcoming.length - 1" :aria-label="t('session.moveDown')" @click="ops.moveSpeaker(queue, s, 1, t('undo.moveSpeaker'))"><ArrowDown :size="16" /></button>
            <button class="c-x" :aria-label="t('session.remove')" @click="ops.removeSpeaker(s, t('undo.removeSpeaker', { c: country(s) }))"><X :size="16" /></button>
          </span>
        </li>
      </ul>
      <input v-model="search" type="search" :placeholder="t('session.search')" />
      <p v-if="!canAdd" class="muted">{{ t('modes.singleTaken') }}</p>
      <ul v-else class="c-pick grid">
        <li v-for="d in addable" :key="d.id"><button @click="add(d)">{{ d.country }}<Plus :size="16" /></button></li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.manage { display: flex; justify-content: flex-end; margin: 12px 0 }
.c-pick.grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); max-height: 40vh }
</style>
