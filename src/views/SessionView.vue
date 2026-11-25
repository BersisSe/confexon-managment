<script setup lang="ts">
import CountryFlag from '@/components/CountryFlag.vue'
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Undo2, Bell, BellOff, Minus, Plus, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { db, flush, onLocal, online, pending, syncing, type Op } from '@/lib/db'
import { canUndo, clearUndo, lastLabel, pushUndo, undoLast } from '@/lib/undo'
import { soundOn, toggleSound } from '@/lib/alerts'
import * as ops from '@/lib/speakerOps'
import { fmt, left } from '@/lib/time'
import MotionsTab from '@/components/MotionsTab.vue'
import CaucusPanel from '@/components/CaucusPanel.vue'
import VoteTab from '@/components/VoteTab.vue'
import SpeakerStage from '@/components/SpeakerStage.vue'
import type { Ballot, Delegate, Motion, Speaker, Status, Vote } from '@/lib/types'

interface Sess { id: string; title: string; agenda: string | null; speaker_seconds: number; status: string }

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()
const committeeId = route.params.id as string

const committeeName = ref('')
const delegates = ref<Delegate[]>([])
const session = ref<Sess | null>(null)
const attendance = ref<Record<string, Status>>({})
const speakers = ref<Speaker[]>([])
const motions = ref<Motion[]>([])
const votes = ref<Vote[]>([])
const ballots = ref<Ballot[]>([])
const manage = ref(false)
const full = ref(!!document.fullscreenElement)
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.()
}
const onFull = () => (full.value = !!document.fullscreenElement)
const tab = ref<'gsl' | 'motions' | 'mod' | 'unmod' | 'single' | 'vote'>('gsl')
const loading = ref(true)
const error = ref('')
const panel = ref<'' | 'roll' | 'agenda' | 'yield'>('')
const search = ref('')
const agendaDraft = ref('')
const secondsDraft = ref(90)
const settingsOpen = ref(false)
const applyCurrent = ref(true)
const secInput = ref<HTMLInputElement | null>(null)
const presets = [30, 45, 60, 90, 120]
const now = ref(Date.now())
const rt = ref('')
let tick: ReturnType<typeof setInterval>
let channel: ReturnType<typeof supabase.channel> | null = null
let offLocal: (() => void) | null = null

const byId = computed(() => Object.fromEntries(delegates.value.map((d) => [d.id, d])))
const country = (id: string | null | undefined) => (id ? byId.value[id]?.country ?? '—' : '')
const counts = computed(() => {
  const v = Object.values(attendance.value)
  return {
    present: v.filter((s) => s === 'present').length,
    voting: v.filter((s) => s === 'present_voting').length,
    absent: delegates.value.length - v.filter((s) => s !== 'absent').length,
  }
})
const rolled = computed(() => Object.keys(attendance.value).length > 0)
const queue = computed(() => speakers.value.filter((s) => s.list === 'gsl' && !s.finished_at).sort((a, b) => a.position - b.position))
const current = computed(() => queue.value[0] ?? null)
const upcoming = computed(() => queue.value.slice(1))
const addable = computed(() => {
  const q = search.value.trim().toLowerCase()
  return delegates.value.filter(
    (d) => attendance.value[d.id] && attendance.value[d.id] !== 'absent' && d.country.toLowerCase().includes(q),
  )
})
const yieldTargets = computed(() =>
  delegates.value.filter((d) => attendance.value[d.id] && attendance.value[d.id] !== 'absent' && d.id !== current.value?.delegate_id),
)

const speakSeconds = computed(() => session.value?.speaker_seconds ?? 90)
const remainingNum = computed(() =>
  current.value
    ? left(current.value.duration_seconds * 1000, current.value.elapsed_ms, current.value.running_since, now.value)
    : speakSeconds.value * 1000,
)
const totalFmt = computed(() => fmt((current.value?.duration_seconds ?? speakSeconds.value) * 1000))

// ---- connection state (weak wifi) ----
const netState = computed<'ok' | 'offline' | 'reconnecting' | 'syncing'>(() => {
  if (!online.value) return 'offline'
  if (pending.value.length) return 'syncing'
  if (rt.value && rt.value !== 'SUBSCRIBED') return 'reconnecting'
  return 'ok'
})

