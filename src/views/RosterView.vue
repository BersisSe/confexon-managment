<script setup lang="ts">
import CountryFlag from '@/components/CountryFlag.vue'
import { ArrowLeft } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import LoadingScreen from '@/components/LoadingScreen.vue'

interface Delegate { id: string; display_name: string; country: string }
const { t } = useI18n()
const route = useRoute()
const delegates = ref<Delegate[]>([])
const name = ref('')
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  const id = route.params.id as string
  const [c, d] = await Promise.all([
    supabase.from('cmd_committees').select('name').eq('id', id).single(),
    supabase.from('cmd_delegates').select('id, display_name, country').eq('committee_id', id).order('country'),
  ])
  name.value = c.data?.name ?? ''
  if (d.error) error.value = d.error.message
  delegates.value = d.data ?? []
  loading.value = false
})
</script>

<template>
  <section>
    <RouterLink to="/" class="muted"><ArrowLeft :size="16" /> {{ t('nav.back') }}</RouterLink>
    <LoadingScreen v-if="loading" />
    <template v-else>
      <h1>{{ name }}</h1>
      <p class="muted">{{ t('roster.count', { n: delegates.length }) }}</p>
      <RouterLink :to="{ name: 'session', params: { id: route.params.id } }" class="btn open">{{ t('roster.openSession') }}</RouterLink>
      <p v-if="error" class="err">{{ error }}</p>
      <table class="tbl">
        <thead><tr><th>{{ t('roster.country') }}</th><th>{{ t('roster.delegate') }}</th></tr></thead>
        <tbody>
          <tr v-for="d in delegates" :key="d.id"><td><CountryFlag :name="d.country" />{{ d.country }}</td><td>{{ d.display_name }}</td></tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.open { margin: 8px 0 18px; text-decoration: none }
</style>
