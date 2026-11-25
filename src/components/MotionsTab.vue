<script setup lang="ts">
import CountryFlag from '@/components/CountryFlag.vue'
import { X } from 'lucide-vue-next'
import { computed, reactive } from 'vue'
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
const hasActive = computed(() => props.motions.some((m) => m.status === 'active'))
const showTitle = computed(() => form.kind === 'mod' || form.kind === 'other')
const showMinutes = computed(() => form.kind === 'mod' || form.kind === 'unmod' || form.kind === 'suspend')
const showSeconds = computed(() => form.kind === 'mod' || form.kind === 'single')

function describe(m: Motion) {
  const parts: string[] = []
  if (m.total_seconds) parts.push(`${Math.round(m.total_seconds / 60)} min`)
  if (m.speaker_seconds) parts.push(`${m.speaker_seconds} s`)
  return parts.join(' · ')
}

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
  pushUndo(t('undo.proposeMotion'), () => db.remove('cmd_motions', { id: row.id }))
}

function decide(m: Motion, pass: boolean) {
  let status: Motion['status'] = pass ? 'passed' : 'failed'
  if (pass && CAUCUS.includes(m.kind) && !hasActive.value) status = 'active'
  db.update('cmd_motions', { status }, { id: m.id })
  emit('log', pass ? 'motion_passed' : 'motion_failed', { kind: m.kind, title: m.title })
  pushUndo(t(pass ? 'undo.passMotion' : 'undo.failMotion'), () => db.update('cmd_motions', { status: 'pending' }, { id: m.id }))
  if (status === 'active') emit('goto', m.kind)
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
      <form class="c-form" @submit.prevent="propose">
        <label>{{ t('modes.type') }}
          <select v-model="form.kind">
            <option v-for="k in KINDS" :key="k" :value="k">{{ t('modes.kind.' + k) }}</option>
          </select>
        </label>
        <label>{{ t('modes.proposer') }}
          <select v-model="form.delegate">
            <option value="">—</option>
            <option v-for="d in here" :key="d.id" :value="d.id">{{ d.country }}</option>
          </select>
        </label>
        <label v-if="showTitle">{{ t('modes.topic') }}<input v-model="form.title" /></label>
        <div class="c-two">
          <label v-if="showMinutes">{{ t('modes.minutes') }}<input v-model.number="form.minutes" type="number" min="1" max="600" /></label>
          <label v-if="showSeconds">{{ t('modes.speakerSeconds') }}<input v-model.number="form.seconds" type="number" min="5" max="600" /></label>
        </div>
        <button class="btn">{{ t('modes.propose') }}</button>
      </form>
    </div>

    <div class="c-card">
      <h2>{{ t('modes.onTheFloor') }}</h2>
      <p v-if="!pending.length" class="muted">{{ t('modes.noMotions') }}</p>
      <ul class="c-rows">
        <li v-for="m in pending" :key="m.id" class="motion">
          <div>
            <strong>{{ t('modes.kind.' + m.kind) }}</strong>
            <span v-if="m.title"> — {{ m.title }}</span>
            <small class="muted">
              <template v-if="m.delegate_id"> · <CountryFlag :name="byId[m.delegate_id]?.country" />{{ byId[m.delegate_id]?.country }}</template>
              <template v-if="describe(m)"> · {{ describe(m) }}</template>
            </small>
          </div>
          <div class="c-acts">
            <button class="lang ok" @click="decide(m, true)">{{ t('modes.pass') }}</button>
            <button class="lang no" @click="decide(m, false)">{{ t('modes.fail') }}</button>
            <button class="lang" @click="openVote(m)">{{ t('modes.vote') }}</button>
            <button class="c-x" :aria-label="t('session.remove')" @click="remove(m)"><X :size="16" /></button>
          </div>
        </li>
      </ul>

      <template v-if="history.length">
        <h3>{{ t('modes.history') }}</h3>
        <ul class="c-rows soft">
          <li v-for="m in history" :key="m.id">
            <span>{{ t('modes.kind.' + m.kind) }}<span v-if="m.title"> — {{ m.title }}</span></span>
            <span class="tag" :class="m.status">{{ t('modes.status.' + m.status) }}</span>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
