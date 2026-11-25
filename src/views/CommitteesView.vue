<script lang="ts">
// Lives outside setup so it survives leaving and returning to this page.
const seen = new Set<string>()
</script>

<script setup lang="ts">
import { ArrowLeft, ChevronRight, Search } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import LoadingScreen from '@/components/LoadingScreen.vue'
import GavelIntro from '@/components/GavelIntro.vue'

interface Row { id: string; name: string; event_id: string; events: { title: string } | null }
const { t } = useI18n()
const route = useRoute()
const rows = ref<Row[]>([])
const loading = ref(true)
const error = ref('')
const query = ref('')

// The gavel plays the first time each committee is opened (again after a page reload).
const router = useRouter()
const entering = ref<Row | null>(null)
function open(e: MouseEvent, c: Row, navigate: (e: MouseEvent) => void) {
  // New tab / new window clicks stay untouched.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || seen.has(c.id)) return navigate(e)
  e.preventDefault()
  seen.add(c.id)
  entering.value = c
}
function enter() {
  const c = entering.value
  if (c) router.push({ name: 'roster', params: { id: c.id } })
}

// First pick the conference, then its committees. The choice lives in the URL,
// so the browser back button works.
const events = computed(() => {
  const map = new Map<string, { id: string; title: string; count: number }>()
  for (const r of rows.value) {
    const e = map.get(r.event_id) ?? { id: r.event_id, title: r.events?.title ?? '—', count: 0 }
    e.count++
    map.set(r.event_id, e)
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr'))
})
const selected = computed(() => events.value.find((e) => e.id === route.query.event) ?? null)
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i')
const shownEvents = computed(() => events.value.filter((e) => plain(e.title).includes(plain(query.value.trim()))))
const committees = computed(() => rows.value.filter((r) => r.event_id === selected.value?.id))
watch(() => route.query.event, () => (query.value = ''))

onMounted(async () => {
  const { data, error: e } = await supabase
    .from('cmd_committees')
    .select('id, name, event_id, events(title)')
    .order('sort_order')
  if (e) error.value = e.message
  rows.value = (data ?? []) as unknown as Row[]
  loading.value = false
})
</script>

<template>
  <section>
    <RouterLink v-if="selected" :to="{ name: 'committees' }" class="muted"><ArrowLeft :size="16" /> {{ t('committees.allEvents') }}</RouterLink>
    <h1>{{ selected ? selected.title : t('committees.title') }}</h1>
    <LoadingScreen v-if="loading" :cards="6" />
    <p v-else-if="error" class="err">{{ error }}</p>
    <p v-else-if="!rows.length" class="muted">{{ t('committees.empty') }}</p>

    <ul v-else-if="selected" key="committees" class="cm-grid rise">
      <li v-for="c in committees" :key="c.id">
        <RouterLink v-slot="{ href, navigate }" :to="{ name: 'roster', params: { id: c.id } }" custom>
          <a :href="href" class="card cm-card" @click="open($event, c, navigate)">
            <strong>{{ c.name }}</strong>
            <ChevronRight :size="20" aria-hidden="true" />
          </a>
        </RouterLink>
      </li>
    </ul>

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
    <GavelIntro v-if="entering" :title="entering.name" @done="enter" />
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
.cm-search { position: relative; display: grid; align-items: center; max-width: 420px }
.cm-search svg { position: absolute; left: 14px; color: var(--text-tertiary); pointer-events: none }
.cm-search input { width: 100%; padding-left: 42px; border-radius: 999px }
</style>
