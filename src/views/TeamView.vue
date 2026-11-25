<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, GraduationCap, Loader2, RefreshCw, Users } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import MemberRow, { type Staff } from '@/components/MemberRow.vue'

interface Ev { event_id: string; role: string; events: { title: string } | null }
interface Committee { id: string; name: string; event_id: string }

const { t } = useI18n()
const auth = useAuth()
const events = ref<Ev[]>([])
const committees = ref<Committee[]>([])
const staff = ref<Staff[]>([])
const delegateCount = ref<Record<string, number>>({})
const loading = ref(true)
const busy = ref('')
const toast = ref<{ ok: boolean; text: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function say(ok: boolean, text: string) {
  toast.value = { ok, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4500)
}
onBeforeUnmount(() => clearTimeout(toastTimer))

async function load() {
  const uid = auth.session!.user.id
  const e = await supabase.from('event_admins').select('event_id, role, events(title)').eq('user_id', uid)
  events.value = (e.data ?? []) as unknown as Ev[]
  committees.value = (await supabase.from('cmd_committees').select('id, name, event_id').order('sort_order')).data ?? []
  staff.value = ((await supabase.from('cmd_staff').select('*').order('created_at')).data ?? []) as Staff[]
  const d = (await supabase.from('cmd_delegates').select('committee_id')).data ?? []
  const counts: Record<string, number> = {}
  for (const r of d) counts[r.committee_id] = (counts[r.committee_id] ?? 0) + 1
  delegateCount.value = counts
  loading.value = false
}
onMounted(load)

const cOf = (eid: string) => committees.value.filter((c) => c.event_id === eid)
const sOf = (eid: string, kind: Staff['kind']) => staff.value.filter((s) => s.event_id === eid && s.kind === kind)
const unassigned = (eid: string) => sOf(eid, 'academy').filter((s) => !s.committee_id)
const inCommittee = (cid: string) => staff.value.filter((s) => s.kind === 'academy' && s.committee_id === cid)
const delegatesIn = (eid: string) => cOf(eid).reduce((n, c) => n + (delegateCount.value[c.id] ?? 0), 0)

async function sync(eventId: string) {
  busy.value = eventId
  const a = await supabase.rpc('cmd_sync_roster', { p_event: eventId })
  const b = await supabase.rpc('cmd_sync_staff', { p_event: eventId })
  const err = a.error ?? b.error
  say(!err, err ? err.message : t('team.synced'))
  await load()
  busy.value = ''
}

async function assign(s: Staff, committeeId: string) {
  s.committee_id = committeeId || null
  await supabase.from('cmd_staff').update({ committee_id: committeeId || null }).eq('id', s.id)
}
async function remove(s: Staff) {
  staff.value = staff.value.filter((x) => x.id !== s.id)
  await supabase.from('cmd_staff').delete().eq('id', s.id)
}

</script>

<template>
  <section class="team">
    <RouterLink to="/" class="back"><ArrowLeft :size="16" /> {{ t('nav.back') }}</RouterLink>
    <header class="pagehead">
      <div>
        <h1>{{ t('team.title') }}</h1>
        <p class="muted">{{ t('team.lead') }}</p>
      </div>
    </header>

    <Transition name="toast">
      <p v-if="toast" class="toast" :class="{ bad: !toast.ok }" role="status">
        <CheckCircle2 v-if="toast.ok" :size="18" /><AlertCircle v-else :size="18" />
        {{ toast.text }}
      </p>
    </Transition>

    <div v-if="loading" class="skel" aria-hidden="true"><i /><i /></div>
    <div v-else-if="!events.length" class="empty">
      <Users :size="32" />
      <p>{{ t('team.noEvents') }}</p>
    </div>

    <article v-for="ev in events" :key="ev.event_id" class="evcard">
      <header class="evhead">
        <div class="evtitle">
          <h2>{{ ev.events?.title }}</h2>
          <div class="facts">
            <span><Building2 :size="14" /> {{ t('team.nCommittees', { n: cOf(ev.event_id).length }) }}</span>
            <span><Users :size="14" /> {{ t('team.nDelegates', { n: delegatesIn(ev.event_id) }) }}</span>
            <span><GraduationCap :size="14" /> {{ t('team.nStaff', { n: staff.filter((s) => s.event_id === ev.event_id).length }) }}</span>
          </div>
        </div>
        <div class="evacts">
          <button class="btn small" :disabled="busy === ev.event_id" @click="sync(ev.event_id)">
            <Loader2 v-if="busy === ev.event_id" :size="16" class="spin" /><RefreshCw v-else :size="16" />
            {{ t('team.sync') }}
          </button>
        </div>
      </header>

      <div v-if="!cOf(ev.event_id).length" class="empty small">
        <Building2 :size="26" />
        <p>{{ t('team.noCommittees') }}</p>
      </div>

      <template v-else>
        <section v-if="unassigned(ev.event_id).length" class="block warn">
          <h3>{{ t('team.unassigned') }} <span class="count">{{ unassigned(ev.event_id).length }}</span></h3>
          <p class="muted small">{{ t('team.unassignedHelp') }}</p>
          <ul class="rows">
            <MemberRow
              v-for="s in unassigned(ev.event_id)" :key="s.id" :member="s" :committees="cOf(ev.event_id)" assignable
              @assign="(c) => assign(s, c)" @remove="remove(s)"
            />
          </ul>
        </section>

        <h3 class="sec">{{ t('team.academy') }}</h3>
        <div class="boards">
          <section v-for="c in cOf(ev.event_id)" :key="c.id" class="board">
            <header>
              <strong>{{ c.name }}</strong>
              <span class="muted small">{{ t('team.nDelegates', { n: delegateCount[c.id] ?? 0 }) }}</span>
            </header>
            <ul v-if="inCommittee(c.id).length" class="rows">
              <MemberRow
                v-for="s in inCommittee(c.id)" :key="s.id" :member="s" :committees="cOf(ev.event_id)" assignable stacked
                @assign="(cid) => assign(s, cid)" @remove="remove(s)"
              />
            </ul>
            <p v-else class="none muted small">{{ t('team.noChair') }}</p>
          </section>
        </div>
      </template>

      <h3 class="sec">{{ t('team.organization') }}</h3>
      <p v-if="!sOf(ev.event_id, 'organization').length" class="muted small">{{ t('team.none') }}</p>
      <ul v-else class="rows two">
        <MemberRow v-for="s in sOf(ev.event_id, 'organization')" :key="s.id" :member="s" @remove="remove(s)" />
      </ul>
    </article>

  </section>
</template>

<style scoped>
.back { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); text-decoration: none; margin-top: 4px }
.pagehead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap }
.pagehead p { margin: 0 }
.toast { position: sticky; top: 84px; z-index: 12; display: flex; align-items: center; gap: 8px; width: fit-content; margin: 10px 0; padding: 10px 16px; border-radius: 12px; background: var(--success-soft); color: var(--success-text); border: 1px solid var(--success-line); font-weight: 600; box-shadow: var(--shadow-md) }
.toast.bad { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-line) }
.toast-enter-active, .toast-leave-active { transition: opacity .2s ease, transform .2s var(--ease-out) }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px) }
.skel { display: grid; gap: 14px; margin-top: 20px }
.skel i { height: 140px; border-radius: var(--radius); background: linear-gradient(90deg, var(--cream-deep), var(--cream), var(--cream-deep)); background-size: 200% 100%; animation: sh 1.4s infinite }
@keyframes sh { to { background-position: -200% 0 } }
.empty { display: grid; place-items: center; gap: 8px; padding: 48px 16px; color: var(--text-tertiary); text-align: center }
.empty.small { padding: 24px 16px; background: var(--cream); border-radius: 12px; margin-top: 14px }
.empty p { margin: 0 }
.evcard { margin-top: 22px; background: var(--white); border: 1px solid var(--divider); border-radius: 20px; padding: 22px; box-shadow: var(--shadow-sm) }
.evhead { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start }
.evtitle h2 { margin: 0 0 6px; font-size: 1.4rem }
.facts { display: flex; gap: 14px; flex-wrap: wrap; color: var(--text-muted); font-size: 13px; font-weight: 600 }
.facts span { display: inline-flex; align-items: center; gap: 5px }
.evacts { display: flex; gap: 8px; flex-wrap: wrap }
.evacts .btn { gap: 6px }
.spin { animation: spin 1s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }
.sec { margin: 26px 0 10px; font-size: .8rem; text-transform: uppercase; letter-spacing: .07em; color: var(--text-tertiary) }
.block { margin-top: 18px; padding: 16px; border-radius: 14px }
.block.warn { background: var(--warn-soft); border: 1px solid var(--warn-line) }
.block h3 { margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 8px }
.block .small { margin: 2px 0 10px }
.count { background: #d99a2b; color: #fff; border-radius: 999px; padding: 1px 9px; font-size: 12px }
.rows { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px }
.rows.two { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) }
.boards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px }
.board { min-width: 0; background: var(--cream); border-radius: 14px; padding: 14px; display: grid; gap: 10px; align-content: start }
.board header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px }
.none { margin: 0; padding: 8px 2px }
.small { font-size: 13px }
@media (max-width: 560px) { .evcard { padding: 16px } }
</style>