// ---- optimistic local state ----
type Row = Record<string, unknown>
const hit = (r: Row, m?: Record<string, unknown>) => !m || Object.entries(m).every(([k, v]) => r[k] === v)
function applyArr<T extends Row>(list: Ref<T[]>, op: Op, key: string[] = ['id']) {
  const rows = (Array.isArray(op.payload) ? op.payload : [op.payload]) as T[]
  if (op.kind === 'insert') list.value = [...list.value.filter((r) => !rows.some((n) => n.id === r.id)), ...rows]
  else if (op.kind === 'upsert') {
    const next = [...list.value]
    for (const row of rows) {
      const i = next.findIndex((r) => key.every((k) => r[k] === row[k]))
      if (i >= 0) next[i] = { ...next[i], ...row }
      else next.push(row)
    }
    list.value = next
  } else if (op.kind === 'update') list.value = list.value.map((r) => (hit(r, op.match) ? { ...r, ...(op.payload as Row) } : r))
  else list.value = list.value.filter((r) => !hit(r, op.match))
}
function applyLocal(op: Op) {
  if (!session.value) return
  switch (op.table) {
    case 'cmd_speakers': return applyArr(speakers as Ref<Row[]>, op)
    case 'cmd_motions': return applyArr(motions as Ref<Row[]>, op)
    case 'cmd_votes': return applyArr(votes as Ref<Row[]>, op)
    case 'cmd_ballots': return applyArr(ballots as Ref<Row[]>, op, ['vote_id', 'delegate_id'])
    case 'cmd_attendance': {
      const next = { ...attendance.value }
      if (op.kind === 'delete') delete next[op.match?.delegate_id as string]
      else for (const r of (Array.isArray(op.payload) ? op.payload : [op.payload]) as Row[]) next[r.delegate_id as string] = r.status as Status
      attendance.value = next
      return
    }
    case 'cmd_sessions':
      if (op.kind === 'update' && op.match?.id === session.value.id) session.value = { ...session.value, ...(op.payload as Partial<Sess>) }
  }
}

function log(kind: string, data: Record<string, unknown> = {}) {
  if (!session.value) return
  db.insert('cmd_log', { session_id: session.value.id, actor_id: auth.session?.user.id, kind, data })
}

async function loadSession() {
  const { data } = await supabase
    .from('cmd_sessions').select('id, title, agenda, speaker_seconds, status')
    .eq('committee_id', committeeId).eq('status', 'open').order('started_at', { ascending: false }).limit(1)
  session.value = data?.[0] ?? null
  if (!session.value) return
  agendaDraft.value = session.value.agenda ?? ''
  secondsDraft.value = session.value.speaker_seconds
  await refreshAll()
  for (const op of pending.value) applyLocal(op) // changes made offline that have not synced yet
  subscribe()
  flush()
}

