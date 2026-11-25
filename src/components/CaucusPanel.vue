<script setup lang="ts">
import CountryFlag from '@/components/CountryFlag.vue'
import { RotateCcw, Plus, Play, Pause } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/db'
import { pushUndo } from '@/lib/undo'
import { useTimeAlert } from '@/lib/alerts'
import { fmt, left } from '@/lib/time'
import SpeakerBlock from './SpeakerBlock.vue'
import type { Delegate, Motion, Speaker, Status } from '@/lib/types'

const props = defineProps<{
  kind: 'mod' | 'unmod' | 'single'
  sessionId: string
  motions: Motion[]
  delegates: Delegate[]
  attendance: Record<string, Status>
  speakers: Speaker[]
  now: number
  defaultSeconds: number
}>()
const emit = defineEmits<{ log: [kind: string, data: Record<string, unknown>] }>()
const { t } = useI18n()

const form = reactive({ title: '', minutes: props.kind === 'unmod' ? 5 : 10, seconds: props.defaultSeconds })
const manual = computed(() => props.kind === 'mod' || props.kind === 'unmod')

const active = computed(() => props.motions.find((m) => m.kind === props.kind && m.status === 'active') ?? null)
const waiting = computed(() => props.motions.filter((m) => m.kind === props.kind && m.status === 'passed'))
const byId = computed(() => Object.fromEntries(props.delegates.map((d) => [d.id, d])))
// The speaker currently on the clock (moderated caucus only).
const speaking = computed(() =>
  props.kind !== 'mod' || !active.value
    ? null
    : props.speakers
        .filter((s) => s.list === 'mod' && s.motion_id === active.value!.id && !s.finished_at)
        .sort((a, b) => a.position - b.position)[0] ?? null,
)
// Mod: total = allotted - time already used by finished speakers - the live speaker's time so far.
// Unmod: an independent countdown with its own play button.
const totalLeft = computed(() => {
  const m = active.value
  if (!m?.total_seconds) return 0
  if (props.kind === 'mod') {
    const sp = speaking.value
    const spoken = sp ? sp.elapsed_ms + (sp.running_since ? Math.max(0, props.now - new Date(sp.running_since).getTime()) : 0) : 0
    const live = sp ? Math.min(spoken, sp.duration_seconds * 1000) : 0
    return Math.max(0, m.total_seconds * 1000 - m.elapsed_ms - live)
  }
  return left(m.total_seconds * 1000, m.elapsed_ms, m.running_since, props.now)
})
const totalRunning = computed(() => (props.kind === 'mod' ? !!speaking.value?.running_since : !!active.value?.running_since))
useTimeAlert(totalLeft, totalRunning, computed(() => !!active.value && props.kind !== 'single'))

// Extending asks "how many minutes?" in a small dialog.
const dlg = ref<HTMLDialogElement | null>(null)
const extraMinutes = ref(1)
const quick = [1, 2, 5, 10]
function openExtend() {
  extraMinutes.value = 1
  dlg.value?.showModal()
}
function applyExtend() {
  const m = active.value
  const mins = Math.floor(Number(extraMinutes.value))
  if (!m?.total_seconds || !(mins >= 1)) return
  const before = m.total_seconds
  db.update('cmd_motions', { total_seconds: before + mins * 60 }, { id: m.id })
  emit('log', 'caucus_extended', { kind: m.kind, minutes: mins })
  pushUndo(t('undo.extendCaucus', { n: mins }), () => db.update('cmd_motions', { total_seconds: before }, { id: m.id }))
  dlg.value?.close()
}

// Only one motion may be active; starting another ends the current one (undoable).
// The database enforces this too, so each step is saved before the next is sent.
async function endOther() {
  const other = props.motions.find((m) => m.status === 'active')
  if (!other) return async () => {}
  const before = { status: 'active', running_since: other.running_since, elapsed_ms: other.elapsed_ms }
  await db.update('cmd_motions', { status: 'done', running_since: null }, { id: other.id })
  return async () => { await db.update('cmd_motions', before, { id: other.id }) }
}

async function startMotion(m: Motion) {
  const restoreOther = await endOther()
  db.update('cmd_motions', { status: 'active' }, { id: m.id })
  emit('log', 'caucus_started', { kind: m.kind, title: m.title })
  pushUndo(t('undo.startCaucus'), async () => { await db.update('cmd_motions', { status: 'passed' }, { id: m.id }); await restoreOther() })
}

