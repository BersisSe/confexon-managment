// Cloudflare Turnstile helper (same site key / approach as ConfexonSite).
// The site key is public. Verification happens server-side in the `cmd-login` edge function.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
export const turnstileEnabled = !!TURNSTILE_SITE_KEY

let script: Promise<void> | null = null
function load(): Promise<void> {
  if (script) return script
  script = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      script = null
      reject(new Error('turnstile_load_failed'))
    }
    document.head.appendChild(s)
  })
  return script
}

export async function renderTurnstile(
  el: HTMLElement,
  cb: { onToken: (t: string) => void; onReset: () => void },
): Promise<string> {
  await load()
  if (!window.turnstile) throw new Error('turnstile_missing')
  return window.turnstile.render(el, {
    sitekey: TURNSTILE_SITE_KEY,
    action: 'cmd_login',
    callback: cb.onToken,
    'expired-callback': cb.onReset,
    'error-callback': cb.onReset,
  })
}

export const resetTurnstile = (id: string) => window.turnstile?.reset(id)