function subscribe() {
  if (channel || !session.value) return
  const sid = session.value.id
  const f = (table: string, col = 'session_id') => ({ event: '*', schema: 'public', table, filter: `${col}=eq.${sid}` }) as const
  const reload = () => { if (!pending.value.length) refreshAll() }
  channel = supabase.channel(`cmd-${sid}`)
    .on('postgres_changes', f('cmd_attendance'), reload)
    .on('postgres_changes', f('cmd_speakers'), reload)
    .on('postgres_changes', f('cmd_sessions', 'id'), reload)
    .on('postgres_changes', f('cmd_motions'), reload)
    .on('postgres_changes', f('cmd_votes'), reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_ballots' }, reload)
    .subscribe((status) => { rt.value = status })
}

async function refreshAll() {
  const sid = session.value?.id
  if (!sid) return
  const [a, s, m, v, sess] = await Promise.all([
    supabase.from('cmd_attendance').select('delegate_id, status').eq('session_id', sid),
    supabase.from('cmd_speakers').select('*').eq('session_id', sid),
    supabase.from('cmd_motions').select('*').eq('session_id', sid).order('created_at'),
    supabase.from('cmd_votes').select('*').eq('session_id', sid).order('created_at'),
    supabase.from('cmd_sessions').select('id, title, agenda, speaker_seconds, status').eq('id', sid).single(),
  ])
  if (a.error || s.error || m.error || v.error) return // offline: keep what we have
  attendance.value = Object.fromEntries((a.data ?? []).map((r) => [r.delegate_id, r.status as Status]))
  speakers.value = (s.data ?? []) as Speaker[]
  motions.value = (m.data ?? []) as Motion[]
  votes.value = (v.data ?? []) as Vote[]
  const ids = votes.value.map((x) => x.id)
  ballots.value = ids.length ? (((await supabase.from('cmd_ballots').select('*').in('vote_id', ids)).data ?? []) as Ballot[]) : []
  if (sess.data) session.value = sess.data
}

// Reconcile with the server once the outbox has drained or the socket is back.
watch(() => pending.value.length, (n, o) => { if (o > 0 && n === 0) refreshAll() })
watch(rt, (s, o) => { if (s === 'SUBSCRIBED' && o) { flush(); refreshAll() } })

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast() }
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFull)
  document.addEventListener('keydown', onKey)
  tick = setInterval(() => (now.value = Date.now()), 250)
  offLocal = onLocal(applyLocal)
  const [c, d] = await Promise.all([
    supabase.from('cmd_committees').select('name').eq('id', committeeId).single(),
    supabase.from('cmd_delegates').select('id, display_name, country').eq('committee_id', committeeId).order('country'),
  ])
  committeeName.value = c.data?.name ?? ''
  delegates.value = d.data ?? []
  await loadSession()
  loading.value = false
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFull)
  document.removeEventListener('keydown', onKey)
  clearInterval(tick)
  offLocal?.()
  clearUndo()
  if (channel) supabase.removeChannel(channel)
})

async function start() {
  const { data, error: e } = await supabase.from('cmd_sessions')
    .insert({ committee_id: committeeId, title: committeeName.value })
    .select('id, title, agenda, speaker_seconds, status').single()
  if (e) { error.value = t('session.needOnline'); return }
  error.value = ''
  session.value = data
  secondsDraft.value = data.speaker_seconds
  subscribe()
  log('session_started')
}

function setStatus(d: Delegate, status: Status) {
  const prev = attendance.value[d.id]
  const key = { session_id: session.value!.id, delegate_id: d.id }
  db.upsert('cmd_attendance', { ...key, status, updated_at: new Date().toISOString() }, 'session_id,delegate_id')
  log('roll_call', { country: d.country, status })
  pushUndo(t('undo.rollCall', { c: d.country }), () =>
    prev ? db.upsert('cmd_attendance', { ...key, status: prev, updated_at: new Date().toISOString() }, 'session_id,delegate_id') : db.remove('cmd_attendance', { delegate_id: d.id, session_id: key.session_id }),
  )
}
function markAll(status: Status) {
  const sid = session.value!.id
  const before = { ...attendance.value }
  db.upsert('cmd_attendance', delegates.value.map((d) => ({ session_id: sid, delegate_id: d.id, status })), 'session_id,delegate_id')
  log('roll_call_all', { status })
  pushUndo(t('undo.rollCallAll'), () => {
    for (const d of delegates.value) {
      if (before[d.id]) db.upsert('cmd_attendance', { session_id: sid, delegate_id: d.id, status: before[d.id] }, 'session_id,delegate_id')
      else db.remove('cmd_attendance', { delegate_id: d.id, session_id: sid })
    }
  })
}

function endSession() {
  if (!confirm(t('session.endConfirm'))) return
  const sid = session.value!.id
  log('session_ended')
  db.update('cmd_sessions', { status: 'closed', ended_at: new Date().toISOString() }, { id: sid })
  if (channel) { supabase.removeChannel(channel); channel = null }
  session.value = null
  attendance.value = {}
  speakers.value = []
  clearUndo()
}

