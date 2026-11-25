<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/stores/auth'
import { renderTurnstile, resetTurnstile, turnstileEnabled } from '@/lib/turnstile'

const { t } = useI18n()
const auth = useAuth()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const widgetEl = ref<HTMLElement | null>(null)
let widgetId = ''
let token = ''

onMounted(async () => {
  if (!turnstileEnabled || !widgetEl.value) return
  try {
    widgetId = await renderTurnstile(widgetEl.value, {
      onToken: (v) => (token = v),
      onReset: () => (token = ''),
    })
  } catch {
    error.value = t('login.captchaLoad')
  }
})
onBeforeUnmount(() => window.turnstile?.remove(widgetId))

async function submit() {
  if (turnstileEnabled && !token) {
    error.value = t('login.captchaWait')
    return
  }
  busy.value = true
  error.value = ''
  const { error: e } = await auth.signIn(email.value, password.value, token)
  if (e) {
    error.value = e === 'captcha' ? t('login.captchaFailed') : t('login.failed')
    token = ''
    if (widgetId) resetTurnstile(widgetId)
  }
  busy.value = false
}
</script>

<template>
  <section class="login">
    <div class="intro">
      <span class="pill">{{ t('login.badge') }}</span>
      <h1>{{ t('login.headline') }}</h1>
      <p class="muted">{{ t('login.lead') }}</p>
      <ul class="points">
        <li>{{ t('login.p1') }}</li>
        <li>{{ t('login.p2') }}</li>
        <li>{{ t('login.p3') }}</li>
      </ul>
    </div>

    <form class="panel" @submit.prevent="submit">
      <h2>{{ t('login.title') }}</h2>
      <button type="button" class="google" @click="auth.signInGoogle()">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        {{ t('login.google') }}
      </button>
      <div class="or"><span>{{ t('login.or') }}</span></div>
      <label>{{ t('login.email') }}<input v-model="email" type="email" autocomplete="username" required /></label>
      <label>{{ t('login.password') }}<input v-model="password" type="password" autocomplete="current-password" required /></label>
      <div ref="widgetEl" />
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <button class="btn" :disabled="busy">{{ t('login.submit') }}</button>
    </form>
  </section>
</template>

<style scoped>
.login { display: grid; grid-template-columns: 1.1fr 1fr; gap: 56px; align-items: center; padding: 6vh 0 10vh }
.pill { display: inline-block; padding: 6px 14px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-dark); font-weight: 700; font-size: 14px }
.intro h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); line-height: 1.05; margin: 18px 0 14px }
.intro .muted { font-size: 18px; max-width: 46ch }
.points { list-style: none; padding: 0; margin: 28px 0 0; display: grid; gap: 12px }
.points li { padding-left: 30px; position: relative; font-weight: 600 }
.points li::before { content: ''; position: absolute; left: 0; top: 4px; width: 18px; height: 18px; border-radius: 50%; background: var(--accent) }
.panel { background: var(--surface-glass); backdrop-filter: blur(14px); border: 1px solid var(--divider); border-radius: 22px; padding: 32px; box-shadow: var(--shadow-lg); max-width: none }
.google { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; border: 1px solid var(--divider); background: var(--white); border-radius: var(--radius); font: inherit; font-weight: 700; cursor: pointer; transition: box-shadow var(--dur-fast) ease }
.google:hover { box-shadow: var(--shadow-md) }
.or { display: flex; align-items: center; gap: 12px; color: var(--text-tertiary); font-size: 14px }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--divider) }
.panel h2 { margin: 0 0 4px; font-size: 1.5rem }
.panel .btn { width: 100% }
input:focus { outline: none; border-color: var(--accent); box-shadow: var(--ring) }
@media (max-width: 820px) { .login { grid-template-columns: 1fr; gap: 32px } }
</style>
