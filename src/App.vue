<script setup lang="ts">
import { LogOut } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import ThemeToggle from '@/components/ThemeToggle.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import { setLocale, SUPPORTED } from './i18n'
import { useAuth } from './stores/auth'
import { useLive } from './stores/live'

const { t, locale } = useI18n()
const auth = useAuth()
const live = useLive()
const router = useRouter()
const route = useRoute()
// The chair console is projected on a board: no global navbar, full width.
const board = computed(() => route.name === 'session')

async function logout() {
  await auth.signOut()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="wrap" :class="{ board }">
    <header v-if="!board" class="bar">
      <RouterLink to="/" class="logo" :aria-label="t('app.name')">
        <img src="/logo.png" alt="" width="34" height="34" />
        <strong class="brand">{{ t('app.short') }}</strong>
      </RouterLink>

      <nav v-if="auth.session" class="links" :aria-label="t('nav.main')">
        <RouterLink to="/" :class="{ active: $route.name !== 'team' && $route.name !== 'management' }">{{ t('nav.committees') }}</RouterLink>
        <RouterLink v-if="live.isAdmin" to="/management" active-class="active">{{ t('nav.management') }}</RouterLink>
        <RouterLink v-if="live.isAdmin" to="/team" active-class="active">{{ t('nav.team') }}</RouterLink>
      </nav>

      <span class="grow" />

      <RouterLink
        v-for="l in live.sessions.slice(0, 2)"
        :key="l.id"
        :to="{ name: 'session', params: { id: l.committee_id } }"
        class="livepill"
        :title="t('nav.live')"
      >
        <i aria-hidden="true" />
        <span class="ln">{{ l.name }}</span>
      </RouterLink>
      <RouterLink v-if="live.sessions.length > 2" to="/" class="livepill more">+{{ live.sessions.length - 2 }}</RouterLink>

      <ThemeToggle />

      <div class="seglang" role="group" :aria-label="t('lang.label')">
        <button v-for="l in SUPPORTED" :key="l" :aria-pressed="locale === l" @click="setLocale(l)">{{ l.toUpperCase() }}</button>
      </div>

      <div v-if="auth.session" class="user">
        <span class="avatar" aria-hidden="true">{{ (auth.session.user.email ?? '?').charAt(0).toUpperCase() }}</span>
        <button class="out" :title="t('nav.logout')" :aria-label="t('nav.logout')" @click="logout">
          <LogOut :size="18" />
        </button>
      </div>
    </header>
    <RouterView />
    <ConfirmDialog />
  </div>
</template>

<style>
body { background-image: radial-gradient(var(--dot) 1px, transparent 1px), var(--grad-glow); background-size: 22px 22px, 900px 600px; background-repeat: repeat, no-repeat; background-position: 0 0, 70% -120px }
.bar { position: sticky; top: 12px; z-index: 10; display: flex; align-items: center; gap: 14px; margin: 12px 0 8px; padding: 8px 10px 8px 14px; background: var(--surface-glass); backdrop-filter: blur(14px) saturate(1.2); border: 1px solid var(--divider); border-radius: 18px; box-shadow: var(--shadow-sm) }
.links { display: flex; gap: 4px; margin-left: 6px }
.links a { padding: 8px 14px; border-radius: 12px; text-decoration: none; font-weight: 600; color: var(--text-muted); transition: background var(--dur-fast) ease, color var(--dur-fast) ease }
.links a:hover { background: var(--cream-deep); color: var(--text) }
.links a.active { background: var(--accent-soft); color: var(--accent-dark) }
.seglang { display: flex; padding: 3px; gap: 2px; background: var(--cream-deep); border-radius: 12px }
.seglang button { border: 0; background: none; padding: 5px 11px; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 700; color: var(--text-muted); cursor: pointer }
.seglang button[aria-pressed='true'] { background: var(--white); color: var(--text); box-shadow: var(--shadow-sm) }
.livepill { display: inline-flex; align-items: center; gap: 8px; max-width: 220px; padding: 6px 12px; border-radius: 999px; background: var(--success-soft); color: var(--success-text); font-size: 13px; font-weight: 700; text-decoration: none; border: 1px solid var(--success-line) }
.livepill:hover { background: var(--success-line) }
.livepill i { width: 8px; height: 8px; border-radius: 50%; background: #3e7c4f; box-shadow: 0 0 0 0 rgb(62 124 79 / .6); animation: pulse 1.8s infinite }
.livepill .ln { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
@keyframes pulse { 70% { box-shadow: 0 0 0 7px rgb(62 124 79 / 0) } 100% { box-shadow: 0 0 0 0 rgb(62 124 79 / 0) } }
@media (max-width: 640px) { .livepill .ln { display: none } }
.user { display: flex; align-items: center; gap: 6px; padding-left: 10px; border-left: 1px solid var(--divider) }
.avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700 }
.out { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: none; color: var(--text-muted); cursor: pointer }
.out:hover { background: var(--danger-soft); color: var(--danger) }
@media (max-width: 640px) { .brand { display: none } .bar { gap: 8px } .links a { padding: 8px 10px } }
a.card.row { transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) ease }
a.card.row:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--accent) }
.tbl tbody tr:hover { background: var(--cream) }
.tbl th { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-tertiary); background: var(--cream-deep) }
.tbl { box-shadow: var(--shadow-sm); border: 1px solid var(--divider) }
.logo { flex: none; display: flex; align-items: center; gap: 10px; text-decoration: none }
.brand { font-family: var(--font-display) }
.grow { flex: 1 }
.lang { border: 1px solid var(--divider); background: var(--white); border-radius: 10px; padding: 6px 10px; font-weight: 700; cursor: pointer }
.navlink { text-decoration: none; color: inherit }
.lang[aria-pressed='true'] { background: var(--accent); color: #fff; border-color: var(--accent) }
h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin: 24px 0 8px }
.muted { color: var(--text-muted) }
.err { color: var(--danger) }
.card { display: block; background: var(--white); border: 1px solid var(--divider); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow-sm) }
.card.row { display: flex; justify-content: space-between; text-decoration: none }
.list { list-style: none; padding: 0; display: grid; gap: 12px }
form { display: grid; gap: 14px; max-width: 380px }
label { display: grid; gap: 6px; font-weight: 600 }
input { min-height: 44px; border: 1px solid var(--divider); border-radius: 10px; padding: 0 12px; font: inherit }
.btn:disabled { opacity: .6; cursor: default }
.tbl { width: 100%; border-collapse: collapse; background: var(--white); border-radius: var(--radius); overflow: hidden }
.tbl th, .tbl td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--divider) }
.wrap.board { width: calc(100% - 32px); max-width: none }
</style>