function saveAgenda() {
  const prev = session.value!.agenda
  const next = agendaDraft.value.trim() || null
  db.update('cmd_sessions', { agenda: next }, { id: session.value!.id })
  log('agenda', { agenda: next })
  pushUndo(t('undo.agenda'), () => db.update('cmd_sessions', { agenda: prev }, { id: session.value!.id }))
  panel.value = ''
}
const clampSeconds = (n: number) => Math.min(3600, Math.max(5, Math.round(Number(n)) || 90))
function bump(delta: number) {
  secondsDraft.value = clampSeconds((Number(secondsDraft.value) || 0) + delta)
}
// Opening the popover starts from the saved value and focuses the field.
watch(settingsOpen, async (open) => {
  if (!open) return
  secondsDraft.value = speakSeconds.value
  applyCurrent.value = true
  await nextTick()
  secInput.value?.select()
})
function saveSeconds() {
  const sid = session.value!.id
  const prev = session.value!.speaker_seconds
  const s = clampSeconds(secondsDraft.value)
  db.update('cmd_sessions', { speaker_seconds: s }, { id: sid })
  let undoCurrent = () => {}
  const c = current.value
  if (applyCurrent.value && c) {
    const before = c.duration_seconds
    db.update('cmd_speakers', { duration_seconds: s }, { id: c.id })
    undoCurrent = () => db.update('cmd_speakers', { duration_seconds: before }, { id: c.id })
  }
  pushUndo(t('undo.speakingTime'), () => { db.update('cmd_sessions', { speaker_seconds: prev }, { id: sid }); undoCurrent() })
  settingsOpen.value = false
}

function addSpeaker(d: Delegate) {
  ops.addSpeaker(session.value!.id, d.id, speakSeconds.value, speakers.value, t('undo.addSpeaker', { c: d.country }))
  log('speaker_added', { country: d.country })
}
function nextSpeaker() {
  const s = current.value
  if (!s) return
  ops.finish(s, t('undo.nextSpeaker', { c: country(s.delegate_id) }))
  log('speaker_done', { country: country(s.delegate_id) })
}
function yieldChair() {
  if (!current.value) return
  ops.yieldToChair(current.value, t('undo.yield'))
  log('yield', { to: 'chair', country: country(current.value.delegate_id) })
  panel.value = ''
}
function yieldQuestions() {
  if (!current.value) return
  ops.yieldToQuestions(current.value, t('undo.yield'))
  log('yield', { to: 'questions', country: country(current.value.delegate_id) })
  panel.value = ''
}
function yieldDelegate(d: Delegate) {
  const s = current.value
  if (!s) return
  ops.yieldToDelegate(s, d.id, remainingNum.value, queue.value, t('undo.yield'))
  log('yield', { to: d.country, country: country(s.delegate_id) })
  panel.value = ''
}

const statuses: Status[] = ['present', 'present_voting', 'absent']
const tabs = ['gsl', 'motions', 'mod', 'unmod', 'single', 'vote'] as const
type Tab = (typeof tabs)[number]
const goto = (x: string) => { if ((tabs as readonly string[]).includes(x)) tab.value = x as Tab }
</script>

