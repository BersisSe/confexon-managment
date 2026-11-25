<script setup lang="ts">
// Opening speeches: held once per committee, same time for everyone.
// Stored as 'single' speakers without a motion, so the database needs no change.
import { Minus, Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/db'
import { pushUndo } from '@/lib/undo'
import { fmt, left } from '@/lib/time'
import * as ops from '@/lib/speakerOps'
import SpeakerStage from './SpeakerStage.vue'
import type { Delegate, Speaker, Status } from '@/lib/types'

const props = defineProps<{
  sessionId: string
  delegates: Delegate[]
  attendance: Record<string, Status>
  speakers: Speaker[]
  spokenBefore: string[]
  now: number
}>()
const emit = defineEmits<{ back: []; finish: []; log: [kind: string, data: Record<string, unknown>] }>()
const { t } = useI18n()

const seconds = ref(90)
const bump = (d: number) => (seconds.value = Math.min(3600, Math.max(15, seconds.value + d)))

const byId = computed(() => Object.fromEntries(props.delegates.map((d) => [d.id, d])))
const country = (s: Speaker) => byId.value[s.delegate_id]?.country ?? '—'
const rows = computed(() => props.speakers.filter((s) => s.list === 'single' && !s.motion_id))
const queue = computed(() => rows.value.filter((s) => !s.finished_at).sort((a, b) => a.position - b.position))
const current = computed(() => queue.value[0] ?? null)
const upcoming = computed(() => queue.value.slice(1))
const previous = computed(() => ops.lastFinished(props.speakers, 'single', null))
// Present delegates who are neither listed nor already spoke in an earlier session.
const waiting = computed(() => props.delegates.filter((d) =>
  props.attendance[d.id] && props.attendance[d.id] !== 'absent' &&
  !props.spokenBefore.includes(d.id) && !rows.value.some((s) => s.delegate_id === d.id),
))
const duration = computed(() => current.value?.duration_seconds ?? rows.value[0]?.duration_seconds ?? seconds.value)
const remaining = computed(() =>
  current.value ? left(current.value.duration_seconds * 1000, current.value.elapsed_ms, current.value.running_since, props.now) : duration.value * 1000,
)

function addWaiting() {
  const each = rows.value[0]?.duration_seconds ?? seconds.value
  let position = Math.max(0, ...props.speakers.map((s) => s.position))
  const ids = waiting.value.map((d) => db.insert('cmd_speakers', {
    session_id: props.sessionId, delegate_id: d.id, position: ++position, duration_seconds: each,
    elapsed_ms: 0, running_since: null, finished_at: null, yielded_to: null, yielded_from: null,
    list: 'single', motion_id: null,
  }).row.id)
  pushUndo(t('opening.undoStart'), () => ids.forEach((id) => db.remove('cmd_speakers', { id })))
}
function next() {
  const s = current.value
  if (!s) return
  ops.finish(s, t('undo.nextSpeaker', { c: country(s) }))
  emit('log', 'speaker_done', { country: country(s) })
}
function back() {
  const s = previous.value
  if (s) pushUndo(t('undo.previousSpeaker', { c: country(s) }), ops.reopen(s, queue.value))
}
</script>

<template>
  <section class="os rise">
    <div class="os-head">
      <h1>{{ t('opening.title') }}</h1>
      <div class="os-acts">
        <button class="lang" @click="emit('back')">{{ t('roll.back') }}</button>
        <button v-if="rows.length" class="lang" @click="emit('finish')">{{ t('opening.end') }}</button>
      </div>
    </div>

    <div v-if="!rows.length" class="os-setup">
      <p>{{ t('opening.help') }}</p>
      <div class="os-stepper">
        <button :aria-label="t('session.minus15')" @click="bump(-15)"><Minus :size="22" /></button>
        <output aria-live="polite">{{ fmt(seconds * 1000) }}</output>
        <button :aria-label="t('session.plus15')" @click="bump(15)"><Plus :size="22" /></button>
      </div>
      <button class="btn os-go" :disabled="!waiting.length" @click="addWaiting">{{ t('opening.start', { n: waiting.length }) }}</button>
    </div>

    <template v-else>
      <SpeakerStage
        :current="current ? country(current) : null"
        :clock="fmt(remaining)" :total="fmt(duration * 1000)" :total-ms="duration * 1000" :remaining-ms="remaining"
        :running="!!current?.running_since" :next="upcoming.map(country)" :can-previous="!!previous"
        @play="current && ops.toggleTimer(current)" @reset="current && ops.resetTimer(current, t('undo.resetTimer'))"
        @adjust="(s) => current && ops.adjustTime(current, s, t('undo.adjustTime'))"
        @done="next" @previous="back"
      />
      <div class="os-after">
        <button v-if="waiting.length" class="lang" @click="addWaiting">{{ t('opening.addWaiting', { n: waiting.length }) }}</button>
        <button v-if="!current" class="btn" @click="emit('finish')">{{ t('opening.continue') }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.os { margin-top: 18px }
.os-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px }
.os-head h1 { margin: 0 }
.os-acts { display: flex; gap: 8px }
.os-setup { display: grid; justify-items: center; gap: 20px; padding: 36px 20px; text-align: center; border-radius: 22px; background: var(--white); border: 1px solid var(--divider); box-shadow: var(--shadow-sm) }
.os-setup p { margin: 0; color: var(--text-muted) }
.os-stepper { display: flex; align-items: center; gap: 20px }
.os-stepper button { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 50%; border: 1px solid var(--divider); background: var(--white); color: var(--text); cursor: pointer }
.os-stepper output { min-width: 4ch; font-family: var(--font-display); font-weight: 700; font-size: clamp(3.5rem, 9vw, 6rem); line-height: 1; font-variant-numeric: tabular-nums }
.os-go { border-radius: 999px; min-width: 240px }
.os-after { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px }
</style>
