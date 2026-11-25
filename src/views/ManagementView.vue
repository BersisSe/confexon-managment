<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, Building2, Clock, FileText, Mic, Radio, ShieldCheck, Users } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { fmt, left } from '@/lib/time'

interface Committee { id: string; name: string; event_id: string; events: { title: string } | null }
interface Sess { id: string; committee_id: string; agenda: string | null; started_at: string }
interface Att { session_id: string; delegate_id: string; status: string }
interface Spk { session_id: string; delegate_id: string; position: number; duration_seconds: number; elapsed_ms: number; running_since: string | null }
interface Log { session_id: string; kind: string; data: Record<string, unknown>; created_at: string }

const { t, locale } = useI18n()
const committees = ref<Committee[]>([])
const delegates = ref<{ id: string; committee_id: string; country: string }[]>([])
const sessions = ref<Sess[]>([])
const attendance = ref<Att[]>([])
const speakers = ref<Spk[]>([])
const logs = ref<Log[]>([])
const loading = ref(true)
const filter = ref<'all' | 'live' | 'idle'>('all')
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval>
let channel: ReturnType<typeof supabase.channel> | null = null
let timer: ReturnType<typeof setTimeout> | undefined

async function load() {
  const [c, d, s] = await Promise.all([
    supabase.from('cmd_committees').select('id, name, event_id, events(title)').order('sort_order'),
    supabase.from('cmd_delegates').select('id, committee_id, country'),
    supabase.from('cmd_sessions').select('id, committee_id, agenda, started_at').eq('status', 'open'),
  ])
  committees.value = (c.data ?? []) as unknown as Committee[]
  delegates.value = d.data ?? []
  sessions.value = s.data ?? []
  const ids = sessions.value.map((x) => x.id)
  if (ids.length) {
    const [a, sp, lg] = await Promise.all([
      supabase.from('cmd_attendance').select('session_id, delegate_id, status').in('session_id', ids),
      supabase.from('cmd_speakers').select('session_id, delegate_id, position, duration_seconds, elapsed_ms, running_since').in('session_id', ids).is('finished_at', null),
      supabase.from('cmd_log').select('session_id, kind, data, created_at').in('session_id', ids).order('created_at', { ascending: false }).limit(80),
    ])
    attendance.value = a.data ?? []
    speakers.value = (sp.data ?? []) as Spk[]
    logs.value = (lg.data ?? []) as Log[]
  } else {
    attendance.value = []; speakers.value = []; logs.value = []
  }
  loading.value = false
}
const reload = () => { clearTimeout(timer); timer = setTimeout(load, 250) }

onMounted(() => {
  load()
  tick = setInterval(() => (now.value = Date.now()), 500)
  channel = supabase.channel('cmd-management')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_sessions' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_attendance' }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_speakers' }, reload)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cmd_log' }, reload)
    .subscribe()
})
onBeforeUnmount(() => {
  clearInterval(tick); clearTimeout(timer)
  if (channel) supabase.removeChannel(channel)
})

const rtf = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))
function ago(iso: string) {
  const s = Math.round((new Date(iso).getTime() - now.value) / 1000)
  const a = Math.abs(s)
  if (a < 45) return rtf.value.format(0, 'second')
  if (a < 3600) return rtf.value.format(Math.round(s / 60), 'minute')
  return rtf.value.format(Math.round(s / 3600), 'hour')
}

const country = (id: string) => delegates.value.find((d) => d.id === id)?.country ?? '—'

const cards = computed(() => committees.value.map((c) => {
  const total = delegates.value.filter((d) => d.committee_id === c.id).length
  const sess = sessions.value.find((s) => s.committee_id === c.id) ?? null
  let present = 0, voting = 0, rolled = 0, queued = 0
  let current: { country: string; left: number; running: boolean } | null = null
  let next: string | null = null
  let last: Log | null = null
  if (sess) {
    const att = attendance.value.filter((a) => a.session_id === sess.id)
    rolled = att.length
    present = att.filter((a) => a.status === 'present').length
    voting = att.filter((a) => a.status === 'present_voting').length
    const q = speakers.value.filter((s) => s.session_id === sess.id).sort((a, b) => a.position - b.position)
    queued = q.length
    if (q[0]) {
      current = {
        country: country(q[0].delegate_id),
        left: left(q[0].duration_seconds * 1000, q[0].elapsed_ms, q[0].running_since, now.value),
        running: !!q[0].running_since,
      }
    }
    if (q[1]) next = country(q[1].delegate_id)
    last = logs.value.find((l) => l.session_id === sess.id) ?? null
  }
  const here = present + voting
  const majority = Math.floor(total / 2) + 1
  const third = Math.ceil(total / 3)
  const quorum: 'none' | 'third' | 'majority' = !rolled ? 'none' : here >= majority ? 'majority' : here >= third ? 'third' : 'none'
  return {
    c, total, sess, here, rolled, current, next, queued, last, quorum,
    pct: total ? Math.min(100, Math.round((here / total) * 100)) : 0,
    thirdPct: total ? Math.round((third / total) * 100) : 33,
    majPct: total ? Math.round((majority / total) * 100) : 50,
  }
}))

