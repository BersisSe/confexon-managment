<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { db } from '@/lib/db'
import { pushUndo } from '@/lib/undo'
import type { Ballot, Delegate, Motion, Status, Vote } from '@/lib/types'

const props = defineProps<{
  sessionId: string
  votes: Vote[]
  ballots: Ballot[]
  motions: Motion[]
  delegates: Delegate[]
  attendance: Record<string, Status>
}>()
const emit = defineEmits<{ log: [kind: string, data: Record<string, unknown>] }>()
const { t } = useI18n()
const form = reactive({ title: '', majority: 'simple' as Vote['majority'] })

const open = computed(() => props.votes.find((v) => v.status === 'open') ?? null)
const closed = computed(() => props.votes.filter((v) => v.status === 'closed').slice(-8).reverse())
const eligible = computed(() => props.delegates.filter((d) => props.attendance[d.id] && props.attendance[d.id] !== 'absent'))

function tally(voteId: string) {
  const b = props.ballots.filter((x) => x.vote_id === voteId)
  return {
    yes: b.filter((x) => x.choice === 'yes').length,
    no: b.filter((x) => x.choice === 'no').length,
    abstain: b.filter((x) => x.choice === 'abstain').length,
  }
}
const live = computed(() => (open.value ? tally(open.value.id) : { yes: 0, no: 0, abstain: 0 }))
const choiceOf = (d: Delegate) => props.ballots.find((x) => x.vote_id === open.value?.id && x.delegate_id === d.id)?.choice
const missing = computed(() => eligible.value.length - (live.value.yes + live.value.no + live.value.abstain))

function passes(v: Vote, c: { yes: number; no: number }) {
  if (c.yes === 0) return false
  return v.majority === 'two_thirds' ? c.yes * 3 >= (c.yes + c.no) * 2 : c.yes > c.no
}

function create() {
  const title = form.title.trim()
  if (!title) return
  const { row } = db.insert('cmd_votes', {
    session_id: props.sessionId, motion_id: null, title, majority: form.majority, status: 'open', result: null,
    created_at: new Date().toISOString(),
  })
  form.title = ''
  pushUndo(t('undo.openVote'), () => db.remove('cmd_votes', { id: row.id }))
}

function cast(d: Delegate, choice: Ballot['choice']) {
  const v = open.value
  if (!v) return
  const prev = choiceOf(d)
  const key = { vote_id: v.id, delegate_id: d.id }
  if (prev === choice) {
    db.remove('cmd_ballots', key)
    pushUndo(t('undo.ballot'), () => db.upsert('cmd_ballots', { ...key, choice }, 'vote_id,delegate_id'))
  } else {
    db.upsert('cmd_ballots', { ...key, choice }, 'vote_id,delegate_id')
    pushUndo(t('undo.ballot'), () => (prev ? db.upsert('cmd_ballots', { ...key, choice: prev }, 'vote_id,delegate_id') : db.remove('cmd_ballots', key)))
  }
}

function close() {
  const v = open.value
  if (!v) return
  const c = tally(v.id)
  const result = passes(v, c) ? 'passed' : 'failed'
  db.update('cmd_votes', { status: 'closed', result }, { id: v.id })
  let undoMotion = () => {}
  if (v.motion_id) {
    const m = props.motions.find((x) => x.id === v.motion_id)
    const hasActive = props.motions.some((x) => x.status === 'active')
    const caucus = m && ['mod', 'unmod', 'single'].includes(m.kind)
    const status = result === 'failed' ? 'failed' : caucus && !hasActive ? 'active' : 'passed'
    const prevStatus = m?.status ?? 'pending'
    db.update('cmd_motions', { status }, { id: v.motion_id })
    undoMotion = () => db.update('cmd_motions', { status: prevStatus }, { id: v.motion_id })
  }
  emit('log', 'vote_closed', { title: v.title, result, ...c })
  pushUndo(t('undo.closeVote'), () => { db.update('cmd_votes', { status: 'open', result: null }, { id: v.id }); undoMotion() })
}

function cancel() {
  const v = open.value
  if (!v) return
  const copy = { ...v }
  db.remove('cmd_votes', { id: v.id })
  pushUndo(t('undo.cancelVote'), () => db.insert('cmd_votes', copy))
}
</script>

<template>
  <section>
    <div v-if="!open" class="c-grid">
      <div class="c-card">
        <h2>{{ t('modes.newVote') }}</h2>
        <form class="c-form" @submit.prevent="create">
          <label>{{ t('modes.voteTitle') }}<input v-model="form.title" required /></label>
          <label>{{ t('modes.majority') }}
            <select v-model="form.majority">
              <option value="simple">{{ t('modes.simple') }}</option>
              <option value="two_thirds">{{ t('modes.twoThirds') }}</option>
            </select>
          </label>
          <button class="btn">{{ t('modes.openVote') }}</button>
        </form>
      </div>
      <div class="c-card">
        <h2>{{ t('modes.history') }}</h2>
        <p v-if="!closed.length" class="muted">{{ t('modes.noVotes') }}</p>
        <ul class="c-rows soft">
          <li v-for="v in closed" :key="v.id">
            <span>
              <strong>{{ v.title }}</strong>
              <small class="muted"> · {{ tally(v.id).yes }}–{{ tally(v.id).no }}–{{ tally(v.id).abstain }}</small>
            </span>
            <span class="tag" :class="v.result">{{ t('modes.status.' + v.result) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div v-else class="c-card">
      <div class="c-head">
        <div>
          <span class="c-label">{{ open.majority === 'two_thirds' ? t('modes.twoThirds') : t('modes.simple') }}</span>
          <h2>{{ open.title }}</h2>
        </div>
        <div class="c-acts">
          <button class="lang end" @click="cancel">{{ t('modes.cancel') }}</button>
          <button class="btn small" @click="close">{{ t('modes.closeVote') }}</button>
        </div>
      </div>

      <div class="c-tally">
        <span class="y"><b>{{ live.yes }}</b>{{ t('modes.yes') }}</span>
        <span class="n"><b>{{ live.no }}</b>{{ t('modes.no') }}</span>
        <span class="a"><b>{{ live.abstain }}</b>{{ t('modes.abstain') }}</span>
        <span class="m"><b>{{ missing }}</b>{{ t('modes.notVoted') }}</span>
      </div>

      <ul class="c-rows">
        <li v-for="d in eligible" :key="d.id">
          <span>{{ d.country }}</span>
          <span class="c-seg">
            <button class="y" :class="{ on: choiceOf(d) === 'yes' }" :aria-pressed="choiceOf(d) === 'yes'" @click="cast(d, 'yes')">{{ t('modes.yes') }}</button>
            <button class="n" :class="{ on: choiceOf(d) === 'no' }" :aria-pressed="choiceOf(d) === 'no'" @click="cast(d, 'no')">{{ t('modes.no') }}</button>
            <button
              class="a" :class="{ on: choiceOf(d) === 'abstain' }" :aria-pressed="choiceOf(d) === 'abstain'"
              :disabled="attendance[d.id] === 'present'" :title="attendance[d.id] === 'present' ? t('modes.noAbstain') : ''" @click="cast(d, 'abstain')"
            >{{ t('modes.abstain') }}</button>
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>
