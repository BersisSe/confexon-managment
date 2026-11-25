<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'

interface Row { id: string; name: string; event_id: string; events: { title: string } | null }
const { t } = useI18n()
const rows = ref<Row[]>([])
const loading = ref(true)
const error = ref('')

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
    <h1>{{ t('committees.title') }}</h1>
    <p v-if="loading" class="muted">…</p>
    <p v-else-if="error" class="err">{{ error }}</p>
    <p v-else-if="!rows.length" class="muted">{{ t('committees.empty') }}</p>
    <ul class="list">
      <li v-for="c in rows" :key="c.id">
        <RouterLink :to="{ name: 'roster', params: { id: c.id } }" class="card row">
          <strong>{{ c.name }}</strong>
          <span class="muted">{{ c.events?.title }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
