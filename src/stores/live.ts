import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

export interface LiveSession { id: string; committee_id: string; name: string }

// Open sessions the signed-in user can manage (realtime) and whether they are
// an event admin. Drives the "live" pill and the admin-only nav links.
export const useLive = defineStore('live', () => {
  const auth = useAuth()
  const sessions = ref<LiveSession[]>([])
  const isAdmin = ref(false)
  let channel: ReturnType<typeof supabase.channel> | null = null

  async function refresh() {
    if (!auth.session) { sessions.value = []; return }
    const { data } = await supabase
      .from('cmd_sessions')
      .select('id, committee_id, cmd_committees(name)')
      .eq('status', 'open')
      .order('started_at', { ascending: false })
    sessions.value = (data ?? []).map((r) => ({
      id: r.id,
      committee_id: r.committee_id,
      name: (r.cmd_committees as unknown as { name: string } | null)?.name ?? '',
    }))
  }

  async function loadAdmin(uid: string) {
    const { count } = await supabase.from('event_admins').select('event_id', { count: 'exact', head: true }).eq('user_id', uid)
    isAdmin.value = (count ?? 0) > 0
  }

  function stop() {
    if (channel) supabase.removeChannel(channel)
    channel = null
  }

  watch(() => auth.session?.user.id, (uid) => {
    stop()
    if (!uid) { sessions.value = []; isAdmin.value = false; return }
    refresh()
    loadAdmin(uid)
    channel = supabase.channel('cmd-live-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmd_sessions' }, refresh)
      .subscribe()
  }, { immediate: true })

  return { sessions, isAdmin, refresh }
})