const visible = computed(() =>
  cards.value
    .filter((x) => (filter.value === 'all' ? true : filter.value === 'live' ? !!x.sess : !x.sess))
    .sort((a, b) => Number(!!b.sess) - Number(!!a.sess)),
)
const groups = computed(() => {
  const m = new Map<string, { title: string; items: typeof cards.value }>()
  for (const x of visible.value) {
    const g = m.get(x.c.event_id) ?? { title: x.c.events?.title ?? '', items: [] }
    g.items.push(x); m.set(x.c.event_id, g)
  }
  return [...m.values()]
})
const stats = computed(() => ({
  live: cards.value.filter((x) => x.sess).length,
  total: cards.value.length,
  here: cards.value.reduce((n, x) => n + x.here, 0),
  delegates: cards.value.filter((x) => x.sess).reduce((n, x) => n + x.total, 0),
  queued: cards.value.reduce((n, x) => n + x.queued, 0),
  majority: cards.value.filter((x) => x.sess && x.quorum === 'majority').length,
}))

function lastText(l: Log) {
  const d = l.data as { country?: string; agenda?: string }
  return t(`management.log.${l.kind}`, { country: d.country ?? '', agenda: d.agenda ?? '' })
}
</script>

<template>
  <section class="mgmt">
    <header class="pagehead">
      <div>
        <h1>{{ t('management.title') }}</h1>
        <p class="muted">{{ t('management.lead') }}</p>
      </div>
      <div class="filters" role="group" :aria-label="t('management.filter.label')">
        <button v-for="f in (['all', 'live', 'idle'] as const)" :key="f" :class="{ on: filter === f }" :aria-pressed="filter === f" @click="filter = f">
          {{ t('management.filter.' + f) }}
        </button>
      </div>
    </header>

    <div class="stats">
      <div class="stat"><span class="ic live"><Radio :size="18" /></span><b>{{ stats.live }}<small>/{{ stats.total }}</small></b><span>{{ t('management.live') }}</span></div>
      <div class="stat"><span class="ic"><Users :size="18" /></span><b>{{ stats.here }}<small>/{{ stats.delegates }}</small></b><span>{{ t('management.delegatesHere') }}</span></div>
      <div class="stat"><span class="ic"><ShieldCheck :size="18" /></span><b>{{ stats.majority }}<small>/{{ stats.live }}</small></b><span>{{ t('management.withMajority') }}</span></div>
      <div class="stat"><span class="ic"><Mic :size="18" /></span><b>{{ stats.queued }}</b><span>{{ t('management.inQueue') }}</span></div>
    </div>

    <div v-if="loading" class="skel" aria-hidden="true"><i /><i /><i /></div>
    <div v-else-if="!cards.length" class="empty"><Building2 :size="32" /><p>{{ t('management.empty') }}</p></div>
    <div v-else-if="!visible.length" class="empty"><Radio :size="32" /><p>{{ t('management.nothing') }}</p></div>

    <template v-for="g in groups" :key="g.title">
      <h2 class="evt">{{ g.title }}</h2>
      <div class="cards">
        <RouterLink v-for="x in g.items" :key="x.c.id" :to="{ name: 'session', params: { id: x.c.id } }" class="cm" :class="{ idle: !x.sess }">
          <header>
            <strong>{{ x.c.name }}</strong>
            <span v-if="x.sess" class="badge on"><i />{{ t('management.liveBadge') }}</span>
            <span v-else class="badge">{{ t('management.idle') }}</span>
          </header>

          <template v-if="x.sess">
            <p class="agenda"><FileText :size="15" /> <span :class="{ none: !x.sess.agenda }">{{ x.sess.agenda || t('management.noAgenda') }}</span></p>

            <div class="attend">
              <div class="bar" role="img" :aria-label="`${x.here}/${x.total}`">
                <span class="fill" :class="x.quorum" :style="{ width: x.pct + '%' }" />
                <i class="tick" :style="{ left: x.thirdPct + '%' }" :title="t('management.quorum.third')" />
                <i class="tick" :style="{ left: x.majPct + '%' }" :title="t('management.quorum.majority')" />
              </div>
              <div class="meta">
                <span>{{ t('management.here', { n: x.here, total: x.total }) }}</span>
                <span class="q" :class="x.quorum">{{ t('management.quorum.' + x.quorum) }}</span>
              </div>
            </div>

            <div v-if="x.current" class="spk">
              <span class="mic"><Mic :size="16" /></span>
              <span class="nm">{{ x.current.country }}</span>
              <b :class="{ run: x.current.running, up: x.current.left === 0 }">{{ fmt(x.current.left) }}</b>
            </div>
            <p v-else class="muted small">{{ t('management.noSpeaker') }}</p>
            <p v-if="x.next" class="next small"><b>{{ t('management.next') }}</b> {{ x.next }}<span v-if="x.queued > 2" class="muted"> · {{ t('management.queued', { n: x.queued - 1 }) }}</span></p>

            <footer>
              <span class="last"><Clock :size="13" /> {{ x.last ? `${lastText(x.last)} · ${ago(x.last.created_at)}` : t('management.noActivity') }}</span>
              <ArrowUpRight :size="16" class="go" />
            </footer>
          </template>

          <template v-else>
            <p class="muted small">{{ t('management.total', { n: x.total }) }}</p>
            <footer><span class="last">{{ t('management.open') }}</span><ArrowUpRight :size="16" class="go" /></footer>
          </template>
        </RouterLink>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pagehead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap }
.pagehead p { margin: 0 }
.filters { display: flex; padding: 3px; gap: 2px; background: var(--cream-deep); border-radius: 12px }
.filters button { border: 0; background: none; padding: 6px 14px; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 700; color: var(--text-muted); cursor: pointer }
.filters button.on { background: var(--white); color: var(--text); box-shadow: var(--shadow-sm) }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0 6px }
.stat { background: var(--white); border: 1px solid var(--divider); border-radius: 16px; padding: 14px 16px; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 12px; align-items: center; box-shadow: var(--shadow-sm) }
.stat .ic { grid-row: 1 / 3; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--cream-deep); color: var(--text-muted) }
.stat .ic.live { background: var(--success-soft); color: var(--success-text) }
.stat b { font-family: var(--font-display); font-size: 26px; line-height: 1.1 }
.stat small { font-size: 15px; color: var(--text-tertiary) }
.stat > span:last-child { font-size: 12px; color: var(--text-muted); font-weight: 600 }
.skel { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-top: 20px }
.skel i { height: 190px; border-radius: var(--radius); background: linear-gradient(90deg, var(--cream-deep), var(--cream), var(--cream-deep)); background-size: 200% 100%; animation: sh 1.4s infinite }
@keyframes sh { to { background-position: -200% 0 } }
.empty { display: grid; place-items: center; gap: 8px; padding: 56px 16px; color: var(--text-tertiary); text-align: center }
.empty p { margin: 0 }
.evt { margin: 28px 0 12px; font-size: 1.15rem }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; align-items: start }
.cm { text-decoration: none; display: flex; flex-direction: column; gap: 12px; padding: 18px; background: var(--white); border: 1px solid var(--divider); border-radius: 18px; box-shadow: var(--shadow-sm); transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) ease }
.cm:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--accent) }
.cm:hover .go { color: var(--accent); transform: translate(2px, -2px) }
.cm.idle { background: var(--cream); box-shadow: none }
.cm header { display: flex; justify-content: space-between; align-items: center; gap: 8px }
.cm header strong { font-family: var(--font-display); font-size: 1.1rem }
.badge { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--cream-deep); color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px }
.badge.on { background: var(--success-soft); color: var(--success-text) }
.badge i { width: 7px; height: 7px; border-radius: 50%; background: #3e7c4f; animation: pulse 1.8s infinite }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgb(62 124 79 / .6) } 70%, 100% { box-shadow: 0 0 0 7px rgb(62 124 79 / 0) } }
.agenda { margin: 0; display: flex; gap: 8px; align-items: flex-start; font-weight: 600; color: var(--text) }
.agenda svg { margin-top: 3px; flex: none; color: var(--text-tertiary) }
.agenda .none { color: var(--text-tertiary); font-weight: 500 }
.bar { position: relative; height: 10px; background: var(--cream-deep); border-radius: 999px }
.fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: var(--danger); transition: width .4s var(--ease-out) }
.fill.third { background: #d99a2b }
.fill.majority { background: #3e7c4f }
.tick { position: absolute; top: -3px; bottom: -3px; width: 2px; background: rgb(28 25 23 / .35); border-radius: 2px }
.meta { display: flex; justify-content: space-between; margin-top: 6px; font-size: 13px; color: var(--text-muted); font-weight: 600 }
.q.majority { color: var(--success-text) }
.q.third { color: var(--warn-text) }
.q.none { color: var(--danger) }
.spk { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--accent-soft); border-radius: 12px }
.spk .mic { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--white); color: var(--accent-dark) }
.spk .nm { flex: 1; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.spk b { font-family: var(--font-display); font-variant-numeric: tabular-nums; font-size: 1.3rem }
.spk b.up { color: var(--danger) }
.small { font-size: 13px; margin: 0 }
.next { color: var(--text-muted) }
.next b { color: var(--text); margin-right: 4px }
footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--divider) }
.last { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-tertiary); min-width: 0 }
.go { flex: none; color: var(--text-tertiary); transition: transform var(--dur-fast) var(--ease-out), color var(--dur-fast) ease }
@media (prefers-reduced-motion: reduce) { .cm, .go { transition: none } }
</style>