async function createCaucus() {
  const restoreOther = await endOther()
  const { row } = db.insert('cmd_motions', {
    session_id: props.sessionId,
    kind: props.kind,
    title: props.kind === 'mod' ? form.title.trim() || null : null,
    delegate_id: null,
    total_seconds: Math.max(1, form.minutes) * 60,
    speaker_seconds: props.kind === 'mod' ? Math.max(5, form.seconds) : null,
    status: 'active',
    elapsed_ms: 0,
    running_since: null,
    created_at: new Date().toISOString(),
  })
  emit('log', 'caucus_started', { kind: props.kind, title: form.title })
  form.title = ''
  pushUndo(t('undo.startCaucus'), async () => { await db.remove('cmd_motions', { id: row.id }); await restoreOther() })
}

function toggle() {
  const m = active.value
  if (!m) return
  const patch = m.running_since
    ? { elapsed_ms: m.elapsed_ms + (Date.now() - new Date(m.running_since).getTime()), running_since: null }
    : { running_since: new Date().toISOString() }
  db.update('cmd_motions', patch, { id: m.id })
}
function reset() {
  const m = active.value
  if (!m) return
  const before = { elapsed_ms: m.elapsed_ms, running_since: m.running_since }
  db.update('cmd_motions', { elapsed_ms: 0, running_since: null }, { id: m.id })
  pushUndo(t('undo.resetTimer'), () => db.update('cmd_motions', before, { id: m.id }))
}
function end() {
  const m = active.value
  if (!m) return
  const before = { status: 'active', running_since: m.running_since, elapsed_ms: m.elapsed_ms }
  db.update('cmd_motions', { status: 'done', running_since: null }, { id: m.id })
  emit('log', 'caucus_ended', { kind: m.kind, title: m.title })
  pushUndo(t('undo.endCaucus'), () => db.update('cmd_motions', before, { id: m.id }))
}
</script>

