<script setup lang="ts">
import { ArrowLeft, ChevronRight, Lock, Search } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import LoadingScreen from '@/components/LoadingScreen.vue'

interface Row { id: string; name: string; event_id: string; events: { title: string } | null }
interface Open { event_id: string; title: string; committees: { id: string; name: string }[] }
interface Req { committee_id: string; status: 'pending' | 'approved' | 'rejected' }
const { t } = useI18n()
const auth = useAuth()
const route = useRoute()
const rows = ref<Row[]>([])
const requestable = ref<Open[]>([])
const requests = ref<Req[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const sending = ref('')
const query = ref('')

// Erişimim olan komiteler + istenebilecek olanlar.
const all = computed(() => {
  const map = new Map<string, { id: string; name: string; event_id: string; title: string; open: boolean }>()
  for (const e of requestable.value)
    for (const c of e.committees) map.set(c.id, { ...c, event_id: e.event_id, title: e.title, open: false })
  for (const r of rows.value)
    map.set(r.id, { id: r.id, name: r.name, event_id: r.event_id, title: r.events?.title ?? '—', open: true })
  return [...map.values()]
})
// First pick the conference, then its committees. The choice lives in the URL,
// so the browser back button works.
const events = computed(() => {
  const map = new Map<string, { id: string; title: string; count: number }>()
  for (const c of all.value) {
    const e = map.get(c.event_id) ?? { id: c.event_id, title: c.title, count: 0 }
    e.count++
    map.set(c.event_id, e)
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr'))
})
const selected = computed(() => events.value.find((e) => e.id === route.query.event) ?? null)
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')
const shownEvents = computed(() => events.value.filter((e) => plain(e.title).includes(plain(query.value.trim()))))
const committees = computed(() => all.value.filter((c) => c.event_id === selected.value?.id))
// Komite başına son isteğin durumu.
const status = computed(() => new Map(requests.value.map((r) => [r.committee_id, r.status])))
watch(() => route.query.event, () => {
  query.value = ''
  notice.value = ''
})

async function loadCommittees() {
  const { data, error: e } = await supabase
    .from('cmd_committees')
    .select('id, name, event_id, events(title)')
    .order('sort_order')
  if (e) error.value = e.message
  rows.value = (data ?? []) as unknown as Row[]
}

async function loadRequests() {
  const { data, error: e } = await supabase
    .from('cmd_access_requests')
    .select('committee_id, status')
    .eq('user_id', auth.session!.user.id)
    .order('created_at')
  if (e) return
  const waiting = requests.value.filter((r) => r.status === 'pending').map((r) => r.committee_id)
  requests.value = (data ?? []) as Req[]
  if (requests.value.some((r) => r.status === 'approved' && waiting.includes(r.committee_id))) await loadCommittees()
}

const known = ['already_has_access', 'already_pending', 'recently_rejected', 'too_many_pending']
async function request(committeeId: string) {
  if (sending.value || status.value.get(committeeId) === 'pending') return
  sending.value = committeeId
  notice.value = ''
  const { error: e } = await supabase.rpc('cmd_request_access', { p_committee: committeeId })
  if (e) notice.value = t(`access.${known.find((k) => e.message.includes(k)) ?? 'failed'}`)
  await loadRequests()
  sending.value = ''
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  const [, open] = await Promise.all([loadCommittees(), supabase.rpc('cmd_list_requestable_events'), loadRequests()])
  requestable.value = (open.data ?? []) as Open[]
  loading.value = false
  // Onay uygulamadan gelir; bekleyen istek varken ara ara bak.
  timer = setInterval(() => requests.value.some((r) => r.status === 'pending') && loadRequests(), 15000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section>
    <RouterLink v-if="selected" :to="{ name: 'committees' }" class="muted"><ArrowLeft :size="16" /> {{ t('committees.allEvents') }}</RouterLink>
    <h1>{{ selected ? selected.title : t('committees.title') }}</h1>
    <LoadingScreen v-if="loading" :cards="6" />
    <p v-else-if="error" class="err">{{ error }}</p>
    <p v-else-if="!all.length" class="muted">{{ t('committees.empty') }}</p>

    <div v-else-if="selected" key="committees" class="rise">
      <p v-if="notice" class="err" role="alert">{{ notice }}</p>
      <ul class="cm-grid">
        <li v-for="c in committees" :key="c.id">
          <RouterLink v-if="c.open" :to="{ name: 'roster', params: { id: c.id } }" class="card cm-card">
            <strong>{{ c.name }}</strong>
            <ChevronRight :size="20" aria-hidden="true" />
          </RouterLink>
          <button v-else type="button" class="card cm-card locked" :disabled="!!sending || status.get(c.id) === 'pending'" @click="request(c.id)">
            <span>
              <strong>{{ c.name }}</strong>
              <small class="muted" role="status">{{ t(`access.${status.get(c.id) === 'pending' || status.get(c.id) === 'rejected' ? status.get(c.id) : 'request'}`) }}</small>
            </span>
            <Lock :size="18" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>

    <div v-else key="events" class="rise">
      <div v-if="events.length > 4" class="cm-search">
        <Search :size="18" aria-hidden="true" />
        <input v-model="query" type="search" :placeholder="t('committees.search')" :aria-label="t('committees.search')" />
      </div>
      <p v-if="!shownEvents.length" class="muted">{{ t('committees.noMatch') }}</p>
      <ul class="cm-grid">
        <li v-for="e in shownEvents" :key="e.id">
          <RouterLink :to="{ name: 'committees', query: { event: e.id } }" class="card cm-card big">
            <span>
              <strong>{{ e.title }}</strong>
              <small class="muted">{{ t('committees.count', { n: e.count }) }}</small>
            </span>
            <ChevronRight :size="22" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.cm-grid { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px }
.cm-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; height: 100%; text-decoration: none; border-radius: 18px; overflow-wrap: anywhere; transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-fast) ease }
.cm-card:hover { transform: translateY(-3px); border-color: var(--accent) }
.cm-card svg { flex: none; color: var(--text-tertiary) }
.cm-card span { display: grid; gap: 2px; min-width: 0 }
.cm-card.big { min-height: 120px; padding: 24px }
.cm-card.big strong { font-family: var(--font-display); font-size: 1.5rem; line-height: 1.2 }
button.cm-card { width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer }
button.cm-card:disabled { cursor: default; transform: none }
.cm-card.locked { border-style: dashed }
.cm-search { position: relative; display: grid; align-items: center; max-width: 420px }
.cm-search svg { position: absolute; left: 14px; color: var(--text-tertiary); pointer-events: none }
.cm-search input { width: 100%; padding-left: 42px; border-radius: 999px }
</style>
