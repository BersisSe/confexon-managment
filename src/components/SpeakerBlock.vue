<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fmt, left } from '@/lib/time'
import * as ops from '@/lib/speakerOps'
import { db } from '@/lib/db'
import { pushUndo } from '@/lib/undo'
import SpeakerStage from './SpeakerStage.vue'
import SpeakerAdd from './SpeakerAdd.vue'
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
const manage = ref(false)
// Until the first speech starts, the caucus opens on the list builder.
const ready = ref(false)
const setup = computed(() =>
  !ready.value && !props.speakers.some((s) => s.list === props.list && s.motion_id === props.motionId && (s.finished_at || s.running_since || s.elapsed_ms > 0)),
)

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
const presentDelegates = computed(() => props.delegates.filter((d) => props.attendance[d.id] && props.attendance[d.id] !== 'absent'))
const canAdd = computed(() => props.list === 'mod' || queue.value.length === 0)
const country = (s: Speaker) => byId.value[s.delegate_id]?.country ?? '—'

function add(d: Delegate) {
  ops.addSpeaker(props.sessionId, d.id, props.seconds, props.speakers, t('undo.addSpeaker', { c: d.country }), {
    list: props.list, motion_id: props.motionId,
  })
  emit('log', 'speaker_added', { country: d.country })
}
const previous = computed(() => ops.lastFinished(props.speakers, props.list, props.motionId))
function goBack() {
  const s = previous.value
  if (!s) return
  const label = t('undo.previousSpeaker', { c: country(s) })
  const undoSpeaker = ops.reopen(s, queue.value)
  let undoTotal = () => {}
  if (props.list === 'mod') {
    // Give back the caucus time that next() took off for this speaker.
    const used = Math.min(s.elapsed_ms, s.duration_seconds * 1000)
    const before = props.motionElapsed ?? 0
    db.update('cmd_motions', { elapsed_ms: Math.max(0, before - used) }, { id: props.motionId })
    undoTotal = () => db.update('cmd_motions', { elapsed_ms: before }, { id: props.motionId })
  }
  pushUndo(label, () => { undoTotal(); undoSpeaker() })
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
  <div v-if="setup" class="sb-setup rise">
    <div class="sb-head">
      <h2>{{ t('session.addSpeakers') }}</h2>
      <button class="btn sb-go" :disabled="!queue.length" @click="ready = true">{{ t('session.startSpeeches') }}<ArrowRight :size="18" /></button>
    </div>
    <SpeakerAdd
      :delegates="presentDelegates" :by-id="byId" :queue="queue"
      :closed-text="canAdd ? undefined : t('modes.singleTaken')" @add="add"
      @move="(s, dir) => ops.moveSpeaker(queue, s, dir, t('undo.moveSpeaker'))"
      @remove="(s) => ops.removeSpeaker(s, t('undo.removeSpeaker', { c: country(s) }))"
    />
  </div>
  <div v-else>
    <SpeakerStage
      :current="current ? country(current) : null"
      :clock="fmt(remaining)"
      :total="fmt((current?.duration_seconds ?? seconds) * 1000)"
      :total-ms="(current?.duration_seconds ?? seconds) * 1000"
      :remaining-ms="remaining"
      :running="!!current?.running_since"
      :next="upcoming.map(country)"
      :show-next="list === 'mod'"
      :done-label="list === 'single' ? t('modes.done') : undefined"
      @play="current && ops.toggleTimer(current)"
      @reset="current && ops.resetTimer(current, t('undo.resetTimer'))"
      @adjust="(s) => current && ops.adjustTime(current, s, t('undo.adjustTime'))"
      @done="next"
      :can-previous="!!previous"
      @previous="goBack"
    />

    <div class="manage">
      <button class="lang" :aria-expanded="manage" @click="manage = !manage">
        {{ manage ? t('session.hideManage') : t('session.manage') }}
      </button>
    </div>

    <SpeakerAdd
      v-if="manage" class="rise" :delegates="presentDelegates" :by-id="byId" :queue="upcoming" :first-number="2"
      :closed-text="canAdd ? undefined : t('modes.singleTaken')" @add="add"
      @move="(s, dir) => ops.moveSpeaker(queue, s, dir, t('undo.moveSpeaker'))"
      @remove="(s) => ops.removeSpeaker(s, t('undo.removeSpeaker', { c: country(s) }))"
    />
  </div>
</template>

<style scoped>
.sb-setup { margin-top: 18px }
.sb-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px }
.sb-head h2 { margin: 0 }
.sb-go { gap: 8px; border-radius: 999px }
.manage { display: flex; justify-content: flex-end; margin: 12px 0 }
</style>