<template>
  <section>
    <div v-if="!active" class="c-card">
      <h2>{{ t('modes.title.' + kind) }}</h2>
      <form v-if="manual" class="c-form create" @submit.prevent="createCaucus">
        <label v-if="kind === 'mod'">{{ t('modes.topic') }}<input v-model="form.title" /></label>
        <div class="c-two">
          <label>{{ t('modes.minutes') }}<input v-model.number="form.minutes" type="number" min="1" max="600" required /></label>
          <label v-if="kind === 'mod'">{{ t('modes.speakerSeconds') }}<input v-model.number="form.seconds" type="number" min="5" max="600" required /></label>
        </div>
        <button class="btn">{{ t('modes.startCaucus') }}</button>
      </form>
      <p v-else class="muted">{{ t('modes.noActive') }}</p>
      <h3 v-if="manual && waiting.length">{{ t('modes.waiting') }}</h3>
      <ul v-if="waiting.length" class="c-rows">
        <li v-for="m in waiting" :key="m.id">
          <span>
            <strong>{{ m.title || t('modes.title.' + kind) }}</strong>
            <small class="muted" v-if="m.delegate_id"> · <CountryFlag :name="byId[m.delegate_id]?.country" />{{ byId[m.delegate_id]?.country }}</small>
          </span>
          <button class="btn small" @click="startMotion(m)">{{ t('modes.start') }}</button>
        </li>
      </ul>
    </div>

    <template v-else>
      <div class="head" :class="{ up: totalLeft === 0 && kind !== 'single' }">
        <div class="ttl">
          <span class="c-label">{{ t('modes.title.' + kind) }}</span>
          <h2>{{ active.title || t('modes.title.' + kind) }}</h2>
          <small v-if="active.delegate_id" class="muted">{{ t('modes.proposedBy', { c: byId[active.delegate_id]?.country }) }}</small>
        </div>
        <div v-if="kind === 'mod'" class="pill" role="timer">
          <span class="c-label">{{ t('modes.caucusTime') }}</span>
          <b>{{ fmt(totalLeft) }}</b>
          <span class="mini">
            <button :aria-label="t('session.reset')" @click="reset"><RotateCcw :size="18" /></button>
            <button :aria-label="t('modes.extend')" :title="t('modes.extend')" @click="openExtend"><Plus :size="18" /></button>
          </span>
        </div>
        <button class="lang end" @click="end">{{ t('modes.end') }}</button>
      </div>

      <div v-if="kind === 'unmod'" class="c-card" :class="{ up: totalLeft === 0 }" style="margin-top: 14px">
        <div class="c-clock big" role="timer">{{ fmt(totalLeft) }} <span>/ {{ fmt((active.total_seconds ?? 0) * 1000) }}</span></div>
        <!-- Starts full and drains; the clock above says the same in text. -->
        <div class="um-bar" :class="{ low: totalLeft <= 10000 }" aria-hidden="true">
          <i :style="{ transform: `scaleX(${Math.min(1, totalLeft / ((active.total_seconds || 1) * 1000))})` }" />
        </div>
        <div class="c-ctrl">
          <button :aria-label="t('session.reset')" @click="reset"><RotateCcw :size="18" /></button>
          <button class="go" :aria-label="t('session.playPause')" @click="toggle"><Pause v-if="active.running_since" :size="18" fill="currentColor" /><Play v-else :size="18" fill="currentColor" /></button>
          <button :aria-label="t('modes.extend')" :title="t('modes.extend')" @click="openExtend"><Plus :size="18" /></button>
        </div>
      </div>

      <div v-if="kind !== 'unmod'">
        <SpeakerBlock
          :key="active.id" :session-id="sessionId" :motion-id="active.id" :list="kind" :delegates="delegates" :attendance="attendance"
          :speakers="speakers" :now="now" :seconds="active.speaker_seconds ?? defaultSeconds" :motion-elapsed="active.elapsed_ms"
          @log="(k, d) => emit('log', k, d)"
        />
      </div>
    </template>

    <dialog ref="dlg" class="dlg" @click.self="dlg?.close()">
      <form method="dialog" class="dlgbox" @submit.prevent="applyExtend">
        <h2>{{ t('modes.extendTitle') }}</h2>
        <p class="muted">{{ t('modes.extendHelp') }}</p>
        <div class="qk">
          <button v-for="q in quick" :key="q" type="button" :class="{ on: extraMinutes === q }" @click="extraMinutes = q">{{ q }}</button>
        </div>
        <label>{{ t('modes.minutes') }}
          <input v-model.number="extraMinutes" type="number" min="1" max="600" required />
        </label>
        <div class="dact">
          <button type="button" class="lang" @click="dlg?.close()">{{ t('modes.cancel') }}</button>
          <button class="btn small">{{ t('modes.extendDo', { n: extraMinutes || 0 }) }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.um-bar { height: 16px; max-width: 760px; margin: 0 auto 18px; border-radius: 999px; background: var(--cream-deep); overflow: hidden }
.um-bar i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform .25s linear }
.um-bar.low i { background: var(--danger) }
.head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 8px }
.ttl { flex: 1; min-width: 240px }
.ttl h2 { margin: 2px 0 0; font-family: var(--font-display); font-size: clamp(1.3rem, 2.4vw, 1.9rem); line-height: 1.15 }
.pill { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; background: var(--white); border: 1px solid var(--divider); border-radius: 999px; box-shadow: var(--shadow-sm) }
.pill b { font-family: var(--font-display); font-size: 1.9rem; font-variant-numeric: tabular-nums }
.head.up .pill b { color: var(--danger) }
.mini { display: flex; gap: 4px }
.mini button { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--cream-deep); cursor: pointer; font-size: 14px }
.mini button { width: auto; min-width: 36px; padding: 0 10px; border-radius: 18px; font-weight: 700 }
.dlg { border: 0; border-radius: 20px; padding: 0; box-shadow: var(--shadow-lg); width: min(380px, calc(100% - 32px)) }
.dlg::backdrop { background: rgb(28 25 23 / .45) }
.dlgbox { padding: 24px; display: grid; gap: 14px; max-width: none }
.dlgbox h2 { margin: 0 }
.qk { display: flex; gap: 8px }
.qk button { flex: 1; height: 40px; border-radius: 10px; border: 1px solid var(--divider); background: var(--white); font: inherit; font-weight: 700; cursor: pointer }
.qk button.on { background: var(--accent); color: #fff; border-color: var(--accent) }
.dact { display: flex; justify-content: flex-end; gap: 8px }
</style>