<template>
  <section class="console">
    <div class="strip">
      <RouterLink :to="{ name: 'roster', params: { id: committeeId } }" class="back" :aria-label="t('nav.back')"><ArrowLeft :size="20" /></RouterLink>
      <img src="/logo.png" alt="" width="26" height="26" />
      <strong class="cname">{{ committeeName }}</strong>
      <span class="grow" />
      <span class="net" :class="netState" role="status">
        <i aria-hidden="true" />
        {{ t('net.' + netState, { n: pending.length }) }}
      </span>
      <button class="lang" :disabled="!canUndo" :title="canUndo ? lastLabel : ''" @click="undoLast"><Undo2 :size="16" /> {{ t('session.undo') }}<template v-if="canUndo"> · {{ lastLabel }}</template></button>
      <button class="lang" :aria-pressed="soundOn" :aria-label="t('session.sound')" :title="t('session.sound')" @click="toggleSound"><Bell v-if="soundOn" :size="16" /><BellOff v-else :size="16" /></button>
      <button class="lang" :aria-pressed="full" @click="toggleFull">{{ full ? t('session.exitFull') : t('session.fullscreen') }}</button>
    </div>
    <p v-if="netState === 'offline'" class="offline" role="alert">{{ t('net.offlineHelp') }}</p>
    <p v-if="loading" class="muted">…</p>
    <p v-if="error" class="err" role="alert">{{ error }}</p>

    <div v-if="!loading && !session" class="card start">
      <h1>{{ committeeName }}</h1>
      <p class="muted">{{ t('session.noSession') }}</p>
      <button class="btn" @click="start">{{ t('session.start') }}</button>
    </div>

    <template v-if="session">
      <header class="top card">
        <div class="agenda">
          <span class="label">{{ t('session.agenda') }}</span>
          <strong :class="{ none: !session.agenda }">{{ session.agenda || t('session.noAgenda') }}</strong>
        </div>
        <div class="side">
        <div class="counts" :aria-label="t('session.attendance')">
          <span class="count p"><b>{{ counts.present }}</b>{{ t('session.present') }}</span>
          <span class="count v"><b>{{ counts.voting }}</b>{{ t('session.voting') }}</span>
          <span class="count a"><b>{{ counts.absent }}</b>{{ t('session.absent') }}</span>
        </div>
        <div class="actions">
          <button class="lang" @click="panel = panel === 'agenda' ? '' : 'agenda'">{{ t('session.setAgenda') }}</button>
          <button class="btn small" @click="panel = panel === 'roll' ? '' : 'roll'">{{ t('session.rollCall') }}</button>
          <button class="lang end" @click="endSession">{{ t('session.end') }}</button>
        </div>
        </div>
      </header>

      <div v-if="panel === 'agenda'" class="card pad">
        <form class="inline" @submit.prevent="saveAgenda">
          <input v-model="agendaDraft" :placeholder="t('session.agendaPlaceholder')" />
          <button class="btn small">{{ t('session.save') }}</button>
        </form>
      </div>

      <div v-if="panel === 'roll'" class="card pad">
        <div class="rollhead">
          <h2>{{ t('session.rollCall') }}</h2>
          <span class="muted">
            <button class="lang" @click="markAll('present')">{{ t('session.allPresent') }}</button>
          </span>
        </div>
        <ul class="roll">
          <li v-for="d in delegates" :key="d.id">
            <span class="who"><strong><CountryFlag :name="d.country" />{{ d.country }}</strong><small class="muted">{{ d.display_name }}</small></span>
            <span class="seg">
              <button v-for="s in statuses" :key="s" :class="[s, { on: attendance[d.id] === s }]" :aria-pressed="attendance[d.id] === s" @click="setStatus(d, s)">
                {{ t('session.short.' + s) }}
              </button>
            </span>
          </li>
        </ul>
      </div>

      <div v-if="tab === 'gsl'">
        <SpeakerStage
          can-settings can-yield v-model:settings-open="settingsOpen"
          :current="current ? country(current.delegate_id) : null"
          :clock="fmt(remainingNum)" :total="totalFmt" :total-ms="(current?.duration_seconds ?? speakSeconds) * 1000" :remaining-ms="remainingNum" :running="!!current?.running_since"
          :next="upcoming.map((s) => country(s.delegate_id))"
          :yielded-to="current?.yielded_to" :yielded-from="current?.yielded_from ? country(current.yielded_from) : null"
          @play="current && ops.toggleTimer(current)" @reset="current && ops.resetTimer(current, t('undo.resetTimer'))"
          @adjust="(sec) => current && ops.adjustTime(current, sec, t('undo.adjustTime'))"
          @done="nextSpeaker" @yield="panel = panel === 'yield' ? '' : 'yield'"
        >
          <template #settings="{ close }">
            <form class="sform" @submit.prevent="saveSeconds">
              <h3>{{ t('session.speakingTime') }}</h3>
              <p class="muted small">{{ t('session.speakingTimeHelp') }}</p>
              <div class="stepper">
                <button type="button" :aria-label="t('session.minus5')" @click="bump(-5)"><Minus :size="18" /></button>
                <input ref="secInput" v-model.number="secondsDraft" type="number" min="5" max="3600" inputmode="numeric" :aria-label="t('session.speakingTime')" />
                <button type="button" :aria-label="t('session.plus5')" @click="bump(5)"><Plus :size="18" /></button>
              </div>
              <p class="preview" aria-live="polite">{{ fmt(clampSeconds(secondsDraft) * 1000) }}</p>
              <div class="presets">
                <button v-for="p in presets" :key="p" type="button" :class="{ on: clampSeconds(secondsDraft) === p }" @click="secondsDraft = p">{{ p }}</button>
              </div>
              <label v-if="current" class="chk">
                <input v-model="applyCurrent" type="checkbox" />
                <span>{{ t('session.applyCurrent', { c: country(current.delegate_id) }) }}</span>
              </label>
              <div class="sact">
                <button type="button" class="lang" @click="close">{{ t('modes.cancel') }}</button>
                <button class="btn small">{{ t('session.save') }}</button>
              </div>
            </form>
          </template>
        </SpeakerStage>

        <div v-if="panel === 'yield' && current" class="card pad yieldbox">
          <h3>{{ t('session.yieldTitle', { c: country(current.delegate_id) }) }}</h3>
          <div class="yopts">
            <button class="lang" @click="yieldChair">{{ t('session.yieldChair') }}</button>
            <button class="lang" @click="yieldQuestions">{{ t('session.yieldToQuestions') }}</button>
          </div>
          <p class="muted small">{{ t('session.yieldDelegate') }}</p>
          <ul class="pick pgrid">
            <li v-for="d in yieldTargets" :key="d.id"><button @click="yieldDelegate(d)"><CountryFlag :name="d.country" />{{ d.country }}<ArrowRight :size="16" /></button></li>
          </ul>
        </div>

        <div class="manage"><button class="lang" :aria-expanded="manage" @click="manage = !manage">{{ manage ? t('session.hideManage') : t('session.manage') }}</button></div>
        <div v-if="manage" class="card pad add">
          <ul v-if="upcoming.length" class="c-rows soft">
            <li v-for="(s, i) in upcoming" :key="s.id">
              <span>{{ i + 2 }}. <CountryFlag :name="country(s.delegate_id)" />{{ country(s.delegate_id) }}</span>
              <span class="c-acts">
                <button class="x" :disabled="i === 0" :aria-label="t('session.moveUp')" @click="ops.moveSpeaker(queue, s, -1, t('undo.moveSpeaker'))"><ArrowUp :size="16" /></button>
                <button class="x" :disabled="i === upcoming.length - 1" :aria-label="t('session.moveDown')" @click="ops.moveSpeaker(queue, s, 1, t('undo.moveSpeaker'))"><ArrowDown :size="16" /></button>
                <button class="x" :aria-label="t('session.remove')" @click="ops.removeSpeaker(s, t('undo.removeSpeaker', { c: country(s.delegate_id) }))"><X :size="16" /></button>
              </span>
            </li>
          </ul>
          <input v-model="search" type="search" :placeholder="t('session.search')" :disabled="!rolled" />
          <p v-if="!rolled" class="muted">{{ t('session.rollFirst') }}</p>
          <ul v-else class="pick pgrid">
            <li v-for="d in addable" :key="d.id"><button @click="addSpeaker(d)"><CountryFlag :name="d.country" />{{ d.country }}<Plus :size="16" /></button></li>
          </ul>
        </div>
      </div>

      <div v-if="tab !== 'gsl'" class="modes">
        <MotionsTab
          v-if="tab === 'motions'" :session-id="session.id" :motions="motions" :delegates="delegates" :attendance="attendance"
          :default-seconds="session.speaker_seconds" @log="log" @goto="goto"
        />
        <CaucusPanel
          v-else-if="tab === 'mod' || tab === 'unmod' || tab === 'single'" :key="tab" :kind="tab" :session-id="session.id" :motions="motions"
          :delegates="delegates" :attendance="attendance" :speakers="speakers" :now="now" :default-seconds="session.speaker_seconds"
          @log="log"
        />
        <VoteTab
          v-else-if="tab === 'vote'" :session-id="session.id" :votes="votes" :ballots="ballots" :motions="motions"
          :delegates="delegates" :attendance="attendance" @log="log"
        />
      </div>

      <nav class="tabbar" :aria-label="t('session.modes')">
        <button v-for="m in tabs" :key="m" :class="{ on: m === tab }" :aria-current="m === tab" @click="tab = m">
          {{ t('session.tabs.' + m) }}
          <i v-if="m !== 'gsl' && m !== 'motions' && m !== 'vote' && motions.some((x) => x.kind === m && x.status === 'active')" class="dot" />
          <i v-else-if="m === 'vote' && votes.some((x) => x.status === 'open')" class="dot" />
          <i v-else-if="m === 'motions' && motions.some((x) => x.status === 'pending')" class="dot warn" />
        </button>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.console { padding-bottom: 112px }
