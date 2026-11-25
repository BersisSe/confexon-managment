<script setup lang="ts">
import CountryFlag from '@/components/CountryFlag.vue'
import CountryPicker from '@/components/CountryPicker.vue'
import NumberStepper from '@/components/NumberStepper.vue'
import { Ban, Check, Coffee, DoorClosed, FileText, Mic, Pause, Users, Vote as VoteIcon, X } from 'lucide-vue-next'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/db'
import { pushUndo } from '@/lib/undo'
import type { Delegate, Motion, MotionKind, Status } from '@/lib/types'

const props = defineProps<{
  sessionId: string
  motions: Motion[]
  delegates: Delegate[]
  attendance: Record<string, Status>
  defaultSeconds: number
}>()
const emit = defineEmits<{ log: [kind: string, data: Record<string, unknown>]; goto: [tab: string] }>()
const { t } = useI18n()

const KINDS: MotionKind[] = ['mod', 'unmod', 'single', 'close_debate', 'suspend', 'adjourn', 'other']
const CAUCUS = ['mod', 'unmod', 'single']
const form = reactive({ kind: 'mod' as MotionKind, delegate: '', title: '', minutes: 10, seconds: 60 })

const byId = computed(() => Object.fromEntries(props.delegates.map((d) => [d.id, d])))
const here = computed(() => props.delegates.filter((d) => props.attendance[d.id] && props.attendance[d.id] !== 'absent'))
const pending = computed(() => props.motions.filter((m) => m.status === 'pending'))
const history = computed(() => props.motions.filter((m) => m.status !== 'pending').slice(-8).reverse())
const showTitle = computed(() => form.kind === 'mod' || form.kind === 'other')
const showMinutes = computed(() => form.kind === 'mod' || form.kind === 'unmod' || form.kind === 'suspend')
const showSeconds = computed(() => form.kind === 'mod' || form.kind === 'single')

function describe(m: Motion) {
  const parts: string[] = []
  if (m.total_seconds) parts.push(t('modes.mins', { n: Math.round(m.total_seconds / 60) }))
  if (m.speaker_seconds) parts.push(t('modes.secs', { n: m.speaker_seconds }))
  return parts
}
const ICONS: Partial<Record<MotionKind, typeof Users>> = { mod: Users, unmod: Coffee, single: Mic, close_debate: Ban, suspend: Pause, adjourn: DoorClosed }
const icon = (k: MotionKind) => ICONS[k] ?? FileText

