<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { uniqueDelegates } from '@/lib/delegates'
import LoadingScreen from '@/components/LoadingScreen.vue'
import RapporteurDoc from '@/components/RapporteurDoc.vue'

interface Session { id: string; status: string; started_at: string }

const { t, locale } = useI18n()
const committeeId = useRoute().params.id as string
const name = ref('')
const countries = ref<string[]>([])
const sessions = ref<Session[]>([])
const sessionId = ref('')
const loading = ref(true)

const when = (iso: string) => new Date(iso).toLocaleString(locale.value, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

async function loadSessions() {
  const { data } = await supabase.from('cmd_sessions').select('id, status, started_at')
    .eq('committee_id', committeeId).order('started_at', { ascending: false })
  if (!data) return
  const newest = sessions.value[0]?.id
  sessions.value = data
  // En yenideyken chair yeni oturum açarsa ona geç.
  if (!sessionId.value || sessionId.value === newest) sessionId.value = data[0]?.id ?? ''
}

let channel: ReturnType<typeof supabase.channel> | null = null
onMounted(async () => {
  const [c, d] = await Promise.all([
    supabase.from('cmd_committees').select('name').eq('id', committeeId).single(),
    supabase.from('cmd_delegates').select('id, display_name, country, source').eq('committee_id', committeeId).order('country'),
  ])
  name.value = c.data?.name ?? ''
  countries.value = [...new Set(uniqueDelegates(d.data ?? []).map((x) => x.country))]
  await loadSessions()
  loading.value = false
  channel = supabase.channel(`rapp-sessions-${committeeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_sessions', filter: `committee_id=eq.${committeeId}` }, loadSessions)
    .subscribe()
})
onBeforeUnmount(() => channel && supabase.removeChannel(channel))
</script>

<template>
  <section class="rapp">
    <RouterLink :to="{ name: 'roster', params: { id: committeeId } }" class="muted"><ArrowLeft :size="16" /> {{ name }}</RouterLink>
    <LoadingScreen v-if="loading" />
    <template v-else>
      <h1>{{ t('rapp.title') }}</h1>
      <p v-if="!sessions.length" class="muted">{{ t('rapp.noSession') }}</p>
      <template v-else>
        <select v-model="sessionId" :aria-label="t('rapp.session')">
          <option v-for="(s, i) in sessions" :key="s.id" :value="s.id">
            {{ t('rapp.session') }} {{ sessions.length - i }} · {{ when(s.started_at) }}{{ s.status === 'open' ? ` · ${t('rapp.open')}` : '' }}
          </option>
        </select>
        <RapporteurDoc :key="sessionId" :session-id="sessionId" :countries="countries" />
      </template>
    </template>
  </section>
</template>

<style scoped>
.rapp { max-width: 820px; margin: 0 auto; padding-bottom: 20vh }
select { min-height: 44px; max-width: 100%; margin-bottom: 14px; border: 1px solid var(--divider); border-radius: 10px; padding: 0 10px; font: inherit; color: inherit; background: var(--white) }
</style>
