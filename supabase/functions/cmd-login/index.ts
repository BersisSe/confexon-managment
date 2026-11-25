// Confexon Commander login: verifies a Cloudflare Turnstile token, then signs in
// with Supabase Auth. Secrets (set as edge function secrets, never in the client):
//   TURNSTILE_SECRET_KEY, TURNSTILE_HOSTNAMES (comma separated, e.g. command.confexonapp.com)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) return json({ error: 'not_configured' }, 503)

  const { email, password, turnstileToken } = await req.json().catch(() => ({}))
  if (typeof email !== 'string' || typeof password !== 'string' || typeof turnstileToken !== 'string')
    return json({ error: 'bad_request' }, 400)

  const form = new URLSearchParams({ secret, response: turnstileToken })
  const ip = req.headers.get('cf-connecting-ip')
  if (ip) form.set('remoteip', ip)
  const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    .then((r) => r.json()).catch(() => null)

  const hosts = (Deno.env.get('TURNSTILE_HOSTNAMES') ?? '').split(',').map((h) => h.trim()).filter(Boolean)
  if (!v?.success || v.action !== 'cmd_login' || (hosts.length && !hosts.includes(v.hostname)))
    return json({ error: 'captcha' }, 403)

  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return json({ error: 'credentials' }, 401)
  return json(await res.json())
})