// After a country is chosen, move on to the next field.
const topicInput = ref<HTMLInputElement | null>(null)
const addButton = ref<HTMLButtonElement | null>(null)
watch(() => form.delegate, async (id) => {
  if (!id) return
  await nextTick()
  const next = topicInput.value ?? addButton.value
  next?.focus({ preventScroll: true })
  next?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

function propose() {
  const { row } = db.insert('cmd_motions', {
    session_id: props.sessionId,
    kind: form.kind,
    title: form.title.trim() || null,
    delegate_id: form.delegate || null,
    total_seconds: showMinutes.value ? Math.max(1, form.minutes) * 60 : null,
    speaker_seconds: showSeconds.value ? Math.max(5, form.seconds) : null,
    status: 'pending',
    elapsed_ms: 0,
    running_since: null,
    created_at: new Date().toISOString(),
  })
  emit('log', 'motion_proposed', { kind: form.kind, title: form.title, country: byId.value[form.delegate]?.country ?? '' })
  form.title = ''
  form.delegate = ''
  pushUndo(t('undo.proposeMotion'), () => db.remove('cmd_motions', { id: row.id }))
}

// A passed caucus starts right away (ending the one that was running) and opens its screen.
// The database allows one active motion per session, so the old one must be saved as
// done before the new one is sent.
let deciding = false
async function decide(m: Motion, pass: boolean) {
  if (deciding) return
  deciding = true
  try {
    const start = pass && CAUCUS.includes(m.kind)
    const other = start ? props.motions.find((x) => x.status === 'active') : undefined
    const before = other && { status: 'active', running_since: other.running_since, elapsed_ms: other.elapsed_ms }
    if (other) await db.update('cmd_motions', { status: 'done', running_since: null }, { id: other.id })
    db.update('cmd_motions', { status: start ? 'active' : pass ? 'passed' : 'failed' }, { id: m.id })
    emit('log', pass ? 'motion_passed' : 'motion_failed', { kind: m.kind, title: m.title })
    pushUndo(t(pass ? 'undo.passMotion' : 'undo.failMotion'), async () => {
      await db.update('cmd_motions', { status: 'pending' }, { id: m.id })
      if (other && before) await db.update('cmd_motions', before, { id: other.id })
    })
    if (start) emit('goto', m.kind)
  } finally {
    deciding = false
  }
}

function openVote(m: Motion) {
  const title = `${t('modes.kind.' + m.kind)}${m.title ? ': ' + m.title : ''}`
  const { row } = db.insert('cmd_votes', {
    session_id: props.sessionId, motion_id: m.id, title, majority: 'simple', status: 'open', result: null,
    created_at: new Date().toISOString(),
  })
  pushUndo(t('undo.openVote'), () => db.remove('cmd_votes', { id: row.id }))
  emit('goto', 'vote')
}

function remove(m: Motion) {
  const copy = { ...m }
  db.remove('cmd_motions', { id: m.id })
  pushUndo(t('undo.removeMotion'), () => db.insert('cmd_motions', copy))
}
</script>

<template>
  <section class="c-grid">
    <div class="c-card">
      <h2>{{ t('modes.newMotion') }}</h2>
      <form class="c-form nm" @submit.prevent="propose">
        <div class="nm-kinds" role="group" :aria-label="t('modes.type')">
          <button v-for="k in KINDS" :key="k" type="button" :class="{ on: form.kind === k }" :aria-pressed="form.kind === k" @click="form.kind = k">
            <component :is="icon(k)" :size="20" aria-hidden="true" />{{ t('modes.kind.' + k) }}
          </button>
        </div>

        <div class="nm-block">
          <span class="nm-title">{{ t('modes.proposer') }}</span>
          <CountryPicker v-model="form.delegate" :delegates="here" />
        </div>

        <label v-if="showTitle">{{ t('modes.topic') }}<input ref="topicInput" v-model="form.title" /></label>
        <div v-if="showMinutes || showSeconds" class="nm-times">
          <NumberStepper v-if="showMinutes" v-model="form.minutes" :label="t('modes.totalTime')" :hint="t('modes.totalHint')" :unit="t('modes.unitMin')" :min="1" :max="600" :step="1" :presets="[5, 10, 15, 20]" />
          <NumberStepper v-if="showSeconds" v-model="form.seconds" :label="t('modes.eachTime')" :hint="t('modes.eachHint')" :unit="t('modes.unitSec')" :min="5" :max="600" :step="5" :presets="[30, 45, 60, 90]" />
        </div>
        <button ref="addButton" class="btn nm-add">{{ t('modes.propose') }}</button>
      </form>
    </div>

    <div class="c-card">
      <h2 class="m-head">{{ t('modes.onTheFloor') }}<span v-if="pending.length" class="m-count">{{ pending.length }}</span></h2>
      <p v-if="!pending.length" class="m-empty">{{ t('modes.noMotions') }}</p>
      <TransitionGroup v-else tag="ul" name="mo" class="m-list">
        <li v-for="m in pending" :key="m.id" class="m-item">
          <div class="m-top">
            <span class="m-icon" aria-hidden="true"><component :is="icon(m.kind)" :size="22" /></span>
            <div class="m-text">
              <small v-if="m.title" class="m-kind">{{ t('modes.kind.' + m.kind) }}</small>
              <strong>{{ m.title || t('modes.kind.' + m.kind) }}</strong>
            </div>
            <button class="m-remove" :aria-label="t('session.remove')" :title="t('session.remove')" @click="remove(m)"><X :size="18" /></button>
          </div>
          <div v-if="m.delegate_id || describe(m).length" class="m-chips">
            <span v-if="m.delegate_id"><CountryFlag :name="byId[m.delegate_id]?.country" />{{ byId[m.delegate_id]?.country }}</span>
            <span v-for="part in describe(m)" :key="part">{{ part }}</span>
          </div>
          <div class="m-acts">
            <button class="yes" @click="decide(m, true)"><Check :size="18" />{{ t('modes.pass') }}</button>
            <button class="no" @click="decide(m, false)"><X :size="18" />{{ t('modes.fail') }}</button>
            <button @click="openVote(m)"><VoteIcon :size="18" />{{ t('modes.vote') }}</button>
          </div>
        </li>
      </TransitionGroup>

      <template v-if="history.length">
        <h3>{{ t('modes.history') }}</h3>
        <ul class="m-past">
          <li v-for="m in history" :key="m.id">
            <span class="m-icon small" aria-hidden="true"><component :is="icon(m.kind)" :size="16" /></span>
            <div class="m-text">
              <span>{{ m.title || t('modes.kind.' + m.kind) }}</span>
              <small>{{ [...(m.title ? [t('modes.kind.' + m.kind)] : []), ...(m.delegate_id ? [byId[m.delegate_id]?.country] : []), ...describe(m)].join(' · ') }}</small>
            </div>
            <span class="m-status" :class="m.status">{{ t('modes.status.' + m.status) }}</span>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.nm { gap: 18px }
.nm-kinds { display: flex; flex-wrap: wrap; gap: 8px }
.nm-kinds button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer }
.nm-kinds button:hover { background: var(--cream-deep) }
.nm-kinds button.on { background: var(--accent); border-color: var(--accent); color: #fff }
.nm-block { display: grid; gap: 8px; min-width: 0 }
.nm-title { font-weight: 600 }
.nm-times { display: grid; gap: 14px }
.nm-add { border-radius: 999px }
.m-head { display: flex; align-items: center; gap: 10px }
.m-count { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 8px; border-radius: 999px; background: var(--accent); color: #fff; font-family: var(--font-body); font-size: 13px }
.m-empty { margin: 8px 0 0; padding: 22px; text-align: center; border: 1px dashed var(--divider); border-radius: var(--radius); color: var(--text-tertiary) }
.m-list, .m-past { list-style: none; padding: 0; margin: 10px 0 0; display: grid }
.m-list { gap: 12px }
.m-item { display: grid; gap: 14px; padding: 16px; border-radius: 18px; background: var(--cream); border: 1px solid var(--divider); border-left: 4px solid var(--accent) }
.mo-enter-active, .mo-leave-active, .mo-move { transition: opacity .2s ease, transform .22s var(--ease-out) }
.mo-enter-from, .mo-leave-to { opacity: 0; transform: translateY(-8px) scale(.97) }
.m-top { display: flex; align-items: center; gap: 12px }
.m-icon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft); color: var(--accent-dark) }
.m-icon.small { width: 32px; height: 32px; border-radius: 10px; background: var(--cream-deep); color: var(--text-muted) }
.m-text { flex: 1; min-width: 0; display: grid; overflow-wrap: anywhere }
.m-text strong { font-family: var(--font-display); font-size: 1.25rem; line-height: 1.2 }
.m-text small { font-size: 12px; color: var(--text-tertiary) }
.m-text .m-kind { font-weight: 700; text-transform: uppercase; letter-spacing: .05em }
.m-remove { flex: none; align-self: flex-start; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 999px; background: none; color: var(--text-tertiary); cursor: pointer }
.m-remove:hover { background: var(--danger-soft); color: var(--danger) }
.m-chips { display: flex; flex-wrap: wrap; gap: 6px }
.m-chips span { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px; background: var(--white); border: 1px solid var(--divider); font-size: 13px; font-weight: 600; color: var(--text-muted) }
.m-acts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
.m-acts button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 46px; border-radius: 999px; border: 1px solid var(--divider); background: var(--white); color: var(--text); font: inherit; font-weight: 700; cursor: pointer }
.m-acts button:hover { filter: brightness(1.12) }
.m-acts .yes { background: var(--success-soft); color: var(--success-text); border-color: var(--success-line) }
.m-acts .no { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-line) }
.m-past li { display: flex; align-items: center; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--divider) }
.m-past li:last-child { border-bottom: 0 }
.m-past .m-text span { font-weight: 600 }
.m-status { flex: none; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--cream-deep); color: var(--text-muted) }
.m-status.passed { background: var(--success-soft); color: var(--success-text) }
.m-status.failed { background: var(--danger-soft); color: var(--danger) }
.m-status.active { background: var(--accent-soft); color: var(--accent-dark) }
</style>