.strip { display: flex; align-items: center; gap: 10px; padding: 10px 0 }
.strip .back { text-decoration: none; font-size: 22px; line-height: 1; padding: 4px 10px; border-radius: 10px; color: var(--text-muted) }
.strip .back:hover { background: var(--cream-deep) }
.strip .grow { flex: 1 }
.net { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; padding: 5px 10px; border-radius: 999px; background: #e6f2ea; color: var(--success-text) }
.net i { width: 8px; height: 8px; border-radius: 50%; background: #3e7c4f }
.net.offline { background: var(--danger-soft); color: var(--danger) }
.net.offline i { background: var(--danger) }
.net.reconnecting, .net.syncing { background: #fbf0d9; color: #8a5b0a }
.net.reconnecting i, .net.syncing i { background: #d99a2b; animation: blink 1s infinite }
@keyframes blink { 50% { opacity: .3 } }
.offline { background: var(--danger-soft); border: 1px solid var(--danger-line); color: var(--danger); border-radius: 10px; padding: 8px 14px; margin: 0 0 10px; font-weight: 600 }
.sform { display: grid; gap: 12px; max-width: none }
.sform h3 { margin: 0; font-size: 1.05rem }
.sform .small { margin: -6px 0 0 }
.stepper { display: grid; grid-template-columns: 44px 1fr 44px; gap: 8px }
.stepper button { height: 44px; border-radius: 12px; border: 1px solid var(--divider); background: var(--white); font-size: 20px; cursor: pointer }
.stepper button:hover { background: var(--cream-deep) }
.stepper input { text-align: center; font-size: 1.4rem; font-weight: 700; font-family: var(--font-display); min-width: 0 }
.preview { margin: -2px 0 0; text-align: center; color: var(--text-muted); font-variant-numeric: tabular-nums; font-weight: 600 }
.presets { display: flex; gap: 6px }
.presets button { flex: 1; height: 36px; border-radius: 10px; border: 1px solid var(--divider); background: var(--white); font: inherit; font-weight: 700; cursor: pointer }
.presets button.on { background: var(--accent); color: #fff; border-color: var(--accent) }
.chk { display: flex; align-items: flex-start; gap: 10px; font-weight: 500; font-size: 14px; cursor: pointer }
.chk input { min-height: 0; width: 18px; height: 18px; margin-top: 1px; accent-color: var(--accent) }
.sact { display: flex; justify-content: flex-end; gap: 8px }
.yieldbox { margin-top: 14px }
.yieldbox h3 { margin: 0 0 10px }
.yopts { display: flex; gap: 8px; flex-wrap: wrap }
.small { font-size: 13px }
.lang:disabled { opacity: .45; cursor: default }
.cname { font-family: var(--font-display); font-size: 1.15rem }
.start { text-align: center; padding: 48px 20px; margin-top: 24px }
.pad { padding: 20px }
.top { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; margin-top: 14px }
.agenda { flex: 1 1 320px; min-width: 0; display: grid; gap: 2px }
.side { display: grid; gap: 10px; justify-items: end; margin-left: auto }
.side .actions { flex-wrap: wrap; justify-content: flex-end }
.agenda strong { font-family: var(--font-display); font-size: clamp(1.6rem, 3.6vw, 2.8rem); line-height: 1.1 }
.agenda strong.none { color: var(--text-tertiary); font-size: clamp(1.2rem, 2.4vw, 1.8rem) }
.manage { display: flex; justify-content: flex-end; margin: 12px 0 }
.pgrid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); max-height: 40vh }
.label { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-tertiary); font-weight: 700 }
.counts { display: flex; gap: 8px }
.count { display: grid; place-items: center; min-width: 72px; padding: 6px 10px; border-radius: 12px; font-size: 12px; font-weight: 600 }
.count b { font-size: 22px; font-family: var(--font-display) }
.count.p { background: var(--success-soft, #e6f2ea); color: var(--success-text) }
.count.v { background: var(--info-soft); color: var(--info) }
.count.a { background: var(--danger-soft); color: var(--danger) }
.actions { display: flex; gap: 8px; align-items: center }
.end:hover { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-line) }
.btn.small { min-height: 40px; padding: 0 16px; box-shadow: none }
.inline { display: flex; gap: 10px; max-width: none }
.inline input { flex: 1 }
.row { display: flex; align-items: center; gap: 10px }
.rollhead { display: flex; justify-content: space-between; align-items: center }
.rollhead h2 { margin: 0 }
.roll { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px }
.roll li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: var(--cream); flex-wrap: wrap }
.who { display: grid }
.seg { display: flex; gap: 6px }
.seg button { border: 1px solid var(--divider); background: var(--white); border-radius: 8px; padding: 6px 12px; font: inherit; font-weight: 700; cursor: pointer }
.seg .present.on { background: #3e7c4f; color: #fff; border-color: #3e7c4f }
.seg .present_voting.on { background: var(--info); color: #fff; border-color: var(--info) }
.seg .absent.on { background: var(--danger); color: #fff; border-color: var(--danger) }
.grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; margin-top: 18px; align-items: start }
.clock { font-family: var(--font-display); font-size: clamp(3rem, 9vw, 5.5rem); font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; padding: 18px 0 }
.clock span { color: var(--text-tertiary) }
.timer.up .clock { color: var(--danger) }
.ctrl { display: flex; justify-content: center; gap: 10px }
.ctrl button { width: 56px; height: 44px; border-radius: 12px; border: 1px solid var(--divider); background: var(--white); font-size: 18px; cursor: pointer }
.ctrl .go { background: var(--accent); color: #fff; border-color: var(--accent); width: 96px }
.ctrl button:disabled { opacity: .4; cursor: default }
.timer h3 { margin: 24px 0 8px; font-size: 1.05rem }
.cur { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--accent-soft); border-radius: 12px; font-size: 1.2rem }
.up-list { margin: 0; padding-left: 22px; display: grid; gap: 6px }
.up-list li { padding-right: 4px }
.x { float: right; border: 0; background: none; cursor: pointer; color: var(--text-tertiary); font-size: 18px }
.add { display: grid; gap: 12px }
.pick { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; max-height: 52vh; overflow: auto }
.pick button { width: 100%; display: flex; justify-content: space-between; border: 1px solid var(--divider); background: var(--white); border-radius: 10px; padding: 10px 14px; font: inherit; font-weight: 600; cursor: pointer }
.pick button:hover { border-color: var(--accent); background: var(--accent-soft) }
.tabbar { position: fixed; z-index: 20; left: 0; right: 0; bottom: calc(22px + env(safe-area-inset-bottom)); width: fit-content; max-width: calc(100% - 24px); margin: 0 auto; display: flex; gap: 4px; padding: 6px; overflow-x: auto; scrollbar-width: none; background: var(--surface-glass); backdrop-filter: blur(14px); border: 1px solid var(--divider); border-radius: 999px; box-shadow: var(--shadow-lg) }
.tabbar button { position: relative; flex: none; border: 0; background: none; padding: 11px 20px; border-radius: 999px; font: inherit; font-weight: 700; color: var(--text-tertiary); cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease }
.tabbar button:hover { background: var(--cream-deep); color: var(--text) }
.tabbar button.on { background: var(--accent); color: #fff }
.dot { position: absolute; top: 5px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: #3e7c4f; box-shadow: 0 0 0 2px var(--white) }
.dot.warn { background: #d99a2b }
.modes { margin-top: 18px }
@media (max-width: 820px) { .grid { grid-template-columns: 1fr } }
</style>
