import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { turnstileEnabled } from '@/lib/turnstile'

export const useAuth = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const ready = ref(false)

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    ready.value = true
    supabase.auth.onAuthStateChange((_e, s) => {
      session.value = s
    })
  }

  // With Turnstile on, credentials go through the cmd-login edge function,
  // which verifies the token server-side before signing in.
  async function signIn(email: string, password: string, turnstileToken = ''): Promise<{ error: string | null }> {
    if (!turnstileEnabled) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? 'credentials' : null }
    }
    const { data, error } = await supabase.functions.invoke('cmd-login', {
      body: { email, password, turnstileToken },
    })
    if (error || !data?.access_token) {
      const code = await (error as { context?: Response } | null)?.context?.json?.().then((j) => j.error).catch(() => '')
      return { error: code || 'credentials' }
    }
    const { error: e } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    return { error: e ? 'credentials' : null }
  }

  const signInGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })

  const signOut = () => supabase.auth.signOut()

  return { session, ready, init, signIn, signInGoogle, signOut }
})
